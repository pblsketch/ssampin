import { describe, it, expect } from 'vitest';
import {
  cycleStatus,
  buildAttendanceMatrix,
  summarizeByStudent,
  summarizeByPeriod,
  summarizeTotal,
  pickRepresentativeAttendance,
  validateAttendancePeriods,
  computeAutoPeriods,
  mergeAttendanceFill,
  summarizeNeisAttendance,
  countWithReasonFilter,
  isPerfectAttendance,
} from './attendanceRules';
import type {
  AttendanceRecord,
  AttendanceStatus,
  StudentAttendance,
} from '@domain/entities/Attendance';
import { PERIOD_MORNING, PERIOD_CLOSING } from '@domain/entities/Attendance';
import type { AttendancePeriodEntry } from '@domain/entities/StudentRecord';

// ── 헬퍼 ────────────────────────────────────────────────────────────
function att(
  number: number,
  status: AttendanceStatus,
  extra: Partial<StudentAttendance> = {},
): StudentAttendance {
  return { number, status, ...extra };
}

function record(
  classId: string,
  date: string,
  period: number,
  students: StudentAttendance[],
): AttendanceRecord {
  return { classId, date, period, students };
}

describe('cycleStatus', () => {
  it('present → absent → late → earlyLeave → classAbsence → present 순환', () => {
    expect(cycleStatus('present')).toBe('absent');
    expect(cycleStatus('absent')).toBe('late');
    expect(cycleStatus('late')).toBe('earlyLeave');
    expect(cycleStatus('earlyLeave')).toBe('classAbsence');
    expect(cycleStatus('classAbsence')).toBe('present');
  });

  it('5번 순환하면 원래 상태로 돌아온다', () => {
    let s: AttendanceStatus = 'present';
    for (let i = 0; i < 5; i++) s = cycleStatus(s);
    expect(s).toBe('present');
  });
});

describe('buildAttendanceMatrix', () => {
  const students = [{ number: 1 }, { number: 2 }, { number: 3 }];

  it('레코드가 전혀 없으면 모든 (학생, 교시) 셀이 undefined', () => {
    const m = buildAttendanceMatrix([], 'c1', '2026-03-02', students, [1, 2]);
    expect(m.size).toBe(3);
    expect(m.get('1')!.get(1)).toBeUndefined();
    expect(m.get('2')!.get(2)).toBeUndefined();
  });

  it('classId / date 가 다른 레코드는 무시한다', () => {
    const recs = [
      record('OTHER', '2026-03-02', 1, [att(1, 'absent')]),
      record('c1', '2026-03-03', 1, [att(1, 'late')]),
      record('c1', '2026-03-02', 1, [att(1, 'absent'), att(2, 'late')]),
    ];
    const m = buildAttendanceMatrix(recs, 'c1', '2026-03-02', students, [1]);
    expect(m.get('1')!.get(1)!.status).toBe('absent');
    expect(m.get('2')!.get(1)!.status).toBe('late');
    expect(m.get('3')!.get(1)).toBeUndefined();
  });

  it('같은 교시 레코드가 중복이면 마지막 값을 사용한다', () => {
    const recs = [
      record('c1', '2026-03-02', 1, [att(1, 'absent')]),
      record('c1', '2026-03-02', 1, [att(1, 'late')]),
    ];
    const m = buildAttendanceMatrix(recs, 'c1', '2026-03-02', students, [1]);
    expect(m.get('1')!.get(1)!.status).toBe('late');
  });

  it('학년/반이 명시된 학생은 같은 학년·반·번호만 매칭한다', () => {
    const gradedStudents = [
      { number: 1, grade: 1, classNum: 3 },
      { number: 1, grade: 2, classNum: 5 },
    ];
    const recs = [
      record('c1', '2026-03-02', 1, [
        att(1, 'absent', { grade: 1, classNum: 3 }),
        att(1, 'late', { grade: 2, classNum: 5 }),
      ]),
    ];
    const m = buildAttendanceMatrix(recs, 'c1', '2026-03-02', gradedStudents, [1]);
    expect(m.get('1-3-1')!.get(1)!.status).toBe('absent');
    expect(m.get('2-5-1')!.get(1)!.status).toBe('late');
  });
});

