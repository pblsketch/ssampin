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
