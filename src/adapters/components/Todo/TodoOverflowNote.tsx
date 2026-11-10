/**
 * 「외 N개」 — 목록이 잘렸음을 알리는 한 줄. 홈 카드와 확장 편집기가 같이 쓴다.
 *
 * 할 일 화면으로 갈 길이 있는 창에서는 [할 일에서 모두 보기] 단추를 붙이고,
 * 길이 없는 창에서는 글자만 보인다(눌러도 아무 일 없는 단추를 두지 않는다).
 */
import { useEffect, useRef } from 'react';
import { useDesktopWidgetContextStore } from '@adapters/stores/useDesktopWidgetContextStore';
import { clearStaleTodoModalMark, resolveTodoPageNavigation } from './todoOverflow';

interface TodoOverflowNoteProps {
  /** 잘려서 안 보이는 개수. 0 이하면 아무것도 그리지 않는다 */
  readonly hiddenCount: number;
}

export function TodoOverflowNote({ hiddenCount }: TodoOverflowNoteProps) {
  const isDesktopWidget = useDesktopWidgetContextStore((s) => s.isDesktopWidget);
  // 이 단추로 화면을 옮겼는지 — 옮긴 뒤 이 줄이 사라질 때만 "열린 창" 표시를 지운다
  const navigationRequestedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (navigationRequestedRef.current) clearStaleTodoModalMark();
    };
  }, []);

  if (hiddenCount <= 0) return null;

  const navigate = resolveTodoPageNavigation(isDesktopWidget);

  return (
    <p className="px-2 pt-2 text-xs text-sp-muted" data-todo-overflow-note>
      외 {hiddenCount}개
      {navigate && (
        <>
          {' · '}
          <button
            type="button"
            onClick={(e) => {
              // 카드 본체의 "눌러서 크게 보기"로 번지지 않게 한다
              e.stopPropagation();
              navigationRequestedRef.current = true;
              navigate();
            }}
            className="min-h-6 text-sp-text underline underline-offset-2 hover:text-sp-accent transition-colors"
          >
            할 일에서 모두 보기
          </button>
        </>
      )}
    </p>
  );
}
