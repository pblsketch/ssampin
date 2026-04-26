/**
 * v2.1 Phase D — 학생 자기 카드 sky 액션 메뉴 (Design v2.1 §5.4 / §11.1).
 *
 * RealtimeWallCard 우상단에 hover 시 표시 (group-hover:opacity-100).
 * 학생 자기 카드(isOwnCard true)에서만 마운트 — 다른 학생/교사 카드에는 DOM 자체 부재.
 *
 * 색상 정책: 교사 액션은 rose, 학생 자기 액션은 sky (시각 구분 — Plan FR-D1).
 */

interface RealtimeWallCardOwnerActionsProps {
  readonly onEdit?: () => void;
  readonly onDelete?: () => void;
}

export function RealtimeWallCardOwnerActions({
  onEdit,
  onDelete,
}: RealtimeWallCardOwnerActionsProps) {
  if (!onEdit && !onDelete) return null;

  return (
    <div className="flex items-center gap-0.5">
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label="카드 수정"
          title="수정"
          className="rounded-md p-1 text-sky-300/70 transition hover:bg-sky-400/10 hover:text-sky-300"
        >
          <span className="material-symbols-outlined text-base">edit</span>
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="카드 삭제"
          title="삭제"
          className="rounded-md p-1 text-sky-300/70 transition hover:bg-rose-500/10 hover:text-rose-400"
        >
          <span className="material-symbols-outlined text-base">delete</span>
        </button>
      )}
    </div>
  );
}
