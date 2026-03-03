import { getWidgetById } from '../registry';
import { WidgetCard } from './WidgetCard';
import type { WidgetInstance } from '../types';
import type { WidgetLayoutMode } from '@domain/entities/Settings';

interface WidgetPanelProps {
  widgets: WidgetInstance[];
  cols: number;
  layoutMode: WidgetLayoutMode;
}

function getScaleFactor(mode: WidgetLayoutMode): number {
  switch (mode) {
    case 'full': return 1;
    case 'split-h': return 0.85;
    case 'split-v': return 0.85;
    case 'quad': return 0.7;
  }
}

/**
 * 개별 패널 내부 그리드 (스크롤 방식).
 * 전체화면 기준 카드 배열을 유지하고, 넘치는 콘텐츠는 스크롤로 확인.
 */
export function WidgetPanel({ widgets, cols, layoutMode }: WidgetPanelProps) {
  const scaleFactor = getScaleFactor(layoutMode);

  if (widgets.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sp-muted">
        <p className="text-xs">표시할 위젯 없음</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto min-h-0" style={{ scrollbarWidth: 'thin' }}>
      <div
        className="grid gap-3 w-full content-start"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        }}
      >
        {widgets.map((instance) => {
          const definition = getWidgetById(instance.widgetId);
          if (!definition) return null;

          return (
            <div key={instance.widgetId}>
              <WidgetCard definition={definition} scaleFactor={scaleFactor} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
