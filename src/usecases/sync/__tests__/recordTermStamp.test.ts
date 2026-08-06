/**
 * recordTermStamp.test.ts — S2.2 레코드 단위 term 스탬프 경계 AC (계획 §4 S2.2 AC-8·9 + ADR-034)
 *
 *  - term 파생은 언제나 `date`(사건 발생일) — 기록 시각(now/createdAt/updatedAt)이 아니다.
 *    "date=2026-08-10 수업을 2026-09-02에 저장 → term='2026-1'" (학기 경계에서 답이 갈리는 케이스).
 *  - date 부재·파싱 불가 → term 미부착(추측 금지 = 현행 병합 폴백).
 *  - merge 3함수는 레코드를 통째 운반한다 → term이 병합을 그대로 생존(참조 동일성으로 증명).
 *  - 병합 로직·툼스톤 비교는 현행 그대로 — term은 툼스톤 판정에 어떤 영향도 주지 않는다.
 */
import { describe, expect, test } from 'vitest';
import { academicTermForDate, withDerivedTerm } from '../../../domain/rules/academicCalendar';
import { buildAttendanceSaveData } from '../../classManagement/ManageAttendance';
import { buildObservationSaveData } from '../../classManagement/ManageObservations';
import { buildStudentRecordsSaveData } from '../../studentRecords/ManageStudentRecords';
import { mergeAttendance, mergeObservations, mergeStudentRecords } from '../SyncFromCloud';
import type { AttendanceRecord, AttendanceData } from '../../../domain/entities/Attendance';
import type { ObservationRecord, ObservationData } from '../../../domain/entities/Observation';
import type { StudentRecord } from '../../../domain/entities/StudentRecord';

/* ─── 픽스처 ─────────────────────────────────────────────── */

const attRecord = (over: Partial<AttendanceRecord> = {}): AttendanceRecord => ({
  classId: 'tc-1',
  date: '2026-08-10',
  period: 1,
  students: [{ number: 1, status: 'present' }],
  ...over,
});

const obsRecord = (over: Partial<ObservationRecord> = {}): ObservationRecord => ({
  id: 'obs-1',
  studentId: '1-2-3',
  classId: 'tc-1',
  authorId: 't-1',
  date: '2026-08-10',
  content: '관찰 내용',
  tags: [],
  visibility: 'private',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  ...over,
});

const stuRecord = (over: Partial<StudentRecord> = {}): StudentRecord => ({
  id: 'rec-1',
  studentId: 'stu-1',
  category: 'life',
  subcategory: '일반',
  content: '내용',
  date: '2026-08-10',
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
  ...over,
});

/* ─── academicTermForDate 경계 ───────────────────────────── */

describe('academicTermForDate — date(사건 발생일) 파생 정본', () => {
  test('12개월 전부 + 학년도 경계(1~2월 = 직전 학년도 2학기)', () => {
    const cases: readonly [string, string][] = [
      ['2026-01-15', '2025-2'],
      ['2026-02-28', '2025-2'],
      ['2026-03-01', '2026-1'],
      ['2026-04-10', '2026-1'],
      ['2026-05-10', '2026-1'],
      ['2026-06-10', '2026-1'],
      ['2026-07-10', '2026-1'],
      ['2026-08-31', '2026-1'],
      ['2026-09-01', '2026-2'],
      ['2026-10-10', '2026-2'],
      ['2026-11-10', '2026-2'],
      ['2026-12-31', '2026-2'],
    ];
    for (const [date, term] of cases) {
      expect(academicTermForDate(date), date).toBe(term);
    }
  });

  test('시간이 붙은 값은 앞의 날짜만 취한다', () => {
    expect(academicTermForDate('2026-08-10T09:00:00.000Z')).toBe('2026-1');
    expect(academicTermForDate('2026-09-02 14:00')).toBe('2026-2');
  });

  test('파싱 불가·부재 → null (추측 금지)', () => {
    for (const bad of [
      '',
      'not-a-date',
      '2026-13-01', // 월 범위 밖
      '2026-00-01',
      '08/10/2026',
      '2026-8-1', // 2자리 아님
      '2026-08-10x', // 꼬리 잡음
      '20260810',
      undefined,
      null,
    ]) {
      expect(academicTermForDate(bad as string | null | undefined), String(bad)).toBeNull();
    }
  });

  test('withDerivedTerm — 파생 가능하면 부착/교정, 불가면 원본 그대로(기존 term 보존)', () => {
    const r = attRecord();
    const stamped = withDerivedTerm(r);
    expect(stamped.term).toBe('2026-1');

    // 이미 올바른 term → 같은 참조(무변경)
    expect(withDerivedTerm(stamped)).toBe(stamped);

    // date 수정 후 낡은 term → 재파생으로 교정
    expect(withDerivedTerm({ ...stamped, date: '2026-09-02' }).term).toBe('2026-2');

    // 파싱 불가 → 원본 참조 그대로 (term 지어내지도, 지우지도 않음)
    const noDate = { ...r, date: 'broken' };
    expect(withDerivedTerm(noDate)).toBe(noDate);
    const noDateWithTerm = { ...r, date: 'broken', term: '2025-2' };
    expect(withDerivedTerm(noDateWithTerm)).toBe(noDateWithTerm);
  });
});

