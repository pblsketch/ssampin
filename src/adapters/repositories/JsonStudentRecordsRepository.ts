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

  /** Q2: 첫 마이그레이션 직전 원본 1회 스냅샷(이미 있으면 보존). 동기화 제외 로컬 파일. */
  async saveBackupOnce(data: StudentRecordsData): Promise<void> {
    const existing = await this.storage.read<StudentRecordsData>('student-records.q2-backup');
    if (existing) return; // 원본 백업 보존(부분 마이그레이션본으로 덮어쓰지 않음)
    await this.storage.write('student-records.q2-backup', data);
  }
}
