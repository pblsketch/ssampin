import { create } from 'zustand';
import { differenceInCalendarDays } from 'date-fns';

/* ─── 상태 타입 ─── */

interface SharePromptState {
  lastDismissedAt: string | null;   // ISO 날짜
  permanentlyDismissed: boolean;
  sharedCount: number;              // 공유 버튼 클릭 횟수
}

interface ShareStore {
  /** 공유 모달 열림 여부 */
  isModalOpen: boolean;
  /** 모달 트리거 출처 */
  modalTrigger: 'manual' | 'prompt';
  /** 추천 팝업 표시 여부 */
  isPromptVisible: boolean;
  /** 추천 팝업 상태 */
  promptState: SharePromptState;

  openModal: (trigger: 'manual' | 'prompt') => void;
  closeModal: () => void;
  showPrompt: () => void;
  hidePrompt: () => void;
  dismissPrompt: (permanent: boolean) => void;
  incrementSharedCount: () => void;
  /** 앱 시작 시 추천 팝업 조건 판단 */
  checkPromptEligibility: () => boolean;
}

/* ─── localStorage 키 ─── */

const PROMPT_STATE_KEY = 'ssampin-share-prompt';
const LAUNCH_COUNT_KEY = 'ssampin_launch_count';
const FIRST_LAUNCH_KEY = 'first-launch-date';
const ACTIVE_DAYS_KEY = 'ssampin-active-days';

/* ─── 헬퍼 ─── */

function loadPromptState(): SharePromptState {
  try {
    const raw = localStorage.getItem(PROMPT_STATE_KEY);
    if (!raw) return { lastDismissedAt: null, permanentlyDismissed: false, sharedCount: 0 };
    return JSON.parse(raw) as SharePromptState;
  } catch {
    return { lastDismissedAt: null, permanentlyDismissed: false, sharedCount: 0 };
  }
}

function savePromptState(state: SharePromptState): void {
  localStorage.setItem(PROMPT_STATE_KEY, JSON.stringify(state));
}

/** 설치 후 경과일 */
function getInstallDays(): number {
  const first = localStorage.getItem(FIRST_LAUNCH_KEY);
  if (!first) {
    // 첫 실행 시점 기록
    localStorage.setItem(FIRST_LAUNCH_KEY, new Date().toISOString());
    return 0;
  }
  return differenceInCalendarDays(new Date(), new Date(first));
}

/** 총 실행 횟수 (useAnalyticsLifecycle에서 이미 증가시킴) */
function getLaunchCount(): number {
  return parseInt(localStorage.getItem(LAUNCH_COUNT_KEY) || '0', 10);
}

/** 최근 N일 중 사용한 날 수 */
function getActiveDays(n: number): number {
  try {
    const raw = localStorage.getItem(ACTIVE_DAYS_KEY);
    const days: string[] = raw ? JSON.parse(raw) as string[] : [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - n);
    return days.filter((d) => new Date(d) >= cutoff).length;
  } catch {
    return 0;
  }
}

/** 오늘 날짜를 활성일로 기록 (앱 시작 시 1회 호출) */
export function recordActiveDay(): void {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  try {
    const raw = localStorage.getItem(ACTIVE_DAYS_KEY);
    const days: string[] = raw ? JSON.parse(raw) as string[] : [];
    if (!days.includes(today)) {
      days.push(today);
      // 최근 30일만 유지
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      const filtered = days.filter((d) => new Date(d) >= cutoff);
      localStorage.setItem(ACTIVE_DAYS_KEY, JSON.stringify(filtered));
    }
  } catch {
    localStorage.setItem(ACTIVE_DAYS_KEY, JSON.stringify([today]));
  }
}

/* ─── 스토어 ─── */

export const useShareStore = create<ShareStore>((set, get) => ({
  isModalOpen: false,
  modalTrigger: 'manual',
  isPromptVisible: false,
  promptState: loadPromptState(),

  openModal: (trigger) => set({ isModalOpen: true, modalTrigger: trigger }),
  closeModal: () => set({ isModalOpen: false }),

  showPrompt: () => set({ isPromptVisible: true }),
  hidePrompt: () => set({ isPromptVisible: false }),

  dismissPrompt: (permanent) => {
    const prev = get().promptState;
    const next: SharePromptState = {
      ...prev,
      lastDismissedAt: new Date().toISOString(),
      permanentlyDismissed: permanent,
    };
    savePromptState(next);
    set({ promptState: next, isPromptVisible: false });
  },

  incrementSharedCount: () => {
    const prev = get().promptState;
    const next: SharePromptState = { ...prev, sharedCount: prev.sharedCount + 1 };
    savePromptState(next);
    set({ promptState: next });
  },

  checkPromptEligibility: () => {
    const state = get().promptState;
    if (state.permanentlyDismissed) return false;

    if (state.lastDismissedAt) {
      const daysSince = differenceInCalendarDays(new Date(), new Date(state.lastDismissedAt));
      if (daysSince < 30) return false;
    }

    const installDays = getInstallDays();
    const launchCount = getLaunchCount();
    const activeDays = getActiveDays(7);

    return installDays >= 14 && launchCount >= 20 && activeDays >= 5;
  },
}));
