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
  downloadTemplate: () => Promise<void>;
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

async function excelBufferToShareFile(buffer: ArrayBuffer): Promise<EventsShareFile | null> {
  try {
    const { parseEventsFromExcel } = await import(
      '@infrastructure/export/ExcelExporter'
    );
    const { events: parsedEvents, categoryNames } = await parseEventsFromExcel(buffer);

    if (parsedEvents.length === 0) return null;

    const defaultCats: readonly { id: string; name: string; color: string }[] = [
      { id: 'school', name: '학교', color: 'blue' },
      { id: 'class', name: '학급', color: 'green' },
      { id: 'department', name: '부서', color: 'yellow' },
      { id: 'treeSchool', name: '나무학교', color: 'purple' },
      { id: 'etc', name: '기타', color: 'gray' },
    ];
    const availableColors = [
      'blue', 'green', 'yellow', 'purple', 'red', 'pink', 'indigo', 'teal',
    ];
    let colorIdx = 0;

    const catMap = new Map<string, { id: string; name: string; color: string }>();
    for (const name of categoryNames) {
      const existing = defaultCats.find((c) => c.name === name);
      if (existing) {
        catMap.set(name, existing);
      } else {
        catMap.set(name, {
          id: crypto.randomUUID(),
          name,
          color: availableColors[colorIdx % availableColors.length] ?? 'gray',
        });
        colorIdx++;
      }
    }

    const categories = Array.from(catMap.values());
    const events: SchoolEvent[] = parsedEvents.map((pe) => ({
      id: crypto.randomUUID(),
      title: pe.title,
      date: pe.date,
      category: catMap.get(pe.categoryName)?.id ?? 'etc',
      ...(pe.endDate ? { endDate: pe.endDate } : {}),
      ...(pe.time ? { time: pe.time } : {}),
      ...(pe.location ? { location: pe.location } : {}),
      ...(pe.description ? { description: pe.description } : {}),
      ...(pe.isDDay ? { isDDay: pe.isDDay } : {}),
      ...(pe.recurrence ? { recurrence: pe.recurrence } : {}),
    }));

    return {
      meta: {
        version: '1.0',
        type: 'events',
        createdAt: new Date().toISOString(),
        createdBy: '',
        schoolName: '',
        description: 'Excel 파일에서 가져옴',
      },
      categories,
      events,
    };
  } catch {
    return null;
  }
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

      // Electron path — .ssampin + .xlsx
      if (api?.importShareFile) {
        const result = await api.importShareFile();
        if (!result) return null;

        if (result.fileType === 'xlsx') {
          let buf: ArrayBuffer;
          if (result.content instanceof ArrayBuffer) {
            buf = result.content;
          } else {
            const u8 = new Uint8Array(result.content as unknown as ArrayBuffer);
            buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
          }
          return excelBufferToShareFile(buf);
        }

        try {
          const parsed: unknown = JSON.parse(result.content as string);
          return validateShareFile(parsed);
        } catch {
          return null;
        }
      }

      // Browser fallback — supports both .ssampin and .xlsx
      const fileResult = await new Promise<
        { content: string | ArrayBuffer; name: string } | null
      >((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.ssampin,.xlsx';
        input.onchange = () => {
          const file = input.files?.[0];
          if (!file) { resolve(null); return; }
          const isExcel = file.name.endsWith('.xlsx');
          const reader = new FileReader();
          reader.onload = () =>
            resolve({ content: reader.result as string | ArrayBuffer, name: file.name });
          reader.onerror = () => resolve(null);
          if (isExcel) {
            reader.readAsArrayBuffer(file);
          } else {
            reader.readAsText(file);
          }
        };
        input.click();
      });

      if (!fileResult) return null;

      // .xlsx file → parse Excel and convert to EventsShareFile
      if (fileResult.name.endsWith('.xlsx')) {
        return excelBufferToShareFile(fileResult.content as ArrayBuffer);
      }

      // .ssampin file → parse JSON
      try {
        const parsed: unknown = JSON.parse(fileResult.content as string);
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

    downloadTemplate: async () => {
      const { generateEventsTemplateExcel } = await import(
        '@infrastructure/export/ExcelExporter'
      );
      const buffer = await generateEventsTemplateExcel();
      const fileName = '일정_가져오기_양식.xlsx';
      const api = window.electronAPI;
      if (api?.showSaveDialog && api.writeFile) {
        const filePath = await api.showSaveDialog({
          title: '양식 다운로드',
          defaultPath: fileName,
          filters: [{ name: 'Excel 파일', extensions: ['xlsx'] }],
        });
        if (!filePath) return;
        await api.writeFile(filePath, buffer);
        return;
      }
      // 브라우저 폴백
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    },
  };
});
