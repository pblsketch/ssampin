/**
 * 관찰 기록 응원 2·3차(ADR-137) — 한 주 정리·학기 돌아보기 창을 여닫는 이 창의 상태.
 *
 * 창은 메인 창에만 그린다(바탕화면 위젯 창은 메인 창을 띄워서 연다 — 이동 문자열
 * `dashboard#observation-panel:<weekly|retrospect>`).
 */
import { create } from 'zustand';
import type { SchoolMoment } from '@domain/rules/schoolMoments';

/**
 * 창을 그날 말로 열었고 그 말에 학교 달력 인사가 접혀 있으면 `moment` 가 실린다(돌아보기 spec 4-4) —
 * 창 맨 위 인사 한 줄. 탭 단추로 연 창에는 없다.
 */
export type ObservationPanel =
  | { readonly kind: 'weekly'; readonly week: string; readonly moment?: SchoolMoment | null }
  | {
      readonly kind: 'retrospect';
      readonly term: string;
      /** 한 주 정리와 겹친 날 — 그 주를 '이번 주' 조각으로 넣는다. */
      readonly includeWeek: string | null;
      readonly moment?: SchoolMoment | null;
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
