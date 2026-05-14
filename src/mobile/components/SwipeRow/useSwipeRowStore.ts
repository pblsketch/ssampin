import { create } from 'zustand';

/** 현재 열려(액션 노출) 있는 SwipeRow 의 id. 한 번에 하나만 열리도록 조정. */
interface SwipeRowState {
  openRowId: string | null;
  /** 다른 행이 열려 있으면 닫고, rowId 를 연다 (null 이면 전부 닫기). */
  setOpenRow: (rowId: string | null) => void;
}

export const useSwipeRowStore = create<SwipeRowState>((set) => ({
  openRowId: null,
  setOpenRow: (rowId) => set({ openRowId: rowId }),
}));
