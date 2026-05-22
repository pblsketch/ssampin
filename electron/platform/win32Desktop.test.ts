/**
 * win32Desktop FFI 안전성 단위 테스트.
 *
 * 본 테스트는 koffi 또는 Win32 시스템 라이브러리에 접근하지 않는 경로만 검증한다:
 *   - error class shape
 *   - null/0 핸들 입력 시 throw 없이 false/null 반환
 *
 * 실제 koffi 호출 경로는 Windows 실기 검증에 의존한다.
 */

import { describe, it, expect } from 'vitest';
import {
  KoffiLoadError,
  WorkerWNotFoundError,
  AttachFailedError,
  OpenProcessDeniedError,
  RemoteMemoryError,
  HookInstallError,
  isWindowAlive,
  findDesktopListView,
  attachToShellDefView,
  collectDesktopAttachCandidates,
  isMouseMessageOfInterest,
  physicalToClient,
  postMouseMessageToWidget,
  mapWin32MsgToElectronEvent,
  mapWin32MsgToButton,
  mapWin32MsgToClickCount,
  decodeWheelDelta,
  mapWin32MsgToWheelAxis,
  computeWheelDeltas,
  moveWidget,
  isWidgetOrAncestor,
} from './win32Desktop';

describe('win32Desktop error classes', () => {
  it('KoffiLoadError은 name이 "KoffiLoadError"', () => {
    const e = new KoffiLoadError('msg');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('KoffiLoadError');
    expect(e.message).toBe('msg');
  });

  it('WorkerWNotFoundError은 name이 "WorkerWNotFoundError"', () => {
    const e = new WorkerWNotFoundError('msg');
    expect(e.name).toBe('WorkerWNotFoundError');
  });

  it('AttachFailedError은 name이 "AttachFailedError"', () => {
    const e = new AttachFailedError('msg');
    expect(e.name).toBe('AttachFailedError');
  });

  it('OpenProcessDeniedError은 name이 "OpenProcessDeniedError"', () => {
    const e = new OpenProcessDeniedError('msg');
    expect(e.name).toBe('OpenProcessDeniedError');
  });

  it('RemoteMemoryError은 name이 "RemoteMemoryError"', () => {
    const e = new RemoteMemoryError('msg');
    expect(e.name).toBe('RemoteMemoryError');
  });

  it('HookInstallError은 name이 "HookInstallError"', () => {
    const e = new HookInstallError('msg');
    expect(e.name).toBe('HookInstallError');
  });
});

describe('win32Desktop null-handle safety', () => {
  it('isWindowAlive(0n) → false (throw 없음)', () => {
    expect(isWindowAlive(0n)).toBe(false);
  });

  it('findDesktopListView(0n) → null (throw 없음)', () => {
    expect(findDesktopListView(0n)).toBeNull();
  });
});

describe('win32Desktop new strategy API exports (G2 게이트 후속)', () => {
  it('collectDesktopAttachCandidates는 함수로 export된다', () => {
    expect(typeof collectDesktopAttachCandidates).toBe('function');
  });

  it('attachToShellDefView는 함수로 export된다 (STRATEGY 3)', () => {
    expect(typeof attachToShellDefView).toBe('function');
  });

  it('attachToShellDefView(0n, 0n)은 AttachFailedError로 reject (Promise)', async () => {
    if (process.platform !== 'win32') {
      // 비Win32에선 koffi load 자체가 실패해 KoffiLoadError. 본 검증 스킵.
      return;
    }
    await expect(attachToShellDefView(0n, 0n)).rejects.toBeInstanceOf(AttachFailedError);
  });
});

