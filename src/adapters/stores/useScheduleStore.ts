import { create } from 'zustand';
import type { ClassScheduleData, TeacherScheduleData, ClassPeriod } from '@domain/entities/Timetable';
import { createEmptyClassSchedule, createEmptyTeacherSchedule, migrateClassScheduleData } from '@domain/rules/timetableRules';
import { scheduleRepository } from '@adapters/di/container';

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

  load: () => Promise<void>;
  updateClassSchedule: (data: ClassScheduleData) => Promise<void>;
  updateTeacherSchedule: (data: TeacherScheduleData) => Promise<void>;
  clearAll: (maxPeriods: number) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  canUndo: () => boolean;
  canRedo: () => boolean;
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

    load: async () => {
      if (get().loaded) return;
      try {
        const [classRaw, teacherSch] = await Promise.all([
          scheduleRepository.getClassSchedule(),
          scheduleRepository.getTeacherSchedule(),
        ]);
        // 기존 string[] 포맷 → ClassPeriod[] 포맷 마이그레이션
        const classSch = classRaw
          ? migrateClassScheduleData(classRaw as Record<string, readonly (string | ClassPeriod)[]>)
          : null;
        set({
          classSchedule: classSch ?? EMPTY_CLASS_SCHEDULE,
          teacherSchedule: teacherSch ?? EMPTY_TEACHER_SCHEDULE,
          loaded: true,
        });
      } catch {
        set({ loaded: true });
      }
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
  };
});
