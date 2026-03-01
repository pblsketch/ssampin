import type { SchoolEventsData } from '../entities/SchoolEvent';

export interface IEventsRepository {
  getEvents(): Promise<SchoolEventsData | null>;
  saveEvents(data: SchoolEventsData): Promise<void>;
}
