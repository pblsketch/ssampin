import { create } from 'zustand';
import type { SchoolEvent, CategoryItem } from '@domain/entities/SchoolEvent';
import { DEFAULT_CATEGORIES } from '@domain/entities/SchoolEvent';
import { eventsRepository } from '@mobile/di/container';
import { useMobileDriveSyncStore } from '@mobile/stores/useMobileDriveSyncStore';

interface MobileEventsState {
  events: readonly SchoolEvent[];
  categories: readonly CategoryItem[];
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
  addEvent: (event: SchoolEvent) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
}

export const useMobileEventsStore = create<MobileEventsState>((set, get) => ({
  events: [],
  categories: DEFAULT_CATEGORIES,
  loaded: false,

  load: async (force = false) => {
    if (!force && get().loaded) return;
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
    await get().load(true);
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
