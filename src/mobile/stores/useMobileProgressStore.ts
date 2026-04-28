import { create } from 'zustand';
import { generateUUID } from '@infrastructure/utils/uuid';
import type { ProgressEntry, ProgressStatus } from '@domain/entities/CurriculumProgress';
import { ManageCurriculumProgress } from '@usecases/classManagement/ManageCurriculumProgress';
import { teachingClassRepository } from '@mobile/di/container';
import { useMobileDriveSyncStore } from '@mobile/stores/useMobileDriveSyncStore';

const manageProgress = new ManageCurriculumProgress(teachingClassRepository);

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface MobileProgressState {
  entries: readonly ProgressEntry[];
  loaded: boolean;
  load: () => Promise<void>;
  reload: () => Promise<void>;
  getEntriesByClass: (classId: string) => readonly ProgressEntry[];
  getTodayEntries: (classId: string) => readonly ProgressEntry[];
  /**
   * 진도 항목 추가.
   * @param status 신규 항목 상태 (default: 'completed' — 기존 호출처 회귀 0).
   *               진도 서브탭에서 미래 일정을 추가할 때는 'planned' 가능.
   */
  addEntry: (
    classId: string,
    date: string,
    period: number,
    unit: string,
    lesson: string,
    note?: string,
    status?: ProgressStatus,
  ) => Promise<void>;
  /** 상태만 변경 (사이클 핸들러용 — 기존 유지) */
  updateEntryStatus: (entry: ProgressEntry, newStatus: ProgressStatus) => Promise<void>;
  /** 전체 필드 편집 (Bottom-Sheet 편집 모드 저장 핸들러용) */
  updateEntry: (entry: ProgressEntry) => Promise<void>;
  /** 항목 삭제 (액션시트 → 확인 → 삭제 핸들러용) */
  deleteEntry: (id: string) => Promise<void>;
}

export const useMobileProgressStore = create<MobileProgressState>((set, get) => ({
  entries: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const entries = await manageProgress.getAll();
      set({ entries, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  reload: async () => {
    set({ loaded: false });
    await get().load();
  },

  getEntriesByClass: (classId) => {
    return get().entries
      .filter((e) => e.classId === classId)
      .sort((a, b) => b.date.localeCompare(a.date) || a.period - b.period);
  },

  getTodayEntries: (classId) => {
    const today = todayString();
    return get().entries
      .filter((e) => e.classId === classId && e.date === today)
      .sort((a, b) => a.period - b.period);
  },

  addEntry: async (classId, date, period, unit, lesson, note, status = 'completed') => {
    const entry: ProgressEntry = {
      id: generateUUID(),
      classId,
      date,
      period,
      unit,
      lesson,
      status,
      note: note ?? '',
    };
    await manageProgress.add(entry);
    set((s) => ({ entries: [...s.entries, entry] }));
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },

  updateEntryStatus: async (entry, newStatus) => {
    const updated = { ...entry, status: newStatus };
    await manageProgress.update(updated);
    set((s) => ({
      entries: s.entries.map((e) => (e.id === entry.id ? updated : e)),
    }));
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },

  updateEntry: async (entry) => {
    await manageProgress.update(entry);
    set((s) => ({
      entries: s.entries.map((e) => (e.id === entry.id ? entry : e)),
    }));
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },

  deleteEntry: async (id) => {
    await manageProgress.delete(id);
    set((s) => ({
      entries: s.entries.filter((e) => e.id !== id),
    }));
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },
}));
