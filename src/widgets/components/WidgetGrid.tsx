import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { useDashboardConfig } from '../useDashboardConfig';
import { getWidgetById } from '../registry';
import { SortableWidget } from './SortableWidget';
import { WidgetCard } from './WidgetCard';
import { WidgetTabBar } from './WidgetTabBar';
import type { TabFilter } from './WidgetTabBar';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { DEFAULT_WIDGET_STYLE, BG_PATTERN_CSS } from '@domain/entities/DashboardTheme';

interface WidgetGridProps {
  isEditMode?: boolean;
  onNavigate?: (page: string) => void;
}

/**
 * 위젯 그리드 컨테이너
 * - DnD 지원: 편집 모드에서 드래그앤드롭으로 순서 변경
 * - 반응형 그리드: colSpan에 따라 위젯 가로 크기 조절
 */
export function WidgetGrid({ isEditMode, onNavigate }: WidgetGridProps) {
  const config = useDashboardConfig((s) => s.config);
  const toggleWidget = useDashboardConfig((s) => s.toggleWidget);
  const reorderWidgets = useDashboardConfig((s) => s.reorderWidgets);
  const resizeWidget = useDashboardConfig((s) => s.resizeWidget);
  const resizeWidgetHeight = useDashboardConfig((s) => s.resizeWidgetHeight);

  const [activeId, setActiveId] = useState<string | null>(null);

  const widgetStyle = useSettingsStore((s) => s.settings.widgetStyle);
  const ws = { ...DEFAULT_WIDGET_STYLE, ...widgetStyle };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visibleWidgets = useMemo(() => {
    if (!config) return [];
    return [...config.widgets]
      .filter((w) => w.visible)
      .sort((a, b) => a.order - b.order);
  }, [config]);

  const widgetIds = useMemo(
    () => visibleWidgets.map((w) => w.widgetId),
    [visibleWidgets],
  );

  const [activeTab, setActiveTab] = useState<TabFilter>('all');

  const filteredWidgets = useMemo(() => {
    if (activeTab === 'all') return visibleWidgets;
    return visibleWidgets.filter((w) => {
      const def = getWidgetById(w.widgetId);
      return def?.category === activeTab;
    });
  }, [visibleWidgets, activeTab]);

  const filteredIds = useMemo(
    () => filteredWidgets.map((w) => w.widgetId),
    [filteredWidgets],
  );

  const activeWidget = useMemo(() => {
    if (!activeId) return null;
    const instance = visibleWidgets.find((w) => w.widgetId === activeId);
    const definition = activeId ? getWidgetById(activeId) : undefined;
    if (!instance || !definition) return null;
    return { instance, definition };
  }, [activeId, visibleWidgets]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = widgetIds.indexOf(String(active.id));
    const newIndex = widgetIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = [...widgetIds];
    newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, String(active.id));
    reorderWidgets(newOrder);
  }

  if (visibleWidgets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-sp-muted">
        <span className="mb-3 text-4xl">📌</span>
        <p className="text-sm">표시할 위젯이 없습니다</p>
        <p className="mt-1 text-xs">우측 상단의 편집 버튼으로 위젯을 추가하세요</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* 배경 이미지/패턴 레이어 */}
      {ws.backgroundImage && (
        <div
          className="absolute inset-0 pointer-events-none rounded-xl"
          style={{
            background: ws.backgroundImage.startsWith('file://')
              ? `url(${ws.backgroundImage})`
              : (BG_PATTERN_CSS[ws.backgroundImage] ?? 'none'),
            backgroundSize: ws.backgroundImage === 'dots' ? '16px 16px' : 'cover',
            opacity: ws.backgroundImageOpacity,
          }}
        />
      )}

      {/* 탭 바 — 편집 모드가 아닐 때만 표시 */}
      {!isEditMode && visibleWidgets.length > 4 && (
        <WidgetTabBar activeTab={activeTab} onTabChange={setActiveTab} />
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={isEditMode ? widgetIds : filteredIds} strategy={rectSortingStrategy}>
          <div
            className="widget-grid grid grid-cols-1 md:grid-cols-4 grid-flow-row-dense"
            style={{ gap: `${ws.cardGap}px`, gridAutoRows: '80px' }}
          >
            {(isEditMode ? visibleWidgets : filteredWidgets).map((instance) => {
              const definition = getWidgetById(instance.widgetId);
              if (!definition) return null;

              return (
                <SortableWidget
                  key={instance.widgetId}
                  instance={instance}
                  definition={definition}
                  isEditMode={isEditMode}
                  onHide={() => toggleWidget(instance.widgetId)}
                  onResize={(colSpan) => resizeWidget(instance.widgetId, colSpan)}
                  onResizeHeight={(rowSpan) => resizeWidgetHeight(instance.widgetId, rowSpan)}
                  onNavigate={onNavigate}
                />
              );
            })}

          </div>
        </SortableContext>

        {/* 드래그 오버레이 */}
        <DragOverlay dropAnimation={{
          duration: 200,
          easing: 'ease',
        }}>
          {activeWidget && (
            <div
              className="ring-2 ring-sp-accent/50 shadow-lg shadow-sp-accent/20 overflow-hidden bg-sp-card"
              style={{
                borderRadius: 'var(--sp-card-radius, 12px)',
                maxHeight: activeWidget.instance.rowSpan * 80 + (activeWidget.instance.rowSpan - 1) * 16,
              }}
            >
              <WidgetCard definition={activeWidget.definition} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
