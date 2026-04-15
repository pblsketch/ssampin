export type AttendanceStatus = 'present' | 'absent' | 'late' | 'earlyLeave' | 'classAbsence';

export type AttendanceReason = '질병' | '인정' | '미인정' | '기타';

export const ATTENDANCE_REASONS: readonly AttendanceReason[] = ['질병', '인정', '미인정', '기타'] as const;

/** 출결 상태 순환 순서 (present → absent → late → earlyLeave → classAbsence → present) */
export const ATTENDANCE_STATUS_ORDER: readonly AttendanceStatus[] = [
  'present',
  'absent',
  'late',
  'earlyLeave',
  'classAbsence',
] as const;

export interface StudentAttendance {
  readonly number: number;
  readonly status: AttendanceStatus;
  readonly reason?: AttendanceReason;
  readonly memo?: string;
  readonly grade?: number;
  readonly classNum?: number;
}

export interface AttendanceRecord {
  readonly classId: string;
  /** 그룹 출결: 이 값이 있으면 groupId 기준 조회 우선 */
  readonly groupId?: string;
  readonly date: string;
  readonly period: number;
  readonly students: readonly StudentAttendance[];
}

export interface AttendanceData {
  readonly records: readonly AttendanceRecord[];
}

/** 조회(아침 조회) — 1교시 전 담임 점검 시간대 */
export const PERIOD_MORNING = 0;
/** 종례(하교 종례) — 8교시 후 담임 점검 시간대 */
export const PERIOD_CLOSING = 9;

/** 교시 번호 → 표시 라벨 ("1교시" / "조회" / "종례") */
export function formatPeriodLabel(period: number): string {
  if (period === PERIOD_MORNING) return '조회';
  if (period === PERIOD_CLOSING) return '종례';
  return `${period}교시`;
}

/** 교시 번호 → 짧은 라벨 ("1" / "조회" / "종례") — 좁은 칸에서 사용 */
export function formatPeriodShort(period: number): string {
  if (period === PERIOD_MORNING) return '조회';
  if (period === PERIOD_CLOSING) return '종례';
  return String(period);
}
