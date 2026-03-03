import { useRef, useState, useCallback, useEffect } from 'react';

interface WidgetResizeHandleProps {
  currentSpan: 1 | 2 | 3 | 4;
  minSpan: 1 | 2 | 3 | 4;
  onResize: (colSpan: 1 | 2 | 3 | 4) => void;
}

const SPAN_LABELS: Record<number, string> = {
  1: '좁게',
  2: '보통',
  3: '넓게',
  4: '넓게',
};

/**
 * 위젯 가로 크기 조절 — 우측 가장자리 드래그
 * 그리드 컬럼 너비를 계산하여 드래그 거리에 따라 colSpan 변경
 */
export function WidgetResizeHandle({ currentSpan, minSpan, onResize }: WidgetResizeHandleProps) {
  const handleRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewSpan, setPreviewSpan] = useState(currentSpan);
  const previewRef = useRef(currentSpan);

  useEffect(() => {
    previewRef.current = currentSpan;
    setPreviewSpan(currentSpan);
  }, [currentSpan]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startSpan = currentSpan;

    // 그리드 컨테이너 탐색 (Tailwind 'grid' 클래스)
    let gridEl: HTMLElement | null = handleRef.current;
    while (gridEl && !gridEl.classList.contains('grid')) {
      gridEl = gridEl.parentElement;
    }
    if (!gridEl) return;

    const gridStyle = getComputedStyle(gridEl);
    const colWidths = gridStyle.gridTemplateColumns.split(' ');
    const maxCols = colWidths.length;
    if (maxCols <= 1) return; // 1열 레이아웃에서는 리사이즈 불가

    const gap = parseFloat(gridStyle.gap) || parseFloat(gridStyle.columnGap || '0') || 16;
    const colWidth = parseFloat(colWidths[0] ?? '0') || gridEl.clientWidth / maxCols;

    previewRef.current = startSpan;
    setIsDragging(true);
    setPreviewSpan(startSpan);

    const onMove = (ev: PointerEvent) => {
      const deltaX = ev.clientX - startX;
      const deltaSpans = Math.round(deltaX / (colWidth + gap));
      const raw = startSpan + deltaSpans;
      const clamped = Math.max(minSpan, Math.min(maxCols, raw)) as 1 | 2 | 3 | 4;
      previewRef.current = clamped;
      setPreviewSpan(clamped);
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      setIsDragging(false);
      const finalSpan = previewRef.current as 1 | 2 | 3 | 4;
      if (finalSpan !== startSpan) {
        onResize(finalSpan);
      }
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [currentSpan, minSpan, onResize]);

  return (
    <>
      {/* 우측 가장자리 드래그 핸들 */}
      <div
        ref={handleRef}
        onPointerDown={handlePointerDown}
        className={`absolute top-0 bottom-0 right-0 w-3 cursor-col-resize z-10
          flex items-center justify-center
          opacity-0 group-hover/widget:opacity-100 transition-opacity
          ${isDragging ? '!opacity-100' : ''}`}
      >
        {/* 시각적 그립 바 */}
        <div className={`w-1 h-10 rounded-full transition-colors ${isDragging ? 'bg-sp-accent' : 'bg-sp-muted/40 hover:bg-sp-accent/70'
          }`} />
      </div>

      {/* 드래그 중 프리뷰 오버레이 */}
      {isDragging && (
        <div className="absolute inset-0 z-10 rounded-xl border-2 border-sp-accent/40 pointer-events-none flex items-end justify-center pb-3">
          <span className="bg-sp-accent text-white text-xs font-medium px-2.5 py-1 rounded-md shadow-lg">
            {SPAN_LABELS[previewSpan]} ({previewSpan}칸)
          </span>
        </div>
      )}
    </>
  );
}
