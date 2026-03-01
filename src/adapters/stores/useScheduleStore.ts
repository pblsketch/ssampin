import { create } from 'zustand';
import type { ClassScheduleData, TeacherScheduleData } from '@domain/entities/Timetable';
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

interface ScheduleState {
  classSchedule: ClassScheduleData;
  teacherSchedule: TeacherScheduleData;
  loaded: boolean;
  load: () => Promise<void>;
  updateClassSchedule: (data: ClassScheduleData) => Promise<void>;
  updateTeacherSchedule: (data: TeacherScheduleData) => Promise<void>;
}

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  classSchedule: SAMPLE_CLASS_SCHEDULE,
  teacherSchedule: SAMPLE_TEACHER_SCHEDULE,
  loaded: false,

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
    set({ classSchedule: data });
    await scheduleRepository.saveClassSchedule(data);
  },

  updateTeacherSchedule: async (data) => {
    set({ teacherSchedule: data });
    await scheduleRepository.saveTeacherSchedule(data);
  },
}));