/* ─── build* 3함수 경계 AC (S2.2 AC-8·9) ─────────────────── */

describe('build* 저장 조립 — term은 기록 시각이 아니라 사건 발생일에서', () => {
  test('attendance: date=2026-08-10 수업을 2026-09-02에 저장 → term=2026-1 (역케이스 포함)', () => {
    const now = '2026-09-02T10:00:00.000Z'; // 2학기에 저장하지만
    const saved = buildAttendanceSaveData(null, [attRecord({ date: '2026-08-10' })], now);
    expect(saved.records[0]?.term).toBe('2026-1'); // 사건은 1학기 것

    const saved2 = buildAttendanceSaveData(null, [attRecord({ date: '2026-09-02' })], now);
    expect(saved2.records[0]?.term).toBe('2026-2');
  });

  test('attendance: date 파싱 불가 레코드는 term 미부착 + 나머지 필드 무변경', () => {
    const broken = attRecord({ date: 'unknown-date' });
    const saved = buildAttendanceSaveData(null, [broken], '2026-09-02T10:00:00.000Z');
    const rec = saved.records[0]!;
    expect('term' in rec).toBe(false);
    // updatedAt 스탬프 외 무변경 (구버전 형태 왕복 보존)
    expect({ ...rec, updatedAt: undefined }).toEqual({ ...broken, updatedAt: undefined });
  });

  test('observations: 수업일 기준 파생 + 파싱 불가 시 미부착', () => {
    const nowMs = Date.parse('2026-09-02T10:00:00.000Z');
    const data: ObservationData = { records: [obsRecord({ date: '2026-08-10' })] };
    const saved = buildObservationSaveData(null, data, nowMs);
    expect(saved.records[0]?.term).toBe('2026-1');

    const savedBroken = buildObservationSaveData(
      null,
      { records: [obsRecord({ date: 'nope' })] },
      nowMs,
    );
    expect('term' in savedBroken.records[0]!).toBe(false);
  });

  test('studentRecords: 파생 + date 수정 시 낡은 term 교정 + 파싱 불가 시 미부착', () => {
    const now = '2026-09-02T10:00:00.000Z';
    const saved = buildStudentRecordsSaveData(null, { records: [stuRecord()] }, now);
    expect(saved.records[0]?.term).toBe('2026-1');

    // date를 2학기로 고친 레코드에 1학기 term이 남아 있으면 재파생으로 교정
    const stale = stuRecord({ date: '2026-09-02', term: '2026-1' });
    const fixed = buildStudentRecordsSaveData(null, { records: [stale] }, now);
    expect(fixed.records[0]?.term).toBe('2026-2');

    const broken = stuRecord({ date: '' });
    const savedBroken = buildStudentRecordsSaveData(null, { records: [broken] }, now);
    expect('term' in savedBroken.records[0]!).toBe(false);
    expect(savedBroken.records[0]).toEqual(broken); // 구버전 형태 왕복 무변경
  });

  test('구버전 파일(term 없음) → 저장 통과 시 자연 스탬프, updatedAt은 승계(동기화 전쟁 없음)', () => {
    const legacy = attRecord({ updatedAt: '2026-08-10T01:00:00.000Z' });
    const existing: AttendanceData = { records: [legacy] };
    // 내용(students) 무변경 재저장 — updatedAt은 승계되면서 term만 자연 부착
    const saved = buildAttendanceSaveData(existing, [attRecord()], '2026-09-02T10:00:00.000Z');
    const rec = saved.records[0]!;
    expect(rec.term).toBe('2026-1');
    expect(rec.updatedAt).toBe('2026-08-10T01:00:00.000Z'); // 승계 — 병합 승자 판정 무영향
  });
});

/* ─── merge 3함수 — 레코드 통째 운반 = term 생존 증명 ────── */

