/**
 * Q2 마이그레이션 배선 IT — migrateStudentRecordsOnLoad + mergeStudentRecords 동률 가드.
 *
 * 설계: §4-나 / AC#3. roundtrip 무손실(스냅샷) + 멱등 + 백업 1회 + 원자성(영속 실패) + Drive 병합 좀비 방지.
 */
import { describe, it, expect } from 'vitest';
import type { StudentRecordsData, StudentRecord } from '@domain/entities/StudentRecord';
import type { IStudentRecordsRepository } from '@domain/repositories/IStudentRecordsRepository';
import { migrateStudentRecordsOnLoad } from './MigrateStudentRecordsSubcatToTags';
import { mergeStudentRecords } from '@usecases/sync/SyncFromCloud';

function rec(p: Partial<StudentRecord>): StudentRecord {
  return {
    id: p.id ?? 'r1',
    studentId: p.studentId ?? 's1',
    category: p.category ?? 'life',
    subcategory: p.subcategory ?? '',
    content: p.content ?? '',
    date: p.date ?? '2026-06-24',
    createdAt: p.createdAt ?? '2026-06-24T00:00:00.000Z',
    ...(p.updatedAt ? { updatedAt: p.updatedAt } : {}),
    ...(p.tags ? { tags: p.tags } : {}),
    ...(p.reportedToNeis !== undefined ? { reportedToNeis: p.reportedToNeis } : {}),
    ...(p.documentSubmitted !== undefined ? { documentSubmitted: p.documentSubmitted } : {}),
    ...(p.attendancePeriods ? { attendancePeriods: p.attendancePeriods } : {}),
  };
}

interface FakeRepo extends IStudentRecordsRepository {
  _store(): StudentRecordsData | null;
  _backup(): StudentRecordsData | null;
  _saveCount(): number;
}

function makeRepo(initial: StudentRecordsData | null, opts?: { failSave?: boolean }): FakeRepo {
  let store = initial;
  let backup: StudentRecordsData | null = null;
  let saveCount = 0;
  return {
    async getRecords() {
      return store;
    },
    async saveRecords(d) {
      if (opts?.failSave) throw new Error('disk full');
      saveCount += 1;
      store = d;
    },
    async saveBackupOnce(d) {
      if (backup) return;
      backup = d;
    },
    _store: () => store,
    _backup: () => backup,
    _saveCount: () => saveCount,
  };
}

describe('migrateStudentRecordsOnLoad — 멱등 정규화 + 백업 + 원자성', () => {
  it('비출결 subcategory 를 tags 로 영속하고 1회 백업한다', async () => {
    const repo = makeRepo({
      records: [rec({ id: 'a', category: 'counseling', subcategory: '학생상담' })],
    });
    const out = await migrateStudentRecordsOnLoad(repo);
    expect(out.changedCount).toBe(1);
    expect(out.persisted).toBe(true);
    expect(out.records[0]!.tags).toEqual(['학생상담']);
    // 영속됨
    expect(repo._store()!.records[0]!.tags).toEqual(['학생상담']);
    // 백업 = 원본(tags 없음)
    expect(repo._backup()!.records[0]!.tags).toBeUndefined();
    expect(repo._backup()!.records[0]!.subcategory).toBe('학생상담');
  });

  it('무손실 스냅샷: 모든 비출결 원래 subcategory 가 post tags 에 포함 + 레코드 수 불변', async () => {
    const initial: StudentRecordsData = {
      records: [
        rec({ id: 'a', category: 'counseling', subcategory: '학부모상담' }),
        rec({ id: 'b', category: 'life', subcategory: '칭찬', tags: ['기존'] }),
        rec({ id: 'att', category: 'attendance', subcategory: '결석 (질병)' }),
      ],
    };
    const snapshot = initial.records.map((r) => ({
      id: r.id,
      sub: r.subcategory,
      cat: r.category,
    }));
    const out = await migrateStudentRecordsOnLoad(makeRepo(initial));
    expect(out.records).toHaveLength(3);
    for (const s of snapshot) {
      const after = out.records.find((r) => r.id === s.id)!;
      if (s.cat === 'attendance') {
        expect(after.tags).toBeUndefined(); // 출결 불변
        expect(after.subcategory).toBe(s.sub);
      } else {
        expect(after.tags).toContain(s.sub); // 무손실 복사
        expect(after.subcategory).toBe(s.sub); // 보존
      }
    }
  });

  it('멱등: 이미 정규화된 데이터는 변경 0 — 저장·백업 없음', async () => {
    const repo = makeRepo({
      records: [rec({ id: 'a', category: 'life', subcategory: '칭찬', tags: ['칭찬'] })],
    });
    const out = await migrateStudentRecordsOnLoad(repo);
    expect(out.changedCount).toBe(0);
    expect(out.persisted).toBe(true);
    expect(repo._saveCount()).toBe(0);
    expect(repo._backup()).toBeNull();
  });

  it('백업 1회: 두 번째 마이그레이션이 원본 백업을 덮어쓰지 않는다', async () => {
    // 1차: a 마이그레이션 → 백업 생성(원본)
    const repo = makeRepo({
      records: [rec({ id: 'a', category: 'life', subcategory: '칭찬' })],
    });
    await migrateStudentRecordsOnLoad(repo);
    const firstBackup = repo._backup();
    // 2차: 새 미변환 레코드 b 가 동기화로 들어옴
    const cur = repo._store()!;
    await repo.saveRecords({
      ...cur,
      records: [...cur.records, rec({ id: 'b', category: 'etc', subcategory: '진로' })],
    });
    await migrateStudentRecordsOnLoad(repo);
    // 백업은 여전히 첫 원본(b 미포함)
    expect(repo._backup()).toBe(firstBackup);
    expect(repo._backup()!.records).toHaveLength(1);
  });

  it('원자성: 영속 실패 시 메모리엔 정규화본(persisted=false) + 온디스크 미변경 + 재시도 가능', async () => {
    const repo = makeRepo(
      { records: [rec({ id: 'a', category: 'counseling', subcategory: '교우관계' })] },
      { failSave: true },
    );
    const out = await migrateStudentRecordsOnLoad(repo);
    expect(out.persisted).toBe(false);
    expect(out.records[0]!.tags).toEqual(['교우관계']); // 메모리엔 정규화본
    expect(repo._store()!.records[0]!.tags).toBeUndefined(); // 온디스크 미변경
  });

  it('데이터 없음(null) → 빈 records, changedCount 0', async () => {
    const out = await migrateStudentRecordsOnLoad(makeRepo(null));
    expect(out.records).toEqual([]);
    expect(out.changedCount).toBe(0);
  });
});

