interface RealtimeWallFreeformLockToggleProps {
  /** 현재 토글 상태 — true이면 unlock(드래그 활성), false이면 locked(기본) */
  readonly enabled: boolean;
  readonly onToggle: () => void;
  /**
   * 모바일 viewport에서는 드래그 자체가 readOnly 강제이므로 토글 비활성.
   * (페2 high-2 — 모바일은 작은 화면에서 위치 조정 실수 유발)
   */
  readonly disabled?: boolean;
}

/**
 * v2.1 Phase C-C5 — Freeform 자기 카드 잠금 토글 (Plan FR-C8 / Design v2.1 §5.1).
 *
 * 페1 critical 실수 방지: Freeform 자기 카드는 기본 locked.
 * "✏️ 위치 바꾸기" 토글 ON 시에만 react-rnd 활성.
 *
 * 위치: Freeform 보드 우상단 (보드 wrapper 안 absolute).
 * 모바일에서는 disabled 상태로 회색 + tooltip 안내.
 *
 * 회귀 위험 #6 무관 — 키보드 단축키 코드 절대 추가 X.
 * 회귀 위험 #7 무관 — dangerouslySetInnerHTML 사용 X (children plain text only).
 */
export function RealtimeWallFreeformLockToggle({
  enabled,
  onToggle,
  disabled = false,
}: RealtimeWallFreeformLockToggleProps) {
  const title = disabled
    ? '모바일에서는 위치를 바꿀 수 없어요.'
    : enabled
      ? '잠궈서 실수로 위치가 바뀌지 않도록 해요.'
      : '자기 카드만 위치를 옮길 수 있어요.';

  const label = enabled ? '🔓 위치 바꾸는 중' : '✏️ 위치 바꾸기';

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      aria-pressed={enabled}
      aria-disabled={disabled}
      title={title}
      className={[
        'inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition shadow-sm',
        disabled
          ? 'cursor-not-allowed border-sp-border bg-sp-card text-sp-muted opacity-60'
          : enabled
            ? 'border-sky-400/60 bg-sky-500/15 text-sky-300 hover:border-sky-300 hover:bg-sky-500/25'
            : 'border-sp-border bg-sp-card text-sp-text hover:border-sky-400/40 hover:text-sky-300',
      ].join(' ')}
    >
      {label}
    </button>
  );
}
