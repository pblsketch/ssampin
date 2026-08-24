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
import type { CurriculumProgressData, ProgressEntry } from '@domain/entities/CurriculumProgress';
import { withFileLock, resetFileWriteLocksForTest } from '@usecases/shared/fileWriteLock';
import { SYNC_FILE_KEYS } from '@usecases/sync/syncRegistry';
import { ManageObservations } from '@usecases/classManagement/ManageObservations';
import { ManageAttendance } from '@usecases/classManagement/ManageAttendance';
import { ManageCurriculumProgress } from '@usecases/classManagement/ManageCurriculumProgress';
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

class FakeProgressRepo {
  data: CurriculumProgressData = { entries: [] };

  async getProgress(): Promise<CurriculumProgressData> {
    await sleep(3);
    return JSON.parse(JSON.stringify(this.data)) as CurriculumProgressData;
  }

  async saveProgress(data: CurriculumProgressData): Promise<void> {
    await sleep(2);
    this.data = data;
  }
}

function makeProgress(id: string, status: ProgressEntry['status']): ProgressEntry {
  return {
    id,
    classId: 'class-1',
    date: '2026-08-24',
    period: 1,
    unit: '진도 동기화',
    lesson: id,
    status,
    note: '',
  };
}

describe('진도 원격 교체 × 사용자 입력 직렬화', () => {
  beforeEach(() => {
    resetFileWriteLocksForTest();
  });

  it('동기화가 최종 확인을 마친 직후 입력해도 원격 교체 뒤에 이어서 저장한다', async () => {
    const repo = new FakeProgressRepo();
    repo.data = { entries: [makeProgress('baseline', 'planned')] };
    const manage = new ManageCurriculumProgress(repo as unknown as ITeachingClassRepository);

    const syncReplace = withFileLock(SYNC_FILE_KEYS.curriculumProgress, async () => {
      await repo.getProgress();
      await sleep(10);
      await repo.saveProgress({ entries: [makeProgress('remote', 'completed')] });
    });
    const userAdd = manage.add(makeProgress('mobile', 'planned'));

    await Promise.all([syncReplace, userAdd]);

    expect(repo.data.entries.map((entry) => entry.id)).toEqual(['remote', 'mobile']);
  });
});

describe('ManageObservations 커스텀 태그·분류 intent (A2c)', () => {
  beforeEach(() => {
    resetFileWriteLocksForTest();
  });

  it('addCustomTag 두 건이 겹쳐도 둘 다 살아남는다 (whole-array 저장이었다면 마지막만 남음)', async () => {
    const repo = new FakeObsRepo();
    const manage = new ManageObservations(repo);

    await Promise.all([manage.addCustomTag('태그A'), manage.addCustomTag('태그B')]);

    expect([...(repo.data?.customTags ?? [])].sort()).toEqual(['태그A', '태그B']);
  });

  it('sync 병합(customTags 합집합)과 addCustomTag가 겹쳐도 둘 다 살아남는다', async () => {
    const repo = new FakeObsRepo();
    const manage = new ManageObservations(repo);

    const remoteData: ObservationData = { records: [], customTags: ['원격태그'] };
    const syncMergeWrite = withFileLock(SYNC_FILE_KEYS.observations, async () => {
      const local = await repo.getObservations();
      const merged = mergeObservations(local, remoteData, true);
      await repo.saveObservations(merged);
    });
    const userAdd = manage.addCustomTag('로컬태그');

    await Promise.all([syncMergeWrite, userAdd]);

    expect([...(repo.data?.customTags ?? [])].sort()).toEqual(['로컬태그', '원격태그']);
  });

  it('removeCustomTag는 락 안 fresh 목록에서 제거한다 (반환값 = 저장된 목록)', async () => {
    const repo = new FakeObsRepo();
    repo.data = { records: [], customTags: ['유지', '삭제대상'] };
    const manage = new ManageObservations(repo);

    const saved = await manage.removeCustomTag('삭제대상');

    expect(saved).toEqual(['유지']);
    expect(repo.data?.customTags).toEqual(['유지']);
  });
});

