/**
 * 서명받기 명단 라이브러리 + 현재 세션 상태 (Zustand).
 *
 * - 명단 라이브러리(sigv2_rosters 대응): 저장/불러오기/삭제는 우선 로컬(localStorage)로 영속한다.
 *   서버 roster 영속은 후속 작업이며, 이 스토어는 UI 동작(CRUD)을 담당한다.
 * - 현재 세션 상태: publish 결과(sessionId·adminKey·shortLinkCode)와 함께
 *   공개 시점의 명단 스냅샷(columns·members·headerText)을 localStorage에 영속한다.
 *   앱을 껐다 켜거나 도구를 나갔다 들어와도 진행 중 세션(관리 키 포함)이 유지되어야
 *   현황 확인·등록부 생성·세션 삭제가 가능하다.
 *
 * 의존성 역전 — 이 스토어는 Supabase/Google을 직접 import하지 않는다.
 * publish/현황/시트 내보내기는 컴포넌트가 container의 usecase를 경유한다.
 */
import { create } from 'zustand';
import type { ColumnDef, RosterMember } from '@domain/entities/SignatureRoster';
import type { SignatureStatusRow } from '@domain/entities/SignatureEntry';

const ROSTER_STORAGE_KEY = 'ssampin_sigv2_rosters';
const SESSION_STORAGE_KEY = 'ssampin_sigv2_active_session';

/** 저장된 명단(라이브러리 항목) — 로컬 영속 단위 */
export interface SavedSignatureRoster {
  /** 명단 식별자 */
  readonly id: string;
  /** 명단 이름 (예: "3학년 2반", "교직원") */
  readonly name: string;
  /** 컬럼 정의 (연번·소속·이름·서명·서명일시 + 사용자 추가) */
  readonly columns: readonly ColumnDef[];
  /** 구성원 목록 */
  readonly members: readonly RosterMember[];
  /** 저장 시각 (epoch ms) */
  readonly savedAt: number;
}

/**
 * publish 후 현재 세션 — 식별 정보 + 공개 시점 명단 스냅샷.
 *
 * 스냅샷(columns·members·headerText)을 함께 보관해야 도구 재진입/앱 재시작 후에도
 * 시트·Excel 등록부 생성이 동일 데이터로 동작한다 (서버 스냅샷과 동일 내용).
 */
export interface ActiveSignatureSession {
  readonly sessionId: string;
  readonly adminKey: string;
  readonly shortLinkCode: string;
  /** 세션 제목 (현황 표시 + 등록부 제목) */
  readonly title: string;
  /** 공개 페이지/등록부 머리말 (선택) */
  readonly headerText?: string;
  /** 공개 시점 컬럼 정의 스냅샷 */
  readonly columns: readonly ColumnDef[];
  /** 공개 시점 명단 스냅샷 */
  readonly members: readonly RosterMember[];
  /** 생성된 구글시트 URL (생성 후 기록 — 재진입 시 "시트 열기" 유지) */
  readonly sheetUrl?: string;
}

interface SignatureRosterStoreState {
  // ── 명단 라이브러리 ──
  readonly rosters: readonly SavedSignatureRoster[];
  readonly loaded: boolean;
  /** localStorage에서 명단 라이브러리 로드 (최초 1회) */
  readonly loadRosters: () => void;
  /** 명단 저장(신규/덮어쓰기) — id 미지정 시 신규 생성 */
  readonly saveRoster: (input: {
    readonly id?: string;
    readonly name: string;
    readonly columns: readonly ColumnDef[];
    readonly members: readonly RosterMember[];
  }) => SavedSignatureRoster;
  /** 명단 삭제 */
  readonly deleteRoster: (id: string) => void;

  // ── 현재 세션 ──
  readonly activeSession: ActiveSignatureSession | null;
  readonly statusRows: readonly SignatureStatusRow[];
  /** publish 결과로 현재 세션 설정 (localStorage 영속) */
  readonly setActiveSession: (session: ActiveSignatureSession | null) => void;
  /** 진행 중 세션 부분 갱신 (예: sheetUrl 기록) */
  readonly updateActiveSession: (patch: Partial<ActiveSignatureSession>) => void;
  /** 현황 폴링 콜백에서 행 갱신 */
  readonly setStatusRows: (rows: readonly SignatureStatusRow[]) => void;
  /** 세션/현황 초기화 (백업 후 초기화·삭제 시) — 영속본도 제거 */
  readonly resetSession: () => void;
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `sigroster-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readRostersFromStorage(): SavedSignatureRoster[] {
  try {
    const raw = localStorage.getItem(ROSTER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedSignatureRoster[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRostersToStorage(rosters: readonly SavedSignatureRoster[]): void {
  try {
    localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify(rosters));
  } catch {
    // 영속 실패는 무시 — 메모리 상태는 유지된다.
  }
}

/** 진행 중 세션 복원 — 필수 키가 빠졌으면 손상으로 보고 무시한다. */
function readSessionFromStorage(): ActiveSignatureSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveSignatureSession;
    if (
      typeof parsed?.sessionId !== 'string' ||
      typeof parsed?.adminKey !== 'string' ||
      typeof parsed?.shortLinkCode !== 'string' ||
      !Array.isArray(parsed?.members) ||
      !Array.isArray(parsed?.columns)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionToStorage(session: ActiveSignatureSession | null): void {
  try {
    if (session) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // 영속 실패는 무시 — 메모리 상태는 유지된다.
  }
}

export const useSignatureRosterStore = create<SignatureRosterStoreState>((set, get) => ({
  rosters: [],
  loaded: false,

  loadRosters: () => {
    if (get().loaded) return;
    set({ rosters: readRostersFromStorage(), loaded: true });
  },

  saveRoster: (input) => {
    const now = Date.now();
    const saved: SavedSignatureRoster = {
      id: input.id ?? makeId(),
      name: input.name.trim() || '이름 없는 명단',
      columns: input.columns,
      members: input.members,
      savedAt: now,
    };
    const next = [saved, ...get().rosters.filter((r) => r.id !== saved.id)];
    writeRostersToStorage(next);
    set({ rosters: next, loaded: true });
    return saved;
  },

  deleteRoster: (id) => {
    const next = get().rosters.filter((r) => r.id !== id);
    writeRostersToStorage(next);
    set({ rosters: next, loaded: true });
  },

  // 모듈 로드 시점에 동기 복원 — 도구 재진입/앱 재시작 후에도 진행 중 세션 유지.
  activeSession: readSessionFromStorage(),
  statusRows: [],

  setActiveSession: (session) => {
    writeSessionToStorage(session);
    set({ activeSession: session });
  },

  updateActiveSession: (patch) => {
    const current = get().activeSession;
    if (!current) return;
    const next = { ...current, ...patch };
    writeSessionToStorage(next);
    set({ activeSession: next });
  },

  setStatusRows: (rows) => set({ statusRows: rows }),

  resetSession: () => {
    writeSessionToStorage(null);
    set({ activeSession: null, statusRows: [] });
  },
}));
