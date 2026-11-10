/**
 * 쌤핀 AI 출결 — **한 교시만 적으면 그 교시의 그 학생 칸만 바뀐다** (2026-11-11 확인)
 *
 * 도구 설명과 제안 조립기는 "교시를 밝히면 그 교시만"이라고 약속한다(writeStudent.ts).
 * 그런데 실행기가 부르던 부분 저장(`upsertStudentEntries`)은 대상 **번호**를 그날 **전 교시**
 * 에서 지운 뒤 넘긴 교시만 다시 넣는다. 그래서 3교시 지각 하나를 적으면
 *   - 그 학생의 1교시 결석이 사라지고,
 *   - 번호가 겹치는 수업반에서는 같은 번호 **다른 학생**의 다른 교시 기록도 사라졌다.
 *
 * ★목은 저장소 어댑터(파일 읽기·쓰기)까지만 둔다. 제안 조립(buildWriteProposal) →
 *   실행기(executeAssistWrite) → 스토어(useTeachingClassStore) → 유스케이스(ManageAttendance)
 *   → 공통 규칙(attendanceStudentMatch)은 전부 진짜를 지난다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isWriteProposal, type AssistWriteProposal } from '@domain/entities/AssistWrite';
import type { AttendanceRecord, StudentAttendance } from '@domain/entities/Attendance';
import type { Student } from '@domain/entities/Student';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import { buildWriteProposal } from '@usecases/assist/writes/buildWriteProposal';
import type { WriteSources } from '@usecases/assist/writes/writeSources';

/* ── 인메모리 저장소(파일 자리) ─────────────────────────────────────── */
const { recordsFake, teachingFake, rosterFake, shared } = vi.hoisted(() => {
  const records: StudentRecord[] = [];
  const shared = {
    attendance: [] as AttendanceRecord[],
    classes: [] as TeachingClass[],
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

import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { executeAssistWrite, type WriteDeps } from '../executeAssistWrite';

/* ── 픽스처 ─────────────────────────────────────────────────────────── */
const DATE = '2026-08-25';
const HOMEROOM = '3-2';
const HOMEROOM_STUDENTS: Student[] = [
  { id: 'stu-1', name: '김지훈', studentNumber: 1 },
  { id: 'stu-15', name: '박서연', studentNumber: 15 },
];

/** 여러 학급에서 모인 수업반 — 7번이 둘(2-3-7, 2-4-7), 5번도 둘이다 */
const MIXED: TeachingClass = {
  id: 'tc-mixed',
  name: '2학년 국어 A',
  subject: '국어',
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
  students: [
    { number: 7, name: '가람', grade: 2, classNum: 3 },
    { number: 7, name: '나은', grade: 2, classNum: 4 },
    { number: 5, name: '다온', grade: 2, classNum: 3 },
    { number: 5, name: '라희', grade: 2, classNum: 4 },
  ],
};

const SRC: WriteSources = {
  today: DATE,
  periodTimes: [],
  roster: {
    homeroomClassId: HOMEROOM,
    regularPeriodCount: 7,
    homeroom: HOMEROOM_STUDENTS,
    teaching: [
      {
        classId: MIXED.id,
        className: MIXED.name,
        students: MIXED.students.map((s) => ({
          number: s.number,
          name: s.name,
          grade: s.grade,
          classNum: s.classNum,
          key: `${s.grade}-${s.classNum}-${s.number}`,
        })),
      },
    ],
  },
  todos: [],
  events: [],
  memos: [],
  progress: [],
  classes: [{ id: MIXED.id, name: MIXED.name }],
  bookmarks: [],
  bookmarkGroups: [],
  notebooks: [],
  noteSections: [],
  notePages: [],
  attendance: [],
  rubrics: [],
};

function propose(args: object): AssistWriteProposal {
  const outcome = buildWriteProposal('set_attendance', JSON.stringify(args), SRC);
  if (!isWriteProposal(outcome)) throw new Error(`제안이 아니다: ${outcome.reason}`);
  return outcome;
}

/** 쌤핀 AI 패널의 출결 배선(AssistDockContainer.writeDeps)과 같은 스토어 함수를 부른다 */
function realDeps(): WriteDeps {
  return {
    upsertStudentAttendance: (params: Parameters<WriteDeps['upsertStudentAttendance']>[0]) =>
      useTeachingClassStore.getState().upsertStudentAttendanceEntries(params),
    mergeStudentAttendance: async (record: AttendanceRecord) => {
      const ok = await useTeachingClassStore.getState().mergeAttendanceRecordStudents(record);
      return ok ? useTeachingClassStore.getState().attendanceRecords : null;
    },
    getDayAttendanceRecords: (classId: string, date: string) =>
      useTeachingClassStore.getState().getDayAttendance(classId, date),
    bridgeHomeroomAttendance: (params: Parameters<WriteDeps['bridgeHomeroomAttendance']>[0]) =>
      useStudentRecordsStore.getState().bridgeHomeroomDayAttendance(params),
    homeroomStudents: () => HOMEROOM_STUDENTS,
  } as unknown as WriteDeps;
}

/** 저장소(파일)와 스토어(앱이 읽어 둔 상태)에 같은 출결을 심는다 */
function seed(records: AttendanceRecord[]): void {
  shared.attendance = records.map((r) => ({ ...r, students: [...r.students] }));
  useTeachingClassStore.setState({ attendanceRecords: records.map((r) => ({ ...r })) });
}

/** 저장된 파일에서 (반, 교시)의 출결 항목 */
function saved(classId: string, period: number): readonly StudentAttendance[] {
  return (
    shared.attendance.find((r) => r.classId === classId && r.date === DATE && r.period === period)
      ?.students ?? []
  );
}

const sorted = (list: readonly StudentAttendance[]) =>
  [...list].sort(
    (a, b) =>
      a.number - b.number ||
      (a.grade ?? 0) - (b.grade ?? 0) ||
      (a.classNum ?? 0) - (b.classNum ?? 0),
  );

beforeEach(() => {
  recordsFake.records.splice(0);
  shared.classes = [MIXED];
  shared.students = [...HOMEROOM_STUDENTS];
  seed([]);
  useStudentRecordsStore.setState({ records: [], categories: [], loaded: true });
  useTeachingClassStore.setState({ classes: [MIXED], loaded: true, loadFailed: false });
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, className: HOMEROOM },
    loaded: true,
  }));
});

