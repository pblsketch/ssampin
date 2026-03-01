import type { ISettingsRepository } from '@domain/repositories/ISettingsRepository';
import { getDayOfWeek, getCurrentPeriod } from '@domain/rules/periodRules';

export class GetCurrentPeriodUseCase {
  constructor(private readonly settingsRepo: ISettingsRepository) {}

  /**
   * 현재 교시 번호를 반환합니다.
   * - 주말이면 null
   * - 수업 시간 외이면 null
   */
  async execute(now: Date): Promise<number | null> {
    const day = getDayOfWeek(now);
    if (day === null) return null; // 주말

    const settings = await this.settingsRepo.getSettings();
    if (!settings) return null;

    return getCurrentPeriod(settings.periodTimes, now);
  }
}
