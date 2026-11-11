/**
 * 출결 공용 부분 저장(`ManageAttendance.upsertStudentEntries`)을 쓰는 남은 세 곳 — 한 교시만
 * 고쳤을 때 **같은 날 다른 교시**·**다른 학생** 기록이 남는가 (2026-11-11 확인)
 *
 * 공용 함수는 대상 번호를 그날 **전 교시**에서 지운 뒤 넘긴 교시만 다시 넣는다. 그래서 호출부가
 * 그 학생의 **하루 전체**를 넘기면 맞고, 한 교시만 넘기면 다른 교시가 사라진다
 * (쌤핀 AI 출결이 이것으로 고쳐졌다 — e429882e, ADR-147 추가 절).
 *
 *  ① 기록 탭 삭제(`deleteRecord` → `clearAttendanceLedgerEntry`) — 사본 한 장 = 그 학생의 하루.
 *     지우면 하루가 지워지는 것이 의도다.
 *  ② 기록 탭 수정(`updateAttendanceRecord`) — 편집기는 사본의 교시 목록 **전체**를 들고 와서
 *     전체를 넘긴다(`initEditAttendancePeriods`). 하루 통째 교체가 의도다.
 *  ③ AI 연결 담임 출결(`set_homeroom_attendance`) — `periods` 는 "특정 교시만"이라고 약속한다.
 *     3교시만 보냈는데 1교시가 지워지면 결함이다. `allDay` 는 하루를 바꾸는 것이 의도다.
 *
 * ★목은 저장소 어댑터(파일 읽기·쓰기)까지만 둔다. 스토어·유스케이스·공통 규칙·AI 연결 적용
 *   (`applyLiveSyncWrite` + 실제 배선 `buildLiveSyncDeps`)은 전부 진짜를 지난다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AttendanceRecord, StudentAttendance } from '@domain/entities/Attendance';
import type { Student } from '@domain/entities/Student';
import type { StudentRecord } from '@domain/entities/StudentRecord';

/* ── 인메모리 저장소(파일 자리) ─────────────────────────────────────── */
const { recordsFake, teachingFake, rosterFake, shared } = vi.hoisted(() => {
  const records: StudentRecord[] = [];
  const shared = {
    attendance: [] as AttendanceRecord[],
    students: [] as Student[],
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
        return { records: shared.attendance.map((r) => ({ ...r, students: [...r.students] })) };
      },
      async saveAttendance(data: { records: AttendanceRecord[] }) {
        shared.attendance = data.records.map((r) => ({ ...r, students: [...r.students] }));
      },
      async getClasses() {
        return { classes: [] };
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

vi.mock('@adapters/di/container', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@adapters/di/container')>();
  return {
    ...actual,
    studentRecordsRepository: recordsFake,
    teachingClassRepository: teachingFake,
    studentRepository: rosterFake,
    settingsRepository: {
      async getSettings() {
        return null;
      },
      async saveSettings() {},
    },
  };
});

vi.mock('@adapters/stores/useObservationAttachmentStore', () => ({
  useObservationAttachmentStore: {
    getState: () => ({ deleteByObservationId: vi.fn().mockResolvedValue(undefined) }),
  },
}));

import { useStudentRecordsStore } from '../useStudentRecordsStore';
import { useTeachingClassStore } from '../useTeachingClassStore';
import { useSettingsStore } from '../useSettingsStore';
import { useStudentStore } from '../useStudentStore';
import { initEditAttendancePeriods } from '@adapters/components/Homeroom/Records/recordUtils';
import { buildLiveSyncDeps } from '@adapters/hooks/useAiBridgeLiveSync';
import { applyLiveSyncWrite } from '@usecases/aiBridge/applyLiveSyncWrite';

/* ── 픽스처 ─────────────────────────────────────────────────────────── */
const DATE = '2026-08-25';
/** 담임 출결의 classId 는 학급 이름 문자열(settings.className) */
const HOMEROOM = '3-2';
const STUDENTS: Student[] = [
  { id: 'stu-1', name: '김지훈', studentNumber: 1 },
  { id: 'stu-15', name: '박서연', studentNumber: 15 },
];
const 지훈 = STUDENTS[0]!;
const 서연 = STUDENTS[1]!;

/** 저장된 파일에서 그날 (교시)의 출결 항목 */
function ledger(period: number): readonly StudentAttendance[] {
  return (
    shared.attendance.find((r) => r.classId === HOMEROOM && r.date === DATE && r.period === period)
      ?.students ?? []
  );
}

const byNumber = (list: readonly StudentAttendance[]) =>
  [...list].sort((a, b) => a.number - b.number);

function copyOf(student: Student): StudentRecord | undefined {
  return useStudentRecordsStore
    .getState()
    .records.find((r) => r.id === `att-${student.id}-${DATE}`);
}

/**
 * 출결 탭(그리드)·기록 입력 화면이 하루를 저장하는 길 그대로 — 출결부를 하루 통째로 쓰고
 * 학생 기록 사본을 만든다(StudentRecordsEditor.writeAttendanceDay).
 */
async function writeDay(byPeriod: ReadonlyMap<number, StudentAttendance[]>): Promise<void> {
  await useTeachingClassStore.getState().saveDayAttendance(HOMEROOM, DATE, byPeriod);
  await useStudentRecordsStore.getState().bridgeHomeroomDayAttendance({
    className: HOMEROOM,
    date: DATE,
    recordsByPeriod: byPeriod,
    students: STUDENTS,
  });
}

/** 서연 1교시 결석(질병)·3교시 조퇴, 지훈 1교시 결석 — 하루치 */
async function seedDay(): Promise<void> {
  await writeDay(
    new Map([
      [
        1,
        [
          { number: 1, status: 'absent', reason: '질병' },
          { number: 15, status: 'absent', reason: '질병' },
        ],
      ],
      [3, [{ number: 15, status: 'earlyLeave', reason: '질병' }]],
    ]),
  );
}

let seq = 0;
function homeroomWrite(students: readonly Record<string, unknown>[]) {
  seq += 1;
  return applyLiveSyncWrite(
    {
      domain: 'homeroomAttendance',
      op: 'create',
      idempotencyKey: `hr-${seq}`,
      data: { date: DATE, students },
    },
    buildLiveSyncDeps(),
  );
}

beforeEach(() => {
  recordsFake.records.splice(0);
  shared.attendance = [];
  shared.students = [...STUDENTS];
  useStudentRecordsStore.setState({ records: [], categories: [], loaded: true });
  useTeachingClassStore.setState({
    classes: [],
    attendanceRecords: [],
    loaded: true,
    loadFailed: false,
  });
  useStudentStore.setState({ students: [...STUDENTS], loaded: true });
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, className: HOMEROOM, maxPeriods: 7 },
    loaded: true,
  }));
});

