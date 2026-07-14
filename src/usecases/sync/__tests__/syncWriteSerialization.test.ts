/**
 * 동기화 병합 쓰기 × 유스케이스 저장 직렬화 통합 테스트 (sync-hardening-2 A2a).
 *
 * 2026-07 codex QA 재현 경합: SyncFromCloud가 파일을 읽은 사이 사용자가 저장하면
 * 나중 쓰기가 먼저 쓰기를 삼켰다("읽기→병합→통째 쓰기" vs "읽기→변형→통째 쓰기").
 * A2a 이후 두 흐름이 같은 파일 락(SYNC_FILE_KEYS) 도메인에서 직렬화되어 둘 다 살아남는다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { ObservationData, ObservationRecord } from '@domain/entities/Observation';
import type { IObservationRepository } from '@domain/repositories/IObservationRepository';
import type {
  AttendanceData,
  AttendanceRecord,
  AttendanceStatus,
} from '@domain/entities/Attendance';
import type { ITeachingClassRepository } from '@domain/repositories/ITeachingClassRepository';
import { withFileLock, resetFileWriteLocksForTest } from '@usecases/shared/fileWriteLock';
import { SYNC_FILE_KEYS } from '@usecases/sync/syncRegistry';
import { ManageObservations } from '@usecases/classManagement/ManageObservations';
import { ManageAttendance } from '@usecases/classManagement/ManageAttendance';
import { mergeObservations } from '@usecases/sync/SyncFromCloud';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeObs(id: string, updatedAt: number): ObservationRecord {
  return {
    id,
    classId: 'class-1',
    studentName: `학생-${id}`,
    content: `기록-${id}`,
    date: '2026-07-14',
    createdAt: '2026-07-14T09:00:00.000Z',
    updatedAt,
  } as unknown as ObservationRecord;
}

/** 읽기에 지연을 줘 직렬화 없이는 경합이 반드시 재현되게 하는 가짜 관찰 저장소. */
class FakeObsRepo implements IObservationRepository {
  data: ObservationData | null = { records: [] };
  async getObservations(): Promise<ObservationData | null> {
    await sleep(5);
    return this.data ? (JSON.parse(JSON.stringify(this.data)) as ObservationData) : null;
  }
  async saveObservations(data: ObservationData): Promise<void> {
    await sleep(2);
    this.data = data;
  }
}

describe('동기화 병합 쓰기 × 유스케이스 저장 직렬화 (A2a)', () => {
  beforeEach(() => {
    resetFileWriteLocksForTest();
  });

  it('observations: sync 병합 쓰기와 사용자 add가 겹쳐도 둘 다 살아남는다 (QA 재현 경합 역검증)', async () => {
    const repo = new FakeObsRepo();
    const manage = new ManageObservations(repo);

    // 동기화 흐름: 락 안에서 로컬 읽기 → 리모트 병합 → 통째 쓰기 (SyncFromCloud와 동일 구조·동일 락 키)
    const remoteData: ObservationData = { records: [makeObs('remote-1', 1000)] };
    const syncMergeWrite = withFileLock(SYNC_FILE_KEYS.observations, async () => {
      const local = await repo.getObservations();
      const merged = mergeObservations(local, remoteData, true);
      await repo.saveObservations(merged);
    });

    // 사용자 흐름: 같은 순간 수업 기록 추가 (락 도입 전이라면 sync가 읽은 낡은 스냅샷이 이 기록을 삼킨다)
    const userAdd = manage.add(makeObs('user-1', 2000));

    await Promise.all([syncMergeWrite, userAdd]);

    const ids = (repo.data?.records ?? []).map((r) => r.id).sort();
    expect(ids).toEqual(['remote-1', 'user-1']);
  });

  it('observations: 사용자 저장이 먼저 시작해도 순서만 다를 뿐 무유실은 동일하다', async () => {
    const repo = new FakeObsRepo();
    const manage = new ManageObservations(repo);
    const remoteData: ObservationData = { records: [makeObs('remote-2', 1000)] };

    const userAdd = manage.add(makeObs('user-2', 2000));
    const syncMergeWrite = withFileLock(SYNC_FILE_KEYS.observations, async () => {
      const local = await repo.getObservations();
      const merged = mergeObservations(local, remoteData, true);
      await repo.saveObservations(merged);
    });

    await Promise.all([userAdd, syncMergeWrite]);

    const ids = (repo.data?.records ?? []).map((r) => r.id).sort();
    expect(ids).toEqual(['remote-2', 'user-2']);
  });
});

