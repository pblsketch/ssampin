import { create } from 'zustand';
import type { Bookmark, BookmarkGroup, BookmarkData } from '@domain/entities/Bookmark';
import { bookmarkRepository } from '@adapters/di/container';
import { ManageBookmarks } from '@usecases/bookmark/ManageBookmarks';

interface BookmarkState {
  groups: readonly BookmarkGroup[];
  bookmarks: readonly Bookmark[];
  isLoading: boolean;
  loadAll: () => Promise<void>;
  addBookmark: (input: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateBookmark: (id: string, patch: Partial<Omit<Bookmark, 'id' | 'createdAt'>>) => Promise<void>;
  deleteBookmark: (id: string) => Promise<void>;
  addGroup: (input: Omit<BookmarkGroup, 'id' | 'createdAt'>) => Promise<void>;
  updateGroup: (id: string, patch: Partial<Omit<BookmarkGroup, 'id' | 'createdAt'>>) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  reorderBookmarks: (groupId: string, orderedIds: string[]) => Promise<void>;
  reorderGroups: (orderedIds: string[]) => Promise<void>;
  addDefaultPresets: () => Promise<{ groupCount: number; bookmarkCount: number }>;
  toggleGroupCollapse: (groupId: string) => Promise<void>;
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
  };
});
