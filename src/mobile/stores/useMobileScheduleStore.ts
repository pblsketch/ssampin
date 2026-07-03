import { create } from 'zustand';
import type { ClassScheduleData, TeacherScheduleData } from '@domain/entities/Timetable';
import { createEmptyTeacherSchedule } from '@domain/rules/timetableRules';
import { scheduleRepository } from '@mobile/di/container';

interface MobileScheduleState {
  teacherSchedule: TeacherScheduleData;
  /** 우리 반(학급) 시간표 — 담임이 아니거나 미설정이면 null. 홈 주간 시간표 슬라이드에서 사용. */
  classSchedule: ClassScheduleData | null;
  loaded: boolean;
  load: () => Promise<void>;
  reload: () => Promise<void>;
}

export const useMobileScheduleStore = create<MobileScheduleState>((set, get) => ({
  teacherSchedule: createEmptyTeacherSchedule(7),
  classSchedule: null,
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      // 교사·학급 시간표를 함께 로드 (홈 주간 시간표 스와이프에서 둘 다 필요)
      const [teacher, cls] = await Promise.all([
        scheduleRepository.getTeacherSchedule(),
        scheduleRepository.getClassSchedule(),
      ]);
      set({
        ...(teacher ? { teacherSchedule: teacher } : {}),
        classSchedule: cls ?? null,
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },

  reload: async () => {
    set({ loaded: false });
    await get().load();
  },
}));
