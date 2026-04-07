import type { MemoColor } from '../valueObjects/MemoColor';

export interface Memo {
  readonly id: string;
  readonly content: string;
  readonly color: MemoColor;
  readonly x: number;
  readonly y: number;
  readonly width: number;      // px (기본 280)
  readonly height: number;     // px (기본 220)
  readonly rotation: number;   // degrees (-3 ~ 3)
  readonly createdAt: string;  // ISO 8601
  readonly updatedAt: string;  // ISO 8601
  readonly archived: boolean;
}

export interface MemosData {
  readonly memos: readonly Memo[];
}
