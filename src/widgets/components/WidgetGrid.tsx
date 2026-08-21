import { useLayoutEffect, useMemo, useState } from 'react';
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
import { DEFAULT_WIDGET_STYLE } from '@domain/entities/DashboardTheme';

interface WidgetGridProps {
  onNavigate?: (page: string) => void;
}

/**
 * 배경 사진을 "보이는 창" 기준으로 그리기 위해, 위쪽 스크롤 영역의 보이는 높이를 잰다.
 *
 * 배경 레이어를 위젯 영역 전체 높이(`absolute inset-0`)에 깔면, 위젯이 많아 스크롤이
 * 생겼을 때 사진이 스크롤 길이만큼 늘어난 상자에 맞춰진다. 그러면 '전체 보기'로 골라도
 * 사진 아래쪽이 화면 밖으로 밀려나 "전체인데 전체가 아닌" 상태가 된다
 * (2026-08-22 실측: 창 900px / 위젯 영역 1162px).
 *
 * 그래서 배경을 스크롤 영역 맨 위에 sticky 로 붙이고 높이를 이 값으로 맞춘다.
 * 창 크기·사이드 패널 열림에 따라 계속 변하므로 ResizeObserver 로 따라간다.
 */
function useScrollportHeight(): {
  ref: (node: HTMLDivElement | null) => void;
  height: number | null;
} {
  /*
    ★ 평범한 `useRef` 가 아니라 state 로 받는 이유.
      위젯 목록은 나중에 불러와지므로 첫 그림에는 위젯이 없고, 그때는 이 그리드가
      "표시할 위젯이 없습니다" 쪽으로 빠져 잴 대상이 아예 붙지 않는다. ref 로 받으면
      대상이 나중에 붙어도 effect 가 다시 돌지 않아 높이를 영영 못 재고, 배경이
      통째로 사라진다(2026-08-22 실제로 이렇게 안 보였다). state 로 받으면 대상이
      붙는 순간 다시 계산된다.
  */
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!node) return;

    // 스크롤이 실제로 일어나는 조상을 찾는다. 부모를 고정으로 가리키면 상위 레이아웃이
    // 한 겹만 바뀌어도 조용히 어긋나므로, overflow 설정을 보고 직접 찾는다.
    let host: HTMLElement | null = node.parentElement;
    while (host) {
      const overflowY = getComputedStyle(host).overflowY;
      if (overflowY === 'auto' || overflowY === 'scroll') break;
      host = host.parentElement;
    }
    if (!host) return;

    const target = host;
    const update = () => setHeight(target.clientHeight);
    update();

    // jsdom 에는 ResizeObserver 가 없다. 없으면 한 번 잰 값으로 두고 넘어간다.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(target);
    return () => observer.disconnect();
  }, [node]);

  return { ref: setNode, height };
}

/**
 * 위젯 그리드 컨테이너
 * - DnD 항상 활성: 드래그는 ⋮ 핸들로만, 카드 본문 클릭은 모달 열기
 * - 반응형 그리드: colSpan에 따라 위젯 가로 크기 조절
 */
export function WidgetGrid({ onNavigate }: WidgetGridProps) {
  const config = useDashboardConfig((s) => s.config);
  const toggleWidget = useDashboardConfig((s) => s.toggleWidget);
  const reorderWidgets = useDashboardConfig((s) => s.reorderWidgets);
  const resizeWidget = useDashboardConfig((s) => s.resizeWidget);
  const resizeWidgetHeight = useDashboardConfig((s) => s.resizeWidgetHeight);

  const [activeId, setActiveId] = useState<string | null>(null);

  const widgetStyle = useSettingsStore((s) => s.settings.widgetStyle);
  const ws = { ...DEFAULT_WIDGET_STYLE, ...widgetStyle };

  const { ref: rootRef, height: scrollportHeight } = useScrollportHeight();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visibleWidgets = useMemo(() => {
    if (!config) return [];
    return [...config.widgets].filter((w) => w.visible).sort((a, b) => a.order - b.order);
  }, [config]);

  const widgetIds = useMemo(() => visibleWidgets.map((w) => w.widgetId), [visibleWidgets]);

  const [activeTab, setActiveTab] = useState<TabFilter>('all');

  const filteredWidgets = useMemo(() => {
    if (activeTab === 'all') return visibleWidgets;
    return visibleWidgets.filter((w) => {
      const def = getWidgetById(w.widgetId);
      return def?.category === activeTab;
    });
  }, [visibleWidgets, activeTab]);

  const filteredIds = useMemo(() => filteredWidgets.map((w) => w.widgetId), [filteredWidgets]);

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
        <p className="mt-1 text-xs">우측 상단의 위젯 관리 버튼으로 위젯을 추가하세요</p>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      {/*
        배경 이미지 레이어.

        sticky + 높이 0 인 껍데기를 두고 그 안에서 배경을 아래로 그린다. 껍데기가 자리를
        차지하지 않으므로 위젯 배치는 그대로면서, 배경만 스크롤 영역 맨 위에 붙어 항상
        보이는 창 안에 머무른다. 높이를 재기 전(첫 그림)에는 예전처럼 위젯 영역을 채운다.
      */}
      {ws.backgroundImage && (
        <div className="sticky top-0 h-0 pointer-events-none">
          <div
            className="absolute inset-x-0 top-0 rounded-xl"
            style={{
              height: scrollportHeight ?? '100vh',
              backgroundImage: `url(${ws.backgroundImage})`,
              // 'contain' 은 사진 전체를 넣는 대신 여백이 생긴다. 여백에 사진이 되풀이되면
              // 잘림보다 더 어수선하므로 반복을 반드시 끈다.
              backgroundSize: ws.backgroundImageFit ?? 'cover',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              opacity: ws.backgroundImageOpacity,
            }}
          />
        </div>
      )}

      {/*
        탭 바 — 위젯이 4개 초과일 때 표시.

        `relative` 를 주는 이유: 배경 레이어는 위치가 잡힌(positioned) 요소라 그냥 두면
        평범한 흐름에 있는 탭 바보다 나중에 그려져 탭 글씨를 덮는다(사진 불투명도를 높이면
        '관리' 탭이 사진에 묻혔다). 탭 바도 위치를 잡아 배경보다 뒤에 그려지게 한다.
      */}
      {visibleWidgets.length > 4 && (
        <div className="relative">
          <WidgetTabBar activeTab={activeTab} onTabChange={setActiveTab} />
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={filteredIds} strategy={rectSortingStrategy}>
          <div
            className="widget-grid grid grid-cols-1 md:grid-cols-4 grid-flow-row-dense"
            style={{ gap: `${ws.cardGap}px`, gridAutoRows: `${ws.gridRowHeight ?? 80}px` }}
          >
            {filteredWidgets.map((instance) => {
              const definition = getWidgetById(instance.widgetId);
              if (!definition) return null;

              return (
                <SortableWidget
                  key={instance.widgetId}
                  instance={instance}
                  definition={definition}
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
        <DragOverlay
          dropAnimation={{
            duration: 200,
            easing: 'ease',
          }}
        >
          {activeWidget && (
            <div
              className="ring-2 ring-sp-accent/50 shadow-lg shadow-sp-accent/20 overflow-hidden bg-sp-card"
              style={{
                borderRadius: 'var(--sp-card-radius, 12px)',
                maxHeight:
                  activeWidget.instance.rowSpan * (ws.gridRowHeight ?? 80) +
                  (activeWidget.instance.rowSpan - 1) * ws.cardGap,
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
