import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IEventsRepository } from '@domain/repositories/IEventsRepository';
import type { SchoolEventsData } from '@domain/entities/SchoolEvent';

export class JsonEventsRepository implements IEventsRepository {
  constructor(private readonly storage: IStoragePort) {}

  getEvents(): Promise<SchoolEventsData | null> {
    return this.storage.read<SchoolEventsData>('events');
  }

  saveEvents(data: SchoolEventsData): Promise<void> {
    return this.storage.write('events', data);
  }
}
