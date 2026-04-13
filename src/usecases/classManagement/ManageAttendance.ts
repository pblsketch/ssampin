import type { AttendanceRecord, AttendanceData, StudentAttendance } from '@domain/entities/Attendance';
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

  /**
   * 특정 학급의 하루치 모든 교시 레코드를 반환한다.
   */
  async getDayRecords(classId: string, date: string): Promise<readonly AttendanceRecord[]> {
    const records = await this.getAll();
    return records.filter((r) => r.classId === classId && r.date === date);
  }

  /**
   * 특정 학급의 하루치 모든 교시 출결을 일괄 저장한다 (매트릭스 저장용).
   * 1. 전체 레코드 로드
   * 2. (classId, date) 일치하는 기존 레코드 제거
   * 3. recordsByPeriod의 각 항목에서 students가 비어있지 않은 period만 새 레코드 생성
   * 4. saveAll() 1회 호출 (파일 I/O 최소화)
   */
  async saveDayBatch(
    classId: string,
    date: string,
    recordsByPeriod: ReadonlyMap<number, readonly StudentAttendance[]>,
  ): Promise<void> {
    const all = await this.getAll();

    // 기존 (classId, date) 레코드 제거
    const filtered = all.filter(
      (r) => !(r.classId === classId && r.date === date),
    );

    // recordsByPeriod에서 students가 비어있지 않은 period만 신규 레코드 생성
    const newRecords: AttendanceRecord[] = [];
    for (const [period, students] of recordsByPeriod) {
      if (students.length > 0) {
        newRecords.push({ classId, date, period, students });
      }
    }

    const merged: readonly AttendanceRecord[] = [...filtered, ...newRecords];
    await this.saveAll(merged, true);
  }

  async saveAll(records: readonly AttendanceRecord[], force = false): Promise<void> {
    // 방어: 기존 데이터가 있는데 빈 배열로 덮어쓰려 하면 차단 (force로 의도적 삭제 허용)
    if (!force) {
      const existing = await this.repository.getAttendance();
      const existingCount = existing?.records?.length ?? 0;
      if (existingCount > 0 && records.length === 0) {
        console.warn(
          `[ManageAttendance] 기존 출결 ${existingCount}건을 빈 배열로 덮어쓰기 시도 차단됨`,
        );
        return;
      }
    }

    const updatedData: AttendanceData = { records };
    await this.repository.saveAttendance(updatedData);
  }
}