describe('① 기록 탭 삭제 — 사본 한 장은 그 학생의 하루다(의도)', () => {
  it('서연의 출결 사본을 지우면 서연의 그날 전 교시가 지워지고 지훈은 그대로다', async () => {
    await seedDay();
    expect(copyOf(서연)?.attendancePeriods?.map((p) => p.period)).toEqual([1, 3]);

    await useStudentRecordsStore.getState().deleteRecord(`att-${서연.id}-${DATE}`);

    expect(ledger(1)).toEqual([{ number: 1, status: 'absent', reason: '질병' }]);
    expect(ledger(3)).toEqual([]);
    expect(copyOf(서연)).toBeUndefined();
    expect(copyOf(지훈)).toBeDefined();
  });
});

describe('② 기록 탭 수정 — 편집기는 그 학생의 하루 전체를 넘긴다(의도)', () => {
  /** 편집 화면과 같은 순서: 사본에서 교시 목록을 꺼내(initEditAttendancePeriods) 고쳐 저장 */
  async function editCopy(
    edit: (
      periods: ReturnType<typeof initEditAttendancePeriods>,
    ) => ReturnType<typeof initEditAttendancePeriods>,
  ): Promise<void> {
    const record = copyOf(서연)!;
    await useStudentRecordsStore.getState().updateAttendanceRecord({
      record,
      nextPeriods: edit(initEditAttendancePeriods(record)),
      content: record.content,
      classId: HOMEROOM,
      date: DATE,
      studentNumber: 15,
      regularPeriodCount: 7,
    });
  }

  it('3교시 칸 하나만 지각으로 바꿔도 1교시 결석과 다른 학생이 그대로다', async () => {
    await seedDay();

    await editCopy((periods) =>
      periods.map((p) => (p.period === 3 ? { period: 3, status: 'late', reason: '질병' } : p)),
    );

    expect(byNumber(ledger(1))).toEqual([
      { number: 1, status: 'absent', reason: '질병' },
      { number: 15, status: 'absent', reason: '질병' },
    ]);
    expect(ledger(3)).toEqual([{ number: 15, status: 'late', reason: '질병' }]);
  });

  it('3교시 줄을 빼면 3교시만 지워지고 1교시는 남는다', async () => {
    await seedDay();

    await editCopy((periods) => periods.filter((p) => p.period !== 3));

    expect(byNumber(ledger(1))).toEqual([
      { number: 1, status: 'absent', reason: '질병' },
      { number: 15, status: 'absent', reason: '질병' },
    ]);
    expect(ledger(3)).toEqual([]);
  });
});

