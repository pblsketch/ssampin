import { create } from 'zustand';

/** 스와이프 빠른 기록 직후 잠깐 떠 있는 "되돌리기" 토스트 상태. 항상 최신 1건만 유지한다. */
interface SwipeUndoState {
  message: string | null;
  /** 되돌리기 버튼을 누르면 실행할 콜백 (원래 상태로 복구). */
  onUndo: (() => void | Promise<void>) | null;
  /** show 호출마다 +1 — 만료 타이머가 자기 토큰일 때만 닫도록 해 경쟁을 막는다. */
  token: number;
  show: (message: string, onUndo: () => void | Promise<void>) => void;
  dismiss: () => void;
}

const AUTO_DISMISS_MS = 5000;

export const useSwipeUndoStore = create<SwipeUndoState>((set, get) => ({
  message: null,
  onUndo: null,
  token: 0,
  show: (message, onUndo) => {
    const token = get().token + 1;
    set({ message, onUndo, token });
    setTimeout(() => {
      if (get().token === token) set({ message: null, onUndo: null });
    }, AUTO_DISMISS_MS);
  },
  dismiss: () => set({ message: null, onUndo: null }),
}));
