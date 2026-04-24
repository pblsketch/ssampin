import { create } from 'zustand';

export type QuickAddKind = 'todo' | 'event' | 'memo' | 'note';

interface QuickAddState {
  isOpen: boolean;
  /** 현재 모달의 kind. closed 상태에서는 null 유지하지 않고 마지막 값 보존(exit 애니메이션용) */
  kind: QuickAddKind | null;
  /** 연속 트리거 시 kind 교체를 위한 flash 트리거 */
  swapToken: number;
  open: (kind: QuickAddKind) => void;
  close: () => void;
}

export const useQuickAddStore = create<QuickAddState>((set, get) => ({
  isOpen: false,
  kind: null,
  swapToken: 0,

  open: (kind) => {
    const state = get();
    // 이미 열려있는데 다른 kind로 트리거 → swap (flicker 방지)
    if (state.isOpen && state.kind !== kind) {
      set({ kind, swapToken: state.swapToken + 1 });
      return;
    }
    set({ isOpen: true, kind });
  },

  close: () => {
    set({ isOpen: false });
  },
}));
