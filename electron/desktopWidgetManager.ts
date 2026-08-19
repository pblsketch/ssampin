/**
 * 바탕화면 아이콘 아래 모드(native-desktop) high-level manager.
 *
 * 진척도:
 *   - PR-1: 인터페이스 + no-op + IPC fallback 라우팅
 *   - Phase 4-1: koffi load 검증 (FFI 골격)
 *   - Phase 4-2 (현 단계): WorkerW attach/detach + healthCheck
 *   - Phase 5: DPI 변환 + bounds 동기화
 *   - Phase 6: LVM_HITTEST 아이콘 영역 판정
 *   - Phase 7: WH_MOUSE_LL hook + 라우팅
 *
 * Manager는 main process에서 단일 인스턴스로 생성·재사용한다.
 * 라이프사이클 hook 호출 지점:
 *   - applyWidgetSettings: 'native-desktop' 진입 시 enable()
 *   - 모드 전환 (topmost/normal): disable()
 *   - 위젯 close/before-quit: disable() (정리 보장)
 */

import { screen } from 'electron';
import type { BrowserWindow } from 'electron';
import {
  clampWidgetBoundsToWorkArea,
  findBestWorkAreaForBounds,
  DEFAULT_WIDGET_SCREEN_CLAMP_OPTIONS,
} from './desktopWidgetBounds';
import type {
  DesktopWidgetModeStatus,
  DipRect,
  DragState,
  PhysicalRect,
  PhysicalWorkArea,
  ResizeRegion,
  ResizeState,
} from './desktopWidgetTypes';
import { dipToPhysical, isInsideAnyRect, WIDGET_ABSOLUTE_MIN_SIZE } from './desktopWidgetTypes';
import { applyWidgetWindowBounds, readWidgetWindowBounds } from './widgetGeometryIntent';
import { diagLog, diagWarn } from './nativeDesktopDiag';
import { resolveDragEndBounds } from './desktopWidgetDpiRestore';
import {
  clearPreferredSize,
  rememberSizeBeforeFit,
  takePreferredSizeIfFits,
} from './widgetPreferredSize';
import {
  clearActiveWidgetLayout,
  resolveLayoutReapply,
  setActiveWidgetLayout,
} from './widgetLayout';

/** 각 모니터의 작업 영역(DIP)과 배율 — computePhysicalWorkAreas 입력용 최소 형태. */
export interface WorkAreaSource {
  readonly workArea: DipRect;
  readonly scaleFactor: number;
}

/**
 * 모든 모니터의 작업 영역(workArea)을 DIP → physical pixel로 변환한다.
 *
 * ★ 반드시 `screen.dipToScreenRect`를 써야 한다 (2026-05-06 멀티 모니터 결정적 fix와 동일 이유).
 *   `workArea.x * scaleFactor` 단순 곱셈은 per-monitor DPI 환경에서 틀린다:
 *   보조 모니터의 physical origin은 앞선 모니터들의 physical 폭 누적값이지, 자기 DIP 좌표에
 *   자기 배율을 곱한 값이 아니다.
 *   예) primary 1920×1080 @100% + 우측 보조 2560×1440 @150%(DIP 1707×960 @ x=1920)
 *       → 보조의 physical x는 1920. 단순 곱셈은 1920×1.5=2880을 내놓아 960px 어긋나고,
 *         그 결과 drag clamp가 실제 바탕화면 우측 끝(4480) 너머까지 위젯을 허용해
 *         "화면 밖 이탈 방지"라는 목적 자체가 무너진다.
 *
 * @param displays screen.getAllDisplays() 결과 (workArea는 DIP)
 * @param convert  DIP rect → physical rect 변환기. 실제 호출부는 `screen.dipToScreenRect(null, r)`.
 *                 window에 null을 넘기면 Electron이 "그 rect에 가장 가까운 디스플레이" 기준으로
 *                 변환하므로, 각 모니터의 workArea를 각자 올바른 배율로 환산할 수 있다.
 *                 변환 실패 시 해당 모니터만 단순 곱셈으로 폴백한다(단일 모니터에서는 정확).
 */
export function computePhysicalWorkAreas(
  displays: readonly WorkAreaSource[],
  convert: (rect: DipRect) => DipRect,
): PhysicalWorkArea[] {
  return displays.map((d) => {
    const scaleFactor = d.scaleFactor || 1;

    // 최소 가시량 기준값은 DIP로 정의돼 있다(헤더 40 · 가로 100). 드래그 핫패스는 physical
    // pixel로 계산하므로 이 모니터의 배율로 환산해서 넣는다.
    // ★physical 40을 그대로 쓰면 배율이 높을수록 보장 폭이 줄어든다(150%에서 약 27 DIP =
    //   헤더의 2/3). 헤더 높이 자체가 CSS(DIP)로 정의되므로 기준도 DIP여야 모드 전환 경로
    //   (main.ts, DIP 기준)와 동일하게 동작한다.
    const minima = {
      scaleFactor,
      minVisibleHeaderHeight: Math.round(
        DEFAULT_WIDGET_SCREEN_CLAMP_OPTIONS.minVisibleHeaderHeight * scaleFactor,
      ),
      minVisibleWidth: Math.round(
        DEFAULT_WIDGET_SCREEN_CLAMP_OPTIONS.minVisibleWidth * scaleFactor,
      ),
    };

    try {
      const physical = convert(d.workArea);
      return {
        x: Math.round(physical.x),
        y: Math.round(physical.y),
        width: Math.round(physical.width),
        height: Math.round(physical.height),
        ...minima,
      };
    } catch {
      return { ...dipToPhysical(d.workArea, scaleFactor), ...minima };
    }
  });
}

export interface DesktopWidgetManager {
  /**
   * native-desktop 모드 활성화 시도.
   *
   * 성공 시 mode='native-desktop' 상태로 전환되며, 위젯은 WorkerW 자식으로 attach된다.
   * 실패 시 ok:false + fallbackMode를 반환하고 호출자(main.ts)는 settings.desktopMode를
   * fallbackMode로 정정 + `desktopMode:fallback` IPC를 발사해야 한다.
   */
  enable(window: BrowserWindow): Promise<DesktopWidgetModeStatus>;

  /**
   * native-desktop 모드 해제. 부모/스타일 복구, mouse hook 해제, 메모리 정리.
   * 이미 비활성 상태에서도 안전하게 호출 가능 (idempotent).
   */
  disable(): void;

  /**
   * 위젯 위치/크기 변경 시 native bounds 동기화.
   * Phase 5에서 실제 구현. Phase 4-2 단계에서는 no-op.
   */
  updateWidgetBounds(window: BrowserWindow): void;

  /**
   * 주기적 또는 이벤트성 health check (Win+D, Explorer 재시작, 잠금 복귀 후).
   * 실패 시 ok:false → 호출자가 fallback 처리.
   */
  healthCheck(window: BrowserWindow): Promise<DesktopWidgetModeStatus>;

  /** 현재 native-desktop 모드가 active인지 */
  isEnabled(): boolean;

  /**
   * native-desktop WS_CHILD 상태를 유지한 채 키보드 포커스를 위젯 HWND에 준다.
   * 모달 텍스트 입력 시 topmost로 떼어내는 전환을 피하기 위한 경량 경로.
   */
  focusForKeyboard(window: BrowserWindow): { ok: boolean; reason: string };

  /**
   * Phase 5+ — 가장 최근 updateWidgetBounds로 캐시된 physical pixel rect.
   *
   * Phase 6/7에서 mouse hook callback이 위젯 영역 hit 판정에 사용한다.
   * 아직 호출된 적 없으면 null.
   */
  getCachedPhysicalBounds(): PhysicalRect | null;

  /**
   * Phase 6+ — 위젯 위 좌표가 바탕화면 아이콘 위인지 판정.
   *
   * 라우팅 규칙(Phase 7 mouse hook callback에서 사용):
   *   - 위젯 bounds 밖 → false (Electron이 처리하지 않음, hook은 통과)
   *   - 위젯 bounds 안 + 아이콘 위 → true (Explorer가 처리하도록 통과)
   *   - 위젯 bounds 안 + 빈 공간 → false (Electron이 처리)
   *
   * 결과는 16ms TTL 캐시로 hot path 성능 보장.
   * 캐시 만료 또는 좌표가 다르면 lvmHitTest 재호출.
   *
   * 실패 시(ACCESS_DENIED 등) false 반환 + 1회 토큰을 떨궈 manager가 후속 disable 결정.
   */
  shouldPassThroughToDesktop(physicalPoint: { x: number; y: number }): boolean;

  /**
   * Phase 7-C — renderer가 widget 헤더(`-webkit-app-region: drag`) 영역의 client DIP rect를
   * 등록한다. WH_MOUSE_LL hook callback이 LBUTTONDOWN을 받을 때 본 영역 안이면 drag mode
   * 진입.
   *
   * Phase 7-C 회귀 fix: excludeDipRects는 drag 영역 내부에서 제외할 사각형(헤더 우측 버튼 그룹).
   * dipRects 안 + excludeDipRects 안이면 drag 시작 안 함 → 버튼 LBUTTONDOWN이 정상 라우팅.
   *
   * 호출 시점:
   *   - mount/resize/layout 변경 시마다 renderer가 갱신 호출.
   *   - 위젯 자체가 move/resize되면 manager가 cachedHeaderRegions를 자동 재계산하므로
   *     renderer는 dipRects 자체가 바뀌지 않으면 재호출 불필요.
   *
   * 빈 배열을 넘기면 drag 비활성화 (hook이 헤더 영역을 인식 못 함).
   *
   * @param dipRects widget client area 기준 DIP rect들 (보통 1개의 헤더 사각형)
   * @param window widget BrowserWindow — display.scaleFactor 추출용
   * @param excludeDipRects drag 영역에서 제외할 사각형(버튼 그룹). 옵셔널(없으면 빈 배열).
   */
  setHeaderRegions(
    dipRects: readonly DipRect[],
    window: BrowserWindow,
    excludeDipRects?: readonly DipRect[],
  ): void;

  /**
   * 진단 라운드 (2026-05-06) — 이슈 B/D 분석용 외부 호출자.
   *
   * **이슈 B**: widget의 native Win32 상태(GWL_STYLE/EXSTYLE, parent, ancestor, IsWindowVisible,
   *   GetWindowRect)를 한 줄 dump로 반환. transitionWidgetMode 단계별 호출로 BrowserWindow
   *   API 결과와 OS 결과 disconnect 가시화.
   *
   * **이슈 D**: WorkerW 후보별 cover 영역 + 디스플레이 레이아웃 dump 반환.
   *
   * Win32 미가용 환경(no-op manager)에서는 빈 문자열 또는 'unavailable' 반환.
   */
  diagnosticSnapshot(window: BrowserWindow): {
    widgetWin32: string;
    workerWLayout: string;
  };

  /**
   * 진단 라운드 — 라우팅 통계 dump (사용자 요청 시 즉시 가져올 수 있도록).
   * native-desktop 모드 hook이 callback을 한 번도 못 받으면 sent=0이고 totalCallbacks=0.
   */
  getRoutingStats(): {
    sent: number;
    skippedIcon: number;
    skippedOutOfBounds: number;
    skippedAbove: number;
    failed: number;
    totalCallbacks: number;
  };

  /**
   * Phase 7-D — renderer가 widget 가장자리 resize handle의 client DIP rect들을 등록한다.
   *
   * native-desktop 모드(WS_CHILD)에선 nc resize가 부모(WorkerW)로 흘러 작동 안 함. hook이
   * LBUTTONDOWN을 등록된 resize region에서 감지하면 resize mode 진입 → MOUSEMOVE마다
   * SetWindowPos로 widget 크기 조절.
   *
   * 호출 시점:
   *   - widget mount/resize 시 renderer가 갱신 호출
   *   - widget 자체가 move/resize되면 manager가 cachedResizeRegions를 자동 재계산하므로
   *     renderer는 dipRects 자체가 바뀌지 않으면 재호출 불필요
   *
   * 빈 배열을 넘기면 resize 비활성화.
   *
   * @param regions widget client area 기준 8개 edge DIP rect (top/bottom/left/right + 4 corner)
   * @param window widget BrowserWindow — display.scaleFactor 추출용
   */
  setResizeRegions(regions: readonly ResizeRegion[], window: BrowserWindow): void;

