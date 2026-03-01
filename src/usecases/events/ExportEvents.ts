import type { IEventsRepository } from '@domain/repositories/IEventsRepository';
import type { ISettingsRepository } from '@domain/repositories/ISettingsRepository';
import type { EventsShareFile, ExportOptions } from '@domain/entities/EventsShareFile';
import { filterEventsByCategories, filterEventsByDateRange } from '@domain/rules/shareRules';

export class ExportEvents {
  constructor(
    private readonly eventsRepository: IEventsRepository,
    private readonly settingsRepository: ISettingsRepository,
  ) {}

  async execute(options: ExportOptions): Promise<EventsShareFile> {
    const data = await this.eventsRepository.getEvents();
    const events = data?.events ?? [];
    const allCategories = data?.categories ?? [];
    const settings = await this.settingsRepository.getSettings();

    // 1. Filter by selected categories
    let filtered = filterEventsByCategories(events, options.categoryIds);

    // 2. Filter by date range
    if (options.dateRange !== 'all') {
      const { startDate, endDate } = this.resolveDateRange(options);
      filtered = filterEventsByDateRange(filtered, startDate, endDate);
    }

    // 3. Collect only categories used by filtered events
    const usedCategoryIds = new Set(filtered.map((e) => e.category));
    const usedCategories = allCategories.filter((c) => usedCategoryIds.has(c.id));

    // 4. Build share file
    return {
      meta: {
        version: '1.0',
        type: 'events',
        createdAt: new Date().toISOString(),
        createdBy: settings?.teacherName ?? '',
        schoolName: settings?.schoolName ?? '',
        description: options.description,
      },
      categories: usedCategories,
      events: filtered,
    };
  }

  private resolveDateRange(options: ExportOptions): { startDate: string; endDate: string } {
    if (options.dateRange === 'custom' && options.startDate && options.endDate) {
      return { startDate: options.startDate, endDate: options.endDate };
    }
    const now = new Date();
    if (options.dateRange === 'month') {
      const y = now.getFullYear();
      const m = now.getMonth();
      const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(y, m + 1, 0).getDate();
      const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      return { startDate: start, endDate: end };
    }
    // semester: 1학기 3~7월, 2학기 9~다음해 2월
    const y = now.getFullYear();
    const m = now.getMonth(); // 0-based
    if (m >= 2 && m <= 6) {
      return { startDate: `${y}-03-01`, endDate: `${y}-07-31` };
    }
    if (m >= 8) {
      return { startDate: `${y}-09-01`, endDate: `${y + 1}-02-28` };
    }
    // Jan-Feb = 2학기 of previous year
    return { startDate: `${y - 1}-09-01`, endDate: `${y}-02-28` };
  }
}