describe('mergeStudentRecords — Drive 병합 동률 가드(좀비 방지)', () => {
  const SAME = '2026-06-24T00:00:00.000Z';

  it('createdAt 동률: 변환된(tags 많은) 로컬이 미변환 리모트를 이긴다', () => {
    const local: StudentRecordsData = {
      records: [rec({ id: 'a', subcategory: '칭찬', tags: ['칭찬'], createdAt: SAME })],
    };
    const remote: StudentRecordsData = {
      records: [rec({ id: 'a', subcategory: '칭찬', createdAt: SAME })], // tags 없음(미변환)
    };
    const merged = mergeStudentRecords(local, remote);
    expect(merged.records[0]!.tags).toEqual(['칭찬']); // 변환본 보존
  });

  it('createdAt 동률 + tags 동수: 기존처럼 리모트 우선(거동 보존)', () => {
    const local: StudentRecordsData = {
      records: [rec({ id: 'a', content: 'local', tags: ['x'], createdAt: SAME })],
    };
    const remote: StudentRecordsData = {
      records: [rec({ id: 'a', content: 'remote', tags: ['x'], createdAt: SAME })],
    };
    const merged = mergeStudentRecords(local, remote);
    expect(merged.records[0]!.content).toBe('remote');
  });

  it('리모트 createdAt 최신: 리모트 우선(정상 편집 보존)', () => {
    const local: StudentRecordsData = {
      records: [
        rec({ id: 'a', content: 'old', tags: ['x', 'y'], createdAt: '2026-06-24T00:00:00.000Z' }),
      ],
    };
    const remote: StudentRecordsData = {
      records: [rec({ id: 'a', content: 'new', createdAt: '2026-06-24T10:00:00.000Z' })],
    };
    const merged = mergeStudentRecords(local, remote);
    expect(merged.records[0]!.content).toBe('new');
  });

  it('updatedAt 최신 로컬이 이긴다 — 나이스/서류 플래그 편집이 동기화로 되살아나지 않음', () => {
    // createdAt·tags 동률이지만 로컬이 더 나중에 수정(reportedToNeis=true) → 로컬 보존
    const local: StudentRecordsData = {
      records: [
        rec({
          id: 'a',
          reportedToNeis: true,
          createdAt: SAME,
          updatedAt: '2026-06-24T09:00:00.000Z',
        }),
      ],
    };
    const remote: StudentRecordsData = {
      records: [
        rec({
          id: 'a',
          reportedToNeis: false,
          createdAt: SAME,
          updatedAt: '2026-06-24T00:00:00.000Z',
        }),
      ],
    };
    const merged = mergeStudentRecords(local, remote);
    expect(merged.records[0]!.reportedToNeis).toBe(true);
  });

  it('한쪽만 updatedAt(로컬 편집) → updatedAt 있는 쪽 우선 (구 리모트가 덮지 못함)', () => {
    const local: StudentRecordsData = {
      records: [
        rec({ id: 'a', documentSubmitted: true, tags: ['x'], createdAt: SAME, updatedAt: SAME }),
      ],
    };
    const remote: StudentRecordsData = {
      // updatedAt 없음(구 데이터) + tags 동수 → 예전 로직이면 리모트가 이겼음
      records: [rec({ id: 'a', documentSubmitted: false, tags: ['x'], createdAt: SAME })],
    };
    const merged = mergeStudentRecords(local, remote);
    expect(merged.records[0]!.documentSubmitted).toBe(true);
  });

  it('리모트 updatedAt 최신 → 리모트 우선 (정상 원격 편집 반영)', () => {
    const local: StudentRecordsData = {
      records: [
        rec({ id: 'a', content: 'local', createdAt: SAME, updatedAt: '2026-06-24T01:00:00.000Z' }),
      ],
    };
    const remote: StudentRecordsData = {
      records: [
        rec({ id: 'a', content: 'remote', createdAt: SAME, updatedAt: '2026-06-24T05:00:00.000Z' }),
      ],
    };
    const merged = mergeStudentRecords(local, remote);
    expect(merged.records[0]!.content).toBe('remote');
  });
});
