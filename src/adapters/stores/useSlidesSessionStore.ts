/**
 * useSlidesSessionStore — 라이브 세션 상태 + IPC 명령 (renderer Zustand).
 *
 * 책임:
 * - 세션 라이프사이클 (start/begin/advance/activate/deactivate/end)
 * - 메인 → 렌더러 `slides-session:teacher-event` 이벤트 구독 + 상태 갱신
 *   (response-received / student-joined / student-presence-changed /
 *    overlay-finalized / session-archived)
 *
 * Plan §3 + Design §8.2 매핑.
 */

import { create } from 'zustand';
import type {
  AggregatedResultData,
  InteractiveLesson,
  OverlayResults,
  ResultsVisibility,
  SessionAccessMode,
  SessionStatus,
} from '@domain/entities/InteractiveSlides';
import type { ServerToTeacherMessage } from '@domain/ports/IRealtimeBroadcaster';
import type {
  OverlayId,
  SessionId,
  ShortCode,
  StudentToken,
} from '@domain/valueObjects/InteractiveSlidesIds';

export type SessionConnectionState =
  | 'idle'
  | 'starting'
  | 'lobby'
  | 'active'
  | 'archived'
  | 'error';

export interface StudentRosterEntry {
  readonly studentToken: StudentToken;
  readonly studentName: string;
  readonly online: boolean;
}

interface SlidesSessionState {
  // ─── Session identity ───
  readonly sessionId: SessionId | null;
  readonly shortCode: ShortCode | null;
  readonly port: number | null;
  readonly accessMode: SessionAccessMode | null;
  readonly resultsVisibility: ResultsVisibility;

  // ─── Lifecycle ───
  readonly status: SessionStatus | 'idle';
  readonly connectionState: SessionConnectionState;
  readonly errorMessage: string | null;

  // ─── Live state ───
  readonly currentSlideIndex: number;
  /** 학생 명부 (토큰 → 정보) */
  readonly students: ReadonlyMap<StudentToken, StudentRosterEntry>;
  readonly totalOnline: number;
  /** overlayId → 진행 중 활동의 실시간 집계 */
  readonly liveResults: ReadonlyMap<OverlayId, AggregatedResultData>;
  readonly liveRespondCounts: ReadonlyMap<OverlayId, { respondCount: number; totalCount: number }>;
  /** 종료된 활동의 freeze 결과 */
  readonly closedResults: ReadonlyMap<OverlayId, OverlayResults>;

  // ─── Actions ───
  /**
   * 세션 시작 (lobby 상태로 진입).
   * IPC `slides-session:start` 호출 → port/sessionId/shortCode 수신.
   * 첫 호출 시 teacher-event 구독도 자동 설정.
   */
  startSession: (args: {
    lesson: InteractiveLesson;
    sessionName: string;
    accessMode: SessionAccessMode;
    resultsVisibility?: ResultsVisibility;
  }) => Promise<void>;
  /**
   * lobby → active 전이 (학생 화면 슬라이드 표시 시작).
   * `slides-session:begin-presentation` IPC 호출 → 메인이 도메인 transition + 첫 슬라이드 broadcast.
   * 클라이언트는 IPC 응답 후 즉시 상태 진입 (실패해도 다음 advance에서 재동기화).
   */
  beginPresentation: () => Promise<void>;
  stopSession: () => Promise<void>;
  advanceSlide: (targetIndex: number) => Promise<void>;
  activateOverlay: (overlayId: OverlayId) => Promise<void>;
  deactivateOverlay: (
    overlayId: OverlayId,
    visibility?: ResultsVisibility,
  ) => Promise<void>;
  endLesson: () => Promise<void>;
  /** 세션 외부에서 visibility 모드 변경 (deactivate 시 default로 사용) */
  setResultsVisibility: (visibility: ResultsVisibility) => void;
}

const INITIAL_STATE = {
  sessionId: null,
  shortCode: null,
  port: null,
  accessMode: null,
  resultsVisibility: 'anonymous' as ResultsVisibility,
  status: 'idle' as SessionStatus | 'idle',
  connectionState: 'idle' as SessionConnectionState,
  errorMessage: null,
  currentSlideIndex: 0,
  students: new Map<StudentToken, StudentRosterEntry>(),
  totalOnline: 0,
  liveResults: new Map<OverlayId, AggregatedResultData>(),
  liveRespondCounts: new Map<OverlayId, { respondCount: number; totalCount: number }>(),
  closedResults: new Map<OverlayId, OverlayResults>(),
};

