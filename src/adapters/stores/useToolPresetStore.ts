import { create } from 'zustand';
import type { ToolPreset, ToolPresetType, ToolPresetsData } from '@domain/entities/ToolPreset';

const STORAGE_KEY = 'tool-presets';

async function readPresets(): Promise<ToolPresetsData | null> {
  const api = window.electronAPI;
  let raw: string | null = null;
  if (api) {
    raw = await api.readData(STORAGE_KEY);
  } else {
    raw = localStorage.getItem(`ssampin_${STORAGE_KEY}`);
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ToolPresetsData;
  } catch {
    return null;
  }
}

async function writePresets(data: ToolPresetsData): Promise<void> {
  const json = JSON.stringify(data);
  const api = window.electronAPI;
  if (api) {
    await api.writeData(STORAGE_KEY, json);
  } else {
    localStorage.setItem(`ssampin_${STORAGE_KEY}`, json);
  }
}

interface ToolPresetState {
  presets: readonly ToolPreset[];
  loaded: boolean;
  load: () => Promise<void>;
  getByType: (type: ToolPresetType) => readonly ToolPreset[];
  addPreset: (name: string, type: ToolPresetType, items: readonly string[]) => Promise<void>;
  deletePreset: (id: string) => Promise<void>;
}

export const useToolPresetStore = create<ToolPresetState>((set, get) => ({
  presets: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const data = await readPresets();
      set({ presets: data?.presets ?? [], loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  getByType: (type) => get().presets.filter((p) => p.type === type),

  addPreset: async (name, type, items) => {
    const now = new Date().toISOString();
    const newPreset: ToolPreset = {
      id: crypto.randomUUID(),
      name,
      type,
      items,
      createdAt: now,
      updatedAt: now,
    };
    const next = [...get().presets, newPreset];
    set({ presets: next });
    await writePresets({ presets: next });
  },

  deletePreset: async (id) => {
    const next = get().presets.filter((p) => p.id !== id);
    set({ presets: next });
    await writePresets({ presets: next });
  },
}));
