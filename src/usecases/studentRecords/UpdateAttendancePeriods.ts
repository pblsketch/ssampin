import type { AttendancePeriodEntry, StudentRecord } from '@domain/entities/StudentRecord';
import type { AttendanceStatus, StudentAttendance } from '@domain/entities/Attendance';
import {
  pickRepresentativeAttendance,
  validateAttendancePeriods,
  type PeriodValidationError,
} from '@domain/rules/attendanceRules';

const ATTENDANCE_STATUS_LABEL: Record<Exclude<AttendanceStatus, 'present'>, string> = {
  absent: '결석',
  late: '지각',
  earlyLeave: '조퇴',
  classAbsence: '결과',
};

export interface UpdateAttendancePeriodsInput {
  readonly record: StudentRecord;
  readonly nextPeriods: readonly AttendancePeriodEntry[];
  readonly content: string;
  readonly reportedToNeis?: boolean;
  readonly documentSubmitted?: boolean;
  readonly regularPeriodCount: number;
}

export interface UpdateAttendancePeriodsResult {
  readonly record: StudentRecord;
}

export class UpdateAttendancePeriodsError extends Error {
  readonly detail: PeriodValidationError;
  constructor(detail: PeriodValidationError) {
    super(`INVALID_PERIODS:${detail.code}:${detail.period ?? ''}`);
    this.name = 'UpdateAttendancePeriodsError';
    this.detail = detail;
  }
}

/**
 * 기존 출결 StudentRecord의 교시 상세(attendancePeriods)를 갱신하고
 * 대표 subcategory를 재계산해 반환한다.
 *
 * - validateAttendancePeriods로 검증 실패 시 UpdateAttendancePeriodsError throw
 * - 대표 subcategory는 기존 브릿지 로직과 동일하게 pickRepresentativeAttendance 규칙 사용
 *   (심각도: absent > earlyLeave > late > classAbsence, 동률 시 가장 이른 교시)
 */
export function updateAttendancePeriods(
  input: UpdateAttendancePeriodsInput,
): UpdateAttendancePeriodsResult {
  const err = validateAttendancePeriods(input.nextPeriods, {
    regularPeriodCount: input.regularPeriodCount,
  });
  if (err) throw new UpdateAttendancePeriodsError(err);

  const sorted = [...input.nextPeriods].sort((a, b) => a.period - b.period);

  // 대표 엔트리 계산: pickRepresentativeAttendance 규칙 재사용
  const periodMap = new Map<number, StudentAttendance | undefined>();
  for (const e of sorted) {
    periodMap.set(e.period, {
      number: 0, // placeholder — pickRepresentativeAttendance는 number를 사용하지 않음
      status: e.status,
      ...(e.reason ? { reason: e.reason } : {}),
      ...(e.memo ? { memo: e.memo } : {}),
    });
  }
  const rep = pickRepresentativeAttendance(periodMap);

  let subcategory = input.record.subcategory;
  if (rep && rep.status !== 'present') {
    const typeLabel = ATTENDANCE_STATUS_LABEL[rep.status as Exclude<AttendanceStatus, 'present'>];
    subcategory = rep.reason ? `${typeLabel} (${rep.reason})` : typeLabel;
  }

  const next: StudentRecord = {
    ...input.record,
    subcategory,
    content: input.content,
    attendancePeriods: sorted,
    ...(input.reportedToNeis !== undefined ? { reportedToNeis: input.reportedToNeis } : {}),
    ...(input.documentSubmitted !== undefined ? { documentSubmitted: input.documentSubmitted } : {}),
  };

  return { record: next };
}
