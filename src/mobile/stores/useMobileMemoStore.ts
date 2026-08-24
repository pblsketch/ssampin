import { create } from 'zustand';
import type { Memo } from '@domain/entities/Memo';
import { memoRepository } from '@mobile/di/container';
import { useMobileDriveSyncStore } from '@mobile/stores/useMobileDriveSyncStore';

interface MobileMemoState {
  memos: readonly Memo[];
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
  addMemo: (memo: Memo) => Promise<void>;
  updateMemo: (id: string, patch: Partial<Memo>) => Promise<void>;
  deleteMemo: (id: string) => Promise<void>;
}

export const useMobileMemoStore = create<MobileMemoState>((set, get) => ({
  memos: [],
  loaded: false,

  load: async (force = false) => {
    if (!force && get().loaded) return;
    try {
      const data = await memoRepository.getMemos();
      if (data?.memos) {
        set({ memos: data.memos, loaded: true });
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

  addMemo: async (memo) => {
    const memos = [...get().memos, memo];
    set({ memos });
    await memoRepository.saveMemos({ memos });
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },

  updateMemo: async (id, patch) => {
    const memos = get().memos.map((m) =>
      m.id === id ? { ...m, ...patch, updatedAt: new Date().toISOString() } : m,
    );
    set({ memos });
    await memoRepository.saveMemos({ memos });
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },

  deleteMemo: async (id) => {
    const memos = get().memos.filter((m) => m.id !== id);
    set({ memos });
    await memoRepository.saveMemos({ memos });
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },
}));
