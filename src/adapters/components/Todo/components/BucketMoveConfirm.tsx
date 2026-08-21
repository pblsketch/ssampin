import type { Todo } from '@domain/entities/Todo';
import {
  AUTO_BOARD_BUCKET_LABELS,
  describeBucketMove,
  type AutoBoardBucket,
} from '@domain/rules/todoAutoBoard';

interface BucketMoveConfirmProps {
  todo: Todo;
  target: AutoBoardBucket;
  todayStr: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 자동 보드에서 카드를 다른 칸으로 끌었을 때 뜨는 확인창.
 *
 * 자동 보드는 날짜가 자리를 정하므로, 손으로 옮긴다는 건 **날짜를 바꾼다**는 뜻이다.
 * 사용자가 적어 둔 마감일이 소리 없이 바뀌면 안 되니 무엇이 바뀌는지 먼저 보여 준다.
 * (수동 칸반에는 이 확인이 없다 — 거기서는 옮기는 것이 곧 상태 변경이라 놀랄 일이 없다.)
 */
export function BucketMoveConfirm({
  todo,
  target,
  todayStr,
  onConfirm,
  onCancel,
}: BucketMoveConfirmProps) {
  const description = describeBucketMove(todo, target, todayStr);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="bg-sp-card rounded-2xl ring-1 ring-sp-border shadow-2xl w-full max-w-sm mx-4 p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="칸 이동 확인"
      >
        <p className="text-sp-muted text-xs mb-1">
          &lsquo;{AUTO_BOARD_BUCKET_LABELS[target]}&rsquo; 칸으로 옮깁니다
        </p>
        <p className="text-sp-text font-sp-medium mb-3 truncate">{todo.text}</p>
        <p className="text-sp-text text-sm leading-relaxed mb-5">{description}</p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-6 px-4 py-2 rounded-lg text-sm text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className="min-h-6 px-4 py-2 rounded-lg text-sm bg-sp-accent text-white hover:brightness-110 transition-all"
          >
            옮기기
          </button>
        </div>
      </div>
    </div>
  );
}
