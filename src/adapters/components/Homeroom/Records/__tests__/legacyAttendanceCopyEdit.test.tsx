/**
 * @vitest-environment jsdom
 *
 * 교시 목록이 없는 옛 출결 사본을 기록 탭에서 고칠 때 — 출결부의 다른 교시가 지워지지 않는가
 * (2026-11-11 확인)
 *
 * 사본(`att-<학생>-<날짜>`)에 교시 목록(`attendancePeriods`)이 없는 경우가 있다. 모바일이
 * 출결부를 못 읽었을 때(학급·번호를 모름 — `migrateExistingAttendance` 는 학급을 넘기지 않는다)
 * 사본을 분류 글자만으로 만든다(`useMobileStudentRecordsStore.bridgeAttendanceRecord`).
 * 그 사본을 PC 기록 탭에서 열면 편집기가 분류 글자로 **1교시 한 줄**을 지어내고, 저장하면
 * 부분 저장이 그 학생을 그날 전 교시에서 지운 뒤 1교시만 넣었다 — 실제 조회(0교시)·3교시 기록이
 * 사라지고 없던 1교시가 생겼다.
 *
 * ★목은 저장소 어댑터(파일 읽기·쓰기)까지만 둔다. 편집 훅·스토어·유스케이스는 진짜를 지난다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import type { AttendanceRecord, StudentAttendance } from '@domain/entities/Attendance';
import type { Student } from '@domain/entities/Student';
import type { StudentRecord } from '@domain/entities/StudentRecord';

const { recordsFake, teachingFake, shared } = vi.hoisted(() => {
  const records: StudentRecord[] = [];
  const shared = { attendance: [] as AttendanceRecord[] };
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
  };
});

vi.mock('@adapters/di/container', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@adapters/di/container')>();
  return {
    ...actual,
    studentRecordsRepository: recordsFake,
    teachingClassRepository: teachingFake,
    settingsRepository: {
      async getSettings() {
        return null;
      },
      async saveSettings() {},
    },
  };
});

import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useRecordInlineEdit } from '../useRecordInlineEdit';
import { useToastStore } from '@adapters/components/common/Toast';

const DATE = '2026-08-25';
const HOMEROOM = '3-2';
const 지훈: Student = { id: 'stu-1', name: '김지훈', studentNumber: 1 };
const 서연: Student = { id: 'stu-15', name: '박서연', studentNumber: 15 };
const STUDENT_MAP = new Map([지훈, 서연].map((s) => [s.id, s]));

/** 모바일이 출결부를 못 읽고 만든 사본 — 분류 글자만 있고 교시 목록이 없다 */
const LEGACY_COPY: StudentRecord = {
  id: `att-${서연.id}-${DATE}`,
  studentId: 서연.id,
  category: 'attendance',
  subcategory: '결석 (질병)',
  content: '',
  date: DATE,
  createdAt: '2026-08-25T00:00:00.000Z',
};

function ledger(period: number): readonly StudentAttendance[] {
  return (
    shared.attendance.find((r) => r.classId === HOMEROOM && r.date === DATE && r.period === period)
      ?.students ?? []
  );
}

/** 출결부: 서연 조회(0) 결석·3교시 조퇴, 지훈 조회 결석 */
const DAY: AttendanceRecord[] = [
  {
    classId: HOMEROOM,
    date: DATE,
    period: 0,
    students: [
      { number: 1, status: 'absent', reason: '질병' },
      { number: 15, status: 'absent', reason: '질병' },
    ],
  },
  {
    classId: HOMEROOM,
    date: DATE,
    period: 3,
    students: [{ number: 15, status: 'earlyLeave', reason: '질병' }],
  },
];

function seed(attendance: AttendanceRecord[], { storeLoaded = true } = {}): void {
  shared.attendance = attendance.map((r) => ({ ...r, students: [...r.students] }));
  recordsFake.records.splice(0, recordsFake.records.length, { ...LEGACY_COPY });
  useStudentRecordsStore.setState({ records: [{ ...LEGACY_COPY }], categories: [], loaded: true });
  useTeachingClassStore.setState({
    classes: [],
    attendanceRecords: storeLoaded ? attendance.map((r) => ({ ...r })) : [],
    loaded: storeLoaded,
    loadFailed: false,
  });
}

beforeEach(() => {
  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, className: HOMEROOM, maxPeriods: 7 },
    loaded: true,
  }));
});

