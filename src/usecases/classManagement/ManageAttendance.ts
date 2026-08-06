import type {
  AttendanceRecord,
  AttendanceData,
  AttendanceTombstone,
  StudentAttendance,
} from '@domain/entities/Attendance';
import { attendanceRecordKey, ATTENDANCE_TOMBSTONE_TTL_MS } from '@domain/entities/Attendance';
import type { ITeachingClassRepository } from '@domain/repositories/ITeachingClassRepository';
import { withDerivedTerm } from '@domain/rules/academicCalendar';
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
 * 모든 출결 저장 경로(add/saveRecord/upsertRecord/replaceDayForClass/upsertStudentEntries/deleteByClass)가 이 함수를 거친다.
 */
export function buildAttendanceSaveData(
  existing: AttendanceData | null,
  nextRecords: readonly AttendanceRecord[],
  now: string = new Date().toISOString(),
): AttendanceData {
  const existingRecords = existing?.records ?? [];
  // term 스탬프(S2.2·ADR-034): date(사건 발생일)에서 파생 — 저장 통과 시 자연 부착(마이그레이션 없음).
  // stampChangedRecords 뒤에 적용해도 안전 — 변경 지문(fingerprint)은 students만 본다.
  const records = stampChangedRecords(existingRecords, nextRecords, now).map(withDerivedTerm);
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

  /**
   * 특정 학급의 하루치 모든 교시 레코드를 반환한다.
   */
  async getDayRecords(classId: string, date: string): Promise<readonly AttendanceRecord[]> {
    const records = await this.getAll();
    return records.filter((r) => r.classId === classId && r.date === date);
  }

  /*
   * ── 변경 의도(intent) 메서드 ──────────────────────────────────────────
   * 스토어는 아래 intent만 호출한다 — "무엇을 바꾸겠다"만 넘기고, 실제 변형은
   * 락 안의 fresh 스냅샷에서 수행된다(P6). 과거의 whole-array saveAll류는
   * 스토어가 락 밖 in-memory 배열을 실어 보내 동기화 병합본을 통째로 덮었기에
   * (2026-07 QA BLOCKER 재현) 공개 API에서 제거됐다 — 재도입 금지.
   * 반환값 = 저장된 전체 레코드(스탬프 반영) — 호출자는 이것으로 화면 상태를 갱신한다.
   */

  /** 레코드 키 일치 — 그룹이면 (groupId,date,period), 단일이면 (classId,date,period,비그룹). */
  private static matchesKey(r: AttendanceRecord, target: AttendanceRecord): boolean {
    if (target.groupId) {
      return r.groupId === target.groupId && r.date === target.date && r.period === target.period;
    }
    return (
      r.classId === target.classId &&
      r.date === target.date &&
      r.period === target.period &&
      !r.groupId
    );
  }

  /** 단건 upsert(그룹 키 지원) — 같은 키 레코드는 교체, 없으면 추가. */
  async upsertRecord(record: AttendanceRecord): Promise<readonly AttendanceRecord[]> {
    return withFileLock(SYNC_FILE_KEYS.attendance, async () => {
      const data = await this.repository.getAttendance();
      const records = data?.records ?? [];

      // groupId 미주입 호출(모바일 등)은 fresh 학급 목록에서 폴백 주입 — 그룹 학급의
      // 출결이 비그룹 키로 저장되면 같은 (학급,날짜,교시)에 상충 레코드가 이중화된다(스윕 S4).
      // 단, 같은 키의 레거시 비그룹 레코드가 이미 있으면 주입하지 않고 그 자리에서
      // 교체한다 — 주입하면 레거시는 남긴 채 그룹 레코드를 새로 만들어 오히려
      // 이중화가 생긴다(QA2 B2).
      let finalRecord = record;
      if (!record.groupId && !records.some((r) => ManageAttendance.matchesKey(r, record))) {
        const classesData = await this.repository.getClasses();
        const cls = classesData?.classes.find((c) => c.id === record.classId);
        if (cls?.groupId) finalRecord = { ...record, groupId: cls.groupId };
      }

      // 그룹 키 매치는 물리 classId가 달라도(같은 교실의 다른 과목 명의) 성립한다 —
      // 교체 시 기존 레코드의 classId를 승계해 키 변경으로 인한 삭제 툼스톤 오생성과
      // 다른 기기로의 삭제 전파를 막는다(QA2 B2).
      const match = records.find((r) => ManageAttendance.matchesKey(r, finalRecord));
      if (match && match.classId !== finalRecord.classId) {
        finalRecord = { ...finalRecord, classId: match.classId };
      }
      const replaced: readonly AttendanceRecord[] = match
        ? records.map((r) => (ManageAttendance.matchesKey(r, finalRecord) ? finalRecord : r))
        : [...records, finalRecord];
      const saveData = buildAttendanceSaveData(data, replaced);
      await this.repository.saveAttendance(saveData);
      return saveData.records;
    });
  }

  /**
   * 하루 통째 교체(그리드 전용 — 담임 그리드는 그 학급 하루의 단일 기록자, ADR-021/022).
   * 그룹이면 (groupId, date) 매치 + 해당 classId의 단일 레코드, 단일이면 (classId, date, 비그룹)을
   * 제거하고 recordsByPeriod로 재구성한다. 빈 맵 = 그 날 비우기(의도적 삭제 허용).
   */
  async replaceDayForClass(params: {
    classId: string;
    groupId?: string;
    date: string;
    recordsByPeriod: ReadonlyMap<number, readonly StudentAttendance[]>;
  }): Promise<readonly AttendanceRecord[]> {
    const { classId, groupId, date, recordsByPeriod } = params;
    return withFileLock(SYNC_FILE_KEYS.attendance, async () => {
      const data = await this.repository.getAttendance();
      const all = data?.records ?? [];

      const filtered = all.filter((r) => {
        if (r.date !== date) return true;
        if (groupId) {
          if (r.groupId === groupId) return false;
          if (r.classId === classId && !r.groupId) return false;
          return true;
        }
        return !(r.classId === classId && !r.groupId);
      });

      const newRecords: AttendanceRecord[] = [];
      for (const [period, students] of recordsByPeriod) {
        if (students.length > 0) {
          newRecords.push({
            classId,
            ...(groupId ? { groupId } : {}),
            date,
            period,
            students,
          });
        }
      }

      // 관측성: 기존 기록이 있던 날을 통째로 비우면 툼스톤으로 삭제가 전 기기에
      // 전파된다 — 상태 리셋 버그로 빈 페이로드가 들어온 경우 진단 단서를 남긴다.
      const removedCount = all.length - filtered.length;
      if (newRecords.length === 0 && removedCount > 0) {
        console.warn(
          `[ManageAttendance] ${classId} ${date} 하루 출결 ${removedCount}건 전체 비우기 — 툼스톤으로 삭제 전파`,
        );
      }

      const saveData = buildAttendanceSaveData(data, [...filtered, ...newRecords]);
      await this.repository.saveAttendance(saveData);
      return saveData.records;
    });
  }

  /**
   * 대상 학생들의 하루 출결만 부분 갱신 — 대상 학생 엔트리를 그 날 전 교시에서 제거한 뒤
   * recordsByPeriod의 엔트리를 삽입한다. 나머지 학생은 락 안 fresh 상태 그대로 보존된다.
   *
   * 하루 통째 교체(replaceDayForClass)를 재사용하면 호출 시점의 낡은 하루 페이로드가
   * 동시 편집된 다른 학생의 fresh 출결을 덮는다(2026-07 QA F3) — 단일/부분 학생 편집은
   * 반드시 이 메서드를 쓸 것(기록 탭 인라인 편집·AI 브릿지 부분 등록).
   */
  async upsertStudentEntries(params: {
    classId: string;
    groupId?: string;
    date: string;
    studentNumbers: ReadonlySet<number>;
    recordsByPeriod: ReadonlyMap<number, readonly StudentAttendance[]>;
  }): Promise<readonly AttendanceRecord[]> {
    const { classId, groupId, date, studentNumbers, recordsByPeriod } = params;
    return withFileLock(SYNC_FILE_KEYS.attendance, async () => {
      const data = await this.repository.getAttendance();
      const all = data?.records ?? [];

      const isDayRecord = (r: AttendanceRecord): boolean => {
        if (r.date !== date) return false;
        if (groupId) return r.groupId === groupId || (r.classId === classId && !r.groupId);
        return r.classId === classId && !r.groupId;
      };

      const untouched = all.filter((r) => !isDayRecord(r));
      // 같은 교시에 그룹 레코드와 레거시 비그룹 레코드가 공존할 수 있다(그룹 도입 전
      // 데이터·타 경로 저장 잔재). 교시당 단일 레코드 Map으로 접으면 한쪽이 조용히
      // 버려져 그 레코드의 비대상 학생 출결이 통째 유실+툼스톤 전파된다 — 반드시
      // 매치된 전 레코드의 students를 병합해 보존한다(중복 번호는 앞 레코드 우선).
      const dayRecordsByPeriod = new Map<number, AttendanceRecord[]>();
      for (const r of all) {
        if (!isDayRecord(r)) continue;
        const list = dayRecordsByPeriod.get(r.period) ?? [];
        list.push(r);
        dayRecordsByPeriod.set(r.period, list);
      }

      const periods = new Set<number>([...dayRecordsByPeriod.keys(), ...recordsByPeriod.keys()]);
      const nextDay: AttendanceRecord[] = [];
      for (const period of periods) {
        const matches = dayRecordsByPeriod.get(period) ?? [];
        // 대상 학생 제거 → 새 엔트리 삽입(방어적으로 대상 학생 것만 받아들인다)
        const seen = new Set<number>();
        const kept: StudentAttendance[] = [];
        for (const rec of matches) {
          for (const sa of rec.students) {
            if (studentNumbers.has(sa.number) || seen.has(sa.number)) continue;
            seen.add(sa.number);
            kept.push(sa);
          }
        }
        const added = (recordsByPeriod.get(period) ?? []).filter((sa) =>
          studentNumbers.has(sa.number),
        );
        const students = [...kept, ...added];
        if (students.length === 0) continue; // 교시가 비면 레코드 삭제
        // 병합 결과는 단일 레코드 — 그룹 키 레코드가 있으면 그것을 기반으로(키 보존).
        const baseRecord =
          matches.find((r) => (groupId ? r.groupId === groupId : !r.groupId)) ?? matches[0];
        nextDay.push(
          baseRecord
            ? { ...baseRecord, students }
            : { classId, ...(groupId ? { groupId } : {}), date, period, students },
        );
      }

      const saveData = buildAttendanceSaveData(data, [...untouched, ...nextDay]);
      await this.repository.saveAttendance(saveData);
      return saveData.records;
    });
  }

  /**
   * 학급 삭제에 따른 출결 정리 — 해당 classId의 비그룹 레코드를 제거하고, 그룹 출결은
   * 그룹을 공유하는 다른 학급이 하나도 없을 때만 함께 제거한다.
   *
   * 그룹 출결은 물리 classId와 무관하게 그룹 전체(같은 교실의 여러 과목)가 공유하므로,
   * 남은 학급이 있는데 classId 기준으로 지우면 남은 과목이 쓰던 출결까지 삭제되고
   * 툼스톤으로 전 기기에 전파된다(QA2 B1). "남은 학급" 판정은 락 안 fresh 학급
   * 목록으로 수행하고, 목록을 읽지 못하면(null) 그룹 출결 전체를 보존한다(fail-closed) —
   * 오판의 비용이 비대칭이다(잔재 leftover < 복구 불가 삭제, 코드리뷰 스윕 S1).
   */
  async deleteByClass(classId: string, groupId?: string): Promise<readonly AttendanceRecord[]> {
    return withFileLock(SYNC_FILE_KEYS.attendance, async () => {
      const classesData = await this.repository.getClasses();
      const survivingGroups = classesData
        ? new Set(
            classesData.classes
              .filter((c) => c.id !== classId && c.groupId)
              .map((c) => c.groupId as string),
          )
        : null;

      const data = await this.repository.getAttendance();
      const all = data?.records ?? [];
      const kept = all.filter((r) => {
        if (r.groupId) {
          if (survivingGroups === null) return true; // 판정 불가 — 보존(fail-closed)
          if (survivingGroups.has(r.groupId)) return true; // 남은 학급이 공유 — 보존
          // 그룹에 남은 학급 없음: 삭제 학급 소유거나 지정 그룹이면 함께 정리
          return r.classId !== classId && r.groupId !== groupId;
        }
        return r.classId !== classId;
      });
      const saveData = buildAttendanceSaveData(data, kept);
      await this.repository.saveAttendance(saveData);
      return saveData.records;
    });
  }
}
