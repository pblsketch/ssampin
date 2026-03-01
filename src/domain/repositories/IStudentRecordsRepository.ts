import type { StudentRecordsData } from '../entities/StudentRecord';

export interface IStudentRecordsRepository {
  getRecords(): Promise<StudentRecordsData | null>;
  saveRecords(data: StudentRecordsData): Promise<void>;
}
