import type { RecordCategory } from '../valueObjects/RecordCategory';

export interface StudentRecord {
  readonly id: string;
  readonly studentId: string;
  readonly category: RecordCategory;
  readonly subcategory: string;
  readonly content: string;
  readonly date: string;       // "YYYY-MM-DD"
  readonly createdAt: string;  // ISO 8601
}

export interface StudentRecordsData {
  readonly records: readonly StudentRecord[];
}

export interface AttendanceStats {
  readonly absent: number;     // 결석 (생리결석 + 병결 + 무단결석)
  readonly late: number;       // 지각
  readonly earlyLeave: number; // 조퇴
  readonly resultAbsent: number; // 결과
  readonly praise: number;     // 칭찬
}
