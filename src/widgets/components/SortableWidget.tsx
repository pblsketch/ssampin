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
    ...(isEditMode ? { borderRadius: 'var(--sp-card-radius, 12px)' } : {}),
  };

  const spanClass = getSpanClass(instance.colSpan);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${spanClass} ${isDragging ? 'opacity-50 z-50' : ''} ${isEditMode ? 'ring-1 ring-dashed ring-sp-border/50' : ''}`}
    >
      <div className="relative group/widget h-full">
        <div
          className="h-full overflow-hidden bg-sp-card flex flex-col"
          style={{
            borderRadius: 'var(--sp-card-radius, 12px)',
            border: 'var(--sp-card-border, 1px solid var(--sp-border))',
            boxShadow: 'var(--sp-card-shadow, none)',
          }}
        >
          {/* 편집 모드 툴바 — 드래그 핸들 + 위젯 이름 + 숨기기 버튼 */}
          {isEditMode && (
            <div className="flex items-center justify-between gap-1 px-2 py-1.5 bg-sp-surface/80 border-b border-sp-border/30 shrink-0">
              <button
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing rounded p-0.5 text-sp-muted hover:text-sp-text hover:bg-sp-border/30 transition-colors"
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
              <span className="text-[11px] text-sp-muted truncate select-none pointer-events-none">
                {definition.name}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onHide();
                }}
                className="rounded p-0.5 text-sp-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                title="위젯 숨기기"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              </button>
            </div>
          )}

          {/* 위젯 콘텐츠 */}
          <div className="flex-1 min-h-0">
            <WidgetCard
              definition={definition}
              isEditMode={isEditMode}
              onNavigate={onNavigate}
            />
          </div>
        </div>

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