describe('summarize* 집계 함수', () => {
  // 학생1: [absent, late], 학생2: [present, undefined], 학생3: [undefined, classAbsence]
  const recs = [
    record('c1', '2026-03-02', 1, [att(1, 'absent'), att(2, 'present')]),
    record('c1', '2026-03-02', 2, [att(1, 'late'), att(3, 'classAbsence')]),
  ];
  const students = [{ number: 1 }, { number: 2 }, { number: 3 }];
  const matrix = buildAttendanceMatrix(recs, 'c1', '2026-03-02', students, [1, 2]);

  it('summarizeByStudent — 학생별 상태 카운트, undefined 는 세지 않는다', () => {
    const byStudent = summarizeByStudent(matrix);
    expect(byStudent.get('1')).toEqual({
      present: 0,
      absent: 1,
      late: 1,
      earlyLeave: 0,
      classAbsence: 0,
    });
    expect(byStudent.get('2')).toEqual({
      present: 1,
      absent: 0,
      late: 0,
      earlyLeave: 0,
      classAbsence: 0,
    });
    expect(byStudent.get('3')).toEqual({
      present: 0,
      absent: 0,
      late: 0,
      earlyLeave: 0,
      classAbsence: 1,
    });
  });

  it('summarizeByPeriod — 교시별 상태 카운트', () => {
    const byPeriod = summarizeByPeriod(matrix);
    expect(byPeriod.get(1)).toEqual({
      present: 1,
      absent: 1,
      late: 0,
      earlyLeave: 0,
      classAbsence: 0,
    });
    expect(byPeriod.get(2)).toEqual({
      present: 0,
      absent: 0,
      late: 1,
      earlyLeave: 0,
      classAbsence: 1,
    });
  });

  it('summarizeTotal — 전체 합계', () => {
    expect(summarizeTotal(matrix)).toEqual({
      present: 1,
      absent: 1,
      late: 1,
      earlyLeave: 0,
      classAbsence: 1,
    });
  });

  it('빈 매트릭스의 합계는 모두 0', () => {
    const empty = buildAttendanceMatrix([], 'c1', '2026-03-02', students, [1]);
    expect(summarizeTotal(empty)).toEqual({
      present: 0,
      absent: 0,
      late: 0,
      earlyLeave: 0,
      classAbsence: 0,
    });
  });
});

describe('pickRepresentativeAttendance', () => {
  function pm(
    entries: Record<number, AttendanceStatus | undefined>,
  ): Map<number, StudentAttendance | undefined> {
    const m = new Map<number, StudentAttendance | undefined>();
    for (const [p, s] of Object.entries(entries)) {
      m.set(Number(p), s ? att(1, s) : undefined);
    }
    return m;
  }

  it('전부 undefined 면 undefined', () => {
    expect(pickRepresentativeAttendance(pm({ 1: undefined, 2: undefined }))).toBeUndefined();
  });

  it('present 만 있으면 undefined', () => {
    expect(pickRepresentativeAttendance(pm({ 1: 'present', 2: 'present' }))).toBeUndefined();
  });

  it('심각도 우선순위: absent > earlyLeave > late > classAbsence', () => {
    expect(
      pickRepresentativeAttendance(pm({ 1: 'classAbsence', 2: 'late', 3: 'absent' }))!.status,
    ).toBe('absent');
    expect(
      pickRepresentativeAttendance(pm({ 1: 'classAbsence', 2: 'late', 3: 'earlyLeave' }))!.status,
    ).toBe('earlyLeave');
    expect(pickRepresentativeAttendance(pm({ 1: 'classAbsence', 2: 'late' }))!.status).toBe('late');
    expect(pickRepresentativeAttendance(pm({ 1: 'classAbsence' }))!.status).toBe('classAbsence');
  });

  it('동률(같은 status)이면 가장 이른 교시의 엔트리를 쓴다', () => {
    const m = new Map<number, StudentAttendance | undefined>();
    m.set(5, att(1, 'absent', { memo: '5교시' }));
    m.set(2, att(1, 'absent', { memo: '2교시' }));
    expect(pickRepresentativeAttendance(m)!.memo).toBe('2교시');
  });

  it('present 가 섞여 있어도 무시하고 더 심각한 상태를 고른다', () => {
    expect(
      pickRepresentativeAttendance(pm({ 1: 'present', 2: 'late', 3: 'present' }))!.status,
    ).toBe('late');
  });
});

