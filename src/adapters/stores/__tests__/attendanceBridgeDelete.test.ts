/**
 * 출결 이중 장부 — 브리지 기록 삭제가 원본 출결부까지 반영되는지 회귀 가드.
 *
 * 핸드오프: `docs/01-plan/features/attendance-dual-ledger-delete.handoff.md` §5-1
 *
 * 담임 출결은 두 장부에 이중 기록된다.
 *   ① 원본 출결부 `attendance` (AttendanceRecord)
 *   ② 기록 사본 `student-records` 의 `att-<studentId>-<date>` (StudentRecord)
 * 기록 **수정**은 양방향(`updateAttendanceRecord` → `upsertStudentAttendanceEntries`)인데
 * **삭제**는 사본만 지워서 원본이 남았다 → "지웠는데 여전히 살아 있다"(피드백 #147 B-4).
 *
 * 이 파일은 **데이터를 지우는 코드**의 가드다. 오삭제(2·3·4)를 최우선으로 잠근다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { AttendanceRecord, StudentAttendance } from '@domain/entities/Attendance';
import type { Student } from '@domain/entities/Student';

/* ── 인메모리 repo fake ─────────────────────────────────────────────── */
const { recordsFake, teachingFake, rosterFake, shared } = vi.hoisted(() => {
  const records: StudentRecord[] = [];
  const shared = {
    attendance: [] as AttendanceRecord[],
    classes: [] as { id: string; groupId?: string }[],
    students: [] as Student[],
    failGetAttendance: false,
    failSaveAttendance: false,
  };
  return {
    shared,
    recordsFake: {
      records,
      async getRecords() {
        return { records: records.map((r) => ({ ...r })), categories: [] };
      },
      async saveRecords(data: { records: StudentRecord[] }) {
        records.splice(0, records.length, ...data.records.map((r) => ({ ...r })));
      },
      async getCategories() {
        return [];
      },
      async saveCategories() {},
      async getAll() {
        return records.map((r) => ({ ...r }));
      },
    },
    teachingFake: {
      async getAttendance() {
        if (shared.failGetAttendance) throw new Error('출결부 읽기 실패(테스트)');
        return { records: shared.attendance.map((r) => ({ ...r, students: [...r.students] })) };
      },
      async saveAttendance(data: { records: AttendanceRecord[] }) {
        if (shared.failSaveAttendance) throw new Error('출결부 쓰기 실패(테스트)');
        shared.attendance = data.records.map((r) => ({ ...r, students: [...r.students] }));
      },
      async getClasses() {
        return { classes: shared.classes.map((c) => ({ ...c })) };
      },
      async saveClasses() {},
      async getProgress() {
        return null;
      },
      async saveProgress() {},
    },
    rosterFake: {
      async getStudents() {
        return shared.students.map((s) => ({ ...s }));
      },
      async saveStudents() {},
    },
  };
});

vi.mock('@adapters/di/container', () => ({
  studentRecordsRepository: recordsFake,
  teachingClassRepository: teachingFake,
  studentRepository: rosterFake,
  settingsRepository: {
    async getSettings() {
      return null;
    },
    async saveSettings() {},
  },
  observationAttachmentRepository: {
    async getAll() {
      return [];
    },
    async add() {},
    async delete() {},
    async deleteByObservationId() {},
    async listBinaryKeys() {
      return [];
    },
  },
}));

vi.mock('@adapters/stores/useObservationAttachmentStore', () => ({
  useObservationAttachmentStore: {
    getState: () => ({ deleteByObservationId: vi.fn().mockResolvedValue(undefined) }),
  },
}));

import { useStudentRecordsStore } from '../useStudentRecordsStore';
import { useTeachingClassStore } from '../useTeachingClassStore';
import { useSettingsStore } from '../useSettingsStore';

/* ── 픽스처 ─────────────────────────────────────────────────────────── */
const DATE = '2026-07-22';
const OTHER_DATE = '2026-07-21';
/** 담임 출결의 classId 는 UUID 가 아니라 학급 이름 문자열(settings.className) */
const CLASS_NAME = '3-5';

const ROSTER: Student[] = [
  { id: 'stu-A', name: '김정민', studentNumber: 1 },
  { id: 'stu-B', name: '이서연', studentNumber: 2 },
  { id: 'stu-C', name: '박지훈', studentNumber: 3 },
];

function sa(number: number, status: StudentAttendance['status'] = 'absent'): StudentAttendance {
  return { number, status, ...(status === 'present' ? {} : { reason: '질병' as const }) };
}

function dayRecord(
  students: StudentAttendance[],
  overrides: Partial<AttendanceRecord> = {},
): AttendanceRecord {
  return { classId: CLASS_NAME, date: DATE, period: 0, students, ...overrides };
}

function bridgeRecord(studentId: string, date = DATE): StudentRecord {
  return {
    id: `att-${studentId}-${date}`,
    studentId,
    category: 'attendance',
    subcategory: '결석 (질병)',
    content: '',
    date,
    createdAt: '2026-07-22T00:00:00.000Z',
  };
}