describe('교시 목록이 없는 옛 출결 사본 편집', () => {
  it('편집기는 출결부에 실제로 있는 그 학생의 그날 교시를 보여 준다', () => {
    seed(DAY);
    const { result } = renderHook(() => useRecordInlineEdit(STUDENT_MAP));

    act(() => result.current.handleEdit(LEGACY_COPY));

    expect(result.current.edit.editAttendancePeriods).toEqual([
      { period: 0, status: 'absent', reason: '질병' },
      { period: 3, status: 'earlyLeave', reason: '질병' },
    ]);
  });

  it('★메모만 고쳐 저장해도 조회·3교시 기록이 남고 없던 1교시가 생기지 않는다', async () => {
    seed(DAY);
    const { result } = renderHook(() => useRecordInlineEdit(STUDENT_MAP));

    act(() => result.current.handleEdit(LEGACY_COPY));
    act(() => result.current.edit.setEditContent('병원 진료'));
    await act(() => result.current.edit.onEditSave(LEGACY_COPY));

    expect(ledger(0)).toEqual([
      { number: 1, status: 'absent', reason: '질병' },
      { number: 15, status: 'absent', reason: '질병' },
    ]);
    expect(ledger(3)).toEqual([{ number: 15, status: 'earlyLeave', reason: '질병' }]);
    expect(ledger(1)).toEqual([]);
  });

  it('출결부를 아직 안 읽었어도 읽은 뒤 실제 교시로 채운다', async () => {
    seed(DAY, { storeLoaded: false });
    const { result } = renderHook(() => useRecordInlineEdit(STUDENT_MAP));

    act(() => result.current.handleEdit(LEGACY_COPY));

    await waitFor(() =>
      expect(result.current.edit.editAttendancePeriods).toEqual([
        { period: 0, status: 'absent', reason: '질병' },
        { period: 3, status: 'earlyLeave', reason: '질병' },
      ]),
    );
  });

  it('출결부에 그 학생 기록이 없으면 예전처럼 분류 글자로 1교시 한 줄을 만든다', () => {
    seed([DAY[0]!].map((r) => ({ ...r, students: r.students.filter((s) => s.number !== 15) })));
    const { result } = renderHook(() => useRecordInlineEdit(STUDENT_MAP));

    act(() => result.current.handleEdit(LEGACY_COPY));

    expect(result.current.edit.editAttendancePeriods).toEqual([
      { period: 1, status: 'absent', reason: '질병' },
    ]);
  });
});

describe('옛 사본 — 출결부를 늦게 읽을 때·되돌리기', () => {
  it('출결부를 읽기 전에 선생님이 고친 줄은 읽은 뒤에도 덮이지 않는다', async () => {
    seed(DAY, { storeLoaded: false });
    const { result } = renderHook(() => useRecordInlineEdit(STUDENT_MAP));
    const mine = [{ period: 5, status: 'late' as const }];

    act(() => {
      result.current.handleEdit(LEGACY_COPY);
      result.current.edit.setEditAttendancePeriods?.(mine);
    });
    await waitFor(() => expect(useTeachingClassStore.getState().loaded).toBe(true));
    await act(async () => {});

    expect(result.current.edit.editAttendancePeriods).toEqual(mine);
  });

  it('★출결부를 읽기 전에 저장해도 기다렸다가 실제 교시로 저장한다', async () => {
    seed(DAY, { storeLoaded: false });
    const { result } = renderHook(() => useRecordInlineEdit(STUDENT_MAP));

    act(() => result.current.handleEdit(LEGACY_COPY));
    act(() => result.current.edit.setEditContent('병원 진료'));
    await act(() => result.current.edit.onEditSave(LEGACY_COPY));

    expect(ledger(0)).toContainEqual({ number: 15, status: 'absent', reason: '질병' });
    expect(ledger(3)).toEqual([{ number: 15, status: 'earlyLeave', reason: '질병' }]);
    expect(ledger(1)).toEqual([]);
  });

  it('★저장 뒤 [되돌리기]를 누르면 메모가 돌아오고 출결부 교시는 그대로다', async () => {
    seed(DAY);
    useToastStore.setState({ toasts: [] });
    const { result } = renderHook(() => useRecordInlineEdit(STUDENT_MAP));

    act(() => result.current.handleEdit(LEGACY_COPY));
    act(() => result.current.edit.setEditContent('병원 진료'));
    await act(() => result.current.edit.onEditSave(LEGACY_COPY));
    const undo = useToastStore.getState().toasts.find((t) => t.action)?.action;
    expect(undo).toBeDefined();
    act(() => undo!.onClick());

    await waitFor(() =>
      expect(
        useStudentRecordsStore.getState().records.find((r) => r.id === LEGACY_COPY.id)?.content,
      ).toBe(''),
    );
    expect(useToastStore.getState().toasts.some((t) => t.type === 'error')).toBe(false);
    expect(ledger(0)).toContainEqual({ number: 15, status: 'absent', reason: '질병' });
    expect(ledger(3)).toEqual([{ number: 15, status: 'earlyLeave', reason: '질병' }]);
  });
});
