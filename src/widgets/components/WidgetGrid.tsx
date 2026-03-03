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

interface WidgetGridProps {
  isEditMode?: boolean;
}

/**
 * 위젯 그리드 컨테이너
 * - DnD 지원: 편집 모드에서 드래그앤드롭으로 순서 변경
 * - 반응형 그리드: colSpan에 따라 위젯 가로 크기 조절
 */
export function WidgetGrid({ isEditMode }: WidgetGridProps) {
  const config = useDashboardConfig((s) => s.config);
  const toggleWidget = useDashboardConfig((s) => s.toggleWidget);
  const reorderWidgets = useDashboardConfig((s) => s.reorderWidgets);
  const resizeWidget = useDashboardConfig((s) => s.resizeWidget);

  const [activeId, setActiveId] = useState<string | null>(null);

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
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={widgetIds} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 grid-flow-row-dense items-start">
          {visibleWidgets.map((instance) => {
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
          <div className="rounded-xl ring-2 ring-sp-accent/50 shadow-lg shadow-sp-accent/20">
            <WidgetCard definition={activeWidget.definition} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
