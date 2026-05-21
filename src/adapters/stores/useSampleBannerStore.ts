/**
 * useSampleBannerStore.ts
 *
 * roster-sample-data-removal Phase 2 — 샘플 명렬 안내 배너 표시 토글 store.
 *
 * `useStudentStore.load()`가 마이그레이션 판정 결과 `'banner'`를 받았을 때
 * `show()`를 호출하여 상단 `<SampleRosterWarningBanner>` 노출을 유도한다.
 * 사용자가 배너의 닫기(X)를 누르면 `hide()`로 즉시 사라진다.
 *
 * "닫힘 상태 영속화"는 Settings의 `sampleRosterBannerDismissedAt`이 담당하고,
 * 본 store는 **현재 세션의 표시 의도만** 들고 있는 가벼운 상태다. (휘발성)
 *
 * 자세한 설계: `docs/02-design/features/roster-sample-data-removal.design.md` §3.7
 */
import { create } from 'zustand';

interface SampleBannerState {
  /**
   * 배너를 현재 세션에 띄울지 여부.
   *
   * - `useStudentStore.load()`에서 마이그레이션 판정이 `'banner'`이면 true.
   * - 사용자가 닫기 버튼을 누르면 false (그리고 Settings에 dismissedAt 저장).
   * - 초기값은 false — `show()`를 호출하기 전까지 절대 렌더링되지 않는다.
   */
  shouldShow: boolean;
  /** 배너 노출 활성화 (useStudentStore.load() 마이그레이션 분기에서 호출) */
  show: () => void;
  /** 배너 닫기 (사용자 X 버튼 또는 영속 해소 시 호출) */
  hide: () => void;
}

export const useSampleBannerStore = create<SampleBannerState>((set) => ({
  shouldShow: false,
  show: () => set({ shouldShow: true }),
  hide: () => set({ shouldShow: false }),
}));
