/**
 * 생기부 1층 프롬프트 배급 — 받아 오기·캐시·실패 갈래·한도(ADR-089).
 *
 * ★가장 중요한 것 둘:
 *   1. **규정 없이 진행하지 않는다.** 빈 문자열로 넘어가면 규정 없는 초안이 나간다.
 *   2. **전에 받아 둔 값이 있으면 그걸로 계속한다.** 서버가 잠깐 죽었다고 전국의 초안이
 *      멈추면 안 된다. 단 그 폴백에는 **상한(24시간)** 이 있다 — 규정은 학사 기재요령에
 *      매인 문서라 무한정 낡은 것을 쓰면 폐지된 규정으로 초안을 쓰는 셈이 된다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/** 모듈 최상단에서 env 를 읽으므로, 매번 새로 import 해야 값이 반영된다. */
async function load() {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  return import('../RecordPromptClient');
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function limited(kind: 'minute' | 'day') {
  return { ok: false, status: 429, json: async () => ({ retryAfterKind: kind }) };
}

const HOUR = 60 * 60 * 1000;

describe('프롬프트 받아 오기', () => {
  it('서버가 준 본문과 판본을 그대로 돌려준다', async () => {
    const { fetchRecordPromptL1 } = await load();
    fetchMock.mockResolvedValue(ok({ prompt: '규정 본문', ttlSec: 3600, version: 3 }));

    await expect(fetchRecordPromptL1('install-1234')).resolves.toEqual({
      ok: true,
      prompt: '규정 본문',
      version: 3,
      stale: false,
    });
  });

  it('설치 식별자를 함께 보낸다 — 아무나 무한정 긁어 가지 못하게', async () => {
    const { fetchRecordPromptL1 } = await load();
    fetchMock.mockResolvedValue(ok({ prompt: '규정 본문' }));

    await fetchRecordPromptL1('install-1234');

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { installId?: string };
    expect(body.installId).toBe('install-1234');
  });

  it('한 번 받으면 다시 부르지 않는다 — 초안을 여러 편 써도 왕복은 한 번이다', async () => {
    const { fetchRecordPromptL1 } = await load();
    fetchMock.mockResolvedValue(ok({ prompt: '규정 본문', ttlSec: 3600 }));

    await fetchRecordPromptL1('install-1234');
    await fetchRecordPromptL1('install-1234');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('유효기간이 지나면 다시 받는다', async () => {
    const { fetchRecordPromptL1 } = await load();
    fetchMock.mockResolvedValue(ok({ prompt: '규정 본문', ttlSec: 1 }));

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-05T00:00:00Z'));
    await fetchRecordPromptL1('install-1234');
    vi.setSystemTime(new Date('2026-09-05T00:00:05Z'));
    await fetchRecordPromptL1('install-1234');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('판본을 안 주는 옛 서버여도 진행한다 — 판본은 0 으로 본다', async () => {
    const { fetchRecordPromptL1 } = await load();
    fetchMock.mockResolvedValue(ok({ prompt: '규정 본문' }));

    const r = await fetchRecordPromptL1('install-1234');
    expect(r).toEqual({ ok: true, prompt: '규정 본문', version: 0, stale: false });
  });
});

describe('★받아 온 적이 없으면 멈춘다 — 규정 없이 초안을 만들지 않는다', () => {
  it('서버가 503(프롬프트 미설정)이면 unavailable', async () => {
    const { fetchRecordPromptL1 } = await load();
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

    await expect(fetchRecordPromptL1('install-1234')).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('연결이 끊겨도 던지지 않는다', async () => {
    const { fetchRecordPromptL1 } = await load();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(fetchRecordPromptL1('install-1234')).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('본문이 비어 있으면 진행하지 않는다 — 빈 규정으로 초안을 쓰지 않는다', async () => {
    const { fetchRecordPromptL1 } = await load();
    fetchMock.mockResolvedValue(ok({ prompt: '   ' }));

    await expect(fetchRecordPromptL1('install-1234')).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('실패는 캐시하지 않는다 — 다음에 다시 시도한다', async () => {
    const { fetchRecordPromptL1 } = await load();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    fetchMock.mockResolvedValueOnce(ok({ prompt: '규정 본문' }));

    await expect(fetchRecordPromptL1('install-1234')).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    });
    await expect(fetchRecordPromptL1('install-1234')).resolves.toMatchObject({
      ok: true,
      prompt: '규정 본문',
    });
  });

  it('서버 주소가 설정돼 있지 않으면 부르지도 않는다', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const { fetchRecordPromptL1 } = await import('../RecordPromptClient');

    await expect(fetchRecordPromptL1('install-1234')).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('★한도(429) — 사유가 다르면 안내도 다르다', () => {
  it('분당 한도는 rate-limited-minute', async () => {
    const { fetchRecordPromptL1 } = await load();
    fetchMock.mockResolvedValue(limited('minute'));

    await expect(fetchRecordPromptL1('install-1234')).resolves.toEqual({
      ok: false,
      reason: 'rate-limited-minute',
    });
  });

  it('일간 한도는 rate-limited-day — 분당과 같은 안내를 하면 안 된다', async () => {
    const { fetchRecordPromptL1 } = await load();
    fetchMock.mockResolvedValue(limited('day'));

    await expect(fetchRecordPromptL1('install-1234')).resolves.toEqual({
      ok: false,
      reason: 'rate-limited-day',
    });
  });

  it('사유를 안 주면 짧은 쪽(분당)으로 본다', async () => {
    const { fetchRecordPromptL1 } = await load();
    fetchMock.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });

    await expect(fetchRecordPromptL1('install-1234')).resolves.toEqual({
      ok: false,
      reason: 'rate-limited-minute',
    });
  });

  it('429 본문이 JSON 이 아니어도 던지지 않는다', async () => {
    const { fetchRecordPromptL1 } = await load();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => {
        throw new SyntaxError('not json');
      },
    });

    await expect(fetchRecordPromptL1('install-1234')).resolves.toEqual({
      ok: false,
      reason: 'rate-limited-minute',
    });
  });
});

describe('★만료된 캐시 폴백 — 서버가 죽어도 초안은 계속 만들어진다', () => {
  /** 한 번 받아 캐시를 채운 뒤, 유효기간을 넘긴 시점으로 시계를 옮긴다. */
  async function primedThen(advanceMs: number) {
    const { fetchRecordPromptL1 } = await load();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-05T00:00:00Z'));
    fetchMock.mockResolvedValueOnce(ok({ prompt: '규정 본문', ttlSec: 3600, version: 2 }));
    await fetchRecordPromptL1('install-1234');
    vi.setSystemTime(new Date('2026-09-05T00:00:00Z').getTime() + advanceMs);
    return fetchRecordPromptL1;
  }

  it('429 여도 만료 캐시가 있으면 그걸 쓴다 — 화면에 한도 안내가 뜨지도 않는다', async () => {
    const fetchRecordPromptL1 = await primedThen(2 * HOUR);
    fetchMock.mockResolvedValue(limited('minute'));

    await expect(fetchRecordPromptL1('install-1234')).resolves.toEqual({
      ok: true,
      prompt: '규정 본문',
      version: 2,
      stale: true,
    });
  });

  it('서버 500 이어도 만료 캐시로 계속한다', async () => {
    const fetchRecordPromptL1 = await primedThen(2 * HOUR);
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    await expect(fetchRecordPromptL1('install-1234')).resolves.toMatchObject({
      ok: true,
      stale: true,
    });
  });

  it('연결이 끊겨도 만료 캐시로 계속한다', async () => {
    const fetchRecordPromptL1 = await primedThen(2 * HOUR);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(fetchRecordPromptL1('install-1234')).resolves.toMatchObject({
      ok: true,
      stale: true,
    });
  });

  it('★상한(만료 후 24시간)을 넘기면 폴백하지 않는다 — 폐지된 규정으로 쓰지 않는다', async () => {
    // 유효기간 1시간 + 상한 24시간 = 25시간. 그 뒤 30분을 더 간다.
    const fetchRecordPromptL1 = await primedThen(25 * HOUR + 30 * 60 * 1000);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(fetchRecordPromptL1('install-1234')).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('상한 안이면 여러 번 실패해도 계속 stale 로 준다', async () => {
    const fetchRecordPromptL1 = await primedThen(10 * HOUR);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(fetchRecordPromptL1('install-1234')).resolves.toMatchObject({ stale: true });
    await expect(fetchRecordPromptL1('install-1234')).resolves.toMatchObject({ stale: true });
  });

  it('다시 받아 오면 stale 이 풀리고 판본도 새것이 된다', async () => {
    const fetchRecordPromptL1 = await primedThen(2 * HOUR);
    fetchMock.mockResolvedValue(ok({ prompt: '새 규정 본문', ttlSec: 3600, version: 3 }));

    await expect(fetchRecordPromptL1('install-1234')).resolves.toEqual({
      ok: true,
      prompt: '새 규정 본문',
      version: 3,
      stale: false,
    });
  });
});
