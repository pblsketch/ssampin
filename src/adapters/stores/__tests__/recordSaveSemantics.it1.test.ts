/**
 * IT-1: 담임 출결 자동저장 → 원본(attendance)↔미러(student-records att-{id}-{date}) 동시 반영
 * 설계서 §3.2 IT-1, P1 가드
 *
 * 검증:
 * 1. bridgeHomeroomDayAttendance 호출 후 student-records 미러가 생성됨
 * 2. 미러 id = att-{studentId}-{date} 패턴 준수
 * 3. 미러 subcategory가 출결 유형을 반영함
 * 4. updateAttendanceRecord(역동기화) 후 원본 출결부도 갱신됨
 * 5. 부분실패(원본 동기화 실패) 시 미러는 유지되고 상태가 표면화됨
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { AttendanceRecord } from '@domain/entities/Attendance';

/* ── 인메모리 repo fake ── */
const { studentRecordsRepoFake, teachingClassRepoFake } = vi.hoisted(() => {
  const records: StudentRecord[] = [];
  const categories: import('@domain/valueObjects/RecordCategory').RecordCategoryItem[] = [];

  const studentRecordsRepoFakeRef = {
    records,
    categories,
    async getAll() {
      return [...records];
    },
    async getCategories() {
      return [...categories];
    },
    async add(r: StudentRecord) {
      records.push(r);
    },
    async update(r: StudentRecord) {
      const idx = records.findIndex((x) => x.id === r.id);
      if (idx >= 0) records[idx] = r;
    },
    async delete(id: string) {
      const idx = records.findIndex((r) => r.id === id);
      if (idx >= 0) records.splice(idx, 1);
    },
    async saveCategories() {},
    // IStudentRecordsRepository — ManageStudentRecords.add/update/delete 경로에서 사용
    async getRecords() {
      return { records: [...records], categories: [...categories] };
    },
    async saveRecords(data: { records: StudentRecord[]; categories?: typeof categories }) {
      records.splice(0, records.length, ...data.records);
      if (data.categories) categories.splice(0, categories.length, ...data.categories);
    },
  };

  // TeachingClass repo: ITeachingClassRepository 인메모리 구현
  // saveDayAttendance → manageAttendance.saveAll → saveAttendance 경로를 커버해야 함
  const attendanceRecords: AttendanceRecord[] = [];
  const teachingClassRepoFakeRef = {
    async loadClasses() {
      return { classes: [] };
    },
    async saveClasses() {},
    async getClasses() {
      return { classes: [] };
    },
    async getProgress() {
      return null;
    },
    async saveProgress() {},
    async getAttendance() {
      return { records: [...attendanceRecords] };
    },
    async saveAttendance(data: { records: AttendanceRecord[] }) {
      attendanceRecords.splice(0, attendanceRecords.length, ...data.records);
    },
    async saveAttendanceRecord() {},
    async getAttendanceRecord() {
      return undefined;
    },
  };

  return {
    studentRecordsRepoFake: studentRecordsRepoFakeRef,
    teachingClassRepoFake: teachingClassRepoFakeRef,
  };
});

