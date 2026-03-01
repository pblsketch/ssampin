import { create } from 'zustand';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { RecordCategory } from '@domain/valueObjects/RecordCategory';
import { studentRecordsRepository } from '@adapters/di/container';
import { ManageStudentRecords } from '@usecases/studentRecords/ManageStudentRecords';

/** 카테고리 그룹별 서브카테고리 정의 */
export const SUBCATEGORY_MAP: Record<RecordCategory, readonly string[]> = {
  attendance: ['생리결석', '병결', '무단결석', '지각', '조퇴', '결과'],
  counseling: ['학부모상담', '학생상담', '교우관계'],
  life: ['보건', '생활지도', '학습', '칭찬'],
  etc: ['진로', '가정연락', '기타'],
} as const;

/** 카테고리 그룹 한글 라벨 */
export const CATEGORY_LABELS: Record<RecordCategory, string> = {
  attendance: '출결 (ATTENDANCE)',
  counseling: '상담 / 관계 (COUNSELING)',
  life: '생활 / 학습 (LIFE & LEARNING)',
  etc: '기타 (OTHER)',
};

/** 카테고리 그룹 색상 */
export const CATEGORY_COLORS: Record<RecordCategory, string> = {
  attendance: 'red',
  counseling: 'blue',
  life: 'green',
  etc: 'gray',
};

type ViewMode = 'input' | 'progress' | 'search';
type PeriodFilter = 'week' | 'month' | 'all';

interface StudentRecordsState {
  records: readonly StudentRecord[];
  loaded: boolean;
  viewMode: ViewMode;
  periodFilter: PeriodFilter;

  load: () => Promise<void>;
  addRecord: (
    studentId: string,
    category: RecordCategory,
    subcategory: string,
    content: string,
    date: string,
  ) => Promise<void>;
  updateRecord: (record: StudentRecord) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  setViewMode: (mode: ViewMode) => void;
  setPeriodFilter: (filter: PeriodFilter) => void;
}

export const useStudentRecordsStore = create<StudentRecordsState>(
  (set, get) => {
    const manageRecords = new ManageStudentRecords(studentRecordsRepository);

    return {
      records: [],
      loaded: false,
      viewMode: 'input',
      periodFilter: 'month',

      load: async () => {
        if (get().loaded) return;
        try {
          const records = await manageRecords.getAll();
          set({ records, loaded: true });
        } catch {
          set({ loaded: true });
        }
      },

      addRecord: async (studentId, category, subcategory, content, date) => {
        const newRecord: StudentRecord = {
          id: crypto.randomUUID(),
          studentId,
          category,
          subcategory,
          content,
          date,
          createdAt: new Date().toISOString(),
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

      setViewMode: (mode) => set({ viewMode: mode }),
      setPeriodFilter: (filter) => set({ periodFilter: filter }),
    };
  },
);
