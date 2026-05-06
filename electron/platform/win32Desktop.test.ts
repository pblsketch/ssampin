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
    expect(isMouseMessageOfInterest(0x00A1)).toBe(false);
    // WM_NCMOUSEMOVE (Phase 7-D)
    expect(isMouseMessageOfInterest(0x00A0)).toBe(false);
    // WM_RBUTTONDBLCLK는 본 단계에서 미포함 (한국어 키보드/한자 변환 등 비주류 경로 — 추후 추가 가능)
    expect(isMouseMessageOfInterest(0x0206)).toBe(false);
    // WM_MBUTTONDBLCLK 미포함
    expect(isMouseMessageOfInterest(0x0209)).toBe(false);
  });

  it('완전 무관한 메시지(0, WM_PAINT 등)도 false', () => {
    expect(isMouseMessageOfInterest(0)).toBe(false);
    expect(isMouseMessageOfInterest(0x000F)).toBe(false); // WM_PAINT
    expect(isMouseMessageOfInterest(0xFFFF)).toBe(false);
  });
});

describe('Phase 7-A — physicalToClient', () => {
  it('widget 좌상단 (0,0)이면 physical = client', () => {
    expect(physicalToClient({ x: 100, y: 200 }, { x: 0, y: 0 }))
      .toEqual({ x: 100, y: 200 });
  });

  it('widget bounds.x/y만큼 빼서 client coord 변환', () => {
    expect(physicalToClient({ x: 1000, y: 800 }, { x: 800, y: 600 }))
      .toEqual({ x: 200, y: 200 });
  });

  it('physical이 widget 영역 밖이면 음수 client (Win32에서도 합법)', () => {
    expect(physicalToClient({ x: 50, y: 100 }, { x: 100, y: 100 }))
      .toEqual({ x: -50, y: 0 });
  });

  it('multi-monitor: 두 번째 모니터(음수 x)에 widget이 있어도 정확히 변환', () => {
    // primary 우측 (-1920, 0)에 second monitor가 있는 환경
    const widgetBounds = { x: -1500, y: 100 };
    const physicalCursor = { x: -1400, y: 250 };
    expect(physicalToClient(physicalCursor, widgetBounds))
      .toEqual({ x: 100, y: 150 });
  });

  it('실수 좌표가 들어와도 그대로 빼기 (반올림은 caller 책임)', () => {
    expect(physicalToClient({ x: 100.5, y: 200.5 }, { x: 50.25, y: 100.75 }))
      .toEqual({ x: 50.25, y: 99.75 });
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
    expect(mapWin32MsgToElectronEvent(0x00A1)).toBeNull(); // WM_NCLBUTTONDOWN
    expect(mapWin32MsgToElectronEvent(0)).toBeNull();
    expect(mapWin32MsgToElectronEvent(0xFFFF)).toBeNull();
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
    expect(mapWin32MsgToButton(0xFFFF)).toBe('left');
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
    const cx = 100, cy = 50;
    const lparam = ((cy & 0xFFFF) << 16) | (cx & 0xFFFF);
    expect(lparam).toBe((50 << 16) | 100);
    // low word
    expect(lparam & 0xFFFF).toBe(100);
    // high word
    expect((lparam >> 16) & 0xFFFF).toBe(50);
  });

  it('음수 client coord도 16-bit signed로 두 word 모두 잘 packing', () => {
    const cx = -10, cy = -5;
    const lparam = ((cy & 0xFFFF) << 16) | (cx & 0xFFFF);
    // -10의 16-bit 보수: 0xFFF6
    expect(lparam & 0xFFFF).toBe(0xFFF6);
    // -5의 16-bit 보수: 0xFFFB
    expect(((lparam >>> 16) & 0xFFFF)).toBe(0xFFFB);
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

describe('Phase 7-stable — isWidgetOrAncestor (z-order 검증)', () => {
  // 임의의 합리적인 HWND 값 (실제 OS HWND가 아니므로 단순 비교만)
  const WIDGET = 0x12340000n;
  const WORKERW = 0x12350000n;
  const PROGMAN = 0x12360000n;
  const OTHER = 0x99990000n;

  it('top === widgetHwnd → true (위젯 자체가 위에 있음)', () => {
    expect(isWidgetOrAncestor(WIDGET, WIDGET, WORKERW, PROGMAN)).toBe(true);
  });

  it('top === workerW → true (위젯의 부모 WorkerW가 root)', () => {
    expect(isWidgetOrAncestor(WORKERW, WIDGET, WORKERW, PROGMAN)).toBe(true);
  });

  it('top === progman → true (STRATEGY 3에서 root가 Progman)', () => {
    expect(isWidgetOrAncestor(PROGMAN, WIDGET, WORKERW, PROGMAN)).toBe(true);
  });

  it('top이 무관한 다른 윈도우 HWND → false (다른 창이 위에 있음 — 라우팅 skip)', () => {
    expect(isWidgetOrAncestor(OTHER, WIDGET, WORKERW, PROGMAN)).toBe(false);
  });

  it('top === 0n → false (WindowFromPoint 실패 시 안전 차단)', () => {
    expect(isWidgetOrAncestor(0n, WIDGET, WORKERW, PROGMAN)).toBe(false);
  });

  it('progman이 0n이면 (캐시 미설정) progman 비교 분기는 무시되고 false', () => {
    // progman이 알려지지 않은 경우 — STRATEGY 3 미사용 + Progman 추적 실패 케이스.
    expect(isWidgetOrAncestor(PROGMAN, WIDGET, WORKERW, 0n)).toBe(false);
  });

  it('workerW가 0n이면 workerW 비교 분기 무시', () => {
    expect(isWidgetOrAncestor(WORKERW, WIDGET, 0n, PROGMAN)).toBe(false);
    // 하지만 widget 자체는 여전히 매치
    expect(isWidgetOrAncestor(WIDGET, WIDGET, 0n, PROGMAN)).toBe(true);
  });
});

describe('Phase 7-B — wheel 부호 매핑 정합성', () => {
  // Phase 7-B 구현 약속: WM_MOUSEWHEEL의 양수 delta → Chromium deltaY 음수
  //   (Win32: 양수 = 휠을 위로 회전 = 사용자가 위쪽 콘텐츠를 보고 싶다)
  //   (Chromium: deltaY 양수 = 아래로 스크롤 = 사용자가 아래쪽을 보고 싶다)
  //
  // 본 테스트는 helper 자체가 부호 변환을 하지는 않는다 (manager에서 -delta 적용).
  // helper는 raw signed delta만 반환하고 부호 정책은 manager가 결정.
  it('decodeWheelDelta는 raw signed short를 반환 (manager가 axis별 부호 정책 적용)', () => {
    expect(decodeWheelDelta(0x00780000)).toBeGreaterThan(0); // up = positive raw
    expect(decodeWheelDelta(0xff880000 | 0)).toBeLessThan(0); // down = negative raw
  });
});
