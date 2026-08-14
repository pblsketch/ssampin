import { create } from 'zustand';

/**
 * 최근 연 쌤도구 — 기기별 UI 환경설정.
 *
 * Drive 동기화 대상이 아니므로 localStorage 에 독립 저장한다(useMobileViewPrefsStore 와
 * 같은 패턴). 선생님 본인 기기에서 "방금 쓰던 것"을 앞에 두기 위한 순서 정보일 뿐,
 * 점수나 보상이 아니다 — 게이미피케이션 금지 규칙과 무관하다.
 *
 * 목록 자체의 순서는 고정이다. 자주 쓴다고 도구 위치가 매번 바뀌면 손이 기억하지
 * 못한다. 바뀌는 것은 맨 위 "최근 사용" 줄뿐이다.
 */
const RECENT_KEY = 'ssampin-mobile-recent-tools';

/** 한 줄(4칸)만 채운다. 더 늘리면 "최근"이 아니라 또 하나의 목록이 된다. */
export const RECENT_TOOLS_LIMIT = 4;

function readRecent(): readonly string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string').slice(0, RECENT_TOOLS_LIMIT);
  } catch {
    return [];
  }
}

function writeRecent(ids: readonly string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

interface MobileRecentToolsState {
  recentToolIds: readonly string[];
  /** 도구를 열 때 호출. 이미 있으면 맨 앞으로 올린다(중복 없음). */
  markUsed: (toolId: string) => void;
}

export const useMobileRecentToolsStore = create<MobileRecentToolsState>((set, get) => ({
  recentToolIds: readRecent(),

  markUsed: (toolId) => {
    const next = [toolId, ...get().recentToolIds.filter((id) => id !== toolId)].slice(
      0,
      RECENT_TOOLS_LIMIT,
    );
    writeRecent(next);
    set({ recentToolIds: next });
  },
}));
