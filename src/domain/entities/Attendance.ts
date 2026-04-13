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
  readonly date: string;
  readonly period: number;
  readonly students: readonly StudentAttendance[];
}

export interface AttendanceData {
  readonly records: readonly AttendanceRecord[];
}
