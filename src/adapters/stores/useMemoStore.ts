import { create } from 'zustand';
import type { Memo } from '@domain/entities/Memo';
import type { MemoColor } from '@domain/valueObjects/MemoColor';
import type { MemoFontSize } from '@domain/valueObjects/MemoFontSize';
import { DEFAULT_MEMO_FONT_SIZE } from '@domain/valueObjects/MemoFontSize';
import { MEMO_IMAGE_LIMITS, isAllowedMemoImageMime } from '@domain/valueObjects/MemoImage';
import type { MemoImage } from '@domain/valueObjects/MemoImage';
import { resizeImageBlob } from '@domain/utils/imageResize';
import { MEMO_SIZE } from '@domain/rules/memoRules';
import { memoRepository } from '@adapters/di/container';
import { ManageMemos } from '@usecases/memo/ManageMemos';
import { generateUUID } from '@infrastructure/utils/uuid';

interface MemoState {
  memos: readonly Memo[];
  loaded: boolean;
  load: () => Promise<void>;
  addMemo: (content: string, color: MemoColor) => Promise<void>;
  updateMemo: (id: string, content: string) => Promise<void>;
  updatePosition: (id: string, x: number, y: number) => Promise<void>;
  updateColor: (id: string, color: MemoColor) => Promise<void>;
  updateSize: (id: string, width: number, height: number) => Promise<void>;
  deleteMemo: (id: string) => Promise<void>;
  archiveMemo: (id: string) => Promise<void>;
  unarchiveMemo: (id: string) => Promise<void>;
  bringToFront: (id: string) => void;
  arrangeInGrid: (canvasWidth: number) => Promise<void>;
  updateFontSize: (id: string, fontSize: MemoFontSize) => Promise<void>;
  attachImage: (id: string, blob: Blob, fileName: string) => Promise<{ ok: true } | { ok: false; reason: 'size' | 'mime' | 'decode' }>;
  detachImage: (id: string) => Promise<void>;
}

function randomRotation(): number {
  return Math.round((Math.random() * 6 - 3) * 10) / 10;
}

