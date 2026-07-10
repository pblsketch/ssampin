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

interface MobileViewPrefsState {
  /** key: 'homeroom' | teachingClass.id */
  studentsViewModes: Record<string, StudentsViewMode>;
  getStudentsViewMode: (classKey: string) => StudentsViewMode | undefined;
  setStudentsViewMode: (classKey: string, mode: StudentsViewMode) => void;
}

export const useMobileViewPrefsStore = create<MobileViewPrefsState>((set, get) => ({
  studentsViewModes: readModes(),

  getStudentsViewMode: (classKey) => get().studentsViewModes[classKey],

  setStudentsViewMode: (classKey, mode) => {
    const next = { ...get().studentsViewModes, [classKey]: mode };
    writeModes(next);
    set({ studentsViewModes: next });
  },
}));