export const useSlidesSessionStore = create<SlidesSessionState>((set, get) => {
  let unsubscribeTeacherEvent: (() => void) | null = null;

  function ensureSubscribed(): void {
    if (unsubscribeTeacherEvent) return;
    const api = window.electronAPI?.interactiveSlides;
    if (!api?.onTeacherEvent) return;
    unsubscribeTeacherEvent = api.onTeacherEvent((event) => {
      // event = { sessionId, message }
      const cur = get();
      if (!cur.sessionId || cur.sessionId !== event.sessionId) return;
      handleTeacherEvent(event.message);
    });
  }

  function handleTeacherEvent(msg: ServerToTeacherMessage): void {
    switch (msg.type) {
      case 'response-received': {
        set((s) => {
          const liveResults = new Map(s.liveResults);
          liveResults.set(msg.overlayId, msg.aggregated);
          const liveRespondCounts = new Map(s.liveRespondCounts);
          liveRespondCounts.set(msg.overlayId, {
            respondCount: msg.respondCount,
            totalCount: msg.totalCount,
          });
          return { liveResults, liveRespondCounts };
        });
        return;
      }
      case 'student-joined': {
        set((s) => {
          const students = new Map(s.students);
          students.set(msg.studentToken, {
            studentToken: msg.studentToken,
            studentName: msg.studentName,
            online: true,
          });
          return {
            students,
            totalOnline: countOnline(students),
          };
        });
        return;
      }
      case 'student-presence-changed': {
        set((s) => {
          const students = new Map(s.students);
          const cur = students.get(msg.studentToken);
          if (cur) {
            students.set(msg.studentToken, { ...cur, online: msg.online });
          }
          return {
            students,
            totalOnline: msg.totalOnline,
          };
        });
        return;
      }
      case 'overlay-finalized': {
        set((s) => {
          const closedResults = new Map(s.closedResults);
          closedResults.set(msg.results.overlayId, msg.results);
          return { closedResults };
        });
        return;
      }
      case 'session-archived': {
        set({ status: 'archived', connectionState: 'archived' });
        return;
      }
    }
  }

  return {
    ...INITIAL_STATE,

    startSession: async ({ lesson, sessionName, accessMode, resultsVisibility }) => {
      const api = window.electronAPI?.interactiveSlides;
      if (!api) {
        set({
          connectionState: 'error',
          errorMessage: 'Electron API를 사용할 수 없습니다.',
        });
        throw new Error('electronAPI.interactiveSlides 없음');
      }
      ensureSubscribed();
      set({
        ...INITIAL_STATE,
        connectionState: 'starting',
        errorMessage: null,
      });
      try {
        const result = await api.startSession({
          lesson,
          sessionName,
          accessMode,
          ...(resultsVisibility ? { resultsVisibility } : {}),
        });
        set({
          sessionId: result.sessionId as SessionId,
          shortCode: result.shortCode as ShortCode,
          port: result.port,
          accessMode,
          resultsVisibility: resultsVisibility ?? 'anonymous',
          status: 'lobby',
          connectionState: 'lobby',
          currentSlideIndex: 0,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '세션 시작 실패';
        set({ connectionState: 'error', errorMessage: msg });
        throw err;
      }
    },

    beginPresentation: async () => {
      const cur = get();
      if (cur.status !== 'lobby' || !cur.sessionId) return;
      const api = window.electronAPI?.interactiveSlides;
      if (api?.beginPresentation) {
        try {
          await api.beginPresentation({ sessionId: cur.sessionId });
        } catch {
          // 실패해도 클라이언트 측 상태는 진입 — 다음 advance에서 백엔드가 재동기화
        }
      }
      set({ status: 'active', connectionState: 'active' });
    },

    stopSession: async () => {
      const api = window.electronAPI?.interactiveSlides;
      if (!api) return;
      try {
        await api.stopSession();
      } finally {
        set({ ...INITIAL_STATE });
      }
    },

    advanceSlide: async (targetIndex) => {
      const api = window.electronAPI?.interactiveSlides;
      const sessionId = get().sessionId;
      if (!api || !sessionId) return;
      await api.advanceSlide({ sessionId, targetIndex });
      set({ currentSlideIndex: targetIndex });
    },

    activateOverlay: async (overlayId) => {
      const api = window.electronAPI?.interactiveSlides;
      const sessionId = get().sessionId;
      if (!api || !sessionId) return;
      await api.activateOverlay({ sessionId, overlayId });
    },

    deactivateOverlay: async (overlayId, visibility) => {
      const api = window.electronAPI?.interactiveSlides;
      const sessionId = get().sessionId;
      if (!api || !sessionId) return;
      const v = visibility ?? get().resultsVisibility;
      await api.deactivateOverlay({ sessionId, overlayId, visibility: v });
    },

    endLesson: async () => {
      const api = window.electronAPI?.interactiveSlides;
      const sessionId = get().sessionId;
      if (!api || !sessionId) return;
      try {
        await api.endLesson({ sessionId });
      } finally {
        set({ status: 'archived', connectionState: 'archived' });
      }
    },

    setResultsVisibility: (visibility) => {
      set({ resultsVisibility: visibility });
    },
  };
});

function countOnline(students: ReadonlyMap<StudentToken, StudentRosterEntry>): number {
  let n = 0;
  for (const s of students.values()) if (s.online) n++;
  return n;
}
