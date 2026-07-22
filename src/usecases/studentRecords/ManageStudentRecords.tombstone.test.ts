/**
 * buildStudentRecordsSaveData(저장 조립 툼스톤) + ManageStudentRecords.delete 통합 테스트 (ADR-028).
 *
 * 핵심 불변식:
 *  - 삭제로 사라진 id 는 툼스톤으로 기록된다(기기 간 삭제 전파의 출발점)
 *  - 재등장(부활) id 의 툼스톤은 걷힌다
 *  - TTL(90일) 지난 툼스톤은 저장 시 GC 된다(무한 증식 금지 — 핸드오프 §4-④)
 *  - 삭제와 무관한 저장 경로도 기존 툼스톤을 승계한다(한 경로라도 떨어뜨리면 전파 소실)
 *  - deleted 는 비었으면 직렬화하지 않는다(과거 파일 호환 — 핸드오프 §4-⑥)
 */
import { describe, it, expect } from 'vitest';
import type { StudentRecord, StudentRecordsData } from '@domain/entities/StudentRecord';
import { STUDENT_RECORD_TOMBSTONE_TTL_MS } from '@domain/entities/StudentRecord';
import type { IStudentRecordsRepository } from '@domain/repositories/IStudentRecordsRepository';
import { ManageStudentRecords, buildStudentRecordsSaveData } from './ManageStudentRecords';

const NOW = '2026-07-23T00:00:00.000Z';
const isoAgo = (ms: number): string => new Date(Date.parse(NOW) - ms).toISOString();

function rec(overrides: Partial<StudentRecord> = {}): StudentRecord {
  return {
    id: 'r1',
    studentId: 'stu-1',
    category: 'counseling',
    subcategory: '상담',
    content: '내용',
    date: '2026-07-01',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  } as StudentRecord;
}

describe('buildStudentRecordsSaveData — 툼스톤 생성·승계·GC', () => {
  it('이번 저장에서 사라진 id 는 툼스톤이 된다', () => {
    const existing: StudentRecordsData = { records: [rec(), rec({ id: 'r2' })] };
    const next: StudentRecordsData = { records: [rec({ id: 'r2' })] };

    const saved = buildStudentRecordsSaveData(existing, next, NOW);
    expect(saved.records.map((r) => r.id)).toEqual(['r2']);
    expect(saved.deleted).toEqual([{ id: 'r1', deletedAt: NOW }]);
  });

  it('재등장한 id 의 툼스톤은 걷힌다(재작성이 삭제를 이김)', () => {
    const existing: StudentRecordsData = {
      records: [],
      deleted: [{ id: 'r1', deletedAt: isoAgo(1000) }],
    };
    const next: StudentRecordsData = { records: [rec({ updatedAt: NOW })] };

    const saved = buildStudentRecordsSaveData(existing, next, NOW);
    expect(saved.records.map((r) => r.id)).toEqual(['r1']);
    expect('deleted' in saved).toBe(false);
  });

  it('④ TTL GC: 90일 지난 툼스톤은 저장 시 사라지고, 90일 이내는 승계된다', () => {
    const existing: StudentRecordsData = {
      records: [rec()],
      deleted: [
        { id: 'old', deletedAt: isoAgo(STUDENT_RECORD_TOMBSTONE_TTL_MS + 1) },
        { id: 'fresh', deletedAt: isoAgo(STUDENT_RECORD_TOMBSTONE_TTL_MS - 1000) },
      ],
    };
    const next: StudentRecordsData = { records: [rec()] };

    const saved = buildStudentRecordsSaveData(existing, next, NOW);
    expect(saved.deleted).toEqual([
      { id: 'fresh', deletedAt: isoAgo(STUDENT_RECORD_TOMBSTONE_TTL_MS - 1000) },
    ]);
  });

  it('삭제와 무관한 저장도 기존 툼스톤을 승계한다 + categories 봉투 보존', () => {
    const tomb = { id: 'gone', deletedAt: isoAgo(1000) };
    const categories = [{ id: 'c1', name: '커스텀', color: 'blue', subcategories: [] }];
    const existing: StudentRecordsData = { records: [rec()], categories, deleted: [tomb] };
    const next: StudentRecordsData = {
      records: [rec({ content: '편집' })],
      categories,
    };

    const saved = buildStudentRecordsSaveData(existing, next, NOW);
    expect(saved.deleted).toEqual([tomb]);
    expect(saved.categories).toEqual(categories);
  });

  it('⑥ 하위 호환: deleted 없는 과거 파일 + 삭제 없음 → deleted 키를 만들지 않는다', () => {
    const existing: StudentRecordsData = { records: [rec()] };
    const next: StudentRecordsData = { records: [rec({ content: '편집' })] };

    const saved = buildStudentRecordsSaveData(existing, next, NOW);
    expect('deleted' in saved).toBe(false);
  });

  it('파일이 아예 없던(첫 저장) 경우도 안전하다', () => {
    const saved = buildStudentRecordsSaveData(null, { records: [rec()] }, NOW);
    expect(saved.records).toHaveLength(1);
    expect('deleted' in saved).toBe(false);
  });
});

describe('ManageStudentRecords — 삭제 경로 통합', () => {
  function makeRepo(initial: StudentRecordsData | null): {
    repo: IStudentRecordsRepository;
    get: () => StudentRecordsData | null;
  } {
    let stored = initial;
    return {
      repo: {
        async getRecords() {
          return stored;
        },
        async saveRecords(data) {
          stored = data;
        },
      },
      get: () => stored,
    };
  }

  it('delete() 는 지운 기록의 툼스톤을 남긴다(데스크톱·모바일 스토어 공통 경로)', async () => {
    const { repo, get } = makeRepo({ records: [rec(), rec({ id: 'r2' })] });
    const manage = new ManageStudentRecords(repo);

    await manage.delete('r1');

    const saved = get()!;
    expect(saved.records.map((r) => r.id)).toEqual(['r2']);
    expect(saved.deleted).toHaveLength(1);
    expect(saved.deleted![0]!.id).toBe('r1');
    expect(typeof saved.deleted![0]!.deletedAt).toBe('string');
  });

  it('delete() 후의 다른 저장(update)이 툼스톤을 떨어뜨리지 않는다', async () => {
    const { repo, get } = makeRepo({ records: [rec(), rec({ id: 'r2' })] });
    const manage = new ManageStudentRecords(repo);

    await manage.delete('r1');
    const before = get()!.records.find((r) => r.id === 'r2')!;
    await manage.update({ before, after: { ...before, content: '편집' } });

    const saved = get()!;
    expect(saved.records.find((r) => r.id === 'r2')!.content).toBe('편집');
    expect(saved.deleted?.map((t) => t.id)).toEqual(['r1']);
  });
});
