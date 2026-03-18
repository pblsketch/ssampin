import { create } from 'zustand';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import { teachingClassRepository } from '@mobile/di/container';

interface MobileTeachingClassState {
  classes: readonly TeachingClass[];
  loaded: boolean;
  load: () => Promise<void>;
  reload: () => Promise<void>;
  getClass: (classId: string) => TeachingClass | undefined;
}

export const useMobileTeachingClassStore = create<MobileTeachingClassState>((set, get) => ({
  classes: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const data = await teachingClassRepository.getClasses();
      if (data?.classes) {
        set({ classes: data.classes, loaded: true });
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

  getClass: (classId) => {
    return get().classes.find((c) => c.id === classId);
  },
}));
