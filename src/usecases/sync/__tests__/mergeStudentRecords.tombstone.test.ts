/**
 * mergeStudentRecords 삭제 전파 툼스톤 테스트 (ADR-028).
 *
 * 배경: student-records 에는 삭제 표식(툼스톤)이 없어, A기기에서 지운 기록이
 * B기기 사본과의 병합에서 "리모트에만 있는 새 기록"으로 부활했다(v2.2.14 QA HIGH).
 * observations 툼스톤(deletedAt: ms 숫자)과 달리 이 도메인은 ISO **문자열** 축이다 —
 * StudentRecord.updatedAt(string·optional)과 같은 축에서 문자열 비교해야 한다(핸드오프 §4-①).
 */
import { describe, it, expect } from 'vitest';
import type { StudentRecord, StudentRecordsData } from '@domain/entities/StudentRecord';
import { mergeStudentRecords } from '../SyncFromCloud';

const T = (n: number): string => `2026-07-${String(n).padStart(2, '0')}T00:00:00.000Z`;

function rec(overrides: Partial<StudentRecord> = {}): StudentRecord {
  return {
    id: 'r1',
    studentId: 'stu-1',
    category: 'counseling',
    subcategory: '상담',
    content: '내용',
    date: '2026-07-01',
    createdAt: T(1),
    ...overrides,
  } as StudentRecord;
}

describe('mergeStudentRecords — 삭제 전파 툼스톤', () => {
  it('① 삭제 전파: 로컬에서 지운 기록이 리모트에 남아 있어도 부활하지 않는다', () => {
    const local: StudentRecordsData = { records: [], deleted: [{ id: 'r1', deletedAt: T(5) }] };
    const remote: StudentRecordsData = { records: [rec({ updatedAt: T(3) })] };

    const merged = mergeStudentRecords(local, remote);
    expect(merged.records).toHaveLength(0);
    // 툼스톤은 유지되어 다음 병합(다른 기기)에도 삭제를 전파한다
    expect(merged.deleted).toEqual([{ id: 'r1', deletedAt: T(5) }]);
  });

  it('①-역방향: 리모트 툼스톤이 로컬에 남은 사본을 지운다', () => {
    const local: StudentRecordsData = { records: [rec({ updatedAt: T(3) })] };
    const remote: StudentRecordsData = { records: [], deleted: [{ id: 'r1', deletedAt: T(5) }] };

    const merged = mergeStudentRecords(local, remote);
    expect(merged.records).toHaveLength(0);
    expect(merged.deleted).toEqual([{ id: 'r1', deletedAt: T(5) }]);
  });

  it('② 정당한 부활: 삭제 후 다시 편집한(updatedAt > deletedAt) 기록은 살아나고 툼스톤이 걷힌다', () => {
    const local: StudentRecordsData = { records: [], deleted: [{ id: 'r1', deletedAt: T(5) }] };
    const remote: StudentRecordsData = { records: [rec({ updatedAt: T(7) })] };

    const merged = mergeStudentRecords(local, remote);
    expect(merged.records).toHaveLength(1);
    expect(merged.records[0]!.id).toBe('r1');
    expect(merged.deleted ?? []).toHaveLength(0);
  });

  it('③ 스탬프 없는 옛 기록: updatedAt 이 없으면 삭제가 이긴다 (의도된 기본값 — 핸드오프 §4-②)', () => {
    const local: StudentRecordsData = { records: [], deleted: [{ id: 'r1', deletedAt: T(5) }] };
    const remote: StudentRecordsData = { records: [rec()] }; // updatedAt 없음(구 데이터)

    const merged = mergeStudentRecords(local, remote);
    expect(merged.records).toHaveLength(0);
    expect(merged.deleted).toEqual([{ id: 'r1', deletedAt: T(5) }]);
  });

  it('③-동률: updatedAt === deletedAt 이면 삭제가 이긴다 (mergeObservations 와 동일 정책)', () => {
    const local: StudentRecordsData = { records: [], deleted: [{ id: 'r1', deletedAt: T(5) }] };
    const remote: StudentRecordsData = { records: [rec({ updatedAt: T(5) })] };

    const merged = mergeStudentRecords(local, remote);
    expect(merged.records).toHaveLength(0);
  });

  it('⑤ 하위 호환: deleted 키가 없는 과거 파일끼리 병합해도 deleted 키가 생기지 않는다', () => {
    const local: StudentRecordsData = { records: [rec({ updatedAt: T(3) })] };
    const remote: StudentRecordsData = {
      records: [rec({ id: 'r2', updatedAt: T(4) })],
    };

    const merged = mergeStudentRecords(local, remote);
    expect(merged.records).toHaveLength(2);
    expect('deleted' in merged).toBe(false);
  });

  it('⑤-null 로컬: 로컬 파일이 아예 없어도(신규 기기) 리모트 툼스톤이 보존된다', () => {
    const remote: StudentRecordsData = {
      records: [rec({ id: 'r2', updatedAt: T(4) })],
      deleted: [{ id: 'r1', deletedAt: T(5) }],
    };

    const merged = mergeStudentRecords(null, remote);
    expect(merged.records.map((r) => r.id)).toEqual(['r2']);
    expect(merged.deleted).toEqual([{ id: 'r1', deletedAt: T(5) }]);
  });

  it('⑥ 툼스톤 병합: 양쪽 툼스톤이 id별 최신 deletedAt 으로 합쳐진다(합집합)', () => {
    const local: StudentRecordsData = {
      records: [],
      deleted: [
        { id: 'r1', deletedAt: T(3) },
        { id: 'r2', deletedAt: T(6) },
      ],
    };
    const remote: StudentRecordsData = {
      records: [],
      deleted: [
        { id: 'r1', deletedAt: T(5) }, // 같은 id — 더 최신
        { id: 'r3', deletedAt: T(4) }, // 한쪽에만 있는 id — 보존
      ],
    };

    const merged = mergeStudentRecords(local, remote);
    const byId = new Map((merged.deleted ?? []).map((t) => [t.id, t.deletedAt]));
    expect(byId.get('r1')).toBe(T(5));
    expect(byId.get('r2')).toBe(T(6));
    expect(byId.get('r3')).toBe(T(4));
    expect(byId.size).toBe(3);
  });

  it('부활 판정은 병합 승자 기준: 리모트 편집(T7)이 로컬 툼스톤(T5)을 이기고 살아난다', () => {
    // 로컬엔 옛 사본(T3)+툼스톤 없음, 리모트엔 재편집본(T7), 제3기기발 툼스톤(T5)은 리모트에 실려 옴
    const local: StudentRecordsData = { records: [rec({ updatedAt: T(3) })] };
    const remote: StudentRecordsData = {
      records: [rec({ updatedAt: T(7), content: '재작성' })],
      deleted: [{ id: 'r1', deletedAt: T(5) }],
    };

    const merged = mergeStudentRecords(local, remote);
    expect(merged.records).toHaveLength(1);
    expect(merged.records[0]!.content).toBe('재작성');
    expect(merged.deleted ?? []).toHaveLength(0);
  });
});
