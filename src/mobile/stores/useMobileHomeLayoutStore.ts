import { create } from 'zustand';

/** 홈 탭에서 사용자가 끄거나 접을 수 있는 카드 ID. */
export type HomeCardId =
  | 'currentClass'
  | 'homeroomAttendance'
  | 'classAttendance'
  | 'weather'
  | 'meal';

/**
 * 홈 탭 카드 표시/접힘 — 기기별 UI 환경설정.
 * Drive 동기화 대상이 아니므로 localStorage 에 독립 저장 (PC 설정으로 덮어써지지 않음).
 * autoSyncInterval(useMobileSettingsStore)과 동일한 패턴.
 */
const HIDDEN_KEY = 'ssampin-mobile-home-hidden-cards';
const COLLAPSED_KEY = 'ssampin-mobile-home-collapsed-cards';

function readRecord(key: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, boolean>;
    return {};
  } catch {
    return {};
  }
}

function writeRecord(key: string, value: Record<string, boolean>): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

interface MobileHomeLayoutState {
  /** true = 숨김 (기본은 표시). */
  hiddenCards: Record<string, boolean>;
  /** true = 접힘 (기본은 펼침). */
  collapsedCards: Record<string, boolean>;
  isHidden: (id: HomeCardId) => boolean;
  isCollapsed: (id: HomeCardId) => boolean;
  setHidden: (id: HomeCardId, hidden: boolean) => void;
  toggleCollapsed: (id: HomeCardId) => void;
}

export const useMobileHomeLayoutStore = create<MobileHomeLayoutState>((set, get) => ({
  hiddenCards: readRecord(HIDDEN_KEY),
  collapsedCards: readRecord(COLLAPSED_KEY),

  isHidden: (id) => get().hiddenCards[id] === true,
  isCollapsed: (id) => get().collapsedCards[id] === true,

  setHidden: (id, hidden) => {
    const next = { ...get().hiddenCards, [id]: hidden };
    if (!hidden) delete next[id];
    writeRecord(HIDDEN_KEY, next);
    set({ hiddenCards: next });
  },

  toggleCollapsed: (id) => {
    const current = get().collapsedCards[id] === true;
    const next = { ...get().collapsedCards, [id]: !current };
    if (current) delete next[id]; // toggling off → remove key
    writeRecord(COLLAPSED_KEY, next);
    set({ collapsedCards: next });
  },
}));
