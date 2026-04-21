/**
 * 통합 테스트: Repository → IStoragePort(in-memory) 경로로 실제 JSON 직렬화 확인.
 * MEMORY feedback_runtime_verification: "동작한다"의 기준은 실제 파일 바이트.
 * 여기서는 in-memory fake를 쓰되 write()에 들어간 데이터를 그대로 검증한다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import { JsonScheduleRepository } from './JsonScheduleRepository';
import type { TimetableOverride, TimetableOverridesData } from '@domain/entities/Timetable';
import {
  upsertOverride,
  dedupeOverridesKeepLatest,
} from '@domain/rules/timetableRules';

class FakeStorage implements IStoragePort {
  readonly store = new Map<string, unknown>();
  // eslint-disable-next-line @typescript-eslint/require-await
  async read<T>(filename: string): Promise<T | null> {
    const v = this.store.get(filename);
    return (v === undefined ? null : (v as T));
  }
  // eslint-disable-next-line @typescript-eslint/require-await
  async write<T>(filename: string, data: T): Promise<void> {
    // JSON 직렬화 왕복을 강제 (실제 파일 저장소와 동일한 제약)
    this.store.set(filename, JSON.parse(JSON.stringify(data)));
  }
  // eslint-disable-next-line @typescript-eslint/require-await
  async remove(filename: string): Promise<void> {
    this.store.delete(filename);
  }
  getRaw(filename: string): unknown {
    return this.store.get(filename);
  }
  // eslint-disable-next-line @typescript-eslint/require-await
  async readBinary(_relPath: string): Promise<Uint8Array | null> { return null; }
  // eslint-disable-next-line @typescript-eslint/require-await
  async writeBinary(_relPath: string, _bytes: Uint8Array): Promise<void> { /* no-op */ }
  // eslint-disable-next-line @typescript-eslint/require-await
  async removeBinary(_relPath: string): Promise<void> { /* no-op */ }
  // eslint-disable-next-line @typescript-eslint/require-await
  async listBinary(_dirRelPath: string): Promise<readonly string[]> { return []; }
}

const mk = (partial: Partial<TimetableOverride>): TimetableOverride => ({
  id: partial.id ?? 'x',
  date: partial.date ?? '2026-04-22',
  period: partial.period ?? 3,
  subject: partial.subject ?? '수학',
  classroom: partial.classroom,
  reason: partial.reason,
  createdAt: partial.createdAt ?? '2026-01-01T00:00:00.000Z',
  updatedAt: partial.updatedAt,
});

let storage: FakeStorage;
let repo: JsonScheduleRepository;

