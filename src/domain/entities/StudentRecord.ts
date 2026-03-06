import type { RecordCategoryItem } from '../valueObjects/RecordCategory';

export type CounselingMethod = 'phone' | 'face' | 'online' | 'visit' | 'text' | 'other';

export interface StudentRecord {
  readonly id: string;
  readonly studentId: string;
  readonly category: string;
  readonly subcategory: string;
  readonly content: string;
  readonly date: string;
  readonly createdAt: string;
  readonly method?: CounselingMethod;
  readonly followUp?: string;
  readonly followUpDate?: string;
  readonly followUpDone?: boolean;
}

export interface StudentRecordsData {
  readonly records: readonly StudentRecord[];
  readonly categories?: readonly RecordCategoryItem[];
}

export interface AttendanceStats {
  readonly absent: number;
  readonly late: number;
  readonly earlyLeave: number;
  readonly resultAbsent: number;
  readonly praise: number;
}
