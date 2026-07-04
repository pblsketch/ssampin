/**
 * useMobileBookmarkStore — 모바일 즐겨찾기(읽기 전용) 스토어 단위 테스트.
 *
 * 방어 포인트:
 *   - load 는 저장된 BookmarkData 를 groups/bookmarks 로 매핑한다.
 *   - 저장 데이터가 null(미저장)이어도 안전하게 loaded 처리(빈 목록).
 *   - reload 는 저장소를 다시 읽어 최신 데이터를 반영한다.
 *
 * @mobile/di/container 의 bookmarkRepository 를 인메모리 가짜로 모킹한다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BookmarkData } from '@domain/entities/Bookmark';

const { bookmarkRepoFake } = vi.hoisted(() => {
  const repo: {
    stored: BookmarkData | null;
    load(): Promise<BookmarkData | null>;
    save(data: BookmarkData): Promise<void>;
  } = {
    stored: null,
    async load() {
      return this.stored;
    },
    async save(data) {
      this.stored = data;
    },
  };
  return { bookmarkRepoFake: repo };
});

vi.mock('@mobile/di/container', () => ({
  bookmarkRepository: bookmarkRepoFake,
}));

import { useMobileBookmarkStore } from '../useMobileBookmarkStore';

const DATA: BookmarkData = {
  groups: [
    { id: 'g1', name: '업무', emoji: '📋', order: 0, collapsed: false, createdAt: '2026-01-01' },
  ],
  bookmarks: [
    {
      id: 'b1',
      name: '나이스',
      url: 'https://neis.go.kr',
      iconType: 'emoji',
      iconValue: '🏫',
      groupId: 'g1',
      order: 0,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  ],
};

beforeEach(() => {
  bookmarkRepoFake.stored = null;
  useMobileBookmarkStore.setState({ groups: [], bookmarks: [], loaded: false });
});

describe('useMobileBookmarkStore', () => {
  it('저장된 BookmarkData 를 groups/bookmarks 로 매핑한다', async () => {
    bookmarkRepoFake.stored = DATA;
    await useMobileBookmarkStore.getState().load();
    const state = useMobileBookmarkStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.groups).toHaveLength(1);
    expect(state.bookmarks).toHaveLength(1);
    expect(state.bookmarks[0]!.url).toBe('https://neis.go.kr');
  });

  it('저장 데이터가 null 이어도 안전하게 loaded 처리(빈 목록)', async () => {
    bookmarkRepoFake.stored = null;
    await useMobileBookmarkStore.getState().load();
    const state = useMobileBookmarkStore.getState();
    expect(state.loaded).toBe(true);
    expect(state.groups).toHaveLength(0);
    expect(state.bookmarks).toHaveLength(0);
  });

  it('reload 는 저장소를 다시 읽어 최신 데이터를 반영한다', async () => {
    await useMobileBookmarkStore.getState().load(); // null → 빈 상태
    expect(useMobileBookmarkStore.getState().bookmarks).toHaveLength(0);
    bookmarkRepoFake.stored = DATA;
    await useMobileBookmarkStore.getState().reload();
    expect(useMobileBookmarkStore.getState().bookmarks).toHaveLength(1);
  });
});
