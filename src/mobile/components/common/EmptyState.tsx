interface EmptyStateProps {
  /** material-symbols 아이콘 이름. */
  icon: string;
  /** 안내 문구. */
  text: string;
  /** 액션 버튼 라벨. */
  actionLabel: string;
  /** 액션 버튼 클릭 핸들러. */
  onAction: () => void;
}

/**
 * 비어 있는 목록 안내 블록 — 아이콘 + 안내문 + "첫 항목 추가" 버튼.
 * MemoPage·ClassProgressTab·ClassObservationTab 에서 라벨만 다르고 구조가 동일했던 블록을 공용화.
 */
export function EmptyState({ icon, text, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-48 gap-3">
      <span className="material-symbols-outlined text-sp-muted text-4xl">{icon}</span>
      <p className="text-sp-muted text-sm">{text}</p>
      <button
        onClick={onAction}
        className="px-4 py-2 rounded-xl bg-sp-accent text-sp-accent-fg text-sm font-medium active:scale-95 transition-transform"
      >
        {actionLabel}
      </button>
    </div>
  );
}
