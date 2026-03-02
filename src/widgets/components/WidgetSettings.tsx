import { useMemo, Fragment } from 'react';
import { WIDGET_DEFINITIONS } from '../registry';
import { useDashboardConfig } from '../useDashboardConfig';
import type { WidgetCategory } from '../types';

const CATEGORY_LABELS: Record<WidgetCategory, string> = {
  timetable: '시간표',
  class: '학급',
  info: '정보',
  admin: '관리',
};

const CATEGORY_ORDER: WidgetCategory[] = ['timetable', 'class', 'info', 'admin'];

interface WidgetSettingsProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 위젯 설정 사이드 드로어
 * 카테고리별로 위젯 목록 + 토글 스위치 표시
 */
export function WidgetSettings({ open, onClose }: WidgetSettingsProps) {
  const config = useDashboardConfig((s) => s.config);
  const toggleWidget = useDashboardConfig((s) => s.toggleWidget);
  const resetToPreset = useDashboardConfig((s) => s.resetToPreset);

  const widgetsByCategory = useMemo(() => {
    const map = new Map<WidgetCategory, typeof WIDGET_DEFINITIONS>();
    for (const cat of CATEGORY_ORDER) {
      map.set(cat, []);
    }
    for (const def of WIDGET_DEFINITIONS) {
      const list = map.get(def.category);
      if (list) {
        (list as typeof WIDGET_DEFINITIONS[number][]).push(def);
      }
    }
    return map;
  }, []);

  const visibilityMap = useMemo(() => {
    if (!config) return new Map<string, boolean>();
    return new Map(config.widgets.map((w) => [w.widgetId, w.visible]));
  }, [config]);

  if (!open) return null;

  return (
    <>
      {/* 백드롭 */}
      <div
        className="fixed inset-0 z-40 bg-black/40 transition-opacity"
        onClick={onClose}
      />

      {/* 드로어 */}
      <div className="fixed right-0 top-0 z-50 h-full w-80 bg-sp-surface shadow-2xl flex flex-col animate-slide-in-right">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-sp-border px-5 py-4">
          <h2 className="text-base font-bold text-sp-text">대시보드 설정</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-sp-muted hover:text-sp-text hover:bg-sp-card transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* 위젯 목록 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {CATEGORY_ORDER.map((category) => {
            const widgets = widgetsByCategory.get(category);
            if (!widgets || widgets.length === 0) return null;

            return (
              <Fragment key={category}>
                <div>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-sp-muted">
                    {CATEGORY_LABELS[category]}
                  </h3>
                  <div className="space-y-2">
                    {widgets.map((def) => {
                      const isVisible = visibilityMap.get(def.id) ?? false;

                      return (
                        <label
                          key={def.id}
                          className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-sp-card/50 transition-colors"
                        >
                          <span className="text-lg">{def.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-sp-text">{def.name}</p>
                            <p className="text-xs text-sp-muted truncate">{def.description}</p>
                          </div>
                          {/* 토글 스위치 */}
                          <button
                            role="switch"
                            aria-checked={isVisible}
                            onClick={() => toggleWidget(def.id)}
                            className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                              isVisible ? 'bg-sp-accent' : 'bg-sp-border'
                            }`}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                                isVisible ? 'translate-x-4' : 'translate-x-0.5'
                              }`}
                            />
                          </button>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>

        {/* 푸터 */}
        <div className="border-t border-sp-border px-5 py-3">
          <button
            onClick={() => {
              resetToPreset();
            }}
            className="w-full rounded-lg border border-sp-border px-4 py-2 text-sm text-sp-muted hover:text-sp-text hover:border-sp-accent/30 transition-colors"
          >
            기본 프리셋으로 초기화
          </button>
        </div>
      </div>
    </>
  );
}
