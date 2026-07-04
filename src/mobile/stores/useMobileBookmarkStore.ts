import { create } from 'zustand';
import type { Bookmark, BookmarkGroup } from '@domain/entities/Bookmark';
import { bookmarkRepository } from '@mobile/di/container';

/**
 * 모바일 즐겨찾기 스토어 — **읽기 전용**.
 *
 * PC 에서 등록/정리한 즐겨찾기를 Drive 동기화로 받아 폰에서 열기만 한다.
 * 그룹/북마크 추가·수정·삭제는 PC 전용이라 여기엔 쓰기 경로가 없다(triggerSaveSync 없음).
 */
interface MobileBookmarkState {
  groups: readonly BookmarkGroup[];
  bookmarks: readonly Bookmark[];
  loaded: boolean;

  load: () => Promise<void>;
  reload: () => Promise<void>;
}

export const useMobileBookmarkStore = create<MobileBookmarkState>((set, get) => ({
  groups: [],
  bookmarks: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const data = await bookmarkRepository.load();
      if (data) {
        set({ groups: data.groups, bookmarks: data.bookmarks, loaded: true });
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },

  reload: async () => {
    set({ loaded: false });
    await get().load();
  },
}));
