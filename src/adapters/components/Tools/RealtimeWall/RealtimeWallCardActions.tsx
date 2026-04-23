export interface RealtimeWallCardActionsProps {
  readonly onTogglePin?: () => void;
  readonly onHide?: () => void;
}

/**
 * 카드 우측 상단에 호버 시 노출되는 핀/숨김 액션 버튼 모음.
 * Kanban/Freeform/Grid/Stream 보드 공통.
 * onTogglePin/onHide가 모두 undefined면 null을 반환(읽기 전용 렌더 용).
 */
export function RealtimeWallCardActions({
  onTogglePin,
  onHide,
}: RealtimeWallCardActionsProps) {
  if (!onTogglePin && !onHide) return null;

  return (
    <div className="flex items-center gap-0.5">
      {onTogglePin && (
        <button
          type="button"
          onClick={onTogglePin}
          className="rounded-md p-1 text-sp-muted/60 transition hover:bg-amber-400/10 hover:text-amber-300"
          title="고정 토글"
        >
          <span className="material-symbols-outlined text-[16px]">push_pin</span>
        </button>
      )}
      {onHide && (
        <button
          type="button"
          onClick={onHide}
          className="rounded-md p-1 text-sp-muted/60 transition hover:bg-red-500/10 hover:text-red-400"
          title="숨기기"
        >
          <span className="material-symbols-outlined text-[16px]">visibility_off</span>
        </button>
      )}
    </div>
  );
}
