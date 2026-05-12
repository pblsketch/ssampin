import { create } from 'zustand';

/** 전역 FAB → 페이지에 "추가 모달 열기" 같은 1회성 요청을 전달하는 트리거. */
export type UiTriggerAction = 'add-event' | 'add-todo';

interface MobileUiTriggerState {
  pendingAction: UiTriggerAction | null;
  requestAction: (action: UiTriggerAction) => void;
  /** 페이지가 소비한 뒤 호출. (인자로 받은 action 이 현재 pending 과 같을 때만 비움 — 경쟁 방지) */
  consumeAction: (action: UiTriggerAction) => void;
}

export const useMobileUiTriggerStore = create<MobileUiTriggerState>((set, get) => ({
  pendingAction: null,
  requestAction: (action) => set({ pendingAction: action }),
  consumeAction: (action) => {
    if (get().pendingAction === action) set({ pendingAction: null });
  },
}));