/** 원본 출결부에서 (date, number) 엔트리를 가진 레코드들 */
function ledgerEntries(number: number, date = DATE): AttendanceRecord[] {
  return shared.attendance.filter(
    (r) => r.date === date && r.students.some((s) => s.number === number),
  );
}

function copyIds(): string[] {
  return useStudentRecordsStore
    .getState()
    .records.map((r) => r.id)
    .sort();
}

beforeEach(() => {
  recordsFake.records.splice(0);
  shared.attendance = [];
  shared.classes = [];
  shared.students = [...ROSTER];
  shared.failGetAttendance = false;
  shared.failSaveAttendance = false;

  useStudentRecordsStore.setState({ records: [], categories: [], loaded: true });
  useTeachingClassStore.setState({
    classes: [],
    attendanceRecords: [],
    loaded: true,
    loadFailed: false,
  });
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, className: CLASS_NAME },
    loaded: true,
  }));
});

/** 사본 1건 + 원본 하루치를 함께 심는다 */
async function seed(records: StudentRecord[], attendance: AttendanceRecord[]) {
  recordsFake.records.splice(0, recordsFake.records.length, ...records);
  shared.attendance = attendance.map((r) => ({ ...r, students: [...r.students] }));
  useStudentRecordsStore.setState({ records: [...records] });
}

describe('출결 브리지 기록 삭제 → 원본 출결부 반영', () => {
  it('① 사본을 지우면 원본 출결부에서도 그 학생 엔트리가 사라진다', async () => {
    await seed(
      [bridgeRecord('stu-B')],
      [dayRecord([sa(1, 'present'), sa(2, 'absent'), sa(3, 'late')])],
    );
    expect(ledgerEntries(2)).toHaveLength(1);

    await useStudentRecordsStore.getState().deleteRecord(`att-stu-B-${DATE}`);

    expect(ledgerEntries(2)).toHaveLength(0);
    expect(copyIds()).toEqual([]);
  });

  it('② 같은 날 다른 학생의 출결은 그대로 보존된다 (오삭제 방지 — 가장 중요)', async () => {
    await seed(
      [bridgeRecord('stu-B')],
      [dayRecord([sa(1, 'present'), sa(2, 'absent'), sa(3, 'late')])],
    );

    await useStudentRecordsStore.getState().deleteRecord(`att-stu-B-${DATE}`);

    const day = shared.attendance.filter((r) => r.date === DATE);
    expect(day).toHaveLength(1);
    const numbers = day[0]!.students.map((s) => s.number).sort();
    expect(numbers).toEqual([1, 3]);
    // 남은 학생의 상태·사유가 훼손되지 않았다
    expect(day[0]!.students.find((s) => s.number === 3)).toMatchObject({
      status: 'late',
      reason: '질병',
    });
  });

  it('③ 같은 학생의 다른 날짜 출결은 영향받지 않는다', async () => {
    await seed(
      [bridgeRecord('stu-B'), bridgeRecord('stu-B', OTHER_DATE)],
      [
        dayRecord([sa(1, 'present'), sa(2, 'absent')]),
        dayRecord([sa(2, 'late')], { date: OTHER_DATE }),
      ],
    );

    await useStudentRecordsStore.getState().deleteRecord(`att-stu-B-${DATE}`);

    expect(ledgerEntries(2, DATE)).toHaveLength(0);
    expect(ledgerEntries(2, OTHER_DATE)).toHaveLength(1);
    expect(copyIds()).toEqual([`att-stu-B-${OTHER_DATE}`]);
  });

  it('④ 그룹 학급 — 다른 과목 명의 공유 레코드가 오삭제되지 않고, 다른 그룹은 무접촉', async () => {
    // 담임 '3-5'가 그룹 g1 소속(초등). 공유 레코드는 다른 과목(sci-uuid) 명의로 저장돼 있다.
    shared.classes = [{ id: CLASS_NAME, groupId: 'g1' }];
    useTeachingClassStore.setState({ classes: [{ id: CLASS_NAME, groupId: 'g1' }] as never });
    await seed(
      [bridgeRecord('stu-B')],
      [
        dayRecord([sa(2, 'absent'), sa(3, 'late')], { classId: 'sci-uuid', groupId: 'g1' }),
        dayRecord([sa(2, 'absent'), sa(1, 'late')], { classId: 'eng-uuid', groupId: 'g2' }),
      ],
    );

    await useStudentRecordsStore.getState().deleteRecord(`att-stu-B-${DATE}`);

    const g1 = shared.attendance.filter((r) => r.groupId === 'g1');
    const g2 = shared.attendance.filter((r) => r.groupId === 'g2');
    // g1 공유 레코드: 대상 학생만 빠지고 나머지 학생·그룹 키는 보존
    expect(g1).toHaveLength(1);
    expect(g1[0]!.students.map((s) => s.number)).toEqual([3]);
    expect(g1[0]!.groupId).toBe('g1');
    // g2(다른 그룹)는 통째로 무접촉 — 2번 학생 엔트리도 그대로 남아야 한다
    expect(g2).toHaveLength(1);
    expect(g2[0]!.students.map((s) => s.number).sort()).toEqual([1, 2]);
  });

  it('⑤ 비출결 기록(상담 등) 삭제는 원본 출결부를 건드리지 않는다 (회귀 0)', async () => {
    const counseling: StudentRecord = {
      id: 'uuid-counseling-1',
      studentId: 'stu-B',
      category: '상담',
      subcategory: '학부모 상담',
      content: '진로 상담',
      date: DATE,
      createdAt: '2026-07-22T00:00:00.000Z',
    };
    await seed([counseling], [dayRecord([sa(1, 'present'), sa(2, 'absent')])]);
    const before = JSON.stringify(shared.attendance);

    await useStudentRecordsStore.getState().deleteRecord('uuid-counseling-1');

    expect(JSON.stringify(shared.attendance)).toBe(before);
    expect(copyIds()).toEqual([]);
  });

  it('⑦ 삭제 후 출결 그리드가 그 날을 다시 저장해도 사본이 부활하지 않는다', async () => {
    await seed(
      [bridgeRecord('stu-B')],
      [dayRecord([sa(1, 'present'), sa(2, 'absent'), sa(3, 'late')])],
    );
    await useStudentRecordsStore.getState().deleteRecord(`att-stu-B-${DATE}`);

    // 그리드 재저장 = 원본 출결부 현재 상태로 브리지 재실행
    const byPeriod = new Map<number, readonly StudentAttendance[]>(
      shared.attendance.filter((r) => r.date === DATE).map((r) => [r.period, r.students]),
    );
    await useStudentRecordsStore.getState().bridgeHomeroomDayAttendance({
      className: CLASS_NAME,
      date: DATE,
      recordsByPeriod: byPeriod,
      students: ROSTER,
    });

    // 2번(stu-B) 사본은 부활하지 않고, 3번(지각)만 브리지된다
    expect(copyIds()).toEqual([`att-stu-C-${DATE}`]);
  });
});

