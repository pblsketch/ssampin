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
    // 방어: 기존 데이터가 있는데 빈 배열로 덮어쓰려 하면 차단
    const existing = await this.repository.getAttendance();
    const existingCount = existing?.records?.length ?? 0;
    if (existingCount > 0 && records.length === 0) {
      console.warn(
        `[ManageAttendance] 기존 출결 ${existingCount}건을 빈 배열로 덮어쓰기 시도 차단됨`,
      );
      return;
    }

    const updatedData: AttendanceData = { records };
    await this.repository.saveAttendance(updatedData);
  }
}