describe('JsonScheduleRepository integration', () => {
  beforeEach(() => {
    storage = new FakeStorage();
    repo = new JsonScheduleRepository(storage);
  });

describe('S1: override write + re-read round-trip (file-byte equivalent)', () => {
  it('writes overrides to timetable-overrides key and reads back identically', async () => {
    const data: TimetableOverridesData = {
      overrides: [mk({ id: 'a', date: '2026-04-22', period: 3, subject: '자습', reason: '출장' })],
    };
    await repo.saveTimetableOverrides(data);

    const raw = storage.getRaw('timetable-overrides');
    expect(raw).toEqual({
      overrides: [
        {
          id: 'a',
          date: '2026-04-22',
          period: 3,
          subject: '자습',
          createdAt: '2026-01-01T00:00:00.000Z',
          reason: '출장',
        },
      ],
    });

    const loaded = await repo.getTimetableOverrides();
    expect(loaded).toEqual(data);
  });

  it('updatedAt optional field survives JSON round-trip when present', async () => {
    await repo.saveTimetableOverrides({
      overrides: [mk({ id: 'b', updatedAt: '2026-04-21T10:00:00.000Z' })],
    });
    const loaded = await repo.getTimetableOverrides();
    expect(loaded?.overrides[0]!.updatedAt).toBe('2026-04-21T10:00:00.000Z');
  });
});

describe('S2: upsert — same date+period produces 1 entry, not 2', () => {
  it('second call on same slot replaces, length stays 1, id preserved', async () => {
    const existing: readonly TimetableOverride[] = [];
    const r1 = upsertOverride(
      existing,
      { date: '2026-04-22', period: 3, subject: '수학' },
      '2026-04-21T09:00:00.000Z',
      () => 'generated-id-1',
    );
    await repo.saveTimetableOverrides({ overrides: r1.overrides });

    const persisted1 = (await repo.getTimetableOverrides())!.overrides;
    expect(persisted1).toHaveLength(1);
    const firstId = persisted1[0]!.id;

    const r2 = upsertOverride(
      persisted1,
      { date: '2026-04-22', period: 3, subject: '자습' },
      '2026-04-21T10:00:00.000Z',
      () => 'should-not-be-used',
    );
    await repo.saveTimetableOverrides({ overrides: r2.overrides });

    const persisted2 = (await repo.getTimetableOverrides())!.overrides;
    expect(persisted2).toHaveLength(1);
    expect(persisted2[0]!.id).toBe(firstId);
    expect(persisted2[0]!.subject).toBe('자습');
    expect(persisted2[0]!.updatedAt).toBe('2026-04-21T10:00:00.000Z');
    expect(r2.replacedId).toBe(firstId);
  });
});

describe('S5: NEIS re-sync preserves overrides (separate keys, no cross-contamination)', () => {
  it('saving class-schedule does not touch timetable-overrides', async () => {
    await repo.saveTimetableOverrides({
      overrides: [mk({ id: 'keep', date: '2026-04-22', period: 3 })],
    });

    // NEIS 재동기화 시뮬레이션: base schedule만 덮어쓴다
    await repo.saveClassSchedule({ '월': [{ subject: '수학', teacher: '김' }] } as never);
    await repo.saveTeacherSchedule({ '월': [{ subject: '수학', classroom: '3-1' }] } as never);

    const overrides = (await repo.getTimetableOverrides())!.overrides;
    expect(overrides).toHaveLength(1);
    expect(overrides[0]!.id).toBe('keep');
  });
});

describe('S7: legacy duplicate data is cleaned by dedup migration', () => {
  it('load-time dedup keeps only the latest per (date, period) and re-persists', async () => {
    // 기존 중복 데이터 시뮬레이션 (append-only 버그로 쌓인 상태)
    const legacy: TimetableOverride[] = [
      mk({ id: 'old', date: '2026-04-22', period: 3, subject: '과거', createdAt: '2026-01-01T00:00:00.000Z' }),
      mk({ id: 'new', date: '2026-04-22', period: 3, subject: '최신', createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-04-01T00:00:00.000Z' }),
      mk({ id: 'other', date: '2026-04-23', period: 1, subject: '다른슬롯' }),
    ];
    await repo.saveTimetableOverrides({ overrides: legacy });

    // load 시뮬레이션
    const loadedRaw = (await repo.getTimetableOverrides())!.overrides;
    expect(loadedRaw).toHaveLength(3);

    const deduped = dedupeOverridesKeepLatest(loadedRaw);
    expect(deduped).toHaveLength(2);
    expect(deduped.find((o) => o.date === '2026-04-22' && o.period === 3)!.id).toBe('new');

    // 마이그레이션 재기록
    await repo.saveTimetableOverrides({ overrides: deduped });
    const after = (await repo.getTimetableOverrides())!.overrides;
    expect(after).toHaveLength(2);

    // 재로드 시 또 정리되지 않음 (idempotent)
    const deduped2 = dedupeOverridesKeepLatest(after);
    expect(deduped2).toHaveLength(2);
  });
});

describe('S6: Drive sync payload format matches SYNC_FILES expectation', () => {
  it('timetable-overrides JSON shape is { overrides: [...] }', async () => {
    await repo.saveTimetableOverrides({
      overrides: [mk({ id: 'z' })],
    });
    const raw = storage.getRaw('timetable-overrides') as TimetableOverridesData;
    expect(raw).toHaveProperty('overrides');
    expect(Array.isArray(raw.overrides)).toBe(true);
  });
});

}); // JsonScheduleRepository integration
