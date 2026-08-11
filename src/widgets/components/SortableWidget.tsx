import { useState, useRef, useEffect } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { WidgetDefinition, WidgetInstance } from '../types';
import { WidgetCard } from './WidgetCard';
import { WidgetResizeHandle } from './WidgetResizeHandle';
import { WidgetVerticalResizeHandle } from './WidgetVerticalResizeHandle';
import { WidgetCornerResizeHandle } from './WidgetCornerResizeHandle';
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
 *
 * 리사이즈 발견성 개선:
 * - 리사이즈 그립(우측·하단·우하단 코너)은 항상 mount — 카드 호버만으로
 *   CSS(group-hover)로 표시. 숨은 dwell 없이 바로 발견 가능.
 *
 * 손잡이 위치 (사용자 신고: 위젯 자체 헤더 버튼과 겹침):
 * - 위젯 14종의 헤더는 모두 "왼쪽 제목 / 오른쪽 자체 버튼" 구조다. 카드 상단
 *   오른쪽은 이미 위젯이 쓰는 자리라, 시스템 손잡이를 거기 띄우면 미니 캘린더
 *   ‹›, 자주 쓰는 도구 ✏️ 같은 조작 버튼을 가린다. → **상단 왼쪽(제목 위)**로 옮긴다.
 * - 제목은 읽기 전용 텍스트라 잠깐 가려도 조작을 막지 않는다(호버 중에만 표시).
 *   반면 오른쪽 버튼은 가리면 곧 누를 대상을 못 누르게 되므로 되돌리지 말 것.
 * - 카드 위로 걸치는(straddle) 배치는 불가: 대시보드 컨테이너가 overflow-y-auto라
 *   첫 줄 카드에서 위로 튀어나온 부분이 잘린다. 반드시 카드 안쪽에 둔다.
 * - 이전 구현의 60×60 투명 quadrant hover zone은 카드 콘텐츠 위(z-10)를 덮어
 *   그 안의 위젯 자체 버튼 클릭을 삼켰다. zone을 제거하고 카드 전체 hover +
 *   300ms dwell로 대체(카드 이탈 150ms 후 숨김).
 * - 손잡이는 항상 mount하되 숨김 상태에서 pointer-events-none — 투명 요소가
 *   클릭을 가로채는 회귀를 구조적으로 차단한다.
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

  // 카드 hover dwell state (손잡이 탭 전용)
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

  const cancelShowTimer = () => {
    if (showTimerRef.current) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  };

  const cancelHideTimer = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  // 카드 진입: 300ms 머물면 손잡이 탭 표시 (대시보드를 스치듯 지날 때 깜빡임 방지)
  const handleCardEnter = () => {
    cancelHideTimer();
    if (!showHandles && !showTimerRef.current) {
      showTimerRef.current = setTimeout(() => {
        showTimerRef.current = null;
        setShowHandles(true);
      }, 300);
    }
  };

  // 카드 이탈: 표시 대기를 취소하고 150ms 후 숨김
  const handleCardLeave = () => {
    cancelShowTimer();
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      setShowHandles(false);
    }, 150);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${spanClass} ${isDragging ? 'opacity-50 z-50' : ''}`}
    >
      <div
        className="relative group/widget h-full"
        onMouseEnter={handleCardEnter}
        onMouseLeave={handleCardLeave}
      >
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

        {/* 손잡이 — 카드 상단 왼쪽(제목 줄) 위에 겹쳐 뜬다.
            top-4 는 위젯 헤더(p-4 + text-sm 한 줄)의 세로 중앙에 맞춘 값 — 제목 이모지를
            어중간하게 반만 가리지 않도록 한다.
            숨김 상태에서도 mount 하되 pointer-events-none 이라 클릭을 가로채지 않는다. */}
        <div
          data-widget-handle-tab
          className={`absolute top-4 left-3 z-20 flex items-center gap-0.5 bg-sp-card border border-sp-border/60 rounded-lg px-1 py-0.5 shadow-md transition-opacity duration-150 ${
            showHandles ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* 드래그 핸들 — listeners 여기에만 부착 */}
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing rounded p-0.5 text-sp-muted hover:text-sp-text hover:bg-sp-border/30 transition-colors"
            title="드래그하여 순서 변경"
            aria-label="드래그하여 순서 변경"
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

          {/* 숨기기 */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onHide();
            }}
            className="rounded p-0.5 text-sp-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
            title="위젯 숨기기"
            aria-label="위젯 숨기기"
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

        {/* 리사이즈 그립 — 항상 mount, 카드 호버(group-hover)만으로 표시 */}
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
        <WidgetCornerResizeHandle
          currentColSpan={instance.colSpan}
          currentRowSpan={instance.rowSpan}
          minColSpan={definition.minSize.w as 1 | 2 | 3 | 4}
          minRowSpan={definition.minSize.h}
          onResize={(colSpan, rowSpan) => {
            if (colSpan !== instance.colSpan) onResize(colSpan);
            if (rowSpan !== instance.rowSpan) onResizeHeight(rowSpan);
          }}
        />
      </div>
    </div>
  );
}
