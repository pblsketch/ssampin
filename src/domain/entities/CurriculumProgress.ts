export type ProgressStatus = 'planned' | 'completed' | 'skipped';

export interface ProgressEntry {
  readonly id: string;
  readonly classId: string;
  readonly date: string;
  readonly period: number;
  readonly unit: string;
  readonly lesson: string;
  readonly status: ProgressStatus;
  readonly note: string;
}

export interface CurriculumProgressData {
  readonly entries: readonly ProgressEntry[];
}
