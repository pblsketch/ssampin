/**
 * SnapshotLocalStorage — localStorage 3키 보관 스냅샷 (S2.3, 계획 §6.2).
 * ① 스냅샷 조립(존재 키만·원문 그대로) ② 쓰기 후 재독 검증(함정 ⑪ — data:write 실패 은닉)
 * ③ 게이트웨이 데코레이터가 archive:create 대상에 스냅샷 파일을 추가(유즈케이스 무수정).
 */
import { describe, expect, test, vi } from 'vitest';
import type { IStoragePort } from '../../../domain/ports/IStoragePort';
import type { YearTransitionGateway } from '../ExecuteYearTransition';
import {
  LOCAL_SNAPSHOT_KEY,
  LOCAL_SNAPSHOT_SOURCE_KEYS,
  buildLocalStorageSnapshot,
  withLocalSnapshotInArchive,
  writeLocalStorageSnapshot,
} from '../SnapshotLocalStorage';

class FakeStorage implements IStoragePort {
  readonly files = new Map<string, string>();
  swallowWrites = false; // data:write의 조용한 실패 모사(함정 ⑪)

  async read<T>(key: string): Promise<T | null> {
    const raw = this.files.get(key);
    return raw === undefined ? null : (JSON.parse(raw) as T);
  }
  async write<T>(key: string, data: T): Promise<void> {
    if (this.swallowWrites) return;
    this.files.set(key, JSON.stringify(data));
  }
  async remove(key: string): Promise<void> {
    this.files.delete(key);
  }
  async readBinary(): Promise<Uint8Array | null> {
    return null;
  }
  async writeBinary(): Promise<void> {}
  async removeBinary(): Promise<void> {}
  async listBinary(): Promise<readonly string[]> {
    return [];
  }
}

describe('buildLocalStorageSnapshot', () => {
  test('존재하는 키만 원문 그대로 담는다(부재 키는 지어내지 않음)', () => {
    const values: Record<string, string> = {
      'ssampin:grade-cut-settings-v1': '{"cut":90}',
      ssampin_sigv2_rosters: '[{"id":"r1"}]',
    };
    const snapshot = buildLocalStorageSnapshot(
      '2026-1',
      (k) => values[k] ?? null,
      new Date('2026-08-06T09:00:00.000Z'),
    );
    expect(snapshot).toEqual({
      version: 1,
      closingTerm: '2026-1',
      capturedAt: '2026-08-06T09:00:00.000Z',
      entries: {
        'ssampin:grade-cut-settings-v1': '{"cut":90}',
        ssampin_sigv2_rosters: '[{"id":"r1"}]',
      },
    });
  });

  test('보관 대상은 정확히 계획 §6.2의 3키다', () => {
    expect([...LOCAL_SNAPSHOT_SOURCE_KEYS]).toEqual([
      'ssampin:grade-cut-settings-v1',
      'ssampin:grade-confirm-v1',
      'ssampin_sigv2_rosters',
    ]);
  });

  test('읽기 접근이 throw해도 스냅샷 자체는 만들어진다(해당 키만 부재 취급)', () => {
    const snapshot = buildLocalStorageSnapshot('2026-1', () => {
      throw new Error('접근 불가');
    });
    expect(snapshot.entries).toEqual({});
  });
});

describe('writeLocalStorageSnapshot — 재독 검증(함정 ⑪)', () => {
  const snapshot = buildLocalStorageSnapshot('2026-1', () => null);

  test('정상 쓰기 → 파일에 그대로 남는다', async () => {
    const storage = new FakeStorage();
    await writeLocalStorageSnapshot(storage, snapshot);
    expect(JSON.parse(storage.files.get(LOCAL_SNAPSHOT_KEY)!)).toEqual(snapshot);
  });

  test('쓰기가 조용히 삼켜지면 throw — 전환을 시작하기 전에 멈춘다', async () => {
    const storage = new FakeStorage();
    storage.swallowWrites = true;
    await expect(writeLocalStorageSnapshot(storage, snapshot)).rejects.toThrow(
      '데이터는 그대로 있어요',
    );
  });
});

describe('withLocalSnapshotInArchive — 게이트웨이 데코레이터', () => {
  function fakeGateway() {
    const archiveCreate = vi.fn(async (_term: string, _fileKeys: string[]) => ({
      ok: true as const,
      term: '2026-1',
      label: 'x',
      entryCount: 0,
      totalBytes: 0,
    }));
    const gateway: YearTransitionGateway = {
      createSafetyBackup: vi.fn(async () => ({ ok: true as const, path: 'C:/fake' })),
      archiveCreate,
      archiveRead: vi.fn(async () => ({
        ok: true as const,
        encoding: 'utf8' as const,
        content: '{}',
      })),
    };
    return { gateway, archiveCreate };
  }

  test('archive:create 대상에 local-snapshot을 정확히 1회 추가한다', async () => {
    const { gateway, archiveCreate } = fakeGateway();
    const wrapped = withLocalSnapshotInArchive(gateway);
    await wrapped.archiveCreate('2026-1', ['students', 'attendance'], { label: '라벨' });
    expect(archiveCreate).toHaveBeenCalledWith(
      '2026-1',
      ['students', 'attendance', LOCAL_SNAPSHOT_KEY],
      { label: '라벨' },
    );
  });

  test('이미 포함돼 있으면 중복 추가하지 않는다', async () => {
    const { gateway, archiveCreate } = fakeGateway();
    const wrapped = withLocalSnapshotInArchive(gateway);
    await wrapped.archiveCreate('2026-1', ['students', LOCAL_SNAPSHOT_KEY], undefined);
    const call = archiveCreate.mock.calls[0]!;
    expect(call[1]).toEqual(['students', LOCAL_SNAPSHOT_KEY]);
  });

  test('나머지 채널은 그대로 위임한다', async () => {
    const { gateway } = fakeGateway();
    const wrapped = withLocalSnapshotInArchive(gateway);
    await wrapped.createSafetyBackup();
    await wrapped.archiveRead('2026-1', 'manifest.json');
    expect(gateway.createSafetyBackup).toHaveBeenCalledTimes(1);
    expect(gateway.archiveRead).toHaveBeenCalledWith('2026-1', 'manifest.json');
  });
});
