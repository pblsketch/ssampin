/**
 * 생기부 1층 프롬프트를 **실행 시점에** 서버에서 받아 온다 (오너 결정 D7, ADR-072).
 *
 * ★설치파일에 넣지 않는 이유: Electron 설치파일(asar)은 압축만 풀면 안이 다 읽힌다.
 *   그래서 규정 본문은 서버 환경변수에만 두고, 초안을 쓸 때마다 받아 **메모리에만** 둔다.
 *
 * ★디스크에 쓰지 않는다. 캐시도 이 모듈 안의 변수뿐이라 앱을 끄면 사라진다.
 *
 * ★못 받아 오면 초안을 만들지 않는다. 규정 없이 쓴 초안은 쓸모가 없을 뿐 아니라 위험하다.
 *   **단, 전에 받아 둔 값이 있으면 그걸 쓴다**(ADR-089) — 서버가 잠깐 죽었다고 전국의
 *   초안이 멈추면 안 된다. 서버 쪽 fail-open 만으로는 429·500 을 못 막는다(그건 "성공적으로
 *   반환된 응답"이라 서버 try/catch 를 안 탄다).
 *
 * ★그 폴백에는 **상한이 있다**(`STALE_GRACE_MS`). 캐시가 모듈 변수라 상한을 안 두면 실질
 *   한계가 "앱 세션 길이"가 되는데, 규정은 학사 기재요령에 매인 문서라 무한정 낡은 것을
 *   쓰면 **폐지된 규정으로 초안을 쓰는 셈**이 된다.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const ENDPOINT = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/ssampin-record-prompt` : '';

/** 초안 한 편이 20~30초 걸리므로, 프롬프트를 받는 데 오래 기다릴 이유가 없다. */
const TIMEOUT_MS = 10_000;

/**
 * 만료된 캐시를 얼마나 더 써도 되는가. 24시간.
 *
 * ★이 값이 곧 "규정 회전이 언제 퍼지는가"의 상한이기도 하다. 서버 시크릿을 바꿔도
 *   클라이언트가 새로 못 받는 동안은 옛 본문이 계속 쓰인다.
 */
const STALE_GRACE_MS = 24 * 60 * 60 * 1000;

interface Cached {
  readonly prompt: string;
  /** 서버가 준 판본. 이 값이 어느 규정으로 쓴 초안인지 남기는 근거가 된다. */
  readonly version: number;
  /** 이 시각이 지나면 다시 받는다. 서버가 준 `ttlSec` 을 그대로 따른다. */
  readonly expiresAt: number;
  /** 이 시각이 지나면 만료된 값으로도 못 쓴다. */
  readonly staleUntil: number;
}

let cached: Cached | null = null;

/**
 * 받아 온 결과.
 *
 * ★한때는 `string | null` 이었다. 그때는 "왜 실패했는가"를 모듈 변수에 따로 적어야 했는데,
 *   그 변수는 **테스트로 고정할 수 없었다** — 패널 테스트가 이 모듈을 통째로 mock 하기 때문에
 *   429 안내 문구 분기가 한 번도 실행되지 않은 채 배포될 수 있었다. 판별 유니온으로 바꾸면
 *   TypeScript 가 빠뜨린 분기를 찾아 준다.
 */
export type RecordPromptResult =
  | {
      readonly ok: true;
      readonly prompt: string;
      readonly version: number;
      readonly stale: boolean;
    }
  | {
      readonly ok: false;
      readonly reason: 'rate-limited-minute' | 'rate-limited-day' | 'unavailable';
    };

/** 서버가 429 와 함께 준 사유. 없거나 이상하면 분당으로 본다(더 짧게 안내하는 쪽). */
async function readRetryAfterKind(res: Response): Promise<'minute' | 'day'> {
  try {
    const body = (await res.json()) as { retryAfterKind?: unknown };
    return body.retryAfterKind === 'day' ? 'day' : 'minute';
  } catch {
    return 'minute';
  }
}

/**
 * 받아 온 프롬프트. 예외를 던지지 않는다 — 부르는 쪽이 `ok` 로 갈라 처리한다.
 */
export async function fetchRecordPromptL1(installId: string): Promise<RecordPromptResult> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return { ok: true, prompt: cached.prompt, version: cached.version, stale: false };
  }

  /** 만료된 캐시라도 상한 안이면 쓴다. 없으면 그때 비로소 멈춘다. */
  const stale = (): RecordPromptResult | null =>
    cached && cached.staleUntil > now
      ? { ok: true, prompt: cached.prompt, version: cached.version, stale: true }
      : null;

  if (!ENDPOINT || !SUPABASE_ANON_KEY) {
    return stale() ?? { ok: false, reason: 'unavailable' };
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ installId }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.status === 429) {
      // ★만료 캐시가 있으면 429 는 화면에 뜨지도 않는다 — 이게 재시도 폭주를 막는 1차 장치다.
      const fallback = stale();
      if (fallback) return fallback;
      const kind = await readRetryAfterKind(res);
      return { ok: false, reason: kind === 'day' ? 'rate-limited-day' : 'rate-limited-minute' };
    }
    if (!res.ok) return stale() ?? { ok: false, reason: 'unavailable' };

    const body = (await res.json()) as {
      prompt?: unknown;
      ttlSec?: unknown;
      version?: unknown;
    };
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (prompt.length === 0) return stale() ?? { ok: false, reason: 'unavailable' };

    const ttlSec = typeof body.ttlSec === 'number' && body.ttlSec > 0 ? body.ttlSec : 3600;
    const version = typeof body.version === 'number' ? body.version : 0;
    const expiresAt = now + ttlSec * 1000;
    cached = { prompt, version, expiresAt, staleUntil: expiresAt + STALE_GRACE_MS };
    return { ok: true, prompt, version, stale: false };
  } catch {
    // 끊겼거나 느리거나 형식이 어긋났다 — 전에 받아 둔 게 있으면 그걸로 계속한다.
    return stale() ?? { ok: false, reason: 'unavailable' };
  }
}
