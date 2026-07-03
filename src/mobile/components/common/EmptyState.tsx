interface EmptyStateProps {
  /** material-symbols 아이콘 이름. mascot=true 이면 무시. */
  icon?: string;
  /** true 면 아이콘 대신 쌤핀이 마스코트 일러스트를 보여준다. */
  mascot?: boolean;
  /** 안내 문구(주). */
  text: string;
  /** 보조 안내 문구(선택) — 다음에 무엇을 하면 되는지 힌트. */
  hint?: string;
  /** 액션 버튼 라벨(선택). onAction 과 함께 있을 때만 버튼을 렌더한다. */
  actionLabel?: string;
  /** 액션 버튼 클릭 핸들러(선택). */
  onAction?: () => void;
}

/**
 * 비어 있는 목록 안내 블록 — 아이콘(또는 쌤핀이 마스코트) + 안내문 + 선택적 액션 버튼.
 * MemoPage·ClassProgressTab·ClassObservationTab 등에서 공용으로 사용.
 *
 * - `mascot` 를 켜면 읽기 전용/첫 진입 화면을 위한 마스코트 일러스트가 뜬다.
 * - `actionLabel`+`onAction` 이 모두 있을 때만 버튼이 렌더된다(읽기 전용 빈 화면은 생략).
 */
export function EmptyState({ icon, mascot, text, hint, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
      {mascot ? (
        <img src="/floating-pin.png" alt="" aria-hidden className="h-24 w-24 select-none" />
      ) : (
        <span className="material-symbols-outlined text-4xl text-sp-muted">{icon}</span>
      )}
      <p className="text-sm font-medium text-sp-text">{text}</p>
      {hint && <p className="-mt-1.5 text-xs text-sp-muted">{hint}</p>}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-1 rounded-xl bg-sp-accent px-4 py-2 text-sm font-medium text-sp-accent-fg transition-transform active:scale-95"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
