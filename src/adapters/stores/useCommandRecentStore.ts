import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * 명령 팔레트 최근 사용 명령 기록 (LRU).
 *
 * 검색어가 비어 있을 때 '최근' 그룹을 맨 위에 보여줘, 자주 쓰는 명령을 매번 찾지 않도록 한다.
 * 명령 id만 저장하므로 명령 구성이 바뀌어 사라진 id는 노출 시점에 자동으로 걸러진다.
 */

/** '최근' 그룹에 보관·노출할 최대 명령 개수 */
export const MAX_RECENT_COMMANDS = 6;

export interface CommandRecentState {
  /** 최근 실행한 명령 id (최신이 맨 앞). 최대 MAX_RECENT_COMMANDS개. */
  recentIds: string[];
  /** 'Ctrl+K' 첫 사용 안내를 닫았는지 — true면 다시 띄우지 않는다. */
  hintDismissed: boolean;
  /** 명령 실행 기록 — 해당 id를 맨 앞으로 올리고 중복 제거 후 상한 적용. 사용했으니 안내도 닫는다. */
  record: (id: string) => void;
  /** 첫 사용 안내 닫기 */
  dismissHint: () => void;
  /** 전체 초기화 (테스트/디버그용) */
  clear: () => void;
}

export const useCommandRecentStore = create<CommandRecentState>()(
  persist(
    (set) => ({
      recentIds: [],
      hintDismissed: false,

      record: (id) =>
        set((s) => ({
          recentIds: [id, ...s.recentIds.filter((x) => x !== id)].slice(0, MAX_RECENT_COMMANDS),
          hintDismissed: true,
        })),

      dismissHint: () => set({ hintDismissed: true }),

      clear: () => set({ recentIds: [], hintDismissed: false }),
    }),
    {
      name: 'ssampin-command-recent-v1',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({
        recentIds: state.recentIds,
        hintDismissed: state.hintDismissed,
      }),
    },
  ),
);
