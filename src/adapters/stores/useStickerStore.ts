import { create } from 'zustand';
import type {
  Sticker,
  StickerPack,
  StickerSettings,
  StickersData,
} from '@domain/entities/Sticker';
import { createEmptyStickersData } from '@domain/entities/Sticker';
import { stickerRepository } from '@adapters/di/container';
import { ManageStickers } from '@usecases/sticker/ManageStickers';
import { useToastStore } from '@adapters/components/common/Toast';

interface StickerState {
  data: StickersData;
  loaded: boolean;
  loadingError: string | null;

  load: () => Promise<void>;

  addSticker: (input: {
    /** 사전 발급된 id (atomic 흐름에서 PNG 파일과 metadata id를 일치시키기 위해 사용) */
    id?: string;
    name: string;
    tags: string[];
    packId: string;
    contentHash?: string;
  }) => Promise<Sticker | null>;
  /**
   * 다수 이모티콘 일괄 등록 (시트 분할용 — Phase 2B).
   * 각 input의 contentHash가 중복이면 skipped로만 기록하고 나머지는 등록한다.
   */
  addStickersBulk: (
    inputs: ReadonlyArray<{
      id?: string;
      name: string;
      tags: string[];
      packId: string;
      contentHash?: string;
    }>,
  ) => Promise<{
    stickers: Sticker[];
    skipped: Array<{ index: number; reason: string }>;
  }>;
  updateSticker: (
    id: string,
    patch: Partial<Pick<Sticker, 'name' | 'tags' | 'packId'>>,
  ) => Promise<void>;
  deleteSticker: (id: string) => Promise<void>;
  recordUsage: (id: string) => Promise<void>;

  addPack: (name: string) => Promise<StickerPack | null>;
  renamePack: (id: string, name: string) => Promise<void>;
  deletePack: (id: string) => Promise<void>;
  reorderPacks: (orderedIds: string[]) => Promise<void>;

  updateSettings: (patch: Partial<StickerSettings>) => Promise<void>;
}

/**
 * 변경된 sticker 데이터를 별도 BrowserWindow(피커)에 알리는 헬퍼.
 * Electron이 아니거나 IPC가 미지원이면 silent fail.
 */
function notifyStickerDataChanged(): void {
  try {
    const fn = window.electronAPI?.sticker?.notifyDataChanged;
    if (typeof fn === 'function') {
      void fn().catch(() => {
        // 브로드캐스트 실패는 사용자 흐름을 막지 않음
      });
    }
  } catch {
    // 접근 자체 실패 (예: window.electronAPI undefined) — 무시
  }
}

export const useStickerStore = create<StickerState>((set, get) => {
  const manageStickers = new ManageStickers(stickerRepository);

  return {
    data: createEmptyStickersData(new Date().toISOString()),
    loaded: false,
    loadingError: null,

    load: async () => {
      if (get().loaded) return;
      try {
        const data = await manageStickers.load();
        set({ data, loaded: true, loadingError: null });
      } catch (err) {
        const reason = err instanceof Error ? err.message : '알 수 없는 오류';
        // 콘솔에는 상세 로그를 남기되, UI는 빈 상태로 폴백한다.
        // eslint-disable-next-line no-console
        console.error('[useStickerStore] load 실패:', err);
        set({
          data: createEmptyStickersData(new Date().toISOString()),
          loaded: true,
          loadingError: reason,
        });
      }
    },

    addSticker: async (input) => {
      try {
        const { sticker, data } = await manageStickers.addSticker(input);
        set({ data });
        notifyStickerDataChanged();
        return sticker;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : '이모티콘을 추가하지 못했어요.';
        useToastStore.getState().show(message, 'error');
        return null;
      }
    },

    addStickersBulk: async (inputs) => {
      try {
        const { stickers, data, skipped } =
          await manageStickers.addStickersBulk(inputs);
        set({ data });
        notifyStickerDataChanged();
        return { stickers, skipped };
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : '이모티콘을 일괄 등록하지 못했어요.';
        useToastStore.getState().show(message, 'error');
        return { stickers: [], skipped: [] };
      }
    },

    updateSticker: async (id, patch) => {
      try {
        const data = await manageStickers.updateSticker(id, patch);
        set({ data });
        notifyStickerDataChanged();
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : '이모티콘을 수정하지 못했어요.';
        useToastStore.getState().show(message, 'error');
      }
    },

    deleteSticker: async (id) => {
      try {
        const data = await manageStickers.deleteSticker(id);
        set({ data });
        notifyStickerDataChanged();
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : '이모티콘을 삭제하지 못했어요.';
        useToastStore.getState().show(message, 'error');
      }
    },

    recordUsage: async (id) => {
      try {
        const data = await manageStickers.recordUsage(id);
        set({ data });
        notifyStickerDataChanged();
      } catch (err) {
        // 사용 기록 실패는 사용자 경험을 막지 않도록 콘솔만 남긴다.
        // eslint-disable-next-line no-console
        console.error('[useStickerStore] recordUsage 실패:', err);
      }
    },

    addPack: async (name) => {
      try {
        const { pack, data } = await manageStickers.addPack(name);
        set({ data });
        notifyStickerDataChanged();
        return pack;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : '팩을 추가하지 못했어요.';
        useToastStore.getState().show(message, 'error');
        return null;
      }
    },

    renamePack: async (id, name) => {
      try {
        const data = await manageStickers.renamePack(id, name);
        set({ data });
        notifyStickerDataChanged();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : '팩 이름을 바꾸지 못했어요.';
        useToastStore.getState().show(message, 'error');
      }
    },

    deletePack: async (id) => {
      try {
        const data = await manageStickers.deletePack(id);
        set({ data });
        notifyStickerDataChanged();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : '팩을 삭제하지 못했어요.';
        useToastStore.getState().show(message, 'error');
      }
    },

    reorderPacks: async (orderedIds) => {
      try {
        const data = await manageStickers.reorderPacks(orderedIds);
        set({ data });
        notifyStickerDataChanged();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : '팩 순서를 바꾸지 못했어요.';
        useToastStore.getState().show(message, 'error');
      }
    },

    updateSettings: async (patch) => {
      try {
        const data = await manageStickers.updateSettings(patch);
        set({ data });
        notifyStickerDataChanged();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : '설정을 저장하지 못했어요.';
        useToastStore.getState().show(message, 'error');
      }
    },
  };
});
