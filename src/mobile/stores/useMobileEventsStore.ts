import { create } from 'zustand';
import type { SchoolEvent, CategoryItem } from '@domain/entities/SchoolEvent';
import { DEFAULT_CATEGORIES } from '@domain/entities/SchoolEvent';
import { eventsRepository } from '@mobile/di/container';
import { useMobileDriveSyncStore } from '@mobile/stores/useMobileDriveSyncStore';

interface MobileEventsState {
  events: readonly SchoolEvent[];
  categories: readonly CategoryItem[];
  loaded: boolean;
  load: () => Promise<void>;
  reload: () => Promise<void>;
  addEvent: (event: SchoolEvent) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
}

export const useMobileEventsStore = create<MobileEventsState>((set, get) => ({
  events: [],
  categories: DEFAULT_CATEGORIES,
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const data = await eventsRepository.getEvents();
      if (data) {
        set({
          events: data.events ?? [],
          categories: data.categories ?? DEFAULT_CATEGORIES,
          loaded: true,
        });
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

  addEvent: async (event) => {
    const events = [...get().events, event];
    set({ events });
    await eventsRepository.saveEvents({ events, categories: get().categories });
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },

  deleteEvent: async (id) => {
    const events = get().events.filter((e) => e.id !== id);
    set({ events });
    await eventsRepository.saveEvents({ events, categories: get().categories });
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },
}));