vi.mock('@adapters/di/container', () => ({
  studentRecordsRepository: studentRecordsRepoFake,
  teachingClassRepository: teachingClassRepoFake,
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

// ObservationAttachmentStore는 bridgeHomeroomDayAttendance에서 deleteByObservationId 호출 경로에 필요
vi.mock('@adapters/stores/useObservationAttachmentStore', () => ({
  useObservationAttachmentStore: {
    getState: () => ({
      deleteByObservationId: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

import { useStudentRecordsStore } from '../useStudentRecordsStore';
import { useTeachingClassStore } from '../useTeachingClassStore';

const DATE = '2026-06-23';
const CLASS_NAME = '3-2';
const STUDENT_ID = 'student-001';
const STUDENT_NUMBER = 5;

beforeEach(() => {
  // 스토어 상태 초기화
  useStudentRecordsStore.setState({ records: [], categories: [], loaded: false });
  useTeachingClassStore.setState((s) => ({ ...s, attendanceRecords: [], classes: [] }));
  studentRecordsRepoFake.records.splice(0);
});

describe('IT-1: 담임 출결 자동저장 → 원본↔미러 정합 (S3 저장 시맨틱)', () => {
  it('bridgeHomeroomDayAttendance → att-{studentId}-{date} 미러 레코드 생성', async () => {
    const recordsByPeriod = new Map([
      [1, [{ number: STUDENT_NUMBER, status: 'absent' as const, reason: '질병' as const }]],
    ]);

    const students = [{ id: STUDENT_ID, studentNumber: STUDENT_NUMBER, name: '김철수' }];

    await useStudentRecordsStore.getState().bridgeHomeroomDayAttendance({
      className: CLASS_NAME,
      date: DATE,
      recordsByPeriod,
      students,
    });

    const bridgeId = `att-${STUDENT_ID}-${DATE}`;
    const mirror = useStudentRecordsStore.getState().records.find((r) => r.id === bridgeId);

    expect(mirror).toBeDefined();
    expect(mirror?.id).toBe(bridgeId);
    expect(mirror?.studentId).toBe(STUDENT_ID);
    expect(mirror?.category).toBe('attendance');
    expect(mirror?.date).toBe(DATE);
  });

  it('미러 subcategory가 출결 유형(결석·지각 등)을 반영', async () => {
    const recordsByPeriod = new Map([
      [1, [{ number: STUDENT_NUMBER, status: 'late' as const, reason: '기타' as const }]],
    ]);
    const students = [{ id: STUDENT_ID, studentNumber: STUDENT_NUMBER, name: '김철수' }];

    await useStudentRecordsStore.getState().bridgeHomeroomDayAttendance({
      className: CLASS_NAME,
      date: DATE,
      recordsByPeriod,
      students,
    });

    const bridgeId = `att-${STUDENT_ID}-${DATE}`;
    const mirror = useStudentRecordsStore.getState().records.find((r) => r.id === bridgeId);
    expect(mirror?.subcategory).toContain('지각');
  });

  it('전체 출석(present) 시 기존 미러 삭제', async () => {
    // 먼저 미러 생성
    const absentMap = new Map([
      [1, [{ number: STUDENT_NUMBER, status: 'absent' as const, reason: '기타' as const }]],
    ]);
    const students = [{ id: STUDENT_ID, studentNumber: STUDENT_NUMBER, name: '김철수' }];
    await useStudentRecordsStore.getState().bridgeHomeroomDayAttendance({
      className: CLASS_NAME,
      date: DATE,
      recordsByPeriod: absentMap,
      students,
    });

    expect(
      useStudentRecordsStore.getState().records.find((r) => r.id === `att-${STUDENT_ID}-${DATE}`),
    ).toBeDefined();

    // 전체 출석으로 전환 → 미러 삭제
    const presentMap = new Map([[1, [{ number: STUDENT_NUMBER, status: 'present' as const }]]]);
    await useStudentRecordsStore.getState().bridgeHomeroomDayAttendance({
      className: CLASS_NAME,
      date: DATE,
      recordsByPeriod: presentMap,
      students,
    });

    expect(
      useStudentRecordsStore.getState().records.find((r) => r.id === `att-${STUDENT_ID}-${DATE}`),
    ).toBeUndefined();
  });

  it('updateAttendanceRecord 역동기화 — 원본 출결부 saveDayAttendance 호출됨', async () => {
    // 먼저 미러 생성
    const initialMap = new Map([
      [1, [{ number: STUDENT_NUMBER, status: 'absent' as const, reason: '질병' as const }]],
    ]);
    const students = [{ id: STUDENT_ID, studentNumber: STUDENT_NUMBER, name: '김철수' }];
    await useStudentRecordsStore.getState().bridgeHomeroomDayAttendance({
      className: CLASS_NAME,
      date: DATE,
      recordsByPeriod: initialMap,
      students,
    });

    const bridgeId = `att-${STUDENT_ID}-${DATE}`;
    const mirror = useStudentRecordsStore.getState().records.find((r) => r.id === bridgeId);
    expect(mirror).toBeDefined();

    // 교과 class 생성 (역동기화 경로에 classId 필요)
    // updateAttendanceRecord는 useTeachingClassStore.getState().getDayAttendance를 직접 사용하므로
    // Zustand 스토어 상태에 attendanceRecords를 주입해야 함
    const CLASS_ID = 'class-uuid-001';
    const initialAttendanceRecord: AttendanceRecord = {
      classId: CLASS_ID,
      date: DATE,
      period: 1,
      students: [{ number: STUDENT_NUMBER, status: 'absent', reason: '질병' }],
    };
    useTeachingClassStore.setState((s) => ({
      ...s,
      attendanceRecords: [...s.attendanceRecords, initialAttendanceRecord],
    }));

    // 지각으로 updateAttendanceRecord 역동기화
    await useStudentRecordsStore.getState().updateAttendanceRecord({
      record: mirror!,
      nextPeriods: [{ period: 1, status: 'late', reason: '기타' }],
      content: '',
      reportedToNeis: false,
      documentSubmitted: false,
      classId: CLASS_ID,
      date: DATE,
      studentNumber: STUDENT_NUMBER,
      regularPeriodCount: 7,
    });

    // 원본 출결부 업데이트 확인 — useTeachingClassStore.attendanceRecords에서 직접 읽음
    const allRecords = useTeachingClassStore.getState().attendanceRecords;
    const period1 = allRecords.find(
      (r) => r.classId === CLASS_ID && r.date === DATE && r.period === 1,
    );
    const studentEntry = period1?.students.find((s) => s.number === STUDENT_NUMBER);
    expect(studentEntry?.status).toBe('late');
  });

  it('원본 동기화 실패 시 미러(student-records)는 여전히 업데이트됨 (부분실패 허용)', async () => {
    // 먼저 미러 생성
    const initialMap = new Map([
      [1, [{ number: STUDENT_NUMBER, status: 'absent' as const, reason: '기타' as const }]],
    ]);
    const students = [{ id: STUDENT_ID, studentNumber: STUDENT_NUMBER, name: '김철수' }];
    await useStudentRecordsStore.getState().bridgeHomeroomDayAttendance({
      className: CLASS_NAME,
      date: DATE,
      recordsByPeriod: initialMap,
      students,
    });

    const bridgeId = `att-${STUDENT_ID}-${DATE}`;
    const mirror = useStudentRecordsStore.getState().records.find((r) => r.id === bridgeId);
    expect(mirror).toBeDefined();

    // saveDayAttendance를 실패하게 강제 — useTeachingClassStore 스토어 메서드를 spy
    const originalSave = useTeachingClassStore.getState().saveDayAttendance;
    useTeachingClassStore.setState((s) => ({
      ...s,
      saveDayAttendance: vi.fn().mockRejectedValueOnce(new Error('디스크 쓰기 실패')),
    }));

    // updateAttendanceRecord는 원본 실패에도 미러 레이어는 계속 진행
    await useStudentRecordsStore.getState().updateAttendanceRecord({
      record: mirror!,
      nextPeriods: [{ period: 1, status: 'late', reason: '기타' }],
      content: '부분실패 테스트',
      reportedToNeis: false,
      documentSubmitted: false,
      classId: 'class-uuid-002',
      date: DATE,
      studentNumber: STUDENT_NUMBER,
      regularPeriodCount: 7,
    });

    // 미러는 업데이트되어야 함 (원본 실패와 무관)
    const updatedMirror = useStudentRecordsStore.getState().records.find((r) => r.id === bridgeId);
    expect(updatedMirror).toBeDefined();
    // content 업데이트 반영 확인
    expect(updatedMirror?.content).toBe('부분실패 테스트');

    // 복원
    useTeachingClassStore.setState((s) => ({ ...s, saveDayAttendance: originalSave }));
  });
});
