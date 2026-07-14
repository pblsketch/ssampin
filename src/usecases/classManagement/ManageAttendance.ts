import type {
  AttendanceRecord,
  AttendanceData,
  AttendanceTombstone,
  StudentAttendance,
} from '@domain/entities/Attendance';
import { attendanceRecordKey, ATTENDANCE_TOMBSTONE_TTL_MS } from '@domain/entities/Attendance';
import type { ITeachingClassRepository } from '@domain/repositories/ITeachingClassRepository';
import { withFileLock } from '@usecases/shared/fileWriteLock';
import { SYNC_FILE_KEYS } from '@usecases/sync/syncRegistry';

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
  now: string = new Date().toISOString(),
): readonly AttendanceRecord[] {
  const prevByKey = new Map(existing.map((r) => [attendanceRecordKey(r), r]));
  return next.map((r) => {
    const prev = prevByKey.get(attendanceRecordKey(r));
    if (prev && studentsFingerprint(prev.students) === studentsFingerprint(r.students)) {
      // 내용 동일 → 기존 스탬프 승계 (없으면 그대로 없음)
      return prev.updatedAt ? { ...r, updatedAt: prev.updatedAt } : r;
    }
    return { ...r, updatedAt: now };
  });
}

/**
 * 저장 데이터 조립: 변경 레코드 스탬프 + 삭제 전파 툼스톤 관리.
 * - 이번 저장에서 사라진 키 → 툼스톤 추가(삭제 시각 기록)
 * - 다시 등장한 키 → 툼스톤 제거(재작성이 삭제를 이김)
 * - TTL(90일) 지난 툼스톤 → 정리(GC)
 * 모든 출결 저장 경로(add/saveRecord/saveDayBatch/saveAll)가 이 함수를 거친다.
 */
export function buildAttendanceSaveData(
  existing: AttendanceData | null,
  nextRecords: readonly AttendanceRecord[],
  now: string = new Date().toISOString(),
): AttendanceData {
  const existingRecords = existing?.records ?? [];
  const records = stampChangedRecords(existingRecords, nextRecords, now);
  const nextKeys = new Set(records.map(attendanceRecordKey));
  const cutoff = new Date(new Date(now).getTime() - ATTENDANCE_TOMBSTONE_TTL_MS).toISOString();

  // 기존 툼스톤 승계 — 재등장(부활) 키와 TTL 경과분은 제거
  const carried = (existing?.deleted ?? []).filter(
    (t) => !nextKeys.has(t.key) && t.deletedAt > cutoff,
  );
  const carriedKeys = new Set(carried.map((t) => t.key));

  // 이번 저장에서 사라진 키 → 새 툼스톤
  const newTombstones: AttendanceTombstone[] = existingRecords
    .map(attendanceRecordKey)
    .filter((k) => !nextKeys.has(k) && !carriedKeys.has(k))
    .map((key) => ({ key, deletedAt: now }));

  const deleted = [...carried, ...newTombstones];
  return deleted.length > 0 ? { records, deleted } : { records };
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
    // 읽기→조립→쓰기 전체를 파일 락 안에서 — 쓰기만 감싸면 낡은 스냅샷 위라 무의미.
    return withFileLock(SYNC_FILE_KEYS.attendance, async () => {
      const data = await this.repository.getAttendance();
      const records = data?.records ?? [];

      await this.repository.saveAttendance(buildAttendanceSaveData(data, [...records, record]));
    });
  }

  async saveRecord(record: AttendanceRecord): Promise<void> {
    return withFileLock(SYNC_FILE_KEYS.attendance, async () => {
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

      await this.repository.saveAttendance(buildAttendanceSaveData(data, replaced));
    });
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
    // 읽기(getAll)부터 쓰기까지 한 임계구역 — 내부는 saveAllUnsafe(같은 락 중첩 = 교착).
    return withFileLock(SYNC_FILE_KEYS.attendance, async () => {
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
      await this.saveAllUnsafe(merged, true);
    });
  }

  async saveAll(records: readonly AttendanceRecord[], force = false): Promise<void> {
    return withFileLock(SYNC_FILE_KEYS.attendance, () => this.saveAllUnsafe(records, force));
  }

  /** 락 내부 전용 — 공개 saveAll을 락 안에서 중첩 호출하면 체인이 자기 자신을 기다려 교착한다. */
  private async saveAllUnsafe(records: readonly AttendanceRecord[], force: boolean): Promise<void> {
    const existing = await this.repository.getAttendance();
    const existingRecords = existing?.records ?? [];

    // 방어: 기존 데이터가 있는데 빈 배열로 덮어쓰려 하면 차단 (force로 의도적 삭제 허용)
    if (!force && existingRecords.length > 0 && records.length === 0) {
      console.warn(
        `[ManageAttendance] 기존 출결 ${existingRecords.length}건을 빈 배열로 덮어쓰기 시도 차단됨`,
      );
      return;
    }

    await this.repository.saveAttendance(buildAttendanceSaveData(existing, records));
  }
}
