/**
 * JsonSeatingSnapshotRepository 단위 테스트.
 *
 * IStoragePort 를 메모리 fake 로 대체하여 순수 동작만 검증한다.
 * - 최신순 정렬 보장
 * - 50개 초과 시 가장 오래된 항목 자동 삭제
 * - deleteSnapshot / clearAll 의 멱등성
 */
import { describe, expect, it, beforeEach } from 'vitest';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { SeatingSnapshot } from '@domain/entities/SeatingSnapshot';
import type { SeatingData } from '@domain/entities/Seating';
import { JsonSeatingSnapshotRepository } from '../JsonSeatingSnapshotRepository';

const SAMPLE_SEATING: SeatingData = {
  rows: 2,
  cols: 2,
  seats: [
    ['s1', 's2'],
    ['s3', null],
  ],
};

/** 메모리 fake storage. read/write 만 사용한다. */
function createFakeStorage(): IStoragePort {
  const store = new Map<string, unknown>();
  return {
    async read<T>(filename: string): Promise<T | null> {
      const v = store.get(filename);
      return v === undefined ? null : (v as T);
    },
    async write<T>(filename: string, data: T): Promise<void> {
      store.set(filename, data);
    },
    async remove(filename: string): Promise<void> {
      store.delete(filename);
    },
    async readBinary(): Promise<Uint8Array | null> {
      throw new Error('not used');
    },
    async writeBinary(): Promise<void> {
      throw new Error('not used');
    },
    async removeBinary(): Promise<void> {
      throw new Error('not used');
    },
    async listBinary(): Promise<readonly string[]> {
      throw new Error('not used');
    },
  };
}

function makeSnapshot(id: string, timestamp: number): SeatingSnapshot {
  return {
    id,
    timestamp,
    label: `snap-${id}`,
    source: 'manual',
    seating: SAMPLE_SEATING,
  };
}

describe('JsonSeatingSnapshotRepository', () => {
  let storage: IStoragePort;
  let repo: JsonSeatingSnapshotRepository;

  beforeEach(() => {
    storage = createFakeStorage();
    repo = new JsonSeatingSnapshotRepository(storage);
  });

  it('미존재 시 빈 배열 반환', async () => {
    const list = await repo.getSnapshots();
    expect(list).toEqual([]);
  });

  it('저장 후 timestamp DESC (최신순) 로 정렬되어 반환', async () => {
    await repo.saveSnapshot(makeSnapshot('a', 100));
    await repo.saveSnapshot(makeSnapshot('b', 300));
    await repo.saveSnapshot(makeSnapshot('c', 200));

    const list = await repo.getSnapshots();
    expect(list.map((s) => s.id)).toEqual(['b', 'c', 'a']);
  });

  it('50개 초과 저장 시 가장 오래된 항목 자동 삭제 (최신 50개만 유지)', async () => {
    // 0~54 까지 55개를 timestamp 순서대로 저장
    for (let i = 0; i < 55; i++) {
      await repo.saveSnapshot(makeSnapshot(`s${i}`, i * 10));
    }

    const list = await repo.getSnapshots();
    expect(list).toHaveLength(50);
    // 최신순 → 첫 번째는 가장 큰 timestamp
    expect(list[0]?.id).toBe('s54');
    // 마지막은 50번째로 최신 → s5
    expect(list[49]?.id).toBe('s5');
    // 가장 오래된 s0~s4 는 모두 제거됨
    expect(list.find((s) => s.id === 's0')).toBeUndefined();
    expect(list.find((s) => s.id === 's4')).toBeUndefined();
  });

  it('deleteSnapshot — 해당 ID 만 제거되고 나머지 유지', async () => {
    await repo.saveSnapshot(makeSnapshot('a', 100));
    await repo.saveSnapshot(makeSnapshot('b', 200));
    await repo.saveSnapshot(makeSnapshot('c', 300));

    await repo.deleteSnapshot('b');

    const list = await repo.getSnapshots();
    expect(list.map((s) => s.id)).toEqual(['c', 'a']);
  });

  it('deleteSnapshot — 미존재 ID 는 no-op (오류 없이 통과)', async () => {
    await repo.saveSnapshot(makeSnapshot('a', 100));
    await expect(repo.deleteSnapshot('nonexistent')).resolves.toBeUndefined();

    const list = await repo.getSnapshots();
    expect(list).toHaveLength(1);
  });

  it('clearAll 후 빈 배열 반환', async () => {
    await repo.saveSnapshot(makeSnapshot('a', 100));
    await repo.saveSnapshot(makeSnapshot('b', 200));

    await repo.clearAll();

    const list = await repo.getSnapshots();
    expect(list).toEqual([]);
  });
});