describe('③ AI 연결 담임 출결 — periods 는 그 교시만, allDay 는 하루 전체', () => {
  it('★periods 로 5교시 지각만 보내도 서연의 1교시 결석·3교시 조퇴와 지훈이 그대로다', async () => {
    await seedDay();

    const result = await homeroomWrite([
      { number: 15, periods: [{ period: 5, status: 'late', reason: '미인정' }] },
    ]);

    expect(result.ok).toBe(true);
    expect(byNumber(ledger(1))).toEqual([
      { number: 1, status: 'absent', reason: '질병' },
      { number: 15, status: 'absent', reason: '질병' },
    ]);
    expect(ledger(3)).toEqual([{ number: 15, status: 'earlyLeave', reason: '질병' }]);
    expect(ledger(5)).toEqual([{ number: 15, status: 'late', reason: '미인정' }]);
  });

  it('★periods 로 쓴 뒤에도 학생 기록 사본에 다른 교시가 남는다', async () => {
    await seedDay();

    await homeroomWrite([
      { number: 15, periods: [{ period: 5, status: 'late', reason: '미인정' }] },
    ]);

    expect(copyOf(서연)?.attendancePeriods).toEqual([
      { period: 1, status: 'absent', reason: '질병' },
      { period: 3, status: 'earlyLeave', reason: '질병' },
      { period: 5, status: 'late', reason: '미인정' },
    ]);
    // 대표 분류는 하루 전체에서 다시 고른다 — 결석이 지각보다 앞선다
    expect(copyOf(서연)?.subcategory).toBe('결석 (질병)');
    expect(copyOf(지훈)?.attendancePeriods).toEqual([
      { period: 1, status: 'absent', reason: '질병' },
    ]);
  });

  it('같은 교시를 다시 보내면 그 칸만 바뀌고 두 줄이 되지 않는다', async () => {
    await seedDay();

    await homeroomWrite([{ number: 15, periods: [{ period: 3, status: 'late', reason: '질병' }] }]);

    expect(ledger(3)).toEqual([{ number: 15, status: 'late', reason: '질병' }]);
    expect(byNumber(ledger(1))).toHaveLength(2);
  });

  it('allDay 는 서연의 하루를 통째로 바꾼다(의미 유지) — 지훈은 그대로다', async () => {
    await seedDay();

    await homeroomWrite([
      { number: 15, allDay: { status: 'absent', reason: '인정', memo: '체험' } },
    ]);

    const all: StudentAttendance = { number: 15, status: 'absent', reason: '인정', memo: '체험' };
    expect(byNumber(ledger(1))).toEqual([{ number: 1, status: 'absent', reason: '질병' }, all]);
    expect(ledger(3)).toEqual([all]);
    expect(ledger(0)).toEqual([all]);
    expect(ledger(9)).toEqual([all]);
    expect(copyOf(서연)?.attendancePeriods?.every((p) => p.reason === '인정')).toBe(true);
  });

  it('한 요청에 allDay 학생과 periods 학생이 섞여도 각자 뜻대로 저장된다', async () => {
    await seedDay();

    await homeroomWrite([
      { number: 1, periods: [{ period: 2, status: 'late' }] },
      { number: 15, allDay: { status: 'late' } },
    ]);

    // 지훈(periods): 1교시 결석이 남고 2교시 지각이 더해진다
    expect(ledger(1)).toContainEqual({ number: 1, status: 'absent', reason: '질병' });
    expect(ledger(2)).toContainEqual({ number: 1, status: 'late' });
    // 서연(allDay): 하루가 지각으로 바뀌어 1교시 결석·3교시 조퇴가 없다
    expect(ledger(1)).toContainEqual({ number: 15, status: 'late' });
    expect(ledger(3)).toEqual([{ number: 15, status: 'late' }]);
  });
});
