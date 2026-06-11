import { useRef, useState, useCallback, useEffect } from 'react';
import { SPAN_LABELS } from './WidgetResizeHandle';

interface WidgetCornerResizeHandleProps {
  currentColSpan: 1 | 2 | 3 | 4;
  currentRowSpan: number;
  minColSpan: 1 | 2 | 3 | 4;
  minRowSpan: number;
  onResize: (colSpan: 1 | 2 | 3 | 4, rowSpan: number) => void;
}

/**
 * 우하단 대각선 코너 핸들 — 가로(colSpan)+세로(rowSpan) 동시 조절
 * 창 크기 조절과 같은 관습적 affordance로 발견성을 높인다
 */
export function WidgetCornerResizeHandle({
  currentColSpan,
  currentRowSpan,
  minColSpan,
  minRowSpan,
  onResize,
}: WidgetCornerResizeHandleProps) {
  const handleRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState({ col: currentColSpan, row: currentRowSpan });
  const previewRef = useRef({ col: currentColSpan, row: currentRowSpan });

  useEffect(() => {
    previewRef.current = { col: currentColSpan, row: currentRowSpan };
    setPreview({ col: currentColSpan, row: currentRowSpan });
  }, [currentColSpan, currentRowSpan]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      const startCol = currentColSpan;
      const startRow = currentRowSpan;

      // 그리드 컨테이너 탐색 (Tailwind 'grid' 클래스)
      let gridEl: HTMLElement | null = handleRef.current;
      while (gridEl && !gridEl.classList.contains('grid')) {
        gridEl = gridEl.parentElement;
      }
      if (!gridEl) return;

      const gridStyle = getComputedStyle(gridEl);
      const colWidths = gridStyle.gridTemplateColumns.split(' ');
      const maxCols = colWidths.length;
      const gap = parseFloat(gridStyle.gap) || parseFloat(gridStyle.columnGap || '0') || 16;
      const colWidth = parseFloat(colWidths[0] ?? '0') || gridEl.clientWidth / maxCols;
      const rowHeight = parseFloat(gridStyle.gridAutoRows) || 80;

      previewRef.current = { col: startCol, row: startRow };
      setIsDragging(true);
      setPreview({ col: startCol, row: startRow });

      const onMove = (ev: PointerEvent) => {
        const deltaCols = Math.round((ev.clientX - startX) / (colWidth + gap));
        const deltaRows = Math.round((ev.clientY - startY) / (rowHeight + gap));
        // 1열 레이아웃에서는 가로 조절 불가 — 세로만
        const col =
          maxCols <= 1
            ? startCol
            : (Math.max(minColSpan, Math.min(maxCols, startCol + deltaCols)) as 1 | 2 | 3 | 4);
        const row = Math.max(minRowSpan, Math.min(12, startRow + deltaRows));
        previewRef.current = { col, row };
        setPreview({ col, row });
      };

      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        setIsDragging(false);
        const final = previewRef.current;
        if (final.col !== startCol || final.row !== startRow) {
          onResize(final.col as 1 | 2 | 3 | 4, final.row);
        }
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    },
    [currentColSpan, currentRowSpan, minColSpan, minRowSpan, onResize],
  );

  return (
    <>
      {/* 우하단 코너 드래그 핸들 — 카드 테두리에 걸치게 배치 */}
      <div
        ref={handleRef}
        onPointerDown={handlePointerDown}
        title="드래그하여 크기 조절"
        className={`absolute -bottom-1.5 -right-1.5 w-5 h-5 cursor-nwse-resize z-20
          flex items-end justify-end
          opacity-0 group-hover/widget:opacity-100 transition-opacity duration-200
          ${isDragging ? '!opacity-100' : ''}`}
      >
        {/* ㄴ자 코너 스트로크 — sp 토큰은 /N 투명도 수식이 안 먹으므로 opacity 유틸 사용 */}
        <div
          className={`w-3.5 h-3.5 rounded-br-lg border-r-[3px] border-b-[3px] border-sp-accent transition-opacity ${
            isDragging ? 'opacity-100' : 'opacity-60 hover:opacity-100'
          }`}
        />
      </div>

      {/* 드래그 중 프리뷰 오버레이 */}
      {isDragging && (
        <div className="absolute inset-0 z-10 rounded-xl border-2 border-sp-accent/40 pointer-events-none flex items-end justify-center pb-3">
          <span className="bg-sp-accent text-sp-accent-fg text-xs font-medium px-2.5 py-1 rounded-md shadow-lg">
            {SPAN_LABELS[preview.col]} {preview.col}칸 × {preview.row}행
          </span>
        </div>
      )}
    </>
  );
}