describe('win32Desktop G2-bis (WS_POPUP→WS_CHILD 전환)', () => {
  // Win32DesktopHandles의 prevStyle 필드는 attach 시 캡처되어야 한다.
  // 본 테스트는 type shape만 검증 — 실제 attach는 Win32 환경에서만 가능.
  it('Win32DesktopHandles 타입은 prevStyle: bigint 필드를 포함한다', () => {
    // 컴파일 타임 타입 체크 — 본 구문이 tsc 통과하면 필드 존재 보장.
    const sample: import('./win32Desktop').Win32DesktopHandles = {
      workerW: 0n,
      widgetHwnd: 0n,
      prevParent: 0n,
      prevExStyle: 0n,
      prevStyle: 0n,
    };
    expect(sample.prevStyle).toBe(0n);
  });

  it('WS_POPUP→WS_CHILD 비트 변환 산술 — 다른 스타일 비트는 보존', () => {
    // 32-bit unsigned로 가정하되 BigInt 연산.
    const WS_POPUP = 0x80000000n;
    const WS_CHILD = 0x40000000n;
    const WS_VISIBLE = 0x10000000n;
    const WS_CLIPSIBLINGS = 0x04000000n;

    // BrowserWindow가 transparent+frame:false일 때 일반적인 style 조합.
    const original = WS_POPUP | WS_VISIBLE | WS_CLIPSIBLINGS;
    expect(original & WS_POPUP).toBe(WS_POPUP);
    expect(original & WS_CHILD).toBe(0n);

    const transformed = (original & ~WS_POPUP) | WS_CHILD;

    expect(transformed & WS_POPUP).toBe(0n); // WS_POPUP 제거 확인
    expect(transformed & WS_CHILD).toBe(WS_CHILD); // WS_CHILD 추가 확인
    expect(transformed & WS_VISIBLE).toBe(WS_VISIBLE); // WS_VISIBLE 보존
    expect(transformed & WS_CLIPSIBLINGS).toBe(WS_CLIPSIBLINGS); // WS_CLIPSIBLINGS 보존
  });

  it('이미 WS_CHILD인 윈도우에 변환을 적용해도 idempotent하다 (no-op)', () => {
    const WS_POPUP = 0x80000000n;
    const WS_CHILD = 0x40000000n;
    const original = WS_CHILD | 0x10000000n; // 이미 child

    const transformed = (original & ~WS_POPUP) | WS_CHILD;

    expect(transformed).toBe(original); // 변경 없음
  });
});

// ────────────────────────────────────────────────────────────
// Phase 7-A: Mouse routing helpers
// ────────────────────────────────────────────────────────────

describe('Phase 7-A — isMouseMessageOfInterest', () => {
  it('Phase 7-A 관심 메시지 8종 모두 true 반환', () => {
    // WM_LBUTTONDOWN, UP, DBLCLK
    expect(isMouseMessageOfInterest(0x0201)).toBe(true);
    expect(isMouseMessageOfInterest(0x0202)).toBe(true);
    expect(isMouseMessageOfInterest(0x0203)).toBe(true);
    // WM_RBUTTONDOWN, UP
    expect(isMouseMessageOfInterest(0x0204)).toBe(true);
    expect(isMouseMessageOfInterest(0x0205)).toBe(true);
    // WM_MBUTTONDOWN, UP
    expect(isMouseMessageOfInterest(0x0207)).toBe(true);
    expect(isMouseMessageOfInterest(0x0208)).toBe(true);
    // WM_MOUSEMOVE
    expect(isMouseMessageOfInterest(0x0200)).toBe(true);
  });

  it('Phase 7-B WHEEL 메시지 2종 (WM_MOUSEWHEEL/WM_MOUSEHWHEEL)도 true 반환', () => {
    expect(isMouseMessageOfInterest(0x020a)).toBe(true); // WM_MOUSEWHEEL
    expect(isMouseMessageOfInterest(0x020e)).toBe(true); // WM_MOUSEHWHEEL
  });

  it('다음 phase로 분리된 메시지는 false (NC*/RBUTTONDBLCLK 등)', () => {
    // WM_NCLBUTTONDOWN (Phase 7-C)
    expect(isMouseMessageOfInterest(0x00a1)).toBe(false);
    // WM_NCMOUSEMOVE (Phase 7-D)
    expect(isMouseMessageOfInterest(0x00a0)).toBe(false);
    // WM_RBUTTONDBLCLK는 본 단계에서 미포함 (한국어 키보드/한자 변환 등 비주류 경로 — 추후 추가 가능)
    expect(isMouseMessageOfInterest(0x0206)).toBe(false);
    // WM_MBUTTONDBLCLK 미포함
    expect(isMouseMessageOfInterest(0x0209)).toBe(false);
  });

  it('완전 무관한 메시지(0, WM_PAINT 등)도 false', () => {
    expect(isMouseMessageOfInterest(0)).toBe(false);
    expect(isMouseMessageOfInterest(0x000f)).toBe(false); // WM_PAINT
    expect(isMouseMessageOfInterest(0xffff)).toBe(false);
  });
});

