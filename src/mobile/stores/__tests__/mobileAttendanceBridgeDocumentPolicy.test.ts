/**
 * 모바일 출결 편집이 하루 전체를 근거로 사본을 다시 쓰는지 — **회귀 가드**.
 *
 * 배경 — 모바일 담임 출결은 한 교시(중·고는 0교시=조회)만 화면에 띄운다. 예전에는 그 화면 값만으로
 * 사본(att-학생-날짜)을 다시 써서 두 가지가 깨졌다:
 *   (A) 하루에 사유가 섞이면 교시 상세가 사라져 requiresDocument 가 뒤집혔다(항상 과소 방향).
 *   (B) 0교시에 안 걸린 학생은 '출석'으로 보여 **사본이 통째로 삭제**됐다.
 * 원장(AttendanceRecord)은 교시별로 온전하므로(upsertRecord 교체 키에 period 포함),
 * 브리지가 그날 원장 전체를 다시 모으는 것으로 고쳤다.
 *
 * 분석: docs/03-analysis/attendance-document-mobile-need.analysis.md §3
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { AttendanceRecord, StudentAttendance } from '@domain/entities/Attendance';
import type { Student } from '@domain/entities/Student';
import { requiresDocument } from '@domain/rules/attendanceDocumentPolicy';

const { recordsFake } = vi.hoisted(() => {
  const records: StudentRecord[] = [];
  return {
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
  };
});

vi.mock('@mobile/di/container', () => ({
  studentRecordsRepository: recordsFake,
  teachingClassRepository: {
    async getAttendance() {
      return { records: [] };
    },
    async saveAttendance() {},
    async getClasses() {
      return { classes: [] };
    },
    async saveClasses() {},
  },
  studentRepository: {
    async getStudents() {
      return [];
    },
    async saveStudents() {},
  },
}));

vi.mock('@mobile/stores/useMobileDriveSyncStore', () => ({
  useMobileDriveSyncStore: { getState: () => ({ triggerSaveSync: vi.fn() }) },
}));

import { useMobileStudentRecordsStore } from '../useMobileStudentRecordsStore';
import { useMobileAttendanceStore } from '../useMobileAttendanceStore';
import { useMobileStudentStore } from '../useMobileStudentStore';

const DATE = '2026-08-27';
const CLASS_ID = '2-3';
const STUDENT = 'stu-A';
const NUMBER = 7;
const BRIDGE_ID = 'att-stu-A-2026-08-27';

/** 원장 한 교시 — 대상 학생 1명만 담는다(다른 학생은 이 테스트의 관심사가 아니다). */
function ledger(period: number, entry: StudentAttendance): AttendanceRecord {
  return { classId: CLASS_ID, date: DATE, period, students: [entry] };
}

function seedLedger(...records: AttendanceRecord[]): void {
  useMobileAttendanceStore.setState({ records, loaded: true });
}

/** PC에서 만든 사본 — 교시 상세를 갖고 있다. */
function bridgeCopy(over: Partial<StudentRecord> = {}): StudentRecord {
  return {
    id: BRIDGE_ID,
    studentId: STUDENT,
    category: 'attendance',
    subcategory: '결석 (미인정)',
    content: '',
    date: DATE,
    createdAt: '2026-08-27T00:00:00.000Z',
    documentSubmitted: false,
    attendancePeriods: [
      { period: 1, status: 'absent', reason: '미인정' },
      { period: 3, status: 'classAbsence', reason: '질병' },
    ],
    ...over,
  };
}

const savedCopy = (): StudentRecord | undefined =>
  recordsFake.records.find((r) => r.id === BRIDGE_ID);

async function bridge(params: {
  status: StudentAttendance['status'];
  reason?: StudentAttendance['reason'];
  withClassId?: boolean;
}): Promise<void> {
  await useMobileStudentRecordsStore.getState().bridgeAttendanceRecord({
    studentId: STUDENT,
    date: DATE,
    status: params.status,
    reason: params.reason,
    ...(params.withClassId === false ? {} : { classId: CLASS_ID }),
  });
}

beforeEach(() => {
  recordsFake.records.splice(0);
  useMobileStudentRecordsStore.setState({ records: [], categories: [], loaded: false });
  useMobileAttendanceStore.setState({ records: [], loaded: true });
  useMobileStudentStore.setState({
    students: [{ id: STUDENT, name: '김하늘', studentNumber: NUMBER }] as unknown as Student[],
    loaded: true,
  });
});

