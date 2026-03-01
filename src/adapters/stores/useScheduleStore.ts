import { create } from 'zustand';
import type { ClassScheduleData, TeacherScheduleData } from '@domain/entities/Timetable';
import { createEmptyClassSchedule, createEmptyTeacherSchedule } from '@domain/rules/timetableRules';
import { scheduleRepository } from '@adapters/di/container';

/** 샘플 학급 시간표 (월~금, 6교시) */
const SAMPLE_CLASS_SCHEDULE: ClassScheduleData = {
  '월': ['국어', '수학', '영어', '과학', '사회', '창체'],
  '화': ['수학', '영어', '국어', '체육', '음악', '미술'],
  '수': ['영어', '과학', '수학', '사회', '국어', '체육'],
  '목': ['과학', '국어', '사회', '수학', '영어', '음악'],
  '금': ['사회', '체육', '미술', '영어', '국어', '자율'],
};

/** 샘플 교사 시간표 (월~금, 6교시) */
const SAMPLE_TEACHER_SCHEDULE: TeacherScheduleData = {
  '월': [
    { subject: '수학', classroom: '2-3' },
    { subject: '수학', classroom: '2-1' },
    null,
    { subject: '수학', classroom: '1-2' },
    null,
    null,
  ],
  '화': [
    null,
    { subject: '수학', classroom: '2-3' },
    { subject: '수학', classroom: '3-1' },
    null,
    { subject: '수학', classroom: '1-1' },
    null,
  ],
  '수': [
    { subject: '수학', classroom: '1-2' },
    null,
    { subject: '수학', classroom: '2-3' },
    { subject: '수학', classroom: '3-2' },
    null,
    null,
  ],
  '목': [
    null,
    null,
    { subject: '수학', classroom: '2-3' },
    { subject: '수학', classroom: '1-1' },
    { subject: '수학', classroom: '3-1' },
    null,
  ],
  '금': [
    { subject: '수학', classroom: '2-1' },
    { subject: '수학', classroom: '2-3' },
    null,
    null,
    null,
    null,
  ],
};

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
    classSchedule: SAMPLE_CLASS_SCHEDULE,
    teacherSchedule: SAMPLE_TEACHER_SCHEDULE,
    loaded: false,
    past: [],
    future: [],

    load: async () => {
      if (get().loaded) return;
      try {
        const [classSch, teacherSch] = await Promise.all([
          scheduleRepository.getClassSchedule(),
          scheduleRepository.getTeacherSchedule(),
        ]);
        set({
          classSchedule: classSch ?? SAMPLE_CLASS_SCHEDULE,
          teacherSchedule: teacherSch ?? SAMPLE_TEACHER_SCHEDULE,
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
