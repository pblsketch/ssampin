import { useCallback, useEffect, useRef, useState } from 'react';
import { getWidgetById } from '../registry';
import { WidgetCard } from './WidgetCard';
import type { WidgetInstance } from '../types';

interface WidgetPanelProps {
  widgets: WidgetInstance[];
  cols: number;
  cardMaxHeight: number;
}

/**
 * 개별 패널 내부 그리드 (하이브리드 페이지네이션).
 * 패널 높이에 맞는 카드만 표시하고, 넘치는 카드는
 * 하단 화살표로 다음 페이지를 슬라이드하여 확인.
 */
export function WidgetPanel({ widgets, cols, cardMaxHeight }: WidgetPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [cardsPerPage, setCardsPerPage] = useState(widgets.length);

  // 컨테이너 높이에 맞는 카드 수 계산
  useEffect(() => {
    const el = containerRef.current;
    if (!el || cardMaxHeight <= 0) {
      setCardsPerPage(widgets.length);
      return;
    }

    const GAP = 8; // gap-2
    const INDICATOR_HEIGHT = 28; // 하단 인디케이터 영역

    const compute = () => {
      const panelHeight = el.getBoundingClientRect().height;
      if (panelHeight <= 0) return;

      const availableHeight = panelHeight - INDICATOR_HEIGHT;
      const rowHeight = cardMaxHeight + GAP;
      const visibleRows = Math.max(1, Math.floor((availableHeight + GAP) / rowHeight));
      const perPage = visibleRows * cols;

      setCardsPerPage(Math.max(1, perPage));
    };

    compute();

    const observer = new ResizeObserver(compute);
    observer.observe(el);
    return () => observer.disconnect();
  }, [cardMaxHeight, cols, widgets.length]);

  const totalPages = Math.max(1, Math.ceil(widgets.length / cardsPerPage));
  const hasOverflow = totalPages > 1;

  // 페이지가 범위를 벗어나면 보정
  useEffect(() => {
    if (page >= totalPages) setPage(Math.max(0, totalPages - 1));
  }, [page, totalPages]);

  const pageWidgets = widgets.slice(
    page * cardsPerPage,
    (page + 1) * cardsPerPage,
  );

  const goNext = useCallback(() => {
    setPage((p) => Math.min(p + 1, totalPages - 1));
  }, [totalPages]);

  const goPrev = useCallback(() => {
    setPage((p) => Math.max(p - 1, 0));
  }, []);

  if (widgets.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sp-muted">
        <p className="text-xs">표시할 위젯 없음</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full w-full flex flex-col min-h-0">
      {/* 카드 그리드 (현재 페이지) */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div
          className="grid gap-2 w-full h-full content-start"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          }}
        >
          {pageWidgets.map((instance) => {
            const definition = getWidgetById(instance.widgetId);
            if (!definition) return null;

            return (
              <div
                key={instance.widgetId}
                className="overflow-hidden"
                style={{ maxHeight: cardMaxHeight > 0 ? cardMaxHeight : undefined }}
              >
                <WidgetCard definition={definition} maxHeight={cardMaxHeight > 0 ? cardMaxHeight : undefined} />
              </div>
            );
          })}
        </div>
      </div>

      {/* 하단 페이지 인디케이터 (오버플로우 시에만) */}
      {hasOverflow && (
        <div className="flex-shrink-0 flex items-center justify-center gap-2 pt-1 pb-0.5">
          {/* 이전 페이지 */}
          <button
            onClick={goPrev}
            disabled={page === 0}
            className="p-0.5 rounded transition-colors disabled:opacity-20 hover:bg-sp-border/40 text-sp-muted hover:text-sp-text"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              chevron_left
            </span>
          </button>

          {/* 도트 인디케이터 */}
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={[
                  'rounded-full transition-all',
                  i === page
                    ? 'w-4 h-1.5 bg-sp-accent'
                    : 'w-1.5 h-1.5 bg-sp-muted/40 hover:bg-sp-muted/70',
                ].join(' ')}
              />
            ))}
          </div>

          {/* 다음 페이지 */}
          <button
            onClick={goNext}
            disabled={page === totalPages - 1}
            className="p-0.5 rounded transition-colors disabled:opacity-20 hover:bg-sp-border/40 text-sp-muted hover:text-sp-text"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              chevron_right
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
