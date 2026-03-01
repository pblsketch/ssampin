import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { IStudentRecordsRepository } from '@domain/repositories/IStudentRecordsRepository';

export class ManageStudentRecords {
  constructor(
    private readonly studentRecordsRepository: IStudentRecordsRepository,
  ) {}

  async getAll(): Promise<readonly StudentRecord[]> {
    const data = await this.studentRecordsRepository.getRecords();
    return data?.records ?? [];
  }

  async add(record: StudentRecord): Promise<void> {
    const data = await this.studentRecordsRepository.getRecords();
    const current = data?.records ?? [];
    await this.studentRecordsRepository.saveRecords({
      records: [...current, record],
    });
  }

  async update(updated: StudentRecord): Promise<void> {
    const data = await this.studentRecordsRepository.getRecords();
    const current = data?.records ?? [];
    const records = current.map((r) =>
      r.id === updated.id ? updated : r,
    );
    await this.studentRecordsRepository.saveRecords({ records });
  }

  async delete(id: string): Promise<void> {
    const data = await this.studentRecordsRepository.getRecords();
    const current = data?.records ?? [];
    const records = current.filter((r) => r.id !== id);
    await this.studentRecordsRepository.saveRecords({ records });
  }
}