export const useMemoStore = create<MemoState>((set, get) => {
  const manageMemos = new ManageMemos(memoRepository);

  return {
    memos: [],
    loaded: false,

    load: async () => {
      if (get().loaded) return;
      try {
        const memos = await manageMemos.getAll();
        const migrated = memos.map((m) => ({
          ...m,
          x: m.x ?? 40 + Math.random() * 200,
          y: m.y ?? 40 + Math.random() * 200,
          width: m.width ?? MEMO_SIZE.DEFAULT_WIDTH,
          height: m.height ?? MEMO_SIZE.DEFAULT_HEIGHT,
          rotation: m.rotation ?? randomRotation(),
          archived: m.archived ?? false,
          fontSize: m.fontSize ?? DEFAULT_MEMO_FONT_SIZE,
        }));
        set({ memos: migrated, loaded: true });
      } catch {
        set({ loaded: true });
      }
    },

    addMemo: async (content, color) => {
      const now = new Date().toISOString();
      const existing = get().memos;
      const x = 40 + (existing.length % 4) * 220 + Math.random() * 40;
      const y = 40 + Math.floor(existing.length / 4) * 200 + Math.random() * 40;
      const newMemo: Memo = {
        id: generateUUID(),
        content,
        color,
        x,
        y,
        width: MEMO_SIZE.DEFAULT_WIDTH,
        height: MEMO_SIZE.DEFAULT_HEIGHT,
        rotation: randomRotation(),
        createdAt: now,
        updatedAt: now,
        archived: false,
        fontSize: DEFAULT_MEMO_FONT_SIZE,
      };
      await manageMemos.add(newMemo);
      set((state) => ({ memos: [...state.memos, newMemo] }));
    },

    updateMemo: async (id, content) => {
      const updatedAt = new Date().toISOString();
      set((state) => ({
        memos: state.memos.map((memo) =>
          memo.id === id ? { ...memo, content, updatedAt } : memo,
        ),
      }));
      const existing = get().memos.find((memo) => memo.id === id);
      if (existing !== undefined) {
        await manageMemos.update({ ...existing, content, updatedAt });
      }
    },

    updatePosition: async (id, x, y) => {
      const updatedAt = new Date().toISOString();
      set((state) => ({
        memos: state.memos.map((memo) =>
          memo.id === id ? { ...memo, x, y, updatedAt } : memo,
        ),
      }));
      const existing = get().memos.find((memo) => memo.id === id);
      if (existing !== undefined) {
        await manageMemos.update({ ...existing, x, y, updatedAt });
      }
    },

    updateColor: async (id, color) => {
      const updatedAt = new Date().toISOString();
      set((state) => ({
        memos: state.memos.map((memo) =>
          memo.id === id ? { ...memo, color, updatedAt } : memo,
        ),
      }));
      const existing = get().memos.find((memo) => memo.id === id);
      if (existing !== undefined) {
        await manageMemos.update({ ...existing, color, updatedAt });
      }
    },

    updateSize: async (id, width, height) => {
      const updatedAt = new Date().toISOString();
      set((state) => ({
        memos: state.memos.map((memo) =>
          memo.id === id ? { ...memo, width, height, updatedAt } : memo,
        ),
      }));
      const existing = get().memos.find((memo) => memo.id === id);
      if (existing !== undefined) {
        await manageMemos.update({ ...existing, width, height, updatedAt });
      }
    },

    deleteMemo: async (id) => {
      await manageMemos.delete(id);
      set((state) => ({
        memos: state.memos.filter((memo) => memo.id !== id),
      }));
    },

    archiveMemo: async (id) => {
      const updatedAt = new Date().toISOString();
      set((state) => ({
        memos: state.memos.map((memo) =>
          memo.id === id ? { ...memo, archived: true, updatedAt } : memo,
        ),
      }));
      const existing = get().memos.find((memo) => memo.id === id);
      if (existing !== undefined) {
        await manageMemos.update({ ...existing, archived: true, updatedAt });
      }
    },

    unarchiveMemo: async (id) => {
      const updatedAt = new Date().toISOString();
      set((state) => ({
        memos: state.memos.map((memo) =>
          memo.id === id ? { ...memo, archived: false, updatedAt } : memo,
        ),
      }));
      const existing = get().memos.find((memo) => memo.id === id);
      if (existing !== undefined) {
        await manageMemos.update({ ...existing, archived: false, updatedAt });
      }
    },

    bringToFront: (id) => {
      set((state) => {
        const idx = state.memos.findIndex((m) => m.id === id);
        if (idx === -1 || idx === state.memos.length - 1) return state;
        const newMemos = [...state.memos];
        const [memo] = newMemos.splice(idx, 1);
        if (memo !== undefined) {
          newMemos.push(memo);
        }
        return { memos: newMemos };
      });
    },

    arrangeInGrid: async (canvasWidth) => {
      const state = get();
      if (state.memos.length === 0) return;

      const GAP = 40;
      const START_X = 40;
      const START_Y = 40;

      // 평균 카드 너비 기반으로 열 수 계산
      const avgWidth = state.memos.reduce((sum, m) => sum + (m.width ?? MEMO_SIZE.DEFAULT_WIDTH), 0) / state.memos.length;
      const cols = Math.max(1, Math.floor((canvasWidth - START_X) / (avgWidth + GAP)));

      // 행별로 메모 분배
      const rows: Memo[][] = [];
      state.memos.forEach((memo, index) => {
        const rowIdx = Math.floor(index / cols);
        if (!rows[rowIdx]) rows[rowIdx] = [];
        rows[rowIdx]!.push(memo);
      });

      const updatedMemos = state.memos.map((memo, index) => {
        const col = index % cols;
        const rowIdx = Math.floor(index / cols);

        const newX = START_X + col * (avgWidth + GAP);
        // 이전 행들의 최대 높이 합산
        let newY = START_Y;
        for (let r = 0; r < rowIdx; r++) {
          const rowMemos = rows[r] ?? [];
          const maxHeight = Math.max(...rowMemos.map(m => m.height ?? MEMO_SIZE.DEFAULT_HEIGHT));
          newY += maxHeight + GAP;
        }

        return { ...memo, x: newX, y: newY, rotation: 0 };
      });

      set({ memos: updatedMemos });

      const now = new Date().toISOString();
      for (const memo of updatedMemos) {
        await manageMemos.update({ ...memo, updatedAt: now });
      }
    },

    updateFontSize: async (id, fontSize) => {
      const updatedAt = new Date().toISOString();
      set((state) => ({
        memos: state.memos.map((memo) =>
          memo.id === id ? { ...memo, fontSize, updatedAt } : memo,
        ),
      }));
      await manageMemos.updateFontSize(id, fontSize);
    },

    attachImage: async (id, blob, fileName) => {
      // 1. 크기 검증
      if (blob.size > MEMO_IMAGE_LIMITS.MAX_SIZE_BYTES) {
        return { ok: false, reason: 'size' };
      }
      // 2. MIME 검증
      if (!isAllowedMemoImageMime(blob.type)) {
        return { ok: false, reason: 'mime' };
      }
      // 3. 리사이즈
      let resized;
      try {
        resized = await resizeImageBlob(blob, blob.type);
      } catch {
        return { ok: false, reason: 'decode' };
      }
      // 4. MemoImage 구성
      const image: MemoImage = {
        dataUrl: resized.dataUrl,
        fileName,
        mimeType: resized.mimeType,
        width: resized.width,
        height: resized.height,
        originalSize: blob.size,
      };
      const updatedAt = new Date().toISOString();
      set((state) => ({
        memos: state.memos.map((memo) =>
          memo.id === id ? { ...memo, image, updatedAt } : memo,
        ),
      }));
      await manageMemos.attachImage(id, image);
      return { ok: true };
    },

    detachImage: async (id) => {
      const updatedAt = new Date().toISOString();
      set((state) => ({
        memos: state.memos.map((memo) => {
          if (memo.id !== id) return memo;
          const { image: _removed, ...rest } = memo;
          return { ...rest, updatedAt };
        }),
      }));
      await manageMemos.detachImage(id);
    },
  };
});
