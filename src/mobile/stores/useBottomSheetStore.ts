import { create } from 'zustand';

/**
 * 모바일 바텀시트/모달 열림 상태 전역 카운터.
 *
 * 시트 컴포넌트가 마운트되는 동안 `openCount` 가 +1, 언마운트되면 -1. QuickAddFab 같이
 * 화면에 떠 있는 floating UI 가 시트 위로 떠올라 버튼을 가리는 회귀를 막기 위해
 * 사용한다. 같은 패턴: useSwipeRowStore(한 행만 열림) · useSwipeUndoStore(최신 1건).
 *
 * 사용: 시트 컴포넌트에서 `useBottomSheet(true)` 훅을 1줄 호출하면 끝. 마운트/언마운트
 * 시 자동으로 push/pop. 여러 시트가 동시에 열려도 카운터가 올바르게 누적된다.
 */
interface BottomSheetState {
  /** 현재 열려 있는 바텀시트/모달 개수. 0 이면 닫혀 있음. */
  openCount: number;
  push: () => void;
  pop: () => void;
}

export const useBottomSheetStore = create<BottomSheetState>((set) => ({
  openCount: 0,
  push: () => set((s) => ({ openCount: s.openCount + 1 })),
  pop: () => set((s) => ({ openCount: Math.max(0, s.openCount - 1) })),
}));

/** 바텀시트가 현재 하나라도 열려 있는지. QuickAddFab 등 floating UI 가 구독. */
export const useIsAnyBottomSheetOpen = (): boolean => useBottomSheetStore((s) => s.openCount > 0);
