import { create } from 'zustand';

/**
 * 학생 탭 좌석/명단 보기 모드 — 기기별 UI 환경설정.
 * Drive 동기화 대상이 아니므로 localStorage 에 독립 저장 (PC 설정으로 덮어써지지 않음).
 * useMobileHomeLayoutStore 와 동일한 패턴.
 * 담임반('homeroom')과 수업반(teachingClass.id)을 각각 따로 기억한다.
 */
const VIEW_MODE_KEY = 'ssampin-mobile-students-view-mode';

export type StudentsViewMode = 'seating' | 'list';

function isStudentsViewMode(value: unknown): value is StudentsViewMode {
  return value === 'seating' || value === 'list';
}

function readModes(): Record<string, StudentsViewMode> {
  try {
    const raw = localStorage.getItem(VIEW_MODE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const result: Record<string, StudentsViewMode> = {};
    for (const [key, mode] of Object.entries(parsed)) {
      if (isStudentsViewMode(mode)) result[key] = mode;
    }
    return result;
  } catch {
    return {};
  }
}

function writeModes(value: Record<string, StudentsViewMode>): void {
  try {
    localStorage.setItem(VIEW_MODE_KEY, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/**
 * 학급 탭 표시 여부 — 기기별.
 *
 * 담임을 맡지 않은 선생님에게는 학급 탭이 평생 비어 있다. 그렇다고 앱이 알아서
 * 탭을 지우면 안 된다 — Apple HIG 는 "기능을 쓸 수 없다고 탭을 없애거나 비활성화하지
 * 말라"고 한다. 사람마다 탭 구성이 달라지면 앱이 예측 불가능해지고, 안내나 도움말에서
 * "학급 탭에서…"라고 말할 수 없게 된다.
 *
 * 그래서 **기본은 표시**하고, 끄는 것은 선생님이 직접 고른다. 앱의 판단이 아니라
 * 사용자의 선택이므로 위 원칙과 부딪히지 않는다.
 */
const SHOW_HOMEROOM_TAB_KEY = 'ssampin-mobile-show-homeroom-tab';

function readShowHomeroomTab(): boolean {
  try {
    // 키가 없으면 기본 표시. 'false' 로 명시 저장했을 때만 숨긴다.
    return localStorage.getItem(SHOW_HOMEROOM_TAB_KEY) !== 'false';
  } catch {
    return true;
  }
}

interface MobileViewPrefsState {
  /** key: 'homeroom' | teachingClass.id */
  studentsViewModes: Record<string, StudentsViewMode>;
  getStudentsViewMode: (classKey: string) => StudentsViewMode | undefined;
  setStudentsViewMode: (classKey: string, mode: StudentsViewMode) => void;

  /** 하단 탭에 '학급'을 보일지. 기본 true. */
  showHomeroomTab: boolean;
  setShowHomeroomTab: (show: boolean) => void;
}

export const useMobileViewPrefsStore = create<MobileViewPrefsState>((set, get) => ({
  studentsViewModes: readModes(),

  getStudentsViewMode: (classKey) => get().studentsViewModes[classKey],

  setStudentsViewMode: (classKey, mode) => {
    const next = { ...get().studentsViewModes, [classKey]: mode };
    writeModes(next);
    set({ studentsViewModes: next });
  },

  showHomeroomTab: readShowHomeroomTab(),

  setShowHomeroomTab: (show) => {
    try {
      localStorage.setItem(SHOW_HOMEROOM_TAB_KEY, show ? 'true' : 'false');
    } catch {
      /* ignore */
    }
    set({ showHomeroomTab: show });
  },
}));
