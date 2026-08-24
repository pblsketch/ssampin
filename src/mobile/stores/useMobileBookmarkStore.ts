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

  /**
   * @param force true면 이미 읽었어도 다시 읽는다. **`loaded`를 false로 되돌리지 않는다.**
   */
  load: (force?: boolean) => Promise<void>;
  /**
   * 백그라운드 동기화(앱 복귀·네트워크 복구)가 부르는 조용한 갱신.
   *
   * ⚠️ 여기서 `loaded:false`를 떨어뜨리면 안 된다 — 화면들이 `!loaded`일 때 스피너로
   * 갈아끼우므로, 동기화가 도는 순간 **열려 있던 입력창·시트가 통째로 언마운트**되고
   * 타이핑이 사라진다. 스크롤 위치와 서브탭 선택도 함께 날아간다.
   * 잠금 장치: `scripts/regression-grep-check.mjs` REGRESSION #63
   */
  reload: () => Promise<void>;
}

export const useMobileBookmarkStore = create<MobileBookmarkState>((set, get) => ({
  groups: [],
  bookmarks: [],
  loaded: false,

  load: async (force = false) => {
    if (!force && get().loaded) return;
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
    await get().load(true);
  },
}));
