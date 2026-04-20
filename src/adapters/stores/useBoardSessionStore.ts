/**
 * useBoardSessionStore — 활성 세션 실시간 상태 (Design §5.4)
 *
 * IPC 이벤트(collab-board:participant-change / :auto-save / :session-error)를
 * 구독해 세션 상태를 반영한다. Tool 컴포넌트가 mount 시 `subscribe()`를 호출해
 * 리스너를 등록하고, unmount 시 리턴된 해제 함수를 호출한다.
 *
 * Plan R2 / Design 주석 — 기존 5개 라이브 도구와의 터널 상호 배타는 UI 레벨에서
 * `isRunning` 을 참조해 라이브 도구 진입 버튼을 비활성화하는 식으로 처리
 * (Step 7 이후 Tools/ 컴포넌트에서 사용).
 */
import { create } from 'zustand';

interface SessionStart {
  boardId: string;
  publicUrl: string;
  sessionCode: string;
  authToken: string;
  qrDataUrl: string;
  startedAt: number;
}

interface BoardSessionState {
  /** 현재 활성 세션 (없으면 null) */
  active: SessionStart | null;
  /** 접속 중 학생 이름 목록 */
  participants: string[];
  /** 마지막 자동 저장 시각 (Unix ms, null이면 미저장) */
  lastSavedAt: number | null;
  /** 세션 종료 사유 (터널 exit 등) */
  lastError: string | null;

  /** 세션 시작 (IPC 호출). 성공 시 active 반영 */
  start: (boardId: string) => Promise<SessionStart | null>;
  /** 세션 종료 */
  end: (boardId: string, forceSave?: boolean) => Promise<void>;
  /** 수동 저장 */
  saveNow: (boardId: string) => Promise<number | null>;
  /** 부트스트랩 시 main의 활성 세션 조회 */
  hydrate: () => Promise<void>;

  /**
   * Main→Renderer IPC 이벤트 구독. Tool 컴포넌트 mount 시 호출.
   * 반환 함수를 unmount 시 호출해 리스너 정리.
   */
  subscribe: () => () => void;
}

function getApi(): NonNullable<Window['electronAPI']>['collabBoard'] | null {
  return window.electronAPI?.collabBoard ?? null;
}

export const useBoardSessionStore = create<BoardSessionState>((set, get) => ({
  active: null,
  participants: [],
  lastSavedAt: null,
  lastError: null,

  async hydrate() {
    const api = getApi();
    if (!api) return;
    try {
      const active = await api.getActiveSession();
      set({ active: active ?? null });
    } catch {
      // swallow — 초기화 단계
    }
  },

  async start(boardId) {
    const api = getApi();
    if (!api) {
      set({ lastError: '협업 보드는 데스크톱 앱에서만 사용할 수 있습니다.' });
      return null;
    }
    try {
      const result = await api.startSession({ id: boardId });
      set({
        active: result,
        participants: [],
        lastSavedAt: null,
        lastError: null,
      });
      return result;
    } catch (err) {
      set({ lastError: String(err) });
      return null;
    }
  },

  async end(boardId, forceSave = false) {
    const api = getApi();
    if (!api) return;
    try {
      await api.endSession({ id: boardId, forceSave });
      set({
        active: null,
        participants: [],
        lastSavedAt: null,
        // lastError는 유지 (토스트 띄우기용)
      });
    } catch (err) {
      set({ lastError: String(err) });
    }
  },

  async saveNow(boardId) {
    const api = getApi();
    if (!api) return null;
    try {
      const { savedAt } = await api.saveSnapshot({ id: boardId });
      set({ lastSavedAt: savedAt });
      return savedAt;
    } catch (err) {
      set({ lastError: String(err) });
      return null;
    }
  },

  subscribe() {
    const api = getApi();
    if (!api) return () => {};

    const unsubs: Array<() => void> = [];

    unsubs.push(
      api.onSessionStarted((data) => {
        set({ active: data, participants: [], lastSavedAt: null, lastError: null });
      }),
    );
    unsubs.push(
      api.onParticipantChange(({ boardId, names }) => {
        const active = get().active;
        if (!active || active.boardId !== boardId) return;
        set({ participants: names });
      }),
    );
    unsubs.push(
      api.onAutoSave(({ boardId, savedAt }) => {
        const active = get().active;
        if (!active || active.boardId !== boardId) return;
        set({ lastSavedAt: savedAt });
      }),
    );
    unsubs.push(
      api.onSessionError(({ boardId, reason }) => {
        const active = get().active;
        // 세션 ID 일치 여부와 무관하게 에러 기록 (세션 종료 이후 포함)
        set({ lastError: reason });
        // 터널 끊김 등으로 인한 종료는 UI에 즉시 반영
        if (active && active.boardId === boardId && reason.startsWith('BOARD_TUNNEL_EXIT')) {
          set({ active: null, participants: [] });
        }
      }),
    );

    return () => {
      for (const u of unsubs) u();
    };
  },

  // 외부에서 에러 배너 닫기용
}));

/** 편의 selector — 기존 5개 라이브 도구와 상호 배타 판정 */
export const selectIsBoardRunning = (state: BoardSessionState): boolean => state.active !== null;