describe('Phase 7-A — physicalToClient', () => {
  it('widget 좌상단 (0,0)이면 physical = client', () => {
    expect(physicalToClient({ x: 100, y: 200 }, { x: 0, y: 0 })).toEqual({ x: 100, y: 200 });
  });

  it('widget bounds.x/y만큼 빼서 client coord 변환', () => {
    expect(physicalToClient({ x: 1000, y: 800 }, { x: 800, y: 600 })).toEqual({ x: 200, y: 200 });
  });

  it('physical이 widget 영역 밖이면 음수 client (Win32에서도 합법)', () => {
    expect(physicalToClient({ x: 50, y: 100 }, { x: 100, y: 100 })).toEqual({ x: -50, y: 0 });
  });

  it('multi-monitor: 두 번째 모니터(음수 x)에 widget이 있어도 정확히 변환', () => {
    // primary 우측 (-1920, 0)에 second monitor가 있는 환경
    const widgetBounds = { x: -1500, y: 100 };
    const physicalCursor = { x: -1400, y: 250 };
    expect(physicalToClient(physicalCursor, widgetBounds)).toEqual({ x: 100, y: 150 });
  });

  it('실수 좌표가 들어와도 그대로 빼기 (반올림은 caller 책임)', () => {
    expect(physicalToClient({ x: 100.5, y: 200.5 }, { x: 50.25, y: 100.75 })).toEqual({
      x: 50.25,
      y: 99.75,
    });
  });
});

describe('Phase 7-A — postMouseMessageToWidget null/safety', () => {
  it('null handle(0n)이면 즉시 false (PostMessageW 호출 안 함)', () => {
    expect(postMouseMessageToWidget(0n, 0x0201, 100, 50, 0)).toBe(false);
  });

  it('mouseData 인자 미전달 시 default 0으로 동작 (throw 없음)', () => {
    // 실제 Win32 호출은 안 일어남 (handle 0n에서 early return). 시그너처 호환만 검증.
    expect(() => postMouseMessageToWidget(0n, 0x0200, 0, 0)).not.toThrow();
  });
});

// ────────────────────────────────────────────────────────────
// Phase 7-A 재시도: Electron sendInputEvent 매핑
// ────────────────────────────────────────────────────────────

