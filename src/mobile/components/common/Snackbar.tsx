import { useState } from 'react';
import { useSnackbarStore } from '@mobile/stores/useMobileSnackbarStore';

/**
 * 화면 하단(탭바 위)에 5초간 떠 있는 스낵바. 되돌리기가 필요하면 버튼이 함께 뜬다.
 * 5초 경과 시 자동으로 사라진다(스토어가 처리). 새 메시지가 들어오면 이전 것은 즉시 교체된다.
 *
 * App 최상위에 한 번만 마운트한다. 화면마다 각자 마운트하면 그 화면에서만 뜬다.
 */
export function Snackbar() {
  const message = useSnackbarStore((s) => s.message);
  const onUndo = useSnackbarStore((s) => s.onUndo);
  const dismiss = useSnackbarStore((s) => s.dismiss);
  const token = useSnackbarStore((s) => s.token);
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
        {/* 남은 시간 진행바 — key 로 token 마다 애니메이션 재시작.
            ⚠️ bg-sp-accent/70 처럼 sp-* 토큰에 Tailwind 투명도 수식을 붙이면 색이 조용히
            투명해진다(토큰이 CSS 변수라 알파 합성이 안 됨). opacity 유틸로 분리할 것. */}
        <span
          key={token}
          className="snackbar-progress-bar absolute bottom-0 left-0 h-0.5 w-full bg-sp-accent opacity-70"
        />
      </div>
    </div>
  );
}
