import type { AttendanceStatus } from '@domain/entities/Attendance';
import {
  ATTENDANCE_BADGE,
  ATTENDANCE_LABEL,
} from '@adapters/presentation/attendanceStatusVariants';

interface AttendanceStatusBadgeProps {
  status: AttendanceStatus;
  /** 추가 클래스(여백 등). */
  className?: string;
}

/**
 * 출결 상태 배지 공용 부품(결석·지각·조퇴·결과·출석).
 * 색·라벨은 단일 소스 {@link ATTENDANCE_BADGE}/{@link ATTENDANCE_LABEL}에서 가져온다.
 */
export function AttendanceStatusBadge({ status, className = '' }: AttendanceStatusBadgeProps) {
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-xs font-medium ${ATTENDANCE_BADGE[status]} ${className}`.trim()}
    >
      {ATTENDANCE_LABEL[status]}
    </span>
  );
}
