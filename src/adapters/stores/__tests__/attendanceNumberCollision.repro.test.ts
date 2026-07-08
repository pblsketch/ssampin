/**
 * 회귀 가드: "한 명 선택 → 같은 번호 학생 전원 오염"(학번 뭉개짐) 재현 + 정리 후 해소.
 *
 * 원인: 출결은 학생을 '번호'(StudentAttendance.number)로 식별한다. 번호가 겹치면
 * bridgeHomeroomDayAttendance 가 같은 번호의 다른 학생에게도 미러 기록(att-{id}-{date})을
 * 만들어 한 명 저장이 전원으로 번진다.
 * reassignConflictingNumbers 로 번호를 고유화하면 저장한 한 명에게만 기록된다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import { reassignConflictingNumbers } from '@domain/rules/studentNumberRules';

/* ── 인메모리 repo fake (bridge 경로만 커버) ── */
const { studentRecordsRepoFake } = vi.hoisted(() => {
  const records: StudentRecord[] = [];
  return {
    studentRecordsRepoFake: {
      records,
      async getRecords() {
        return { records: [...records], categories: [] };
      },
      async saveRecords(data: { records: StudentRecord[] }) {
        records.splice(0, records.length, ...data.records);
      },
      async add(r: StudentRecord) {
        records.push(r);
      },
      async update(r: StudentRecord) {
        const i = records.findIndex((x) => x.id === r.id);
        if (i >= 0) records[i] = r;
      },
      async delete(id: string) {
        const i = records.findIndex((r) => r.id === id);
        if (i >= 0) records.splice(i, 1);
      },
      async getCategories() {
        return [];
      },
      async saveCategories() {},
      async getAll() {
        return [...records];
      },
    },
  };
});

vi.mock('@adapters/di/container', () => ({
  studentRecordsRepository: studentRecordsRepoFake,
  teachingClassRepository: {
    async getAttendance() {
      return { records: [] };
    },
    async saveAttendance() {},
    async getClasses() {
      return { classes: [] };
    },
    async saveClasses() {},
    async getProgress() {
      return null;
    },
    async saveProgress() {},
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

const DATE = '2026-07-08';
const CLASS_NAME = '3-5';

beforeEach(() => {
  useStudentRecordsStore.setState({ records: [], categories: [], loaded: true });
  studentRecordsRepoFake.records.splice(0);
});

function attendanceMirrorIds(): string[] {
  return useStudentRecordsStore
    .getState()
    .records.filter((r) => r.category === 'attendance')
    .map((r) => r.id)
    .sort();
}

describe('출결 번호 뭉개짐 — 재현 + 정리 후 해소', () => {
  it('중복 번호(5,5)면 한 명 저장이 두 학생 모두에게 미러된다 (버그 재현)', async () => {
    const students = [
      { id: 'stu-A', studentNumber: 5, name: '김A' },
      { id: 'stu-B', studentNumber: 5, name: '이B' },
    ];
    // A 한 명만 결석 저장 (번호 5)
    const recordsByPeriod = new Map([
      [1, [{ number: 5, status: 'absent' as const, reason: '질병' as const }]],
    ]);
    await useStudentRecordsStore.getState().bridgeHomeroomDayAttendance({
      className: CLASS_NAME,
      date: DATE,
      recordsByPeriod,
      students,
    });
    // 버그: 같은 번호 A·B 둘 다 미러가 생성됨
    expect(attendanceMirrorIds()).toEqual([`att-stu-A-${DATE}`, `att-stu-B-${DATE}`]);
  });

  it('번호를 고유화(정리)하면 저장한 한 명에게만 기록된다 (수정 검증)', async () => {
    const raw = [
      { id: 'stu-A', studentNumber: 5, name: '김A' },
      { id: 'stu-B', studentNumber: 5, name: '이B' },
    ];
    // 담임 '번호 정리하기'와 동일: studentNumber 기준 충돌 재배정
    const mapped = reassignConflictingNumbers(raw.map((s) => ({ number: s.studentNumber })));
    const fixed = raw.map((s, i) => ({ ...s, studentNumber: mapped[i]!.number }));
    expect(new Set(fixed.map((s) => s.studentNumber)).size).toBe(2); // 이제 고유

    // 정리 후 A의 실제 번호로 저장
    const aNum = fixed[0]!.studentNumber;
    const recordsByPeriod = new Map([
      [1, [{ number: aNum, status: 'absent' as const, reason: '질병' as const }]],
    ]);
    await useStudentRecordsStore.getState().bridgeHomeroomDayAttendance({
      className: CLASS_NAME,
      date: DATE,
      recordsByPeriod,
      students: fixed,
    });
    // A 한 명에게만 기록
    expect(attendanceMirrorIds()).toEqual([`att-stu-A-${DATE}`]);
  });
});
