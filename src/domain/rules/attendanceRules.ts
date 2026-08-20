import type {
  AttendanceRecord,
  AttendanceStatus,
  StudentAttendance,
} from '@domain/entities/Attendance';
import {
  ATTENDANCE_STATUS_ORDER,
  PERIOD_MORNING,
  PERIOD_CLOSING,
} from '@domain/entities/Attendance';
import type { AttendancePeriodEntry } from '@domain/entities/StudentRecord';
import { studentKey } from '@domain/entities/TeachingClass';

/**
 * 출결 상태를 순환 순서에 따라 다음 상태로 반환한다.
 * present → absent → late → earlyLeave → classAbsence → present
 */
export function cycleStatus(current: AttendanceStatus): AttendanceStatus {
  const idx = ATTENDANCE_STATUS_ORDER.indexOf(current);
  const next = (idx + 1) % ATTENDANCE_STATUS_ORDER.length;
  // ATTENDANCE_STATUS_ORDER는 고정 길이 배열이므로 next는 항상 유효한 인덱스
  return ATTENDANCE_STATUS_ORDER[next] as AttendanceStatus;
}

/**
 * 출결 레코드 배열에서 (classId, date) 기준으로 학생×교시 매트릭스를 구성한다.
 *
 * @param records  - 전체 또는 필터된 AttendanceRecord 배열 (classId·date 이미 필터 후 전달 가능)
 * @param classId  - 대상 학급 ID
 * @param date     - 조회 날짜 (YYYY-MM-DD)
 * @param students - 대상 학생 목록 (number, grade?, classNum? 포함)
 * @param periods  - 조회할 교시 목록 (예: [1,2,3,4,5,6,7,8])
 * @returns Map<studentKey, Map<period, StudentAttendance | undefined>>
 */
export function buildAttendanceMatrix(
  records: readonly AttendanceRecord[],
  classId: string,
  date: string,
  students: readonly { number: number; grade?: number; classNum?: number }[],
  periods: readonly number[],
): Map<string, Map<number, StudentAttendance | undefined>> {
  // (classId, date) 필터링
  const dayRecords = records.filter((r) => r.classId === classId && r.date === date);

  // period → students 조회 맵 구성
  const periodMap = new Map<number, readonly StudentAttendance[]>();
  for (const record of dayRecords) {
    // 같은 period가 중복이면 마지막 값 사용
    periodMap.set(record.period, record.students);
  }

  const matrix = new Map<string, Map<number, StudentAttendance | undefined>>();

  for (const student of students) {
    const key = studentKey(student);
    const periodRow = new Map<number, StudentAttendance | undefined>();

    for (const period of periods) {
      const periodStudents = periodMap.get(period);
      if (periodStudents == null) {
        // 해당 교시 레코드 자체가 없음
        periodRow.set(period, undefined);
      } else {
        // 같은 번호+학년+반의 학생 찾기
        const found = periodStudents.find(
          (s) =>
            s.number === student.number &&
            (student.grade == null || s.grade === student.grade) &&
            (student.classNum == null || s.classNum === student.classNum),
        );
        periodRow.set(period, found);
      }
    }

    matrix.set(key, periodRow);
  }

  return matrix;
}

/** 상태별 카운트 초기값 */
function emptyStatusCount(): Record<AttendanceStatus, number> {
  return {
    present: 0,
    absent: 0,
    late: 0,
    earlyLeave: 0,
    classAbsence: 0,
  };
}

/**
 * 학생별 출결 상태 카운트를 반환한다.
 * @returns Map<studentKey, Record<AttendanceStatus, number>>
 */
export function summarizeByStudent(
  matrix: Map<string, Map<number, StudentAttendance | undefined>>,
): Map<string, Record<AttendanceStatus, number>> {
  const result = new Map<string, Record<AttendanceStatus, number>>();

  for (const [key, periodRow] of matrix) {
    const count = emptyStatusCount();
    for (const attendance of periodRow.values()) {
      if (attendance != null) {
        count[attendance.status]++;
      }
    }
    result.set(key, count);
  }

  return result;
}

/**
 * 교시별 출결 상태 카운트를 반환한다.
 * @returns Map<period, Record<AttendanceStatus, number>>
 */