describe('merge 3함수 — term 보존(레코드 통째 운반) + 툼스톤 판정 무영향', () => {
  test('mergeAttendance: 승자 레코드가 term째 그대로 운반된다(참조 동일)', () => {
    const localRec = attRecord({ term: '2026-1', updatedAt: '2026-08-10T01:00:00.000Z' });
    const remoteRec = attRecord({
      date: '2026-09-02',
      term: '2026-2',
      period: 2,
      updatedAt: '2026-09-02T01:00:00.000Z',
    });
    const merged = mergeAttendance({ records: [localRec] }, { records: [remoteRec] }, false);
    // 서로 다른 키 → 둘 다 생존, 각자 term 그대로 + 참조 동일(통째 운반의 직접 증명)
    expect(merged.records).toHaveLength(2);
    expect(merged.records).toContain(localRec);
    expect(merged.records).toContain(remoteRec);
  });

  test('mergeAttendance: 같은 키 충돌 시 승자의 term이 그대로(패자 term과 섞이지 않음)', () => {
    const stale = attRecord({ term: '2026-1', updatedAt: '2026-08-10T01:00:00.000Z' });
    const fresh = attRecord({ term: '2026-1', updatedAt: '2026-08-11T01:00:00.000Z' });
    const merged = mergeAttendance({ records: [stale] }, { records: [fresh] }, false);
    expect(merged.records).toHaveLength(1);
    expect(merged.records[0]).toBe(fresh);
  });

  test('mergeAttendance: term 없는 구버전 레코드 → term을 지어내지 않는다(현행 병합과 동일 결과)', () => {
    const legacyLocal = attRecord({ updatedAt: '2026-08-10T01:00:00.000Z' });
    const legacyRemote = attRecord({ period: 2 });
    const merged = mergeAttendance({ records: [legacyLocal] }, { records: [legacyRemote] }, false);
    expect(merged.records).toHaveLength(2);
    for (const rec of merged.records) {
      expect('term' in rec).toBe(false);
    }
  });

  test('mergeAttendance: term이 있어도 툼스톤 판정은 updatedAt축 그대로(분리 유지)', () => {
    const staleWithTerm = attRecord({ term: '2026-1', updatedAt: '2026-08-10T01:00:00.000Z' });
    const merged = mergeAttendance(
      { records: [staleWithTerm] },
      {
        records: [],
        deleted: [{ key: 'tc-1||2026-08-10|1', deletedAt: '2026-08-11T00:00:00.000Z' }],
      },
      false,
    );
    // 툼스톤이 더 최신 → term 존재와 무관하게 삭제가 이긴다
    expect(merged.records).toHaveLength(0);
    expect(merged.deleted).toHaveLength(1);
  });

  test('mergeObservations: term째 통째 운반 + 툼스톤(ms축) 판정 무영향', () => {
    const winner = obsRecord({ id: 'a', term: '2026-1', updatedAt: 2_000 });
    const merged = mergeObservations(
      { records: [obsRecord({ id: 'a', term: '2025-2', updatedAt: 1_000 })] },
      { records: [winner] },
      false,
    );
    expect(merged.records[0]).toBe(winner); // 승자 참조 그대로 = term 생존

    const tombstoned = mergeObservations(
      { records: [obsRecord({ id: 'b', term: '2026-1', updatedAt: 1_000 })] },
      { records: [], deleted: [{ id: 'b', deletedAt: 2_000 }] },
      false,
    );
    expect(tombstoned.records).toHaveLength(0); // ms축 비교 그대로 — term 무영향
  });

  test('mergeStudentRecords: record-LWW 승자의 term 그대로 + 추적 그룹 오버레이가 term을 안 건드린다', () => {
    const base = stuRecord({
      term: '2026-1',
      updatedAt: '2026-08-12T00:00:00.000Z',
      fieldUpdatedAt: { reportedToNeis: '2026-08-12T00:00:00.000Z' },
      reportedToNeis: false,
    });
    const other = stuRecord({
      term: '2025-2', // 패자의 낡은 term — 오버레이로 섞이면 안 된다
      updatedAt: '2026-08-11T00:00:00.000Z',
      fieldUpdatedAt: { reportedToNeis: '2026-08-13T00:00:00.000Z' }, // 항목만 더 최신
      reportedToNeis: true,
    });
    const merged = mergeStudentRecords({ records: [base] }, { records: [other] });
    const rec = merged.records[0]!;
    expect(rec.reportedToNeis).toBe(true); // 항목 오버레이는 채택되지만
    expect(rec.term).toBe('2026-1'); // term은 record-LWW 승자(base)의 것 그대로
  });

  test('mergeStudentRecords: term 없는 구버전끼리 병합 → 결과도 term 없음(왕복 무변경)', () => {
    const l = stuRecord({ id: 'x' });
    const r = stuRecord({ id: 'y' });
    const merged = mergeStudentRecords({ records: [l] }, { records: [r] });
    expect(merged.records).toHaveLength(2);
    expect(merged.records).toContain(l);
    expect(merged.records).toContain(r);
    for (const rec of merged.records) {
      expect('term' in rec).toBe(false);
    }
  });
});
