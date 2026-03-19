import { create } from 'zustand';
import type { SeatingData } from '@domain/entities/Seating';
import { seatingRepository } from '@mobile/di/container';

interface MobileSeatingState {
  seating: SeatingData;
  loaded: boolean;
  load: () => Promise<void>;
  reload: () => Promise<void>;
}

export const useMobileSeatingStore = create<MobileSeatingState>((set, get) => ({
  seating: {
    rows: 6,
    cols: 6,
    seats: Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => null)),
  },
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const data = await seatingRepository.getSeating();
      if (data) {
        set({ seating: data, loaded: true });
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
