import { create } from 'zustand';
import type { DDayItem } from '@domain/entities/DDay';
import { ddayRepository } from '@adapters/di/container';

interface DDayState {
  items: readonly DDayItem[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (item: DDayItem) => Promise<void>;
  update: (id: string, patch: Partial<Omit<DDayItem, 'id' | 'createdAt'>>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
}

export const useDDayStore = create<DDayState>((set, get) => ({
  items: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const data = await ddayRepository.load();
    set({ items: data?.items ? [...data.items] : [], loaded: true });
  },

  add: async (item) => {
    const next = [...get().items, item];
    set({ items: next });
    await ddayRepository.save({ items: next });
  },

  update: async (id, patch) => {
    const next = get().items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    set({ items: next });
    await ddayRepository.save({ items: next });
  },

  remove: async (id) => {
    const next = get().items.filter((i) => i.id !== id);
    set({ items: next });
    await ddayRepository.save({ items: next });
  },

  togglePin: async (id) => {
    const item = get().items.find((i) => i.id === id);
    if (!item) return;
    await get().update(id, { pinned: !item.pinned });
  },
}));