describe('Phase 7-A 재시도 — mapWin32MsgToElectronEvent', () => {
  it('mouseDown 매핑 — LBUTTONDOWN/RBUTTONDOWN/MBUTTONDOWN/LBUTTONDBLCLK', () => {
    expect(mapWin32MsgToElectronEvent(0x0201)).toBe('mouseDown'); // WM_LBUTTONDOWN
    expect(mapWin32MsgToElectronEvent(0x0204)).toBe('mouseDown'); // WM_RBUTTONDOWN
    expect(mapWin32MsgToElectronEvent(0x0207)).toBe('mouseDown'); // WM_MBUTTONDOWN
    expect(mapWin32MsgToElectronEvent(0x0203)).toBe('mouseDown'); // WM_LBUTTONDBLCLK
  });

  it('mouseUp 매핑 — LBUTTONUP/RBUTTONUP/MBUTTONUP', () => {
    expect(mapWin32MsgToElectronEvent(0x0202)).toBe('mouseUp'); // WM_LBUTTONUP
    expect(mapWin32MsgToElectronEvent(0x0205)).toBe('mouseUp'); // WM_RBUTTONUP
    expect(mapWin32MsgToElectronEvent(0x0208)).toBe('mouseUp'); // WM_MBUTTONUP
  });

  it('mouseMove 매핑 — WM_MOUSEMOVE', () => {
    expect(mapWin32MsgToElectronEvent(0x0200)).toBe('mouseMove');
  });

  it('매핑 불가 메시지 → null', () => {
    // WM_MOUSEWHEEL/WM_MOUSEHWHEEL은 Phase 7-B에서 'mouseWheel'로 매핑됨 (별도 테스트)
    expect(mapWin32MsgToElectronEvent(0x00a1)).toBeNull(); // WM_NCLBUTTONDOWN
    expect(mapWin32MsgToElectronEvent(0)).toBeNull();
    expect(mapWin32MsgToElectronEvent(0xffff)).toBeNull();
  });

  it('isMouseMessageOfInterest이 true인 메시지 8종은 모두 mapping 가능 (null 아님)', () => {
    const interesting = [0x0200, 0x0201, 0x0202, 0x0203, 0x0204, 0x0205, 0x0207, 0x0208];
    for (const msg of interesting) {
      expect(isMouseMessageOfInterest(msg)).toBe(true);
      expect(mapWin32MsgToElectronEvent(msg)).not.toBeNull();
    }
  });
});

describe('Phase 7-A 재시도 — mapWin32MsgToButton', () => {
  it("좌측: LBUTTONDOWN/UP/DBLCLK + MOUSEMOVE → 'left'", () => {
    expect(mapWin32MsgToButton(0x0201)).toBe('left'); // LBUTTONDOWN
    expect(mapWin32MsgToButton(0x0202)).toBe('left'); // LBUTTONUP
    expect(mapWin32MsgToButton(0x0203)).toBe('left'); // LBUTTONDBLCLK
    expect(mapWin32MsgToButton(0x0200)).toBe('left'); // MOUSEMOVE (의미 없지만 안전 기본값)
  });

  it("우측: RBUTTONDOWN/UP → 'right'", () => {
    expect(mapWin32MsgToButton(0x0204)).toBe('right'); // RBUTTONDOWN
    expect(mapWin32MsgToButton(0x0205)).toBe('right'); // RBUTTONUP
  });

  it("휠클릭: MBUTTONDOWN/UP → 'middle'", () => {
    expect(mapWin32MsgToButton(0x0207)).toBe('middle'); // MBUTTONDOWN
    expect(mapWin32MsgToButton(0x0208)).toBe('middle'); // MBUTTONUP
  });

  it("매핑 불가 메시지도 안전하게 'left' 기본값", () => {
    // hot path 안전성 — switch/case 누락이 아닌 default 분기 검증
    expect(mapWin32MsgToButton(0xffff)).toBe('left');
    expect(mapWin32MsgToButton(0)).toBe('left');
  });
});

describe('Phase 7-A 재시도 — mapWin32MsgToClickCount', () => {
  it('WM_LBUTTONDBLCLK → 2', () => {
    expect(mapWin32MsgToClickCount(0x0203)).toBe(2);
  });

  it('단일 클릭/이동 → 1', () => {
    expect(mapWin32MsgToClickCount(0x0201)).toBe(1); // LBUTTONDOWN
    expect(mapWin32MsgToClickCount(0x0202)).toBe(1); // LBUTTONUP
    expect(mapWin32MsgToClickCount(0x0204)).toBe(1); // RBUTTONDOWN
    expect(mapWin32MsgToClickCount(0x0200)).toBe(1); // MOUSEMOVE
  });
});