  /**
   * Phase 7-G — widget bounds 안 ↔ 밖 hover 트랜지션 콜백 등록.
   *
   * 용도: native-desktop 모드(WS_CHILD)에선 위젯이 keyboard focus를 받지 못해 renderer
   * keydown listener가 작동 안 함. 사용자가 위젯 위에 마우스 hover 시에만 main process가
   * globalShortcut.register로 Ctrl+1/2/3/4 등을 가로채 위젯에 IPC로 전달하는 패턴.
   *
   * 호출 빈도: hover state가 실제 변경될 때만 (enter/leave 시점). hot path 부담 없음.
   * cb는 throw 금지 — manager가 try/catch로 흡수하지만 호출자가 안전한 cb를 제공해야 함.
   *
   * null을 넘기면 콜백 해제. enable/disable 라이프사이클에 무관하게 등록 가능 (단,
   * mouse hook이 active일 때만 실제 호출됨).
   */
  setHoverCallback(cb: ((inside: boolean) => void) | null): void;
}

interface RoutingStats {
  sent: number;
  skippedIcon: number;
  skippedOutOfBounds: number;
  skippedAbove: number;
  failed: number;
  totalCallbacks: number;
}

function createEmptyRoutingStats(): RoutingStats {
  return {
    sent: 0,
    skippedIcon: 0,
    skippedOutOfBounds: 0,
    skippedAbove: 0,
    failed: 0,
    totalCallbacks: 0,
  };
}

/**
 * STRATEGY 1/2/3 순서대로 widget을 WorkerW에 attach 시도. 첫 성공 시 즉시 반환.
 *
 * - STRATEGY 1: 표준 WorkerW (SHELLDLL_DefView 자식 보유)
 * - STRATEGY 2: SHELLDLL_DefView sibling WorkerW (Wallpaper Engine 패턴)
 * - STRATEGY 3: SHELLDLL_DefView 자체 (Progman 직속)
 *
 * 모든 실패는 lastError로 누적, 마지막 에러만 호출자에게 노출. 모두 실패하면 handles=null.
 *
 * `verbose=true`면 enable() 사용자 트리거 경로처럼 후보별 진단 로그를 남긴다.
 * healthCheck() 주기 호출처럼 노이즈를 줄여야 하면 `verbose=false`로 호출.
 */
async function tryAttachWithStrategies(
  win32: typeof import('./platform/win32Desktop'),
  widgetHwnd: bigint,
  candidates: import('./platform/win32Desktop').DesktopAttachCandidates,
  options: { verbose: boolean },
): Promise<{
  handles: import('./platform/win32Desktop').Win32DesktopHandles | null;
  lastError: Error | null;
}> {
  const log: typeof diagLog = options.verbose ? diagLog : () => {};
  const warn: typeof diagWarn = options.verbose ? diagWarn : () => {};
  let lastError: Error | null = null;

  for (const candidate of candidates.standardWorkerWs) {
    log('native-desktop', `STRATEGY1: 표준 WorkerW=0x${candidate.toString(16)} attach 시도`);
    try {
      const handles = await win32.attachToWorkerW(widgetHwnd, candidate);
      log(
        'native-desktop',
        `STRATEGY1: SUCCESS — prevParent=0x${handles.prevParent.toString(16)}, prevExStyle=0x${handles.prevExStyle.toString(16)}`,
      );
      return { handles, lastError };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      warn(
        'native-desktop',
        `STRATEGY1: 0x${candidate.toString(16)} 거부 (${lastError.name}: ${lastError.message})`,
      );
    }
  }

  if (candidates.shellDefViewSiblingWorkerW !== 0n) {
    const sibling = candidates.shellDefViewSiblingWorkerW;
    log('native-desktop', `STRATEGY2: sibling WorkerW=0x${sibling.toString(16)} attach 시도`);
    try {
      const handles = await win32.attachToWorkerW(widgetHwnd, sibling);
      log(
        'native-desktop',
        `STRATEGY2: SUCCESS — prevParent=0x${handles.prevParent.toString(16)}, prevExStyle=0x${handles.prevExStyle.toString(16)}`,
      );
      return { handles, lastError };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      warn(
        'native-desktop',
        `STRATEGY2: 0x${sibling.toString(16)} 거부 (${lastError.name}: ${lastError.message})`,
      );
    }
  }

  if (candidates.shellDefView !== 0n) {
    const shellDef = candidates.shellDefView;
    log(
      'native-desktop',
      `STRATEGY3: SHELLDLL_DefView=0x${shellDef.toString(16)} 자체 attach 시도`,
    );
    try {
      const handles = await win32.attachToShellDefView(widgetHwnd, shellDef);
      log(
        'native-desktop',
        `STRATEGY3: SUCCESS — prevParent=0x${handles.prevParent.toString(16)}, prevExStyle=0x${handles.prevExStyle.toString(16)}`,
      );
      return { handles, lastError };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      warn(
        'native-desktop',
        `STRATEGY3: 0x${shellDef.toString(16)} 거부 (${lastError.name}: ${lastError.message})`,
      );
    }
  }

  return { handles: null, lastError };
}

/**
 * Manager 팩토리.
 *
 * Win32 + native module 사용 가능하면 win32 전용 manager 반환.
 * 그 외 모든 경우 no-op manager 반환.
 *
 * 절대 throw하지 않는다 — 비Win32, koffi 미설치, native module load 실패 모두 흡수.
 */
export function createDesktopWidgetManager(): DesktopWidgetManager {
  diagLog('native-desktop', `createDesktopWidgetManager() called — platform=${process.platform}`);
  if (process.platform !== 'win32') {
    diagLog('native-desktop', 'non-win32 → no-op manager (reason=platform-not-win32)');
    return createNoopManager('platform-not-win32');
  }

  // win32: koffi-based win32Desktop을 lazy require하고 동작 검증.
  // 검증 실패 시 koffi-load-failed 등 reason으로 no-op fallback.
  let win32Desktop: typeof import('./platform/win32Desktop');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    win32Desktop = require('./platform/win32Desktop') as typeof import('./platform/win32Desktop');
    diagLog('native-desktop', 'win32Desktop module loaded');
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'unknown-error';
    diagWarn('native-desktop', `win32Desktop require 실패: ${reason}`);
    return createNoopManager('native-load-failed');
  }

  // koffi/kernel32/user32 load 가능 여부 확인 (실패하면 KoffiLoadError throw).
  try {
    const pidFromFFI = win32Desktop.getCurrentProcessId();
    diagLog('native-desktop', `FFI smoke test pidFromFFI=${pidFromFFI} (node.pid=${process.pid})`);
    if (pidFromFFI !== process.pid) {
      diagWarn(
        'native-desktop',
        `FFI PID 불일치 (ffi=${pidFromFFI}, node=${process.pid}) — no-op fallback`,
      );
      return createNoopManager('koffi-pid-mismatch');
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'unknown-error';
    const code =
      e instanceof Error && e.name === 'KoffiLoadError'
        ? 'koffi-load-failed'
        : 'native-load-failed';
    diagWarn('native-desktop', `win32 native load 실패 (${code}): ${reason}`);
    return createNoopManager(code);
  }

  diagLog('native-desktop', 'win32 manager 생성 완료 (FFI 검증 통과)');
  return createWin32Manager(win32Desktop);
}

/**
 * No-op manager. 모든 enable() 호출이 ok:false를 반환한다.
 *
 * 호출자는 fallbackMode를 적용하고 사용자에게 토스트로 안내해야 한다.
 * disable/updateWidgetBounds/healthCheck는 모두 안전하게 no-op.
 */
function createNoopManager(reason: string): DesktopWidgetManager {
  let active = false; // 항상 false. 일관성 위해 변수만 둔다.

  return {
    async enable(_window: BrowserWindow): Promise<DesktopWidgetModeStatus> {
      // active를 true로 만들지 않는다 — no-op은 실제 attach가 없으므로.
      return { ok: false, reason, fallbackMode: 'normal' };
    },
    disable(): void {
      active = false;
    },
    updateWidgetBounds(_window: BrowserWindow): void {
      // no-op
    },
    async healthCheck(_window: BrowserWindow): Promise<DesktopWidgetModeStatus> {
      return { ok: false, reason, fallbackMode: 'normal' };
    },
    isEnabled(): boolean {
      return active;
    },
    focusForKeyboard(_window: BrowserWindow): { ok: boolean; reason: string } {
      return { ok: false, reason };
    },
    getCachedPhysicalBounds(): PhysicalRect | null {
      return null;
    },
    shouldPassThroughToDesktop(_p: { x: number; y: number }): boolean {
      return false;
    },
    setHeaderRegions(
      _dipRects: readonly DipRect[],
      _window: BrowserWindow,
      _excludeDipRects?: readonly DipRect[],
    ): void {
      // no-op manager는 hook이 없으므로 헤더 영역 정보가 의미 없음.
    },
    diagnosticSnapshot(_window: BrowserWindow): { widgetWin32: string; workerWLayout: string } {
      return {
        widgetWin32: `noop-manager(reason=${reason})`,
        workerWLayout: `noop-manager(reason=${reason})`,
      };
    },
    getRoutingStats() {
      return createEmptyRoutingStats();
    },
    setHoverCallback(_cb: ((inside: boolean) => void) | null): void {
      // no-op manager는 mouse hook이 없으므로 hover 트랜지션을 감지 못함.
      // 일반/topmost 모드에선 어차피 widget이 focus를 받아 keydown이 정상 작동하므로
      // hover-based shortcut 인프라 자체가 불필요.
    },
    setResizeRegions(_regions: readonly ResizeRegion[], _window: BrowserWindow): void {
      // 일반/topmost 모드에선 위젯이 top-level이라 renderer DOM의 resize handle이
      // pointerdown으로 직접 작동(Widget.tsx:466). hook 기반 resize 불필요.
    },
  };
}

/**
 * Win32 전용 manager.
 *
 * Phase 4-2 책임:
 *   - enable(): WorkerW 탐색 → SetParent attach → 핸들 캐시
 *   - disable(): detachFromWorkerW + 핸들 클리어
 *   - healthCheck(): workerW/widgetHwnd가 여전히 valid한지 IsWindow 체크.
 *     실패 시 1회 재attach 시도, 또 실패하면 disable + 'workerw-stale' 보고.
 *   - updateWidgetBounds(): Phase 5에서 추가 구현.
 *
 * 모든 throw는 흡수해 ok:false로 변환한다 (호출자 fallback).
 */
