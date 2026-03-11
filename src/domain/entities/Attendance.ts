export type AttendanceStatus = 'present' | 'absent' | 'late';

export interface StudentAttendance {
  readonly number: number;
  readonly status: AttendanceStatus;
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
