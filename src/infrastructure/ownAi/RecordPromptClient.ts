/**
 * 생기부 1층 프롬프트를 **실행 시점에** 서버에서 받아 온다 (오너 결정 D7, ADR-072).
 *
 * ★설치파일에 넣지 않는 이유: Electron 설치파일(asar)은 압축만 풀면 안이 다 읽힌다.
 *   그래서 규정 본문은 서버 환경변수에만 두고, 초안을 쓸 때마다 받아 **메모리에만** 둔다.
 *
 * ★디스크에 쓰지 않는다. 캐시도 이 모듈 안의 변수뿐이라 앱을 끄면 사라진다.
 *
 * ★못 받아 오면 초안을 만들지 않는다. 규정 없이 쓴 초안은 쓸모가 없을 뿐 아니라 위험하다.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const ENDPOINT = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/ssampin-record-prompt` : '';

/** 초안 한 편이 20~30초 걸리므로, 프롬프트를 받는 데 오래 기다릴 이유가 없다. */
const TIMEOUT_MS = 10_000;

interface Cached {
  readonly prompt: string;
  /** 이 시각이 지나면 다시 받는다. 서버가 준 `ttlSec` 을 그대로 따른다. */
  readonly expiresAt: number;
}

let cached: Cached | null = null;

/**
 * 받아 온 프롬프트. 실패하면 `null` — 부르는 쪽이 "초안을 만들지 않는다"로 처리한다.
 *
 * 예외를 던지지 않는 이유: 이 값이 없을 때의 행동이 "멈추고 안내"로 하나뿐이라,
 * 부르는 쪽마다 try/catch 를 두는 것보다 `null` 한 갈래가 읽기 쉽다.
 */
export async function fetchRecordPromptL1(installId: string): Promise<string | null> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.prompt;

  if (!ENDPOINT || !SUPABASE_ANON_KEY) return null;

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
    if (!res.ok) return null;

    const body = (await res.json()) as { prompt?: unknown; ttlSec?: unknown };
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (prompt.length === 0) return null;

    const ttlSec = typeof body.ttlSec === 'number' && body.ttlSec > 0 ? body.ttlSec : 3600;
    cached = { prompt, expiresAt: now + ttlSec * 1000 };
    return prompt;
  } catch {
    // 끊겼거나 느리거나 형식이 어긋났다 — 어느 쪽이든 초안은 만들지 않는다.
    return null;
  }
}