/** ManageAttendance용 최소 가짜 저장소 — 출결 읽기/쓰기만 구현. */
class FakeAttendanceRepo {
  data: AttendanceData | null = null;
  async getAttendance(): Promise<AttendanceData | null> {
    await sleep(3);
    return this.data ? (JSON.parse(JSON.stringify(this.data)) as AttendanceData) : null;
  }
  async saveAttendance(data: AttendanceData): Promise<void> {
    await sleep(2);
    this.data = data;
  }
}

describe('ManageAttendance 락 배선 (A2a)', () => {
  beforeEach(() => {
    resetFileWriteLocksForTest();
  });

  it('replaceDayForClass는 하루 통째 교체 의도를 락 안 fresh 스냅샷에 적용한다', async () => {
    const repo = new FakeAttendanceRepo();
    // 다른 날짜/다른 반 레코드는 보존되어야 한다.
    repo.data = {
      records: [
        {
          classId: 'class-9',
          date: '2026-07-14',
          period: 1,
          students: [{ number: 9, status: 'present' }],
        },
        {
          classId: 'class-1',
          date: '2026-07-13',
          period: 1,
          students: [{ number: 1, status: 'late' }],
        },
      ],
    };
    const manage = new ManageAttendance(repo as unknown as ITeachingClassRepository);

    const students = [{ number: 1, status: 'absent' as const }];
    const saved = await manage.replaceDayForClass({
      classId: 'class-1',
      date: '2026-07-14',
      recordsByPeriod: new Map([[1, students]]),
    });

    expect(saved).toHaveLength(3);
    expect(repo.data?.records).toHaveLength(3);
    const dayRec = repo.data?.records.find(
      (r) => r.classId === 'class-1' && r.date === '2026-07-14',
    );
    expect(dayRec?.students[0]?.status).toBe('absent');
  });

  it('attendance: add 두 건이 겹쳐도 직렬화되어 둘 다 저장된다', async () => {
    const repo = new FakeAttendanceRepo();
    const manage = new ManageAttendance(repo as unknown as ITeachingClassRepository);

    const rec = (period: number): AttendanceRecord => ({
      classId: 'class-1',
      date: '2026-07-14',
      period,
      students: [{ number: 1, status: 'late' }],
    });

    await Promise.all([manage.add(rec(1)), manage.add(rec(2))]);

    expect(repo.data?.records).toHaveLength(2);
  });

  it('intra-period 다학생: 같은 교시의 두 학생 부분 갱신이 겹쳐도 둘 다 살아남는다 (QA F3 역검증)', async () => {
    const repo = new FakeAttendanceRepo();
    repo.data = {
      records: [
        {
          classId: 'class-1',
          date: '2026-07-14',
          period: 1,
          students: [
            { number: 1, status: 'present' },
            { number: 2, status: 'present' },
            { number: 3, status: 'present' },
          ],
        },
      ],
    };
    const manage = new ManageAttendance(repo as unknown as ITeachingClassRepository);

    const editStudent = (num: number, status: AttendanceStatus): Promise<unknown> =>
      manage.upsertStudentEntries({
        classId: 'class-1',
        date: '2026-07-14',
        studentNumbers: new Set([num]),
        recordsByPeriod: new Map([[1, [{ number: num, status }]]]),
      });

    // 하루 통째 교체(stale 페이로드)였다면 나중 저장이 앞 학생의 편집을 덮는다.
    await Promise.all([editStudent(1, 'absent'), editStudent(2, 'late')]);

    const rec = repo.data?.records.find((r) => r.period === 1);
    expect(rec?.students.find((s) => s.number === 1)?.status).toBe('absent');
    expect(rec?.students.find((s) => s.number === 2)?.status).toBe('late');
    expect(rec?.students.find((s) => s.number === 3)?.status).toBe('present'); // 무관 학생 보존
  });
});
