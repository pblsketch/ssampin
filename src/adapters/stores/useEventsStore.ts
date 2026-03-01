import { create } from 'zustand';
import type { EventAlertResult } from '@usecases/events/CheckEventAlerts';
import { CheckEventAlerts } from '@usecases/events/CheckEventAlerts';
import { ManageEvents } from '@usecases/events/ManageEvents';
import type {
  SchoolEvent,
  CategoryItem,
  AlertTiming,
  Recurrence,
} from '@domain/entities/SchoolEvent';
import { DEFAULT_CATEGORIES } from '@domain/entities/SchoolEvent';
import { ExportEvents } from '@usecases/events/ExportEvents';
import { ImportEvents } from '@usecases/events/ImportEvents';
import { validateShareFile } from '@domain/rules/shareRules';
import type {
  EventsShareFile,
  ExportOptions,
  CategoryMapping,
  ImportResult,
  DuplicateStrategy,
} from '@domain/entities/EventsShareFile';
import { eventsRepository, settingsRepository } from '@adapters/di/container';

interface AddEventParams {
  title: string;
  date: string;
  category: string;
  description?: string;
  endDate?: string;
  time?: string;
  location?: string;
  isDDay?: boolean;
  alerts?: readonly AlertTiming[];
  recurrence?: Recurrence;
}

interface EventsState {
  // 일정 목록 상태
  events: readonly SchoolEvent[];
  loaded: boolean;

  // 카테고리
  categories: readonly CategoryItem[];

  // 알림 팝업 상태
  alertResult: EventAlertResult | null;
  showPopup: boolean;

  // 액션
  load: () => Promise<void>;
  addEvent: (params: AddEventParams) => Promise<void>;
  updateEvent: (event: SchoolEvent) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  checkAlerts: () => Promise<void>;
  dismissPopup: () => void;
  snoozePopup: () => void;

