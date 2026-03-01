import type { IScheduleRepository } from '@domain/repositories/IScheduleRepository';
import type { TeacherScheduleData } from '@domain/entities/Timetable';

export class UpdateTeacherScheduleUseCase {
  constructor(private readonly scheduleRepo: IScheduleRepository) {}

  async execute(data: TeacherScheduleData): Promise<void> {
    await this.scheduleRepo.saveTeacherSchedule(data);
  }
}
