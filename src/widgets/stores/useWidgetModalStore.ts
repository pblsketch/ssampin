import { create } from 'zustand';

/**
 * 위젯 확장 모달 전역 상태.
 *
 * AC4: 이미 열린 모달이 있을 때 다른 카드를 클릭하면
 * 현재 열린 모달이 잠깐 attention flash를 표시한다.
 *
 * - openId: 현재 열려 있는 모달의 widgetId (없으면 null)
 * - flashKey: 숫자 카운터. 값이 변경될 때마다 열린 모달이 flash 애니메이션을 트리거.
 */
interface WidgetModalState {
  openId: string | null;
  flashKey: number;
  setOpenId: (id: string | null) => void;
  triggerFlash: () => void;
}

export const useWidgetModalStore = create<WidgetModalState>((set) => ({
  openId: null,
  flashKey: 0,
  setOpenId: (id) => set({ openId: id }),
  triggerFlash: () => set((s) => ({ flashKey: s.flashKey + 1 })),
}));
