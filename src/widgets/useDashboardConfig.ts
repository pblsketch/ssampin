import { create } from 'zustand';
import type { DashboardConfig, WidgetInstance } from './types';
import { WIDGET_DEFINITIONS } from './registry';
import { WIDGET_PRESETS, getPresetKey } from './presets';
import { applyStudentRecordsOffer } from './studentRecordsOffer';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';

const STORAGE_KEY = 'ssampin-dashboard-config';

/** localStorage에서 설정 읽기 */
function loadFromStorage(): DashboardConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DashboardConfig;
  } catch {
    return null;
  }
}

/** localStorage에 설정 저장 */
function saveToStorage(config: DashboardConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // 저장 실패 시 무시
  }
}

/** 프리셋에서 DashboardConfig 생성 */
function createConfigFromPreset(widgetIds: readonly string[]): DashboardConfig {
  const widgets: WidgetInstance[] = WIDGET_DEFINITIONS.map((def, idx) => ({
    widgetId: def.id,
    visible: widgetIds.includes(def.id),
    order: widgetIds.includes(def.id) ? widgetIds.indexOf(def.id) : 100 + idx,
    colSpan: Math.min(def.defaultSize.w, 4) as 1 | 2 | 3 | 4,
    rowSpan: def.defaultSize.h,
  }));

  return {
    widgets,
    lastModified: new Date().toISOString(),
    // 기본 구성에는 이미 '학생 빠른 기록' 카드가 있다 — [기본 구성으로 되돌리기] 뒤 선생님이 카드를
    // 빼도 다음 실행에서 다시 붙이지 않게 '한 번 붙였다' 표시를 함께 둔다(ADR-135 결정 12).
    studentRecordsOffered: true,
  };
}

interface DashboardConfigState {
  config: DashboardConfig | null;
  loaded: boolean;

  /** 초기 로드. 저장된 config 없으면 프리셋 자동 적용 */
  load: () => void;

  /** 위젯 표시/숨김 토글 */
  toggleWidget: (widgetId: string) => void;

  /** 위젯 순서 변경 (드래그앤드롭용) */
  reorderWidgets: (orderedIds: string[]) => void;

  /** 위젯 가로 크기 변경 */
  resizeWidget: (widgetId: string, colSpan: 1 | 2 | 3 | 4) => void;

  /** 위젯 세로 크기 변경 */
  resizeWidgetHeight: (widgetId: string, rowSpan: number) => void;

  /** 프리셋으로 초기화 */
  resetToPreset: () => void;

  /** visible 위젯 목록 (order 순) */
  getVisibleWidgets: () => WidgetInstance[];

  /**
   * '학생 빠른 기록' 카드를 한 번 붙여 드린다(ADR-135). 명렬을 다 불러온 뒤에만 부를 것 —
   * 불러오기 전에 부르면 명렬이 없다고 잘못 판단해 표시만 남기고 끝난다.
   */
  offerStudentRecordsCardOnce: (hasRoster: boolean) => void;
}

