import { create } from 'zustand';
import type {
  StudentRecord,
  CounselingMethod,
  AttendancePeriodEntry,
} from '@domain/entities/StudentRecord';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import {
  DEFAULT_RECORD_CATEGORIES,
  synthesizeSubcategory,
} from '@domain/valueObjects/RecordCategory';
import { studentRecordsRepository } from '@adapters/di/container';
import { ManageStudentRecords } from '@usecases/studentRecords/ManageStudentRecords';
import { updateAttendancePeriods } from '@usecases/studentRecords/UpdateAttendancePeriods';
import { migrateStudentRecordsOnLoad } from '@usecases/studentRecords/MigrateStudentRecordsSubcatToTags';
import { generateUUID } from '@infrastructure/utils/uuid';
import type { StudentAttendance, AttendanceStatus } from '@domain/entities/Attendance';
import { pickRepresentativeAttendance } from '@domain/rules/attendanceRules';
import { toggleDocumentKind } from '@domain/rules/attendanceDocumentPolicy';
import type { Student } from '@domain/entities/Student';
import { useTeachingClassStore } from './useTeachingClassStore';
import { useObservationAttachmentStore } from './useObservationAttachmentStore';

/** 카테고리 색상 → Tailwind 클래스 매핑 */
export const RECORD_COLOR_MAP: Record<
  string,
  { text: string; activeBg: string; inactiveBg: string; tagBg: string }
> = {
  red: {
    text: 'text-red-400',
    activeBg: 'bg-red-500/80 text-white',
    inactiveBg: 'bg-red-500/10 text-red-400 hover:bg-red-500/20',
    tagBg: 'bg-red-500/15 text-red-400',
  },
  blue: {
    text: 'text-blue-400',
    activeBg: 'bg-blue-500/80 text-white',
    inactiveBg: 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20',
    tagBg: 'bg-blue-500/15 text-blue-400',
  },
  green: {
    text: 'text-green-400',
    activeBg: 'bg-green-500/80 text-white',
    inactiveBg: 'bg-green-500/10 text-green-400 hover:bg-green-500/20',
    tagBg: 'bg-green-500/15 text-green-400',
  },
  yellow: {
    text: 'text-yellow-400',
    activeBg: 'bg-yellow-500/80 text-white',
    inactiveBg: 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20',
    tagBg: 'bg-yellow-500/15 text-yellow-400',
  },
  purple: {
    text: 'text-purple-400',
    activeBg: 'bg-purple-500/80 text-white',
    inactiveBg: 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20',
    tagBg: 'bg-purple-500/15 text-purple-400',
  },
  pink: {
    text: 'text-pink-400',
    activeBg: 'bg-pink-500/80 text-white',
    inactiveBg: 'bg-pink-500/10 text-pink-400 hover:bg-pink-500/20',
    tagBg: 'bg-pink-500/15 text-pink-400',
  },
  indigo: {
    text: 'text-indigo-400',
    activeBg: 'bg-indigo-500/80 text-white',
    inactiveBg: 'bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20',
    tagBg: 'bg-indigo-500/15 text-indigo-400',
  },
  teal: {
    text: 'text-teal-400',
    activeBg: 'bg-teal-500/80 text-white',
    inactiveBg: 'bg-teal-500/10 text-teal-400 hover:bg-teal-500/20',
    tagBg: 'bg-teal-500/15 text-teal-400',
  },
  gray: {
    text: 'text-gray-400',
    activeBg: 'bg-gray-500/80 text-white',
    inactiveBg: 'bg-gray-500/10 text-gray-400 hover:bg-gray-500/20',
    tagBg: 'bg-gray-500/15 text-gray-400',
  },
};

const ATTENDANCE_STATUS_LABEL: Record<Exclude<AttendanceStatus, 'present'>, string> = {
  absent: '결석',
  late: '지각',
  earlyLeave: '조퇴',
  classAbsence: '결과',
};

export interface BridgeHomeroomDayParams {
  className: string;
  date: string;
  recordsByPeriod: ReadonlyMap<number, readonly StudentAttendance[]>;
  students: readonly Student[];
}

type ViewMode = 'attendance' | 'input' | 'progress' | 'search';
type PeriodFilter = 'week' | 'month' | 'all' | 'custom' | 'semester';

