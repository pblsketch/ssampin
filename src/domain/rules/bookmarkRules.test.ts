import { describe, it, expect } from 'vitest';
import type { Bookmark, BookmarkGroup } from '@domain/entities/Bookmark';
import {
  extractDomain,
  recommendGroupId,
  filterBookmarksBySearch,
  findForgottenBookmarks,
  isBookmarkForgotten,
  filterActiveGroups,
  filterArchivedGroups,
  parseBrowserBookmarksHtml,
  normalizeUrl,
  DAYS_FORGOTTEN_THRESHOLD,
} from './bookmarkRules';

const NOW = new Date('2026-04-25T00:00:00.000Z');

function makeGroup(id: string, name: string, archived = false): BookmarkGroup {
  return {
    id,
    name,
    emoji: '📁',
    order: 0,
    collapsed: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    archived: archived || undefined,
  };
}

function makeBookmark(
  id: string,
  url: string,
  groupId: string,
  extra: Partial<Bookmark> = {},
): Bookmark {
  return {
    id,
    name: id,
    url,
    iconType: 'emoji',
    iconValue: '🔗',
    groupId,
    order: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

const PRESET_GROUPS: BookmarkGroup[] = [
  makeGroup('preset-work', '업무'),
  makeGroup('preset-prep', '수업 준비'),
  makeGroup('preset-tools', '수업 도구'),
  makeGroup('preset-ai', 'AI·에듀테크'),
];

describe('extractDomain', () => {
  it('returns hostname without www.', () => {
    expect(extractDomain('https://www.padlet.com')).toBe('padlet.com');
  });

  it('keeps subdomain when not www.', () => {
    expect(extractDomain('https://docs.google.com/spreadsheets/d/abc')).toBe('docs.google.com');
  });

  it('lowercases the hostname', () => {
    expect(extractDomain('https://NEIS.GO.KR')).toBe('neis.go.kr');
  });

  it('returns null for invalid URL', () => {
    expect(extractDomain('not a url')).toBeNull();
    expect(extractDomain('')).toBeNull();
  });
});

describe('recommendGroupId', () => {
  it('matches exact preset domain', () => {
    expect(recommendGroupId('https://padlet.com', PRESET_GROUPS)).toBe('preset-tools');
  });

  it('matches subdomain via parent', () => {
    expect(recommendGroupId('https://www.padlet.com/abc', PRESET_GROUPS)).toBe('preset-tools');
  });

  it('matches docs.google.com to tools (more specific entry)', () => {
    expect(recommendGroupId('https://docs.google.com/sheet', PRESET_GROUPS)).toBe('preset-tools');
  });

  it('returns null when no domain matches', () => {
    expect(recommendGroupId('https://example.com', PRESET_GROUPS)).toBeNull();
  });

  it('returns null when matched group does not exist (user deleted preset)', () => {
    const partial = PRESET_GROUPS.filter((g) => g.id !== 'preset-tools');
    expect(recommendGroupId('https://padlet.com', partial)).toBeNull();
  });

  it('returns null when matched group is archived', () => {
    const archived = PRESET_GROUPS.map((g) =>
      g.id === 'preset-tools' ? makeGroup(g.id, g.name, true) : g,
    );
    expect(recommendGroupId('https://padlet.com', archived)).toBeNull();
  });
});

describe('filterBookmarksBySearch', () => {
  const bookmarks: Bookmark[] = [
    makeBookmark('a', 'https://padlet.com', 'g1', { name: '패들렛' }),
    makeBookmark('b', 'https://canva.com', 'g1', {
      name: '캔바',
      ogTitle: 'Canva — Free Design',
      ogDescription: '디자인 도구',
    }),
    makeBookmark('c', 'https://example.com/foo', 'g1', { name: '기타' }),
  ];

  it('returns all when query empty', () => {
    expect(filterBookmarksBySearch(bookmarks, '')).toHaveLength(3);
    expect(filterBookmarksBySearch(bookmarks, '   ')).toHaveLength(3);
  });

  it('matches name', () => {
    expect(filterBookmarksBySearch(bookmarks, '패들렛').map((b) => b.id)).toEqual(['a']);
  });

  it('matches url', () => {
    expect(filterBookmarksBySearch(bookmarks, 'canva').map((b) => b.id)).toEqual(['b']);
  });

  it('matches ogTitle / ogDescription', () => {
    expect(filterBookmarksBySearch(bookmarks, 'free design').map((b) => b.id)).toEqual(['b']);
    expect(filterBookmarksBySearch(bookmarks, '디자인').map((b) => b.id)).toEqual(['b']);
  });

  it('is case-insensitive', () => {
    expect(filterBookmarksBySearch(bookmarks, 'EXAMPLE').map((b) => b.id)).toEqual(['c']);
  });
});

describe('findForgottenBookmarks', () => {
  function bm(id: string, lastClickedAt: string | undefined, type?: 'url' | 'folder'): Bookmark {
    return makeBookmark(id, `https://example.com/${id}`, 'g1', {
      lastClickedAt,
      ...(type ? { type } : {}),
    });
  }

  it('includes bookmarks with no lastClickedAt', () => {
    const result = findForgottenBookmarks([bm('a', undefined)], { now: NOW });
    expect(result.map((b) => b.id)).toEqual(['a']);
  });

  it('excludes bookmarks recently clicked', () => {
    const recent = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(findForgottenBookmarks([bm('a', recent)], { now: NOW })).toEqual([]);
  });

  it('includes bookmarks older than threshold', () => {
    const old = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const result = findForgottenBookmarks([bm('a', old)], { now: NOW });
    expect(result.map((b) => b.id)).toEqual(['a']);
  });

  it('handles 30-day boundary (DAYS_FORGOTTEN_THRESHOLD)', () => {
    const exactly30Days = new Date(
      NOW.getTime() - DAYS_FORGOTTEN_THRESHOLD * 24 * 60 * 60 * 1000,
    ).toISOString();
    // exactly = NOT forgotten (cutoff is strict <)
    expect(findForgottenBookmarks([bm('a', exactly30Days)], { now: NOW })).toEqual([]);
    const justOver = new Date(
      NOW.getTime() - (DAYS_FORGOTTEN_THRESHOLD * 24 * 60 + 1) * 60 * 1000,
    ).toISOString();
    expect(findForgottenBookmarks([bm('a', justOver)], { now: NOW })).toHaveLength(1);
  });

  it('excludes folder type', () => {
    expect(findForgottenBookmarks([bm('a', undefined, 'folder')], { now: NOW })).toEqual([]);
  });

  it('orders null first, then oldest first', () => {
    const oldest = new Date(NOW.getTime() - 100 * 24 * 60 * 60 * 1000).toISOString();
    const old = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const result = findForgottenBookmarks(
      [bm('older', old), bm('null', undefined), bm('oldest', oldest)],
      { now: NOW },
    );
    expect(result.map((b) => b.id)).toEqual(['null', 'oldest', 'older']);
  });

  it('respects limit', () => {
    const old = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const items = ['a', 'b', 'c', 'd', 'e'].map((id) => bm(id, old));
    expect(findForgottenBookmarks(items, { now: NOW, limit: 2 })).toHaveLength(2);
  });
});

describe('isBookmarkForgotten', () => {
  it('returns true for null lastClickedAt', () => {
    const bm = makeBookmark('a', 'https://example.com', 'g1');
    expect(isBookmarkForgotten(bm, undefined, NOW)).toBe(true);
  });

  it('returns false for folder', () => {
    const bm = makeBookmark('a', 'C:\\folder', 'g1', { type: 'folder' });
    expect(isBookmarkForgotten(bm, undefined, NOW)).toBe(false);
  });

  it('returns false for recent click', () => {
    const recent = new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const bm = makeBookmark('a', 'https://example.com', 'g1', { lastClickedAt: recent });
    expect(isBookmarkForgotten(bm, undefined, NOW)).toBe(false);
  });
});

describe('filterActiveGroups / filterArchivedGroups', () => {
  it('separates groups by archived flag', () => {
    const groups = [
      makeGroup('a', 'A'),
      makeGroup('b', 'B', true),
      makeGroup('c', 'C'),
    ];
    expect(filterActiveGroups(groups).map((g) => g.id)).toEqual(['a', 'c']);
    expect(filterArchivedGroups(groups).map((g) => g.id)).toEqual(['b']);
  });
});

describe('normalizeUrl', () => {
  it('lowercases and strips trailing slashes', () => {
    expect(normalizeUrl('HTTPS://Example.COM/foo/')).toBe('https://example.com/foo');
    expect(normalizeUrl('https://example.com//')).toBe('https://example.com');
  });
});

describe('parseBrowserBookmarksHtml', () => {
  const SAMPLE = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
<DT><H3>업무</H3>
<DL><p>
  <DT><A HREF="https://www.neis.go.kr" ICON="data:...">대국민 나이스</A>
  <DT><A HREF="https://plus.gov.kr">정부24</A>
</DL><p>
<DT><H3>도구</H3>
<DL><p>
  <DT><A HREF="https://canva.com">캔바 &amp; 미리캔버스</A>
</DL><p>
</DL>`;

  it('extracts groups and bookmarks', () => {
    const result = parseBrowserBookmarksHtml(SAMPLE);
    expect(result.groups.map((g) => g.name)).toEqual(['업무', '도구']);
    expect(result.bookmarks).toHaveLength(3);
    expect(result.bookmarks[0]!.url).toBe('https://www.neis.go.kr');
  });

  it('decodes HTML entities in link names', () => {
    const result = parseBrowserBookmarksHtml(SAMPLE);
    const canva = result.bookmarks.find((b) => b.url === 'https://canva.com');
    expect(canva?.name).toBe('캔바 & 미리캔버스');
  });

  it('uses fallback group for top-level links without folder', () => {
    const html = `<DT><A HREF="https://example.com">Bare Link</A>`;
    const result = parseBrowserBookmarksHtml(html);
    expect(result.groups[0]?.id).toBe('imported-default');
    expect(result.bookmarks).toHaveLength(1);
  });

  it('skips invalid URLs', () => {
    const html = `<DT><H3>G</H3><DL>
      <DT><A HREF="javascript:alert(1)">bad</A>
      <DT><A HREF="https://ok.com">ok</A>
    </DL>`;
    const result = parseBrowserBookmarksHtml(html);
    expect(result.bookmarks).toHaveLength(1);
    expect(result.bookmarks[0]!.url).toBe('https://ok.com');
  });
});
