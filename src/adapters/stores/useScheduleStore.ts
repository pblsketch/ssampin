import { create } from 'zustand';
import type { ClassScheduleData, TeacherScheduleData, ClassPeriod, TimetableOverride } from '@domain/entities/Timetable';
import { createEmptyClassSchedule, createEmptyTeacherSchedule, migrateClassScheduleData } from '@domain/rules/timetableRules';
import { scheduleRepository } from '@adapters/di/container';
import { getDayOfWeek } from '@domain/rules/periodRules';
import type { WeekendDay } from '@domain/valueObjects/DayOfWeek';

/** 초기 빈 시간표 (저장된 데이터가 없을 때 사용) */
const EMPTY_CLASS_SCHEDULE: ClassScheduleData = createEmptyClassSchedule(7);
const EMPTY_TEACHER_SCHEDULE: TeacherScheduleData = createEmptyTeacherSchedule(7);

/** Undo/Redo를 위한 스냅샷 타입 */
interface ScheduleSnapshot {
  classSchedule: ClassScheduleData;
  teacherSchedule: TeacherScheduleData;
}

interface ScheduleState {
  classSchedule: ClassScheduleData;
  teacherSchedule: TeacherScheduleData;
  loaded: boolean;

  past: ScheduleSnapshot[];
  future: ScheduleSnapshot[];

  /** 임시 시간표 변경 */
  overrides: readonly TimetableOverride[];

  load: () => Promise<void>;
  forceReload: () => Promise<void>;
  updateClassSchedule: (data: ClassScheduleData) => Promise<void>;
  updateTeacherSchedule: (data: TeacherScheduleData) => Promise<void>;
  clearAll: (maxPeriods: number) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  canUndo: () => boolean;
  canRedo: () => boolean;

  addOverride: (override: Omit<TimetableOverride, 'id' | 'createdAt'>) => Promise<void>;
  deleteOverride: (id: string) => Promise<void>;
  /** 특정 날짜의 오버라이드가 적용된 교사 시간표 반환 */
  getEffectiveTeacherSchedule: (date: string, weekendDays?: readonly WeekendDay[]) => readonly (import('@domain/entities/Timetable').TeacherPeriod | null)[];
  /** 특정 날짜의 오버라이드 목록 반환 */
  getOverridesForDate: (date: string) => readonly TimetableOverride[];
}

export const useScheduleStore = create<ScheduleState>((set, get) => {
  const pushToHistory = () => {
    const { classSchedule, teacherSchedule, past } = get();
    const snapshot: ScheduleSnapshot = { classSchedule, teacherSchedule };
    const newPast = [...past, snapshot].slice(-20);
    set({ past: newPast, future: [] });
  };

  return {
    classSchedule: EMPTY_CLASS_SCHEDULE,
    teacherSchedule: EMPTY_TEACHER_SCHEDULE,
    loaded: false,
    past: [],
    future: [],
    overrides: [],

    load: async () => {
      if (get().loaded) return;
      try {
        const [classRaw, teacherSch, overridesData] = await Promise.all([
          scheduleRepository.getClassSchedule(),
          scheduleRepository.getTeacherSchedule(),
          scheduleRepository.getTimetableOverrides(),
        ]);
        // 기존 string[] 포맷 → ClassPeriod[] 포맷 마이그레이션
        const classSch = classRaw
          ? migrateClassScheduleData(classRaw as Record<string, readonly (string | ClassPeriod)[]>)
          : null;
        set({
          classSchedule: classSch ?? EMPTY_CLASS_SCHEDULE,
          teacherSchedule: teacherSch ?? EMPTY_TEACHER_SCHEDULE,
          overrides: overridesData?.overrides ?? [],
          loaded: true,
        });
      } catch {
        set({ loaded: true });
      }
    },

    forceReload: async () => {
      set({ loaded: false });
      await get().load();
    },

    updateClassSchedule: async (data) => {
      pushToHistory();
      set({ classSchedule: data });
      await scheduleRepository.saveClassSchedule(data);
    },

    updateTeacherSchedule: async (data) => {
      pushToHistory();
      set({ teacherSchedule: data });
      await scheduleRepository.saveTeacherSchedule(data);
    },

    clearAll: async (maxPeriods) => {
      pushToHistory();
      const emptyClass = createEmptyClassSchedule(maxPeriods);
      const emptyTeacher = createEmptyTeacherSchedule(maxPeriods);
      set({ classSchedule: emptyClass, teacherSchedule: emptyTeacher });
      await Promise.all([
        scheduleRepository.saveClassSchedule(emptyClass),
        scheduleRepository.saveTeacherSchedule(emptyTeacher),
      ]);
    },

    undo: async () => {
      const { past, future, classSchedule, teacherSchedule } = get();
      if (past.length === 0) return;
      const prev = past[past.length - 1]!;
      const currentSnapshot: ScheduleSnapshot = { classSchedule, teacherSchedule };
      const newPast = past.slice(0, -1);
      const newFuture = [currentSnapshot, ...future].slice(0, 20);

      try {
        await Promise.all([
          scheduleRepository.saveClassSchedule(prev.classSchedule),
          scheduleRepository.saveTeacherSchedule(prev.teacherSchedule),
        ]);
        set({
          classSchedule: prev.classSchedule,
          teacherSchedule: prev.teacherSchedule,
          past: newPast,
          future: newFuture,
        });
      } catch {
        // 무시
      }
    },

    redo: async () => {
      const { past, future, classSchedule, teacherSchedule } = get();
      if (future.length === 0) return;
      const next = future[0]!;
      const currentSnapshot: ScheduleSnapshot = { classSchedule, teacherSchedule };
      const newFuture = future.slice(1);
      const newPast = [...past, currentSnapshot].slice(-20);

      try {
        await Promise.all([
          scheduleRepository.saveClassSchedule(next.classSchedule),
          scheduleRepository.saveTeacherSchedule(next.teacherSchedule),
        ]);
        set({
          classSchedule: next.classSchedule,
          teacherSchedule: next.teacherSchedule,
          past: newPast,
          future: newFuture,
        });
      } catch {
        // 무시
      }
    },

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,

    addOverride: async (input) => {
      const id = `ovr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const override: TimetableOverride = {
        ...input,
        id,
        createdAt: new Date().toISOString(),
      };
      const newOverrides = [...get().overrides, override];
      set({ overrides: newOverrides });
      await scheduleRepository.saveTimetableOverrides({ overrides: newOverrides });
    },

    deleteOverride: async (id) => {
      const newOverrides = get().overrides.filter((o) => o.id !== id);
      set({ overrides: newOverrides });
      await scheduleRepository.saveTimetableOverrides({ overrides: newOverrides });
    },

    getEffectiveTeacherSchedule: (date, weekendDays) => {
      // date → 요일 변환
      const d = new Date(date + 'T00:00:00');
      const dayOfWeekVal = getDayOfWeek(d, weekendDays);
      if (!dayOfWeekVal) return [];

      const baseSchedule = get().teacherSchedule[dayOfWeekVal] ?? [];
      const dayOverrides = get().overrides.filter((o) => o.date === date);

      if (dayOverrides.length === 0) return baseSchedule;

      const periods = [...baseSchedule];
      for (const override of dayOverrides) {
        const idx = override.period - 1;
        if (idx >= 0 && idx < periods.length) {
          if (override.subject) {
            periods[idx] = { subject: override.subject, classroom: override.classroom ?? '' };
          } else {
            periods[idx] = null; // 공강/자습
          }
        }
      }
      return periods;
    },

    getOverridesForDate: (date) => {
      return get().overrides.filter((o) => o.date === date);
    },
  };
});