describe('(a) 수업반 — 3교시만 적으면 그 학생의 1교시 기록이 남는다', () => {
  it('1교시 결석이 있는 2-3-7 에게 3교시 지각을 적어도 1교시 결석이 그대로다', async () => {
    seed([
      {
        classId: MIXED.id,
        date: DATE,
        period: 1,
        students: [{ number: 7, grade: 2, classNum: 3, status: 'absent', reason: '질병' }],
      },
    ]);

    const result = await executeAssistWrite(
      propose({ student: '가람', status: '지각', className: MIXED.name, period: 3 }),
      realDeps(),
    );

    expect(result.ok).toBe(true);
    expect(saved(MIXED.id, 1)).toEqual([
      { number: 7, grade: 2, classNum: 3, status: 'absent', reason: '질병' },
    ]);
    expect(saved(MIXED.id, 3)).toEqual([{ number: 7, grade: 2, classNum: 3, status: 'late' }]);
  });
});

describe('(b) 번호가 겹치는 수업반 — 같은 번호 다른 학생의 기록이 남는다', () => {
  it('2-3-7 의 3교시만 적어도 2-4-7 의 1교시·3교시 기록이 그대로다', async () => {
    const 나은1: StudentAttendance = { number: 7, grade: 2, classNum: 4, status: 'absent' };
    const 나은3: StudentAttendance = { number: 7, grade: 2, classNum: 4, status: 'earlyLeave' };
    seed([
      { classId: MIXED.id, date: DATE, period: 1, students: [나은1] },
      { classId: MIXED.id, date: DATE, period: 3, students: [나은3] },
    ]);

    await executeAssistWrite(
      propose({ student: '가람', status: '지각', className: MIXED.name, period: 3 }),
      realDeps(),
    );

    expect(saved(MIXED.id, 1)).toEqual([나은1]);
    expect(sorted(saved(MIXED.id, 3))).toEqual(
      sorted([나은3, { number: 7, grade: 2, classNum: 3, status: 'late' }]),
    );
  });

  it('같은 교시에 있던 그 학생의 옛 칸은 새 값으로 바뀌고 두 줄이 되지 않는다', async () => {
    const 가람옛것: StudentAttendance = { number: 7, grade: 2, classNum: 3, status: 'absent' };
    const 나은: StudentAttendance = { number: 7, grade: 2, classNum: 4, status: 'absent' };
    seed([{ classId: MIXED.id, date: DATE, period: 3, students: [가람옛것, 나은] }]);

    await executeAssistWrite(
      propose({ student: '가람', status: '지각', className: MIXED.name, period: 3 }),
      realDeps(),
    );

    expect(sorted(saved(MIXED.id, 3))).toEqual(
      sorted([나은, { number: 7, grade: 2, classNum: 3, status: 'late' }]),
    );
  });

  it('다른 교시에 같은 번호로 함께 있던 두 학생(2-3-5·2-4-5)이 둘 다 남는다', async () => {
    // 부분 저장이 다른 교시를 다시 쓰며 번호로 중복을 걸러, 둘 중 하나가 사라졌다.
    const 다온: StudentAttendance = { number: 5, grade: 2, classNum: 3, status: 'absent' };
    const 라희: StudentAttendance = { number: 5, grade: 2, classNum: 4, status: 'absent' };
    seed([{ classId: MIXED.id, date: DATE, period: 1, students: [다온, 라희] }]);

    await executeAssistWrite(
      propose({ student: '가람', status: '지각', className: MIXED.name, period: 3 }),
      realDeps(),
    );

    expect(sorted(saved(MIXED.id, 1))).toEqual(sorted([다온, 라희]));
  });
});

