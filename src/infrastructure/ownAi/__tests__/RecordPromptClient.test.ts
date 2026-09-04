/**
 * 생기부 1층 프롬프트 배급 — 받아 오기·캐시·실패 갈래.
 *
 * ★가장 중요한 것: **못 받아 오면 `null`** 이다. 부르는 쪽은 그때 초안을 만들지 않는다.
 *   여기서 "그래도 빈 문자열로 진행"이 되면 규정 없는 초안이 나간다.
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
});

function ok(body: unknown) {
  return { ok: true, json: async () => body };
}

describe('프롬프트 받아 오기', () => {
  it('서버가 준 본문을 그대로 돌려준다', async () => {
    const { fetchRecordPromptL1 } = await load();
    fetchMock.mockResolvedValue(ok({ prompt: '규정 본문', ttlSec: 3600 }));

    await expect(fetchRecordPromptL1('install-1234')).resolves.toBe('규정 본문');
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
    try {
      vi.setSystemTime(new Date('2026-09-05T00:00:00Z'));
      await fetchRecordPromptL1('install-1234');
      vi.setSystemTime(new Date('2026-09-05T00:00:05Z'));
      await fetchRecordPromptL1('install-1234');
    } finally {
      vi.useRealTimers();
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('★못 받아 오면 null — 그 상태로 초안을 만들지 않는다', () => {
  it('서버가 503(프롬프트 미설정)이면 null', async () => {
    const { fetchRecordPromptL1 } = await load();
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

    await expect(fetchRecordPromptL1('install-1234')).resolves.toBeNull();
  });

  it('연결이 끊겨도 던지지 않고 null', async () => {
    const { fetchRecordPromptL1 } = await load();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(fetchRecordPromptL1('install-1234')).resolves.toBeNull();
  });

  it('본문이 비어 있으면 null — 빈 규정으로 진행하지 않는다', async () => {
    const { fetchRecordPromptL1 } = await load();
    fetchMock.mockResolvedValue(ok({ prompt: '   ' }));

    await expect(fetchRecordPromptL1('install-1234')).resolves.toBeNull();
  });

  it('실패는 캐시하지 않는다 — 다음에 다시 시도한다', async () => {
    const { fetchRecordPromptL1 } = await load();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
    fetchMock.mockResolvedValueOnce(ok({ prompt: '규정 본문' }));

    await expect(fetchRecordPromptL1('install-1234')).resolves.toBeNull();
    await expect(fetchRecordPromptL1('install-1234')).resolves.toBe('규정 본문');
  });

  it('서버 주소가 설정돼 있지 않으면 부르지도 않는다', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const { fetchRecordPromptL1 } = await import('../RecordPromptClient');

    await expect(fetchRecordPromptL1('install-1234')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