interface StudentRecordsState {
  records: readonly StudentRecord[];
  categories: readonly RecordCategoryItem[];
  loaded: boolean;
  viewMode: ViewMode;
  periodFilter: PeriodFilter;

  load: (force?: boolean) => Promise<void>;
  addRecord: (
    studentId: string,
    category: string,
    subcategory: string,
    content: string,
    date: string,
    method?: CounselingMethod,
    followUp?: string,
    followUpDate?: string,
    reportedToNeis?: boolean,
    documentSubmitted?: boolean,
  ) => Promise<string>;
  /**
   * 태그를 포함한 단일 write 저장 (관찰 기록 알림 등에서 사용).
   * 기존 addRecord(10-인자)의 시그니처·호출부를 건드리지 않기 위해 별도 액션으로 둔다.
   */
  addRecordWithTags: (params: AddRecordWithTagsParams) => Promise<string>;
  /** 해당 학생의 가장 최근 기록일('YYYY-MM-DD'). 기록 없으면 null. (공백 감지용) */
  getLastRecordDate: (studentId: string) => string | null;
  updateRecord: (record: StudentRecord) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  toggleFollowUpDone: (recordId: string) => Promise<void>;
  toggleNeisReport: (recordId: string) => Promise<void>;
  toggleDocumentSubmitted: (recordId: string) => Promise<void>;
  /** M6: 서류 종류 하나 토글 — documentSubmitted는 '전 종류 제출' 파생 불변식으로 함께 갱신. */
  toggleDocumentItem: (recordId: string, kind: string) => Promise<void>;
  bulkMarkDocumentSubmitted: (recordIds: readonly string[]) => Promise<void>;
  bulkMarkNeisReported: (recordIds: readonly string[]) => Promise<void>;
  /** 검토 모드 일괄 완료 — followUp이 있고 미완료인 대상만 완료 처리(원자 저장). */
  bulkMarkFollowUpDone: (recordIds: readonly string[]) => Promise<void>;
  setViewMode: (mode: ViewMode) => void;
  setPeriodFilter: (filter: PeriodFilter) => void;

  addCategory: (name: string, color: string) => Promise<void>;
  updateCategory: (updated: RecordCategoryItem) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  addSubcategory: (categoryId: string, name: string) => Promise<void>;
  deleteSubcategory: (categoryId: string, name: string) => Promise<void>;
  renameSubcategory: (categoryId: string, oldName: string, newName: string) => Promise<void>;
  /**
   * Q2 태그 관리 카스케이드: 모든 레코드 tags 에서 oldTag 를 newTag 로 치환(rename) 또는
   * 제거(newTag=null). 단일 영속(bulk). 영향받은 레코드 수 반환.
   */
  cascadeTagChange: (oldTag: string, newTag: string | null) => Promise<number>;
  bridgeHomeroomDayAttendance: (params: BridgeHomeroomDayParams) => Promise<void>;
  updateAttendanceRecord: (params: UpdateAttendanceRecordParams) => Promise<void>;

  /**
   * roster-sample-data-removal Phase 2 — 외부 참조 검사.
   *
   * 주어진 학생 ID 집합을 참조하는 학생 기록(records)의 개수를 반환한다.
   * `useStudentStore.load()`의 마이그레이션 가드 D에서 사용된다.
   *
   * @param studentIds 검사 대상 학생 ID 배열 (보통 SAMPLE 35명)
   * @returns 참조 건수 (0 = 참조 없음 → 정리 가능)
   */
  hasStudentReferences: (studentIds: readonly string[]) => number;
}

export interface AddRecordWithTagsParams {
  studentId: string;
  category: string;
  content: string;
  date: string;
  tags?: readonly string[];
  /** 미지정 시 카테고리별 중립 sentinel로 합성(비출결 전용). */
  subcategory?: string;
  method?: CounselingMethod;
}

export interface UpdateAttendanceRecordParams {
  record: StudentRecord;
  nextPeriods: readonly AttendancePeriodEntry[];
  content: string;
  reportedToNeis?: boolean;
  documentSubmitted?: boolean;
  /** 담임 반 ID (보통 settings.className) — 없으면 원본 출결부 동기화 건너뜀 */
  classId?: string;
  /** 기록 날짜 (YYYY-MM-DD) */
  date: string;
  /** 해당 학생 번호 (studentNumber) — 원본 출결부 동기화 시 필요 */
  studentNumber?: number;
  /** 정규 교시 수 (settings.maxPeriods 등) */
  regularPeriodCount: number;
}

