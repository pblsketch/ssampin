import type { SchoolEvent, SchoolEventsData, CategoryItem } from '@domain/entities/SchoolEvent';
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

    const updatedEvents: readonly SchoolEvent[] = events.filter((e) => e.id !== id);
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
   * 여러 일정을 한 번에 숨김 처리 — 중복 일정 정리용.
   *
   * 지우지 않고 숨기는 이유 (2026-08-21) — 이 일정들은 구글·NEIS 에서 자동으로 들어온
   * 사본이라 지워도 다음 동기화 때 되살아난다. 반대로 `isHidden` 은 동기화가 존중하므로
   * (`SyncFromGoogle`, `SyncNeisSchedule` 모두 숨긴 일정은 건드리지 않는다) 다시 나타나지
   * 않는다. 자료를 지우지 않아 되돌리기도 안전하다.
   */
  async hideMany(
    ids: readonly string[],
    reason: NonNullable<SchoolEvent['hiddenReason']> = 'manual',
  ): Promise<number> {
    const data = await this.eventsRepository.getEvents();
    const events = data?.events ?? [];
    const idSet = new Set(ids);
    const hiddenAt = new Date().toISOString();

    let hiddenCount = 0;
    const updatedEvents = events.map((e) => {
      if (!idSet.has(e.id) || e.isHidden) return e;
      hiddenCount += 1;
      return { ...e, isHidden: true, hiddenReason: reason, hiddenAt };
    });

    if (hiddenCount > 0) {
      await this.eventsRepository.saveEvents({
        events: updatedEvents,
        categories: data?.categories,
      });
    }

    return hiddenCount;
  }

  /**
   * 숨긴 일정을 다시 보이게 되돌린다.
   *
   * 숨김 이유·시각도 같이 지운다 — 되돌린 뒤에도 "중복이라 접혔던 것" 딱지가 남아 있으면
   * 다음에 다시 숨길 때 잘못된 이유가 붙는다.
   */
  async unhideMany(ids: readonly string[]): Promise<number> {
    const data = await this.eventsRepository.getEvents();
    const events = data?.events ?? [];
    const idSet = new Set(ids);

    let restoredCount = 0;
    const updatedEvents = events.map((e) => {
      if (!idSet.has(e.id) || !e.isHidden) return e;
      restoredCount += 1;
      const { isHidden: _isHidden, hiddenReason: _reason, hiddenAt: _at, ...rest } = e;
      return rest;
    });

    if (restoredCount > 0) {
      await this.eventsRepository.saveEvents({
        events: updatedEvents,
        categories: data?.categories,
      });
    }

    return restoredCount;
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

    const updatedCategories: readonly CategoryItem[] = categories.filter((c) => c.id !== id);
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
