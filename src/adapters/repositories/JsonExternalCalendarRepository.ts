import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IExternalCalendarRepository } from '@domain/repositories/IExternalCalendarRepository';
import type { ExternalCalendarsData } from '@domain/entities/ExternalCalendar';

export class JsonExternalCalendarRepository implements IExternalCalendarRepository {
  constructor(private readonly storage: IStoragePort) {}

  getData(): Promise<ExternalCalendarsData | null> {
    return this.storage.read<ExternalCalendarsData>('external-calendars');
  }

  saveData(data: ExternalCalendarsData): Promise<void> {
    return this.storage.write('external-calendars', data);
  }
}
