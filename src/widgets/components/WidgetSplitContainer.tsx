import type { WidgetLayoutMode } from '@domain/entities/Settings';
import type { WidgetInstance } from '../types';
import { WidgetPanel } from './WidgetPanel';

interface WidgetSplitContainerProps {
  layoutMode: WidgetLayoutMode;
  widgets: WidgetInstance[];
}

/** 전체화면 기준 열 수 (항상 3열) */
const FULL_MODE_COLS = 3;

/** 위젯 목록을 N개 패널로 균등 분배 */
function splitWidgets(widgets: WidgetInstance[], panelCount: number): WidgetInstance[][] {
  if (panelCount <= 1) return [widgets];
  const perPanel = Math.ceil(widgets.length / panelCount);
  const panels: WidgetInstance[][] = [];
  for (let i = 0; i < panelCount; i++) {
    panels.push(widgets.slice(i * perPanel, (i + 1) * perPanel));
  }
  return panels;
}

function getPanelCount(mode: WidgetLayoutMode): number {
  switch (mode) {
    case 'full': return 1;
    case 'split-h': return 2;
    case 'split-v': return 2;
    case 'quad': return 4;
  }
}

/**
 * 분할 컨테이너: 4가지 레이아웃 모드에 따라 패널을 배치한다.
 * 카드 배열은 항상 전체화면 기준(3열)을 유지하고, scale로 축소하여 표시.
 * CSS transition으로 300ms ease-in-out 전환 애니메이션 적용.
 */
export function WidgetSplitContainer({ layoutMode, widgets }: WidgetSplitContainerProps) {
  const panelCount = getPanelCount(layoutMode);
  const panels = splitWidgets(widgets, panelCount);

  // 컨테이너 CSS Grid 레이아웃 결정
  const gridStyle = (() => {
    switch (layoutMode) {
      case 'full':
        return {
          gridTemplateColumns: '1fr',
          gridTemplateRows: '1fr',
        };
      case 'split-h':
        return {
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows: '1fr',
        };
      case 'split-v':
        return {
          gridTemplateColumns: '1fr',
          gridTemplateRows: '1fr 1fr',
        };
      case 'quad':
        return {
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows: '1fr 1fr',
        };
    }
  })();

  return (
    <div
      className="grid gap-3 h-full w-full transition-all duration-300 ease-in-out"
      style={gridStyle}
    >
      {panels.map((panelWidgets, idx) => (
        <div
          key={idx}
          className="min-h-0 min-w-0 overflow-hidden transition-all duration-300 ease-in-out"
        >
          <WidgetPanel
            widgets={panelWidgets}
            cols={FULL_MODE_COLS}
            layoutMode={layoutMode}
          />
        </div>
      ))}
    </div>
  );
}
