import type { ClassScheduleData, TeacherScheduleData } from '../entities/Timetable';

export interface IScheduleRepository {
  getClassSchedule(): Promise<ClassScheduleData | null>;
  saveClassSchedule(data: ClassScheduleData): Promise<void>;
  getTeacherSchedule(): Promise<TeacherScheduleData | null>;
  saveTeacherSchedule(data: TeacherScheduleData): Promise<void>;
}
