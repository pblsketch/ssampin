import type { Bookmark, BookmarkGroup, BookmarkData, BookmarkExportPayload } from '@domain/entities/Bookmark';
import type { IBookmarkRepository } from '@domain/repositories/IBookmarkRepository';
import { getDefaultPresets, isDuplicateUrl, normalizeUrl } from '@domain/rules/bookmarkRules';
import { generateUUID } from '@infrastructure/utils/uuid';

export interface ImportResult {
  groupsAdded: number;
  groupsMerged: number;
  bookmarksAdded: number;
  bookmarksUpdated: number;
  bookmarksSkipped: number;
}

export type ImportConflictPolicy = 'skip' | 'overwrite';

export interface OgMetaPatch {
  ogTitle?: string;
  ogDescription?: string;
  ogImageUrl?: string;
}

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
      id: generateUUID(),
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
      id: generateUUID(),
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

  /** 카드 클릭 추적 — lastClickedAt 갱신 + clickCount 증가 */
  async recordClick(id: string): Promise<void> {
    const data = await this.loadAll();
    const now = new Date().toISOString();
    await this.saveData({
      ...data,
      bookmarks: data.bookmarks.map((b) =>
        b.id === id
          ? {
              ...b,
              lastClickedAt: now,
              clickCount: (b.clickCount ?? 0) + 1,
              updatedAt: now,
            }
          : b,
      ),
    });
  }

  /** OG 메타 갱신 (북마크 추가/수정 후 비동기 파싱 결과 반영) */
  async updateOgMeta(id: string, og: OgMetaPatch): Promise<void> {
    const data = await this.loadAll();
    const fetchedAt = new Date().toISOString();
    await this.saveData({
      ...data,
      bookmarks: data.bookmarks.map((b) =>
        b.id === id
          ? {
              ...b,
              ogTitle: og.ogTitle,
              ogDescription: og.ogDescription,
              ogImageUrl: og.ogImageUrl,
              ogFetchedAt: fetchedAt,
              updatedAt: fetchedAt,
            }
          : b,
      ),
    });
  }

  async archiveGroup(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.updateGroup(id, { archived: true, archivedAt: now });
  }

  async unarchiveGroup(id: string): Promise<void> {
    await this.updateGroup(id, { archived: false, archivedAt: undefined });
  }

  /** 내보내기 페이로드 생성 — groupIds 미지정 시 전체 */
  async exportData(groupIds?: readonly string[]): Promise<BookmarkExportPayload> {
    const data = await this.loadAll();
    const exportedAt = new Date().toISOString();

    if (!groupIds || groupIds.length === 0) {
      return {
        version: 1,
        exportedAt,
        groups: data.groups,
        bookmarks: data.bookmarks,
      };
    }

    const idSet = new Set(groupIds);
    return {
      version: 1,
      exportedAt,
      groups: data.groups.filter((g) => idSet.has(g.id)),
      bookmarks: data.bookmarks.filter((b) => idSet.has(b.groupId)),
    };
  }

  /**
   * 가져오기 — JSON 페이로드 또는 브라우저 파서 결과를 병합
   * - 그룹: 동일 id 또는 동일 name 매칭 시 기존 그룹에 병합 (새 ID 발급 안 함)
   * - 북마크: 정규화 URL 중복 검사
   *   - 'skip': 중복 시 스킵
   *   - 'overwrite': 중복 시 OG 메타 + name + iconValue 갱신
   * - 새 북마크는 대상 그룹의 기존 max order + 1부터 부여
   */
  async importData(
    payload: { groups: readonly BookmarkGroup[]; bookmarks: readonly Bookmark[] },
    conflictPolicy: ImportConflictPolicy = 'skip',
  ): Promise<ImportResult> {
    const data = await this.loadAll();
    const now = new Date().toISOString();

    const result: ImportResult = {
      groupsAdded: 0,
      groupsMerged: 0,
      bookmarksAdded: 0,
      bookmarksUpdated: 0,
      bookmarksSkipped: 0,
    };

    // 1단계: 그룹 병합 — id → 기존 그룹 매핑
    //   incoming group.id 또는 group.name이 일치하면 기존 그룹 사용
    const existingByName = new Map<string, BookmarkGroup>();
    for (const g of data.groups) existingByName.set(g.name.trim().toLowerCase(), g);
    const existingById = new Map(data.groups.map((g) => [g.id, g]));

    const groupIdRemap = new Map<string, string>(); // incoming id → resolved id
    const newGroups: BookmarkGroup[] = [];

    let nextOrder = data.groups.length > 0
      ? Math.max(...data.groups.map((g) => g.order)) + 1
      : 0;

    for (const inG of payload.groups) {
      const byId = existingById.get(inG.id);
      const byName = existingByName.get(inG.name.trim().toLowerCase());
      const matched = byId ?? byName;
      if (matched) {
        groupIdRemap.set(inG.id, matched.id);
        result.groupsMerged += 1;
      } else {
        const created: BookmarkGroup = {
          ...inG,
          createdAt: inG.createdAt || now,
          order: nextOrder++,
        };
        newGroups.push(created);
        groupIdRemap.set(inG.id, created.id);
        existingById.set(created.id, created);
        existingByName.set(created.name.trim().toLowerCase(), created);
        result.groupsAdded += 1;
      }
    }

    const mergedGroups = [...data.groups, ...newGroups];

    // 2단계: 북마크 병합
    const existingByUrl = new Map<string, Bookmark>();
    for (const b of data.bookmarks) existingByUrl.set(normalizeUrl(b.url), b);

    const updatedBookmarks: Bookmark[] = [...data.bookmarks];
    const orderCursor = new Map<string, number>(); // groupId → next order

    const initOrderCursor = (groupId: string): number => {
      const current = orderCursor.get(groupId);
      if (current !== undefined) return current;
      const groupBookmarks = updatedBookmarks.filter((b) => b.groupId === groupId);
      const next = groupBookmarks.length > 0
        ? Math.max(...groupBookmarks.map((b) => b.order)) + 1
        : 0;
      orderCursor.set(groupId, next);
      return next;
    };

    for (const inB of payload.bookmarks) {
      const targetGroupId = groupIdRemap.get(inB.groupId) ?? inB.groupId;
      // 그룹이 매핑되지 않았다면 새 그룹이 추가되지 않은 채 inB.groupId를 그대로 쓰는 셈.
      // 이 경우 그룹이 없을 수 있으므로 검증.
      if (!existingById.has(targetGroupId)) {
        result.bookmarksSkipped += 1;
        continue;
      }

      const normalized = normalizeUrl(inB.url);
      const existing = existingByUrl.get(normalized);

      if (existing) {
        if (conflictPolicy === 'overwrite') {
          const idx = updatedBookmarks.findIndex((b) => b.id === existing.id);
          if (idx >= 0) {
            const merged: Bookmark = {
              ...updatedBookmarks[idx]!,
              name: inB.name || updatedBookmarks[idx]!.name,
              iconType: inB.iconType,
              iconValue: inB.iconValue,
              ogTitle: inB.ogTitle ?? updatedBookmarks[idx]!.ogTitle,
              ogDescription: inB.ogDescription ?? updatedBookmarks[idx]!.ogDescription,
              ogImageUrl: inB.ogImageUrl ?? updatedBookmarks[idx]!.ogImageUrl,
              ogFetchedAt: inB.ogFetchedAt ?? updatedBookmarks[idx]!.ogFetchedAt,
              updatedAt: now,
            };
            updatedBookmarks[idx] = merged;
            result.bookmarksUpdated += 1;
          }
        } else {
          result.bookmarksSkipped += 1;
        }
      } else {
        const order = initOrderCursor(targetGroupId);
        orderCursor.set(targetGroupId, order + 1);
        const created: Bookmark = {
          ...inB,
          id: generateUUID(),
          groupId: targetGroupId,
          order,
          createdAt: inB.createdAt || now,
          updatedAt: now,
        };
        updatedBookmarks.push(created);
        existingByUrl.set(normalized, created);
        result.bookmarksAdded += 1;
      }
    }

    await this.saveData({
      groups: mergedGroups,
      bookmarks: updatedBookmarks,
    });

    return result;
  }
}
