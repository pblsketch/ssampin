/** 학생 재적 상태 */
export type StudentStatus =
  | 'active'       // 재학
  | 'transferred'  // 전출
  | 'suspended'    // 휴학
  | 'expelled'     // 제적
  | 'withdrawn'    // 자퇴
  | 'dropped'      // 퇴학
  | 'other';       // 기타

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  active: '재학',
  transferred: '전출',
  suspended: '휴학',
  expelled: '제적',
  withdrawn: '자퇴',
  dropped: '퇴학',
  other: '기타',
};

export const STUDENT_STATUS_COLORS: Record<StudentStatus, string> = {
  active: 'text-green-400 bg-green-500/10',
  transferred: 'text-blue-400 bg-blue-500/10',
  suspended: 'text-amber-400 bg-amber-500/10',
  expelled: 'text-red-400 bg-red-500/10',
  withdrawn: 'text-orange-400 bg-orange-500/10',
  dropped: 'text-red-400 bg-red-500/10',
  other: 'text-sp-muted bg-sp-surface',
};

/** 비활성 상태인지 (명렬/좌석/출결에서 제외) */
export function isInactiveStatus(status?: StudentStatus): boolean {
  if (!status) return false;
  return status !== 'active';
}

export interface Student {
  readonly id: string;
  readonly name: string;
  /** 학번 (예: 10201 = 1학년 2반 1번) */
  readonly studentNumber?: number;
  /** 학생 연락처 */
  readonly phone?: string;
  /** 보호자1 연락처 */
  readonly parentPhone?: string;
  /** 보호자1 라벨 (예: "아버지", "어머니", "조부모") */
  readonly parentPhoneLabel?: string;
  /** 보호자2 연락처 */
  readonly parentPhone2?: string;
  /** 보호자2 라벨 */
  readonly parentPhone2Label?: string;
  /** 결번 여부 (전학 등으로 빠진 번호) */
  readonly isVacant?: boolean;
  /** 생년월일 (YYYY-MM-DD 형식) */
  readonly birthDate?: string;
  /** 재적 상태 (미설정 시 'active' 취급) */
  readonly status?: StudentStatus;
  /** 상태 변경 사유 메모 (예: "2026.3.15 전출 - OO학교로") */
  readonly statusNote?: string;
  /** 상태 변경일 (YYYY-MM-DD) */
  readonly statusChangedAt?: string;
}
