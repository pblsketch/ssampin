import { useEffect, useState, type RefObject } from 'react';
import type { WidgetLayoutMode } from '@domain/entities/Settings';

interface AutoFitResult {
  cols: number;
  cardMaxHeight: number;
}

function getPanelCount(mode: WidgetLayoutMode): number {
  switch (mode) {
    case 'full': return 1;
    case 'split-h': return 2;
    case 'split-v': return 2;
    case 'quad': return 4;
  }
}

function getDefaultColsPerPanel(mode: WidgetLayoutMode): number {
  switch (mode) {
    case 'full': return 3;
    case 'split-v': return 3;
    case 'split-h': return 3;
    case 'quad': return 2;
  }
}

/**
 * ResizeObserver 기반으로 컨테이너 크기를 감시하고
 * 레이아웃 모드 + 위젯 수에 따라 패널당 열 수와 카드 최대 높이를 계산한다.
 */
export function useAutoFitLayout(
  containerRef: RefObject<HTMLElement | null>,
  widgetCount: number,
  layoutMode: WidgetLayoutMode,
): AutoFitResult {
  const [result, setResult] = useState<AutoFitResult>({
    cols: getDefaultColsPerPanel(layoutMode),
    cardMaxHeight: 0,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const GAP = 12; // gap-3 = 0.75rem = 12px

    const compute = () => {
      const rect = el.getBoundingClientRect();
      const containerHeight = rect.height;
      const containerWidth = rect.width;

      const panelCount = getPanelCount(layoutMode);
      const defaultCols = getDefaultColsPerPanel(layoutMode);

      // 패널 하나의 높이
      const isVerticalSplit = layoutMode === 'split-v' || layoutMode === 'quad';
      const panelRows = isVerticalSplit ? 2 : 1;
      const panelHeight = (containerHeight - GAP * (panelRows - 1)) / panelRows;

      // 패널 하나의 너비
      const isHorizontalSplit = layoutMode === 'split-h' || layoutMode === 'quad';
      const panelCols = isHorizontalSplit ? 2 : 1;
      const panelWidth = (containerWidth - GAP * (panelCols - 1)) / panelCols;

      // 너비 기반으로 열 수 결정 (카드 최소 너비 200px 보장)
      const MIN_CARD_WIDTH = 200;
      const maxColsByWidth = Math.max(1, Math.floor((panelWidth + GAP) / (MIN_CARD_WIDTH + GAP)));
      const effectiveCols = Math.min(defaultCols, maxColsByWidth);

      // 패널당 카드 수로 행 수 계산
      const cardsPerPanel = Math.ceil(widgetCount / panelCount);
      const rowsPerPanel = Math.ceil(cardsPerPanel / effectiveCols);

      // 카드 최대 높이: 패널 높이에 맞추되, 스크롤을 허용하므로 0이면 제한 없음
      let cardMaxHeight = 0;
      if (rowsPerPanel > 0 && panelHeight > 0) {
        const fittedHeight = (panelHeight - GAP * (rowsPerPanel - 1)) / rowsPerPanel;
        // 높이가 충분하면 맞추기, 부족하면 제한 없이 스크롤
        cardMaxHeight = fittedHeight >= 100 ? fittedHeight : 0;
      }

      setResult({ cols: effectiveCols, cardMaxHeight });
    };

    compute();

    const observer = new ResizeObserver(compute);
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef, widgetCount, layoutMode]);

  return result;
}