describe('Phase 7-A — lParam 16-bit packing 산술', () => {
  // postMouseMessageToWidget 내부의 lparam = ((cy & 0xFFFF) << 16) | (cx & 0xFFFF) 산술 검증.
  // 실제 PostMessage 호출 없이 packing 결과만 확인 — Phase 7-B에서 NC* 메시지 추가 시
  // 동일 packing 패턴을 재사용한다.
  it('client (100, 50)의 lParam encoding은 (50 << 16) | 100', () => {
    const cx = 100,
      cy = 50;
    const lparam = ((cy & 0xffff) << 16) | (cx & 0xffff);
    expect(lparam).toBe((50 << 16) | 100);
    // low word
    expect(lparam & 0xffff).toBe(100);
    // high word
    expect((lparam >> 16) & 0xffff).toBe(50);
  });

  it('음수 client coord도 16-bit signed로 두 word 모두 잘 packing', () => {
    const cx = -10,
      cy = -5;
    const lparam = ((cy & 0xffff) << 16) | (cx & 0xffff);
    // -10의 16-bit 보수: 0xFFF6
    expect(lparam & 0xffff).toBe(0xfff6);
    // -5의 16-bit 보수: 0xFFFB
    expect((lparam >>> 16) & 0xffff).toBe(0xfffb);
  });
});

// ────────────────────────────────────────────────────────────
// Phase 7-B: Wheel routing helpers
// ────────────────────────────────────────────────────────────

describe('Phase 7-B — decodeWheelDelta', () => {
  it('표준 휠 한 클릭 위로 — mouseData 0x00780000 → 120', () => {
    // HIWORD = 0x0078 = 120 (양수 signed short)
    expect(decodeWheelDelta(0x00780000)).toBe(120);
  });

  it('표준 휠 한 클릭 아래로 — mouseData 0xFF880000 → -120', () => {
    // HIWORD = 0xFF88 → 16-bit signed → -120
    // (0xFF88 - 0x10000 = -120)
    expect(decodeWheelDelta(0xff880000 | 0)).toBe(-120);
  });

  it('두 클릭 위로 — mouseData 0x00F00000 → 240', () => {
    // HIWORD = 0x00F0 = 240
    expect(decodeWheelDelta(0x00f00000)).toBe(240);
  });

  it('정밀 휠 작은 양수 — mouseData 0x00010000 → 1', () => {
    expect(decodeWheelDelta(0x00010000)).toBe(1);
  });

  it('정밀 휠 작은 음수 — mouseData 0xFFFF0000 → -1', () => {
    expect(decodeWheelDelta(0xffff0000 | 0)).toBe(-1);
  });

  it('LOWORD가 채워져 있어도 무시 (XBUTTON 식별 비트 등)', () => {
    // HIWORD = 120, LOWORD = 0xABCD (XBUTTON 등) → delta는 여전히 120
    expect(decodeWheelDelta(0x0078abcd)).toBe(120);
  });

  it('HIWORD 0 → 0 (mouseData 0)', () => {
    expect(decodeWheelDelta(0)).toBe(0);
  });

  it('경계값 0x80000000 (HIWORD=0x8000) → -32768 (signed short min)', () => {
    expect(decodeWheelDelta(0x80000000 | 0)).toBe(-32768);
  });

  it('경계값 HIWORD=0x7FFF → 32767 (signed short max)', () => {
    expect(decodeWheelDelta(0x7fff0000)).toBe(32767);
  });
});

describe('Phase 7-B — mapWin32MsgToWheelAxis', () => {
  it("WM_MOUSEWHEEL (0x020A) → 'vertical'", () => {
    expect(mapWin32MsgToWheelAxis(0x020a)).toBe('vertical');
  });

  it("WM_MOUSEHWHEEL (0x020E) → 'horizontal'", () => {
    expect(mapWin32MsgToWheelAxis(0x020e)).toBe('horizontal');
  });

  it('휠이 아닌 메시지 → null', () => {
    expect(mapWin32MsgToWheelAxis(0x0201)).toBeNull(); // WM_LBUTTONDOWN
    expect(mapWin32MsgToWheelAxis(0x0200)).toBeNull(); // WM_MOUSEMOVE
    expect(mapWin32MsgToWheelAxis(0)).toBeNull();
    expect(mapWin32MsgToWheelAxis(0xffff)).toBeNull();
  });
});

