export interface Student {
  readonly id: string;
  readonly name: string;
  /** 학번 (예: 10201 = 1학년 2반 1번) */
  readonly studentNumber?: number;
}
