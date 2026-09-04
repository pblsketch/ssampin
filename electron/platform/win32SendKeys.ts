/**
 * Windows 키 입력 송신 — koffi(FFI)로 user32.dll의 SendInput을 직접 호출한다.
 *
 * 배경 (ADR-038, 2026-08-07):
 *   스티커 자동 붙여넣기(Ctrl+V)는 원래 `@nut-tree-fork/nut-js`가 담당했다. 그런데 이 포크는
 *   낡은 jimp(0.22)에 고정되어 있어 jimp → @jimp/core → file-type 계열 취약점 알림이
 *   영구히 따라붙었다(상류 패치 없음). 정작 우리가 쓰는 기능은 "Ctrl+V 한 번 보내기" 하나뿐이라,
 *   이미지 라이브러리 전체를 배포할 이유가 없다.
 *
 *   koffi는 바탕화면 아이콘 아래 모드(native-desktop)에서 이미 쓰고 있고 asarUnpack에도 들어있다.
 *   같은 FFI로 SendInput을 부르면 의존성 추가 없이 동일한 동작을 얻는다.
 *
 * 실패 정책:
 *   호출자(스티커 붙여넣기)는 실패해도 치명적이지 않다 — 클립보드에 이미지가 이미 들어있어
 *   사용자가 직접 Ctrl+V를 누르면 된다. 그래서 여기서는 조용히 삼키지 않고 **예외를 던져**
 *   호출자가 `autoPasted=false`로 안내하도록 한다(조용한 실패 금지).
 */

/** 이 모듈이 실패한 이유를 호출자·로그에서 구분하기 위한 전용 오류. */
export class SendKeysError extends Error {
  override readonly name = 'SendKeysError';
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}

// ─── Win32 상수 ───
const INPUT_KEYBOARD = 1;
const KEYEVENTF_KEYUP = 0x0002;
const VK_CONTROL = 0x11;
const VK_V = 0x56;
// 받아쓰기(Win+H)용. 윈도우 키는 단독으로 누르면 시작 메뉴가 열리지만,
// 사이에 H 가 끼면 OS 가 조합키로 처리하므로 시작 메뉴는 열리지 않는다.
const VK_LWIN = 0x5b;
const VK_H = 0x48;

interface KeyStroke {
  readonly vk: number;
  readonly up: boolean;
}

interface SendInputBindings {
  readonly sizeofInput: number;
  readonly sendInput: (count: number, inputs: unknown[], size: number) => number;
  /** SendInput이 0을 반환할 때의 예비 경로 (구형 API지만 내부적으로 같은 큐를 쓴다) */
  readonly keybdEvent: ((vk: number, scan: number, flags: number, extra: number) => void) | null;
}

let cachedBindings: SendInputBindings | null = null;

/**
 * user32.dll 바인딩 로드 (프로세스 1회).
 *
 * INPUT 구조체는 x64에서 40바이트다: type(4) + 정렬 패딩(4) + union(32).
 * union은 KEYBDINPUT(24)보다 MOUSEINPUT(32)이 커서 32바이트가 되므로, 키보드 변형만 쓰더라도
 * 뒤에 8바이트를 더 채워야 실제 크기와 맞는다. cbSize는 상수 40을 넣지 않고
 * `koffi.sizeof`로 실측해 넘긴다 — 아키텍처가 달라져도 크기가 어긋나지 않는다.
 */
function loadBindings(): SendInputBindings {
  if (cachedBindings) return cachedBindings;

  let koffi: typeof import('koffi');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    koffi = require('koffi') as typeof import('koffi');
  } catch (e) {
    throw new SendKeysError(
      `koffi 모듈 로드 실패: ${e instanceof Error ? e.message : String(e)}`,
      e,
    );
  }

  let user32: ReturnType<typeof koffi.load>;
  try {
    user32 = koffi.load('user32.dll');
  } catch (e) {
    throw new SendKeysError(
      `user32.dll 로드 실패: ${e instanceof Error ? e.message : String(e)}`,
      e,
    );
  }

  try {
    // koffi.struct는 같은 타입 이름을 두 번 등록하면 throw → 모듈 캐시(cachedBindings)로 1회만 실행.
    // 이름은 win32Desktop.ts의 등록 타입과 충돌하지 않도록 SP_ 접두사를 쓴다.
    koffi.struct('SP_KEYBDINPUT', {
      wVk: 'uint16',
      wScan: 'uint16',
      dwFlags: 'uint32',
      time: 'uint32',
      dwExtraInfo: 'uintptr_t',
    });
    const INPUT = koffi.struct('SP_INPUT', {
      type: 'uint32',
      _unionAlign: 'uint32', // x64에서 union이 8바이트 경계에서 시작하도록 하는 패딩
      ki: 'SP_KEYBDINPUT',
      _unionTail: 'uint64', // MOUSEINPUT이 KEYBDINPUT보다 커서 남는 union 꼬리
    });

    const sizeofInput = koffi.sizeof(INPUT);
    // x64 기준 40. 값이 이보다 작으면 구조체 정의가 어긋난 것이므로 호출을 시도하지 않는다
    // (잘못된 cbSize로 SendInput을 부르면 조용히 0을 반환하거나 예측 불가 동작).
    if (sizeofInput < 32) {
      throw new Error(`INPUT 구조체 크기 이상: ${sizeofInput}바이트`);
    }

    const sendInput = user32.func(
      'uint32 __stdcall SendInput(uint32 cInputs, SP_INPUT *pInputs, int cbSize)',
    ) as unknown as (count: number, inputs: unknown[], size: number) => number;

    let keybdEvent: SendInputBindings['keybdEvent'] = null;
    try {
      keybdEvent = user32.func(
        'void __stdcall keybd_event(uint8 bVk, uint8 bScan, uint32 dwFlags, uintptr_t dwExtraInfo)',
      ) as unknown as (vk: number, scan: number, flags: number, extra: number) => void;
    } catch {
      // 예비 경로가 없어도 SendInput만으로 동작한다 — 실패해도 로드를 막지 않는다.
      keybdEvent = null;
    }

    cachedBindings = { sizeofInput, sendInput, keybdEvent };
    return cachedBindings;
  } catch (e) {
    throw new SendKeysError(
      `SendInput 바인딩 준비 실패: ${e instanceof Error ? e.message : String(e)}`,
      e,
    );
  }
}

