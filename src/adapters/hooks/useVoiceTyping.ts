/**
 * 말로 남기기(데스크톱) — OS 받아쓰기를 부르는 화면 쪽 손잡이.
 *
 * 쌤핀은 음성을 듣지 않는다. 이 훅이 하는 일은 두 가지뿐이다.
 *  1. 지금 쓰고 있는 **글자 칸에 커서를 두고**(OS 는 커서가 있는 칸에 글자를 넣는다),
 *  2. 본체에 "받아쓰기를 켜 달라"고 부탁한다.
 *
 * 그 뒤로 말한 글자는 **앱을 거치지 않고 OS 가 칸에 직접** 넣는다. 그래서 여기에는
 * 음성도, 받아쓴 글자도 지나가지 않는다.
 *
 * ## 왜 `global.d.ts` 를 고치지 않았나
 *
 * 이 통로의 타입을 공용 선언 파일에 넣는 것이 정석이지만, 지금은 5개 세션이 같은 트리에서
 * 동시에 일하고 있고 `src/global.d.ts` 는 여러 작업이 함께 건드릴 파일이라
 * (다른 세션도 자기 IPC 를 여기 적는다) **소유권 표 밖**이다. 그래서 이 파일 안에서만
 * `window` 를 좁혀 쓴다. `any` 는 쓰지 않는다. 통합 세션(T6)이 나중에 공용 선언으로
 * 옮기면 이 함수만 지우면 된다 — 계획서 §6 에 요청으로 남겼다.
 */
import { useCallback } from 'react';
import { useToastStore } from '@adapters/components/common/Toast';

export type VoiceTypingReason =
  | 'started'
  | 'unsupported-platform'
  | 'send-failed'
  /** 이 빌드의 본체에 통로가 등록되지 않았다. */
  | 'not-wired'
  /** 브라우저(모바일·웹)에서 열렸다 — 데스크톱 앱이 아니다. */
  | 'no-bridge';

export interface VoiceTypingOutcome {
  readonly ok: boolean;
  readonly reason: VoiceTypingReason;
  readonly message: string;
}

interface VoiceTypingBridge {
  start: () => Promise<VoiceTypingOutcome>;
}

/** 데스크톱 앱 안에서만 존재하는 통로. 브라우저에서는 `null`. */
function bridge(): VoiceTypingBridge | null {
  const api = (window as unknown as { electronAPI?: { voiceTyping?: VoiceTypingBridge } })
    .electronAPI;
  return api?.voiceTyping ?? null;
}

/** 데스크톱 앱에서 열렸고 받아쓰기 통로가 있는가 — 아니면 버튼을 아예 그리지 않는다. */
export function isVoiceTypingAvailable(): boolean {
  return bridge() !== null;
}

/**
 * "설정 → 음성 입력 시작 도구" 안내를 한 번 봤는가.
 *
 * 설정 엔티티가 아니라 이 컴퓨터의 로컬 저장소에 둔다 — 기기마다 OS 설정이 다르고,
 * 안내가 가리키는 것도 **쌤핀 설정이 아니라 윈도우 설정**이라 기기 간에 옮길 값이 아니다.
 */
const HINT_SEEN_KEY = 'ssampin.voiceTyping.startToolHintSeen';

const START_TOOL_HINT =
  '설정 → 음성 입력 시작 도구를 켜면 글자 칸을 클릭할 때 마이크가 저절로 나타납니다.';

function hintAlreadySeen(): boolean {
  try {
    return localStorage.getItem(HINT_SEEN_KEY) === '1';
  } catch {
    // 저장소가 막힌 환경에서도 기능은 돌아가야 한다. 안내를 매번 띄우지 않도록 본 것으로 친다.
    return true;
  }
}

function markHintSeen(): void {
  try {
    localStorage.setItem(HINT_SEEN_KEY, '1');
  } catch {
    // 못 적어도 그냥 넘어간다 — 안내가 한 번 더 보이는 것뿐이다.
  }
}

export interface UseVoiceTyping {
  /** 버튼을 그릴지 여부. 데스크톱 앱이 아니면 false → 조용히 숨긴다. */
  readonly available: boolean;
  /**
   * 받아쓰기 켜기.
   *
   * @param focusField 글자 칸에 커서를 두는 함수. **키를 보내기 전에** 부른다 —
   *   OS 는 그 순간 커서가 있는 칸에 글자를 넣기 때문이다.
   */
  readonly start: (focusField: () => void) => Promise<void>;
}

export function useVoiceTyping(): UseVoiceTyping {
  const showToast = useToastStore((s) => s.show);

  const start = useCallback(
    async (focusField: () => void): Promise<void> => {
      const api = bridge();
      if (api === null) return;

      // 순서가 중요하다 — 커서를 먼저 두고 키를 보낸다.
      focusField();

      let outcome: VoiceTypingOutcome;
      try {
        outcome = await api.start();
      } catch {
        showToast(
          '받아쓰기를 켜지 못했습니다. 키보드에서 직접 Windows 키와 H 를 함께 눌러 주세요.',
          'error',
        );
        return;
      }

      if (!outcome.ok) {
        showToast(outcome.message, 'error', undefined, 5000);
        return;
      }

      // 성공했을 때만, 그리고 딱 한 번만 "이걸 켜 두면 이 버튼도 필요 없다"고 알려 준다.
      if (!hintAlreadySeen()) {
        markHintSeen();
        showToast(START_TOOL_HINT, 'info', undefined, 6000);
      }
    },
    [showToast],
  );

  return { available: isVoiceTypingAvailable(), start };
}
