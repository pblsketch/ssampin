import { create } from 'zustand';
import type { ToolResult, ToolResultData, ToolResultType } from '@domain/entities/ToolResult';
import { toolResultRepository } from '@adapters/di/container';

const MAX_RESULTS = 200;

interface ToolResultState {
  results: ToolResult[];
  loaded: boolean;
  load: () => Promise<void>;
  getByType: (type: ToolResultType) => ToolResult[];
  addResult: (name: string, toolType: ToolResultType, data: ToolResultData) => Promise<ToolResult>;
  deleteResult: (id: string) => Promise<void>;
}

export const useToolResultStore = create<ToolResultState>((set, get) => ({
  results: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const data = await toolResultRepository.load();
    set({ results: data?.results ? [...data.results] : [], loaded: true });
  },

  getByType: (type) => {
    return get().results.filter((r) => r.toolType === type);
  },

  addResult: async (name, toolType, data) => {
    const result: ToolResult = {
      id: crypto.randomUUID(),
      name,
      toolType,
      data,
      savedAt: new Date().toISOString(),
    };
    const next = [result, ...get().results].slice(0, MAX_RESULTS);
    set({ results: next });
    await toolResultRepository.save({ results: next });
    return result;
  },

  deleteResult: async (id) => {
    const next = get().results.filter((r) => r.id !== id);
    set({ results: next });
    await toolResultRepository.save({ results: next });
  },
}));
