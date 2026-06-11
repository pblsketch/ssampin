/**
 * useMultiSurveyV2Store — MultiSurvey v2 도메인 Facade Store (Design §3.1, Plan §5.1 B.1)
 *
 * 책임:
 * - V2 세션 목록 메모리 캐시 (loadSessions/createSession/updateSession/deleteSession)
 * - 라이브 세션 phase 머신 (startLive/nextPhase/endLive — 6 phase: lobby/open/revealed/round_result/podium/end)
 * - 11종 토글 옵션(PresentationOpts/ResponseOpts/DisplayOpts) 동기 업데이트 (DN-01)
 * - `realtimeToolV2Enabled` flag 단일 저장소 (Phase D 제거 시 단일 grep 가능)
 *
 * NOT 책임:
 * - 영구 저장: 본 Store는 메모리 캐시. Phase B 후속 작업에서 repository/IPC 연동 추가
 * - V1 ↔ V2 분기 라우팅: `useRealtimeToolFlag` facade가 담당 (Plan D5 분기 ≤3개 약속)
 * - 마이그레이션 실행: `useMigrationReport` hook + `electron/ipc/multiSurveyMigration.ts` 가 담당
 *
 * 보호 파일 가드: 본 Store는 useSettingsStore / useModalCoordinatorStore 절대 import 금지.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  MultiSurveyV2,
  PresentationOpts,
  ResponseOpts,
  DisplayOpts,
} from '@domain/entities/multiSurvey/MultiSurveyV2';
import { FORMAT_VERSION_V2 } from '@domain/entities/multiSurvey/MultiSurveyV2';
import type {
  LiveSession,
  LivePhase,
  StudentProfile,
  StudentInteraction,
} from '@domain/entities/multiSurvey/LiveSession';
import type { Response as MultiSurveyResponse } from '@domain/entities/multiSurvey/Response';

// ────────────────────────────────────────────────
// 기본값 (Plan §5.2 D11 — 학습 모드 ON / 설문(퀴즈) 메카닉 OFF)
// ────────────────────────────────────────────────

const DEFAULT_PRESENTATION_OPTS: PresentationOpts = {
  showCumulativeScore: true,
  revealExplanation: true,
  allowReentry: true,
};

const DEFAULT_RESPONSE_OPTS: ResponseOpts = {
  explicitSubmitButton: false,
  autoAdvance: false,
  fastSolveBonus: false,
  streakBonus: false,
  randomBonus: false,
};

const DEFAULT_DISPLAY_OPTS: DisplayOpts = {
  teacherFocusMode: false,
  showPerQuestionScore: false,
};

// ────────────────────────────────────────────────
// Phase 전이 규칙 (DN-09 — round_result는 T10 ON일 때만 거침)
// ────────────────────────────────────────────────

/**
 * 다음 phase 결정.
 * - lobby → open
 * - open → revealed
 * - revealed → (T10 ON이면) round_result, 아니면 open (다음 문항) or podium (마지막)
 * - round_result → open or podium
 * - podium → end
 * - end → end (idempotent)
 */
function computeNextPhase(
  current: LivePhase,
  showPerQuestionScore: boolean,
  isLastQuestion: boolean,
): LivePhase {
  switch (current) {
    case 'lobby':
      return 'open';
    case 'open':
      return 'revealed';
    case 'revealed':
      if (showPerQuestionScore) return 'round_result';
      return isLastQuestion ? 'podium' : 'open';
    case 'round_result':
      return isLastQuestion ? 'podium' : 'open';
    case 'podium':
      return 'end';
    case 'end':
      return 'end';
  }
}

// ────────────────────────────────────────────────
// Store State Shape
// ────────────────────────────────────────────────

interface MultiSurveyV2StoreState {
  // ── Feature flag (Plan D5) ──
  readonly realtimeToolV2Enabled: boolean;
  /** 마이그레이션 진행 상태 — `useRealtimeToolFlag` facade가 합성 노출 */
  readonly migrationStatus: 'idle' | 'in_progress' | 'completed' | 'failed';

  // ── V2 세션 캐시 ──
  readonly sessions: readonly MultiSurveyV2[];
  readonly loaded: boolean;
  readonly selectedSessionId: string | null;

  // ── 활성 라이브 세션 (단일) ──
  readonly liveSession: LiveSession | null;

  // ── Actions: flag ──
  setRealtimeToolV2Enabled: (enabled: boolean) => void;
  setMigrationStatus: (status: MultiSurveyV2StoreState['migrationStatus']) => void;