describe('Phase 7-B — mapWin32MsgToElectronEvent (wheel)', () => {
  it("WM_MOUSEWHEEL → 'mouseWheel'", () => {
    expect(mapWin32MsgToElectronEvent(0x020a)).toBe('mouseWheel');
  });

  it("WM_MOUSEHWHEEL → 'mouseWheel'", () => {
    expect(mapWin32MsgToElectronEvent(0x020e)).toBe('mouseWheel');
  });
});

describe('Phase 7-C — moveWidget null/safety', () => {
  it('null handle(0n)이면 즉시 false (SetWindowPos 호출 안 함)', () => {
    expect(moveWidget(0n, 0, 0, 100, 50)).toBe(false);
  });

  it('null handle은 좌표/크기와 무관하게 false', () => {
    expect(moveWidget(0n, 1234, 5678, 800, 600)).toBe(false);
    expect(moveWidget(0n, -1920, 0, 1, 1)).toBe(false);
  });

  it('함수가 export되어 있고 호출 시 throw하지 않는다', () => {
    // 비Win32 환경에서는 koffi 로드 실패 → false 반환. 어떤 환경이든 throw 금지.
    expect(typeof moveWidget).toBe('function');
    expect(() => moveWidget(0n, 100, 100, 800, 600)).not.toThrow();
  });
});

describe('Phase 7-stable — isWidgetOrAncestor (z-order 검증, 2026-05-06 결정적 fix)', () => {
  // 임의의 합리적인 HWND 값 (실제 OS HWND가 아니므로 단순 비교만)
  const WIDGET = 0x12340000n;
  const WORKERW = 0x12350000n;
  const PROGMAN = 0x12360000n;

  // 결정적 fix(2026-05-06): top=0n과 GetAncestor 실패 시 over-block 회피해 true 반환.
  // GetAncestor는 실제 koffi 호출인데, 비Win32 단위 테스트 환경에서는 0n 반환 → true.

  it('top === widgetHwnd → true (위젯 자체가 위에 있음)', () => {
    expect(isWidgetOrAncestor(WIDGET, WIDGET, WORKERW, PROGMAN)).toBe(true);
  });

  it('top === workerW → true (위젯의 부모 WorkerW가 root)', () => {
    expect(isWidgetOrAncestor(WORKERW, WIDGET, WORKERW, PROGMAN)).toBe(true);
  });

  it('top === progman → true (STRATEGY 3에서 root가 Progman)', () => {
    expect(isWidgetOrAncestor(PROGMAN, WIDGET, WORKERW, PROGMAN)).toBe(true);
  });

  it('top === 0n → true (WindowFromPoint 실패 — over-block 회피로 widget 라우팅)', () => {
    // 결정적 fix: 이전엔 false 반환했으나, 실패가 클릭을 통째로 삼키는 회귀(sent=0)를 막기 위해
    // 검증을 over-block 하지 않음. 0n은 WindowFromPoint이 좌표 위에 윈도우를 못 찾은 드문 케이스.
    expect(isWidgetOrAncestor(0n, WIDGET, WORKERW, PROGMAN)).toBe(true);
  });

  it('progman이 0n이면 progman 직접 매치 분기는 무시되지만 GetAncestor fallback은 살아있음', () => {
    // 비Win32 환경에서 GetAncestor 실패 시 over-block 회피로 true 반환 (결정적 fix).
    expect(isWidgetOrAncestor(PROGMAN, WIDGET, WORKERW, 0n)).toBe(true);
  });

  it('workerW가 0n이면 workerW 직접 매치 분기 무시', () => {
    // workerW=0n + GetAncestor 실패(비Win32) → over-block 회피 true.
    // 하지만 widget 자체는 여전히 매치 — 직접 등치 우선.
    expect(isWidgetOrAncestor(WIDGET, WIDGET, 0n, PROGMAN)).toBe(true);
  });

  // top === 다른 HWND인 경우 — 비Win32 환경에서는 GetAncestor가 0n을 반환해 over-block 회피
  // true로 떨어진다 (이는 non-win32 단위 테스트 한계). 실제 win32 환경에서 다른 top-level
  // 창이 위에 있는 경우는 통합 테스트(Setup.exe 사용자 검증)에서 검증한다.
  // 본 테스트 환경의 동작은 "비-Win32에서는 over-block 안 함"으로 동작 보존.
});

