import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { SigV2SignatureEntryPointer } from './sigRetention.ts';
import {
  runSigRetentionCleanup,
  SIG_STORAGE_REMOVE_CHUNK,
  type SigRetentionCleanupStore,
} from './sigRetentionCleanup.ts';

const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-11-10T03:00:00.000Z');

interface FakeState {
  due: string[];
  reopened: Set<string>;
  entries: Map<string, SigV2SignatureEntryPointer[]>;
  failRemoveFor: Set<string>;
  removed: string[][];
  cleared: string[][];
  marked: string[];
}

function fakeStore(state: FakeState): SigRetentionCleanupStore {
  return {
    listDueSessionIds: async () => [...state.due],
    isSessionStillDue: async (id) => !state.reopened.has(id),
    listImageEntries: async (id) => state.entries.get(id) ?? [],
    removeObjects: async (keys) => {
      if (keys.some((k) => [...state.failRemoveFor].some((s) => k.startsWith(`${s}/`)))) {
        throw new Error('storage down');
      }
      state.removed.push(keys);
    },
    clearEntryImages: async (ids) => {
      state.cleared.push(ids);
    },
    markSessionImagesDeleted: async (id) => {
      state.marked.push(id);
    },
  };
}

function baseState(): FakeState {
  return {
    due: [],
    reopened: new Set(),
    entries: new Map(),
    failRemoveFor: new Set(),
    removed: [],
    cleared: [],
    marked: [],
  };
}

Deno.test(
  '만료 세션의 이미지를 Storage API 로 지우고 행 포인터를 비운 뒤 세션을 완료로 표시한다',
  async () => {
    const state = baseState();
    state.due = [S1];
    state.entries.set(S1, [
      { id: 'e1', signature_object_key: `${S1}/a.png` },
      { id: 'e2', signature_object_key: `${S1}/b.png` },
    ]);

    const result = await runSigRetentionCleanup(fakeStore(state), NOW);

    assertEquals(state.removed, [[`${S1}/a.png`, `${S1}/b.png`]]);
    assertEquals(state.cleared, [['e1', 'e2']]);
    assertEquals(state.marked, [S1]);
    assertEquals(result, {
      dueSessions: 1,
      completedSessions: 1,
      removedObjects: 2,
      skippedKeys: 0,
      failedSessions: 0,
    });
  },
);

Deno.test('이미지가 이미 없는 만료 세션도 완료로 표시한다', async () => {
  const state = baseState();
  state.due = [S1];

  const result = await runSigRetentionCleanup(fakeStore(state), NOW);

  assertEquals(state.removed, []);
  assertEquals(state.cleared, []);
  assertEquals(state.marked, [S1]);
  assertEquals(result.completedSessions, 1);
});

Deno.test('세션 경로가 아닌 이미지는 지우지 않고 세션도 완료로 표시하지 않는다', async () => {
  const state = baseState();
  state.due = [S1];
  state.entries.set(S1, [
    { id: 'e1', signature_object_key: `${S1}/a.png` },
    { id: 'e2', signature_object_key: `${S2}/other.png` },
  ]);

  const result = await runSigRetentionCleanup(fakeStore(state), NOW);

  assertEquals(state.removed, [[`${S1}/a.png`]]);
  assertEquals(state.cleared, [['e1']]);
  assertEquals(state.marked, []);
  assertEquals(result.skippedKeys, 1);
  assertEquals(result.completedSessions, 0);
});

Deno.test('지우기 직전에 다시 열린 세션은 건드리지 않는다', async () => {
  const state = baseState();
  state.due = [S1];
  state.reopened.add(S1);
  state.entries.set(S1, [{ id: 'e1', signature_object_key: `${S1}/a.png` }]);

  const result = await runSigRetentionCleanup(fakeStore(state), NOW);

  assertEquals(state.removed, []);
  assertEquals(state.cleared, []);
  assertEquals(state.marked, []);
  assertEquals(result.completedSessions, 0);
});

Deno.test(
  '한 세션이 실패해도 다른 세션은 계속 정리하고, 실패한 세션은 포인터를 비우지 않는다',
  async () => {
    const state = baseState();
    state.due = [S1, S2];
    state.failRemoveFor.add(S1);
    state.entries.set(S1, [{ id: 'e1', signature_object_key: `${S1}/a.png` }]);
    state.entries.set(S2, [{ id: 'e2', signature_object_key: `${S2}/b.png` }]);
    const errors: string[] = [];

    const result = await runSigRetentionCleanup(fakeStore(state), NOW, (id) => errors.push(id));

    assertEquals(errors, [S1]);
    assertEquals(state.cleared, [['e2']]);
    assertEquals(state.marked, [S2]);
    assertEquals(result.failedSessions, 1);
    assertEquals(result.completedSessions, 1);
  },
);

Deno.test('이미지가 많으면 Storage 삭제 요청을 나눠 보낸다', async () => {
  const state = baseState();
  state.due = [S1];
  const total = SIG_STORAGE_REMOVE_CHUNK + 5;
  state.entries.set(
    S1,
    Array.from({ length: total }, (_, i) => ({
      id: `e${i}`,
      signature_object_key: `${S1}/${i}.png`,
    })),
  );

  const result = await runSigRetentionCleanup(fakeStore(state), NOW);

  assertEquals(
    state.removed.map((keys) => keys.length),
    [SIG_STORAGE_REMOVE_CHUNK, 5],
  );
  assertEquals(state.cleared[0].length, total);
  assertEquals(result.removedObjects, total);
});