export function summarizeByPeriod(
  matrix: Map<string, Map<number, StudentAttendance | undefined>>,
): Map<number, Record<AttendanceStatus, number>> {
  const result = new Map<number, Record<AttendanceStatus, number>>();

  for (const periodRow of matrix.values()) {
    for (const [period, attendance] of periodRow) {
      if (!result.has(period)) {
        result.set(period, emptyStatusCount());
      }
      if (attendance != null) {
        const count = result.get(period)!;
        count[attendance.status]++;
      }
    }
  }

  return result;
}

/**
 * 전체 매트릭스에서 상태별 총 카운트를 반환한다.
 * @returns Record<AttendanceStatus, number>
 */
export function summarizeTotal(
  matrix: Map<string, Map<number, StudentAttendance | undefined>>,
): Record<AttendanceStatus, number> {
  const total = emptyStatusCount();

  for (const periodRow of matrix.values()) {
    for (const attendance of periodRow.values()) {
      if (attendance != null) {
        total[attendance.status]++;
      }
    }
  }

  return total;
}

/** NEIS 대표 출결 선택 시 심각도 우선순위 */
const REPRESENTATIVE_PRIORITY: readonly AttendanceStatus[] = [
  'absent',
  'earlyLeave',
  'late',
  'classAbsence',
  'present',
];

/**
 * 교시별 출결 엔트리에서 NEIS 대표 1건을 선택한다.
 * 심각도 우선순위: absent > earlyLeave > late > classAbsence > present
 * 동률 시 가장 이른 교시의 값 사용.
 * 전부 undefined 또는 present면 undefined 반환.
 */
export function pickRepresentativeAttendance(
  periodEntries: ReadonlyMap<number, StudentAttendance | undefined>,
): StudentAttendance | undefined {
  // period 오름차순으로 각 status의 최초 출현 엔트리를 기록
  const firstByStatus = new Map<AttendanceStatus, StudentAttendance>();

  const sortedPeriods = [...periodEntries.keys()].sort((a, b) => a - b);

  for (const period of sortedPeriods) {
    const entry = periodEntries.get(period);
    if (entry == null) continue;
    if (!firstByStatus.has(entry.status)) {
      firstByStatus.set(entry.status, entry);
    }
  }

  // 우선순위 순서대로 훑어서 처음 발견되는 status의 엔트리 반환
  // 'present'만 있거나 전부 undefined면 undefined 반환
  for (const status of REPRESENTATIVE_PRIORITY) {
    if (status === 'present') break;
    const candidate = firstByStatus.get(status);
    if (candidate != null) return candidate;
  }

  return undefined;
}

/**
 * 출결 기록 교시 편집 검증 결과.
 * code 종류:
 * - EMPTY: 행이 하나도 없음 (Q2 A안: 저장 비활성화)
 * - DUPLICATE_PERIOD: 같은 교시가 2번 이상 등장
 * - OUT_OF_RANGE: 허용 범위(조회/1~N/종례) 밖
 * - MISSING_STATUS: status 미지정
 */
export interface PeriodValidationError {
  readonly code: 'EMPTY' | 'DUPLICATE_PERIOD' | 'OUT_OF_RANGE' | 'MISSING_STATUS';
  readonly period?: number;
}

/**
 * AttendancePeriodEntry 배열을 검증한다.
 * @param entries 검증 대상 엔트리 배열
 * @param options.regularPeriodCount 정규 교시 수 (1..N, 기본 7)
 *                 조회(0)/종례(9)는 항상 허용.
 * @returns 오류가 있으면 첫 오류, 없으면 null
 */
export function validateAttendancePeriods(
  entries: readonly AttendancePeriodEntry[],
  options: { regularPeriodCount: number },
): PeriodValidationError | null {
  if (entries.length === 0) return { code: 'EMPTY' };

  const seen = new Set<number>();
  for (const e of entries) {
    const isRegular = e.period >= 1 && e.period <= options.regularPeriodCount;
    const isSpecial = e.period === PERIOD_MORNING || e.period === PERIOD_CLOSING;
    if (!isRegular && !isSpecial) {
      return { code: 'OUT_OF_RANGE', period: e.period };
    }
    if (!e.status) {
      return { code: 'MISSING_STATUS', period: e.period };
    }
    if (seen.has(e.period)) {
      return { code: 'DUPLICATE_PERIOD', period: e.period };
    }
    seen.add(e.period);
  }
  return null;
}

