import type { SeatingData } from '@domain/entities/Seating';

interface SnapshotPreviewGridProps {
  seating: SeatingData;
  /** 한 변 픽셀 크기 (정사각형 비례 박스). 기본 88 */
  size?: number;
}

/**
 * 스냅샷 미니 프리뷰 — 좌석 그리드를 작은 도트로 표현.
 *
 * `seating.rows × seating.cols` 비례로 렌더한다 (5x5 고정 금지).
 * 학생이 있는 셀: sp-accent 도트 / 빈 셀: sp-border 도트.
 */
export function SnapshotPreviewGrid({ seating, size = 88 }: SnapshotPreviewGridProps) {
  const { rows, cols, seats } = seating;
  const safeRows = Math.max(1, rows);
  const safeCols = Math.max(1, cols);

  return (
    <div
      aria-hidden="true"
      className="grid gap-[2px] bg-sp-surface/40 rounded-md p-1.5"
      style={{
        width: size,
        height: size,
        gridTemplateRows: `repeat(${safeRows}, 1fr)`,
        gridTemplateColumns: `repeat(${safeCols}, 1fr)`,
      }}
    >
      {Array.from({ length: safeRows }).map((_, r) =>
        Array.from({ length: safeCols }).map((__, c) => {
          const studentId = seats[r]?.[c] ?? null;
          return (
            <div
              key={`${r}-${c}`}
              className={`rounded-[1px] ${studentId ? 'bg-sp-accent/80' : 'bg-sp-border/40'}`}
            />
          );
        }),
      )}
    </div>
  );
}