describe('validateAttendancePeriods', () => {
  const entry = (
    period: number,
    status: AttendancePeriodEntry['status'] = 'absent',
  ): AttendancePeriodEntry => ({
    period,
    status,
  });
  const opts = { regularPeriodCount: 7 };

  it('빈 배열 → EMPTY', () => {
    expect(validateAttendancePeriods([], opts)).toEqual({ code: 'EMPTY' });
  });

  it('정상 입력 → null', () => {
    expect(validateAttendancePeriods([entry(1), entry(3), entry(7)], opts)).toBeNull();
  });

  it('조회(0)·종례(9)는 정규 교시 수와 무관하게 허용', () => {
    expect(
      validateAttendancePeriods([entry(PERIOD_MORNING), entry(PERIOD_CLOSING)], opts),
    ).toBeNull();
  });

  it('정규 교시 범위를 벗어나면 OUT_OF_RANGE', () => {
    expect(validateAttendancePeriods([entry(8)], opts)).toEqual({
      code: 'OUT_OF_RANGE',
      period: 8,
    });
    expect(validateAttendancePeriods([entry(-1)], opts)).toEqual({
      code: 'OUT_OF_RANGE',
      period: -1,
    });
  });

  it('regularPeriodCount 가 더 작으면 그만큼만 허용', () => {
    expect(validateAttendancePeriods([entry(5)], { regularPeriodCount: 4 })).toEqual({
      code: 'OUT_OF_RANGE',
      period: 5,
    });
    expect(validateAttendancePeriods([entry(4)], { regularPeriodCount: 4 })).toBeNull();
  });

  it('status 가 비어 있으면 MISSING_STATUS', () => {
    const bad = { period: 2, status: '' } as unknown as AttendancePeriodEntry;
    expect(validateAttendancePeriods([bad], opts)).toEqual({ code: 'MISSING_STATUS', period: 2 });
  });

  it('교시가 중복되면 DUPLICATE_PERIOD', () => {
    expect(validateAttendancePeriods([entry(1), entry(2), entry(1)], opts)).toEqual({
      code: 'DUPLICATE_PERIOD',
      period: 1,
    });
  });

  it('OUT_OF_RANGE 가 DUPLICATE_PERIOD 보다 먼저 검출된다(앞 엔트리 우선)', () => {
    expect(validateAttendancePeriods([entry(99), entry(99)], opts)).toEqual({
      code: 'OUT_OF_RANGE',
      period: 99,
    });
  });
});

describe('computeAutoPeriods — 교시 자동 채움 초기값', () => {
  const N = 7; // 정규 교시 수

  it('결석 → 조회~종례 전체', () => {
    expect(computeAutoPeriods('absent', 3, N)).toEqual(
      new Set([PERIOD_MORNING, 1, 2, 3, 4, 5, 6, 7, PERIOD_CLOSING]),
    );
  });

  it('결석은 기준 교시와 무관하게 항상 전체', () => {
    expect(computeAutoPeriods('absent', 1, N)).toEqual(computeAutoPeriods('absent', 7, N));
  });

  it('지각 3교시 → 조회~3교시 (건의 원문 그대로, 지각 상태로 기록)', () => {
    expect(computeAutoPeriods('late', 3, N)).toEqual(new Set([PERIOD_MORNING, 1, 2, 3]));
  });

  it('지각 조회(0) → 조회만', () => {
    expect(computeAutoPeriods('late', PERIOD_MORNING, N)).toEqual(new Set([PERIOD_MORNING]));
  });

  it('지각 종례(9) → 하루 전체가 지각 구간', () => {
    expect(computeAutoPeriods('late', PERIOD_CLOSING, N)).toEqual(
      new Set([PERIOD_MORNING, 1, 2, 3, 4, 5, 6, 7, PERIOD_CLOSING]),
    );
  });

  it('조퇴 3교시 → 3교시~종례', () => {
    expect(computeAutoPeriods('earlyLeave', 3, N)).toEqual(
      new Set([3, 4, 5, 6, 7, PERIOD_CLOSING]),
    );
  });

  it('조퇴 조회(0) → 조회~종례 전체', () => {
    expect(computeAutoPeriods('earlyLeave', PERIOD_MORNING, N)).toEqual(
      new Set([PERIOD_MORNING, 1, 2, 3, 4, 5, 6, 7, PERIOD_CLOSING]),
    );
  });

  it('조퇴 종례(9) → 종례만', () => {
    expect(computeAutoPeriods('earlyLeave', PERIOD_CLOSING, N)).toEqual(new Set([PERIOD_CLOSING]));
  });

  it('결과 3교시 → 해당 교시만 (빈 Set 아님)', () => {
    expect(computeAutoPeriods('classAbsence', 3, N)).toEqual(new Set([3]));
  });

  it('present → 빈 Set (자동 채움 대상 아님)', () => {
    expect(computeAutoPeriods('present', 3, N)).toEqual(new Set());
  });

  it('계약: 비-present 상태는 어떤 입력에서도 절대 빈 Set을 반환하지 않는다', () => {
    const nonPresent = ['absent', 'late', 'earlyLeave', 'classAbsence'] as const;
    const refs = [PERIOD_MORNING, 1, 3, 7, PERIOD_CLOSING];
    for (const status of nonPresent) {
      for (const ref of refs) {
        expect(computeAutoPeriods(status, ref, N).size).toBeGreaterThan(0);
      }
    }
  });

  it('정규 교시 수를 따른다 (regularPeriodCount=4)', () => {
    expect(computeAutoPeriods('absent', 1, 4)).toEqual(
      new Set([PERIOD_MORNING, 1, 2, 3, 4, PERIOD_CLOSING]),
    );
    expect(computeAutoPeriods('earlyLeave', 2, 4)).toEqual(new Set([2, 3, 4, PERIOD_CLOSING]));
  });

  it('지각 기준 교시가 정규 교시 수를 넘으면 정규 범위로 잘라낸다', () => {
    expect(computeAutoPeriods('late', 6, 4)).toEqual(new Set([PERIOD_MORNING, 1, 2, 3, 4]));
  });
});