/**
 * 출결 유형 선택 시 교시 자동 채움 초기값을 계산한다.
 *
 * - absent(결석)       → 조회~종례 전체 {조회, 1..N, 종례}
 * - late(지각)         → 조회~등교 교시 {조회, 1..referencePeriod} — 전 구간을 '지각' 상태로 기록
 * - earlyLeave(조퇴)   → 하교 교시~종례 {referencePeriod..N, 종례}
 * - classAbsence(결과) → 해당 교시만 {referencePeriod}
 * - present            → 빈 Set (자동 채움 대상 아님)
 *
 * 계약: 비-present 상태는 절대 빈 Set을 반환하지 않는다.
 * 빈 Set은 present/무예외 전용이다 — 교시 저장 경로 중 빈 선택을 '전 교시'로
 * 해석하는 곳이 있어(담임 기록 카드), 비-present에 빈 Set이 흘러가면 한 교시
 * 예외가 전 교시로 잘못 저장되는 데이터 오염이 된다.
 *
 * 반환값은 초기값일 뿐이며 사용자는 교시 단위로 자유롭게 override할 수 있다.
 * 지각의 등교 전 교시를 '결과'로 바꾸는 **자동화**는 제공하지 않는다 —
 * 같은 날 지각·조퇴·결과는 한 가지로만 처리하는 것이 학교생활기록부 기재
 * 원칙이라(2026 기재요령 별표 8 §3 바) 자동으로 이중 집계를 만들지 않는다.
 * 다만 교사가 **직접** 교시별로 다른 유형을 찍는 것은 허용된다(ADR-059) — 사실 기록과
 * 나이스 집계는 층이 다르고, 집계는 `summarizeNeisAttendance`가 하루 대표 1건으로 접는다.
 *
 * @param status             선택한 출결 유형
 * @param referencePeriod    기준 교시 (지각=등교 교시, 조퇴=하교 교시, 결과=해당 교시.
 *                           조회/종례 상수도 허용)
 * @param regularPeriodCount 정규 교시 수 (1..N)
 */
export function computeAutoPeriods(
  status: AttendanceStatus,
  referencePeriod: number,
  regularPeriodCount: number,
): Set<number> {
  const result = new Set<number>();

  switch (status) {
    case 'present':
      return result;

    case 'absent': {
      result.add(PERIOD_MORNING);
      for (let p = 1; p <= regularPeriodCount; p++) result.add(p);
      result.add(PERIOD_CLOSING);
      return result;
    }

    case 'late': {
      result.add(PERIOD_MORNING);
      if (referencePeriod === PERIOD_CLOSING) {
        // 종례에야 등교 — 하루 전체가 지각 구간
        for (let p = 1; p <= regularPeriodCount; p++) result.add(p);
        result.add(PERIOD_CLOSING);
      } else {
        for (let p = 1; p <= Math.min(referencePeriod, regularPeriodCount); p++) {
          result.add(p);
        }
      }
      return result;
    }

    case 'earlyLeave': {
      if (referencePeriod === PERIOD_MORNING) {
        result.add(PERIOD_MORNING);
      }
      if (referencePeriod !== PERIOD_CLOSING) {
        const start = referencePeriod === PERIOD_MORNING ? 1 : referencePeriod;
        for (let p = start; p <= regularPeriodCount; p++) result.add(p);
      }
      result.add(PERIOD_CLOSING);
      return result;
    }

    case 'classAbsence': {
      result.add(referencePeriod);
      return result;
    }
  }
}

