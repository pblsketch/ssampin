import { describe, it, expect, beforeEach } from 'vitest';
import type { BookmarkData } from '@domain/entities/Bookmark';
import type { IBookmarkRepository } from '@domain/repositories/IBookmarkRepository';
import { ManageBookmarks } from './ManageBookmarks';

class InMemoryRepo implements IBookmarkRepository {
  data: BookmarkData = { groups: [], bookmarks: [] };
  async load(): Promise<BookmarkData | null> {
    return this.data;
  }
  async save(data: BookmarkData): Promise<void> {
    this.data = data;
  }
}

describe('ManageBookmarks (Tier 2 features)', () => {
  let repo: InMemoryRepo;
  let manage: ManageBookmarks;

  beforeEach(() => {
    repo = new InMemoryRepo();
    manage = new ManageBookmarks(repo);
  });

  describe('recordClick', () => {
    it('initializes lastClickedAt and sets clickCount=1', async () => {
      await manage.addGroup({ name: 'g', emoji: '📁', order: 0, collapsed: false });
      const bookmark = await manage.addBookmark({
        name: 'a', url: 'https://example.com', iconType: 'emoji', iconValue: '🔗',
        groupId: repo.data.groups[0]!.id, order: 0,
      });

      await manage.recordClick(bookmark.id);
      const updated = repo.data.bookmarks.find((b) => b.id === bookmark.id)!;
      expect(updated.clickCount).toBe(1);
      expect(updated.lastClickedAt).toBeDefined();
    });

    it('increments existing clickCount', async () => {
      await manage.addGroup({ name: 'g', emoji: '📁', order: 0, collapsed: false });
      const bookmark = await manage.addBookmark({
        name: 'a', url: 'https://example.com', iconType: 'emoji', iconValue: '🔗',
        groupId: repo.data.groups[0]!.id, order: 0,
      });
      await manage.recordClick(bookmark.id);
      await manage.recordClick(bookmark.id);
      await manage.recordClick(bookmark.id);
      expect(repo.data.bookmarks[0]!.clickCount).toBe(3);
    });
  });

  describe('updateOgMeta', () => {
    it('sets OG fields and ogFetchedAt', async () => {
      await manage.addGroup({ name: 'g', emoji: '📁', order: 0, collapsed: false });
      const bookmark = await manage.addBookmark({
        name: 'a', url: 'https://example.com', iconType: 'emoji', iconValue: '🔗',
        groupId: repo.data.groups[0]!.id, order: 0,
      });
      await manage.updateOgMeta(bookmark.id, {
        ogTitle: 'Title',
        ogDescription: 'Desc',
        ogImageUrl: 'https://example.com/img.png',
      });
      const updated = repo.data.bookmarks[0]!;
      expect(updated.ogTitle).toBe('Title');
      expect(updated.ogDescription).toBe('Desc');
      expect(updated.ogImageUrl).toBe('https://example.com/img.png');
      expect(updated.ogFetchedAt).toBeDefined();
    });
  });

  describe('archiveGroup / unarchiveGroup', () => {
    it('toggles archived state', async () => {
      const group = await manage.addGroup({ name: 'g', emoji: '📁', order: 0, collapsed: false });
      await manage.archiveGroup(group.id);
      expect(repo.data.groups[0]!.archived).toBe(true);
      expect(repo.data.groups[0]!.archivedAt).toBeDefined();

      await manage.unarchiveGroup(group.id);
      expect(repo.data.groups[0]!.archived).toBe(false);
      expect(repo.data.groups[0]!.archivedAt).toBeUndefined();
    });
  });

  describe('exportData', () => {
    beforeEach(async () => {
      await manage.addGroup({ name: 'A', emoji: '📁', order: 0, collapsed: false });
      await manage.addGroup({ name: 'B', emoji: '📁', order: 1, collapsed: false });
      const [g1, g2] = repo.data.groups;
      await manage.addBookmark({
        name: 'a1', url: 'https://example.com/a1', iconType: 'emoji', iconValue: '🔗',
        groupId: g1!.id, order: 0,
      });
      await manage.addBookmark({
        name: 'b1', url: 'https://example.com/b1', iconType: 'emoji', iconValue: '🔗',
        groupId: g2!.id, order: 0,
      });
    });

    it('exports all when no groupIds given', async () => {
      const payload = await manage.exportData();
      expect(payload.version).toBe(1);
      expect(payload.groups).toHaveLength(2);
      expect(payload.bookmarks).toHaveLength(2);
    });

    it('exports only selected groups + their bookmarks', async () => {
      const g1 = repo.data.groups[0]!;
      const payload = await manage.exportData([g1.id]);
      expect(payload.groups).toHaveLength(1);
      expect(payload.bookmarks).toHaveLength(1);
      expect(payload.bookmarks[0]!.groupId).toBe(g1.id);
    });
  });

  describe('importData', () => {
    beforeEach(async () => {
      await manage.addGroup({ name: 'Existing', emoji: '📁', order: 0, collapsed: false });
      const g = repo.data.groups[0]!;
      await manage.addBookmark({
        name: 'existing', url: 'https://example.com/dup', iconType: 'emoji', iconValue: '🔗',
        groupId: g.id, order: 0,
      });
    });

    it('skips duplicate URL with skip policy', async () => {
      const g = repo.data.groups[0]!;
      const result = await manage.importData(
        {
          groups: [],
          bookmarks: [
            {
              id: 'imp-1',
              name: 'imported-dup',
              url: 'https://example.com/dup',
              iconType: 'emoji',
              iconValue: '🔗',
              groupId: g.id,
              order: 0,
              createdAt: '',
              updatedAt: '',
            },
          ],
        },
        'skip',
      );
      expect(result.bookmarksAdded).toBe(0);
      expect(result.bookmarksSkipped).toBe(1);
      expect(repo.data.bookmarks[0]!.name).toBe('existing'); // unchanged
    });

    it('updates duplicate URL with overwrite policy', async () => {
      const g = repo.data.groups[0]!;
      const result = await manage.importData(
        {
          groups: [],
          bookmarks: [
            {
              id: 'imp-1',
              name: 'updated-name',
              url: 'https://example.com/dup',
              iconType: 'emoji',
              iconValue: '🎯',
              groupId: g.id,
              order: 0,
              createdAt: '',
              updatedAt: '',
              ogTitle: 'New OG',
            },
          ],
        },
        'overwrite',
      );
      expect(result.bookmarksUpdated).toBe(1);
      expect(repo.data.bookmarks[0]!.name).toBe('updated-name');
      expect(repo.data.bookmarks[0]!.ogTitle).toBe('New OG');
      expect(repo.data.bookmarks[0]!.iconValue).toBe('🎯');
    });

    it('merges groups by name (no duplicate group)', async () => {
      const result = await manage.importData(
        {
          groups: [
            { id: 'foreign-id', name: 'Existing', emoji: '📚', order: 0, collapsed: false, createdAt: '' },
          ],
          bookmarks: [],
        },
        'skip',
      );
      expect(result.groupsMerged).toBe(1);
      expect(result.groupsAdded).toBe(0);
      expect(repo.data.groups).toHaveLength(1);
    });

    it('adds new groups when no name match', async () => {
      const result = await manage.importData(
        {
          groups: [
            { id: 'new-1', name: 'Brand New', emoji: '✨', order: 0, collapsed: false, createdAt: '' },
          ],
          bookmarks: [],
        },
        'skip',
      );
      expect(result.groupsAdded).toBe(1);
      expect(repo.data.groups).toHaveLength(2);
    });

    it('routes incoming bookmark to merged group', async () => {
      const result = await manage.importData(
        {
          groups: [
            { id: 'foreign', name: 'Existing', emoji: '📚', order: 0, collapsed: false, createdAt: '' },
          ],
          bookmarks: [
            {
              id: 'imp',
              name: 'fresh',
              url: 'https://example.com/fresh',
              iconType: 'emoji',
              iconValue: '🔗',
              groupId: 'foreign',
              order: 0,
              createdAt: '',
              updatedAt: '',
            },
          ],
        },
        'skip',
      );
      expect(result.bookmarksAdded).toBe(1);
      expect(result.groupsMerged).toBe(1);
      const fresh = repo.data.bookmarks.find((b) => b.url === 'https://example.com/fresh');
      expect(fresh?.groupId).toBe(repo.data.groups[0]!.id); // mapped to existing
    });
  });
});
