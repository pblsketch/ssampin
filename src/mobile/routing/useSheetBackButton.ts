import { useEffect, useRef } from 'react';

/**
 * 바텀시트가 열려 있는 동안 히스토리 항목을 하나 쌓아, 뒤로가기가 화면 이동 대신
 * 시트만 닫게 한다.
 *
 * 안드로이드 사용자는 시트를 열고 뒤로가기를 누르면 시트가 닫히기를 기대한다.
 * 이게 없으면 시트는 그대로 있고 뒤쪽 화면이 바뀌어 버린다.
 *
 * 주소는 바꾸지 않는다(같은 URL 로 pushState). 시트는 "어디에 있는가"가 아니라
 * "지금 무엇을 하고 있는가"라서, 주소에 남기면 딥링크·새로고침 때 되살아나
 * 오히려 어색하다.
 *
 * 중첩 시트(시트 위 확인 다이얼로그)는 각자 항목을 쌓으므로 뒤로가기가 위쪽부터
 * 하나씩 닫는다.
 */
export function useSheetBackButton(onClose: () => void): void {
  // onClose 가 매 렌더 새 함수로 와도 리스너를 재등록하지 않도록 최신값만 참조한다.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const state = (window.history.state ?? {}) as Record<string, unknown>;
    // depth 를 그대로 물려준다. 시트가 화면 이동 깊이를 흔들면 안 된다.
    window.history.pushState(
      { ...state, sheet: ((state.sheet as number | undefined) ?? 0) + 1 },
      '',
      window.location.href,
    );

    let closedByBackButton = false;
    const onPop = () => {
      closedByBackButton = true;
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPop);

    return () => {
      window.removeEventListener('popstate', onPop);
      // 뒤로가기가 아니라 X·바깥클릭·Esc 로 닫힌 경우, 우리가 쌓아둔 항목이 그대로
      // 남아 있다. 그걸 비워주지 않으면 다음 뒤로가기가 "아무 일도 안 일어나는"
      // 한 번을 삼킨다. 닫힘 경로가 무엇이든 히스토리 수지가 맞아야 한다.
      if (!closedByBackButton) {
        const cur = (window.history.state ?? {}) as Record<string, unknown>;
        if (((cur.sheet as number | undefined) ?? 0) > 0) {
          window.history.back();
        }
      }
    };
  }, []);
}
