import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { WidgetDefinition, WidgetInstance } from '../types';
import { WidgetCard } from './WidgetCard';
import { WidgetResizeHandle } from './WidgetResizeHandle';
import { WidgetVerticalResizeHandle } from './WidgetVerticalResizeHandle';
import { getSpanClass } from '../utils/getSpanClass';

interface SortableWidgetProps {
  instance: WidgetInstance;
  definition: WidgetDefinition;
  isEditMode?: boolean;
  onHide: () => void;
  onResize: (colSpan: 1 | 2 | 3 | 4) => void;
  onResizeHeight: (rowSpan: number) => void;
  onNavigate?: (page: string) => void;
}

export function SortableWidget({
  instance,
  definition,
  isEditMode,
  onHide,
  onResize,
  onResizeHeight,
  onNavigate,
}: SortableWidgetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: instance.widgetId, disabled: !isEditMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridRow: `span ${instance.rowSpan} / span ${instance.rowSpan}`,
  };

  const spanClass = getSpanClass(instance.colSpan);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${spanClass} ${isDragging ? 'opacity-50 z-50' : ''} ${isEditMode ? 'ring-1 ring-dashed ring-sp-border/50 rounded-xl' : ''}`}
    >
      <div className="relative group/widget h-full">
        {/* 드래그 핸들 (편집 모드) */}
        {isEditMode && (
          <button
            {...attributes}
            {...listeners}
            className="absolute top-2 left-2 z-10 cursor-grab active:cursor-grabbing rounded-md bg-sp-surface/80 p-1 text-sp-muted hover:text-sp-text transition-colors"
            title="드래그하여 순서 변경"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="9" cy="5" r="1.5" />
              <circle cx="15" cy="5" r="1.5" />
              <circle cx="9" cy="12" r="1.5" />
              <circle cx="15" cy="12" r="1.5" />
              <circle cx="9" cy="19" r="1.5" />
              <circle cx="15" cy="19" r="1.5" />
            </svg>
          </button>
        )}

        <WidgetCard
          definition={definition}
          isEditMode={isEditMode}
          onHide={onHide}
          onNavigate={onNavigate}
        />

        {/* 크기 조절 핸들 (편집 모드) */}
        {isEditMode && (
          <>
            <WidgetResizeHandle
              currentSpan={instance.colSpan}
              minSpan={definition.minSize.w as 1 | 2 | 3 | 4}
              onResize={onResize}
            />
            <WidgetVerticalResizeHandle
              currentRowSpan={instance.rowSpan}
              minRowSpan={definition.minSize.h}
              onResize={onResizeHeight}
            />
          </>
        )}
      </div>
    </div>
  );
}
