import { useRef, useState, useCallback, useEffect } from 'react';

interface WidgetVerticalResizeHandleProps {
  currentRowSpan: number;
  minRowSpan: number;
  onResize: (rowSpan: number) => void;
}

const ROW_HEIGHT = 80;
const GAP = 16;

export function WidgetVerticalResizeHandle({ currentRowSpan, minRowSpan, onResize }: WidgetVerticalResizeHandleProps) {
  const handleRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewSpan, setPreviewSpan] = useState(currentRowSpan);
  const previewRef = useRef(currentRowSpan);

  useEffect(() => {
    previewRef.current = currentRowSpan;
    setPreviewSpan(currentRowSpan);
  }, [currentRowSpan]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startY = e.clientY;
    const startSpan = currentRowSpan;

    previewRef.current = startSpan;
    setIsDragging(true);
    setPreviewSpan(startSpan);

    const onMove = (ev: PointerEvent) => {
      const deltaY = ev.clientY - startY;
      const deltaSpans = Math.round(deltaY / (ROW_HEIGHT + GAP));
      const raw = startSpan + deltaSpans;
      const clamped = Math.max(minRowSpan, Math.min(8, raw));
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
  }, [currentRowSpan, minRowSpan, onResize]);

  return (
    <>
      {/* 하단 가장자리 드래그 핸들 */}
      <div
        ref={handleRef}
        onPointerDown={handlePointerDown}
        className={`absolute left-0 right-0 bottom-0 h-3 cursor-row-resize z-10
          flex items-center justify-center
          opacity-0 group-hover/widget:opacity-100 transition-opacity
          ${isDragging ? '!opacity-100' : ''}`}
      >
        {/* 시각적 그립 바 (가로) */}
        <div className={`h-1 w-10 rounded-full transition-colors ${isDragging ? 'bg-sp-accent' : 'bg-sp-muted/40 hover:bg-sp-accent/70'}`} />
      </div>

      {isDragging && (
        <div className="absolute inset-0 z-10 rounded-xl border-2 border-sp-accent/40 pointer-events-none flex items-end justify-center pb-3">
          <span className="bg-sp-accent text-white text-xs font-medium px-2.5 py-1 rounded-md shadow-lg">
            {previewSpan}행
          </span>
        </div>
      )}
    </>
  );
}
