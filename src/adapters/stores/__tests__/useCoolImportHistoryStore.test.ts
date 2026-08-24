/**
 * 쿨메신저 가져온 기록 스토어 — 조회 캐시 회귀 테스트 (2026-08-24 UltraQA P2).
 *
 * 잠그는 계약:
 *  1. `isImported`/`hasImportedFrom` 는 **history 가 바뀔 때만** Set 을 다시 만든다.
 *     (전에는 호출마다 새로 만들어, 렌더 한 번에 기록 수 × 카드 수만큼 낭비됐다)
 *  2. 캐시 때문에 **새 기록이 낡게 보이면 안 된다** — remember 직후 조회에 반영된다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CoolImportItem } from '@domain/entities/CoolMessage';

vi.mock('@adapters/di/container', () => ({
  coolImportHistoryRepository: {
    load: vi.fn(async (): Promise<unknown> => ({ records: [] })),
    save: vi.fn(async () => undefined),
  },
}));

// Set 생성 함수에 스파이를 심어 "몇 번 다시 만들었는지"를 센다
vi.mock('@domain/rules/coolImportHistory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@domain/rules/coolImportHistory')>();
  return {
    ...actual,
    importedKeySet: vi.fn(actual.importedKeySet),
    importedMessageKeys: vi.fn(actual.importedMessageKeys),
  };
});

const { useCoolImportHistoryStore } = await import('@adapters/stores/useCoolImportHistoryStore');
const { EMPTY_COOL_HISTORY, importKey, importedKeySet, importedMessageKeys } =
  await import('@domain/rules/coolImportHistory');

function item(messageKey: number, start: Date): CoolImportItem {
  return {
    sourceMessageKey: messageKey,
    title: '학폭위 심의',
    start,
    end: null,
    allDay: false,
    target: 'event',
  };
}

const START = new Date(2026, 7, 27, 14, 0);

beforeEach(() => {
  useCoolImportHistoryStore.setState({ history: EMPTY_COOL_HISTORY, loaded: true });
  vi.mocked(importedKeySet).mockClear();
  vi.mocked(importedMessageKeys).mockClear();
});

describe('★ history 가 그대로면 Set 을 다시 만들지 않는다', () => {
  it('조회를 아무리 반복해도 각 Set 은 한 번만 만든다', () => {
    const { isImported, hasImportedFrom } = useCoolImportHistoryStore.getState();
    for (let i = 0; i < 200; i += 1) {
      isImported('1|x|event');
      hasImportedFrom(i);
    }
    expect(vi.mocked(importedKeySet).mock.calls.length).toBeLessThanOrEqual(1);
    expect(vi.mocked(importedMessageKeys).mock.calls.length).toBeLessThanOrEqual(1);
  });
});

describe('★ 캐시가 새 기록을 가리면 안 된다', () => {
  it('remember 직후 조회에 새 항목이 바로 반영된다', async () => {
    const store = useCoolImportHistoryStore.getState();
    const key = importKey(7, START.toISOString(), 'event');
    expect(store.isImported(key)).toBe(false);
    expect(store.hasImportedFrom(7)).toBe(false);

    const callsBefore = vi.mocked(importedKeySet).mock.calls.length;
    await store.remember([item(7, START)]);

    expect(useCoolImportHistoryStore.getState().isImported(key)).toBe(true);
    expect(useCoolImportHistoryStore.getState().hasImportedFrom(7)).toBe(true);
    // history 가 교체됐으니 정확히 한 번 더 만들었어야 한다 (그 이상도 이하도 아니게)
    expect(vi.mocked(importedKeySet).mock.calls.length).toBe(callsBefore + 1);
  });

  it('load 로 history 가 통째로 바뀌어도 반영된다', async () => {
    const store = useCoolImportHistoryStore.getState();
    expect(store.hasImportedFrom(1)).toBe(false);

    const { coolImportHistoryRepository } = await import('@adapters/di/container');
    vi.mocked(coolImportHistoryRepository.load).mockResolvedValueOnce({
      records: [
        {
          messageKey: 1,
          startsAt: START.toISOString(),
          target: 'event',
          importedAt: new Date(2026, 7, 20).toISOString(),
        },
      ],
    });
    await store.load();

    expect(useCoolImportHistoryStore.getState().hasImportedFrom(1)).toBe(true);
  });
});
