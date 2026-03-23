import type { ClassScheduleData, TeacherScheduleData, TimetableOverridesData } from '../entities/Timetable';

export interface IScheduleRepository {
  getClassSchedule(): Promise<ClassScheduleData | null>;
  saveClassSchedule(data: ClassScheduleData): Promise<void>;
  getTeacherSchedule(): Promise<TeacherScheduleData | null>;
  saveTeacherSchedule(data: TeacherScheduleData): Promise<void>;
  getTimetableOverrides(): Promise<TimetableOverridesData | null>;
  saveTimetableOverrides(data: TimetableOverridesData): Promise<void>;
}
