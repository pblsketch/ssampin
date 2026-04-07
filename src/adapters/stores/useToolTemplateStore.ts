import { create } from 'zustand';
import type { ToolTemplate, ToolTemplateConfig, ToolTemplateType } from '@domain/entities/ToolTemplate';
import { toolTemplateRepository } from '@adapters/di/container';

const MAX_TEMPLATES = 100;

interface ToolTemplateState {
  templates: ToolTemplate[];
  loaded: boolean;
  load: () => Promise<void>;
  getByType: (type: ToolTemplateType) => ToolTemplate[];
  addTemplate: (name: string, toolType: ToolTemplateType, config: ToolTemplateConfig) => Promise<ToolTemplate>;
  updateTemplate: (id: string, changes: { name?: string; config?: ToolTemplateConfig }) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
}

export const useToolTemplateStore = create<ToolTemplateState>((set, get) => ({
  templates: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const data = await toolTemplateRepository.load();
    set({ templates: data?.templates ? [...data.templates] : [], loaded: true });
  },

  getByType: (type) => {
    return get().templates.filter((t) => t.toolType === type);
  },

  addTemplate: async (name, toolType, config) => {
    const now = new Date().toISOString();
    const template: ToolTemplate = {
      id: crypto.randomUUID(),
      name,
      toolType,
      config,
      createdAt: now,
      updatedAt: now,
    };
    const next = [template, ...get().templates].slice(0, MAX_TEMPLATES);
    set({ templates: next });
    await toolTemplateRepository.save({ templates: next });
    return template;
  },

  updateTemplate: async (id, changes) => {
    const next = get().templates.map((t) =>
      t.id === id
        ? { ...t, ...changes, updatedAt: new Date().toISOString() }
        : t,
    );
    set({ templates: next });
    await toolTemplateRepository.save({ templates: next });
  },

  deleteTemplate: async (id) => {
    const next = get().templates.filter((t) => t.id !== id);
    set({ templates: next });
    await toolTemplateRepository.save({ templates: next });
  },
}));