describe('하루 전체 집계 — 교시 상세 보존', () => {
  it('사유가 섞인 하루도 교시 상세가 남고 증빙서류 요구가 유지된다 (A 회귀 가드)', async () => {
    recordsFake.records.push(bridgeCopy());
    expect(requiresDocument(bridgeCopy())).toBe(true);

    seedLedger(
      ledger(1, { number: NUMBER, status: 'absent', reason: '미인정' }),
      ledger(3, { number: NUMBER, status: 'classAbsence', reason: '질병' }),
    );

    // 모바일 화면은 0교시만 띄우지만, 브리지는 그날 원장 전체를 근거로 삼아야 한다.
    await bridge({ status: 'absent', reason: '미인정' });

    const rec = savedCopy();
    expect(rec?.attendancePeriods).toHaveLength(2);
    expect(rec?.attendancePeriods?.map((p) => p.period)).toEqual([1, 3]);
    expect(requiresDocument(rec as StudentRecord)).toBe(true);
  });

  it('대표는 심각도 규칙(pickRepresentativeAttendance)을 따른다 — 결석이 결과보다 앞선다', async () => {
    seedLedger(
      ledger(3, { number: NUMBER, status: 'classAbsence', reason: '질병' }),
      ledger(5, { number: NUMBER, status: 'absent', reason: '질병' }),
    );

    await bridge({ status: 'classAbsence', reason: '질병' });

    expect(savedCopy()?.subcategory).toBe('결석 (질병)');
  });
});

describe('삭제 판정도 하루 기준', () => {
  it('0교시가 출석이어도 다른 교시에 기록이 있으면 사본을 지우지 않는다 (B 회귀 가드)', async () => {
    recordsFake.records.push(
      bridgeCopy({
        subcategory: '결과 (질병)',
        attendancePeriods: [{ period: 3, status: 'classAbsence', reason: '질병' }],
      }),
    );

    seedLedger(
      ledger(0, { number: NUMBER, status: 'present' }),
      ledger(3, { number: NUMBER, status: 'classAbsence', reason: '질병' }),
    );

    await bridge({ status: 'present' });

    const rec = savedCopy();
    expect(rec).toBeDefined();
    expect(rec?.subcategory).toBe('결과 (질병)');
    expect(requiresDocument(rec as StudentRecord)).toBe(true);
  });

  it('그날 전 교시가 출석이면 종전대로 사본을 지운다', async () => {
    recordsFake.records.push(bridgeCopy());
    seedLedger(
      ledger(0, { number: NUMBER, status: 'present' }),
      ledger(3, { number: NUMBER, status: 'present' }),
    );

    await bridge({ status: 'present' });

    expect(savedCopy()).toBeUndefined();
  });
});

describe('안전 가드와 하위호환', () => {
  it('원장을 아직 못 읽었으면 하루 집계를 신뢰하지 않는다 — 넘겨받은 상태로 기록한다', async () => {
    // 매치된 교시가 0건이다. "전부 출석"으로 오판해 사본을 지우면 안 된다.
    recordsFake.records.push(bridgeCopy());
    useMobileAttendanceStore.setState({ records: [], loaded: false });

    await bridge({ status: 'late', reason: '질병' });

    const rec = savedCopy();
    expect(rec).toBeDefined();
    expect(rec?.subcategory).toBe('지각 (질병)');
  });

  it('classId 없이 부르면 종전 단일 상태 동작을 유지한다 (하위호환)', async () => {
    recordsFake.records.push(bridgeCopy());
    seedLedger(ledger(1, { number: NUMBER, status: 'absent', reason: '미인정' }));

    await bridge({ status: 'late', reason: '기타', withClassId: false });

    const rec = savedCopy();
    expect(rec?.subcategory).toBe('지각 (기타)');
    expect(rec?.attendancePeriods).toBeUndefined();
  });

  it('서류 체크값 등 기존 필드는 그대로 승계된다', async () => {
    recordsFake.records.push(bridgeCopy({ documentSubmitted: true }));
    seedLedger(ledger(1, { number: NUMBER, status: 'absent', reason: '질병' }));

    await bridge({ status: 'absent', reason: '질병' });

    expect(savedCopy()?.documentSubmitted).toBe(true);
  });

  it('그룹 출결(수업반) 레코드는 담임 하루 집계에 섞이지 않는다', async () => {
    seedLedger(ledger(1, { number: NUMBER, status: 'late', reason: '질병' }), {
      ...ledger(2, { number: NUMBER, status: 'absent', reason: '미인정' }),
      groupId: 'grp-1',
    });

    await bridge({ status: 'late', reason: '질병' });

    const rec = savedCopy();
    expect(rec?.attendancePeriods).toHaveLength(1);
    expect(rec?.subcategory).toBe('지각 (질병)');
  });
});
