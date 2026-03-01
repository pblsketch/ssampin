import type { IScheduleRepository } from '@domain/repositories/IScheduleRepository';
import { createEmptyClassSchedule, createEmptyTeacherSchedule } from '@domain/rules/timetableRules';

export class ClearSchedule {
  constructor(private readonly scheduleRepo: IScheduleRepository) {}

  /**
   * 학급 시간표와 교사 시간표를 모두 초기화
   */
  async execute(maxPeriods: number): Promise<void> {
    const emptyClass = createEmptyClassSchedule(maxPeriods);
    const emptyTeacher = createEmptyTeacherSchedule(maxPeriods);
    await Promise.all([
      this.scheduleRepo.saveClassSchedule(emptyClass),
      this.scheduleRepo.saveTeacherSchedule(emptyTeacher),
    ]);
  }
}
