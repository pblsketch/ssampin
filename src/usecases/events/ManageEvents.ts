import type {
  SchoolEvent,
  SchoolEventsData,
  CategoryItem,
} from '@domain/entities/SchoolEvent';
import { DEFAULT_CATEGORIES } from '@domain/entities/SchoolEvent';
import type { IEventsRepository } from '@domain/repositories/IEventsRepository';

export class ManageEvents {
  constructor(private readonly eventsRepository: IEventsRepository) {}

  // ─── 이벤트 CRUD ──────────────────────────────────

  async getAll(): Promise<readonly SchoolEvent[]> {
    const data = await this.eventsRepository.getEvents();
    return data?.events ?? [];
  }

  async add(event: SchoolEvent): Promise<void> {
    const data = await this.eventsRepository.getEvents();
    const events = data?.events ?? [];

    const updatedEvents: readonly SchoolEvent[] = [...events, event];
    const updatedData: SchoolEventsData = {
      events: updatedEvents,
      categories: data?.categories,
    };

    await this.eventsRepository.saveEvents(updatedData);
  }

  async update(event: SchoolEvent): Promise<void> {
    const data = await this.eventsRepository.getEvents();
    const events = data?.events ?? [];

    const updatedEvents: readonly SchoolEvent[] = events.map((e) =>
      e.id === event.id ? event : e,
    );
    const updatedData: SchoolEventsData = {
      events: updatedEvents,
      categories: data?.categories,
    };

    await this.eventsRepository.saveEvents(updatedData);
  }

  async delete(id: string): Promise<void> {
    const data = await this.eventsRepository.getEvents();
    const events = data?.events ?? [];

    const updatedEvents: readonly SchoolEvent[] = events.filter(
      (e) => e.id !== id,
    );
    const updatedData: SchoolEventsData = {
      events: updatedEvents,
      categories: data?.categories,
    };

    await this.eventsRepository.saveEvents(updatedData);
  }

  // ─── 카테고리 관리 ─────────────────────────────────

  async getCategories(): Promise<readonly CategoryItem[]> {
    const data = await this.eventsRepository.getEvents();
    return data?.categories ?? [...DEFAULT_CATEGORIES];
  }

  async addCategory(category: CategoryItem): Promise<void> {
    const data = await this.eventsRepository.getEvents();
    const categories = data?.categories ?? [...DEFAULT_CATEGORIES];

    const updatedCategories: readonly CategoryItem[] = [...categories, category];
    const updatedData: SchoolEventsData = {
      events: data?.events ?? [],
      categories: updatedCategories,
    };

    await this.eventsRepository.saveEvents(updatedData);
  }

  async deleteCategory(id: string): Promise<void> {
    const data = await this.eventsRepository.getEvents();
    const categories = data?.categories ?? [...DEFAULT_CATEGORIES];

    const updatedCategories: readonly CategoryItem[] = categories.filter(
      (c) => c.id !== id,
    );
    const updatedData: SchoolEventsData = {
      events: data?.events ?? [],
      categories: updatedCategories,
    };

    await this.eventsRepository.saveEvents(updatedData);
  }
}