  // ── Actions: V2 세션 CRUD ──
  loadSessions: () => Promise<void>;
  createSession: (input: CreateSessionInput) => MultiSurveyV2;
  updateSession: (id: string, patch: UpdateSessionPatch) => void;
  deleteSession: (id: string) => void;
  selectSession: (id: string | null) => void;

  // ── Actions: 옵션 토글 (DN-01 동기 업데이트) ──
  updatePresentationOpts: (sessionId: string, patch: Partial<PresentationOpts>) => void;
  updateResponseOpts: (sessionId: string, patch: Partial<ResponseOpts>) => void;
  updateDisplayOpts: (sessionId: string, patch: Partial<DisplayOpts>) => void;

  // ── Actions: 라이브 세션 phase 머신 ──
  startLive: (sessionId: string) => LiveSession;
  nextPhase: () => void;
  endLive: () => void;
  /** 라이브 상태를 비우고 메이커로 복귀 (end 이후 또는 서버 기동 실패 시) */
  exitLive: () => void;
  appendResponse: (response: MultiSurveyResponse) => void;
  appendStudent: (student: StudentProfile) => void;
  appendInteraction: (interaction: StudentInteraction) => void;
  setFocusModeActive: (active: boolean) => void;
}

export interface CreateSessionInput {
  readonly title: string;
  /** ID 생성기 (테스트 주입용). 미지정 시 crypto.randomUUID */
  readonly idGen?: () => string;
  /** 현재 시각 주입 (테스트용). 미지정 시 new Date() */
  readonly now?: () => Date;
}

export type UpdateSessionPatch = Partial<Pick<MultiSurveyV2, 'title' | 'questions'>>;

// ────────────────────────────────────────────────
// Store 구현
// ────────────────────────────────────────────────

/**
 * 영속 저장 키 (zustand persist).
 * 보호 파일 useSettingsStore 건드리지 않기 위해 별도 키 사용.
 */
const PERSIST_KEY = 'ssampin-multi-survey-v2-flag';

