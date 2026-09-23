/**
 * 관찰 기록 응원 2·3차(ADR-137) — 한 주 정리·학기 돌아보기 창을 여닫는 이 창의 상태.
 *
 * 창은 메인 창에만 그린다(바탕화면 위젯 창은 메인 창을 띄워서 연다 — 이동 문자열
 * `dashboard#observation-panel:<weekly|retrospect>`).
 */
import { create } from 'zustand';

export type ObservationPanel =
  | { readonly kind: 'weekly'; readonly week: string }
  | {
      readonly kind: 'retrospect';
      readonly term: string;
      /** 한 주 정리와 겹친 날 — 그 주를 '이번 주' 조각으로 넣는다. */
      readonly includeWeek: string | null;
    };

interface ObservationPanelState {
  readonly panel: ObservationPanel | null;
  open: (panel: ObservationPanel) => void;
  close: () => void;
}

export const useObservationPanelStore = create<ObservationPanelState>((set) => ({
  panel: null,
  open: (panel) => set({ panel }),
  close: () => set({ panel: null }),
}));
