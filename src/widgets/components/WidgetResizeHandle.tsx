interface WidgetResizeHandleProps {
  currentSpan: 1 | 2 | 3 | 4;
  minSpan: 1 | 2 | 3 | 4;
  onResize: (colSpan: 1 | 2 | 3 | 4) => void;
}

const SPANS: readonly (1 | 2 | 3 | 4)[] = [1, 2, 3, 4];

/**
 * 위젯 가로 크기 조절 핸들
 * 편집 모드에서 hover 시 우하단에 1/2/3/4 버튼 표시
 */
export function WidgetResizeHandle({ currentSpan, minSpan, onResize }: WidgetResizeHandleProps) {
  return (
    <div className="absolute bottom-2 right-2 z-10 flex gap-0.5 opacity-0 group-hover/widget:opacity-100 transition-opacity">
      {SPANS.map((span) => {
        const isActive = span === currentSpan;
        const isDisabled = span < minSpan;

        return (
          <button
            key={span}
            onClick={(e) => {
              e.stopPropagation();
              if (!isDisabled) onResize(span);
            }}
            disabled={isDisabled}
            className={`
              w-5 h-5 rounded text-[10px] font-bold transition-colors
              ${isActive
                ? 'bg-sp-accent text-white'
                : isDisabled
                  ? 'bg-sp-surface/50 text-sp-border cursor-not-allowed'
                  : 'bg-sp-surface/80 text-sp-muted hover:text-sp-text hover:bg-sp-card'
              }
            `}
            title={`${span}칸 너비`}
          >
            {span}
          </button>
        );
      })}
    </div>
  );
}
