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

  /**
   * 여러 일정을 한 번에 삭제
   */
  async deleteMany(ids: readonly string[]): Promise<number> {
    const data = await this.eventsRepository.getEvents();
    const events = data?.events ?? [];
    const idSet = new Set(ids);

    const updatedEvents = events.filter((e) => !idSet.has(e.id));
    const deletedCount = events.length - updatedEvents.length;

    await this.eventsRepository.saveEvents({
      events: updatedEvents,
      categories: data?.categories,
    });

    return deletedCount;
  }

  /**
   * 특정 카테고리의 모든 일정 삭제
   */
  async deleteByCategory(categoryId: string): Promise<number> {
    const data = await this.eventsRepository.getEvents();
    const events = data?.events ?? [];

    const updatedEvents = events.filter((e) => e.category !== categoryId);
    const deletedCount = events.length - updatedEvents.length;

    await this.eventsRepository.saveEvents({
      events: updatedEvents,
      categories: data?.categories,
    });

    return deletedCount;
  }

  /**
   * 특정 기간의 모든 일정 삭제
   */
  async deleteByDateRange(startDate: string, endDate: string): Promise<number> {
    const data = await this.eventsRepository.getEvents();
    const events = data?.events ?? [];

    const updatedEvents = events.filter((e) => {
      return e.date < startDate || e.date > endDate;
    });
    const deletedCount = events.length - updatedEvents.length;

    await this.eventsRepository.saveEvents({
      events: updatedEvents,
      categories: data?.categories,
    });

    return deletedCount;
  }

  // ─── 카테고리 관리 ─────────────────────────────────

  async getCategories(): Promise<readonly CategoryItem[]> {
    const data = await this.eventsRepository.getEvents();
    const categories = data?.categories;
    return categories && categories.length > 0 ? categories : [...DEFAULT_CATEGORIES];
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

  async updateCategory(
    id: string,
    partial: Partial<Pick<CategoryItem, 'name' | 'color'>>,
  ): Promise<void> {
    const data = await this.eventsRepository.getEvents();
    const categories = data?.categories ?? [...DEFAULT_CATEGORIES];

    const updatedCategories: readonly CategoryItem[] = categories.map((c) =>
      c.id === id ? { ...c, ...partial } : c,
    );
    const updatedData: SchoolEventsData = {
      events: data?.events ?? [],
      categories: updatedCategories,
    };

    await this.eventsRepository.saveEvents(updatedData);
  }

  async reorderCategories(orderedIds: string[]): Promise<void> {
    const data = await this.eventsRepository.getEvents();
    const categories = data?.categories ?? [...DEFAULT_CATEGORIES];

    const orderedSet = new Set(orderedIds);
    const reordered: CategoryItem[] = [];

    // Add categories in the specified order
    for (const id of orderedIds) {
      const category = categories.find((c) => c.id === id);
      if (category) {
        reordered.push(category);
      }
    }

    // Add remaining categories not in orderedIds
    for (const category of categories) {
      if (!orderedSet.has(category.id)) {
        reordered.push(category);
      }
    }

    const updatedData: SchoolEventsData = {
      events: data?.events ?? [],
      categories: reordered as readonly CategoryItem[],
    };

    await this.eventsRepository.saveEvents(updatedData);
  }
}
