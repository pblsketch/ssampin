import { create } from 'zustand';
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
  addEntry: (
    classId: string,
    date: string,
    period: number,
    unit: string,
    lesson: string,
    note?: string,
  ) => Promise<void>;
  updateEntryStatus: (entry: ProgressEntry, newStatus: ProgressStatus) => Promise<void>;
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

  addEntry: async (classId, date, period, unit, lesson, note) => {
    const entry: ProgressEntry = {
      id: crypto.randomUUID(),
      classId,
      date,
      period,
      unit,
      lesson,
      status: 'completed',
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
}));