/**
 * 팔레트/빠른 입력 적용을 기존 하루 행에 **덧쓰기(누적)** 로 합성한다 (ADR-059).
 *
 * `computeAutoPeriods`가 고른 교시(`fill`)만 새 값으로 덮고, 나머지 교시에 이미 있던
 * 기록은 **그대로 둔다**. 이 규칙이 있어야 하루 안에 여러 예외가 공존한다:
 * "1교시 지각 · 3교시 결과 · 6교시 조퇴", "3·4·5교시 결과 3건".
 *
 * 이전 계약(§3.10-5 '전-행 재작성')은 칸을 찍을 때마다 그 학생의 하루를 통째로 다시 써서
 * **마지막에 찍은 한 종류만 남았다** — 결과를 세 교시에 찍어도 한 칸만 남는 실버그의 원인.
 * 되돌리기(Ctrl+Z)·지우개(칸/이름)가 이미 있으므로 정정 동선은 그쪽이 담당한다.
 *
 * 결석(absent)은 `computeAutoPeriods`가 조회~종례 전 교시를 채우므로 덧쓰기여도 하루를
 * 전부 덮는다 — '전일 결석'의 의미가 그대로 유지된다.
 *
 * @param row       기존 교시→엔트리 맵 (없는 교시는 undefined)
 * @param periods   화면에 존재하는 교시 목록 (조회·1..N·종례)
 * @param fill      새로 칠할 교시 집합 (`computeAutoPeriods` 결과)
 * @param makeEntry 칠할 교시의 엔트리 생성기
 */
export function mergeAttendanceFill<T>(
  row: Readonly<Record<number, T | undefined>> | undefined,
  periods: readonly number[],
  fill: ReadonlySet<number>,
  makeEntry: (period: number) => T,
): Record<number, T | undefined> {
  const next: Record<number, T | undefined> = {};
  for (const p of periods) {
    next[p] = fill.has(p) ? makeEntry(p) : row?.[p];
  }
  return next;
}

/** 생기부(나이스)식 공식 사유 축 — 학교생활기록부 기재요령 별표 8 §3 마 */
export type NeisReasonAxis = '질병' | '미인정' | '기타';
/**
 * 표시용 확장 축 — '인정'(출석인정)은 공식 계(별표 8 규칙 라)에서 제외되지만,
 * 교사 참고용으로 별도 집계해 '인정 표시' 토글로만 노출한다.
 */
export type NeisReasonAxisWithExcused = NeisReasonAxis | '인정';

export interface NeisStatusCounts {
  absent: number;
  late: number;
  earlyLeave: number;
  classAbsence: number;
}

export interface NeisAttendanceCounts extends NeisStatusCounts {
  /**
   * 사유별 세부 × 상태. 질병/미인정/기타 = 공식 축(계 = 이 셋의 합).
   * '인정' = 참고용 별도 집계(공식 계에는 미포함, 별도 접기).
   */
  byReason: Record<NeisReasonAxisWithExcused, NeisStatusCounts>;
}

function emptyNeisStatusCounts(): NeisStatusCounts {
  return { absent: 0, late: 0, earlyLeave: 0, classAbsence: 0 };
}

export function emptyNeisAttendanceCounts(): NeisAttendanceCounts {
  return {
    ...emptyNeisStatusCounts(),
    byReason: {
      질병: emptyNeisStatusCounts(),
      미인정: emptyNeisStatusCounts(),
      기타: emptyNeisStatusCounts(),
      인정: emptyNeisStatusCounts(),
    },
  };
}

/**
 * 생기부(나이스)식 출결 집계 — 학교생활기록부 기재요령 별표 8 §3 정합.
 *
 * - 규칙 바: 같은 날 지각·조퇴·결과 중복은 한 가지로만 → 일 단위 대표 접기
 *   (`pickRepresentativeAttendance`, 심각도 absent>earlyLeave>late>classAbsence —
 *   '학교장 판단' 사항에 대한 쌤핀 기본값)
 * - 규칙 사: 같은 날 결과가 여러 교시라도 1회 → 접기로 자동 충족
 * - 규칙 라: 출석인정('인정') 사유의 지각·조퇴·결과는 횟수 미포함 →
 *   **접기 전에** reason==='인정' 엔트리를 제거한다(사전 필터 → 접기 합성 순서).
 *   같은 날 지각(질병)+지각(인정)이 섞여 있으면 질병 지각 1회로 집계된다.
 * - 규칙 마: 사유 축은 질병·미인정·기타 3분류. 사유 미기재는 '기타'로 분류.
 *
 * @returns Map<studentKey, NeisAttendanceCounts> (모든 대상 학생 키 포함, 없으면 0)
 */