  // 카테고리 액션
  addCategory: (name: string, color: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;

  // 공유 상태
  shareFile: EventsShareFile | null;
  showExportModal: boolean;
  showImportModal: boolean;

  // 공유 액션
  exportEvents: (options: ExportOptions) => Promise<EventsShareFile>;
  triggerExport: (shareFile: EventsShareFile) => Promise<boolean>;
  triggerImport: () => Promise<EventsShareFile | null>;
  importEvents: (
    shareFile: EventsShareFile,
    mappings: readonly CategoryMapping[],
    strategy: DuplicateStrategy,
  ) => Promise<ImportResult>;
  setShowExportModal: (show: boolean) => void;
  setShowImportModal: (show: boolean) => void;
  setShareFile: (file: EventsShareFile | null) => void;
}

const POPUP_DISMISSED_KEY = 'ssampin:event-popup-dismissed';
const POPUP_SNOOZED_KEY = 'ssampin:event-popup-snoozed';

function getTodayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isDismissedToday(): boolean {
  return localStorage.getItem(POPUP_DISMISSED_KEY) === getTodayString();
}

function isSnoozed(): boolean {
  const snoozedUntil = localStorage.getItem(POPUP_SNOOZED_KEY);
  if (!snoozedUntil) return false;
  return Date.now() < Number(snoozedUntil);
}

export const useEventsStore = create<EventsState>((set) => {
  const checkEventAlerts = new CheckEventAlerts(eventsRepository);
  const manageEvents = new ManageEvents(eventsRepository);
  const exportEventsUC = new ExportEvents(eventsRepository, settingsRepository);
  const importEventsUC = new ImportEvents(eventsRepository);

  return {
    events: [],
    loaded: false,
    categories: [...DEFAULT_CATEGORIES],
    alertResult: null,
    showPopup: false,
    shareFile: null,
    showExportModal: false,
    showImportModal: false,

    load: async () => {
      const state = useEventsStore.getState();
      if (state.loaded) return;
      const events = await manageEvents.getAll();
      const categories = await manageEvents.getCategories();
      set({ events, categories, loaded: true });
    },

    addEvent: async (params) => {
      const event: SchoolEvent = {
        id: crypto.randomUUID(),
        title: params.title,
        date: params.date,
        category: params.category,
        ...(params.description !== undefined && { description: params.description }),
        ...(params.endDate !== undefined && { endDate: params.endDate }),
        ...(params.time !== undefined && { time: params.time }),
        ...(params.location !== undefined && { location: params.location }),
        ...(params.isDDay !== undefined && { isDDay: params.isDDay }),
        ...(params.alerts !== undefined && params.alerts.length > 0 && { alerts: params.alerts }),
        ...(params.recurrence !== undefined && { recurrence: params.recurrence }),
      };
      await manageEvents.add(event);
      set((state) => ({ events: [...state.events, event] }));
    },

    updateEvent: async (event) => {
      await manageEvents.update(event);
      set((state) => ({
        events: state.events.map((e) => (e.id === event.id ? event : e)),
      }));
    },

    deleteEvent: async (id) => {
      await manageEvents.delete(id);
      set((state) => ({
        events: state.events.filter((e) => e.id !== id),
      }));
    },

    checkAlerts: async () => {
      const today = new Date();
      const result = await checkEventAlerts.execute(today);

      const shouldShow =
        result.hasAlerts && !isDismissedToday() && !isSnoozed();

      set({ alertResult: result, showPopup: shouldShow });
    },

    dismissPopup: () => {
      localStorage.setItem(POPUP_DISMISSED_KEY, getTodayString());
      set({ showPopup: false });
    },

    snoozePopup: () => {
      const oneHourLater = Date.now() + 60 * 60 * 1000;
      localStorage.setItem(POPUP_SNOOZED_KEY, String(oneHourLater));
      set({ showPopup: false });
    },

    addCategory: async (name, color) => {
      const category: CategoryItem = {
        id: crypto.randomUUID(),
        name,
        color,
      };
      await manageEvents.addCategory(category);
      set((state) => ({ categories: [...state.categories, category] }));
    },

    deleteCategory: async (id) => {
      await manageEvents.deleteCategory(id);
      set((state) => ({
        categories: state.categories.filter((c) => c.id !== id),
      }));
    },

    exportEvents: async (options) => {
      return exportEventsUC.execute(options);
    },

    triggerExport: async (shareFile) => {
      const json = JSON.stringify(shareFile, null, 2);
      const api = window.electronAPI;
      if (api?.showSaveDialog && api.writeFile) {
        const filePath = await api.showSaveDialog({
          title: '일정 내보내기',
          defaultPath: `일정공유_${new Date().toISOString().slice(0, 10)}.ssampin`,
          filters: [{ name: '쌤핀 일정 파일', extensions: ['ssampin'] }],
        });
        if (!filePath) return false;
        await api.writeFile(filePath, json);
        return true;
      }
      // Browser fallback
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `일정공유_${new Date().toISOString().slice(0, 10)}.ssampin`;
      a.click();
      URL.revokeObjectURL(url);
      return true;
    },

    triggerImport: async () => {
      const api = window.electronAPI;
      let raw: string | null = null;

      if (api?.importShareFile) {
        raw = await api.importShareFile();
      } else {
        // Browser fallback: file input
        raw = await new Promise<string | null>((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.ssampin';
          input.onchange = () => {
            const file = input.files?.[0];
            if (!file) { resolve(null); return; }
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsText(file);
          };
          input.click();
        });
      }

      if (!raw) return null;

      try {
        const parsed: unknown = JSON.parse(raw);
        return validateShareFile(parsed);
      } catch {
        return null;
      }
    },

    importEvents: async (shareFile, mappings, strategy) => {
      const result = await importEventsUC.execute(shareFile, mappings, strategy);
      // Reload from repository to sync state
      const data = await eventsRepository.getEvents();
      const events = data?.events ?? [];
      const categories = data?.categories ?? [];
      set({ events, categories, shareFile: null, showImportModal: false });
      return result;
    },

    setShowExportModal: (show) => set({ showExportModal: show }),
    setShowImportModal: (show) => set({ showImportModal: show }),
    setShareFile: (file) => set({ shareFile: file }),
  };
});
