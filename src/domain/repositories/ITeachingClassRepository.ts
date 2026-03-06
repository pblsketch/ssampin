import type { TeachingClassesData } from '../entities/TeachingClass';
import type { CurriculumProgressData } from '../entities/CurriculumProgress';
import type { AttendanceData } from '../entities/Attendance';

export interface ITeachingClassRepository {
  getClasses(): Promise<TeachingClassesData | null>;
  saveClasses(data: TeachingClassesData): Promise<void>;
  getProgress(): Promise<CurriculumProgressData | null>;
  saveProgress(data: CurriculumProgressData): Promise<void>;
  getAttendance(): Promise<AttendanceData | null>;
  saveAttendance(data: AttendanceData): Promise<void>;
}