function createWin32Manager(win32: typeof import('./platform/win32Desktop')): DesktopWidgetManager {
  let handles: import('./platform/win32Desktop').Win32DesktopHandles | null = null;
  let cachedPhysicalBounds: PhysicalRect | null = null;
  let cachedListView: bigint | null = null; // Phase 6 — Explorer SysListView32 핸들
  let mouseHook: import('./platform/win32Desktop').MouseHookHandle | null = null; // Phase 7
  /**
   * Phase 7-A: hook callback이 PostMessage 라우팅 대상으로 사용할 widget HWND.
   * handles.widgetHwnd와 동일하지만 hot path에서 nullable check 한 번 줄이려고 별도 캐시.
   * enable() 성공 시 채워지고 clearHandles에서 0n으로 리셋.
   */
  let cachedWidgetHwnd: bigint = 0n;
  /**
   * Phase 7-stable: hook callback의 z-order 검증에서 비교할 Progman HWND 캐시.
   *
   * STRATEGY 3(SHELLDLL_DefView 직접 attach)에선 widget의 root가 Progman이 될 수 있어
   * isWidgetOrAncestor의 비교 대상에 포함시킨다. enable() 단계에서 collectDesktopAttachCandidates의
   * progman 필드를 가져와 캐시. clearHandles에서 0n 리셋.
   */
  let cachedProgmanHwnd: bigint = 0n;
  /**
   * Phase 7-A (재시도): hook callback이 webContents.sendInputEvent 호출 대상으로 사용할
   * BrowserWindow 인스턴스 캐시.
   *
   * PostMessageW 라우팅이 Chromium에 의해 무시되는 문제(사용자 검증 결과)를 해결하기 위해
   * Electron 공식 API인 sendInputEvent로 전환. BrowserWindow.webContents.sendInputEvent는
   * Chromium renderer의 input router에 직접 이벤트를 enqueue한다.
   *
   * 캐시 정책:
   *   - enable() 성공 시 인자로 받은 widgetWindow를 저장.
   *   - clearHandles에서 null로 리셋 (BrowserWindow 자체는 main.ts가 관리하므로 destroy 안 함).
   *   - hot path에서 isDestroyed() 가드 후 사용.
   */
  let cachedWidgetWindow: BrowserWindow | null = null;
  /**
   * Phase 7-A: 라우팅 통계 — 디버그용 카운터. 빈번하게 갱신되지만 atomic 증가만 하므로 hot path 영향 없음.
   * sent/skipped(아이콘)/skipped(영역밖)/failed 4분류.
   *
   * Phase 7-A 재시도: 'posted' → 'sent'로 명명 통일 (sendInputEvent와 PostMessage 둘 다 포함).
   *
   * Phase 7-stable: skippedAbove 추가 — 다른 윈도우(브라우저/탐색기 등)가 z-order로 위에 있어
   *   라우팅을 의도적으로 skip한 카운트. 정상 동작에서는 위젯 위에서만 0이 아니어야 함.
   */
  let routingStats: RoutingStats = createEmptyRoutingStats();
  let firstCallbackLogged = false;
  // [7-C] LBUTTONDOWN 진단 로그는 다른 진단 로그와 동일한 정책으로 첫 5건만 dump해 디스크 포화 회피.
  let lbuttonDownDiagCount = 0;
  let statsTimer: NodeJS.Timeout | null = null;

  // 16ms TTL 캐시 (Phase 6/7 — mouse hook hot path 성능)
  // 동일 좌표로 짧은 시간 안에 여러 번 호출되는 경우(드래그 중)에 유리.
  const HIT_CACHE_TTL_MS = 16;
  let lastHitX = Number.NaN;
  let lastHitY = Number.NaN;
  let lastHitResult = false;
  let lastHitUntil = 0;

  // ─── Phase 7-D — Resize 상태 ─────────────────────────────────
  /**
   * 활성 resize state. null이면 resize 중 아님.
   * LBUTTONDOWN이 resize edge 안에서 발생하면 채워지고, LBUTTONUP에서 null로 리셋.
   * disable() / clearHandles에서도 정리.
   */
  let resizeState: ResizeState | null = null;
  /**
   * renderer가 IPC로 등록한 resize edge 영역 — widget client area 기준 DIP rect + edge 식별자.
   * widget이 move/resize될 때마다 cachedResizeRegions(physical screen)를 재계산하기 위해
   * 원본 DIP rect는 별도로 보관.
   */
  let cachedResizeRegionsDip: readonly ResizeRegion[] = [];
  /**
   * cachedResizeRegionsDip를 현재 widget bounds + display scaleFactor로 변환한
   * (physical screen rect, edge) 배열. hook callback hot path에서 LBUTTONDOWN 위치 hit-test에 사용.
   */
  let cachedResizeRegions: ReadonlyArray<{ rect: PhysicalRect; edge: ResizeRegion['edge'] }> = [];

  function recalcResizeRegionsPhysical(window: BrowserWindow): void {
    if (!cachedPhysicalBounds || cachedResizeRegionsDip.length === 0) {
      cachedResizeRegions = [];
      return;
    }
    if (window.isDestroyed()) {
      cachedResizeRegions = [];
      return;
    }
    // dipRectsToPhysical은 DipRect[]만 받으므로 edge metadata는 별도 매핑.
    const physical = dipRectsToPhysical(
      cachedResizeRegionsDip.map((r) => r.dipRect),
      window,
    );
    cachedResizeRegions = cachedResizeRegionsDip.map((r, i) => ({
      rect: physical[i] ?? { x: 0, y: 0, width: 0, height: 0 },
      edge: r.edge,
    }));
  }

  /**
   * Phase 7-D — physical screen point가 어느 resize region에 들어가는지 판정.
   * 첫 번째 매칭 region 반환 (배열 순서대로 검사). 없으면 null.
   */
  function findResizeEdgeAtPoint(p: { x: number; y: number }): ResizeRegion['edge'] | null {
    for (let i = 0; i < cachedResizeRegions.length; i++) {
      const r = cachedResizeRegions[i]!;
      if (
        p.x >= r.rect.x &&
        p.x < r.rect.x + r.rect.width &&
        p.y >= r.rect.y &&
        p.y < r.rect.y + r.rect.height
      ) {
        return r.edge;
      }
    }
    return null;
  }

  // ─── Phase 7-G — widget bounds hover 트랜지션 ────────────────
  /**
   * 마우스가 widget bounds 안에 있는지의 직전 상태. mouse hook callback이 매번 갱신.
   * 변경 시(enter/leave)에만 hoverCallback을 발사해 main이 globalShortcut을 toggle.
   */
  let lastHoverInside = false;
  let hoverCallback: ((inside: boolean) => void) | null = null;

  // ─── Phase 7-C — Header drag 상태 ───────────────────────────
  /**
   * 활성 drag state. null이면 drag 중 아님 (정상 라우팅).
   * LBUTTONDOWN이 헤더 영역에서 발생하면 채워지고, LBUTTONUP에서 null로 리셋.
   * disable() / clearHandles에서도 정리.
   */
  let dragState: DragState | null = null;
  /**
   * renderer가 IPC로 등록한 헤더 영역 — widget client area 기준 DIP rect.
   * widget이 move/resize될 때마다 cachedHeaderRegions(physical screen)를 재계산하기 위해
   * 원본 DIP rect는 별도로 보관한다.
   */
  let cachedHeaderRegionsDip: readonly DipRect[] = [];
  /**
   * cachedHeaderRegionsDip를 현재 cachedPhysicalBounds + display scaleFactor로 변환한
   * physical screen rect. hook callback hot path에서 isInsideAnyRect로 즉시 판정.
   * widget bounds가 갱신되거나 setHeaderRegions가 호출되면 재계산.
   */
  let cachedHeaderRegions: readonly PhysicalRect[] = [];
  /**
   * Phase 7-C 회귀 fix — drag 영역에서 제외해야 하는 DIP rect들(주로 헤더 우측 버튼 그룹).
   * setHeaderRegions에서 채워지고, recalcHeaderRegionsPhysical에서 cachedHeaderExcludeRegions로 변환.
   *
   * cachedHeaderRegions 안 + cachedHeaderExcludeRegions 안이면 drag 안 시작 → 버튼 클릭 정상 라우팅.
   */
  let cachedHeaderExcludeRegionsDip: readonly DipRect[] = [];
  /**
   * cachedHeaderExcludeRegionsDip의 physical screen 좌표 캐시. hot path에서 isInsideAnyRect로 즉시 판정.
   */
  let cachedHeaderExcludeRegions: readonly PhysicalRect[] = [];

  function dipRectsToPhysical(
    dipRects: readonly DipRect[],
    window: BrowserWindow,
  ): readonly PhysicalRect[] {
    if (!cachedPhysicalBounds || dipRects.length === 0) return [];
    if (window.isDestroyed()) return [];
    // 멀티 모니터 결정적 fix(2026-05-06): screen.dipToScreenRect로 widget 자체의
    // physical 좌표를 다시 정확히 계산하고, 그 origin에 client DIP rect를 더하는 패턴.
    //
    // r은 widget client area DIP 기준이므로 screen 절대 좌표로 변환하려면:
    //   1. widgetDipBounds = window.getBounds() — widget의 screen DIP origin
    //   2. clientDipRect = { x: widgetDipBounds.x + r.x, ... } — screen DIP 절대
    //   3. dipToScreenRect(window, clientDipRect) → screen physical 절대
    // 이 방식은 monitor 경계를 가로지르는 widget이나 per-monitor DPI 환경에서도 정확.
    const widgetDipBounds = window.getBounds();
    return dipRects.map((r) => {
      const absoluteDip = {
        x: widgetDipBounds.x + r.x,
        y: widgetDipBounds.y + r.y,
        width: r.width,
        height: r.height,
      };
      try {
        const physical = screen.dipToScreenRect(window, absoluteDip);
        return {
          x: Math.round(physical.x),
          y: Math.round(physical.y),
          width: Math.round(physical.width),
          height: Math.round(physical.height),
        };
      } catch {
        // Fallback — 단순 scaleFactor 곱셈
        const display = screen.getDisplayMatching(widgetDipBounds);
        const sf = display.scaleFactor || 1;
        const base = cachedPhysicalBounds;
        if (!base) {
          return { x: 0, y: 0, width: 0, height: 0 };
        }
        const x = base.x + Math.round(r.x * sf);
        const y = base.y + Math.round(r.y * sf);
        const right = base.x + Math.round((r.x + r.width) * sf);
        const bottom = base.y + Math.round((r.y + r.height) * sf);
        return {
          x,
          y,
          width: right - x,
          height: bottom - y,
        };
      }
    });
  }

  function recalcHeaderRegionsPhysical(window: BrowserWindow): void {
    if (!cachedPhysicalBounds || cachedHeaderRegionsDip.length === 0) {
      cachedHeaderRegions = [];
      cachedHeaderExcludeRegions = [];
      return;
    }
    if (window.isDestroyed()) {
      cachedHeaderRegions = [];
      cachedHeaderExcludeRegions = [];
      return;
    }
    cachedHeaderRegions = dipRectsToPhysical(cachedHeaderRegionsDip, window);
    cachedHeaderExcludeRegions = dipRectsToPhysical(cachedHeaderExcludeRegionsDip, window);
  }

  /**
   * Phase 7-C 회귀 fix — drag 시작 가능한 헤더 영역인지 판정.
   *
   * drag 영역 안 AND exclude 영역 밖일 때만 true.
   * 헤더 안의 버튼 그룹 위에서 LBUTTONDOWN이 발생하면 false → drag 시작 안 함 → 버튼 클릭 정상 라우팅.
   */
  function isInDraggableHeaderRegion(p: { x: number; y: number }): boolean {
    if (!isInsideAnyRect(p, cachedHeaderRegions)) return false;
    if (isInsideAnyRect(p, cachedHeaderExcludeRegions)) return false;
    return true;
  }

  function clearHook(): void {
    if (mouseHook) {
      try {
        win32.uninstallLowLevelMouseHook(mouseHook);
      } catch (e) {
        console.warn('[desktopWidgetManager] uninstallLowLevelMouseHook 예외 (무시):', e);
      }
    }
    mouseHook = null;
  }

  function clearHandles(): void {
    diagLog('native-desktop', `[clearHandles] enter handles=${!!handles} hook=${!!mouseHook}`);
    // hook을 먼저 정리해야 callback이 살아있는 동안 detach 발생을 피할 수 있음.
    clearHook();
    if (handles) {
      try {
        win32.detachFromWorkerW(handles);
      } catch (e) {
        // detach는 best-effort — 실패해도 무시
        console.warn('[desktopWidgetManager] detach 중 예외 (무시):', e);
      }
    } else {
      diagWarn('native-desktop', '[clearHandles] handles null — detach skip');
    }
    handles = null;
    cachedPhysicalBounds = null;
    cachedListView = null;
    cachedWidgetHwnd = 0n;
    cachedProgmanHwnd = 0n;
    // BrowserWindow 자체는 main.ts가 관리하므로 우리는 reference만 떨어뜨린다.
    cachedWidgetWindow = null;
    // hit cache 초기화
    lastHitX = Number.NaN;
    lastHitY = Number.NaN;
    lastHitResult = false;
    lastHitUntil = 0;
    // Phase 7-A 통계 초기화 (다음 enable에서 깨끗하게 시작)
    routingStats = createEmptyRoutingStats();
    firstCallbackLogged = false;
    lbuttonDownDiagCount = 0;
    if (statsTimer) {
      clearInterval(statsTimer);
      statsTimer = null;
    }
    // Phase 7-C: drag state + header regions 정리
    dragState = null;
    cachedHeaderRegionsDip = [];
    cachedHeaderRegions = [];
    cachedHeaderExcludeRegionsDip = [];
    cachedHeaderExcludeRegions = [];
    // Phase 7-D: resize state + regions 정리
    resizeState = null;
    cachedResizeRegionsDip = [];
    cachedResizeRegions = [];
    // Phase 7-G: hover state 정리 + leave 신호 1회 발사 (main이 globalShortcut unregister하도록).
    if (lastHoverInside && hoverCallback) {
      try {
        hoverCallback(false);
      } catch {
        // ignore
      }
    }
    lastHoverInside = false;
    // hoverCallback 자체는 유지 — manager가 destroy되는 게 아니라 disable 사이클이라서
    // 다음 enable 시 같은 cb를 재사용. 명시적 setHoverCallback(null) 호출 시에만 해제.
  }

  // Phase 7 — hot path. shouldPassThroughToDesktop을 별도 명명 함수로 분리해 hook callback에서
  // 안정적으로 reference 가능하게 한다 (this 바인딩 회피).
  function passThroughCheck(p: { x: number; y: number }): boolean {
    if (!handles || !cachedListView) return false;
    if (!isInsideCachedBoundsLocal(p)) return false;

    const now = Date.now();
    if (p.x === lastHitX && p.y === lastHitY && now < lastHitUntil) {
      return lastHitResult;
    }

    let hit = false;
    try {
      hit = win32.lvmHitTest(cachedListView, p);
    } catch (e) {
      if (e instanceof Error) {
        console.warn(
          `[desktopWidgetManager] lvmHitTest 실패 (${e.name}): ${e.message} — listView 무효화`,
        );
      }
      cachedListView = null;
      hit = false;
    }

    lastHitX = p.x;
    lastHitY = p.y;
    lastHitResult = hit;
    lastHitUntil = now + HIT_CACHE_TTL_MS;
    return hit;
  }

  function isInsideCachedBoundsLocal(p: { x: number; y: number }): boolean {
    const r = cachedPhysicalBounds;
    if (!r) return false;
    return p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;
  }

  function recalcPhysicalBounds(window: BrowserWindow): PhysicalRect | null {
    if (!window || window.isDestroyed()) {
      return null;
    }
    const dipBounds = window.getBounds();
    // 멀티 모니터 결정적 fix(2026-05-06): Electron 공식 API screen.dipToScreenRect 사용.
    //
    // 이전 구현(dipToPhysical 단순 곱셈)의 문제:
    //   - per-monitor DPI 환경에서 보조 모니터의 physical origin은 단순히
    //     `dip * scaleFactor`가 아니다. primary monitor의 physical 우측 경계를 기준으로
    //     누적 좌표를 계산해야 한다.
    //   - 예: primary 100% (1920×1080), 보조 우측 150% (2560×1440 → physical 3840×2160).
    //         widget DIP x=1920 (보조 모니터 좌상단)이면, physical x는 1920 (primary 폭)
    //         이지 1920*1.5=2880이 아님.
    //   - 음수 DIP(좌측 보조 모니터) 케이스도 동일 문제.
    //
    // screen.dipToScreenRect는 OS의 monitor 레이아웃을 직접 조회해 정확히 변환한다.
    // window 인자는 현재 widget의 monitor를 OS에 hint(주로 multi-DPI 환경에서 정확도 향상).
    try {
      const physical = screen.dipToScreenRect(window, dipBounds);
      return {
        x: Math.round(physical.x),
        y: Math.round(physical.y),
        width: Math.round(physical.width),
        height: Math.round(physical.height),
      };
    } catch (e) {
      // 호환성 fallback — 단순 scaleFactor 곱셈 (single monitor 환경에서는 정확).
      diagWarn(
        'native-desktop',
        `dipToScreenRect 실패 — dipToPhysical fallback: ${e instanceof Error ? e.message : String(e)}`,
      );
      const display = screen.getDisplayMatching(dipBounds);
      const scaleFactor = display.scaleFactor || 1;
      return dipToPhysical(dipBounds, scaleFactor);
    }
  }

  /**
   * 진단 계측 — "우리가 요청한 위치·크기"와 "OS가 실제로 적용한 값"을 한 줄로 대조한다.
   *
   * 배율이 서로 다른 모니터를 가로지르는 드래그에서만 드러나는 두 어긋남을 잡기 위한 것:
   *   ① 위치 어긋남 — `SetWindowPos`에 넘긴 좌표 vs `GetWindowRect`가 돌려주는 화면 좌표.
   *      바탕화면 모드의 위젯은 WorkerW의 자식 창(WS_CHILD)이라 좌표계가 부모 클라이언트
   *      기준이다. 가상 화면 원점이 (0,0)이 아니면(보조 모니터가 좌/상단 배치) 어긋난다.
   *   ② 크기 어긋남 — drag 중 `startBounds`(출발 모니터 배율 기준 physical)를 매 프레임
   *      강제하는데, 경계를 넘는 순간 Windows가 WM_DPICHANGED로 창을 다시 잰다. 둘이
   *      서로 밀어내면 위젯이 경계에 붙어 더 나아가지 못한다.
   *
   * 사람이 로그만 보고 판정할 수 있도록 오차를 숫자로 적는다. 진단 실패는 무시한다
   * (drag 경로를 절대 막지 않는다).
   */
  function describeApplied(requested: PhysicalRect): string {
    let actual: PhysicalRect | null = null;
    try {
      actual = win32.getWindowRect(cachedWidgetHwnd);
    } catch {
      actual = null;
    }
    if (!actual) return 'actual=unavailable';

    let scaleInfo = '';
    try {
      const dip = screen.screenToDipPoint({ x: actual.x, y: actual.y });
      const display = screen.getDisplayNearestPoint(dip);
      scaleInfo = ` display=${display.id} scale=${display.scaleFactor}`;
    } catch {
      scaleInfo = '';
    }

    return (
      `actual=(${actual.x},${actual.y},${actual.width}x${actual.height}) ` +
      `posErr=(${actual.x - requested.x},${actual.y - requested.y}) ` +
      `sizeErr=(${actual.width - requested.width},${actual.height - requested.height})${scaleInfo}`
    );
  }

  return {
    async enable(window: BrowserWindow): Promise<DesktopWidgetModeStatus> {
      diagLog('native-desktop', 'win32 manager enable() invoked');
      // 중복 호출 방어: 이미 attach 상태면 healthCheck로 위임.
      if (handles) {
        const valid =
          win32.isWindowAlive(handles.workerW) && win32.isWindowAlive(handles.widgetHwnd);
        if (valid) {
          diagLog('native-desktop', 'enable: 이미 attach 상태 + valid → no-op return ok');
          return { ok: true, mode: 'native-desktop' };
        }
        // 핸들 stale → 정리 후 재시도
        diagLog('native-desktop', 'enable: 기존 handles stale → clear + retry');
        clearHandles();
      }

      // 1. 위젯 HWND
      let widgetHwnd: bigint;
      try {
        widgetHwnd = win32.getWidgetHwnd(window);
        diagLog('native-desktop', `step1 widgetHwnd=0x${widgetHwnd.toString(16)}`);
      } catch (e) {
        const reason = e instanceof Error ? e.message : 'getWidgetHwnd-failed';
        diagWarn('native-desktop', `getWidgetHwnd 실패: ${reason}`);
        return { ok: false, reason: 'widget-hwnd-failed', fallbackMode: 'normal' };
      }

      // 2. attach 후보 수집 (Strategy 1/2/3 후보가 한꺼번에 들어 있다)
      let candidates: import('./platform/win32Desktop').DesktopAttachCandidates;
      try {
        candidates = win32.collectDesktopAttachCandidates();
        diagLog(
          'native-desktop',
          `step2 candidates: standardWorkerWs=${candidates.standardWorkerWs.length}, shellDefViewSibling=${candidates.shellDefViewSiblingWorkerW === 0n ? 'NONE' : '0x' + candidates.shellDefViewSiblingWorkerW.toString(16)}, shellDefView=${candidates.shellDefView === 0n ? 'NONE' : '0x' + candidates.shellDefView.toString(16)}`,
        );
      } catch (e) {
        const reason = e instanceof Error ? e.message : 'collectDesktopAttachCandidates-failed';
        diagWarn('native-desktop', `attach 후보 수집 실패: ${reason}`);
        return { ok: false, reason: 'workerw-not-found', fallbackMode: 'normal' };
      }

      // 3. STRATEGY 1/2/3 우선순위로 attach 시도 — 사용자 트리거라 verbose 로그 활성.
      const attachResult = await tryAttachWithStrategies(win32, widgetHwnd, candidates, {
        verbose: true,
      });
      handles = attachResult.handles;
      const lastError = attachResult.lastError;

      if (!handles) {
        // 모든 strategy 실패 → normal fallback (사용자 의도 보존).
        //
        // 정책 변경(G2-bis): 이전에는 'topmost'로 fallback했으나 사용자가 native-desktop을
        // 명시 선택한 의도와 정반대(아래로 → 위로)라 혼란을 야기했다. 'normal'로 변경하면
        // 위젯이 일반 창처럼 동작하고, 호출자(main.ts)가 토스트로 안내한다.
        // healthCheck 단계의 fallback은 이미 attach 됐다 깨진 케이스라 'topmost' 유지가 안전 (안 보이는 것보단 낫다).
        const reason = lastError
          ? `${lastError.name}: ${lastError.message}`
          : 'no-strategy-succeeded';
        diagWarn('native-desktop', `모든 STRATEGY 실패 (마지막 에러: ${reason})`);
        return { ok: false, reason: 'workerw-not-found-or-rejected', fallbackMode: 'normal' };
      }

      // 4. 초기 physical bounds 캐시 (Phase 5) + Phase 7-A widget HWND/BrowserWindow 캐시
      cachedPhysicalBounds = recalcPhysicalBounds(window);
      cachedWidgetHwnd = handles.widgetHwnd;
      // Phase 7-stable: z-order 검증용 Progman 캐시. STRATEGY 3 환경에서 widget root가
      // Progman이 될 수 있어 isWidgetOrAncestor 판정에 필요.
      cachedProgmanHwnd = candidates.progman;
      // Phase 7-A 재시도 — sendInputEvent 호출용 BrowserWindow 캐시.
      // hook callback에서 isDestroyed 가드 후 webContents.sendInputEvent 호출.
      cachedWidgetWindow = window;
      // Phase 7-C: 이전에 setHeaderRegions로 등록된 dipRects가 있으면 즉시 physical 재계산.
      // (renderer가 enable 이전에 IPC로 등록한 경우 대비.)
      recalcHeaderRegionsPhysical(window);
      // Phase 7-D: resize regions도 동일.
      recalcResizeRegionsPhysical(window);
      diagLog(
        'native-desktop',
        `Phase 7-A: BrowserWindow 캐시 완료, headerRegions=${cachedHeaderRegions.length}`,
      );

      // 5. Phase 6: ListView 탐색 (실패해도 attach 자체는 유지 — 모든 hit이 Electron으로 처리됨)
      try {
        cachedListView = win32.findDesktopListView(handles.workerW);
        if (!cachedListView) {
          console.log('[desktopWidgetManager] SysListView32 미발견 — 아이콘 pass-through 비활성');
        }
      } catch (e) {
        console.warn('[desktopWidgetManager] findDesktopListView 예외:', e);
        cachedListView = null;
      }

      // 6. Phase 7: low-level mouse hook 설치 (중복 가드 + 실패 시 attach 유지하고 hook만 미설치)
      // 중복 가드: enable이 두 번 호출되거나 dev 핫리로드로 hook이 살아있으면 우선 정리.
      clearHook();
      try {
        mouseHook = win32.installLowLevelMouseHook((p, msgType, mouseData) => {
          // ───────────────────────────────────────────────────────────────
          // Phase 7-A (재시도): hook callback hot path — 라우팅 결정 + sendInputEvent.
          //
          // 호출 빈도: WM_MOUSEMOVE는 초당 수백 회. 따라서 빠른 reject 우선:
          //   1. 관심 메시지 아니면 즉시 return (휠/NC* 등은 다음 phase에서)
          //   2. widget bounds 밖이면 즉시 return (글로벌 마우스 움직임)
          //   3. widget 안 + 아이콘 위면 return (Explorer가 자연 처리)
          //   4. widget 안 + 빈공간이면 webContents.sendInputEvent로 라우팅
          //
          // 모든 단계 throw 금지(installLowLevelMouseHook 내부 try/catch가 있지만 여기서도
          // 명시적으로 회피). 0.5ms 이내 처리 목표.
          //
          // 진단 로그 정책:
          //   - WM_MOUSEMOVE는 너무 자주 호출되므로 로그 안 찍음 (file/IPC fanout으로 디스크 사망).
          //   - 클릭/우클릭/휠클릭/더블클릭은 모두 진단 로그 (사용자 검증 시 명확히 가시).
          // ───────────────────────────────────────────────────────────────
          // ⚠️ Win11 24H2 진단: hook callback 첫 진입 1회 즉시 로그.
          // callback이 0건이면 → WH_MOUSE_LL이 OS 정책에 차단된 것 확정.
          routingStats.totalCallbacks++;
          if (!firstCallbackLogged) {
            firstCallbackLogged = true;
            diagLog(
              'native-desktop',
              `[7-A] hook 첫 callback 호출됨 — msgType=0x${msgType.toString(16)} screen=(${p.x},${p.y})`,
            );
          }
          if (!win32.isMouseMessageOfInterest(msgType)) return;

          // ─── Phase 7-C — Header drag 처리 ───
          // drag 활성 중에는 click/wheel 라우팅 모두 차단. drag 종료 후에야 정상 라우팅 재개.
          // 순서: MOUSEMOVE 시 drag면 widget 이동 → return / LBUTTONUP이면 drag 종료.
          if (dragState && dragState.active) {
            // 0x0200 = WM_MOUSEMOVE
            if (msgType === 0x0200) {
              const dx = p.x - dragState.startMouse.x;
              const dy = p.y - dragState.startMouse.y;
              const rawX = dragState.startWidget.x + dx;
              const rawY = dragState.startWidget.y + dy;

              let newX = rawX;
              let newY = rawY;
              if (dragState.physicalWorkAreas && dragState.physicalWorkAreas.length > 0) {
                const rawRect = {
                  x: rawX,
                  y: rawY,
                  width: dragState.startBounds.width,
                  height: dragState.startBounds.height,
                };
                const bestArea = findBestWorkAreaForBounds(rawRect, dragState.physicalWorkAreas);
                if (bestArea) {
                  // 최소 가시량은 그 모니터의 배율로 환산된 physical px를 쓴다 (DIP 기준 통일).
                  const clamped = clampWidgetBoundsToWorkArea(rawRect, bestArea, {
                    minVisibleHeaderHeight: bestArea.minVisibleHeaderHeight,
                    minVisibleWidth: bestArea.minVisibleWidth,
                  });
                  newX = clamped.x;
                  newY = clamped.y;
                }
              }

              dragState.moveCount = (dragState.moveCount ?? 0) + 1;
              try {
                const moveOk = win32.moveWidget(
                  cachedWidgetHwnd,
                  newX,
                  newY,
                  dragState.startBounds.width,
                  dragState.startBounds.height,
                );
                dragState.lastRequested = { x: newX, y: newY };
                // 진단: 매 30번째 MOUSEMOVE마다 진행 상황 dump (전체 누적이 아닌 sampling).
                // ★실제 적용값(describeApplied) 대조는 sampling 시에만 — GetWindowRect는 FFI
                //   호출이라 초당 수백 회의 MOUSEMOVE 전부에 붙이면 drag가 끊긴다.
                if (dragState.moveCount % 30 === 1) {
                  const applied = describeApplied({
                    x: newX,
                    y: newY,
                    width: dragState.startBounds.width,
                    height: dragState.startBounds.height,
                  });
                  diagLog(
                    'native-desktop',
                    `[7-C] drag move #${dragState.moveCount} mouse=(${p.x},${p.y}) delta=(${dx},${dy}) newPos=(${newX},${newY}) moveOk=${moveOk} ${applied} hwnd=0x${cachedWidgetHwnd.toString(16)}`,
                  );
                }
              } catch (e) {
                diagWarn(
                  'native-desktop',
                  `[7-C] drag move 실패: ${e instanceof Error ? e.message : String(e)}`,
                );
              }
              // ★ MOUSEMOVE는 차단하지 않음 (CallNextHookEx 정상 패스).
              //   Win11 24H2에서 BUTTONDOWN을 차단하면 Explorer가 selection 시작 못 하므로
              //   MOUSEMOVE 시점에도 rubber band 안 그려짐. 차단하면 hook이 다음 MOUSEMOVE를
              //   받지 못할 가능성 있음 (사용자 검증 시 totalDelta=0,0 회귀).
              return false;
            }
            // 0x0202 = WM_LBUTTONUP
            if (msgType === 0x0202) {
              const finalDx = p.x - dragState.startMouse.x;
              const finalDy = p.y - dragState.startMouse.y;
              // ── 계측 핵심 ──
              // "커서가 움직인 양(totalDelta)" vs "위젯이 실제로 움직인 양(actualTravel)".
              // 같은 배율 안에서는 ratio가 1.000이어야 한다. 배율이 다른 모니터를 가로지를 때
              // 1이 아니면 "위젯이 커서를 못 따라간다"는 신고가 수치로 확정된다.
              const startX = dragState.startWidget.x;
              const startY = dragState.startWidget.y;
              const startW = dragState.startBounds.width;
              const startH = dragState.startBounds.height;
              const requested = dragState.lastRequested ?? dragState.startWidget;
              const applied = describeApplied({
                x: requested.x,
                y: requested.y,
                width: startW,
                height: startH,
              });
              let travelInfo = 'actualTravel=unavailable';
              try {
                const rect = win32.getWindowRect(cachedWidgetHwnd);
                if (rect) {
                  const travelX = rect.x - startX;
                  const travelY = rect.y - startY;
                  const ratioX = finalDx === 0 ? 'n/a' : (travelX / finalDx).toFixed(3);
                  const ratioY = finalDy === 0 ? 'n/a' : (travelY / finalDy).toFixed(3);
                  travelInfo = `actualTravel=(${travelX},${travelY}) ratio=(${ratioX},${ratioY})`;
                }
              } catch {
                travelInfo = 'actualTravel=unavailable';
              }
              diagLog(
                'native-desktop',
                `[7-C] drag end mouse=(${p.x},${p.y}) totalDelta=(${finalDx},${finalDy}) ` +
                  `${travelInfo} startWidget=(${startX},${startY}) startSize=(${startW}x${startH}) ${applied}`,
              );
              const dragStartDipSize = dragState.startDipSize;
              const dragStartScale = dragState.startScale;
              dragState = null;

              // ─── 배율이 다른 모니터에서 손을 뗀 경우 — 보이는 크기 복구 ───
              //
              // 바탕화면 모드의 위젯은 WorkerW의 자식 창이라 우리가 SetWindowPos로 직접 옮긴다.
              // 그래서 일반 창이라면 Windows가 해 주는 "배율에 맞춘 크기 재조정"이 일어나지 않는다.
              // 실측(2026-08-18) 결과 두 가지가 어긋난 채 남는다:
              //   ① 물리 크기가 그대로라 위젯이 모니터마다 커졌다 작아졌다 한다.
              //   ② 더 큰 문제 — Chromium이 배율 변화는 알아채면서(devicePixelRatio 변경)
              //      화면 배치는 다시 하지 않아, 1232px 창에 705px만 칠해진다.
              //      투명 창이라 나머지는 빈 공간 → 사용자에게는 "위젯이 절반만 보인다".
              // setBounds로 DIP 기준 크기를 다시 알려주면 ①②가 함께 풀린다.
              //   상세: docs/03-analysis/widget-dual-monitor-drag/widget-dual-monitor-drag.analysis.md §13
              if (
                dragStartDipSize &&
                dragStartScale !== undefined &&
                cachedWidgetWindow &&
                !cachedWidgetWindow.isDestroyed()
              ) {
                // 레이아웃 재적용이 이미 창을 정리했는가 — 그렇다면 DPI 복구/축소는 건너뛴다
                // (한 번의 drag end 에서 setBounds 를 두 번 부르면 창이 두 번 튄다).
                let dragEndHandled = false;
                try {
                  const finalRect = win32.getWindowRect(cachedWidgetHwnd);
                  if (finalRect) {
                    const finalDipOrigin = screen.screenToDipPoint({
                      x: finalRect.x,
                      y: finalRect.y,
                    });
                    const target = screen.getDisplayNearestPoint(finalDipOrigin);
                    const endScale = target.scaleFactor;
                    // ★잰 값이 아니라 의도값 기준. 소수 배율에서 getBounds()는 매번 1px
                    //   크게 돌려주므로, 잰 값으로 축소를 판정하면 드래그마다 위젯이
                    //   자란다(widgetGeometryIntent.ts 의 실측).
                    const currentBounds =
                      readWidgetWindowBounds(cachedWidgetWindow) ?? cachedWidgetWindow.getBounds();

                    // ① 레이아웃이 켜져 있으면 크기 보존보다 우선한다.
                    //    레이아웃(전체·절반 등)은 고정 크기가 아니라 화면과의 관계이므로,
                    //    모니터가 바뀌면 새 작업 영역 기준으로 다시 계산해야 한다.
                    const reapply = resolveLayoutReapply(target.id, target.workArea);
                    if (reapply) {
                      cachedWidgetWindow.setMinimumSize(
                        reapply.minSize.width,
                        reapply.minSize.height,
                      );
                      applyWidgetWindowBounds(cachedWidgetWindow, reapply.bounds);
                      setActiveWidgetLayout(reapply.mode, target.id);
                      diagLog(
                        'native-desktop',
                        `[7-C] drag end 레이아웃 재적용 — ${reapply.mode} ` +
                          `before=(${currentBounds.x},${currentBounds.y},${currentBounds.width}x${currentBounds.height}) ` +
                          `after=(${reapply.bounds.x},${reapply.bounds.y},${reapply.bounds.width}x${reapply.bounds.height}) ` +
                          `display=${target.id} workArea=(${target.workArea.width}x${target.workArea.height})`,
                      );
                      dragEndHandled = true;
                    }

                    // ★하한은 `getMinimumSize` 가 아니라 상수다. 위젯 창은 resizable:false라
                    //   그 API가 "현재 크기"를 돌려줘 축소가 원리적으로 불가능해진다(상수 주석 참조).
                    // ② DPI 복구 + "도착 모니터에 안 들어가면 축소"를 한 번에 결정한다.
                    // setBounds를 두 번 부르면 창이 두 번 튄다. 판정 규칙은 순수 함수 쪽 주석 참조.
                    // 이전에 줄이기 전 크기가 기억돼 있고 이번 화면에 들어가면 되살린다.
                    const preferredSize = dragEndHandled
                      ? null
                      : takePreferredSizeIfFits(target.workArea);
                    const decision = dragEndHandled
                      ? { bounds: null, shrunkFrom: null }
                      : resolveDragEndBounds({
                          startScale: dragStartScale,
                          endScale,
                          startDipSize: dragStartDipSize,
                          finalDipOrigin,
                          currentBounds,
                          workArea: target.workArea,
                          minSize: WIDGET_ABSOLUTE_MIN_SIZE,
                          preferredSize,
                        });
                    if (decision.shrunkFrom) {
                      // 축소는 이 화면에서만 유효한 임시 조치 — 넓은 화면으로 돌아오면 되살린다.
                      rememberSizeBeforeFit(decision.shrunkFrom);
                    }
                    const next = decision.bounds;
                    if (next) {
                      applyWidgetWindowBounds(cachedWidgetWindow, next);
                      diagLog(
                        'native-desktop',
                        `[7-C] drag end 크기 보정 — scale ${dragStartScale}→${endScale} ` +
                          `before=(${currentBounds.x},${currentBounds.y},${currentBounds.width}x${currentBounds.height}) ` +
                          `setBounds=(${next.x},${next.y},${next.width}x${next.height}) ` +
                          `workArea=(${target.workArea.width}x${target.workArea.height}) ` +
                          `restored=${preferredSize ? `${preferredSize.width}x${preferredSize.height}` : 'no'} ` +
                          `remembered=${decision.shrunkFrom ? `${decision.shrunkFrom.width}x${decision.shrunkFrom.height}` : 'no'}`,
                      );
                    }
                  }
                } catch (e) {
                  diagWarn(
                    'native-desktop',
                    `[7-C] drag end DPI 복구 실패 (이동 자체는 유지): ${e instanceof Error ? e.message : String(e)}`,
                  );
                }
              }

              // BrowserWindow.getBounds()는 SetWindowPos 후 즉시 반영되므로 cachedPhysicalBounds도
              // 갱신해야 다음 click 라우팅이 새 위치 기준으로 정확히 동작.
              if (cachedWidgetWindow && !cachedWidgetWindow.isDestroyed()) {
                cachedPhysicalBounds = recalcPhysicalBounds(cachedWidgetWindow);
                recalcHeaderRegionsPhysical(cachedWidgetWindow);
                recalcResizeRegionsPhysical(cachedWidgetWindow);
              }
              // ★ Explorer rubber band 종료 차단: BUTTONUP도 흡수.
              return true;
            }
            // 다른 버튼/메시지가 drag 중에 들어오면 일단 무시 (drag 우선) + 차단.
            return true;
          }

          // ─── Phase 7-D — Resize 처리 ───
          // resize 활성 중에는 click/hover 라우팅 모두 차단. resize 종료 후에야 정상 라우팅 재개.
          if (resizeState && resizeState.active) {
            // 0x0200 = WM_MOUSEMOVE
            if (msgType === 0x0200) {
              const dx = p.x - resizeState.startMouse.x;
              const dy = p.y - resizeState.startMouse.y;
              const start = resizeState.startBounds;
              let newX = start.x;
              let newY = start.y;
              let newW = start.width;
              let newH = start.height;

              // edge가 'right'/'bottom' 포함이면 폭/높이만 증가.
              // 'left'/'top' 포함이면 origin도 함께 이동(폭/높이는 반대 부호로).
              if (resizeState.edge.includes('right')) newW = start.width + dx;
              if (resizeState.edge.includes('bottom')) newH = start.height + dy;
              if (resizeState.edge.includes('left')) {
                newX = start.x + dx;
                newW = start.width - dx;
              }
              if (resizeState.edge.includes('top')) {
                newY = start.y + dy;
                newH = start.height - dy;
              }

              // min size 클램핑(physical px 기준 — DPI 100% 환경에서 dipBounds 300×200과 동일).
              // left/top edge 끌 때는 origin도 함께 보정해야 widget이 우/하로 밀려나지 않음.
              const MIN_W = 300;
              const MIN_H = 200;
              if (newW < MIN_W) {
                if (resizeState.edge.includes('left')) newX = start.x + start.width - MIN_W;
                newW = MIN_W;
              }
              if (newH < MIN_H) {
                if (resizeState.edge.includes('top')) newY = start.y + start.height - MIN_H;
                newH = MIN_H;
              }

              resizeState.moveCount = (resizeState.moveCount ?? 0) + 1;
              // Phase 7-D 2차 fix (2026-05-23) — Electron BrowserWindow.setBounds()가
              // WS_CHILD HWND에서 origin+size 동시 변경 시 단일 프레임 teleport 회귀
              // (사용자 신고 "한 번에 사라짐")를 일으켜, native SetWindowPos sync 호출로 전환.
              //
              // 이력:
              //   - 1차 fix(2026-05-07): win32 SetWindowPos `SWP_ASYNCWINDOWPOS`로 인한
              //     origin+size race 회피 위해 Electron setBounds 채택.
              //   - 2차 fix(2026-05-23): setBounds가 WS_CHILD에서 새 회귀를 만들어
              //     `moveAndResizeWidgetSync` (SWP_ASYNCWINDOWPOS 제외 sync 변형) 도입.
              //
              // 좌표는 physical pixel 그대로 사용 — DPI 변환 불필요 (SetWindowPos는 physical 기대).
              let setOk = false;
              try {
                setOk = win32.moveAndResizeWidgetSync(cachedWidgetHwnd, newX, newY, newW, newH);
                // cachedPhysicalBounds 동기 갱신 — BrowserWindow.getBounds()는 WS_CHILD에서
                // stale할 수 있어 의도값으로 직접 set. 다음 MOUSEMOVE의 start 비교 기준은
                // resizeState.startBounds (frozen)이라 본 갱신은 다른 hook 경로(passThrough,
                // hover 등)와의 일관성용.
                if (setOk) {
                  cachedPhysicalBounds = { x: newX, y: newY, width: newW, height: newH };
                }
              } catch (e) {
                diagWarn(
                  'native-desktop',
                  `[7-D] moveAndResizeWidgetSync 실패: ${e instanceof Error ? e.message : String(e)}`,
                );
              }
              if (resizeState.moveCount % 30 === 1) {
                diagLog(
                  'native-desktop',
                  `[7-D] resize move #${resizeState.moveCount} edge=${resizeState.edge} mouse=(${p.x},${p.y}) delta=(${dx},${dy}) newRect=(${newX},${newY},${newW}x${newH}) setOk=${setOk}`,
                );
              }
              // MOUSEMOVE는 차단하지 않음 (drag와 동일 — Win11 24H2 회귀 회피).
              return false;
            }
            // 0x0202 = WM_LBUTTONUP
            if (msgType === 0x0202) {
              diagLog(
                'native-desktop',
                `[7-D] resize end edge=${resizeState.edge} mouse=(${p.x},${p.y}) totalDelta=(${p.x - resizeState.startMouse.x},${p.y - resizeState.startMouse.y})`,
              );
              resizeState = null;
              // 사용자가 가장자리를 끌어 크기를 직접 정했다 — 기억과 레이아웃을 모두 버린다.
              // 안 버리면 다른 모니터로 옮길 때 방금 정한 크기가 옛 크기나 레이아웃으로 되돌아간다.
              clearPreferredSize();
              clearActiveWidgetLayout();
              if (cachedWidgetWindow && !cachedWidgetWindow.isDestroyed()) {
                cachedPhysicalBounds = recalcPhysicalBounds(cachedWidgetWindow);
                recalcHeaderRegionsPhysical(cachedWidgetWindow);
                recalcResizeRegionsPhysical(cachedWidgetWindow);
              }
              return true;
            }
            // resize 중 다른 버튼/메시지는 차단(클릭 흘러가지 않게).
            return true;
          }

          // ─── Phase 7-G — hover state 트랜지션 발사 ───
          // bounds inside/outside 변경 시점에만 hoverCallback 1회 호출. main이 이걸 받아
          // globalShortcut(Ctrl+1~4 등)을 toggle해 native-desktop 모드에서도 단축키 작동.
          // hot path 부담 없음(lastHoverInside 비교 1회 + 변경 시에만 cb 호출).
          {
            const insideForHover = isInsideCachedBoundsLocal(p);
            if (insideForHover !== lastHoverInside) {
              lastHoverInside = insideForHover;
              if (hoverCallback) {
                try {
                  hoverCallback(insideForHover);
                } catch {
                  // hover cb는 globalShortcut 호출 등을 하므로 throw 가능성 있지만
                  // hook callback hot path를 보호 — silent swallow.
                }
              }
            }
          }

          // ─── Phase 7-D — resize edge cursor: 의도적으로 하지 않는다 ───────────────
          //
          // 예전에는 MOUSEMOVE 마다 `win32.setResizeCursor()` 를 불러 커서를 ↔ 로 바꿨다.
          // 그 방식은 **원리적으로 이길 수 없고, 깜빡임만 만든다**(2026-08-19 사용자 신고
          // "커서가 잘 안 바뀌고 깜빡거려" → 코드 조사로 확인):
          //
          //   1. 우리 후킹(WH_MOUSE_LL)  → SetCursor(↔)
          //   2. 메시지가 탐색기 아이콘 목록(SysListView32)에 전달
          //   3. 탐색기 → WM_SETCURSOR  → SetCursor(화살표)      ← 항상 우리 뒤
          //
          // 저수준 마우스 후킹은 메시지가 창에 **전달되기 전에** 실행되므로 탐색기가 언제나
          // 마지막이고, 따라서 언제나 이긴다. ↔ 는 1번과 3번 사이의 짧은 틈에만 보였다 —
          // 그게 사용자가 본 깜빡임이다.
          //
          // 근본 원인은 z-order 다. 위젯은 `attachToShellDefView` 가 `SetWindowPos(HWND_BOTTOM)`
          // 으로 아이콘 목록 **아래**에 일부러 깔아 둔 창이라(그게 이 모드의 존재 이유다),
          // 마우스 메시지를 받지 못하고 Chromium 도 WM_SETCURSOR 를 못 받는다. 그래서 DOM 의
          // `cursor: ew-resize` 도 동작할 수 없다.
          //
          // MOUSEMOVE 를 차단해 3번을 막는 길은 검토했다가 접었다 — 이 파일 [7-C] 주석에
          // "MOUSEMOVE 를 차단하면 후킹이 다음 이동을 못 받을 수 있음(totalDelta=0,0 회귀)"
          // 이라는 실측 기록이 이미 있다. 커서 모양 하나를 얻자고 드래그 전체를 걸 수 없다.
          //
          // 대신 **위젯이 스스로 가장자리를 표시한다** — 마우스 이동은 sendInputEvent 로 위젯
          // 화면까지 실제로 전달되므로(WM_MOUSEMOVE → 'mouseMove'), DOM 의 :hover 가 살아 있다.
          // Widget.tsx 의 리사이즈 손잡이가 그 신호를 그린다.
          //
          // ★여기에 SetCursor 를 다시 넣지 말 것. main.helpers.meta.test.ts 가 막고 있다.

          if (!isInsideCachedBoundsLocal(p)) {
            routingStats.skippedOutOfBounds++;
            // 진단 라운드 (이슈 D — 보조 모니터): non-MOUSEMOVE 클릭이 widget bounds 밖으로
            // 판정될 때 첫 5건 dump. cachedPhysicalBounds와 hook callback의 p가 어떤 좌표계 차이로
            // mismatch되는지 가시화 (예: hook의 pt는 virtual screen, bounds는 primary 모니터 좌표 등).
            if (msgType !== 0x0200 && routingStats.skippedOutOfBounds <= 5) {
              const r = cachedPhysicalBounds;
              diagLog(
                'native-desktop',
                `[issue-D] skipOOB msg=0x${msgType.toString(16)} ` +
                  `pt=(${p.x},${p.y}) ` +
                  `cachedBounds=${r ? `(${r.x},${r.y},${r.width}x${r.height})` : 'null'} ` +
                  `count=${routingStats.skippedOutOfBounds}`,
              );
            }
            return;
          }

          // ─── Phase 7-stable — z-order 검증 (다른 윈도우가 위젯 위에 깔려있는지) ───
          // 사용자 보고 회귀(2026-05-05): 위젯 위에 띄운 브라우저/탐색기 창의 종료 버튼이나
          // 타이틀바 클릭이 가끔 위젯으로 흘러가서 그 창을 조작 못 하는 race가 발생.
          // 해결: WindowFromPoint + GetAncestor(GA_ROOT)으로 widget chain 안에 있는지
          // 판정. chain 안이면 widget으로 라우팅, 다른 top-level 창이면 OS 자연 라우팅에 맡김.
          //
          // 결정적 fix(2026-05-06): isWidgetOrAncestor가 GetAncestor(GA_ROOT)으로 chain
          // 추적하도록 강화. 이전 raw 등치 비교는 widget의 자식 element/Explorer ListView
          // 등을 모두 skip해 sent=0 회귀를 일으켰음.
          //
          // 단, drag 진행 중에는 본 검증 skip — 이미 위 dragState 분기에서 처리됨(여기 도달 X).
          // LBUTTONUP 직후 Explorer rubber band 시작 race 등은 drag 분기가 흡수.
          {
            const top = win32.windowFromPoint(p);
            const isWidgetTop = win32.isWidgetOrAncestor(
              top,
              cachedWidgetHwnd,
              handles ? handles.workerW : 0n,
              cachedProgmanHwnd,
            );
            if (!isWidgetTop) {
              routingStats.skippedAbove++;
              // 진단 로그 — 클릭류만 + 첫 5건만 (디스크 포화 회피).
              if (msgType !== 0x0200 && routingStats.skippedAbove <= 5) {
                diagLog(
                  'native-desktop',
                  `[z-order] skipped — top=0x${top.toString(16)} (msg=0x${msgType.toString(16)}, count=${routingStats.skippedAbove})`,
                );
              }
              return; // OS 자연 라우팅에 맡김 (위에 있는 창이 정상 처리)
            }
          }

          // ─── Phase 7-D — Resize edge LBUTTONDOWN으로 resize 시작 ───
          // 우선순위는 drag보다 위 — corner 영역(예: top-left)은 헤더와 겹칠 수 있어
          // resize가 우선 처리되어야 자연스러움.
          // 0x0201 = WM_LBUTTONDOWN
          if (msgType === 0x0201 && cachedResizeRegions.length > 0 && cachedPhysicalBounds) {
            const hitEdge = findResizeEdgeAtPoint(p);
            if (hitEdge) {
              resizeState = {
                active: true,
                edge: hitEdge,
                startMouse: { x: p.x, y: p.y },
                startBounds: cachedPhysicalBounds,
              };
              diagLog(
                'native-desktop',
                `[7-D] resize start edge=${hitEdge} mouse=(${p.x},${p.y}) startBounds=(${cachedPhysicalBounds.x},${cachedPhysicalBounds.y},${cachedPhysicalBounds.width}x${cachedPhysicalBounds.height})`,
              );
              // Explorer rubber band 차단(drag와 동일 정책).
              return true;
            }
          }

          // ─── Phase 7-C — Header LBUTTONDOWN으로 drag 시작 ───
          // 우선순위: bounds 안 + 헤더 영역 안 + 아이콘 위 아님 → drag 시작.
          // 아이콘 위는 passThroughCheck로 Explorer가 처리하도록 양보 (아래 분기).
          // 헤더가 아닌 일반 위젯 영역의 LBUTTONDOWN은 정상 sendInputEvent로 흘러감.
          // ─── 진단: LBUTTONDOWN 좌표가 어떤 region에 들어왔는지 ───
          // drag 안 됨 회귀 디버깅용. 모든 LBUTTONDOWN을 1회 로그.
          if (msgType === 0x0201 && lbuttonDownDiagCount < 5) {
            lbuttonDownDiagCount++;
            const inDrag = isInsideAnyRect(p, cachedHeaderRegions);
            const inExclude = isInsideAnyRect(p, cachedHeaderExcludeRegions);
            const draggable = isInDraggableHeaderRegion(p);
            diagLog(
              'native-desktop',
              `[7-C] LBUTTONDOWN screen=(${p.x},${p.y}) inDrag=${inDrag} inExclude=${inExclude} draggable=${draggable} cachedDrag=${cachedHeaderRegions.length} cachedExclude=${cachedHeaderExcludeRegions.length} count=${lbuttonDownDiagCount}`,
            );
          }
          if (
            msgType === 0x0201 &&
            cachedHeaderRegions.length > 0 &&
            isInDraggableHeaderRegion(p)
          ) {
            // 아이콘 영역 체크 — 헤더는 보통 위젯 상단이라 아이콘과 안 겹치지만 안전 차단.
            if (!passThroughCheck(p) && cachedPhysicalBounds) {
              // drag 시작(LBUTTONDOWN) 1회만 계산 — MOUSEMOVE 핫패스에는 부하 없음.
              let physicalWorkAreas: PhysicalWorkArea[] = [];
              try {
                physicalWorkAreas = computePhysicalWorkAreas(screen.getAllDisplays(), (r) =>
                  screen.dipToScreenRect(null, r),
                );
              } catch {
                physicalWorkAreas = [];
              }

              // 출발 모니터의 배율과 그때의 DIP 크기를 함께 적어 둔다.
              // 배율이 다른 모니터에서 손을 뗐을 때 "보이는 크기"를 원래대로 되돌리는 데 쓴다
              // (drag end의 DPI 복구 — desktopWidgetDpiRestore.ts).
              let startScaleValue: number | undefined;
              let startDipSize: { width: number; height: number } | undefined;
              let startScale = '';
              try {
                const dip = screen.screenToDipPoint({
                  x: cachedPhysicalBounds.x,
                  y: cachedPhysicalBounds.y,
                });
                const display = screen.getDisplayNearestPoint(dip);
                startScaleValue = display.scaleFactor;
                startScale = ` display=${display.id} scale=${display.scaleFactor}`;
              } catch {
                startScale = '';
              }
              if (cachedWidgetWindow && !cachedWidgetWindow.isDestroyed()) {
                try {
                  // 도착지에서 "보이는 크기"를 되돌릴 기준값이라 의도값을 써야 한다.
                  const dipBounds =
                    readWidgetWindowBounds(cachedWidgetWindow) ?? cachedWidgetWindow.getBounds();
                  startDipSize = { width: dipBounds.width, height: dipBounds.height };
                } catch {
                  startDipSize = undefined;
                }
              }

              dragState = {
                active: true,
                startMouse: { x: p.x, y: p.y },
                startWidget: { x: cachedPhysicalBounds.x, y: cachedPhysicalBounds.y },
                startBounds: cachedPhysicalBounds,
                startDipSize,
                startScale: startScaleValue,
                physicalWorkAreas,
              };
              const originX =
                physicalWorkAreas.length > 0 ? Math.min(...physicalWorkAreas.map((w) => w.x)) : 0;
              const originY =
                physicalWorkAreas.length > 0 ? Math.min(...physicalWorkAreas.map((w) => w.y)) : 0;
              diagLog(
                'native-desktop',
                `[7-C] drag start mouse=(${p.x},${p.y}) widget=(${cachedPhysicalBounds.x},${cachedPhysicalBounds.y}) size=(${cachedPhysicalBounds.width}x${cachedPhysicalBounds.height}) workAreas=${physicalWorkAreas.length} workAreaOrigin=(${originX},${originY})${startScale} scales=[${physicalWorkAreas.map((w) => `${w.x}:${w.minVisibleHeaderHeight / 40}`).join(' ')}]`,
              );
              // ★ Explorer rubber band 시작 차단: BUTTONDOWN을 OS에 흘리지 않음.
              return true; // drag 우선 — widget으로 LBUTTONDOWN 전달 안 함
            }
          }
          if (passThroughCheck(p)) {
            // 아이콘 위 — Explorer가 처리하도록 OS의 자연 라우팅에 맡김.
            routingStats.skippedIcon++;
            // 클릭류만 로깅 (MOUSEMOVE 제외)
            if (msgType !== 0x0200) {
              diagLog(
                'native-desktop',
                `[7-A] skip-icon msg=0x${msgType.toString(16)} screen=(${p.x},${p.y})`,
              );
            }
            return;
          }
          if (!cachedPhysicalBounds) return;
          const client = win32.physicalToClient(p, cachedPhysicalBounds);

          // ─── 라우팅: webContents.sendInputEvent ───
          // Chromium renderer가 native input과 동등하게 처리. PostMessageW로의 legacy fallback은
          // Chromium이 무시하는 한계와 wheel encoding 미구현 이슈로 제거됨(v2.1 cleanup).
          const win = cachedWidgetWindow;
          if (!win || win.isDestroyed()) {
            routingStats.failed++;
            return;
          }
          const eventType = win32.mapWin32MsgToElectronEvent(msgType);
          if (!eventType) {
            // 매핑 불가 메시지 — Phase 7-A/B 관심 메시지인데 매핑 미정의면 코드 일관성 문제.
            routingStats.failed++;
            return;
          }
          // sendInputEvent는 DIP 좌표(BrowserWindow의 client area 기준)를 받는다.
          // hook callback의 p는 physical pixel, cachedPhysicalBounds도 physical.
          // physicalToClient 결과(client)도 physical pixel이므로 scaleFactor로 나눠 DIP로 변환.
          const dipBounds = win.getBounds();
          const widthRatio =
            cachedPhysicalBounds.width === 0 ? 1 : dipBounds.width / cachedPhysicalBounds.width;
          const heightRatio =
            cachedPhysicalBounds.height === 0 ? 1 : dipBounds.height / cachedPhysicalBounds.height;
          const dipX = Math.round(client.x * widthRatio);
          const dipY = Math.round(client.y * heightRatio);

          // ─── Phase 7-B: WHEEL 분기 ───
          if (eventType === 'mouseWheel') {
            const axis = win32.mapWin32MsgToWheelAxis(msgType);
            if (!axis) {
              routingStats.failed++;
              return;
            }
            const delta = win32.decodeWheelDelta(mouseData);
            // 부호 정책은 win32.computeWheelDeltas(SSOT)에 위임. Electron sendInputEvent의
            // mouseWheel deltaY는 blink WebMouseWheelEvent 컨벤션을 따른다 (실기 확정 2026-05-22):
            // forward 휠 → deltaY 양수(위로), backward 휠 → deltaY 음수(아래로).
            // 본 manager는 helper 결과를 그대로 전달만 한다. 부호 변경 필요 시 helper + 메타테스트 동시 수정.
            const { deltaX, deltaY } = win32.computeWheelDeltas(delta, axis);
            try {
              win.webContents.sendInputEvent({
                type: 'mouseWheel',
                x: dipX,
                y: dipY,
                deltaX,
                deltaY,
                canScroll: true,
              });
              routingStats.sent++;
              diagLog(
                'native-desktop',
                `[7-B] sendInput wheel msg=0x${msgType.toString(16)} axis=${axis} raw=${delta} dip=(${dipX},${dipY})`,
              );
            } catch (e) {
              routingStats.failed++;
              diagWarn(
                'native-desktop',
                `[7-B] sendInput wheel 실패 msg=0x${msgType.toString(16)}: ${e instanceof Error ? e.message : String(e)}`,
              );
            }
            return;
          }

          // ─── Phase 7-A: Click/Move 분기 ───
          try {
            win.webContents.sendInputEvent({
              type: eventType,
              x: dipX,
              y: dipY,
              button: win32.mapWin32MsgToButton(msgType),
              clickCount: win32.mapWin32MsgToClickCount(msgType),
            });
            routingStats.sent++;
            if (msgType !== 0x0200) {
              diagLog(
                'native-desktop',
                `[7-A] sendInput msg=0x${msgType.toString(16)} type=${eventType} dip=(${dipX},${dipY}) client=(${client.x},${client.y})`,
              );
            }
          } catch (e) {
            routingStats.failed++;
            if (msgType !== 0x0200) {
              diagWarn(
                'native-desktop',
                `[7-A] sendInput 실패 msg=0x${msgType.toString(16)}: ${e instanceof Error ? e.message : String(e)}`,
              );
            }
          }
          void mouseData; // click/move 경로에선 미사용
        });
        diagLog(
          'native-desktop',
          `Phase 7-A: mouse hook 설치 완료 — routing 활성 (sendInputEvent)`,
        );
        // ⚠️ Win11 24H2 진단: 5초마다 통계 dump.
        // totalCallbacks=0이면 hook이 OS에 차단된 것. 정상적인 환경에선 사용자 mouse 움직임만으로도
        // 초당 수백 callback이 와야 함.
        if (statsTimer) clearInterval(statsTimer);
        statsTimer = setInterval(() => {
          diagLog(
            'native-desktop',
            `[7-A] stats: totalCallbacks=${routingStats.totalCallbacks} skipOOB=${routingStats.skippedOutOfBounds} skipIcon=${routingStats.skippedIcon} skipAbove=${routingStats.skippedAbove} sent=${routingStats.sent} failed=${routingStats.failed}`,
          );
        }, 5000);
      } catch (e) {
        // hook 설치 실패는 치명적이지 않다 (라우팅은 Z-order만으로도 일부 동작 — 아이콘 위만).
        // 위젯 위 빈 공간 클릭은 안 되겠지만 attach 자체는 유지.
        const reason = e instanceof Error ? e.message : 'hook-install-failed';
        diagWarn('native-desktop', `mouse hook 설치 실패 (계속 진행): ${reason}`);
        mouseHook = null;
      }

      return { ok: true, mode: 'native-desktop' };
    },

    disable(): void {
      clearHandles();
    },

    updateWidgetBounds(window: BrowserWindow): void {
      // attach 상태가 아니면 캐시 갱신할 의미 없음.
      if (!handles) return;
      cachedPhysicalBounds = recalcPhysicalBounds(window);
      // Phase 7-C: widget이 이동/리사이즈되면 헤더 영역도 따라 이동 — 재계산.
      recalcHeaderRegionsPhysical(window);
      // Phase 7-D: resize 영역도 widget 자체 크기와 함께 변하므로 재계산.
      recalcResizeRegionsPhysical(window);
    },

    /**
     * Phase 7-D — renderer가 widget 가장자리 8개 edge resize handle의 DIP rect를 등록.
     *
     * dipRects 자체를 보존하고 즉시 physical 좌표 재계산. attach 안 된 상태에서도
     * dipRects는 보존되어 다음 enable 시 즉시 사용 가능.
     */
    setResizeRegions(regions: readonly ResizeRegion[], window: BrowserWindow): void {
      cachedResizeRegionsDip = regions;
      if (handles && cachedPhysicalBounds && !window.isDestroyed()) {
        recalcResizeRegionsPhysical(window);
        const summary = cachedResizeRegions
          .map((r) => `${r.edge}:(${r.rect.x},${r.rect.y},${r.rect.width}x${r.rect.height})`)
          .join(' ');
        diagLog(
          'native-desktop',
          `[7-D] resize regions updated: ${cachedResizeRegions.length} ${summary}`,
        );
      } else {
        cachedResizeRegions = [];
        diagLog(
          'native-desktop',
          `[7-D] resize regions cached but inactive (handles=${!!handles}, bounds=${!!cachedPhysicalBounds})`,
        );
      }
    },

    async healthCheck(window: BrowserWindow): Promise<DesktopWidgetModeStatus> {
      if (!handles) {
        return { ok: false, reason: 'not-enabled', fallbackMode: 'normal' };
      }

      const workerWAlive = win32.isWindowAlive(handles.workerW);
      const widgetAlive = win32.isWindowAlive(handles.widgetHwnd);

      if (workerWAlive && widgetAlive) {
        return { ok: true, mode: 'native-desktop' };
      }

      // workerW만 stale → Explorer 재시작 흔적. 재attach 시도.
      // widgetHwnd가 stale이면 위젯 창 자체가 destroy된 상황 → disable.
      if (!widgetAlive) {
        clearHandles();
        return { ok: false, reason: 'widget-destroyed', fallbackMode: 'normal' };
      }

      // workerW stale: 1회 재attach
      console.log('[desktopWidgetManager] workerW stale — 재attach 시도');
      clearHandles();

      let widgetHwnd: bigint;
      try {
        widgetHwnd = win32.getWidgetHwnd(window);
      } catch {
        return { ok: false, reason: 'widget-hwnd-failed', fallbackMode: 'normal' };
      }

      // 재attach: 최초 enable과 동일한 STRATEGY 우선순위 적용. 주기 호출이라 verbose 로그 미활성.
      try {
        const cands = win32.collectDesktopAttachCandidates();
        const attachResult = await tryAttachWithStrategies(win32, widgetHwnd, cands, {
          verbose: false,
        });
        if (attachResult.handles) {
          handles = attachResult.handles;
          return { ok: true, mode: 'native-desktop' };
        }
        const reason = attachResult.lastError
          ? `${attachResult.lastError.name}: ${attachResult.lastError.message}`
          : 'no-strategy-succeeded';
        console.warn('[desktopWidgetManager] healthCheck 재attach 실패:', reason);
        return { ok: false, reason: 'workerw-stale', fallbackMode: 'topmost' };
      } catch (e) {
        const reason = e instanceof Error ? e.message : 're-attach-failed';
        console.warn('[desktopWidgetManager] healthCheck 재attach 예외:', reason);
        return { ok: false, reason: 'workerw-stale', fallbackMode: 'topmost' };
      }
    },

    isEnabled(): boolean {
      return handles !== null;
    },

    focusForKeyboard(window: BrowserWindow): { ok: boolean; reason: string } {
      try {
        const widgetHwnd =
          handles && win32.isWindowAlive(handles.widgetHwnd)
            ? handles.widgetHwnd
            : win32.getWidgetHwnd(window);
        const result = win32.focusWidgetHwndForKeyboard(widgetHwnd);
        if (result.ok) {
          diagLog(
            'native-desktop',
            `[modal-input] focusForKeyboard ok: ${result.reason} ` +
              `widgetThread=${result.widgetThreadId ?? 'n/a'} ` +
              `foregroundThread=${result.foregroundThreadId ?? 'n/a'} ` +
              `focusAfter=${result.focusAfter ?? 'n/a'}`,
          );
        } else {
          diagWarn('native-desktop', `[modal-input] focusForKeyboard failed: ${result.reason}`);
        }
        return result;
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        diagWarn('native-desktop', `[modal-input] focusForKeyboard exception: ${reason}`);
        return { ok: false, reason };
      }
    },

    getCachedPhysicalBounds(): PhysicalRect | null {
      return cachedPhysicalBounds;
    },

    /**
     * Phase 6 — 16ms TTL 캐시 + LVM_HITTEST.
     *
     * 빠르게 종료되는 경로를 우선 — bounds 밖이면 즉시 false 반환.
     * 권한 실패(OpenProcessDeniedError) 발생 시 listView를 무효화해 추후 호출에서
     * 즉시 false (Electron이 처리) 경로로 빠지게 한다.
     */
    shouldPassThroughToDesktop(p: { x: number; y: number }): boolean {
      return passThroughCheck(p);
    },

    /**
     * Phase 7-C — renderer에서 헤더(`-webkit-app-region: drag`) DIP rect 등록.
     *
     * 새로운 dipRects를 보존하고 즉시 physical 좌표 재계산. attach 안 된 상태에서도
     * dipRects는 보존(다음 enable 시 사용 가능).
     *
     * Phase 7-C 회귀 fix: excludeDipRects도 함께 보존(헤더 우측 버튼 그룹).
     * isInDraggableHeaderRegion이 헤더 안 + exclude 밖일 때만 true 반환.
     */
    setHeaderRegions(
      dipRects: readonly DipRect[],
      window: BrowserWindow,
      excludeDipRects?: readonly DipRect[],
    ): void {
      cachedHeaderRegionsDip = dipRects;
      cachedHeaderExcludeRegionsDip = excludeDipRects ?? [];
      // attach 상태일 때만 physical 변환. 미attach면 빈 배열로 유지.
      if (handles && cachedPhysicalBounds && !window.isDestroyed()) {
        recalcHeaderRegionsPhysical(window);
        // 진단: 실제 변환 좌표 dump (회귀 디버깅).
        const dragSummary = cachedHeaderRegions
          .map((r) => `(${r.x},${r.y},${r.width}x${r.height})`)
          .join(' ');
        const exSummary = cachedHeaderExcludeRegions
          .map((r) => `(${r.x},${r.y},${r.width}x${r.height})`)
          .join(' ');
        diagLog(
          'native-desktop',
          `[7-C] header regions updated: drag=${cachedHeaderRegions.length} ${dragSummary} | exclude=${cachedHeaderExcludeRegions.length} ${exSummary}`,
        );
      } else {
        cachedHeaderRegions = [];
        cachedHeaderExcludeRegions = [];
        diagLog(
          'native-desktop',
          `[7-C] header regions cached but inactive (handles=${!!handles}, bounds=${!!cachedPhysicalBounds})`,
        );
      }
    },

    /**
     * 진단 라운드 (2026-05-06) — 이슈 B/D 가시화.
     *
     * widgetWin32:
     *   - widget HWND가 알려져 있으면 (cachedWidgetHwnd 또는 BrowserWindow에서 추출)
     *     snapshotWidgetWin32State 결과 반환.
     *   - 추출 실패 시 'unknown-hwnd' 반환.
     *
     * workerWLayout:
     *   - dumpWorkerWLayout 결과 — 매 호출마다 collectDesktopAttachCandidates 재실행.
     *     비싸지 않음(< 5ms typical).
     */
    diagnosticSnapshot(window: BrowserWindow): { widgetWin32: string; workerWLayout: string } {
      let widgetWin32 = 'unknown-hwnd';
      try {
        let hwnd = cachedWidgetHwnd;
        if (hwnd === 0n && !window.isDestroyed()) {
          hwnd = win32.getWidgetHwnd(window);
        }
        if (hwnd !== 0n) {
          widgetWin32 = win32.snapshotWidgetWin32State(hwnd);
        }
      } catch (e) {
        widgetWin32 = `snapshot-error: ${e instanceof Error ? e.message : String(e)}`;
      }
      let workerWLayout = 'unknown';
      try {
        workerWLayout = win32.dumpWorkerWLayout();
      } catch (e) {
        workerWLayout = `layout-error: ${e instanceof Error ? e.message : String(e)}`;
      }
      return { widgetWin32, workerWLayout };
    },

    getRoutingStats() {
      return { ...routingStats };
    },

    /**
     * Phase 7-G — main이 globalShortcut toggle 콜백을 등록.
     *
     * mouse hook callback이 widget bounds enter/leave 트랜지션을 감지하면 cb(true|false)를
     * 호출한다. main은 inside=true에서 register, false에서 unregister.
     *
     * null을 넘기면 콜백 해제 (lastHoverInside는 보존 — 다시 등록 시 enter/leave 이벤트가
     * 즉시 발사되도록 의도하지 않음, 다음 실제 트랜지션에서 발사).
     */
    setHoverCallback(cb: ((inside: boolean) => void) | null): void {
      hoverCallback = cb;
    },
  };
}

