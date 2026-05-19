/**
 * 명령 팔레트(Ctrl+K) 등 외부 진입점에서 "여러 날 출결" intent 를 전달하기 위한 휘발성 store.
 *
 * - persist 없음: 페이지 이동 후 1회 consume 되면 reset
 * - Homeroom Records 입력 모드가 mount 시 consume → 출결 카테고리 자동 선택 + multi 모드 ON
 *
 * Spec: `docs/01-plan/features/multi-date-attendance.plan.md` FR-10
 */

import { create } from 'zustand';

interface MultiDateAttendanceIntentState {
  /** intent 가 살아있는지 (true 면 InputMode 가 mount 시 consume) */
  pending: boolean;
  /** 다중 날짜 모드 — 'range' 또는 'multi' (단일 모드는 intent 가 무의미) */
  preferredMode: 'range' | 'multi';
  /** 출결 카테고리 자동 선택 (현재는 '결석' 만 지원) */
  preferredAttendanceType: '결석' | '지각' | '조퇴' | '결과';

  /** intent 설정 — 명령 팔레트가 호출 */
  setIntent: (preferredMode?: 'range' | 'multi') => void;
  /** intent consume — InputMode 가 호출 후 reset */
  consume: () => void;
}

export const useMultiDateAttendanceIntentStore = create<MultiDateAttendanceIntentState>((set) => ({
  pending: false,
  preferredMode: 'multi',
  preferredAttendanceType: '결석',

  setIntent: (preferredMode = 'multi') => {
    set({ pending: true, preferredMode });
  },

  consume: () => {
    set({ pending: false });
  },
}));
