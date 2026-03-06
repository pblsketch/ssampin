import { create } from 'zustand';
import type { ClassRoster, ClassRostersData } from '@domain/entities/ClassRoster';

const STORAGE_KEY = 'class-rosters';

async function readRosters(): Promise<ClassRostersData | null> {
  const api = window.electronAPI;
  let raw: string | null = null;
  if (api) {
    raw = await api.readData(STORAGE_KEY);
  } else {
    raw = localStorage.getItem(`ssampin_${STORAGE_KEY}`);
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ClassRostersData;
  } catch {
    return null;
  }
}

async function writeRosters(data: ClassRostersData): Promise<void> {
  const json = JSON.stringify(data);
  const api = window.electronAPI;
  if (api) {
    await api.writeData(STORAGE_KEY, json);
  } else {
    localStorage.setItem(`ssampin_${STORAGE_KEY}`, json);
  }
}

interface ClassRosterState {
  rosters: readonly ClassRoster[];
  loaded: boolean;
  load: () => Promise<void>;
  addRoster: (name: string, studentNames: readonly string[]) => Promise<ClassRoster>;
  updateRoster: (id: string, name: string, studentNames: readonly string[]) => Promise<void>;
  deleteRoster: (id: string) => Promise<void>;
}

export const useClassRosterStore = create<ClassRosterState>((set, get) => ({
  rosters: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const data = await readRosters();
      set({ rosters: data?.rosters ?? [], loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  addRoster: async (name, studentNames) => {
    const now = new Date().toISOString();
    const newRoster: ClassRoster = {
      id: crypto.randomUUID(),
      name,
      studentNames,
      createdAt: now,
      updatedAt: now,
    };
    const next = [...get().rosters, newRoster];
    set({ rosters: next });
    await writeRosters({ rosters: next });
    return newRoster;
  },

  updateRoster: async (id, name, studentNames) => {
    const now = new Date().toISOString();
    const next = get().rosters.map((r) =>
      r.id === id ? { ...r, name, studentNames, updatedAt: now } : r,
    );
    set({ rosters: next });
    await writeRosters({ rosters: next });
  },

  deleteRoster: async (id) => {
    const next = get().rosters.filter((r) => r.id !== id);
    set({ rosters: next });
    await writeRosters({ rosters: next });
  },
}));
