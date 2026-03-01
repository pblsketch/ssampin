export interface Student {
  readonly id: string;
  readonly name: string;
  /** 학번 (예: 10201 = 1학년 2반 1번) */
  readonly studentNumber?: number;
  /** 학생 연락처 */
  readonly phone?: string;
  /** 학부모 연락처 */
  readonly parentPhone?: string;
  /** 결번 여부 (전학 등으로 빠진 번호) */
  readonly isVacant?: boolean;
}
