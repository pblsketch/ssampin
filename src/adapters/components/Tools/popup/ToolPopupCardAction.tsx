import { useCallback, useEffect, useRef, useState } from 'react';
import { isPopupToolId } from '@domain/rules/toolPopupRules';
import { useToastStore } from '@adapters/components/common/Toast';
import { useToolPopupStore } from '@adapters/stores/useToolPopupStore';
import { getToolPopupBridge } from './toolPopupBridge';

/**
 * 쌤도구 카드의 보조 버튼 — [새 창으로 열기].
 *
 * 카드 본체 클릭은 지금처럼 본문 열기다. 이 버튼만 별도 창을 연다.
 * 이미 별도 창으로 열려 있으면 새로 만들지 않고 그 창을 앞으로 가져온다.
 */
export function ToolPopupCardAction({ toolId }: { readonly toolId: string }): JSX.Element | null {
  const openToolIds = useToolPopupStore((s) => s.openToolIds);
  const subscribe = useToolPopupStore((s) => s.subscribe);
  const showToast = useToastStore((s) => s.show);
  const [busy, setBusy] = useState(false);
  // ★상태가 아니라 ref 로 막는다 — 상태 갱신은 비동기라 연속 클릭 두 번이 함께 통과한다.
  const openingRef = useRef(false);

  useEffect(() => {
    subscribe();
  }, [subscribe]);

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (!isPopupToolId(toolId)) return;
      if (openingRef.current) return;
      openingRef.current = true;
      setBusy(true);
      const bridge = getToolPopupBridge();
      void bridge
        .open(toolId, null, Date.now())
        .then((result) => {
          if (result.ok) return;
          if (result.reason === 'blocked-by-browser') {
            showToast('브라우저가 새 창을 막았습니다. 팝업 허용 후 다시 시도해 주세요.', 'error');
            return;
          }
          showToast('새 창을 열지 못했습니다. 카드를 눌러 본문에서 사용해 주세요.', 'error');
        })
        .finally(() => {
          openingRef.current = false;
          setBusy(false);
        });
    },
    [showToast, toolId],
  );

  if (!isPopupToolId(toolId)) return null;

  const alreadyOpen = openToolIds.includes(toolId);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={`absolute top-3 right-3 p-1.5 rounded-lg transition-all disabled:opacity-40 ${
        alreadyOpen
          ? 'bg-sp-accent/15 text-sp-accent'
          : 'text-sp-muted hover:text-sp-text hover:bg-sp-text/10'
      }`}
      title={alreadyOpen ? '이미 열린 창 보기' : '새 창으로 열기 — 다른 화면과 함께 사용'}
      aria-label={alreadyOpen ? '이미 열린 창 보기' : '새 창으로 열기'}
    >
      <span className="material-symbols-outlined text-icon-md">open_in_new</span>
    </button>
  );
}
