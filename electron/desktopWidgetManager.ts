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
import type { DesktopWidgetModeStatus, PhysicalRect } from './desktopWidgetTypes';
import { dipToPhysical } from './desktopWidgetTypes';
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

  // 16ms TTL 캐시 (Phase 6/7 — mouse hook hot path 성능)
  // 동일 좌표로 짧은 시간 안에 여러 번 호출되는 경우(드래그 중)에 유리.
  const HIT_CACHE_TTL_MS = 16;
  let lastHitX = Number.NaN;
  let lastHitY = Number.NaN;
  let lastHitResult = false;
  let lastHitUntil = 0;

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
    // hook을 먼저 정리해야 callback이 살아있는 동안 detach 발생을 피할 수 있음.
    clearHook();
    if (handles) {
      try {
        win32.detachFromWorkerW(handles);
      } catch (e) {
        // detach는 best-effort — 실패해도 무시
        console.warn('[desktopWidgetManager] detach 중 예외 (무시):', e);
      }
    }
    handles = null;
    cachedPhysicalBounds = null;
    cachedListView = null;
    // hit cache 초기화
    lastHitX = Number.NaN;
    lastHitY = Number.NaN;
    lastHitResult = false;
    lastHitUntil = 0;
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
    // 위젯 중심에 가장 가까운 디스플레이 — 멀티모니터 환경에서 정확한 scaleFactor 선택.
    const display = screen.getDisplayMatching(dipBounds);
    const scaleFactor = display.scaleFactor || 1;
    return dipToPhysical(dipBounds, scaleFactor);
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

      // 4. 초기 physical bounds 캐시 (Phase 5)
      cachedPhysicalBounds = recalcPhysicalBounds(window);

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
        mouseHook = win32.installLowLevelMouseHook((p) => {
          // hook callback hot path — passThroughCheck는 0.5ms 이내 반환.
          // 결과는 사용하지 않지만 호출함으로써 manager TTL 캐시가 데워진다.
          // 차단/주입은 하지 않으므로 라우팅 효과는 SetParent + Z-order에서만 비롯됨.
          passThroughCheck(p);
        });
      } catch (e) {
        // hook 설치 실패는 치명적이지 않다 (라우팅은 Z-order만으로도 동작).
        // 다만 사용자에게 noise 없이 로그만 남긴다.
        const reason = e instanceof Error ? e.message : 'hook-install-failed';
        console.warn('[desktopWidgetManager] mouse hook 설치 실패 (계속 진행):', reason);
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
  };
}