// ─── Phase 7-D 2차 fix 회귀 가드 — 순수 산식 헬퍼 (테스트 전용 export) ───
// inline resize 산식(line 962-994)과 동일 로직. 실제 hook callback 호출 없이
// 산식만 단독 검증하기 위해 추출. ADR-007/ADR-008 메타테스트 패턴.
export function computeResizeBounds(
  edge:
    | 'top'
    | 'bottom'
    | 'left'
    | 'right'
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right',
  start: { x: number; y: number; width: number; height: number },
  dx: number,
  dy: number,
  minW: number,
  minH: number,
): { x: number; y: number; width: number; height: number } {
  let newX = start.x;
  let newY = start.y;
  let newW = start.width;
  let newH = start.height;
  if (edge.includes('right')) newW = start.width + dx;
  if (edge.includes('bottom')) newH = start.height + dy;
  if (edge.includes('left')) {
    newX = start.x + dx;
    newW = start.width - dx;
  }
  if (edge.includes('top')) {
    newY = start.y + dy;
    newH = start.height - dy;
  }
  if (newW < minW) {
    if (edge.includes('left')) newX = start.x + start.width - minW;
    newW = minW;
  }
  if (newH < minH) {
    if (edge.includes('top')) newY = start.y + start.height - minH;
    newH = minH;
  }
  return { x: newX, y: newY, width: newW, height: newH };
}
