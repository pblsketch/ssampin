import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * 업데이트 알림 사용자 통제권 (v2.0.5+).
 *
 * 모달 노출 게이트:
 *   1. info.version ∈ skippedVersions  → 침묵 (보안 업데이트 예외)
 *   2. now < snoozeUntil                → 침묵 (스누즈)
 *   3. lastNotifiedVersion === version  → 사이드바 배지만 (이미 모달 1회 노출됨)
 *   else                                 → 모달 노출
 *
 * 보안 업데이트(isSecurity=true)는 모든 게이트 우회.
 */

export interface UpdatePreferencesState {
  /** 가장 최근에 사용자에게 모달로 노출된 버전 (같은 버전 재노출 차단) */
  lastNotifiedVersion: string | null;
  /** 모달 침묵 만료 시각 (Unix ms). null이면 스누즈 없음. */
  snoozeUntil: number | null;
  /** 영구 건너뛴 버전 목록. 보안 업데이트는 이 목록 무시. */
  skippedVersions: string[];
}

export interface UpdatePreferencesActions {
  /** 모달 노출 직후 호출 — 같은 버전 재노출 차단 */
  markNotified: (version: string) => void;
  /** N일 동안 모달 침묵 — Date.now() + days * 86_400_000 */
  snooze: (days: 1 | 3) => void;
  /** 영구 건너뛰기 — 더 새 버전 나올 때까지 모달도 배지도 안 뜸 */
  skip: (version: string) => void;
  /** 건너뛰기 취소 — v2.0.6+ 설정 UI에서 사용 예정 */
  unskip: (version: string) => void;
  /** 모든 상태 초기화 — 디버그/테스트용 */
  reset: () => void;
}

export type UpdatePreferencesStore = UpdatePreferencesState & UpdatePreferencesActions;

const INITIAL_STATE: UpdatePreferencesState = {
  lastNotifiedVersion: null,
  snoozeUntil: null,
  skippedVersions: [],
};

export const useUpdatePreferencesStore = create<UpdatePreferencesStore>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,

      markNotified: (version) => set({ lastNotifiedVersion: version }),

      snooze: (days) => set({ snoozeUntil: Date.now() + days * 86_400_000 }),

      skip: (version) =>
        set((s) => ({
          skippedVersions: s.skippedVersions.includes(version)
            ? s.skippedVersions
            : [...s.skippedVersions, version],
        })),

      unskip: (version) =>
        set((s) => ({
          skippedVersions: s.skippedVersions.filter((v) => v !== version),
        })),

      reset: () => set(INITIAL_STATE),
    }),
    {
      name: 'ssampin-update-prefs-v1',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({
        lastNotifiedVersion: state.lastNotifiedVersion,
        snoozeUntil: state.snoozeUntil,
        skippedVersions: state.skippedVersions,
      }),
    }
  )
);

function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

/**
 * 모달 노출 여부 판정.
 *
 * @param version 새 버전
 * @param isSecurity 보안 업데이트 여부 (true면 모든 게이트 우회)
 * @param state 영속화 상태 스냅샷
 * @param now 현재 시각 (테스트용 주입 가능)
 */
export function shouldShowUpdateModal(
  version: string,
  isSecurity: boolean,
  state: UpdatePreferencesState,
  now: number = Date.now()
): boolean {
  if (isSecurity) return true;
  if (state.skippedVersions.includes(version)) return false;
  if (state.snoozeUntil !== null && now < state.snoozeUntil) return false;
  if (state.lastNotifiedVersion === version) return false;
  return true;
}

/**
 * 사이드바 배지 표시 여부 — "이미 모달 노출됐고 스누즈 만료된 상태".
 *
 * @param newVersion 새 버전 (electron-updater에서 받음)
 * @param currentVersion 현재 앱 버전 (__APP_VERSION__)
 * @param state 영속화 상태 스냅샷
 * @param now 현재 시각 (테스트용 주입 가능)
 */
export function shouldShowSidebarBadge(
  newVersion: string,
  currentVersion: string,
  state: UpdatePreferencesState,
  now: number = Date.now()
): boolean {
  if (compareVersion(newVersion, currentVersion) <= 0) return false;
  if (state.skippedVersions.includes(newVersion)) return false;
  if (state.snoozeUntil !== null && now < state.snoozeUntil) return false;
  if (state.lastNotifiedVersion !== newVersion) return false;
  return true;
}

export const __test__ = { compareVersion };