describe('Phase 7-B — wheel raw decode 부호 보존', () => {
  // decodeWheelDelta는 부호 정책이 아니라 단순 HIWORD signed 추출만 책임진다.
  // 부호 정책 SSOT는 computeWheelDeltas (아래 describe). 본 테스트는 raw 추출 단계의
  // 부호 보존만 회귀 방지로 잡아둔다.
  it('decodeWheelDelta는 Win32 raw signed short를 부호 그대로 반환', () => {
    expect(decodeWheelDelta(0x00780000)).toBeGreaterThan(0); // forward (휠 멀리 밀기) = positive raw
    expect(decodeWheelDelta(0xff880000 | 0)).toBeLessThan(0); // backward (휠 당기기) = negative raw
  });
});

// ────────────────────────────────────────────────────────────
// Phase 7-B — computeWheelDeltas 부호 정책 SSOT 테스트
// ────────────────────────────────────────────────────────────
// 본 describe는 위젯 모드 휠 sign policy의 *단일 진실 원천*(SSOT) 테스트다.
// 과거에는 정책이 manager inline 코드와 주석에만 존재해 회귀를 방지하지 못했고,
// 결과적으로 2026-05-22 사용자 신고("상하 스크롤이 일반 윈도우와 반대 방향")가 발생.
// computeWheelDeltas로 추출하며 본 테스트가 부호 정책의 회귀 차단 게이트 역할을 한다.
//
// Electron sendInputEvent의 mouseWheel deltaY는 blink WebMouseWheelEvent 컨벤션을 따른다
// (OS layer 우회해 blink에 직접 합성):
//   - WM_MOUSEWHEEL +delta (휠 forward)  → blink +deltaY → 콘텐츠 위로 스크롤
//   - WM_MOUSEWHEEL -delta (휠 backward) → blink -deltaY → 콘텐츠 아래로 스크롤
// 결론: vertical과 horizontal 모두 Win32 raw 부호를 그대로 보존 (반전 X).
// (DOM WheelEvent와는 반대 부호 컨벤션이지만, sendInputEvent는 blink 단계로 들어가므로 SSOT 신뢰.)
describe('Phase 7-B — computeWheelDeltas (부호 정책 SSOT)', () => {
  it('vertical +120 (휠 forward, 표준 한 클릭) → deltaY=+120 (위로 스크롤), deltaX=0', () => {
    expect(computeWheelDeltas(120, 'vertical')).toEqual({ deltaX: 0, deltaY: 120 });
  });

  it('vertical -120 (휠 backward, 표준 한 클릭) → deltaY=-120 (아래로 스크롤), deltaX=0', () => {
    expect(computeWheelDeltas(-120, 'vertical')).toEqual({ deltaX: 0, deltaY: -120 });
  });

  it('horizontal +120 (오른쪽 회전) → deltaX=+120 (오른쪽 스크롤), deltaY=0', () => {
    expect(computeWheelDeltas(120, 'horizontal')).toEqual({ deltaX: 120, deltaY: 0 });
  });

  it('horizontal -120 (왼쪽 회전) → deltaX=-120 (왼쪽 스크롤), deltaY=0', () => {
    expect(computeWheelDeltas(-120, 'horizontal')).toEqual({ deltaX: -120, deltaY: 0 });
  });

  it('정밀 휠 vertical +1 → deltaY=+1 (작은 위로 스크롤)', () => {
    expect(computeWheelDeltas(1, 'vertical')).toEqual({ deltaX: 0, deltaY: 1 });
  });

  it('정밀 휠 vertical -40 (터치패드 작은 swipe) → deltaY=-40 (아래로 스크롤)', () => {
    expect(computeWheelDeltas(-40, 'vertical')).toEqual({ deltaX: 0, deltaY: -40 });
  });

  it('정밀 휠 horizontal +1 → deltaX=+1', () => {
    expect(computeWheelDeltas(1, 'horizontal')).toEqual({ deltaX: 1, deltaY: 0 });
  });

  it('정밀 휠 horizontal -1 → deltaX=-1', () => {
    expect(computeWheelDeltas(-1, 'horizontal')).toEqual({ deltaX: -1, deltaY: 0 });
  });

  it('boundary vertical +32767 (signed short max) → deltaY=+32767', () => {
    expect(computeWheelDeltas(32767, 'vertical')).toEqual({ deltaX: 0, deltaY: 32767 });
  });

  it('boundary vertical -32768 (signed short min) → deltaY=-32768', () => {
    expect(computeWheelDeltas(-32768, 'vertical')).toEqual({ deltaX: 0, deltaY: -32768 });
  });

  it('raw 0 vertical → 둘 다 0 (no-op, 발생 가능성 낮지만 방어)', () => {
    expect(computeWheelDeltas(0, 'vertical')).toEqual({ deltaX: 0, deltaY: 0 });
  });

  it('raw 0 horizontal → 둘 다 0', () => {
    expect(computeWheelDeltas(0, 'horizontal')).toEqual({ deltaX: 0, deltaY: 0 });
  });

  // ──── 정책 회귀 차단 가드 ────
  // 본 두 단언이 동시에 깨지면 부호 정책이 잘못된 방향으로 뒤집힌 것.
  // (blink WebMouseWheelEvent 컨벤션 기준: forward 휠 → deltaY 양수, backward 휠 → deltaY 음수)
  // 2026-05-22 사용자 비교 검증으로 확정: "다른 브라우저 창에서는 정상" + 원본 -delta 코드 반대
  // → blink convention 채택. SSOT가 정책 원복(`-rawDelta`) 회귀를 차단함.
  it('SSOT 회귀 가드: vertical 부호는 raw와 일치 (blink convention; `-rawDelta` 재발 차단)', () => {
    const fwd = computeWheelDeltas(120, 'vertical');
    const bwd = computeWheelDeltas(-120, 'vertical');
    // forward 휠 (Win32 +) → blink +deltaY (위로 스크롤)
    expect(fwd.deltaY).toBeGreaterThan(0);
    // backward 휠 (Win32 -) → blink -deltaY (아래로 스크롤)
    expect(bwd.deltaY).toBeLessThan(0);
    expect(Math.sign(fwd.deltaY)).toBe(1);
    expect(Math.sign(bwd.deltaY)).toBe(-1);
  });

  it('SSOT 회귀 가드: horizontal 부호도 raw와 일치 (freeze, 신고 시 재검토)', () => {
    const right = computeWheelDeltas(120, 'horizontal');
    const left = computeWheelDeltas(-120, 'horizontal');
    expect(right.deltaX).toBeGreaterThan(0);
    expect(left.deltaX).toBeLessThan(0);
    expect(Math.sign(right.deltaX)).toBe(1);
    expect(Math.sign(left.deltaX)).toBe(-1);
  });

  it('축 분리: vertical일 때 deltaX는 항상 0', () => {
    expect(computeWheelDeltas(99999, 'vertical').deltaX).toBe(0);
    expect(computeWheelDeltas(-99999, 'vertical').deltaX).toBe(0);
  });

  it('축 분리: horizontal일 때 deltaY는 항상 0', () => {
    expect(computeWheelDeltas(99999, 'horizontal').deltaY).toBe(0);
    expect(computeWheelDeltas(-99999, 'horizontal').deltaY).toBe(0);
  });
});
