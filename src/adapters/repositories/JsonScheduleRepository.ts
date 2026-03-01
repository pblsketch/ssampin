import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IScheduleRepository } from '@domain/repositories/IScheduleRepository';
import type {
  ClassScheduleData,
  TeacherScheduleData,
} from '@domain/entities/Timetable';

export class JsonScheduleRepository implements IScheduleRepository {
  constructor(private readonly storage: IStoragePort) {}

  getClassSchedule(): Promise<ClassScheduleData | null> {
    return this.storage.read<ClassScheduleData>('class-schedule');
  }

  saveClassSchedule(data: ClassScheduleData): Promise<void> {
    return this.storage.write('class-schedule', data);
  }

  getTeacherSchedule(): Promise<TeacherScheduleData | null> {
    return this.storage.read<TeacherScheduleData>('teacher-schedule');
  }

  saveTeacherSchedule(data: TeacherScheduleData): Promise<void> {
    return this.storage.write('teacher-schedule', data);
  }
}
