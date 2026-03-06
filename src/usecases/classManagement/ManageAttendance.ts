import type { AttendanceRecord, AttendanceData } from '@domain/entities/Attendance';
import type { ITeachingClassRepository } from '@domain/repositories/ITeachingClassRepository';

export class ManageAttendance {
  constructor(private readonly repository: ITeachingClassRepository) {}

  async getAll(): Promise<readonly AttendanceRecord[]> {
    const data = await this.repository.getAttendance();
    return data?.records ?? [];
  }

  async getRecord(
    classId: string,
    date: string,
    period: number,
  ): Promise<AttendanceRecord | null> {
    const records = await this.getAll();
    return (
      records.find(
        (r) => r.classId === classId && r.date === date && r.period === period,
      ) ?? null
    );
  }

  async add(record: AttendanceRecord): Promise<void> {
    const data = await this.repository.getAttendance();
    const records = data?.records ?? [];

    const updatedRecords: readonly AttendanceRecord[] = [...records, record];
    const updatedData: AttendanceData = { records: updatedRecords };

    await this.repository.saveAttendance(updatedData);
  }

  async saveRecord(record: AttendanceRecord): Promise<void> {
    const data = await this.repository.getAttendance();
    const records = data?.records ?? [];

    const exists = records.some(
      (r) =>
        r.classId === record.classId &&
        r.date === record.date &&
        r.period === record.period,
    );

    const updatedRecords: readonly AttendanceRecord[] = exists
      ? records.map((r) =>
          r.classId === record.classId &&
          r.date === record.date &&
          r.period === record.period
            ? record
            : r,
        )
      : [...records, record];

    const updatedData: AttendanceData = { records: updatedRecords };
    await this.repository.saveAttendance(updatedData);
  }

  async saveAll(records: readonly AttendanceRecord[]): Promise<void> {
    const updatedData: AttendanceData = { records };
    await this.repository.saveAttendance(updatedData);
  }
}
