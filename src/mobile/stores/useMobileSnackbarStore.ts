import { create } from 'zustand';

/**
 * 화면 하단(탭바 위)에 잠깐 떠 있는 스낵바 상태. 항상 최신 1건만 유지한다.
 *
 * 원래 스와이프 빠른 기록 전용(useSwipeUndoStore)이었으나, 되돌리기가 필요한 곳이
 * 늘어나 앱 전역 부품으로 일반화했다. 삭제처럼 되돌릴 수 있어야 하는 동작은
 * 확인 대화상자 대신 이 스낵바 + 되돌리기를 쓴다(NN/g: 반복 동작이면 확인보다 취소).
 */
interface SnackbarState {
  message: string | null;
  /** 되돌리기 버튼을 누르면 실행할 콜백 (원래 상태로 복구). */
  onUndo: (() => void | Promise<void>) | null;
  /** show 호출마다 +1 — 만료 타이머가 자기 토큰일 때만 닫도록 해 경쟁을 막는다. */
  token: number;
  /** onUndo 생략 시 되돌리기 버튼 없는 안내 전용 스낵바로 표시된다. */
  show: (message: string, onUndo?: () => void | Promise<void>) => void;
  dismiss: () => void;
}

export const SNACKBAR_AUTO_DISMISS_MS = 5000;

/**
 * 대기 중인 자동 닫힘 타이머. show/dismiss 시 반드시 정리한다.
 * 토큰 검사만으로도 오작동은 막히지만, 정리하지 않으면 닫은 뒤에도 타이머가 살아남는다.
 */
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

function clearDismissTimer(): void {
  if (dismissTimer !== null) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
}

export const useSnackbarStore = create<SnackbarState>((set, get) => ({
  message: null,
  onUndo: null,
  token: 0,
  show: (message, onUndo) => {
    clearDismissTimer();
    const token = get().token + 1;
    set({ message, onUndo: onUndo ?? null, token });
    dismissTimer = setTimeout(() => {
      dismissTimer = null;
      if (get().token === token) set({ message: null, onUndo: null });
    }, SNACKBAR_AUTO_DISMISS_MS);
  },
  dismiss: () => {
    clearDismissTimer();
    set({ message: null, onUndo: null });
  },
}));

/** 컴포넌트 밖(이벤트 핸들러·유스케이스)에서 스낵바를 띄울 때. */
export function showSnackbar(message: string, onUndo?: () => void | Promise<void>): void {
  useSnackbarStore.getState().show(message, onUndo);
}
