import type { AttendanceStatus } from '@domain/entities/Attendance';

/**
 * 출결 상태 배지(badge) 클래스 단일 소스.
 * ClassRecordInputView · AttendanceTab · ClassRecordSearchView 에서 공유.
 *
 * ⚠️ 이 맵은 UI 표현(Tailwind 클래스)을 담으므로 domain 레이어 아님.
 * ClassRecordStatsView 의 text-only 색상과 InputMode 의 AccentColor 는
 * 쓰임새가 달라 별도 유지(통합 시 시각 변경 발생).
 */
export const ATTENDANCE_BADGE: Record<AttendanceStatus, string> = {
  present: 'bg-green-500/20 text-green-400',
  absent: 'bg-red-500/20 text-red-400',
  late: 'bg-amber-500/20 text-amber-400',
  earlyLeave: 'bg-orange-500/20 text-orange-400',
  classAbsence: 'bg-purple-500/20 text-purple-400',
};

/** 출결 상태 한국어 라벨 단일 소스. */
export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: '출석',
  absent: '결석',
  late: '지각',
  earlyLeave: '조퇴',
  classAbsence: '결과',
};
