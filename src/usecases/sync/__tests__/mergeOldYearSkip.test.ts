/**
 * mergeOldYearSkip.test.ts — S2.2b 옛 "학년도" 리모트 레코드 스킵 필터 (계획 §4 S2.2 AC-2 계열).
 *
 * 규칙: schoolYearOf(record.term) < schoolYearOf(currentTerm)인 **리모트** 레코드만 스킵.
 *  - 같은 학년도의 다른 학기는 정상 병합(담임 축은 학년도 연속).
 *  - record.term 부재 → 현행 병합(fail-open — 구버전 호환).
 *  - currentTerm 부재·파싱 불가 → 필터 전체 비활성(기존 병합 테스트 전건이 이를 증명).
 *  - 로컬 레코드는 판정하지 않는다(잔존 옛 레코드 보존). 툼스톤 로직 0줄 수정.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { mergeAttendance, mergeObservations, mergeStudentRecords } from '../SyncFromCloud';
import type { AttendanceRecord } from '../../../domain/entities/Attendance';
import type { ObservationRecord } from '../../../domain/entities/Observation';
import type { StudentRecord } from '../../../domain/entities/StudentRecord';

const att = (over: Partial<AttendanceRecord> = {}): AttendanceRecord => ({
  classId: 'tc-1',
  date: '2026-06-01',
  period: 1,
  students: [{ number: 1, status: 'present' }],
  updatedAt: '2026-06-01T00:00:00.000Z',
  ...over,
});

const obs = (over: Partial<ObservationRecord> = {}): ObservationRecord => ({
  id: 'obs-1',
  studentId: '1-2-3',
  classId: 'tc-1',
  authorId: 't-1',
  date: '2026-06-01',
  content: '관찰',
  tags: [],
  visibility: 'private',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  ...over,
});

const rec = (over: Partial<StudentRecord> = {}): StudentRecord => ({
  id: 'rec-1',
  studentId: 'stu-1',
  category: 'life',
  subcategory: '일반',
  content: '내용',
  date: '2026-06-01',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  ...over,
});

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('mergeAttendance — 옛 학년도 스킵', () => {
  test('옛 학년도 리모트 레코드는 병합되지 않는다', () => {
    const merged = mergeAttendance(
      { records: [] },
      { records: [att({ term: '2026-1' }), att({ period: 2, term: '2026-2' })] },
      true,
      '2027-1',
    );
    expect(merged.records).toHaveLength(0);
  });

  test('같은 학년도의 다른 학기는 정상 병합된다 (학기 기준 아님)', () => {
    const merged = mergeAttendance(
      { records: [] },
      { records: [att({ term: '2026-1' })] },
      true,
      '2026-2', // 2학기로 넘어갔어도 같은 2026학년도 → 병합
    );
    expect(merged.records).toHaveLength(1);
    expect(merged.records[0]?.term).toBe('2026-1');
  });

  test('term 부재 리모트 레코드는 현행 병합 (fail-open — 구버전 호환)', () => {
    const merged = mergeAttendance({ records: [] }, { records: [att()] }, true, '2027-1');
    expect(merged.records).toHaveLength(1);
  });

  test('미래 학년도 레코드는 스킵하지 않는다 (옛 것만 걸러낸다)', () => {
    const merged = mergeAttendance(
      { records: [] },
      { records: [att({ term: '2028-1' })] },
      true,
      '2027-1',
    );
    expect(merged.records).toHaveLength(1);
  });

  test('currentTerm 부재·파싱 불가 → 필터 전체 비활성(현행 병합과 동일 결과)', () => {
    const remote = { records: [att({ term: '2020-1' })] };
    const baseline = mergeAttendance({ records: [] }, remote, true); // 파라미터 없음 = 현행
    expect(mergeAttendance({ records: [] }, remote, true, undefined)).toEqual(baseline);
    expect(mergeAttendance({ records: [] }, remote, true, 'unknown')).toEqual(baseline);
    expect(baseline.records).toHaveLength(1);
  });

  test('로컬 잔존 옛 레코드는 건드리지 않는다 (반쯤 전환 상태는 오류 아님)', () => {
    const localOld = att({ term: '2026-1' });
    const merged = mergeAttendance({ records: [localOld] }, { records: [] }, true, '2027-1');
    expect(merged.records).toContain(localOld); // 참조 그대로 보존
  });

  test('툼스톤 동작 무변경 — 스킵된 리모트 레코드는 툼스톤 판정 대상도 아니다', () => {
    // 리모트 툼스톤이 로컬 옛 레코드를 지우는 삭제 전파는 필터와 무관하게 그대로 동작
    const localOld = att({ term: '2026-1', updatedAt: '2026-06-01T00:00:00.000Z' });
    const merged = mergeAttendance(
      { records: [localOld] },
      {
        records: [],
        deleted: [{ key: 'tc-1||2026-06-01|1', deletedAt: '2026-07-01T00:00:00.000Z' }],
      },
      true,
      '2027-1',
    );
    expect(merged.records).toHaveLength(0); // 삭제 전파 유지
    expect(merged.deleted).toHaveLength(1);

    // 스킵된 리모트 레코드 + 로컬 툼스톤 → 필터 유무와 무관하게 동일 결과(부활 없음)
    const local = {
      records: [],
      deleted: [{ key: 'tc-1||2026-06-01|1', deletedAt: '2026-07-01T00:00:00.000Z' }],
    };
    const remote = { records: [att({ term: '2026-1' })] };
    const withFilter = mergeAttendance(local, remote, true, '2027-1');
    const withoutFilter = mergeAttendance(local, remote, true);
    expect(withFilter).toEqual(withoutFilter);
    expect(withFilter.records).toHaveLength(0);
  });
});

describe('mergeObservations — 옛 학년도 스킵', () => {
  test('옛 학년도 스킵 / 같은 학년도 병합 / term 부재 병합', () => {
    const merged = mergeObservations(
      { records: [] },
      {
        records: [
          obs({ id: 'old', term: '2026-2' }), // 옛 학년도 → 스킵
          obs({ id: 'same-year', term: '2027-1' }), // 같은 학년도 → 병합
          obs({ id: 'legacy' }), // term 부재 → 병합(fail-open)
        ],
      },
      true,
      '2027-2',
    );
    expect(merged.records.map((r) => r.id).sort()).toEqual(['legacy', 'same-year']);
  });

  test('currentTerm 부재 → 현행 병합과 동일 + 로컬 옛 레코드 보존 + 툼스톤(ms축) 무변경', () => {
    const localOld = obs({ id: 'mine', term: '2026-1' });
    const remote = { records: [obs({ id: 'old', term: '2026-1' })] };
    expect(mergeObservations({ records: [localOld] }, remote, true).records).toHaveLength(2);

    // 필터 활성: 리모트 옛 것만 스킵, 로컬 옛 것은 보존
    const filtered = mergeObservations({ records: [localOld] }, remote, true, '2027-1');
    expect(filtered.records).toEqual([localOld]);

    // 툼스톤: 스킵된 레코드는 map에 없으므로 툼스톤이 그대로 남는다(현행과 동일)
    const tomb = mergeObservations(
      { records: [] },
      {
        records: [obs({ id: 'old', term: '2026-1', updatedAt: 1_000 })],
        deleted: [{ id: 'old', deletedAt: 2_000 }],
      },
      true,
      '2027-1',
    );
    expect(tomb.records).toHaveLength(0);
    expect(tomb.deleted).toEqual([{ id: 'old', deletedAt: 2_000 }]);
  });
});

describe('mergeStudentRecords — 옛 학년도 스킵', () => {
  test('옛 학년도 스킵 / 같은 학년도 병합 / term 부재 병합', () => {
    const merged = mergeStudentRecords(
      { records: [] },
      {
        records: [
          rec({ id: 'old', term: '2026-1' }),
          rec({ id: 'same-year', term: '2027-1' }),
          rec({ id: 'legacy' }),
        ],
      },
      '2027-2',
    );
    expect(merged.records.map((r) => r.id).sort()).toEqual(['legacy', 'same-year']);
  });

  test('currentTerm 부재 → 현행 병합과 동일(기존 시그니처 그대로) + 로컬 보존 + 툼스톤 무변경', () => {
    const localOld = rec({ id: 'mine', term: '2026-1' });
    const remote = { records: [rec({ id: 'old', term: '2026-1' })] };
    expect(mergeStudentRecords({ records: [localOld] }, remote).records).toHaveLength(2);

    const filtered = mergeStudentRecords({ records: [localOld] }, remote, '2027-1');
    expect(filtered.records).toEqual([localOld]);

    // 툼스톤(ISO축): 필터 유무와 무관하게 동일 결과
    const local = {
      records: [],
      deleted: [{ id: 'old', deletedAt: '2026-08-01T00:00:00.000Z' }],
    };
    expect(mergeStudentRecords(local, remote, '2027-1')).toEqual(
      mergeStudentRecords(local, remote),
    );
  });

  test('카테고리 병합은 필터와 무관하게 그대로 동작한다', () => {
    const merged = mergeStudentRecords(
      { records: [], categories: [{ id: 'c1', name: '로컬', color: 'blue', subcategories: [] }] },
      {
        records: [rec({ id: 'old', term: '2026-1' })],
        categories: [{ id: 'c2', name: '리모트', color: 'green', subcategories: [] }],
      },
      '2027-1',
    );
    expect(merged.records).toHaveLength(0); // 레코드는 스킵돼도
    expect(merged.categories?.map((c) => c.id).sort()).toEqual(['c1', 'c2']); // 카테고리 합집합 유지
  });
});

describe('F9a — lastClosedTerm(마감 학기) 기준 스킵 · B2 재발 방지', () => {
  test('B2 재현 방지(attendance): 2026-1 마감 후 미전환 기기의 2026-1은 스킵, 2026-2는 병합', () => {
    const merged = mergeAttendance(
      { records: [] },
      {
        records: [
          att({ date: '2026-05-01', term: '2026-1' }), // 마감분 → 스킵
          att({ date: '2026-09-01', period: 2, term: '2026-2' }), // 미마감 → 병합(담임 축 연속)
        ],
      },
      true,
      '2026-2', // currentTerm — 같은 학년도라 구 필터로는 무가드였다
      '2026-1', // lastClosedTerm — F9a 정본 기준
    );
    expect(merged.records).toHaveLength(1);
    expect(merged.records[0]?.term).toBe('2026-2');
  });

  test('B2 재현 방지(observations·student-records): 같은 규칙이 3도메인 전부에 적용된다', () => {
    const obsMerged = mergeObservations(
      { records: [] },
      {
        records: [
          obs({ id: 'closed', term: '2026-1' }),
          obs({ id: 'open', term: '2026-2' }),
          obs({ id: 'legacy' }), // term 부재 → 병합(fail-open)
        ],
      },
      true,
      '2026-2',
      '2026-1',
    );
    expect(obsMerged.records.map((r) => r.id).sort()).toEqual(['legacy', 'open']);

    const recMerged = mergeStudentRecords(
      { records: [] },
      {
        records: [
          rec({ id: 'closed', term: '2026-1' }),
          rec({ id: 'open', term: '2026-2' }),
          rec({ id: 'legacy' }),
        ],
      },
      '2026-2',
      '2026-1',
    );
    expect(recMerged.records.map((r) => r.id).sort()).toEqual(['legacy', 'open']);
  });

  test('경계: 마감 학기와 동일한 term은 스킵(<=), 그 다음 학기는 병합', () => {
    const skipSame = mergeAttendance(
      { records: [] },
      { records: [att({ term: '2026-1' })] },
      true,
      '2026-2',
      '2026-1',
    );
    expect(skipSame.records).toHaveLength(0);

    const keepNext = mergeAttendance(
      { records: [] },
      { records: [att({ term: '2026-2' })] },
      true,
      '2026-2',
      '2026-1',
    );
    expect(keepNext.records).toHaveLength(1);
  });

  test('학년도 전환도 동일 규칙으로 커버된다(2026-2 마감 → 2026-1·2026-2 모두 스킵)', () => {
    const merged = mergeAttendance(
      { records: [] },
      {
        records: [
          att({ date: '2026-05-01', term: '2026-1' }),
          att({ date: '2026-10-01', period: 2, term: '2026-2' }),
          att({ date: '2027-03-05', period: 3, term: '2027-1' }), // 새 학년도 → 병합
        ],
      },
      true,
      '2027-1',
      '2026-2',
    );
    expect(merged.records).toHaveLength(1);
    expect(merged.records[0]?.term).toBe('2027-1');
  });

  test('lastClosedTerm 부재 → 기존 학년도 비교 폴백(구버전 전환 이력 하위 호환)', () => {
    const remote = {
      records: [
        att({ date: '2026-05-01', term: '2026-1' }),
        att({ date: '2026-10-01', period: 2, term: '2026-2' }),
      ],
    };
    // 폴백: currentTerm=2027-1이면 2026학년도 전부 스킵(구 동작 그대로)
    expect(mergeAttendance({ records: [] }, remote, true, '2027-1').records).toHaveLength(0);
    // 폴백: 같은 학년도(2026-2)면 스킵 없음 — 이것이 B2였고, lastClosedTerm이 있어야 막힌다
    expect(mergeAttendance({ records: [] }, remote, true, '2026-2').records).toHaveLength(2);
  });

  test('lastClosedTerm 파싱 불가 → 폴백, 둘 다 없으면 필터 전체 비활성', () => {
    const remote = { records: [att({ term: '2026-1' })] };
    expect(
      mergeAttendance({ records: [] }, remote, true, '2027-1', '이상한값').records,
    ).toHaveLength(0); // 폴백(학년도 비교)
    expect(mergeAttendance({ records: [] }, remote, true, undefined, undefined).records).toEqual(
      mergeAttendance({ records: [] }, remote, true).records,
    ); // 현행 병합 그대로
  });

  test('로컬 잔존 레코드는 마감 학기여도 건드리지 않는다(반쯤 전환은 오류 아님)', () => {
    const localClosed = att({ term: '2026-1' });
    const merged = mergeAttendance(
      { records: [localClosed] },
      { records: [] },
      true,
      '2026-2',
      '2026-1',
    );
    expect(merged.records).toContain(localClosed);
  });

  test('툼스톤 판정은 마감 기준과 완전 분리(스킵 레코드는 툼스톤 대상 아님)', () => {
    const local = {
      records: [],
      deleted: [{ key: 'tc-1||2026-06-01|1', deletedAt: '2026-07-01T00:00:00.000Z' }],
    };
    const remote = { records: [att({ term: '2026-1' })] };
    const withFilter = mergeAttendance(local, remote, true, '2026-2', '2026-1');
    const withoutFilter = mergeAttendance(local, remote, true);
    expect(withFilter.records).toHaveLength(0);
    expect(withFilter.deleted).toEqual(withoutFilter.deleted);
  });
});

describe('통합 시나리오 — 전환 완료 후 옛 학년도 파일과 병합', () => {
  test('라이브 리셋(빈 파일) + currentTerm=2027-1 상태에서 2026학년도 리모트와 병합 → 유입 0건', () => {
    const currentTerm = '2027-1'; // ExecuteYearTransition 완료 상태(settings.currentTerm)
    const liveAfterReset = { records: [] }; // S2.4 리셋 봉투

    const remoteAtt = {
      records: [
        att({ date: '2026-05-01', term: '2026-1' }),
        att({ date: '2026-10-01', period: 2, term: '2026-2' }),
      ],
      deleted: [{ key: 'x|y|2026-05-02|1', deletedAt: '2026-06-01T00:00:00.000Z' }],
    };
    const mergedAtt = mergeAttendance(liveAfterReset, remoteAtt, true, currentTerm);
    expect(mergedAtt.records).toHaveLength(0); // 함정 ① 봉쇄 — 옛 학년도 부활 없음
    expect(mergedAtt.deleted).toHaveLength(1); // 툼스톤 전파는 그대로(무해)

    const mergedObs = mergeObservations(
      { records: [] },
      { records: [obs({ id: 'o1', term: '2026-1' }), obs({ id: 'o2', term: '2026-2' })] },
      true,
      currentTerm,
    );
    expect(mergedObs.records).toHaveLength(0);

    const mergedRec = mergeStudentRecords(
      { records: [] },
      { records: [rec({ id: 'r1', term: '2026-1' }), rec({ id: 'r2', term: '2026-2' })] },
      currentTerm,
    );
    expect(mergedRec.records).toHaveLength(0);

    // 새 학년도 레코드는 정상 유입된다
    const fresh = mergeAttendance(
      liveAfterReset,
      { records: [att({ date: '2027-03-05', term: '2027-1' })] },
      true,
      currentTerm,
    );
    expect(fresh.records).toHaveLength(1);
  });

  test('스킵 시 [SyncFromCloud] 로그를 남긴다', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mergeAttendance(
      { records: [] },
      { records: [att({ term: '2026-1' }), att({ period: 2, term: '2025-2' })] },
      true,
      '2027-1',
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '[SyncFromCloud] attendance: 2건 skip (옛 학년도 < 2027-1, term=2025-2,2026-1)',
      ),
    );
  });
});
