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
import type { DesktopWidgetModeStatus, DipRect, DragState, PhysicalRect } from './desktopWidgetTypes';
import { dipToPhysical, isInsideAnyRect } from './desktopWidgetTypes';
import { diagLog, diagWarn } from './nativeDesktopDiag';

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
      diagWarn('native-desktop', `FFI PID 불일치 (ffi=${pidFromFFI}, node=${process.pid}) — no-op fallback`);
      return createNoopManager('koffi-pid-mismatch');
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'unknown-error';
    const code = e instanceof Error && e.name === 'KoffiLoadError' ? 'koffi-load-failed' : 'native-load-failed';
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
      return {
        sent: 0,
        skippedIcon: 0,
        skippedOutOfBounds: 0,
        skippedAbove: 0,
        failed: 0,
        totalCallbacks: 0,
      };
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
function createWin32Manager(
  win32: typeof import('./platform/win32Desktop'),
): DesktopWidgetManager {
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
   * Phase 7-A (재시도): 라우팅 방식 토글.
   *
   * - 'send-input-event' (기본값): Electron webContents.sendInputEvent 사용. Chromium renderer가
   *   native 이벤트와 동등하게 처리.
   * - 'post-message' (legacy fallback): Win32 PostMessageW로 widget HWND에 직접 송신.
   *   Electron 버전이나 환경에서 sendInputEvent가 실패할 가능성 대비 보존.
   *
   * 환경변수 SSAMPIN_NATIVE_DESKTOP_ROUTING으로 디버그 시 'post-message'로 강제 가능.
   * 정식 빌드에선 'send-input-event'만 사용.
   */
  const routingMethod: 'send-input-event' | 'post-message' = (() => {
    const envVal = process.env.SSAMPIN_NATIVE_DESKTOP_ROUTING;
    if (envVal === 'post-message') return 'post-message';
    return 'send-input-event';
  })();
  /**
   * Phase 7-A: 라우팅 통계 — 디버그용 카운터. 빈번하게 갱신되지만 atomic 증가만 하므로 hot path 영향 없음.
   * sent/skipped(아이콘)/skipped(영역밖)/failed 4분류.
   *
   * Phase 7-A 재시도: 'posted' → 'sent'로 명명 통일 (sendInputEvent와 PostMessage 둘 다 포함).
   *
   * Phase 7-stable: skippedAbove 추가 — 다른 윈도우(브라우저/탐색기 등)가 z-order로 위에 있어
   *   라우팅을 의도적으로 skip한 카운트. 정상 동작에서는 위젯 위에서만 0이 아니어야 함.
   */
  let routingStats = {
    sent: 0,
    skippedIcon: 0,
    skippedOutOfBounds: 0,
    skippedAbove: 0,
    failed: 0,
    totalCallbacks: 0,
  };
  let firstCallbackLogged = false;
  let statsTimer: NodeJS.Timeout | null = null;

  // 16ms TTL 캐시 (Phase 6/7 — mouse hook hot path 성능)
  // 동일 좌표로 짧은 시간 안에 여러 번 호출되는 경우(드래그 중)에 유리.
  const HIT_CACHE_TTL_MS = 16;
  let lastHitX = Number.NaN;
  let lastHitY = Number.NaN;
  let lastHitResult = false;
  let lastHitUntil = 0;

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
    routingStats = {
      sent: 0,
      skippedIcon: 0,
      skippedOutOfBounds: 0,
      skippedAbove: 0,
      failed: 0,
      totalCallbacks: 0,
    };
    firstCallbackLogged = false;
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
  }

  // Phase 7 — hot path. shouldPassThroughToDesktop을 별도 명명 함수로 분리해 hook callback에서
  // 안정적으로 reference 가능하게 한다 (this 바인딩 회피).
  function passThroughCheck(p: { x: number; y: number }): boolean {
    if (!handles || !cachedListView) return false;
    if (!isInsideCachedBoundsLocal(p)) return false;

    const now = Date.now();
    if (
      p.x === lastHitX
      && p.y === lastHitY
      && now < lastHitUntil
    ) {
      return lastHitResult;
    }

    let hit = false;
    try {
      hit = win32.lvmHitTest(cachedListView, p);
    } catch (e) {
      if (e instanceof Error) {
        console.warn(`[desktopWidgetManager] lvmHitTest 실패 (${e.name}): ${e.message} — listView 무효화`);
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
    return (
      p.x >= r.x
      && p.x < r.x + r.width
      && p.y >= r.y
      && p.y < r.y + r.height
    );
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

  return {
    async enable(window: BrowserWindow): Promise<DesktopWidgetModeStatus> {
      diagLog('native-desktop', 'win32 manager enable() invoked');
      // 중복 호출 방어: 이미 attach 상태면 healthCheck로 위임.
      if (handles) {
        const valid = win32.isWindowAlive(handles.workerW)
          && win32.isWindowAlive(handles.widgetHwnd);
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
        diagLog('native-desktop', `step2 candidates: standardWorkerWs=${candidates.standardWorkerWs.length}, shellDefViewSibling=${candidates.shellDefViewSiblingWorkerW === 0n ? 'NONE' : '0x' + candidates.shellDefViewSiblingWorkerW.toString(16)}, shellDefView=${candidates.shellDefView === 0n ? 'NONE' : '0x' + candidates.shellDefView.toString(16)}`);
      } catch (e) {
        const reason = e instanceof Error ? e.message : 'collectDesktopAttachCandidates-failed';
        diagWarn('native-desktop', `attach 후보 수집 실패: ${reason}`);
        return { ok: false, reason: 'workerw-not-found', fallbackMode: 'normal' };
      }

      // 3. STRATEGY 우선순위로 attach 시도. 첫 성공한 후보 사용.
      let lastError: Error | null = null;

      // STRATEGY 1: 표준 WorkerW (SHELLDLL_DefView 자식 보유)
      for (const candidate of candidates.standardWorkerWs) {
        diagLog('native-desktop', `STRATEGY1: 표준 WorkerW=0x${candidate.toString(16)} attach 시도`);
        try {
          handles = await win32.attachToWorkerW(widgetHwnd, candidate);
          diagLog('native-desktop', `STRATEGY1: SUCCESS — prevParent=0x${handles.prevParent.toString(16)}, prevExStyle=0x${handles.prevExStyle.toString(16)}`);
          break;
        } catch (e) {
          lastError = e instanceof Error ? e : new Error(String(e));
          diagWarn('native-desktop', `STRATEGY1: 0x${candidate.toString(16)} 거부 (${lastError.name}: ${lastError.message})`);
        }
      }

      // STRATEGY 2: SHELLDLL_DefView sibling WorkerW (Wallpaper Engine 패턴)
      if (!handles && candidates.shellDefViewSiblingWorkerW !== 0n) {
        const sibling = candidates.shellDefViewSiblingWorkerW;
        diagLog('native-desktop', `STRATEGY2: sibling WorkerW=0x${sibling.toString(16)} attach 시도`);
        try {
          handles = await win32.attachToWorkerW(widgetHwnd, sibling);
          diagLog('native-desktop', `STRATEGY2: SUCCESS — prevParent=0x${handles.prevParent.toString(16)}, prevExStyle=0x${handles.prevExStyle.toString(16)}`);
        } catch (e) {
          lastError = e instanceof Error ? e : new Error(String(e));
          diagWarn('native-desktop', `STRATEGY2: 0x${sibling.toString(16)} 거부 (${lastError.name}: ${lastError.message})`);
        }
      }

      // STRATEGY 3: SHELLDLL_DefView 자체 (Progman 직속 SHELLDLL_DefView 환경)
      if (!handles && candidates.shellDefView !== 0n) {
        const shellDef = candidates.shellDefView;
        diagLog('native-desktop', `STRATEGY3: SHELLDLL_DefView=0x${shellDef.toString(16)} 자체 attach 시도`);
        try {
          handles = await win32.attachToShellDefView(widgetHwnd, shellDef);
          diagLog('native-desktop', `STRATEGY3: SUCCESS — prevParent=0x${handles.prevParent.toString(16)}, prevExStyle=0x${handles.prevExStyle.toString(16)}`);
        } catch (e) {
          lastError = e instanceof Error ? e : new Error(String(e));
          diagWarn('native-desktop', `STRATEGY3: 0x${shellDef.toString(16)} 거부 (${lastError.name}: ${lastError.message})`);
        }
      }

      if (!handles) {
        // 모든 strategy 실패 → normal fallback (사용자 의도 보존).
        //
        // 정책 변경(G2-bis): 이전에는 'topmost'로 fallback했으나 사용자가 native-desktop을
        // 명시 선택한 의도와 정반대(아래로 → 위로)라 혼란을 야기했다. 'normal'로 변경하면
        // 위젯이 일반 창처럼 동작하고, 호출자(main.ts)가 토스트로 안내한다.
        // healthCheck 단계의 fallback은 이미 attach 됐다 깨진 케이스라 'topmost' 유지가 안전 (안 보이는 것보단 낫다).
        const reason = lastError ? `${lastError.name}: ${lastError.message}` : 'no-strategy-succeeded';
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
      diagLog('native-desktop', `Phase 7-A: routingMethod='${routingMethod}', BrowserWindow 캐시 완료, headerRegions=${cachedHeaderRegions.length}`);

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
            diagLog('native-desktop', `[7-A] hook 첫 callback 호출됨 — msgType=0x${msgType.toString(16)} screen=(${p.x},${p.y})`);
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
              const newX = dragState.startWidget.x + dx;
              const newY = dragState.startWidget.y + dy;
              dragState.moveCount = (dragState.moveCount ?? 0) + 1;
              try {
                const moveOk = win32.moveWidget(
                  cachedWidgetHwnd,
                  newX,
                  newY,
                  dragState.startBounds.width,
                  dragState.startBounds.height,
                );
                // 진단: 매 30번째 MOUSEMOVE마다 진행 상황 dump (전체 누적이 아닌 sampling).
                if (dragState.moveCount % 30 === 1) {
                  diagLog(
                    'native-desktop',
                    `[7-C] drag move #${dragState.moveCount} mouse=(${p.x},${p.y}) delta=(${dx},${dy}) newPos=(${newX},${newY}) moveOk=${moveOk} hwnd=0x${cachedWidgetHwnd.toString(16)}`,
                  );
                }
              } catch (e) {
                diagWarn('native-desktop', `[7-C] drag move 실패: ${e instanceof Error ? e.message : String(e)}`);
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
              diagLog(
                'native-desktop',
                `[7-C] drag end mouse=(${p.x},${p.y}) totalDelta=(${finalDx},${finalDy})`,
              );
              dragState = null;
              // BrowserWindow.getBounds()는 SetWindowPos 후 즉시 반영되므로 cachedPhysicalBounds도
              // 갱신해야 다음 click 라우팅이 새 위치 기준으로 정확히 동작.
              if (cachedWidgetWindow && !cachedWidgetWindow.isDestroyed()) {
                cachedPhysicalBounds = recalcPhysicalBounds(cachedWidgetWindow);
                recalcHeaderRegionsPhysical(cachedWidgetWindow);
              }
              // ★ Explorer rubber band 종료 차단: BUTTONUP도 흡수.
              return true;
            }
            // 다른 버튼/메시지가 drag 중에 들어오면 일단 무시 (drag 우선) + 차단.
            return true;
          }

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

          // ─── Phase 7-C — Header LBUTTONDOWN으로 drag 시작 ───
          // 우선순위: bounds 안 + 헤더 영역 안 + 아이콘 위 아님 → drag 시작.
          // 아이콘 위는 passThroughCheck로 Explorer가 처리하도록 양보 (아래 분기).
          // 헤더가 아닌 일반 위젯 영역의 LBUTTONDOWN은 정상 sendInputEvent로 흘러감.
          // 0x0201 = WM_LBUTTONDOWN
          // ─── 진단: LBUTTONDOWN 좌표가 어떤 region에 들어왔는지 ───
          // drag 안 됨 회귀 디버깅용. 모든 LBUTTONDOWN을 1회 로그.
          if (msgType === 0x0201) {
            const inDrag = isInsideAnyRect(p, cachedHeaderRegions);
            const inExclude = isInsideAnyRect(p, cachedHeaderExcludeRegions);
            const draggable = isInDraggableHeaderRegion(p);
            diagLog(
              'native-desktop',
              `[7-C] LBUTTONDOWN screen=(${p.x},${p.y}) inDrag=${inDrag} inExclude=${inExclude} draggable=${draggable} cachedDrag=${cachedHeaderRegions.length} cachedExclude=${cachedHeaderExcludeRegions.length}`,
            );
          }
          if (msgType === 0x0201 && cachedHeaderRegions.length > 0 && isInDraggableHeaderRegion(p)) {
            // 아이콘 영역 체크 — 헤더는 보통 위젯 상단이라 아이콘과 안 겹치지만 안전 차단.
            if (!passThroughCheck(p) && cachedPhysicalBounds) {
              dragState = {
                active: true,
                startMouse: { x: p.x, y: p.y },
                startWidget: { x: cachedPhysicalBounds.x, y: cachedPhysicalBounds.y },
                startBounds: cachedPhysicalBounds,
              };
              diagLog(
                'native-desktop',
                `[7-C] drag start mouse=(${p.x},${p.y}) widget=(${cachedPhysicalBounds.x},${cachedPhysicalBounds.y}) size=(${cachedPhysicalBounds.width}x${cachedPhysicalBounds.height})`,
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
              diagLog('native-desktop', `[7-A] skip-icon msg=0x${msgType.toString(16)} screen=(${p.x},${p.y})`);
            }
            return;
          }
          if (!cachedPhysicalBounds) return;
          const client = win32.physicalToClient(p, cachedPhysicalBounds);

          if (routingMethod === 'send-input-event') {
            // ─── 정통 패턴: webContents.sendInputEvent ───
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
            // bounds.scaleFactor를 매번 조회하지 않기 위해 hot path 캐시는 다음 라운드에. 현 단계에선 정확성 우선.
            const dipBounds = win.getBounds();
            const widthRatio = cachedPhysicalBounds.width === 0
              ? 1
              : dipBounds.width / cachedPhysicalBounds.width;
            const heightRatio = cachedPhysicalBounds.height === 0
              ? 1
              : dipBounds.height / cachedPhysicalBounds.height;
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
              // Win32 wheel delta 부호 ↔ Chromium deltaY 부호:
              //   - WM_MOUSEWHEEL 양수 = 휠 위로 (사용자가 멀리 밀기) → Chromium에서 콘텐츠는 아래로 움직여
              //     사용자가 위쪽 콘텐츠를 보게 됨 → Chromium deltaY 음수.
              //   - 따라서 Chromium 컨벤션 맞춤: deltaY = -delta.
              //   - WM_MOUSEHWHEEL은 deltaX 매핑. Chromium deltaX는 양수=오른쪽 스크롤,
              //     Win32 양수=오른쪽 회전 → 부호 일치.
              // ※ 실기 검증에서 부호가 반대로 느껴지면 deltaY 부호 정책 재조정 필요.
              const deltaX = axis === 'horizontal' ? delta : 0;
              const deltaY = axis === 'vertical' ? -delta : 0;
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
                  `[7-B] sendInput wheel msg=0x${msgType.toString(16)} axis=${axis} delta=${delta} dip=(${dipX},${dipY})`,
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
          } else {
            // ─── Legacy fallback: PostMessageW ───
            // 환경변수 SSAMPIN_NATIVE_DESKTOP_ROUTING=post-message 로 켰을 때만 도달.
            // Chromium 무시 가능성 있음 (사용자 검증 결과). 디버깅용으로만 유지.
            if (cachedWidgetHwnd === 0n) return;

            // Phase 7-B: PostMessage 경로의 wheel encoding.
            //   wParam HIWORD에 wheel delta (signed short), LOWORD에 fwKeys (button/modifier flags, 0=none)
            //   lParam에 screen coordinate (LOWORD=x, HIWORD=y) — *주의*: WM_MOUSEWHEEL은 client가 아니라 screen coord
            //   (MSDN: "The low-order word specifies the x-coordinate of the pointer, relative to
            //   the upper-left corner of the screen.")
            // 본 단계에서는 fallback 경로이므로 client 좌표 그대로 넘기고(잘못 동작해도 fallback일 뿐),
            // PostMessageW 자체는 실패하지 않도록 wheel delta 부호만 살려 wParam에 packing.
            if (msgType === 0x020a /* WM_MOUSEWHEEL */ || msgType === 0x020e /* WM_MOUSEHWHEEL */) {
              const delta = win32.decodeWheelDelta(mouseData);
              // wParam HIWORD에 delta (16-bit signed → unsigned 16-bit로 packing).
              // LOWORD = 0 (no key/button flags).
              const wParamPacked = ((delta & 0xffff) << 16) >>> 0;
              // lParam은 screen coord 사용. MOUSEWHEEL의 lParam은 screen이지만 fallback 정확성 깊이 X.
              const sx = (p.x | 0) & 0xffff;
              const sy = (p.y | 0) & 0xffff;
              const lparamPacked = ((sy << 16) | sx) >>> 0;
              try {
                // postMouseMessageToWidget의 lParam encoding은 client용이라 wheel에 부적합.
                // 직접 PostMessage가 필요하지만 현 인터페이스에 노출 안 됨 → fallback이라 best-effort.
                // 정밀하게 송신하려면 별도 win32 helper 필요. 본 단계에선 통과시키고 stats만 기록.
                void wParamPacked;
                void lparamPacked;
                routingStats.failed++;
                diagWarn(
                  'native-desktop',
                  `[7-B] post-message fallback에서 wheel 라우팅은 미구현 (axis=${msgType === 0x020a ? 'V' : 'H'} delta=${delta})`,
                );
              } catch {
                routingStats.failed++;
              }
              return;
            }

            const ok = win32.postMouseMessageToWidget(
              cachedWidgetHwnd,
              msgType,
              client.x,
              client.y,
              mouseData,
            );
            if (ok) {
              routingStats.sent++;
              if (msgType !== 0x0200) {
                diagLog(
                  'native-desktop',
                  `[7-A] postMsg msg=0x${msgType.toString(16)} client=(${client.x},${client.y})`,
                );
              }
            } else {
              routingStats.failed++;
              if (msgType !== 0x0200) {
                diagWarn(
                  'native-desktop',
                  `[7-A] postMsg 실패 msg=0x${msgType.toString(16)} client=(${client.x},${client.y})`,
                );
              }
            }
          }
        });
        diagLog('native-desktop', `Phase 7-A: mouse hook 설치 완료 — routing 활성 (method='${routingMethod}')`);
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

      // 재attach: 최초 enable과 동일한 STRATEGY 우선순위 적용.
      try {
        const cands = win32.collectDesktopAttachCandidates();
        let lastError: Error | null = null;

        for (const c of cands.standardWorkerWs) {
          try {
            handles = await win32.attachToWorkerW(widgetHwnd, c);
            return { ok: true, mode: 'native-desktop' };
          } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e));
          }
        }
        if (cands.shellDefViewSiblingWorkerW !== 0n) {
          try {
            handles = await win32.attachToWorkerW(widgetHwnd, cands.shellDefViewSiblingWorkerW);
            return { ok: true, mode: 'native-desktop' };
          } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e));
          }
        }
        if (cands.shellDefView !== 0n) {
          try {
            handles = await win32.attachToShellDefView(widgetHwnd, cands.shellDefView);
            return { ok: true, mode: 'native-desktop' };
          } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e));
          }
        }

        const reason = lastError ? `${lastError.name}: ${lastError.message}` : 'no-strategy-succeeded';
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
        const dragSummary = cachedHeaderRegions.map(r => `(${r.x},${r.y},${r.width}x${r.height})`).join(' ');
        const exSummary = cachedHeaderExcludeRegions.map(r => `(${r.x},${r.y},${r.width}x${r.height})`).join(' ');
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
  };
}