export function summarizeNeisAttendance(
  records: readonly AttendanceRecord[],
  classId: string,
  students: readonly { number: number; grade?: number; classNum?: number }[],
  dateFrom?: string,
  dateTo?: string,
): Map<string, NeisAttendanceCounts> {
  const result = new Map<string, NeisAttendanceCounts>();
  for (const student of students) {
    result.set(studentKey(student), emptyNeisAttendanceCounts());
  }

  // 날짜별 레코드 그룹
  const byDate = new Map<string, AttendanceRecord[]>();
  for (const r of records) {
    if (r.classId !== classId) continue;
    if (dateFrom != null && r.date < dateFrom) continue;
    if (dateTo != null && r.date > dateTo) continue;
    const arr = byDate.get(r.date);
    if (arr) arr.push(r);
    else byDate.set(r.date, [r]);
  }

  for (const dayRecords of byDate.values()) {
    for (const student of students) {
      const key = studentKey(student);
      const counts = result.get(key)!;
      // 공식 집계용(인정 제외)과 인정 참고용을 분리해 하루치를 수집한다.
      const officialMap = new Map<number, StudentAttendance | undefined>();
      const excusedMap = new Map<number, StudentAttendance | undefined>();
      for (const rec of dayRecords) {
        const hit = rec.students.find(
          (sa) =>
            sa.number === student.number &&
            (student.grade == null || sa.grade === student.grade) &&
            (student.classNum == null || sa.classNum === student.classNum),
        );
        if (!hit) continue;
        // 규칙 라: '인정'은 공식 접기에서 제외하고, 참고용으로만 별도 접기한다.
        if (hit.reason === '인정') excusedMap.set(rec.period, hit);
        else officialMap.set(rec.period, hit);
      }

      // 공식 집계 (계 = 질병+미인정+기타). 인정은 여기 포함되지 않는다.
      if (officialMap.size > 0) {
        const rep = pickRepresentativeAttendance(officialMap);
        if (rep != null && rep.status !== 'present') {
          counts[rep.status] += 1;
          const axis: NeisReasonAxis =
            rep.reason === '질병' || rep.reason === '미인정' ? rep.reason : '기타';
          counts.byReason[axis][rep.status] += 1;
        }
      }

      // 인정(참고) — 공식 계 미포함. 그날 인정 사유의 대표를 잡아 표시용으로만 집계한다.
      if (excusedMap.size > 0) {
        const exRep = pickRepresentativeAttendance(excusedMap);
        if (exRep != null && exRep.status !== 'present') {
          counts.byReason['인정'][exRep.status] += 1;
        }
      }
    }
  }

  return result;
}

/**
 * 사유 축 필터 합계 — 포함으로 선택된 축의 byReason 카운트만 상태별로 합산한다.
 * 개근 파악·상담 참고용 파생 뷰 전용이며 공식 계(별표 8 규칙 라)는 건드리지 않는다.
 */
export function countWithReasonFilter(
  counts: NeisAttendanceCounts,
  includedAxes: readonly NeisReasonAxisWithExcused[],
): NeisStatusCounts {
  const out = emptyNeisStatusCounts();
  for (const axis of includedAxes) {
    const c = counts.byReason[axis];
    out.absent += c.absent;
    out.late += c.late;
    out.earlyLeave += c.earlyLeave;
    out.classAbsence += c.classAbsence;
  }
  return out;
}

/**
 * 개근 후보 판정 — 포함 축 기준 결석·지각·조퇴·결과가 전부 0이면 true.
 * '인정'은 규칙 라(횟수 미포함)에 따라 기본 제외 축이다.
 * 개근의 최종 확정은 나이스 기준으로 확인해야 한다(참고용 판정).
 */
export function isPerfectAttendance(
  counts: NeisAttendanceCounts,
  includedAxes: readonly NeisReasonAxisWithExcused[],
): boolean {
  const f = countWithReasonFilter(counts, includedAxes);
  return f.absent === 0 && f.late === 0 && f.earlyLeave === 0 && f.classAbsence === 0;
}
