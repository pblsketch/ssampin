import type { AttendanceStatus } from '@domain/entities/Attendance';
import { ATTENDANCE_BADGE, ATTENDANCE_LABEL } from './attendanceStatusStyle';

/**
 * 출결 상태색·아이콘 변형(variant) 단일 소스.
 *
 * 기존 배지(badge)·라벨(label)은 {@link ./attendanceStatusStyle} 가 정본이며,
 * 이 파일이 그대로 re-export 하여 소비자가 출결 표시 자원을 한 곳에서 가져온다.
 *
 * ⚠️ UI 표현(Tailwind 클래스·Material Symbol 명)을 담으므로 domain 레이어 아님.
 * - ATTENDANCE_CELL : 매트릭스 셀용 (배경 /20 + border, 배지와 동일 색 계열, 지각 amber)
 * - ATTENDANCE_TEXT : text-only (통계 표 헤더/셀)
 * - ATTENDANCE_ICON : Material Symbol 명 (AttendanceMatrixCore STATUS_CONFIG 값 복사)
 */

/** 출결 상태별 매트릭스 셀 클래스 (배경 /20 + border, 배지와 동일 색 계열). */
export const ATTENDANCE_CELL: Record<AttendanceStatus, string> = {
  present: 'text-sp-muted/50 hover:bg-sp-surface',
  absent: 'bg-red-500/20 text-red-400 border border-red-500/30',
  late: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  earlyLeave: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  classAbsence: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
};

/** 출결 상태별 text-only 색상 (통계 표 등). */
export const ATTENDANCE_TEXT: Record<AttendanceStatus, string> = {
  present: 'text-green-400',
  absent: 'text-red-400',
  late: 'text-amber-400',
  earlyLeave: 'text-orange-400',
  classAbsence: 'text-purple-400',
};

/**
 * 출결 상태별 Material Symbol 명.
 *
 * AttendanceMatrixCore(STATUS_CONFIG.icon)의 값을 복사한 것 — import 하지 않는다
 * (live 코드가 죽은 경로에 의존하지 않도록 값만 SSOT 로 끌어올림).
 */
export const ATTENDANCE_ICON: Record<AttendanceStatus, string> = {
  present: 'check_circle',
  absent: 'cancel',
  late: 'schedule',
  earlyLeave: 'exit_to_app',
  classAbsence: 'event_busy',
};

/**
 * 한국어 출결 라벨("결석/지각/조퇴/결과") → AttendanceStatus 매핑.
 * 라벨 기반(label-keyed) 색상 소스가 공용 상태색을 끌어올 때 사용.
 */
export const ATTENDANCE_LABEL_TO_STATUS: Record<string, AttendanceStatus> = {
  출석: 'present',
  결석: 'absent',
  지각: 'late',
  조퇴: 'earlyLeave',
  결과: 'classAbsence',
};

// 단일 진입점: 기존 배지·라벨도 이 모듈에서 함께 노출한다.
export { ATTENDANCE_BADGE, ATTENDANCE_LABEL };
