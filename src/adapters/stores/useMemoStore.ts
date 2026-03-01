import { create } from 'zustand';
import type { Memo } from '@domain/entities/Memo';
import type { MemoColor } from '@domain/valueObjects/MemoColor';
import { memoRepository } from '@adapters/di/container';
import { ManageMemos } from '@usecases/memo/ManageMemos';

interface MemoState {
  memos: readonly Memo[];
  loaded: boolean;
  load: () => Promise<void>;
  addMemo: (content: string, color: MemoColor) => Promise<void>;
  updateMemo: (id: string, content: string) => Promise<void>;
  updatePosition: (id: string, x: number, y: number) => Promise<void>;
  updateColor: (id: string, color: MemoColor) => Promise<void>;
  deleteMemo: (id: string) => Promise<void>;
  bringToFront: (id: string) => void;
  arrangeInGrid: (canvasWidth: number) => Promise<void>;
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
        const migrated = memos.map((m) =>
          m.x === undefined || m.y === undefined
            ? { ...m, x: m.x ?? 40 + Math.random() * 200, y: m.y ?? 40 + Math.random() * 200, rotation: m.rotation ?? randomRotation() }
            : m,
        );
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
        id: crypto.randomUUID(),
        content,
        color,
        x,
        y,
        rotation: randomRotation(),
        createdAt: now,
        updatedAt: now,
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

    deleteMemo: async (id) => {
      await manageMemos.delete(id);
      set((state) => ({
        memos: state.memos.filter((memo) => memo.id !== id),
      }));
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

      const CARD_WIDTH = 220; // assumed avg card width + gap
      const CARD_HEIGHT = 200; // avg card height + gap
      const START_X = 40;
      const START_Y = 40;

      const cols = Math.max(1, Math.floor((canvasWidth - START_X) / CARD_WIDTH));

      const updatedMemos = state.memos.map((memo, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const newX = START_X + col * CARD_WIDTH;
        const newY = START_Y + row * CARD_HEIGHT;
        return { ...memo, x: newX, y: newY, rotation: 0 };
      });

      set({ memos: updatedMemos });

      // Save all updated
      const now = new Date().toISOString();
      for (const memo of updatedMemos) {
        await manageMemos.update({ ...memo, updatedAt: now });
      }
    },
  };
});
