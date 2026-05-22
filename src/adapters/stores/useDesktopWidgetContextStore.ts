import { create } from 'zustand';

/**
 * 데스크톱 위젯 BrowserWindow 컨텍스트 플래그.
 *
 * Widget.tsx 최상단에서 `setIsDesktopWidget(true)`를 호출해 활성화.
 * 메인 앱(App.tsx)에서는 호출하지 않으므로 기본값 false.
 *
 * G009: WidgetModal readOnly shim — 위젯 창에서 모달 본문을 읽기 전용으로 렌더링.
 * WidgetSettingsPanel(📋/🎨 패널)은 이 플래그와 무관하게 항상 쓰기 모드 유지.
 */
interface DesktopWidgetContextState {
  isDesktopWidget: boolean;
  setIsDesktopWidget: (value: boolean) => void;
}

export const useDesktopWidgetContextStore = create<DesktopWidgetContextState>((set) => ({
  isDesktopWidget: false,
  setIsDesktopWidget: (value) => set({ isDesktopWidget: value }),
}));
