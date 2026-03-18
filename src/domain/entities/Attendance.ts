export type AttendanceStatus = 'present' | 'absent' | 'late' | 'earlyLeave' | 'classAbsence';

export type AttendanceReason = '질병' | '인정' | '기타' | '생리통' | '미인정';

export const ATTENDANCE_REASONS: readonly AttendanceReason[] = ['질병', '인정', '기타', '생리통', '미인정'] as const;

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