/** KeyStroke 배열을 koffi가 마샬링할 INPUT 구조체 배열로 변환. */
function toInputArray(strokes: readonly KeyStroke[]): unknown[] {
  return strokes.map((s) => ({
    type: INPUT_KEYBOARD,
    _unionAlign: 0,
    ki: {
      wVk: s.vk,
      wScan: 0,
      dwFlags: s.up ? KEYEVENTF_KEYUP : 0,
      time: 0,
      dwExtraInfo: 0,
    },
    _unionTail: 0,
  }));
}

/**
 * 조합키 한 벌을 현재 포커스된 창으로 보낸다 (Windows 전용).
 *
 * @param chordLabel 실패 메시지에 넣을, 사람이 읽는 조합키 이름(예: `Ctrl+V`).
 * @throws {SendKeysError} koffi/user32 로드 실패, 또는 OS가 입력을 하나도 받지 못한 경우.
 *   (UIPI — 관리자 권한으로 실행 중인 창이 대상이면 OS가 차단할 수 있다. 이때도 예외를 던져
 *    호출자가 사용자에게 직접 누르라고 안내하도록 한다.)
 */
function sendChord(strokes: readonly KeyStroke[], chordLabel: string): void {
  const b = loadBindings();

  let sent = 0;
  try {
    sent = b.sendInput(strokes.length, toInputArray(strokes), b.sizeofInput);
  } catch (e) {
    throw new SendKeysError(
      `${chordLabel} SendInput 호출 실패: ${e instanceof Error ? e.message : String(e)}`,
      e,
    );
  }

  if (sent === strokes.length) return;

  // SendInput이 일부/전부 실패 — 구형 keybd_event로 한 번 더 시도한다.
  // (두 API는 같은 입력 큐를 쓰지만, 드물게 후자만 통과하는 환경 보고가 있어 예비로 둔다.)
  if (b.keybdEvent) {
    try {
      for (const s of strokes) {
        b.keybdEvent(s.vk, 0, s.up ? KEYEVENTF_KEYUP : 0, 0);
      }
      return;
    } catch (e) {
      throw new SendKeysError(
        `${chordLabel} SendInput 실패(${sent}/${strokes.length}) 후 keybd_event 예비 경로도 실패: ` +
          `${e instanceof Error ? e.message : String(e)}`,
        e,
      );
    }
  }

  throw new SendKeysError(
    `${chordLabel} 입력을 전달하지 못했습니다 (${sent}/${strokes.length}). ` +
      '대상 창이 관리자 권한으로 실행 중이면 OS가 입력을 차단할 수 있습니다.',
  );
}

/**
 * 현재 포커스된 창에 Ctrl+V를 보낸다 (Windows 전용).
 *
 * @throws {SendKeysError} 실패 시. 호출자(스티커 붙여넣기)가 "자동 붙여넣기 실패,
 *   직접 Ctrl+V" 안내를 하도록 조용히 삼키지 않는다.
 */
export function sendCtrlV(): void {
  sendChord(
    [
      { vk: VK_CONTROL, up: false },
      { vk: VK_V, up: false },
      { vk: VK_V, up: true },
      { vk: VK_CONTROL, up: true },
    ],
    'Ctrl+V',
  );
}

/**
 * 현재 포커스된 창에 Win+H를 보낸다 — 윈도우 **받아쓰기** 패널을 띄운다 (Windows 전용).
 *
 * 쌤핀은 음성 인식기를 넣지 않는다. 듣고 글자로 바꾸는 일은 전부 OS(마이크로소프트)가 하고,
 * 앱이 하는 일은 "그 패널을 지금 켜 달라"고 키를 대신 눌러 주는 것뿐이다. 그래서 글자는
 * 앱을 거치지 않고 **지금 커서가 있는 칸으로 OS 가 직접** 흘려 넣는다.
 *
 * ★Electron 은 자기 창 밖으로 OS 단축키를 보낼 수 없어 이 우회가 필요하다.
 * ★첫 사용 때 OS 의 "온라인 음성 인식 켜기" 동의 화면이 한 번 뜬다(실기기 확인 항목).
 *
 * @throws {SendKeysError} 실패 시. 호출자가 "직접 Win+H 를 눌러 주세요"로 안내한다.
 */
export function sendWinH(): void {
  sendChord(
    [
      { vk: VK_LWIN, up: false },
      { vk: VK_H, up: false },
      { vk: VK_H, up: true },
      { vk: VK_LWIN, up: true },
    ],
    'Win+H',
  );
}
