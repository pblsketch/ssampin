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

function getColsPerPanel(mode: WidgetLayoutMode): number {
  switch (mode) {
    case 'full': return 3;
    case 'split-v': return 3;
    case 'split-h': return 2;
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
    cols: getColsPerPanel(layoutMode),
    cardMaxHeight: 300,
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
      const cols = getColsPerPanel(layoutMode);

      // 패널 하나의 높이
      const isVerticalSplit = layoutMode === 'split-v' || layoutMode === 'quad';
      const panelRows = isVerticalSplit ? 2 : 1;
      const panelHeight = (containerHeight - GAP * (panelRows - 1)) / panelRows;

      // 패널 하나의 너비
      const isHorizontalSplit = layoutMode === 'split-h' || layoutMode === 'quad';
      const panelCols = isHorizontalSplit ? 2 : 1;
      const panelWidth = (containerWidth - GAP * (panelCols - 1)) / panelCols;

      // 패널당 카드 수
      const cardsPerPanel = Math.ceil(widgetCount / panelCount);
      const rowsPerPanel = Math.ceil(cardsPerPanel / cols);

      // 최소 높이 보장
      const cardMaxHeight = rowsPerPanel > 0
        ? Math.max(80, (panelHeight - GAP * (rowsPerPanel - 1)) / rowsPerPanel)
        : 300;

      // 너비가 좁으면 열 수 줄이기
      const MIN_CARD_WIDTH = 140;
      const effectiveCols = Math.max(1, Math.min(cols, Math.floor((panelWidth + GAP) / (MIN_CARD_WIDTH + GAP))));

      setResult({ cols: effectiveCols, cardMaxHeight });
    };

    compute();

    const observer = new ResizeObserver(compute);
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef, widgetCount, layoutMode]);

  return result;
}
