import type { Bookmark, BookmarkGroup, BookmarkData } from '@domain/entities/Bookmark';
import type { IBookmarkRepository } from '@domain/repositories/IBookmarkRepository';
import { getDefaultPresets, isDuplicateUrl } from '@domain/rules/bookmarkRules';

export class ManageBookmarks {
  constructor(private readonly repo: IBookmarkRepository) {}

  async loadAll(): Promise<BookmarkData> {
    const data = await this.repo.load();
    return data ?? { groups: [], bookmarks: [] };
  }

  private async saveData(data: BookmarkData): Promise<void> {
    await this.repo.save(data);
  }

  async addBookmark(
    input: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<Bookmark> {
    const data = await this.loadAll();
    const now = new Date().toISOString();
    const bookmark: Bookmark = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    await this.saveData({
      ...data,
      bookmarks: [...data.bookmarks, bookmark],
    });
    return bookmark;
  }

  async updateBookmark(
    id: string,
    patch: Partial<Omit<Bookmark, 'id' | 'createdAt'>>,
  ): Promise<void> {
    const data = await this.loadAll();
    const updatedAt = new Date().toISOString();
    await this.saveData({
      ...data,
      bookmarks: data.bookmarks.map((b) =>
        b.id === id ? { ...b, ...patch, updatedAt } : b,
      ),
    });
  }

  async deleteBookmark(id: string): Promise<void> {
    const data = await this.loadAll();
    await this.saveData({
      ...data,
      bookmarks: data.bookmarks.filter((b) => b.id !== id),
    });
  }

  async addGroup(
    input: Omit<BookmarkGroup, 'id' | 'createdAt'>,
  ): Promise<BookmarkGroup> {
    const data = await this.loadAll();
    const group: BookmarkGroup = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    await this.saveData({
      ...data,
      groups: [...data.groups, group],
    });
    return group;
  }

  async updateGroup(
    id: string,
    patch: Partial<Omit<BookmarkGroup, 'id' | 'createdAt'>>,
  ): Promise<void> {
    const data = await this.loadAll();
    await this.saveData({
      ...data,
      groups: data.groups.map((g) =>
        g.id === id ? { ...g, ...patch } : g,
      ),
    });
  }

  async deleteGroup(id: string): Promise<void> {
    const data = await this.loadAll();
    await this.saveData({
      groups: data.groups.filter((g) => g.id !== id),
      bookmarks: data.bookmarks.filter((b) => b.groupId !== id),
    });
  }

  async reorderBookmarks(
    groupId: string,
    orderedIds: string[],
  ): Promise<void> {
    const data = await this.loadAll();
    const updatedAt = new Date().toISOString();
    const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
    await this.saveData({
      ...data,
      bookmarks: data.bookmarks.map((b) => {
        if (b.groupId === groupId && orderMap.has(b.id)) {
          return { ...b, order: orderMap.get(b.id)!, updatedAt };
        }
        return b;
      }),
    });
  }

  async reorderGroups(orderedIds: string[]): Promise<void> {
    const data = await this.loadAll();
    const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
    await this.saveData({
      ...data,
      groups: data.groups.map((g) =>
        orderMap.has(g.id) ? { ...g, order: orderMap.get(g.id)! } : g,
      ),
    });
  }

  async addDefaultPresets(): Promise<{ groupCount: number; bookmarkCount: number }> {
    const data = await this.loadAll();
    const presets = getDefaultPresets();

    // 기존 그룹 ID 세트
    const existingGroupIds = new Set(data.groups.map((g) => g.id));
    const newGroups = presets.groups.filter((g) => !existingGroupIds.has(g.id));

    // 중복 URL 스킵
    const newBookmarks = presets.bookmarks.filter(
      (b) => !isDuplicateUrl(data.bookmarks, b.url),
    );

    // 기존 그룹/북마크 order 뒤에 추가
    const maxGroupOrder = data.groups.length > 0
      ? Math.max(...data.groups.map((g) => g.order)) + 1
      : 0;

    const adjustedGroups = newGroups.map((g, i) => ({
      ...g,
      order: maxGroupOrder + i,
    }));

    await this.saveData({
      groups: [...data.groups, ...adjustedGroups],
      bookmarks: [...data.bookmarks, ...newBookmarks],
    });

    return {
      groupCount: adjustedGroups.length,
      bookmarkCount: newBookmarks.length,
    };
  }
}