/** ManageAttendance용 최소 가짜 저장소 — 출결 읽기/쓰기 + 학급 목록(그룹 판정용). */
class FakeAttendanceRepo {
  data: AttendanceData | null = null;
  classes: { id: string; groupId?: string }[] | null = null;
  async getAttendance(): Promise<AttendanceData | null> {
    await sleep(3);
    return this.data ? (JSON.parse(JSON.stringify(this.data)) as AttendanceData) : null;
  }
  async saveAttendance(data: AttendanceData): Promise<void> {
    await sleep(2);
    this.data = data;
  }
  async getClasses(): Promise<{ classes: { id: string; groupId?: string }[] } | null> {
    return this.classes ? { classes: this.classes } : null;
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

  it('attendance: upsertRecord 두 건이 겹쳐도 직렬화되어 둘 다 저장된다', async () => {
    const repo = new FakeAttendanceRepo();
    const manage = new ManageAttendance(repo as unknown as ITeachingClassRepository);

    const rec = (period: number): AttendanceRecord => ({
      classId: 'class-1',
      date: '2026-07-14',
      period,
      students: [{ number: 1, status: 'late' }],
    });

    await Promise.all([manage.upsertRecord(rec(1)), manage.upsertRecord(rec(2))]);

    expect(repo.data?.records).toHaveLength(2);
  });

  it('upsertRecord는 그룹 키를 존중한다 — 같은 classId의 그룹 레코드를 비그룹 저장이 덮지 않는다', async () => {
    const repo = new FakeAttendanceRepo();
    repo.data = {
      records: [
        {
          classId: 'class-1',
          groupId: 'group-G',
          date: '2026-07-14',
          period: 1,
          students: [{ number: 9, status: 'absent' }],
        },
      ],
    };
    const manage = new ManageAttendance(repo as unknown as ITeachingClassRepository);

    await manage.upsertRecord({
      classId: 'class-1',
      date: '2026-07-14',
      period: 1,
      students: [{ number: 1, status: 'late' }],
    });

    // 그룹 레코드는 보존되고 비그룹 레코드가 별도로 추가된다(키 체계 분리).
    expect(repo.data?.records).toHaveLength(2);
    expect(repo.data?.records.some((r) => r.groupId === 'group-G')).toBe(true);
  });

  it('upsertRecord는 groupId 미주입 호출에 fresh 학급 목록의 그룹 키를 폴백 주입한다 (스윕 S4)', async () => {
    const repo = new FakeAttendanceRepo();
    repo.classes = [{ id: 'class-1', groupId: 'group-G' }]; // class-1은 그룹 소속
    repo.data = {
      records: [
        {
          classId: 'class-1',
          groupId: 'group-G',
          date: '2026-07-14',
          period: 1,
          students: [{ number: 9, status: 'absent' }],
        },
      ],
    };
    const manage = new ManageAttendance(repo as unknown as ITeachingClassRepository);

    // 모바일처럼 groupId 없이 저장 — 주입 없으면 비그룹 레코드가 이중화된다.
    await manage.upsertRecord({
      classId: 'class-1',
      date: '2026-07-14',
      period: 1,
      students: [{ number: 1, status: 'late' }],
    });

    expect(repo.data?.records).toHaveLength(1); // 그룹 레코드가 교체됨(이중화 없음)
    expect(repo.data?.records[0]?.groupId).toBe('group-G');
    expect(repo.data?.records[0]?.students[0]?.number).toBe(1);
  });

  it('upsertStudentEntries: 같은 교시에 그룹+레거시 비그룹 레코드가 공존해도 비대상 학생이 유실되지 않는다', async () => {
    const repo = new FakeAttendanceRepo();
    repo.data = {
      records: [
        {
          classId: 'class-1',
          date: '2026-07-14',
          period: 1,
          students: [{ number: 1, status: 'absent' }], // 레거시 비그룹
        },
        {
          classId: 'class-1',
          groupId: 'group-G',
          date: '2026-07-14',
          period: 1,
          students: [{ number: 2, status: 'late' }], // 그룹 레코드
        },
      ],
    };
    const manage = new ManageAttendance(repo as unknown as ITeachingClassRepository);

    // 그룹 문맥에서 학생 3만 부분 갱신 — Map 단일 키로 접으면 한 레코드가 통째 드롭됐다.
    await manage.upsertStudentEntries({
      classId: 'class-1',
      groupId: 'group-G',
      date: '2026-07-14',
      studentNumbers: new Set([3]),
      recordsByPeriod: new Map([[1, [{ number: 3, status: 'earlyLeave' }]]]),
    });

    const period1 = repo.data?.records.filter((r) => r.period === 1) ?? [];
    const numbers = period1.flatMap((r) => r.students.map((s) => s.number)).sort();
    expect(numbers).toEqual([1, 2, 3]); // 두 레코드의 기존 학생 전원 보존 + 대상 학생 추가
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

/**
 * 2026-07 QA2(gpt-5.6-sol 데이터 보존 검증) 회귀 잠금 — 기존 사용자 데이터가
 * 학급 삭제·교차 반 저장·읽기 실패로 사라지는 세 경로를 막는다.
 */
describe('QA2 데이터 보존 회귀 잠금', () => {
  beforeEach(() => {
    resetFileWriteLocksForTest();
  });

  const groupRecordOwnedByA: AttendanceRecord = {
    classId: 'class-A',
    groupId: 'group-G',
    date: '2026-07-14',
    period: 1,
    students: [
      { number: 1, status: 'absent' },
      { number: 2, status: 'late' },
    ],
  };

  it('deleteByClass: 그룹에 다른 학급이 남아 있으면 공유 그룹 출결을 보존한다 (QA2 B1)', async () => {
    const repo = new FakeAttendanceRepo();
    repo.classes = [
      { id: 'class-A', groupId: 'group-G' },
      { id: 'class-B', groupId: 'group-G' },
    ];
    repo.data = {
      records: [
        groupRecordOwnedByA, // class-B가 계속 쓰는 공유 레코드 (물리 classId만 A)
        {
          classId: 'class-A',
          date: '2026-07-14',
          period: 2,
          students: [{ number: 1, status: 'late' }],
        },
      ],
    };
    const manage = new ManageAttendance(repo as unknown as ITeachingClassRepository);

    await manage.deleteByClass('class-A', 'group-G');

    // 공유 그룹 레코드는 보존, A 단독(비그룹) 레코드만 삭제된다.
    expect(repo.data?.records).toHaveLength(1);
    expect(repo.data?.records[0]?.groupId).toBe('group-G');
    // 공유 레코드에 삭제 툼스톤이 생기면 다른 기기의 사본까지 지워진다.
    const tombKeys = (repo.data?.deleted ?? []).map((t) => t.key);
    expect(tombKeys.some((k) => k.includes('group-G'))).toBe(false);
  });

  it('deleteByClass: 그룹의 마지막 학급을 삭제하면 그룹 출결도 함께 정리한다', async () => {
    const repo = new FakeAttendanceRepo();
    repo.classes = [{ id: 'class-A', groupId: 'group-G' }]; // 남은 학급 없음
    repo.data = { records: [groupRecordOwnedByA] };
    const manage = new ManageAttendance(repo as unknown as ITeachingClassRepository);

    await manage.deleteByClass('class-A', 'group-G');

    expect(repo.data?.records).toHaveLength(0);
  });

  it('deleteByClass: 학급 목록을 읽지 못하면(null) 그룹 출결을 보존한다 (fail-closed)', async () => {
    const repo = new FakeAttendanceRepo();
    repo.classes = null; // 판정 불가
    repo.data = { records: [groupRecordOwnedByA] };
    const manage = new ManageAttendance(repo as unknown as ITeachingClassRepository);

    await manage.deleteByClass('class-A', 'group-G');

    expect(repo.data?.records).toHaveLength(1);
  });

  it('upsertRecord: 다른 학급 명의의 공유 그룹 레코드를 교체할 때 classId를 승계해 툼스톤을 만들지 않는다 (QA2 B2)', async () => {
    const repo = new FakeAttendanceRepo();
    repo.classes = [
      { id: 'class-A', groupId: 'group-G' },
      { id: 'class-B', groupId: 'group-G' },
    ];
    repo.data = { records: [groupRecordOwnedByA] };
    const manage = new ManageAttendance(repo as unknown as ITeachingClassRepository);

    // 같은 그룹의 다른 과목 반(class-B)에서 전체 명단으로 저장 (groupId 미주입 = 모바일 모양)
    await manage.upsertRecord({
      classId: 'class-B',
      date: '2026-07-14',
      period: 1,
      students: [
        { number: 1, status: 'absent' },
        { number: 2, status: 'present' },
      ],
    });

    // 레코드는 하나로 유지되고 물리 classId(키)가 보존된다 — 키가 바뀌면
    // 옛 키의 삭제 툼스톤이 다른 기기의 사본을 지운다.
    expect(repo.data?.records).toHaveLength(1);
    expect(repo.data?.records[0]?.classId).toBe('class-A');
    expect(repo.data?.records[0]?.students.find((s) => s.number === 2)?.status).toBe('present');
    expect(repo.data?.deleted ?? []).toHaveLength(0);
  });

  it('upsertRecord: 같은 키의 레거시 비그룹 레코드가 있으면 그룹 키를 주입하지 않고 그 자리에서 교체한다(이중화 방지)', async () => {
    const repo = new FakeAttendanceRepo();
    repo.classes = [{ id: 'class-A', groupId: 'group-G' }];
    repo.data = {
      records: [
        {
          classId: 'class-A',
          date: '2026-07-14',
          period: 1,
          students: [{ number: 1, status: 'late' }], // 레거시 비그룹
        },
      ],
    };
    const manage = new ManageAttendance(repo as unknown as ITeachingClassRepository);

    await manage.upsertRecord({
      classId: 'class-A',
      date: '2026-07-14',
      period: 1,
      students: [{ number: 1, status: 'absent' }],
    });

    // 그룹 키를 주입해 새 레코드를 추가하면 레거시와 이중화된다 — 제자리 교체여야 한다.
    expect(repo.data?.records).toHaveLength(1);
    expect(repo.data?.records[0]?.groupId).toBeUndefined();
    expect(repo.data?.records[0]?.students[0]?.status).toBe('absent');
  });

  it('저장 intent는 읽기 실패 시 아무것도 쓰지 않는다 (QA2 H3 fail-closed)', async () => {
    const repo = new FakeAttendanceRepo();
    repo.data = { records: [groupRecordOwnedByA] };
    let saveCalls = 0;
    repo.getAttendance = async () => {
      throw new Error('일시적 읽기 실패');
    };
    const origSave = repo.saveAttendance.bind(repo);
    repo.saveAttendance = async (data) => {
      saveCalls += 1;
      return origSave(data);
    };
    const manage = new ManageAttendance(repo as unknown as ITeachingClassRepository);

    await expect(
      manage.upsertRecord({
        classId: 'class-A',
        date: '2026-07-14',
        period: 1,
        students: [{ number: 1, status: 'present' }],
      }),
    ).rejects.toThrow('일시적 읽기 실패');

    // 읽기를 못 했으면 쓰기 0회 — "빈 파일"로 오인한 부분 덮어쓰기가 없어야 한다.
    expect(saveCalls).toBe(0);
    expect(repo.data?.records).toHaveLength(1);
  });
});
