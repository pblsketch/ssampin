import { create } from 'zustand';
import type { TeacherScheduleData } from '@domain/entities/Timetable';
import { createEmptyTeacherSchedule } from '@domain/rules/timetableRules';
import { scheduleRepository } from '@mobile/di/container';

interface MobileScheduleState {
  teacherSchedule: TeacherScheduleData;
  loaded: boolean;
  load: () => Promise<void>;
  reload: () => Promise<void>;
}

export const useMobileScheduleStore = create<MobileScheduleState>((set, get) => ({
  teacherSchedule: createEmptyTeacherSchedule(7),
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const data = await scheduleRepository.getTeacherSchedule();
      if (data) {
        set({ teacherSchedule: data, loaded: true });
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
