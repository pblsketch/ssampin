interface PresetButtonProps {
  readonly cols: number;
  readonly rows: number;
  readonly active: boolean;
  readonly onClick: () => void;
}

/**
 * 그리드 프리셋 버튼 (1×3, 3×1, 2×2).
 * 미니 그리드 일러스트 + 라벨.
 */
export function PresetButton({ cols, rows, active, onClick }: PresetButtonProps) {
  // 미니 일러스트: 24×24 영역 안에 cols×rows 칸을 그린다.
  const cellW = 22 / cols;
  const cellH = 22 / rows;
  const cells = Array.from({ length: cols * rows }, (_, i) => i);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${cols}×${rows} 프리셋`}
      className={[
        'flex flex-col items-center gap-1 px-2 py-2 rounded-lg border transition-colors motion-reduce:transition-none',
        active
          ? 'bg-sp-accent/15 border-sp-accent/40 text-sp-accent'
          : 'bg-sp-card border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/25',
      ].join(' ')}
    >
      {/* 미니 그리드 일러스트 */}
      <div
        className="relative"
        style={{ width: 24, height: 24 }}
        aria-hidden="true"
      >
        {cells.map((idx) => {
          const col = idx % cols;
          const row = Math.floor(idx / cols);
          return (
            <div
              key={idx}
              className={active ? 'bg-sp-accent/60' : 'bg-sp-muted/60'}
              style={{
                position: 'absolute',
                left: 1 + col * cellW,
                top: 1 + row * cellH,
                width: cellW - 2,
                height: cellH - 2,
                borderRadius: 1.5,
              }}
            />
          );
        })}
      </div>
      <span className="text-xs font-medium">
        {cols}×{rows}
      </span>
    </button>
  );
}
