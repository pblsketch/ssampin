/**
 * codex QA(gpt-5.6-sol) 후속 회귀 — 서류 종류 체크리스트(M6) 데이터 안전 2건.
 *
 * 1. [HIGH] 서로 다른 서류 칩 빠른 연속 클릭: 두 호출이 같은 낡은 레코드에서 계산해
 *    앞선 체크를 덮던 결함 → toggleDocumentItem 직렬화 체인으로 봉합.
 * 2. [LOW] 그리드 재저장 승계에서 명시적 documentSubmitted:false가 truthy 스프레드에
 *    탈락해 불변식(documents 존재 시 boolean=전 종류 제출 파생)이 깨지던 결함 →
 *    documents 승계 시 deriveDocumentSubmitted로 재계산.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StudentRecord } from '@domain/entities/StudentRecord';

/* ── 인메모리 repo fake (recordSaveSemantics.it1과 동일 패턴) ── */
const { studentRecordsRepoFake } = vi.hoisted(() => {
  const records: StudentRecord[] = [];
  const categories: import('@domain/valueObjects/RecordCategory').RecordCategoryItem[] = [];
  return {
    studentRecordsRepoFake: {
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
      async getRecords() {
        return { records: [...records], categories: [...categories] };
      },
      async saveRecords(data: { records: StudentRecord[]; categories?: typeof categories }) {
        records.splice(0, records.length, ...data.records);
        if (data.categories) categories.splice(0, categories.length, ...data.categories);
      },
    },
  };
});

vi.mock('@adapters/di/container', () => ({
  studentRecordsRepository: studentRecordsRepoFake,
  teachingClassRepository: {
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
      return { records: [] };
    },
    async saveAttendance() {},
    async saveAttendanceRecord() {},
    async getAttendanceRecord() {
      return undefined;
    },
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
    getState: () => ({
      deleteByObservationId: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

import { useStudentRecordsStore } from '../useStudentRecordsStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';

const DATE = '2026-07-13';
const STUDENT_ID = 'stu-1';
const RECORD_ID = `att-${STUDENT_ID}-${DATE}`;

const attendanceRecord = (extra: Partial<StudentRecord> = {}): StudentRecord => ({
  id: RECORD_ID,
  studentId: STUDENT_ID,
  category: 'attendance',
  subcategory: '결석 (인정)',
  content: '',
  date: DATE,
  createdAt: `${DATE}T00:00:00.000Z`,
  attendancePeriods: [{ period: 1, status: 'absent', reason: '인정' }],
  ...extra,
});

beforeEach(() => {
  useStudentRecordsStore.setState({ records: [], categories: [], loaded: false });
  studentRecordsRepoFake.records.splice(0);
});

describe('[HIGH] 서류 칩 빠른 연속 클릭 — 직렬화로 앞선 체크 보존', () => {
  it('신청서·보고서를 await 없이 연속 토글해도 둘 다 체크로 남는다 (상태+영속)', async () => {
    const rec = attendanceRecord({ documentSubmitted: false });
    studentRecordsRepoFake.records.push(rec);
    useStudentRecordsStore.setState({ records: [rec], loaded: true });

    const store = useStudentRecordsStore.getState();
    // 빠른 연속 클릭 모사 — 첫 저장을 기다리지 않고 두 번째 클릭
    const p1 = store.toggleDocumentItem(RECORD_ID, '신청서');
    const p2 = store.toggleDocumentItem(RECORD_ID, '보고서');
    await Promise.all([p1, p2]);

    const inState = useStudentRecordsStore.getState().records.find((r) => r.id === RECORD_ID)!;
    expect(inState.documents!.find((d) => d.kind === '신청서')!.submitted).toBe(true);
    expect(inState.documents!.find((d) => d.kind === '보고서')!.submitted).toBe(true);
    expect(inState.documents!.find((d) => d.kind === '증빙자료')!.submitted).toBe(false);
    expect(inState.documentSubmitted).toBe(false); // 아직 증빙자료 미제출

    const persisted = studentRecordsRepoFake.records.find((r) => r.id === RECORD_ID)!;
    expect(persisted.documents!.find((d) => d.kind === '신청서')!.submitted).toBe(true);
    expect(persisted.documents!.find((d) => d.kind === '보고서')!.submitted).toBe(true);
  });

  it('세 종류를 모두 연속 토글하면 파생 documentSubmitted가 true로 영속된다', async () => {
    const rec = attendanceRecord({ documentSubmitted: false });
    studentRecordsRepoFake.records.push(rec);
    useStudentRecordsStore.setState({ records: [rec], loaded: true });

    const store = useStudentRecordsStore.getState();
    await Promise.all([
      store.toggleDocumentItem(RECORD_ID, '신청서'),
      store.toggleDocumentItem(RECORD_ID, '보고서'),
      store.toggleDocumentItem(RECORD_ID, '증빙자료'),
    ]);

    const persisted = studentRecordsRepoFake.records.find((r) => r.id === RECORD_ID)!;
    expect(persisted.documents!.every((d) => d.submitted)).toBe(true);
    expect(persisted.documentSubmitted).toBe(true);
  });
});

describe('[LOW] 그리드 재저장 승계 — 명시적 false에서도 불변식 유지', () => {
  it('부분 제출(documentSubmitted:false) 기록을 그리드로 재저장해도 boolean이 파생값(false)으로 남는다', async () => {
    const partialDocs = [
      { kind: '신청서', submitted: true },
      { kind: '보고서', submitted: false },
      { kind: '증빙자료', submitted: false },
    ];
    const rec = attendanceRecord({ documents: partialDocs, documentSubmitted: false });
    studentRecordsRepoFake.records.push(rec);
    useStudentRecordsStore.setState({ records: [rec], loaded: true });
    useTeachingClassStore.setState((s) => ({ ...s, loaded: true }));

    await useStudentRecordsStore.getState().bridgeHomeroomDayAttendance({
      className: '2-3',
      date: DATE,
      recordsByPeriod: new Map([
        [1, [{ number: 5, status: 'absent' as const, reason: '인정' as const }]],
      ]),
      students: [{ id: STUDENT_ID, studentNumber: 5, name: '김철수' }],
    });

    const persisted = studentRecordsRepoFake.records.find((r) => r.id === RECORD_ID)!;
    expect(persisted.documents).toEqual(partialDocs); // 체크 상세 승계
    expect(persisted.documentSubmitted).toBe(false); // undefined가 아니라 파생 false — 불변식 유지
  });
});
