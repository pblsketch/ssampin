import { getWidgetById } from '../registry';
import { WidgetCard } from './WidgetCard';
import type { WidgetInstance } from '../types';

interface WidgetPanelProps {
  widgets: WidgetInstance[];
  cols: number;
  cardMaxHeight: number;
}

/**
 * 개별 패널 내부 그리드.
 * 분할 모드에서는 colSpan을 무시하고 균등 배분한다.
 */
export function WidgetPanel({ widgets, cols, cardMaxHeight }: WidgetPanelProps) {
  if (widgets.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sp-muted">
        <p className="text-xs">표시할 위젯 없음</p>
      </div>
    );
  }

  return (
    <div
      className="grid gap-3 h-full w-full content-start"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      }}
    >
      {widgets.map((instance) => {
        const definition = getWidgetById(instance.widgetId);
        if (!definition) return null;

        return (
          <div
            key={instance.widgetId}
            className="overflow-hidden"
            style={{ maxHeight: cardMaxHeight }}
          >
            <WidgetCard definition={definition} maxHeight={cardMaxHeight} />
          </div>
        );
      })}
    </div>
  );
}
