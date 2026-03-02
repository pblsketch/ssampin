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

interface WidgetSettingsPanelProps {
  onClose: () => void;
}

/**
 * 위젯 설정 인라인 사이드 패널
 * 편집 모드에서 그리드 옆에 표시되어 동시 조작 가능
 */
export function WidgetSettingsPanel({ onClose }: WidgetSettingsPanelProps) {
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

  return (
    <aside className="w-64 shrink-0 border-l-2 border-sp-accent/30 bg-sp-bg flex flex-col animate-slide-in-right shadow-[-4px_0_16px_rgba(0,0,0,0.3)]">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b border-sp-border/50 px-4 py-3 bg-sp-accent/5">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sp-accent">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <h2 className="text-sm font-bold text-sp-text">위젯 설정</h2>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-sp-muted hover:text-sp-text hover:bg-sp-card transition-colors"
          title="편집 모드 끄기"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* 위젯 목록 */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
        {CATEGORY_ORDER.map((category) => {
          const widgets = widgetsByCategory.get(category);
          if (!widgets || widgets.length === 0) return null;

          return (
            <Fragment key={category}>
              <div>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-sp-muted">
                  {CATEGORY_LABELS[category]}
                </h3>
                <div className="space-y-1">
                  {widgets.map((def) => {
                    const isVisible = visibilityMap.get(def.id) ?? false;

                    return (
                      <label
                        key={def.id}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-sp-card/50 transition-colors"
                      >
                        <span className="text-base">{def.icon}</span>
                        <span className="flex-1 text-xs font-medium text-sp-text truncate">
                          {def.name}
                        </span>
                        {/* 토글 스위치 */}
                        <button
                          role="switch"
                          aria-checked={isVisible}
                          onClick={() => toggleWidget(def.id)}
                          className={`relative inline-flex h-4.5 w-8 shrink-0 items-center rounded-full transition-colors ${
                            isVisible ? 'bg-sp-accent' : 'bg-sp-border'
                          }`}
                        >
                          <span
                            className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${
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
      <div className="border-t border-sp-border/50 px-4 py-2.5">
        <button
          onClick={() => resetToPreset()}
          className="w-full rounded-lg border border-sp-border/50 px-3 py-1.5 text-xs text-sp-muted hover:text-sp-text hover:border-sp-accent/30 transition-colors"
        >
          기본 프리셋으로 초기화
        </button>
      </div>
    </aside>
  );
}
