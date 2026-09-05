/**
 * 모델 목록 배급.
 *
 * ★가장 중요한 것: **어떤 경우에도 목록이 비지 않는다.** 서버가 죽어도, 형식이 깨져도
 *   앱 기본값이 나온다. 생기부 규정과 정반대 성격이다 — 규정은 없으면 멈춰야 하지만,
 *   모델 목록이 없다고 기능을 멈출 이유가 없다.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { OWN_AI_MODELS } from '@domain/rules/ownAiCliRules';

async function load() {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  return import('../AiModelCatalogClient');
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

const GOOD = {
  claude: [
    { id: '', label: '기본' },
    { id: 'fable', label: 'Fable' },
  ],
  codex: [{ id: '', label: '기본' }],
};

describe('서버가 준 목록을 쓴다', () => {
  it('받아 온 목록을 그대로 돌려준다', async () => {
    const { fetchModelCatalog } = await load();
    fetchMock.mockResolvedValue(ok({ catalog: GOOD, ttlSec: 3600 }));

    const c = await fetchModelCatalog('install-1234');

    expect(c.claude.map((m) => m.id)).toEqual(['', 'fable']);
  });

  it('한 번 받으면 다시 부르지 않는다', async () => {
    const { fetchModelCatalog } = await load();
    fetchMock.mockResolvedValue(ok({ catalog: GOOD, ttlSec: 3600 }));

    await fetchModelCatalog('install-1234');
    await fetchModelCatalog('install-1234');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('설치 식별자를 함께 보낸다', async () => {
    const { fetchModelCatalog } = await load();
    fetchMock.mockResolvedValue(ok({ catalog: GOOD }));

    await fetchModelCatalog('install-1234');

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { installId?: string };
    expect(body.installId).toBe('install-1234');
  });
});

describe('★못 받아도 목록이 비지 않는다', () => {
  it('서버가 실패하면 앱 기본값', async () => {
    const { fetchModelCatalog } = await load();
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    await expect(fetchModelCatalog('install-1234')).resolves.toEqual(OWN_AI_MODELS);
  });

  it('연결이 끊겨도 던지지 않고 기본값', async () => {
    const { fetchModelCatalog } = await load();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(fetchModelCatalog('install-1234')).resolves.toEqual(OWN_AI_MODELS);
  });

  it('서버 주소가 없으면 부르지도 않고 기본값', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const { fetchModelCatalog } = await import('../AiModelCatalogClient');

    await expect(fetchModelCatalog('install-1234')).resolves.toEqual(OWN_AI_MODELS);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('★형식이 어긋나면 통째로 버린다 — 반쪽 목록을 쓰지 않는다', () => {
  it.each([
    ['공급자 하나가 없음', { claude: GOOD.claude }],
    ['빈 배열', { claude: [], codex: GOOD.codex }],
    ['id 가 문자열이 아님', { claude: [{ id: 1, label: 'x' }], codex: GOOD.codex }],
    ['라벨이 빈 문자열', { claude: [{ id: '', label: '  ' }], codex: GOOD.codex }],
    ['배열이 아님', { claude: 'nope', codex: GOOD.codex }],
  ])('%s → 기본값', async (_name, bad) => {
    const { fetchModelCatalog } = await load();
    fetchMock.mockResolvedValue(ok({ catalog: bad }));

    await expect(fetchModelCatalog('install-1234')).resolves.toEqual(OWN_AI_MODELS);
  });
});

describe('기본값 자체가 쓸 만한가', () => {
  it('두 공급자 모두 "기본" 항목을 첫 번째로 갖는다', () => {
    for (const p of ['claude', 'codex'] as const) {
      expect(OWN_AI_MODELS[p][0]?.id).toBe('');
    }
  });

  it('★claude 는 별칭만 쓴다 — 별칭이라야 새 모델이 나와도 따라간다', () => {
    // 실측(2026-09-05): opus→claude-opus-5 처럼 별칭이 계열의 최신을 가리킨다.
    // 전체 이름(claude-opus-5)을 적어 두면 새 판이 나올 때 옛 모델에 고정된다.
    for (const m of OWN_AI_MODELS.claude) {
      expect(m.id).not.toMatch(/^claude-/);
    }
  });
});
