export type AttendanceStatus = 'present' | 'absent' | 'late' | 'earlyLeave' | 'classAbsence';

export type AttendanceReason = '질병' | '인정' | '미인정' | '기타';

export const ATTENDANCE_REASONS: readonly AttendanceReason[] = [
  '질병',
  '인정',
  '미인정',
  '기타',
] as const;

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
  /**
   * 이 레코드가 마지막으로 수정된 시각(ISO).
   * 기기 간 동기화에서 레코드 단위 병합의 승자 판정에 사용한다.
   * 과거 데이터에는 없을 수 있다(부재 시 병합에서 가장 오래된 것으로 취급).
   */
  readonly updatedAt?: string;
}

export interface AttendanceData {
  readonly records: readonly AttendanceRecord[];
}

/**
 * 출결 레코드의 고유 식별 키.
 * 저장 시 변경 감지(stampChangedRecords)와 기기 간 병합(mergeAttendance)이
 * 같은 규칙을 써야 하므로 도메인에 단일 정의한다.
 */
export function attendanceRecordKey(r: AttendanceRecord): string {
  return `${r.classId}|${r.groupId ?? ''}|${r.date}|${r.period}`;
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