describe('summarizeNeisAttendance — 생기부식 일 단위 집계 (별표 8 §3)', () => {
  const students = [{ number: 1 }, { number: 2 }];
  const key1 = '1';

  it('전일 결석(여러 교시)은 1일로 집계한다 (연인원 아님)', () => {
    const recs = [1, 2, 3, 4, 5, 6, 7].map((p) =>
      record('c1', '2026-03-02', p, [att(1, 'absent', { reason: '질병' })]),
    );
    const m = summarizeNeisAttendance(recs, 'c1', students);
    expect(m.get(key1)!.absent).toBe(1);
    expect(m.get(key1)!.byReason['질병'].absent).toBe(1);
  });

  it('같은 날 지각+조퇴+결과 중복은 대표 1건만 집계한다 (규칙 바)', () => {
    const recs = [
      record('c1', '2026-03-02', 1, [att(1, 'late')]),
      record('c1', '2026-03-02', 3, [att(1, 'classAbsence')]),
      record('c1', '2026-03-02', 6, [att(1, 'earlyLeave')]),
    ];
    const m = summarizeNeisAttendance(recs, 'c1', students);
    const c = m.get(key1)!;
    // 심각도 우선순위: earlyLeave > late > classAbsence
    expect(c.earlyLeave).toBe(1);
    expect(c.late).toBe(0);
    expect(c.classAbsence).toBe(0);
  });

  it('같은 날 결과가 여러 교시라도 결과 1회로 처리한다 (규칙 사)', () => {
    const recs = [2, 4, 6].map((p) =>
      record('c1', '2026-03-02', p, [att(1, 'classAbsence', { reason: '기타' })]),
    );
    const m = summarizeNeisAttendance(recs, 'c1', students);
    expect(m.get(key1)!.classAbsence).toBe(1);
  });

  it("'인정' 사유는 횟수에 포함하지 않는다 (규칙 라)", () => {
    const recs = [
      record('c1', '2026-03-02', 1, [att(1, 'absent', { reason: '인정' })]),
      record('c1', '2026-03-03', 1, [att(1, 'late', { reason: '인정' })]),
    ];
    const m = summarizeNeisAttendance(recs, 'c1', students);
    const c = m.get(key1)!;
    expect(c.absent).toBe(0);
    expect(c.late).toBe(0);
  });

  it("합성 순서: 같은 날 지각(질병)+지각(인정) 혼재 → '인정' 사전 필터 후 접기 = 질병 지각 1회", () => {
    const recs = [
      record('c1', '2026-03-02', PERIOD_MORNING, [att(1, 'late', { reason: '질병' })]),
      record('c1', '2026-03-02', 1, [att(1, 'late', { reason: '질병' })]),
      record('c1', '2026-03-02', 3, [att(1, 'late', { reason: '인정' })]),
    ];
    const m = summarizeNeisAttendance(recs, 'c1', students);
    const c = m.get(key1)!;
    expect(c.late).toBe(1);
    expect(c.byReason['질병'].late).toBe(1);
    expect(c.byReason['기타'].late).toBe(0);
  });

  it("'인정' 사유는 공식 계에서 빠지되 byReason['인정']에 참고용으로 집계된다 (P2)", () => {
    const recs = [
      record('c1', '2026-03-02', 1, [att(1, 'absent', { reason: '인정' })]),
      record('c1', '2026-03-03', 1, [att(1, 'late', { reason: '인정' })]),
    ];
    const m = summarizeNeisAttendance(recs, 'c1', students);
    const c = m.get(key1)!;
    // 공식 계는 인정 미포함
    expect(c.absent).toBe(0);
    expect(c.late).toBe(0);
    // 참고용 인정 집계는 별도 접기로 집계됨
    expect(c.byReason['인정'].absent).toBe(1);
    expect(c.byReason['인정'].late).toBe(1);
  });

  it('같은 날 지각(질병)+조퇴(인정) → 공식 지각(질병) 1, 인정 조퇴 1로 분리 집계 (P2)', () => {
    const recs = [
      record('c1', '2026-03-02', 1, [att(1, 'late', { reason: '질병' })]),
      record('c1', '2026-03-02', 6, [att(1, 'earlyLeave', { reason: '인정' })]),
    ];
    const m = summarizeNeisAttendance(recs, 'c1', students);
    const c = m.get(key1)!;
    expect(c.late).toBe(1);
    expect(c.byReason['질병'].late).toBe(1);
    expect(c.earlyLeave).toBe(0); // 조퇴는 인정이라 공식 계 제외
    expect(c.byReason['인정'].earlyLeave).toBe(1);
  });

  it('사유 미기재는 기타로 분류한다 (규칙 마)', () => {
    const recs = [record('c1', '2026-03-02', 1, [att(1, 'absent')])];
    const m = summarizeNeisAttendance(recs, 'c1', students);
    expect(m.get(key1)!.byReason['기타'].absent).toBe(1);
  });

  it('기간 필터(dateFrom/dateTo)를 적용하고, 기록 없는 학생은 0으로 포함한다', () => {
    const recs = [
      record('c1', '2026-03-01', 1, [att(1, 'absent')]),
      record('c1', '2026-03-05', 1, [att(1, 'absent')]),
      record('c1', '2026-03-10', 1, [att(1, 'absent')]),
    ];
    const m = summarizeNeisAttendance(recs, 'c1', students, '2026-03-02', '2026-03-09');
    expect(m.get(key1)!.absent).toBe(1);
    expect(m.get('2')).toEqual(
      expect.objectContaining({ absent: 0, late: 0, earlyLeave: 0, classAbsence: 0 }),
    );
  });

  it('다른 학급(classId) 레코드는 무시한다', () => {
    const recs = [record('OTHER', '2026-03-02', 1, [att(1, 'absent')])];
    const m = summarizeNeisAttendance(recs, 'c1', students);
    expect(m.get(key1)!.absent).toBe(0);
  });
});

