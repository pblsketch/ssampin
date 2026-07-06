import { useState } from 'react';
import { useSwipeUndoStore } from '@mobile/stores/useMobileSwipeUndoStore';

/**
 * 스와이프 빠른 기록 직후 화면 하단(탭바 위)에 5초간 떠 있는 "되돌리기" pill.
 * 5초 경과 시 자동으로 사라진다(스토어가 처리). 새 기록이 들어오면 이전 토스트는 즉시 교체된다.
 */
export function SwipeUndoToast() {
  const message = useSwipeUndoStore((s) => s.message);
  const onUndo = useSwipeUndoStore((s) => s.onUndo);
  const dismiss = useSwipeUndoStore((s) => s.dismiss);
  const token = useSwipeUndoStore((s) => s.token);
  const [busy, setBusy] = useState(false);

  if (!message) return null;

  const handleUndo = async () => {
    if (busy || !onUndo) return;
    setBusy(true);
    try {
      await onUndo();
    } finally {
      setBusy(false);
      dismiss();
    }
  };

  return (
    <div
      className="pointer-events-none fixed left-1/2 z-[60] -translate-x-1/2 bottom-[calc(var(--tab-bar-height)+12px)]"
      role="status"
      aria-live="polite"
    >
      <div className="glass-card pointer-events-auto relative flex items-center gap-3 overflow-hidden rounded-full py-2 pl-4 pr-2 shadow-lg">
        <span className="whitespace-nowrap text-sm font-medium text-sp-text">{message}</span>
        {onUndo ? (
          <button
            type="button"
            onClick={() => void handleUndo()}
            disabled={busy}
            className="shrink-0 rounded-full bg-sp-accent px-3 py-1 text-xs font-bold text-sp-accent-fg disabled:opacity-50"
          >
            되돌리기
          </button>
        ) : (
          <button
            type="button"
            onClick={dismiss}
            className="shrink-0 rounded-full bg-sp-surface px-3 py-1 text-xs font-bold text-sp-muted"
          >
            확인
          </button>
        )}
        {/* 남은 시간 진행바 — key 로 token 마다 애니메이션 재시작 */}
        <span
          key={token}
          className="swipe-undo-progress-bar absolute bottom-0 left-0 h-0.5 w-full bg-sp-accent/70"
        />
      </div>
    </div>
  );
}
