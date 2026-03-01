import type { IScheduleRepository } from '@domain/repositories/IScheduleRepository';
import type { ClassScheduleData } from '@domain/entities/Timetable';

export class UpdateClassScheduleUseCase {
  constructor(private readonly scheduleRepo: IScheduleRepository) {}

  async execute(data: ClassScheduleData): Promise<void> {
    await this.scheduleRepo.saveClassSchedule(data);
  }
}