export const useDashboardConfig = create<DashboardConfigState>((set, get) => ({
  config: null,
  loaded: false,

  offerStudentRecordsCardOnce: (hasRoster) => {
    const { config } = get();
    if (!config) return;
    const { config: next, changed } = applyStudentRecordsOffer(config, hasRoster);
    if (!changed) return;
    saveToStorage(next);
    set({ config: next });
  },

  load: () => {
    if (get().loaded) return;

    const saved = loadFromStorage();
    if (saved) {
      // 저장된 config에 새로 추가된 위젯이 있으면 병합
      const existingIds = new Set(saved.widgets.map((w) => w.widgetId));
      const maxOrder = Math.max(0, ...saved.widgets.map((w) => w.order));
      let nextOrder = maxOrder + 1;

      const newWidgets: WidgetInstance[] = [];
      for (const def of WIDGET_DEFINITIONS) {
        if (!existingIds.has(def.id)) {
          newWidgets.push({
            widgetId: def.id,
            visible: false,
            order: nextOrder++,
            colSpan: Math.min(def.defaultSize.w, 4) as 1 | 2 | 3 | 4,
            rowSpan: def.defaultSize.h,
          });
        }
      }

      // 마이그레이션: colSpan/rowSpan 없는 기존 위젯에 defaultSize 적용
      const migratedWidgets = [...saved.widgets, ...newWidgets].map((w) => {
        const def = WIDGET_DEFINITIONS.find((d) => d.id === w.widgetId);
        return {
          ...w,
          colSpan: w.colSpan || ((def ? Math.min(def.defaultSize.w, 4) : 1) as 1 | 2 | 3 | 4),
          rowSpan: w.rowSpan || (def?.defaultSize.h ?? 3),
        };
      });

      const merged: DashboardConfig = {
        ...saved,
        widgets: migratedWidgets,
      };

      set({ config: merged, loaded: true });
      return;
    }

    // 첫 방문: 프리셋 적용
    const settings = useSettingsStore.getState().settings;
    const hasHomeroom = Boolean(settings.className);
    const presetKey = getPresetKey(settings.schoolLevel, hasHomeroom);
    const presetWidgetIds = WIDGET_PRESETS[presetKey];
    const config = createConfigFromPreset(presetWidgetIds);

    saveToStorage(config);
    set({ config, loaded: true });
  },

  toggleWidget: (widgetId: string) => {
    const { config } = get();
    if (!config) return;

    const updated: DashboardConfig = {
      ...config,
      widgets: config.widgets.map((w) =>
        w.widgetId === widgetId ? { ...w, visible: !w.visible } : w,
      ),
      lastModified: new Date().toISOString(),
    };

    saveToStorage(updated);
    set({ config: updated });
  },

  reorderWidgets: (orderedIds: string[]) => {
    const { config } = get();
    if (!config) return;

    const orderMap = new Map(orderedIds.map((id, idx) => [id, idx]));
    const maxOrder = orderedIds.length;

    const updated: DashboardConfig = {
      ...config,
      widgets: config.widgets.map((w) => ({
        ...w,
        order: orderMap.get(w.widgetId) ?? maxOrder + w.order,
      })),
      lastModified: new Date().toISOString(),
    };

    saveToStorage(updated);
    set({ config: updated });
  },

  resizeWidget: (widgetId: string, colSpan: 1 | 2 | 3 | 4) => {
    const { config } = get();
    if (!config) return;

    const def = WIDGET_DEFINITIONS.find((d) => d.id === widgetId);
    const minW = def?.minSize.w ?? 1;
    const clamped = Math.max(minW, colSpan) as 1 | 2 | 3 | 4;

    const updated: DashboardConfig = {
      ...config,
      widgets: config.widgets.map((w) =>
        w.widgetId === widgetId ? { ...w, colSpan: clamped } : w,
      ),
      lastModified: new Date().toISOString(),
    };

    saveToStorage(updated);
    set({ config: updated });
  },

  resizeWidgetHeight: (widgetId: string, rowSpan: number) => {
    const { config } = get();
    if (!config) return;

    const def = WIDGET_DEFINITIONS.find((d) => d.id === widgetId);
    const minH = def?.minSize.h ?? 2;
    const clamped = Math.max(minH, Math.min(12, rowSpan));

    const updated: DashboardConfig = {
      ...config,
      widgets: config.widgets.map((w) =>
        w.widgetId === widgetId ? { ...w, rowSpan: clamped } : w,
      ),
      lastModified: new Date().toISOString(),
    };

    saveToStorage(updated);
    set({ config: updated });
  },

  resetToPreset: () => {
    const settings = useSettingsStore.getState().settings;
    const hasHomeroom = Boolean(settings.className);
    const presetKey = getPresetKey(settings.schoolLevel, hasHomeroom);
    const presetWidgetIds = WIDGET_PRESETS[presetKey];
    const config = createConfigFromPreset(presetWidgetIds);

    saveToStorage(config);
    set({ config });
  },

  getVisibleWidgets: () => {
    const { config } = get();
    if (!config) return [];

    return [...config.widgets].filter((w) => w.visible).sort((a, b) => a.order - b.order);
  },
}));
