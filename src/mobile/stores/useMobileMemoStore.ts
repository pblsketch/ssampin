import { create } from 'zustand';
import type { Memo } from '@domain/entities/Memo';
import { memoRepository } from '@mobile/di/container';
import { useMobileDriveSyncStore } from '@mobile/stores/useMobileDriveSyncStore';

interface MobileMemoState {
  memos: readonly Memo[];
  loaded: boolean;
  load: () => Promise<void>;
  reload: () => Promise<void>;
  addMemo: (memo: Memo) => Promise<void>;
  updateMemo: (id: string, patch: Partial<Memo>) => Promise<void>;
  deleteMemo: (id: string) => Promise<void>;
}

export const useMobileMemoStore = create<MobileMemoState>((set, get) => ({
  memos: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
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
    set({ loaded: false });
    await get().load();
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
