/**
 * 쌤핀 AI — 중계 함수 호출 구현체
 *
 * ★AI 공급자를 **직접 부르지 않는다.** 중계 함수(`ssampin-assist`)만 부른다.
 * 키가 앱에 없기 때문이다 — Electron asar 는 압축만 풀면 코드가 보인다.
 *
 * ★인자 타입이 `AssistRequestPayload` 라는 것이 중요하다.
 * 그 안의 `toolResults[].data` 는 `ModelSafe<T>` 라서, **화이트리스트 재구성을 거치지 않은
 * 객체는 여기까지 올 수 없다**(그물 ②의 컴파일 강제). 이 파일이 그 강제가 실제로 작동하는 자리다.
 */
import type {
  AssistAnswer,
  AssistDegraded,
  AssistPort,
  AssistRequestPayload,
} from '@domain/ports/AssistPort';
import { AssistBlockedError } from '@domain/ports/AssistPort';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const ENDPOINT = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/ssampin-assist` : '';

/** 서버가 답을 못 주면 이 시간 뒤 포기한다. 숫자 카드는 이미 화면에 있으므로 길게 기다릴 이유가 없다. */
const TIMEOUT_MS = 30_000;

interface AssistResponseBody {
  readonly text?: string;
  readonly degraded?: string | null;
  readonly error?: string;
}

function toDegraded(value: string | null | undefined): AssistDegraded | null {
  return value === 'budget' || value === 'unavailable' || value === 'upstream' ? value : null;
}

/**
 * fetch 가 실패한 이유를 사용자에게 설명할 수 있는 사유로 바꾼다.
 *
 * `navigator.onLine` 은 한쪽으로만 믿을 수 있다 — `false` 면 확실히 끊긴 것이지만,
 * `true` 는 "랜선이 꽂혀 있다"는 뜻일 뿐 인터넷이 된다는 보장이 아니다. 그래서
 * **끊겼다고 단정하는 것은 `false` 일 때뿐**이고, 나머지는 "서버에 못 닿았다"로 말한다.
 */
export function classifyFetchFailure(error: unknown): AssistDegraded {
  // AbortSignal.timeout 이 터지면 TimeoutError 다. 사용자에겐 "느려서 그만뒀다"가 맞다.
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'timeout';

  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';

  return 'unreachable';
}

export class AssistClient implements AssistPort {
  async ask(payload: AssistRequestPayload): Promise<AssistAnswer> {
    if (!ENDPOINT || !SUPABASE_ANON_KEY) {
      // 개발 환경에서 환경변수가 없을 때. 조용히 실패하지 않고 축소로 알린다.
      return { text: '', degraded: 'unavailable' };
    }

    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          installId: payload.installId,
          turns: payload.turns,
          toolResults: payload.toolResults,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      // 오류로 던지지 않는다 — 숫자 카드는 이미 화면에 있고, AI 해설만 쉬면 된다(P5).
      // 다만 **사유는 구분한다.** 예전에는 전부 'offline' 이라, 인터넷이 멀쩡한데도
      // "인터넷이 끊겼어요"가 떴다(2026-08-23 신고).
      return { text: '', degraded: classifyFetchFailure(error) };
    }

    if (res.status === 400) {
      // 서버 관문이 막았다. 사용자에게 보여도 되는 한국어 문구가 온다.
      const body = (await res.json().catch(() => ({}))) as AssistResponseBody;
      throw new AssistBlockedError(body.error ?? '보낼 수 없는 내용이 있습니다');
    }

    if (!res.ok) {
      // 5xx 등. 서버는 보통 200 + degraded 로 내리므로 여기 오면 예상 밖이다.
      console.error(`[assist] 예상치 못한 응답 ${res.status}`);
      return { text: '', degraded: 'upstream' };
    }

    const body = (await res.json()) as AssistResponseBody;
    return { text: body.text ?? '', degraded: toDegraded(body.degraded) };
  }
}
