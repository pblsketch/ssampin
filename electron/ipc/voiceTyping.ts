/**
 * 말로 남기기 — OS 받아쓰기를 대신 켜 주는 통로.
 *
 * ## 이 파일이 하지 않는 일
 *
 * **음성을 듣지 않는다. 글자로 바꾸지도 않는다.** 쌤핀에는 음성 인식기가 없고 넣지도 않는다
 * (오너 결정 2026-09-04: 로컬 STT 엔진 동봉·앱 자체 청취(WinRT)·외부 유료 STT 전부 제외).
 *
 * 여기서 하는 일은 딱 하나 — 화면이 "지금 켜 줘" 하고 부르면 **윈도우 받아쓰기 단축키(Win+H)를
 * 대신 눌러 주는 것**이다. 그 뒤로는 OS 가 알아서 듣고, 글자는 앱을 거치지 않고 **지금 커서가
 * 있는 칸으로 OS 가 직접** 흘려 넣는다. 그래서 이 통로에는 음성도, 글자도, 학생 이름도 흐르지
 * 않는다 — 오가는 것은 "켜 달라"는 신호와 결과 한 줄뿐이다.
 *
 * ## 왜 통로가 필요한가
 *
 * Electron 은 자기 창 밖으로 OS 단축키를 보낼 수 없다. 그래서 화면(렌더러)이 직접 Win+H 를
 * 누를 방법이 없고, 본체(메인 프로세스)가 대신 눌러 줘야 한다.
 *
 * ## 쉘 인젝션 여지 0
 *
 * 이 통로는 **렌더러에서 아무 값도 받지 않는다.** 인자가 없으므로 사용자 입력이 명령줄에
 * 닿을 수가 없다. 키 입력도 셸이 아니라 `win32SendKeys`(koffi → user32 SendInput)로 보낸다 —
 * PowerShell 프로세스를 띄우지 않는다. 학교 PC 의 보안 프로그램은 "키 입력을 만들어 내는
 * PowerShell"을 흔히 차단하는데, 그 형태를 아예 만들지 않는 편이 안전하다(ADR-038 에서
 * 스티커 붙여넣기가 이미 같은 이유로 nut-js → koffi 로 옮겼다).
 *
 * ## 실패는 조용히 삼키지 않는다
 *
 * 받아쓰기가 안 켜졌는데 아무 말도 없으면 선생님은 말하기 시작했다가 아무것도 안 적힌 걸
 * 나중에 발견한다. 그래서 실패는 **항상 한국어 한 줄**로 돌려주고, 화면이 그대로 보여 준다.
 * IPC 경계 밖으로 예외를 던지지 않는다(렌더러에서 깨진 영어 스택으로 보이는 것을 막는다).
 */
import { ipcMain } from 'electron';

/** 기계가 분기할 수 있게 하는 사유. 사람에게 보여 줄 말은 `message` 쪽이다. */
export type VoiceTypingReason =
  /** Win+H 를 보냈다. 패널이 실제로 떴는지는 OS 소관이라 여기서 알 수 없다. */
  | 'started'
  /** 윈도우가 아니다 — 대신 그 OS 의 받아쓰기 여는 법을 안내한다. */
  | 'unsupported-platform'
  /** 키를 보내다 실패했다(koffi 로드 실패·UIPI 차단 등). */
  | 'send-failed';

export interface VoiceTypingResult {
  readonly ok: boolean;
  readonly reason: VoiceTypingReason;
  /** 화면에 그대로 띄울 한국어 한 줄. 비어 있지 않다. */
  readonly message: string;
}

/**
 * 윈도우가 아닌 OS 에서 보여 줄 안내.
 *
 * 대신 눌러 주지는 못해도 **그 OS 에도 받아쓰기는 있다.** 여는 법을 알려 주는 편이
 * "지원하지 않습니다"보다 쓸모 있다.
 */
export function unsupportedPlatformMessage(platform: string): string {
  if (platform === 'darwin') {
    return '맥에서는 받아쓰기 단축키를 눌러 주세요. (기본값은 fn 키 두 번, [시스템 설정 > 키보드 > 받아쓰기]에서 켜고 바꿀 수 있습니다.)';
  }
  return '이 컴퓨터에서는 받아쓰기를 대신 켜 드릴 수 없습니다. 사용하시는 운영체제의 음성 입력 기능을 직접 켜 주세요.';
}

/**
 * 키 입력이 실패했을 때의 안내.
 *
 * 원인(관리자 권한 창·보안 프로그램)을 정확히 가려낼 방법이 없으므로 **직접 누르는 길**을
 * 먼저 알려 준다. 진단 문구는 뒤에 괄호로 덧붙여 로그·문의에 쓰이게 한다.
 */
export function sendFailureMessage(detail: string): string {
  const trimmed = detail.trim();
  const tail = trimmed === '' ? '' : ` (${trimmed})`;
  return `받아쓰기를 켜지 못했습니다. 키보드에서 직접 Windows 키와 H 를 함께 눌러 주세요.${tail}`;
}

/**
 * 지금 OS 에서 무엇을 할지 결정한다 — Electron 없이 테스트되도록 분리했다.
 *
 * @returns `null` 이면 "윈도우다, 키를 보내라". 아니면 그대로 돌려줄 결과.
 */
export function planForPlatform(platform: string): VoiceTypingResult | null {
  if (platform === 'win32') return null;
  return {
    ok: false,
    reason: 'unsupported-platform',
    message: unsupportedPlatformMessage(platform),
  };
}

/** 성공 결과 — 화면은 이 문구를 굳이 띄우지 않아도 된다(패널이 곧 보이므로). */
export const STARTED_RESULT: VoiceTypingResult = {
  ok: true,
  reason: 'started',
  message: '받아쓰기를 켰습니다. 이제 말씀하시면 글자로 적힙니다.',
};

/**
 * 실제 키 전송. `sendWinH` 를 주입받아 테스트에서 갈아 끼울 수 있게 한다.
 *
 * 예외는 여기서 전부 흡수한다 — IPC 경계를 넘어가지 않는다.
 */
export function startVoiceTyping(platform: string, sendWinH: () => void): VoiceTypingResult {
  const planned = planForPlatform(platform);
  if (planned !== null) return planned;

  try {
    sendWinH();
    return STARTED_RESULT;
  } catch (e) {
    return {
      ok: false,
      reason: 'send-failed',
      message: sendFailureMessage(e instanceof Error ? e.message : String(e)),
    };
  }
}

/**
 * IPC 등록.
 *
 * ★`win32SendKeys` 는 **윈도우일 때만** 늦게 불러온다. 맥에서 koffi(네이티브 모듈)를
 *   건드리지 않기 위해서다.
 */
export function registerVoiceTypingHandlers(): void {
  ipcMain.handle('voice-typing:start', (): VoiceTypingResult => {
    const planned = planForPlatform(process.platform);
    if (planned !== null) return planned;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { sendWinH } = require('../platform/win32SendKeys') as {
        sendWinH: () => void;
      };
      return startVoiceTyping(process.platform, sendWinH);
    } catch (e) {
      // 모듈 로드 자체가 실패한 경우(패키징 누락 등)도 한국어로 돌려준다.
      return {
        ok: false,
        reason: 'send-failed',
        message: sendFailureMessage(e instanceof Error ? e.message : String(e)),
      };
    }
  });
}
