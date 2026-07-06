import type {
  AttendanceRecord,
  AttendanceData,
  StudentAttendance,
} from '@domain/entities/Attendance';
import { attendanceRecordKey } from '@domain/entities/Attendance';
import type { ITeachingClassRepository } from '@domain/repositories/ITeachingClassRepository';

/** students 내용 비교용 정규화(순서 무관) — 순서만 바뀐 저장으로 updatedAt이 갱신되는 것을 줄인다 */
function studentsFingerprint(students: readonly StudentAttendance[]): string {
  const sorted = [...students].sort(
    (a, b) =>
      (a.grade ?? 0) - (b.grade ?? 0) ||
      (a.classNum ?? 0) - (b.classNum ?? 0) ||
      a.number - b.number,
  );
  return JSON.stringify(
    sorted.map((s) => [
      s.number,
      s.status,
      s.reason ?? '',
      s.memo ?? '',
      s.grade ?? '',
      s.classNum ?? '',
    ]),
  );
}

/**
 * 저장 직전 스탬프: 기존 데이터와 내용이 달라진 레코드에만 updatedAt(현재 시각)을 찍고,
 * 내용이 같은 레코드는 기존 updatedAt을 승계한다.
 * (호출자들이 레코드 객체를 새로 만들어 저장하므로, 승계하지 않으면 스탬프가 유실된다)
 */
export function stampChangedRecords(
  existing: readonly AttendanceRecord[],
  next: readonly AttendanceRecord[],
): readonly AttendanceRecord[] {
  const prevByKey = new Map(existing.map((r) => [attendanceRecordKey(r), r]));
  const now = new Date().toISOString();
  return next.map((r) => {
    const prev = prevByKey.get(attendanceRecordKey(r));
    if (prev && studentsFingerprint(prev.students) === studentsFingerprint(r.students)) {
      // 내용 동일 → 기존 스탬프 승계 (없으면 그대로 없음)
      return prev.updatedAt ? { ...r, updatedAt: prev.updatedAt } : r;
    }
    return { ...r, updatedAt: now };
  });
}

export class ManageAttendance {
  constructor(private readonly repository: ITeachingClassRepository) {}

  async getAll(): Promise<readonly AttendanceRecord[]> {
    const data = await this.repository.getAttendance();
    return data?.records ?? [];
  }

  async getRecord(classId: string, date: string, period: number): Promise<AttendanceRecord | null> {
    const records = await this.getAll();
    return (
      records.find((r) => r.classId === classId && r.date === date && r.period === period) ?? null
    );
  }

  async add(record: AttendanceRecord): Promise<void> {
    const data = await this.repository.getAttendance();
    const records = data?.records ?? [];

    const updatedRecords = stampChangedRecords(records, [...records, record]);
    const updatedData: AttendanceData = { records: updatedRecords };

    await this.repository.saveAttendance(updatedData);
  }

  async saveRecord(record: AttendanceRecord): Promise<void> {
    const data = await this.repository.getAttendance();
    const records = data?.records ?? [];

    const exists = records.some(
      (r) => r.classId === record.classId && r.date === record.date && r.period === record.period,
    );

    const replaced: readonly AttendanceRecord[] = exists
      ? records.map((r) =>
          r.classId === record.classId && r.date === record.date && r.period === record.period
            ? record
            : r,
        )
      : [...records, record];

    const updatedData: AttendanceData = { records: stampChangedRecords(records, replaced) };
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
    const filtered = all.filter((r) => !(r.classId === classId && r.date === date));

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
    const existing = await this.repository.getAttendance();
    const existingRecords = existing?.records ?? [];

    // 방어: 기존 데이터가 있는데 빈 배열로 덮어쓰려 하면 차단 (force로 의도적 삭제 허용)
    if (!force && existingRecords.length > 0 && records.length === 0) {
      console.warn(
        `[ManageAttendance] 기존 출결 ${existingRecords.length}건을 빈 배열로 덮어쓰기 시도 차단됨`,
      );
      return;
    }

    const updatedData: AttendanceData = { records: stampChangedRecords(existingRecords, records) };
    await this.repository.saveAttendance(updatedData);
  }
}
