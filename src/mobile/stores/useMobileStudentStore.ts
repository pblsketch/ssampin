import { create } from 'zustand';
import type { Student } from '@domain/entities/Student';
import { studentRepository } from '@mobile/di/container';

interface MobileStudentState {
  students: readonly Student[];
  loaded: boolean;
  load: () => Promise<void>;
  reload: () => Promise<void>;
}

export const useMobileStudentStore = create<MobileStudentState>((set, get) => ({
  students: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const data = await studentRepository.getStudents();
      if (data) {
        set({ students: data, loaded: true });
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },

  reload: async () => {
    set({ loaded: false });
    await get().load();
  },
}));
