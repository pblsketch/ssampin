import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IStudentRecordsRepository } from '@domain/repositories/IStudentRecordsRepository';
import type { StudentRecordsData } from '@domain/entities/StudentRecord';

export class JsonStudentRecordsRepository implements IStudentRecordsRepository {
  constructor(private readonly storage: IStoragePort) {}

  getRecords(): Promise<StudentRecordsData | null> {
    return this.storage.read<StudentRecordsData>('student-records');
  }

  saveRecords(data: StudentRecordsData): Promise<void> {
    return this.storage.write('student-records', data);
  }
}
