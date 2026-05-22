import { useState, useRef, useEffect } from 'react';
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
  onHide: () => void;
  onResize: (colSpan: 1 | 2 | 3 | 4) => void;
  onResizeHeight: (rowSpan: number) => void;
  onNavigate?: (page: string) => void;
}

/**
 * 정렬 가능한 위젯 래퍼
 *
 * G004 PR-core 변경사항:
 * - isEditMode 제거 — DnD 항상 활성
 * - 드래그 리스너(listeners)는 ⋮ 핸들 버튼에만 부착 → 카드 본문 클릭 보존
 * - 상단 오른쪽 60×60 quadrant hover zone → 300ms 후 핸들 그룹 표시
 *   (⋮ 드래그 + ✕ 숨기기 pill + absolute 리사이즈 핸들)
 * - 핸들 그룹: mouseEnter 300ms 후 표시, mouseLeave 100ms 후 숨김
 */
export function SortableWidget({
  instance,
  definition,
  onHide,
  onResize,
  onResizeHeight,
  onNavigate,
}: SortableWidgetProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: instance.widgetId,
    disabled: false,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    gridRow: `span ${instance.rowSpan} / span ${instance.rowSpan}`,
  };

  const spanClass = getSpanClass(instance.colSpan);

  // Quadrant-dwell hover state
  const [showHandles, setShowHandles] = useState(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 컴포넌트 언마운트 시 타이머 정리
  useEffect(() => {
    return () => {
      if (showTimerRef.current) clearTimeout(showTimerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const handleZoneEnter = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (!showHandles) {
      showTimerRef.current = setTimeout(() => {
        setShowHandles(true);
      }, 300);
    }
  };

  const handleZoneLeave = () => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    hideTimerRef.current = setTimeout(() => {
      setShowHandles(false);
    }, 100);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${spanClass} ${isDragging ? 'opacity-50 z-50' : ''}`}
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
          {/* 위젯 콘텐츠 */}
          <div className="flex-1 min-h-0">
            <WidgetCard definition={definition} onNavigate={onNavigate} />
          </div>
        </div>

        {/* 상단 오른쪽 quadrant hover zone (60×60 invisible trigger) */}
        <div
          className="absolute top-0 right-0 w-[60px] h-[60px] z-10"
          onMouseEnter={handleZoneEnter}
          onMouseLeave={handleZoneLeave}
        />

        {/* ⋮ 드래그 + ✕ 숨기기 pill — quadrant hover 후 300ms 표시 */}
        {showHandles && (
          <div
            className="absolute top-1.5 right-1.5 z-20 flex items-center gap-0.5 bg-sp-card/95 border border-sp-border/60 rounded-lg px-1 py-0.5 shadow-md"
            onMouseEnter={handleZoneEnter}
            onMouseLeave={handleZoneLeave}
          >
            {/* ⋮ 드래그 핸들 — listeners 여기에만 부착 */}
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing rounded p-0.5 text-sp-muted hover:text-sp-text hover:bg-sp-border/30 transition-colors"
              title="드래그하여 순서 변경"
              type="button"
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

            {/* ✕ 숨기기 */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onHide();
              }}
              className="rounded p-0.5 text-sp-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
              title="위젯 숨기기"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            </button>
          </div>
        )}

        {/* 리사이즈 핸들 — quadrant hover 시 표시 (absolute 위치, 카드 엣지에 부착) */}
        {showHandles && (
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
