import { create } from 'zustand';
import type { StudentRecord, CounselingMethod, AttendancePeriodEntry } from '@domain/entities/StudentRecord';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import { DEFAULT_RECORD_CATEGORIES } from '@domain/valueObjects/RecordCategory';
import { studentRecordsRepository } from '@adapters/di/container';
import { ManageStudentRecords } from '@usecases/studentRecords/ManageStudentRecords';
import { updateAttendancePeriods } from '@usecases/studentRecords/UpdateAttendancePeriods';
import { generateUUID } from '@infrastructure/utils/uuid';
import type { StudentAttendance, AttendanceStatus } from '@domain/entities/Attendance';
import { pickRepresentativeAttendance } from '@domain/rules/attendanceRules';
import type { Student } from '@domain/entities/Student';
import { useTeachingClassStore } from './useTeachingClassStore';

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

type ViewMode = 'input' | 'progress' | 'search';
type PeriodFilter = 'week' | 'month' | 'all' | 'custom';

interface StudentRecordsState {
  records: readonly StudentRecord[];
  categories: readonly RecordCategoryItem[];
  loaded: boolean;
  viewMode: ViewMode;
  periodFilter: PeriodFilter;

  load: () => Promise<void>;
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
  ) => Promise<void>;
  updateRecord: (record: StudentRecord) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  toggleFollowUpDone: (recordId: string) => Promise<void>;
  toggleNeisReport: (recordId: string) => Promise<void>;
  toggleDocumentSubmitted: (recordId: string) => Promise<void>;
  bulkMarkDocumentSubmitted: (recordIds: readonly string[]) => Promise<void>;
  setViewMode: (mode: ViewMode) => void;
  setPeriodFilter: (filter: PeriodFilter) => void;

  addCategory: (name: string, color: string) => Promise<void>;
  updateCategory: (updated: RecordCategoryItem) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  addSubcategory: (categoryId: string, name: string) => Promise<void>;
  deleteSubcategory: (categoryId: string, name: string) => Promise<void>;
  renameSubcategory: (
    categoryId: string,
    oldName: string,
    newName: string,
  ) => Promise<void>;
  bridgeHomeroomDayAttendance: (params: BridgeHomeroomDayParams) => Promise<void>;
  updateAttendanceRecord: (params: UpdateAttendanceRecordParams) => Promise<void>;
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

export const useStudentRecordsStore = create<StudentRecordsState>(
  (set, get) => {
    const manageRecords = new ManageStudentRecords(studentRecordsRepository);

    return {
      records: [],
      categories: [...DEFAULT_RECORD_CATEGORIES],
      loaded: false,
      viewMode: 'input',
      periodFilter: 'month',

      load: async () => {
        if (get().loaded) return;
        try {
          const [records, categories] = await Promise.all([
            manageRecords.getAll(),
            manageRecords.getCategories(),
          ]);
          set({ records, categories, loaded: true });
        } catch {
          set({ loaded: true });
        }
      },

      addRecord: async (studentId, category, subcategory, content, date, method?, followUp?, followUpDate?, reportedToNeis?, documentSubmitted?) => {
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
          ...(category === 'attendance' ? { reportedToNeis: reportedToNeis ?? false, documentSubmitted: documentSubmitted ?? false } : {}),
        };
        await manageRecords.add(newRecord);
        set((state) => ({ records: [...state.records, newRecord] }));
      },

      updateRecord: async (updated) => {
        await manageRecords.update(updated);
        set((state) => ({
          records: state.records.map((r) =>
            r.id === updated.id ? updated : r,
          ),
        }));
      },

      deleteRecord: async (id) => {
        await manageRecords.delete(id);
        set((state) => ({
          records: state.records.filter((r) => r.id !== id),
        }));
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
        const updated = { ...record, documentSubmitted: !record.documentSubmitted };
        await manageRecords.update(updated);
        set((state) => ({
          records: state.records.map((r) => (r.id === recordId ? updated : r)),
        }));
      },

      bulkMarkDocumentSubmitted: async (recordIds) => {
        const idSet = new Set(recordIds);
        const targets = get().records.filter(
          (r) => idSet.has(r.id) && r.category === 'attendance' && !r.documentSubmitted,
        );
        const updatedRecords = targets.map((r) => ({ ...r, documentSubmitted: true }));
        await Promise.all(updatedRecords.map((r) => manageRecords.update(r)));
        const updatedIds = new Set(updatedRecords.map((r) => r.id));
        set((state) => ({
          records: state.records.map((r) =>
            updatedIds.has(r.id) ? { ...r, documentSubmitted: true } : r,
          ),
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
          categories: state.categories.map((c) =>
            c.id === updated.id ? updated : c,
          ),
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
          categories: state.categories.map((c) =>
            c.id === categoryId ? updated : c,
          ),
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
          categories: state.categories.map((c) =>
            c.id === categoryId ? updated : c,
          ),
        }));
      },

      renameSubcategory: async (categoryId, oldName, newName) => {
        const target = get().categories.find((c) => c.id === categoryId);
        if (!target || !target.subcategories.includes(oldName)) return;
        const updated: RecordCategoryItem = {
          ...target,
          subcategories: target.subcategories.map((s) =>
            s === oldName ? newName : s,
          ),
        };
        await manageRecords.updateCategory(updated);
        set((state) => ({
          categories: state.categories.map((c) =>
            c.id === categoryId ? updated : c,
          ),
        }));
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
            // 대표 없음(전부 present) → 기존 bridge 삭제
            if (existing) {
              await manageRecords.delete(bridgeId);
              set((s) => ({ records: s.records.filter((r) => r.id !== bridgeId) }));
            }
            continue;
          }

          const typeLabel = ATTENDANCE_STATUS_LABEL[rep.status as Exclude<AttendanceStatus, 'present'>];
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
            const teaching = useTeachingClassStore.getState();
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
              const periodEntry = updatedRecord.attendancePeriods?.find(
                (e) => e.period === p,
              );
              const others = (nextMap.get(p) ?? []).filter(
                (sa) => sa.number !== studentNumber,
              );
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
    };
  },
);
