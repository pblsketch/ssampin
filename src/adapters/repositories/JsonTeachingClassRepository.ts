import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { ITeachingClassRepository } from '@domain/repositories/ITeachingClassRepository';
import type { TeachingClassesData } from '@domain/entities/TeachingClass';
import type { CurriculumProgressData } from '@domain/entities/CurriculumProgress';
import type { AttendanceData } from '@domain/entities/Attendance';

export class JsonTeachingClassRepository implements ITeachingClassRepository {
  constructor(private readonly storage: IStoragePort) {}

  getClasses(): Promise<TeachingClassesData | null> {
    return this.storage.read<TeachingClassesData>('teaching-classes');
  }

  saveClasses(data: TeachingClassesData): Promise<void> {
    return this.storage.write('teaching-classes', data);
  }

  getProgress(): Promise<CurriculumProgressData | null> {
    return this.storage.read<CurriculumProgressData>('curriculum-progress');
  }

  saveProgress(data: CurriculumProgressData): Promise<void> {
    return this.storage.write('curriculum-progress', data);
  }

  getAttendance(): Promise<AttendanceData | null> {
    return this.storage.read<AttendanceData>('attendance');
  }

  saveAttendance(data: AttendanceData): Promise<void> {
    return this.storage.write('attendance', data);
  }
}
