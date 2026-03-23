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
}
