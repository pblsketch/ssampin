import { useEffect } from 'react';
import { useBottomSheetStore } from '@mobile/stores/useMobileBottomSheetStore';

/**
 * 바텀시트가 열린 동안 전역 카운터를 +1 한다.
 *
 * `isOpen` 이 `true` 일 때 push, `false` 거나 언마운트 시 pop. 보통은 시트 컴포넌트가
 * `isOpen` prop 없이 "열렸을 때만 렌더되는" 패턴이므로 그냥 `useBottomSheet(true)` 만
 * 호출해도 된다 (언마운트 시 자동 pop).
 *
 * QuickAddFab 같이 화면에 떠 있는 floating UI 가 시트 위로 떠올라 버튼을 가리는 회귀를
 * 자동으로 막는다. 시트 컴포넌트에 1줄 추가 + 새 시트 추가 시 빠뜨려도 메타 테스트로 잡힌다.
 */
export function useBottomSheet(isOpen: boolean = true): void {
  useEffect(() => {
    if (!isOpen) return;
    const { push, pop } = useBottomSheetStore.getState();
    push();
    return () => pop();
  }, [isOpen]);
}
