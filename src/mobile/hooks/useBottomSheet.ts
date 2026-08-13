import { useEffect } from 'react';
import { useBottomSheetStore } from '@mobile/stores/useMobileBottomSheetStore';
import { useSheetBackButton } from '@mobile/routing/useSheetBackButton';

/** 닫기 함수를 안 넘긴 시트용 자리표시자 — 뒤로가기 등록 자체를 끄므로 호출되지 않는다. */
const noop = () => {};

/**
 * 바텀시트가 열린 동안 **두 가지**를 한꺼번에 처리한다.
 *
 * 1. 전역 카운터 +1 — QuickAddFab 같은 floating UI 가 시트 위로 떠올라 버튼을 가리는 회귀 방지
 * 2. **안드로이드 뒤로가기** — 히스토리 항목을 하나 쌓아, 뒤로가기가 화면 이동 대신 시트만 닫게 함
 *
 * `onClose` 를 넘기면 2번이 켜진다. 넘기지 않으면 1번만 한다.
 *
 * 왜 한 훅으로 묶었나 — 전에는 뒤로가기가 새 `BottomSheet` 셸에만 있고, 이 훅만 부르는
 * 기존 시트 10여 개는 빠져 있었다. 시트를 열고 뒤로가기를 누르면 시트는 그대로인데
 * 뒤쪽 화면이 바뀌었다. 시트를 등록하는 입구가 하나뿐이면 다음 시트도 자동으로 얻는다.
 *
 * `isOpen` 이 `true` 일 때 push, `false` 거나 언마운트 시 pop. 보통은 시트 컴포넌트가
 * `isOpen` prop 없이 "열렸을 때만 렌더되는" 패턴이므로 `useBottomSheet(true, onClose)`
 * 처럼 부르면 된다 (언마운트 시 자동 pop).
 */
export function useBottomSheet(isOpen: boolean = true, onClose?: () => void): void {
  useEffect(() => {
    if (!isOpen) return;
    const { push, pop } = useBottomSheetStore.getState();
    push();
    return () => pop();
  }, [isOpen]);

  useSheetBackButton(onClose ?? noop, isOpen && onClose != null);
}
