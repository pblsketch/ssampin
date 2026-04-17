import type { AttendanceRecord, AttendanceStatus, StudentAttendance } from '@domain/entities/Attendance';
import { ATTENDANCE_STATUS_ORDER, PERIOD_MORNING, PERIOD_CLOSING } from '@domain/entities/Attendance';
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
  const dayRecords = records.filter(
    (r) => r.classId === classId && r.date === date,
  );

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
