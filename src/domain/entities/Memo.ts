import type { MemoColor } from '../valueObjects/MemoColor';

export interface Memo {
  readonly id: string;
  readonly content: string;
  readonly color: MemoColor;
  readonly x: number;
  readonly y: number;
  readonly rotation: number;   // degrees (-3 ~ 3)
  readonly createdAt: string;  // ISO 8601
  readonly updatedAt: string;  // ISO 8601
}

export interface MemosData {
  readonly memos: readonly Memo[];
}