describe('(c) 담임 학급 — 교시를 밝히면 그 교시만 바뀐다', () => {
  it('1교시 결석이 있는 15번에게 3교시 지각을 적어도 1교시 결석과 다른 학생이 그대로다', async () => {
    seed([
      {
        classId: HOMEROOM,
        date: DATE,
        period: 1,
        students: [
          { number: 1, status: 'absent', reason: '질병' },
          { number: 15, status: 'absent', reason: '질병' },
        ],
      },
    ]);

    const result = await executeAssistWrite(
      propose({ student: '15번', status: '지각', period: 3 }),
      realDeps(),
    );

    expect(result.ok).toBe(true);
    expect(sorted(saved(HOMEROOM, 1))).toEqual([
      { number: 1, status: 'absent', reason: '질병' },
      { number: 15, status: 'absent', reason: '질병' },
    ]);
    expect(saved(HOMEROOM, 3)).toEqual([{ number: 15, status: 'late' }]);
  });

  it('같은 교시의 그 학생 칸은 새 값으로 바뀌고 두 줄이 되지 않는다', async () => {
    seed([
      {
        classId: HOMEROOM,
        date: DATE,
        period: 3,
        students: [
          { number: 1, status: 'late' },
          { number: 15, status: 'absent', reason: '질병' },
        ],
      },
    ]);

    await executeAssistWrite(propose({ student: '15번', status: '지각', period: 3 }), realDeps());

    expect(sorted(saved(HOMEROOM, 3))).toEqual([
      { number: 1, status: 'late' },
      { number: 15, status: 'late' },
    ]);
  });

  it('★교시를 안 밝힌 "하루 전체"는 그 학생의 하루를 통째로 바꾼다(의미 유지 — 오너 판단 대기)', async () => {
    // 지금 규칙: 담임 학급에서 교시 없이 적으면 그 학생의 그날 출결을 새 하루로 갈아 끼운다.
    // "지각"은 조회 칸만이라, 1교시 결석은 지워진다. 이 의미는 이번에 바꾸지 않았다.
    seed([
      {
        classId: HOMEROOM,
        date: DATE,
        period: 1,
        students: [
          { number: 1, status: 'absent' },
          { number: 15, status: 'absent' },
        ],
      },
    ]);

    await executeAssistWrite(propose({ student: '15번', status: '지각' }), realDeps());

    expect(saved(HOMEROOM, 1)).toEqual([{ number: 1, status: 'absent' }]);
    expect(saved(HOMEROOM, 0)).toEqual([{ number: 15, status: 'late' }]);
  });
});
