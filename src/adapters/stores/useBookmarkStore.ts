import { create } from 'zustand';
import type { Bookmark, BookmarkGroup, BookmarkData, BookmarkExportPayload } from '@domain/entities/Bookmark';
import { bookmarkRepository } from '@adapters/di/container';
import {
  ManageBookmarks,
  type ImportConflictPolicy,
  type ImportResult,
  type OgMetaPatch,
} from '@usecases/bookmark/ManageBookmarks';

interface BookmarkState {
  groups: readonly BookmarkGroup[];
  bookmarks: readonly Bookmark[];
  isLoading: boolean;
  loadAll: () => Promise<void>;
  addBookmark: (input: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Bookmark>;
  updateBookmark: (id: string, patch: Partial<Omit<Bookmark, 'id' | 'createdAt'>>) => Promise<void>;
  deleteBookmark: (id: string) => Promise<void>;
  addGroup: (input: Omit<BookmarkGroup, 'id' | 'createdAt'>) => Promise<void>;
  updateGroup: (id: string, patch: Partial<Omit<BookmarkGroup, 'id' | 'createdAt'>>) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  reorderBookmarks: (groupId: string, orderedIds: string[]) => Promise<void>;
  reorderGroups: (orderedIds: string[]) => Promise<void>;
  addDefaultPresets: () => Promise<{ groupCount: number; bookmarkCount: number }>;
  toggleGroupCollapse: (groupId: string) => Promise<void>;
  // Tier 2 액션
  recordClick: (id: string) => Promise<void>;
  updateOgMeta: (id: string, og: OgMetaPatch) => Promise<void>;
  archiveGroup: (id: string) => Promise<void>;
  unarchiveGroup: (id: string) => Promise<void>;
  exportData: (groupIds?: readonly string[]) => Promise<BookmarkExportPayload>;
  importData: (
    payload: { groups: readonly BookmarkGroup[]; bookmarks: readonly Bookmark[] },
    conflictPolicy?: ImportConflictPolicy,
  ) => Promise<ImportResult>;
}

export const useBookmarkStore = create<BookmarkState>((set, get) => {
  const manage = new ManageBookmarks(bookmarkRepository);

  const reload = async (): Promise<BookmarkData> => {
    const data = await manage.loadAll();
    set({ groups: data.groups, bookmarks: data.bookmarks });
    return data;
  };

  return {
    groups: [],
    bookmarks: [],
    isLoading: false,

    loadAll: async () => {
      if (get().isLoading) return;
      set({ isLoading: true });
      try {
        await reload();
      } finally {
        set({ isLoading: false });
      }
    },

    addBookmark: async (input) => {
      const bookmark = await manage.addBookmark(input);
      set((s) => ({ bookmarks: [...s.bookmarks, bookmark] }));
      return bookmark;
    },

    updateBookmark: async (id, patch) => {
      await manage.updateBookmark(id, patch);
      const updatedAt = new Date().toISOString();
      set((s) => ({
        bookmarks: s.bookmarks.map((b) =>
          b.id === id ? { ...b, ...patch, updatedAt } : b,
        ),
      }));
    },

    deleteBookmark: async (id) => {
      await manage.deleteBookmark(id);
      set((s) => ({
        bookmarks: s.bookmarks.filter((b) => b.id !== id),
      }));
    },

    addGroup: async (input) => {
      const group = await manage.addGroup(input);
      set((s) => ({ groups: [...s.groups, group] }));
    },

    updateGroup: async (id, patch) => {
      await manage.updateGroup(id, patch);
      set((s) => ({
        groups: s.groups.map((g) =>
          g.id === id ? { ...g, ...patch } : g,
        ),
      }));
    },

    deleteGroup: async (id) => {
      await manage.deleteGroup(id);
      set((s) => ({
        groups: s.groups.filter((g) => g.id !== id),
        bookmarks: s.bookmarks.filter((b) => b.groupId !== id),
      }));
    },

    reorderBookmarks: async (groupId, orderedIds) => {
      await manage.reorderBookmarks(groupId, orderedIds);
      const updatedAt = new Date().toISOString();
      const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
      set((s) => ({
        bookmarks: s.bookmarks.map((b) => {
          if (b.groupId === groupId && orderMap.has(b.id)) {
            return { ...b, order: orderMap.get(b.id)!, updatedAt };
          }
          return b;
        }),
      }));
    },

    reorderGroups: async (orderedIds) => {
      await manage.reorderGroups(orderedIds);
      const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
      set((s) => ({
        groups: s.groups.map((g) =>
          orderMap.has(g.id) ? { ...g, order: orderMap.get(g.id)! } : g,
        ),
      }));
    },

    addDefaultPresets: async () => {
      const result = await manage.addDefaultPresets();
      await reload();
      return result;
    },

    toggleGroupCollapse: async (groupId) => {
      const group = get().groups.find((g) => g.id === groupId);
      if (!group) return;
      const collapsed = !group.collapsed;
      await manage.updateGroup(groupId, { collapsed });
      set((s) => ({
        groups: s.groups.map((g) =>
          g.id === groupId ? { ...g, collapsed } : g,
        ),
      }));
    },

    recordClick: async (id) => {
      await manage.recordClick(id);
      const now = new Date().toISOString();
      set((s) => ({
        bookmarks: s.bookmarks.map((b) =>
          b.id === id
            ? {
                ...b,
                lastClickedAt: now,
                clickCount: (b.clickCount ?? 0) + 1,
                updatedAt: now,
              }
            : b,
        ),
      }));
    },

    updateOgMeta: async (id, og) => {
      await manage.updateOgMeta(id, og);
      const fetchedAt = new Date().toISOString();
      set((s) => ({
        bookmarks: s.bookmarks.map((b) =>
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
      }));
    },

    archiveGroup: async (id) => {
      const archivedAt = new Date().toISOString();
      await manage.archiveGroup(id);
      set((s) => ({
        groups: s.groups.map((g) =>
          g.id === id ? { ...g, archived: true, archivedAt } : g,
        ),
      }));
    },

    unarchiveGroup: async (id) => {
      await manage.unarchiveGroup(id);
      set((s) => ({
        groups: s.groups.map((g) =>
          g.id === id ? { ...g, archived: false, archivedAt: undefined } : g,
        ),
      }));
    },

    exportData: async (groupIds) => manage.exportData(groupIds),

    importData: async (payload, conflictPolicy = 'skip') => {
      const result = await manage.importData(payload, conflictPolicy);
      await reload();
      return result;
    },
  };
});
