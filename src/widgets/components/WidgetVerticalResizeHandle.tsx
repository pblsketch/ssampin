import { useRef, useState, useCallback, useEffect } from 'react';

interface WidgetVerticalResizeHandleProps {
  currentRowSpan: number;
  minRowSpan: number;
  onResize: (rowSpan: number) => void;
}

export function WidgetVerticalResizeHandle({
  currentRowSpan,
  minRowSpan,
  onResize,
}: WidgetVerticalResizeHandleProps) {
  const handleRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewSpan, setPreviewSpan] = useState(currentRowSpan);
  const previewRef = useRef(currentRowSpan);

  useEffect(() => {
    previewRef.current = currentRowSpan;
    setPreviewSpan(currentRowSpan);
  }, [currentRowSpan]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const startY = e.clientY;
      const startSpan = currentRowSpan;

      // 그리드 컨테이너에서 줄 높이·간격을 직접 읽음 (대시보드 16px / 위젯 모드 12px 등 차이 대응)
      let gridEl: HTMLElement | null = handleRef.current;
      while (gridEl && !gridEl.classList.contains('grid')) {
        gridEl = gridEl.parentElement;
      }
      const gridStyle = gridEl ? getComputedStyle(gridEl) : null;
      const rowHeight = (gridStyle && parseFloat(gridStyle.gridAutoRows)) || 80;
      const gap = (gridStyle && (parseFloat(gridStyle.rowGap) || parseFloat(gridStyle.gap))) || 16;
      // 위젯 모드 분할 레이아웃의 transform: scale() 보정 — 시각 px → 레이아웃 px
      const scale = gridEl ? gridEl.getBoundingClientRect().width / gridEl.offsetWidth || 1 : 1;

      previewRef.current = startSpan;
      setIsDragging(true);
      setPreviewSpan(startSpan);

      const onMove = (ev: PointerEvent) => {
        const deltaY = (ev.clientY - startY) / scale;
        const deltaSpans = Math.round(deltaY / (rowHeight + gap));
        const raw = startSpan + deltaSpans;
        const clamped = Math.max(minRowSpan, Math.min(12, raw));
        previewRef.current = clamped;
        setPreviewSpan(clamped);
      };

      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        setIsDragging(false);
        const finalSpan = previewRef.current;
        if (finalSpan !== startSpan) {
          onResize(finalSpan);
        }
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    },
    [currentRowSpan, minRowSpan, onResize],
  );

  return (
    <>
      {/* 하단 가장자리 드래그 핸들 — 카드 테두리에 걸치게 배치 */}
      <div
        ref={handleRef}
        onPointerDown={handlePointerDown}
        title="드래그하여 높이 조절"
        className={`absolute left-0 right-0 -bottom-1.5 h-3 cursor-row-resize z-10
          flex items-center justify-center
          opacity-0 group-hover/widget:opacity-100 transition-opacity duration-200
          ${isDragging ? '!opacity-100' : ''}`}
      >
        {/* 시각적 그립 바 (가로) — sp 토큰은 /N 투명도 수식이 안 먹으므로 opacity 유틸 사용 */}
        <div
          className={`h-1.5 w-12 rounded-full shadow-sm bg-sp-accent transition-opacity ${isDragging ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
        />
      </div>

      {isDragging && (
        <div className="absolute inset-0 z-10 rounded-xl border-2 border-sp-accent/40 pointer-events-none flex items-end justify-center pb-3">
          <span className="bg-sp-accent text-sp-accent-fg text-xs font-medium px-2.5 py-1 rounded-md shadow-lg">
            {previewSpan}행
          </span>
        </div>
      )}
    </>
  );
}
