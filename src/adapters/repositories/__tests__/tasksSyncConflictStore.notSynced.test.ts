/**
 * 충돌 기록이 **동기화 대상이 아님**을 강제하는 메타 테스트 + 저장 계약.
 *
 * 주석만으로는 깨진다 — 누군가 "기록도 기기 간에 맞추자"며 `SYNC_REGISTRY` 에 한 줄 넣으면
 * 다른 기기가 같은 충돌을 또 기록하고 지운 기록이 되살아난다.
 * 선례: `todoAlarmDeviceState.notSynced.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYNC_REGISTRY } from '@usecases/sync/syncRegistry';
import type { TasksSyncConflict } from '@domain/entities/TasksSyncConflict';

const store = new Map<string, unknown>();
let failWrites = false;

vi.mock('@adapters/di/container', () => ({
  storage: {
    read: vi.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
    write: vi.fn(async (key: string, value: unknown) => {
      if (failWrites) throw new Error('disk full');
      store.set(key, value);
    }),
    remove: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  },
}));

import {
  TASKS_SYNC_CONFLICTS_KEY,
  clearTasksSyncConflictsStorage,
  readTasksSyncConflicts,
  writeTasksSyncConflicts,
} from '../tasksSyncConflictStore';

function rec(n: number): TasksSyncConflict {
  return {
    id: `c${n}`,
    kind: 'edit-edit',
    todoId: `t${n}`,
    googleTaskId: `g${n}`,
    detectedAt: '2026-10-14T12:00:00.000Z',
    remoteUpdatedAt: '2026-10-14T11:00:00.000Z',
    local: { text: '쌤핀 제목', completed: false },
    remote: { text: '구글 제목', notes: '메모', dueDate: '2026-10-20', completed: true },
  };
}

beforeEach(() => {
  store.clear();
  failWrites = false;
});

describe('tasks-sync-conflicts 는 동기화하지 않는다', () => {
  it('SYNC_REGISTRY 에 등재되어 있지 않다', () => {
    expect(SYNC_REGISTRY.map((d) => d.fileName)).not.toContain(TASKS_SYNC_CONFLICTS_KEY);
  });

  it('키 이름이 바뀌어도 검사가 무력해지지 않는다 — 상수를 그대로 쓴다', () => {
    expect(TASKS_SYNC_CONFLICTS_KEY).toBe('tasks-sync-conflicts');
  });

  it('참고: 할 일 파일은 동기화 대상이다 — 기록을 거기 두지 않은 이유', () => {
    expect(SYNC_REGISTRY.map((d) => d.fileName)).toContain('todos');
  });
});

describe('저장 계약', () => {
  it('쓴 것을 그대로 읽는다', async () => {
    expect(await writeTasksSyncConflicts([rec(1), rec(2)])).toBe(true);
    const read = await readTasksSyncConflicts();
    expect(read).toEqual([rec(1), rec(2)]);
  });

  it('기록이 없으면 빈 목록이다', async () => {
    expect(await readTasksSyncConflicts()).toEqual([]);
  });

  it('손상된 값(배열이 아님)은 빈 목록이다', async () => {
    store.set(TASKS_SYNC_CONFLICTS_KEY, { not: 'an array' });
    expect(await readTasksSyncConflicts()).toEqual([]);
  });

  it('형식이 맞지 않는 항목만 걸러 낸다', async () => {
    store.set(TASKS_SYNC_CONFLICTS_KEY, [
      rec(1),
      {
        id: 'bad',
        kind: 'unknown-kind',
        todoId: 't',
        googleTaskId: 'g',
        detectedAt: 'x',
        local: { text: 'a', completed: false },
      },
      { id: 'bad2' },
      null,
      rec(3),
    ]);
    const read = await readTasksSyncConflicts();
    expect(read.map((c) => c.id)).toEqual(['c1', 'c3']);
  });

  it('20개를 넘게 저장하려 해도 20개만 남긴다', async () => {
    const many = Array.from({ length: 25 }, (_, i) => rec(i + 1));
    await writeTasksSyncConflicts(many);
    expect((await readTasksSyncConflicts()).length).toBe(20);
  });

  it('쓰기 실패는 예외 대신 false 다', async () => {
    failWrites = true;
    expect(await writeTasksSyncConflicts([rec(1)])).toBe(false);
  });

  it('지우면 읽을 것이 없다', async () => {
    await writeTasksSyncConflicts([rec(1)]);
    expect(await clearTasksSyncConflictsStorage()).toBe(true);
    expect(await readTasksSyncConflicts()).toEqual([]);
  });
});
