import type { ExternalCalendarsData } from '@domain/entities/ExternalCalendar';

export interface IExternalCalendarRepository {
  getData(): Promise<ExternalCalendarsData | null>;
  saveData(data: ExternalCalendarsData): Promise<void>;
}