function defaultIdGen(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: SSR/jsdom 환경 — Phase B 테스트에서만 사용
  return `ms-v2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useMultiSurveyV2Store = create<MultiSurveyV2StoreState>()(
  persist(
    (set, get) => ({
      // ── 초기 상태 ──
      realtimeToolV2Enabled: false,
      migrationStatus: 'idle',
      sessions: [],
      loaded: false,
      selectedSessionId: null,
      liveSession: null,

      // ── Flag actions ──
      setRealtimeToolV2Enabled(enabled) {
        set({ realtimeToolV2Enabled: enabled });
      },
      setMigrationStatus(status) {
        set({ migrationStatus: status });
      },

      // ── 세션 CRUD ──
      async loadSessions() {
        // 세션 본문은 zustand persist(partialize)가 rehydrate — 여기서는 loaded 마킹만.
        set({ loaded: true });
      },

      createSession(input) {
        const idGen = input.idGen ?? defaultIdGen;
        const now = input.now ?? (() => new Date());
        const iso = now().toISOString();
        const session: MultiSurveyV2 = {
          id: idGen(),
          formatVersion: FORMAT_VERSION_V2,
          title: input.title,
          createdAt: iso,
          updatedAt: iso,
          questions: [],
          presentationOpts: DEFAULT_PRESENTATION_OPTS,
          responseOpts: DEFAULT_RESPONSE_OPTS,
          displayOpts: DEFAULT_DISPLAY_OPTS,
        };
        set((s) => ({ sessions: [...s.sessions, session] }));
        return session;
      },

      updateSession(id, patch) {
        const now = new Date().toISOString();
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === id ? { ...sess, ...patch, updatedAt: now } : sess,
          ),
        }));
      },

      deleteSession(id) {
        set((s) => ({
          sessions: s.sessions.filter((sess) => sess.id !== id),
          selectedSessionId: s.selectedSessionId === id ? null : s.selectedSessionId,
        }));
      },

      selectSession(id) {
        set({ selectedSessionId: id });
      },

      // ── 옵션 토글 (동기 — DN-01) ──
      updatePresentationOpts(sessionId, patch) {
        const now = new Date().toISOString();
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? {
                  ...sess,
                  presentationOpts: { ...sess.presentationOpts, ...patch },
                  updatedAt: now,
                }
              : sess,
          ),
        }));
      },

      updateResponseOpts(sessionId, patch) {
        const now = new Date().toISOString();
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? {
                  ...sess,
                  responseOpts: { ...sess.responseOpts, ...patch },
                  updatedAt: now,
                }
              : sess,
          ),
        }));
      },

      updateDisplayOpts(sessionId, patch) {
        const now = new Date().toISOString();
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? {
                  ...sess,
                  displayOpts: { ...sess.displayOpts, ...patch },
                  updatedAt: now,
                }
              : sess,
          ),
        }));
      },

      // ── 라이브 phase 머신 ──
      startLive(sessionId) {
        const survey = get().sessions.find((s) => s.id === sessionId);
        if (!survey) {
          throw new Error(`startLive: session not found id=${sessionId}`);
        }
        const live: LiveSession = {
          id: defaultIdGen(),
          surveyId: sessionId,
          round: 1,
          phase: 'lobby',
          currentQuestionIndex: 0,
          students: [],
          responses: [],
          studentInteractions: [],
          focusModeActive: survey.displayOpts.teacherFocusMode,
          startedAt: new Date().toISOString(),
        };
        set({ liveSession: live });
        return live;
      },

      nextPhase() {
        const live = get().liveSession;
        if (!live) return;
        const survey = get().sessions.find((s) => s.id === live.surveyId);
        if (!survey) return;
        const totalQuestions = survey.questions.length;
        const isLast = live.currentQuestionIndex >= totalQuestions - 1;
        const next = computeNextPhase(live.phase, survey.displayOpts.showPerQuestionScore, isLast);

        // open으로 복귀 시 문항 인덱스 +1
        const advancesQuestion =
          (live.phase === 'revealed' || live.phase === 'round_result') && next === 'open';

        set({
          liveSession: {
            ...live,
            phase: next,
            currentQuestionIndex: advancesQuestion
              ? live.currentQuestionIndex + 1
              : live.currentQuestionIndex,
            endedAt: next === 'end' ? new Date().toISOString() : live.endedAt,
          },
        });
      },

      endLive() {
        const live = get().liveSession;
        if (!live) return;
        set({
          liveSession: {
            ...live,
            phase: 'end',
            endedAt: new Date().toISOString(),
          },
        });
      },

      exitLive() {
        set({ liveSession: null });
      },

      appendResponse(response) {
        const live = get().liveSession;
        if (!live) return;
        // 학생 재제출(서버가 덮어쓰기 허용) 시 같은 학생·문항 응답은 교체 — 카운트 중복 방지
        const existingIdx = live.responses.findIndex(
          (r) => r.studentId === response.studentId && r.questionId === response.questionId,
        );
        const responses =
          existingIdx >= 0
            ? live.responses.map((r, i) => (i === existingIdx ? response : r))
            : [...live.responses, response];
        set({
          liveSession: {
            ...live,
            responses,
          },
        });
      },

      appendStudent(student) {
        const live = get().liveSession;
        if (!live) return;
        if (live.students.some((s) => s.studentId === student.studentId)) return;
        set({
          liveSession: {
            ...live,
            students: [...live.students, student],
          },
        });
      },

      appendInteraction(interaction) {
        const live = get().liveSession;
        if (!live) return;
        set({
          liveSession: {
            ...live,
            studentInteractions: [...live.studentInteractions, interaction],
          },
        });
      },

      setFocusModeActive(active) {
        const live = get().liveSession;
        if (!live) return;
        set({
          liveSession: {
            ...live,
            focusModeActive: active,
          },
        });
      },
    }),
    {
      name: PERSIST_KEY,
      storage: createJSONStorage(() => localStorage),
      // flag + 세션 본문 + 선택 세션 영속화. 라이브 상태·마이그레이션 상태는 메모리만.
      // (보호 파일 useSettingsStore 의존 회피 — 별도 localStorage 키 사용)
      partialize: (state) => ({
        realtimeToolV2Enabled: state.realtimeToolV2Enabled,
        sessions: state.sessions,
        selectedSessionId: state.selectedSessionId,
      }),
    },
  ),
);

// ────────────────────────────────────────────────
// 외부 노출 selector helpers (테스트 + worker 의존 단순화)
// ────────────────────────────────────────────────

export function selectSessionById(
  state: MultiSurveyV2StoreState,
  id: string | null,
): MultiSurveyV2 | undefined {
  if (!id) return undefined;
  return state.sessions.find((s) => s.id === id);
}

export function selectActiveLiveSurvey(state: MultiSurveyV2StoreState): MultiSurveyV2 | undefined {
  const live = state.liveSession;
  if (!live) return undefined;
  return state.sessions.find((s: MultiSurveyV2) => s.id === live.surveyId);
}