describe('삭제 실패 시 정책 — 두 장부가 어긋나지 않게 사본을 남긴다(fail-closed)', () => {
  it('원본 출결부 쓰기가 실패하면 사본을 지우지 않고 오류를 전파한다', async () => {
    await seed([bridgeRecord('stu-B')], [dayRecord([sa(1, 'present'), sa(2, 'absent')])]);
    shared.failSaveAttendance = true;

    await expect(
      useStudentRecordsStore.getState().deleteRecord(`att-stu-B-${DATE}`),
    ).rejects.toThrow();

    // 사본은 화면·디스크 양쪽에 그대로 — 사용자가 재시도하면 두 장부가 함께 정리된다
    expect(copyIds()).toEqual([`att-stu-B-${DATE}`]);
    expect(recordsFake.records.map((r) => r.id)).toEqual([`att-stu-B-${DATE}`]);
  });

  it('원본 출결부 읽기가 실패해도 사본을 지우지 않는다 (빈 데이터 덮어쓰기 차단)', async () => {
    await seed([bridgeRecord('stu-B')], [dayRecord([sa(2, 'absent')])]);
    shared.failGetAttendance = true;

    await expect(
      useStudentRecordsStore.getState().deleteRecord(`att-stu-B-${DATE}`),
    ).rejects.toThrow();

    expect(copyIds()).toEqual([`att-stu-B-${DATE}`]);
    shared.failGetAttendance = false;
    expect(ledgerEntries(2)).toHaveLength(1);
  });

  it('원본 출결부 스토어가 로드 실패 상태면 저장이 차단되므로 사본도 지우지 않는다', async () => {
    await seed([bridgeRecord('stu-B')], [dayRecord([sa(2, 'absent')])]);
    // ensureWritable()이 false → upsert가 조용히 no-op 하던 경로
    useTeachingClassStore.setState({ loaded: true, loadFailed: true });

    await expect(
      useStudentRecordsStore.getState().deleteRecord(`att-stu-B-${DATE}`),
    ).rejects.toThrow();

    expect(copyIds()).toEqual([`att-stu-B-${DATE}`]);
    expect(ledgerEntries(2)).toHaveLength(1);
  });

  it('명렬표에서 학생을 찾을 수 없으면(번호 미상) 사본 삭제는 기존대로 동작한다', async () => {
    // 학생이 명렬표에서 빠진 경우 — 원본의 어떤 번호인지 특정할 수 없다.
    // 여기서 삭제를 막으면 사용자가 기록을 영영 못 지운다 → 기존 동작(사본만 삭제) 유지.
    shared.students = [];
    await seed([bridgeRecord('stu-B')], [dayRecord([sa(2, 'absent')])]);

    await useStudentRecordsStore.getState().deleteRecord(`att-stu-B-${DATE}`);

    expect(copyIds()).toEqual([]);
    expect(ledgerEntries(2)).toHaveLength(1); // 원본은 그대로(특정 불가)
  });
});