export const useStudentRecordsStore = create<StudentRecordsState>((set, get) => {
  const manageRecords = new ManageStudentRecords(studentRecordsRepository);

  return {
    records: [],
    categories: [...DEFAULT_RECORD_CATEGORIES],
    loaded: false,
    // 기록 탭 첫 진입 화면 = 출결 (attendance-grid-v2 P7.1). 릴리즈 노트 고지 대상.
    viewMode: 'attendance',
    periodFilter: 'month',

    load: async (force = false) => {
      // force=true: 동기화 리로드용 — loaded를 유지한 채 데이터만 조용히 갱신
      if (get().loaded && !force) return;
      try {
        // Q2: 로드 시 멱등 정규화(비출결 subcategory→tags). 변경 있으면 1회 백업 후 영속,
        //   변경 없으면 순수 read no-op. 동기화 후 reload 에서도 재실행되어 자가 치유한다.
        const outcome = await migrateStudentRecordsOnLoad(studentRecordsRepository);
        set({
          records: outcome.records,
          categories: outcome.categories ?? [...DEFAULT_RECORD_CATEGORIES],
          loaded: true,
        });
      } catch {
        set({ loaded: true });
      }
    },

    addRecord: async (
      studentId,
      category,
      subcategory,
      content,
      date,
      method?,
      followUp?,
      followUpDate?,
      reportedToNeis?,
      documentSubmitted?,
    ) => {
      const newRecord: StudentRecord = {
        id: generateUUID(),
        studentId,
        category,
        subcategory,
        content,
        date,
        createdAt: new Date().toISOString(),
        ...(method ? { method } : {}),
        ...(followUp ? { followUp, followUpDate, followUpDone: false } : {}),
        ...(category === 'attendance'
          ? {
              reportedToNeis: reportedToNeis ?? false,
              documentSubmitted: documentSubmitted ?? false,
            }
          : {}),
      };
      await manageRecords.add(newRecord);
      set((state) => ({ records: [...state.records, newRecord] }));
      return newRecord.id;
    },

    addRecordWithTags: async (params) => {
      const newRecord: StudentRecord = {
        id: generateUUID(),
        studentId: params.studentId,
        category: params.category,
        subcategory: params.subcategory ?? synthesizeSubcategory(params.category),
        content: params.content,
        date: params.date,
        createdAt: new Date().toISOString(),
        ...(params.tags && params.tags.length > 0 ? { tags: [...params.tags] } : {}),
        ...(params.method ? { method: params.method } : {}),
      };
      await manageRecords.add(newRecord);
      set((state) => ({ records: [...state.records, newRecord] }));
      return newRecord.id;
    },

    getLastRecordDate: (studentId) => {
      const rs = get().records.filter((r) => r.studentId === studentId);
      if (rs.length === 0) return null;
      return rs.reduce((latest, r) => (r.date > latest ? r.date : latest), rs[0]!.date);
    },

    updateRecord: async (updated) => {
      await manageRecords.update(updated);
      set((state) => ({
        records: state.records.map((r) => (r.id === updated.id ? updated : r)),
      }));
    },

    deleteRecord: async (id) => {
      await manageRecords.delete(id);
      set((state) => ({
        records: state.records.filter((r) => r.id !== id),
      }));
      // 기록에 연결된 첨부(메타+바이너리)도 함께 정리(고아 방지)
      await useObservationAttachmentStore.getState().deleteByObservationId(id);
    },

    toggleFollowUpDone: async (recordId) => {
      const record = get().records.find((r) => r.id === recordId);
      if (!record || !record.followUp) return;
      const updated = { ...record, followUpDone: !record.followUpDone };
      await manageRecords.update(updated);
      set((state) => ({
        records: state.records.map((r) => (r.id === recordId ? updated : r)),
      }));
    },

    toggleNeisReport: async (recordId) => {
      const record = get().records.find((r) => r.id === recordId);
      if (!record || record.category !== 'attendance') return;
      const updated = { ...record, reportedToNeis: !record.reportedToNeis };
      await manageRecords.update(updated);
      set((state) => ({
        records: state.records.map((r) => (r.id === recordId ? updated : r)),
      }));
    },

    toggleDocumentSubmitted: async (recordId) => {
      const record = get().records.find((r) => r.id === recordId);
      if (!record || record.category !== 'attendance') return;
      const nextSubmitted = !record.documentSubmitted;
      // M6 불변식: documents가 있으면 boolean 토글이 전 종류를 같은 상태로 동기화
      const updated = {
        ...record,
        documentSubmitted: nextSubmitted,
        ...(record.documents && record.documents.length > 0
          ? { documents: record.documents.map((d) => ({ ...d, submitted: nextSubmitted })) }
          : {}),
      };
      await manageRecords.update(updated);
      set((state) => ({
        records: state.records.map((r) => (r.id === recordId ? updated : r)),
      }));
    },

    toggleDocumentItem: async (recordId, kind) => {
      const record = get().records.find((r) => r.id === recordId);
      if (!record || record.category !== 'attendance') return;
      const next = toggleDocumentKind({
        documents: record.documents,
        documentSubmitted: record.documentSubmitted,
        kind,
      });
      const updated = {
        ...record,
        documents: next.documents,
        documentSubmitted: next.documentSubmitted,
      };
      await manageRecords.update(updated); // updatedAt 자동 스탬프 → 레코드 단위 병합 편승
      set((state) => ({
        records: state.records.map((r) => (r.id === recordId ? updated : r)),
      }));
    },

    bulkMarkDocumentSubmitted: async (recordIds) => {
      const idSet = new Set(recordIds);
      const targets = get().records.filter(
        (r) => idSet.has(r.id) && r.category === 'attendance' && !r.documentSubmitted,
      );
      // M6 불변식: 일괄 완료도 documents 전 종류를 제출 상태로 동기화
      const updatedRecords = targets.map((r) => ({
        ...r,
        documentSubmitted: true,
        ...(r.documents && r.documents.length > 0
          ? { documents: r.documents.map((d) => ({ ...d, submitted: true })) }
          : {}),
      }));
      // 기록별 update() 병렬 실행은 같은 스냅샷을 서로 덮어써 마지막 쓰기만 남는다(codex QA) — 원자 일괄 저장.
      await manageRecords.updateMany(updatedRecords);
      const updatedById = new Map(updatedRecords.map((r) => [r.id, r]));
      set((state) => ({
        records: state.records.map((r) => updatedById.get(r.id) ?? r),
      }));
    },

    bulkMarkNeisReported: async (recordIds) => {
      const idSet = new Set(recordIds);
      const targets = get().records.filter(
        (r) => idSet.has(r.id) && r.category === 'attendance' && !r.reportedToNeis,
      );
      const updatedRecords = targets.map((r) => ({ ...r, reportedToNeis: true }));
      await manageRecords.updateMany(updatedRecords);
      const updatedIds = new Set(updatedRecords.map((r) => r.id));
      set((state) => ({
        records: state.records.map((r) =>
          updatedIds.has(r.id) ? { ...r, reportedToNeis: true } : r,
        ),
      }));
    },

    bulkMarkFollowUpDone: async (recordIds) => {
      const idSet = new Set(recordIds);
      const targets = get().records.filter((r) => idSet.has(r.id) && r.followUp && !r.followUpDone);
      const updatedRecords = targets.map((r) => ({ ...r, followUpDone: true }));
      await manageRecords.updateMany(updatedRecords);
      const updatedById = new Map(updatedRecords.map((r) => [r.id, r]));
      set((state) => ({
        records: state.records.map((r) => updatedById.get(r.id) ?? r),
      }));
    },

    setViewMode: (mode) => set({ viewMode: mode }),
    setPeriodFilter: (filter) => set({ periodFilter: filter }),

    /* ── 카테고리 관리 ─────────────────────────────── */

    addCategory: async (name, color) => {
      const newCat: RecordCategoryItem = {
        id: generateUUID(),
        name,
        color,
        subcategories: [],
      };
      await manageRecords.addCategory(newCat);
      set((state) => ({ categories: [...state.categories, newCat] }));
    },

    updateCategory: async (updated) => {
      await manageRecords.updateCategory(updated);
      set((state) => ({
        categories: state.categories.map((c) => (c.id === updated.id ? updated : c)),
      }));
    },

    deleteCategory: async (id) => {
      await manageRecords.deleteCategory(id);
      set((state) => ({
        categories: state.categories.filter((c) => c.id !== id),
      }));
    },

    addSubcategory: async (categoryId, name) => {
      const target = get().categories.find((c) => c.id === categoryId);
      if (!target || target.subcategories.includes(name)) return;
      const updated: RecordCategoryItem = {
        ...target,
        subcategories: [...target.subcategories, name],
      };
      await manageRecords.updateCategory(updated);
      set((state) => ({
        categories: state.categories.map((c) => (c.id === categoryId ? updated : c)),
      }));
    },

    deleteSubcategory: async (categoryId, name) => {
      const target = get().categories.find((c) => c.id === categoryId);
      if (!target) return;
      const updated: RecordCategoryItem = {
        ...target,
        subcategories: target.subcategories.filter((s) => s !== name),
      };
      await manageRecords.updateCategory(updated);
      set((state) => ({
        categories: state.categories.map((c) => (c.id === categoryId ? updated : c)),
      }));
    },

    renameSubcategory: async (categoryId, oldName, newName) => {
      const target = get().categories.find((c) => c.id === categoryId);
      if (!target || !target.subcategories.includes(oldName)) return;
      const updated: RecordCategoryItem = {
        ...target,
        subcategories: target.subcategories.map((s) => (s === oldName ? newName : s)),
      };
      await manageRecords.updateCategory(updated);
      set((state) => ({
        categories: state.categories.map((c) => (c.id === categoryId ? updated : c)),
      }));
    },

    cascadeTagChange: async (oldTag, newTag) => {
      let affected = 0;
      const next = get().records.map((r) => {
        if (!r.tags || !r.tags.includes(oldTag)) return r;
        affected += 1;
        const replaced =
          newTag === null
            ? r.tags.filter((t) => t !== oldTag)
            : r.tags.map((t) => (t === oldTag ? newTag : t));
        // 중복 제거(치환 시 newTag 가 이미 있던 경우) + 빈 배열이면 undefined
        const deduped = replaced.filter((t, i, a) => a.indexOf(t) === i);
        // 태그 편집도 수정 시각을 갱신해 동기화 병합이 최신본으로 인식하게 한다.
        return {
          ...r,
          tags: deduped.length > 0 ? deduped : undefined,
          updatedAt: new Date().toISOString(),
        };
      });
      if (affected === 0) return 0;
      // 단일 영속(envelope 보존) — categories 등 기존 봉투 유지.
      const data = await studentRecordsRepository.getRecords();
      await studentRecordsRepository.saveRecords({ ...(data ?? { records: [] }), records: next });
      set({ records: next });
      return affected;
    },

    bridgeHomeroomDayAttendance: async ({ date, recordsByPeriod, students }) => {
      for (const student of students) {
        if (student.studentNumber == null) continue;

        // 교시별 StudentAttendance 맵 재구성 (studentNumber 매칭)
        const periodMap = new Map<number, StudentAttendance | undefined>();
        for (const [period, periodStudents] of recordsByPeriod) {
          const hit = periodStudents.find((sa) => sa.number === student.studentNumber);
          periodMap.set(period, hit);
        }

        const rep = pickRepresentativeAttendance(periodMap);
        const bridgeId = `att-${student.id}-${date}`;
        const existing = get().records.find((r) => r.id === bridgeId);

        if (rep == null) {
          // 대표 없음(전부 present) → 기존 bridge 삭제 + 연결 첨부 정리
          if (existing) {
            await manageRecords.delete(bridgeId);
            set((s) => ({ records: s.records.filter((r) => r.id !== bridgeId) }));
            await useObservationAttachmentStore.getState().deleteByObservationId(bridgeId);
          }
          continue;
        }

        const typeLabel =
          ATTENDANCE_STATUS_LABEL[rep.status as Exclude<AttendanceStatus, 'present'>];
        const subcategory = rep.reason ? `${typeLabel} (${rep.reason})` : typeLabel;

        // 교시별 이상 출결 상세 보존 (present/undefined 제외, period 오름차순)
        const attendancePeriods: AttendancePeriodEntry[] = [];
        const sortedPeriods = [...periodMap.keys()].sort((a, b) => a - b);
        for (const period of sortedPeriods) {
          const entry = periodMap.get(period);
          if (!entry || entry.status === 'present') continue;
          attendancePeriods.push({
            period,
            status: entry.status,
            ...(entry.reason ? { reason: entry.reason } : {}),
            ...(entry.memo ? { memo: entry.memo } : {}),
          });
        }

        const record: StudentRecord = {
          id: bridgeId,
          studentId: student.id,
          category: 'attendance',
          subcategory,
          content: rep.memo ?? '',
          date,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
          // 출결을 다시 입력해도 나이스 반영·서류 제출 표시가 초기화되지 않게 승계한다.
          ...(existing?.reportedToNeis ? { reportedToNeis: existing.reportedToNeis } : {}),
          ...(existing?.documentSubmitted ? { documentSubmitted: existing.documentSubmitted } : {}),
          // M6: 종류별 체크 상세(documents)도 승계 — 그리드 재저장이 체크리스트를 지우지 않게.
          ...(existing?.documents && existing.documents.length > 0
            ? { documents: existing.documents }
            : {}),
          attendancePeriods,
        };

        if (existing) {
          await manageRecords.update(record);
          set((s) => ({ records: s.records.map((r) => (r.id === bridgeId ? record : r)) }));
        } else {
          await manageRecords.add(record);
          set((s) => ({ records: [...s.records, record] }));
        }
      }
    },

    updateAttendanceRecord: async (params) => {
      const {
        record,
        nextPeriods,
        content,
        reportedToNeis,
        documentSubmitted,
        classId,
        date,
        studentNumber,
        regularPeriodCount,
      } = params;

      // 1) usecase 호출 (검증 + 대표 subcategory 재계산)
      const { record: updatedRecord } = updateAttendancePeriods({
        record,
        nextPeriods,
        content,
        reportedToNeis,
        documentSubmitted,
        regularPeriodCount,
      });

      // 2) 원본 출결부(useTeachingClassStore) 동기화 — classId/studentNumber 있을 때만
      if (classId && studentNumber != null) {
        try {
          // 데이터 유실 방지: 병합 시드를 읽기 전에 원본 출결부 스토어 로드를 보장한다.
          let teaching = useTeachingClassStore.getState();
          if (!teaching.loaded) {
            await teaching.load();
            teaching = useTeachingClassStore.getState();
          }
          const existing = teaching.getDayAttendance(classId, date);

          // 기존 recordsByPeriod 맵 구성 (다른 학생 엔트리 보존)
          const nextMap = new Map<number, StudentAttendance[]>();
          for (const r of existing) {
            nextMap.set(r.period, [...r.students]);
          }

          // 전체 후보 교시 (조회/정규/종례) — 이 범위 내에서 해당 학생 엔트리 재계산
          const candidatePeriods = new Set<number>(nextMap.keys());
          candidatePeriods.add(0); // 조회
          candidatePeriods.add(9); // 종례
          for (let p = 1; p <= regularPeriodCount; p += 1) candidatePeriods.add(p);

          for (const p of candidatePeriods) {
            const periodEntry = updatedRecord.attendancePeriods?.find((e) => e.period === p);
            const others = (nextMap.get(p) ?? []).filter((sa) => sa.number !== studentNumber);
            if (periodEntry) {
              others.push({
                number: studentNumber,
                status: periodEntry.status,
                ...(periodEntry.reason ? { reason: periodEntry.reason } : {}),
                ...(periodEntry.memo ? { memo: periodEntry.memo } : {}),
              });
            }
            if (others.length > 0) {
              nextMap.set(p, others);
            } else {
              nextMap.delete(p);
            }
          }

          await teaching.saveDayAttendance(classId, date, nextMap);
        } catch (err) {
          console.warn('[updateAttendanceRecord] 원본 출결부 동기화 실패', err);
          // 원본 실패해도 기록 레이어는 계속 진행 (부분 실패 허용)
        }
      }

      // 3) 기록 레이어 업데이트
      await manageRecords.update(updatedRecord);
      set((s) => ({
        records: s.records.map((r) => (r.id === updatedRecord.id ? updatedRecord : r)),
      }));
    },

    /**
     * roster-sample-data-removal Phase 2 — 외부 참조 검사 (가드 D).
     *
     * studentIds에 속한 학생의 기록(records)이 한 건이라도 있으면 양수 반환.
     * 사용자가 샘플 명단을 자기 학생처럼 운영했다는 강한 신호이므로
     * 자동 정리를 차단하고 안내 배너로 폴백시킨다.
     */
    hasStudentReferences: (studentIds) => {
      if (studentIds.length === 0) return 0;
      const idSet = new Set(studentIds);
      return get().records.reduce((count, r) => (idSet.has(r.studentId) ? count + 1 : count), 0);
    },
  };
});
