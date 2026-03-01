import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import type { IEventsRepository } from '@domain/repositories/IEventsRepository';
import { getTodayEvents, getUpcomingEvents } from '@domain/rules/ddayRules';

export interface EventAlertResult {
  readonly todayEvents: readonly SchoolEvent[];
  readonly upcomingEvents: readonly { event: SchoolEvent; dday: number }[];
  readonly hasAlerts: boolean;
}

export class CheckEventAlerts {
  constructor(private readonly eventsRepository: IEventsRepository) {}

  async execute(today: Date): Promise<EventAlertResult> {
    const data = await this.eventsRepository.getEvents();
    const events = data?.events ?? [];

    const todayEvents = getTodayEvents(events, today);
    const upcomingEvents = getUpcomingEvents(events, today);

    return {
      todayEvents,
      upcomingEvents,
      hasAlerts: todayEvents.length > 0 || upcomingEvents.length > 0,
    };
  }
}
