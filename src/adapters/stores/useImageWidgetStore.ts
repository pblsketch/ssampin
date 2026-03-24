import { create } from 'zustand';
import type { ImageWidgetData } from '@domain/entities/ImageWidget';
import { DEFAULT_IMAGE_WIDGET_DATA } from '@domain/entities/ImageWidget';
import { imageWidgetRepository } from '@adapters/di/container';

interface ImageWidgetState {
  widgets: Record<string, ImageWidgetData>;
  loaded: boolean;

  load: () => Promise<void>;
  setImage: (widgetId: string, imageUrl: string, fileName?: string) => Promise<void>;
  updateSettings: (widgetId: string, patch: Partial<ImageWidgetData>) => Promise<void>;
  removeImage: (widgetId: string) => Promise<void>;
  getWidgetData: (widgetId: string) => ImageWidgetData;
}

export const useImageWidgetStore = create<ImageWidgetState>((set, get) => ({
  widgets: {},
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const data = await imageWidgetRepository.getAll();
      set({ widgets: data?.widgets ?? {}, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  setImage: async (widgetId, imageUrl, fileName) => {
    const widgets = { ...get().widgets };
    widgets[widgetId] = {
      ...(widgets[widgetId] ?? DEFAULT_IMAGE_WIDGET_DATA),
      imageUrl,
      fileName,
    };
    set({ widgets });
    await imageWidgetRepository.save({ widgets });
  },

  updateSettings: async (widgetId, patch) => {
    const widgets = { ...get().widgets };
    widgets[widgetId] = {
      ...(widgets[widgetId] ?? DEFAULT_IMAGE_WIDGET_DATA),
      ...patch,
    };
    set({ widgets });
    await imageWidgetRepository.save({ widgets });
  },

  removeImage: async (widgetId) => {
    const widgets = { ...get().widgets };
    if (widgets[widgetId]) {
      widgets[widgetId] = { ...widgets[widgetId]!, imageUrl: null, fileName: undefined };
    }
    set({ widgets });
    await imageWidgetRepository.save({ widgets });
  },

  getWidgetData: (widgetId) => {
    return get().widgets[widgetId] ?? DEFAULT_IMAGE_WIDGET_DATA;
  },
}));
