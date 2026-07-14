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
import type { AttendanceData, AttendanceRecord } from '@domain/entities/Attendance';
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

  it('saveDayBatch는 락 안에서 saveAllUnsafe를 쓰므로 교착 없이 완료된다 (비재진입 규율)', async () => {
    const repo = new FakeAttendanceRepo();
    const manage = new ManageAttendance(repo as unknown as ITeachingClassRepository);

    const students = [{ number: 1, status: 'absent' as const }];
    await expect(
      manage.saveDayBatch('class-1', '2026-07-14', new Map([[1, students]])),
    ).resolves.toBeUndefined();

    expect(repo.data?.records).toHaveLength(1);
    expect(repo.data?.records[0]?.classId).toBe('class-1');
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
});