describe('countWithReasonFilter / isPerfectAttendance (개근 파악, M1)', () => {
  const students = [{ number: 1 }, { number: 2 }, { number: 3 }];
  // 1번: 인정 지각만 · 2번: 질병 결석 1회 · 3번: 기록 없음
  const records = [
    record('c1', '2026-03-02', 1, [
      att(1, 'late', { reason: '인정' }),
      att(2, 'absent', { reason: '질병' }),
    ]),
  ];
  const stats = summarizeNeisAttendance(records, 'c1', students);
  const OFFICIAL = ['질병', '미인정', '기타'] as const;

  it('기본 축(질병·미인정·기타, 인정 제외)에서 인정 기록만 있는 학생은 개근 후보다', () => {
    const c1 = stats.get('1')!;
    expect(isPerfectAttendance(c1, OFFICIAL)).toBe(true);
    // '인정'을 포함 축으로 켜면 후보에서 탈락한다
    expect(isPerfectAttendance(c1, [...OFFICIAL, '인정'])).toBe(false);
  });

  it('질병 축 토글 시 합계와 개근 후보가 재계산된다', () => {
    const c2 = stats.get('2')!;
    expect(countWithReasonFilter(c2, OFFICIAL).absent).toBe(1);
    expect(isPerfectAttendance(c2, OFFICIAL)).toBe(false);
    // 질병 축을 제외하면 결석 합계가 0이 되고 개근 후보가 된다
    expect(countWithReasonFilter(c2, ['미인정', '기타']).absent).toBe(0);
    expect(isPerfectAttendance(c2, ['미인정', '기타'])).toBe(true);
  });

  it('기록이 전혀 없는 학생은 모든 축 조합에서 개근 후보다', () => {
    const c3 = stats.get('3')!;
    expect(isPerfectAttendance(c3, [...OFFICIAL, '인정'])).toBe(true);
  });

  it('countWithReasonFilter는 포함 축의 상태별 카운트만 합산한다 (공식 계 불변)', () => {
    const c2 = stats.get('2')!;
    const filtered = countWithReasonFilter(c2, ['질병']);
    expect(filtered).toEqual({ absent: 1, late: 0, earlyLeave: 0, classAbsence: 0 });
    // 원본 counts는 변형되지 않는다
    expect(c2.absent).toBe(1);
    expect(c2.byReason['질병'].absent).toBe(1);
  });
});

