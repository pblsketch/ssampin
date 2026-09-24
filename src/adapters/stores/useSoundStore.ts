import { create } from 'zustand';
import type { SoundSettings } from '@domain/valueObjects/SoundSettings';
import { DEFAULT_SOUND_SETTINGS } from '@domain/valueObjects/SoundSettings';

const STORAGE_KEY = 'sound-settings';

async function readSettings(): Promise<SoundSettings | null> {
  const api = window.electronAPI;
  let raw: string | null = null;
  if (api) {
    raw = await api.readData(STORAGE_KEY);
  } else {
    raw = localStorage.getItem(`ssampin_${STORAGE_KEY}`);
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SoundSettings;
  } catch {
    return null;
  }
}

async function writeSettings(data: SoundSettings): Promise<void> {
  const json = JSON.stringify(data);
  const api = window.electronAPI;
  if (api) {
    await api.writeData(STORAGE_KEY, json);
  } else {
    localStorage.setItem(`ssampin_${STORAGE_KEY}`, json);
  }
}

interface SoundState {
  settings: SoundSettings;
  loaded: boolean;
  load: () => Promise<void>;
  /**
   * 저장된 값을 다시 읽는다. 다른 창(본문 ↔ 팝업)에서 음소거를 바꿨을 때 쓴다.
   * `load` 는 한 번만 읽으므로 창 사이 맞춤에는 이것을 쓴다(ADR-139).
   */
  reload: () => Promise<void>;
  toggleEnabled: () => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
}

export const useSoundStore = create<SoundState>((set, get) => ({
  settings: DEFAULT_SOUND_SETTINGS,
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const data = await readSettings();
      if (data) {
        set({ settings: { ...DEFAULT_SOUND_SETTINGS, ...data }, loaded: true });
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },

  reload: async () => {
    try {
      const data = await readSettings();
      set({
        settings: data ? { ...DEFAULT_SOUND_SETTINGS, ...data } : DEFAULT_SOUND_SETTINGS,
        loaded: true,
      });
    } catch {
      /* 읽지 못하면 지금 값을 그대로 둔다 */
    }
  },

  toggleEnabled: async () => {
    const current = get().settings;
    const next = { ...current, enabled: !current.enabled };
    set({ settings: next });
    await writeSettings(next);
  },

  setVolume: async (volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume));
    const current = get().settings;
    const next = { ...current, volume: clamped };
    set({ settings: next });
    await writeSettings(next);
  },
}));