// ── mergeAttendanceFill (ADR-059 덧쓰기) ───────────────────────────
describe('mergeAttendanceFill — 하루 안 복합 예외 (ADR-059)', () => {
  const PERIODS = [PERIOD_MORNING, 1, 2, 3, 4, 5, 6, 7, PERIOD_CLOSING];
  const mark = (s: string) => () => s;

  it('fill 밖 교시의 기존 기록을 보존한다 (회귀: 전-행 재작성으로 한 종류만 남던 버그)', () => {
    const row = { 3: '결과' } as Record<number, string | undefined>;
    const next = mergeAttendanceFill(row, PERIODS, new Set([4]), mark('결과'));
    expect(next[3]).toBe('결과');
    expect(next[4]).toBe('결과');
  });

  it('fill 안 교시는 새 값으로 덮어쓴다', () => {
    const row = { 3: '지각' } as Record<number, string | undefined>;
    const next = mergeAttendanceFill(row, PERIODS, new Set([3]), mark('결과'));
    expect(next[3]).toBe('결과');
  });

  it('결석 자동 채움은 조회~종례 전 교시를 덮어 하루 전체가 된다', () => {
    const row = { 3: '결과' } as Record<number, string | undefined>;
    const fill = computeAutoPeriods('absent', 1, 7);
    const next = mergeAttendanceFill(row, PERIODS, fill, mark('결석'));
    expect(PERIODS.every((p) => next[p] === '결석')).toBe(true);
  });

  it('지각(앞구간)과 조퇴(뒷구간)를 겹쳐 찍으면 둘 다 남는다', () => {
    let row: Record<number, string | undefined> = {};
    row = mergeAttendanceFill(row, PERIODS, computeAutoPeriods('late', 1, 7), mark('지각'));
    row = mergeAttendanceFill(row, PERIODS, computeAutoPeriods('classAbsence', 3, 7), mark('결과'));
    row = mergeAttendanceFill(row, PERIODS, computeAutoPeriods('earlyLeave', 6, 7), mark('조퇴'));
    expect(row).toEqual({
      [PERIOD_MORNING]: '지각',
      1: '지각',
      2: undefined,
      3: '결과',
      4: undefined,
      5: undefined,
      6: '조퇴',
      7: '조퇴',
      [PERIOD_CLOSING]: '조퇴',
    });
  });

  it('원본 row를 변형하지 않는다 (순수 함수)', () => {
    const row = { 3: '결과' } as Record<number, string | undefined>;
    mergeAttendanceFill(row, PERIODS, new Set([3]), mark('지각'));
    expect(row[3]).toBe('결과');
  });

  it('row가 없어도(첫 입력) 동작한다', () => {
    const next = mergeAttendanceFill(undefined, PERIODS, new Set([2]), mark('결과'));
    expect(next[2]).toBe('결과');
    expect(next[1]).toBeUndefined();
  });
});
