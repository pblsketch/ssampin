/**
 * useMultiSurveyV2Store — 세션 점수 연결 단위 테스트.
 *
 * 검증 범위:
 * 1) nextPhase 'open' 진입 시 questionOpenedAt 기록
 * 2) appendResponse — 보너스 OFF 시 base 점수만
 * 3) appendResponse — streakBonus ON + 2연속 정답 후 3번째 정답 시 streak +4 반영
 * 4) appendResponse — fastSolveBonus ON 시 elapsed 0초 → 최대 보너스
 * 5) appendResponse — 재제출(upsert) 시 streak 계산이 깨지지 않음
 * 6) _rng 주입으로 randomBonus 결정성 확인
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useMultiSurveyV2Store } from '../useMultiSurveyV2Store';
import type { OXQuestion } from '@domain/entities/multiSurvey/Question';
import type { Response } from '@domain/entities/multiSurvey/Response';

// ── 테스트용 픽스처 ──────────────────────────────────────────────────────────

const NOW_ISO = '2026-06-12T10:00:00.000Z';

function makeOXQuestion(id: string, timerSeconds = 20, score = 10): OXQuestion {
  return {
    id,
    type: 'ox',
    text: `문항 ${id}`,
    timerSeconds,
    score,
    correctAnswer: 'O',
  };
}

function makeResponse(
  overrides: Partial<Response> & { studentId: string; questionId: string; isCorrect: boolean },
): Response {
  return {
    id: `r-${overrides.studentId}-${overrides.questionId}`,
    answer: 'O',
    submittedAt: NOW_ISO,
    scoreEarned: overrides.isCorrect ? 10 : 0,
    ...overrides,
  };
}

// ── store 초기화 헬퍼 ────────────────────────────────────────────────────────

function resetStore(): void {
  useMultiSurveyV2Store.setState({
    realtimeToolV2Enabled: false,
    migrationStatus: 'idle',
    sessions: [],
    loaded: false,
    selectedSessionId: null,
    liveSession: null,
    questionOpenedAt: {},
    _rng: undefined,
  });
}

// ── 테스트용 세션 생성 헬퍼 ──────────────────────────────────────────────────

function createTestSession(
  responseOpts: Partial<{
    autoAdvance: boolean;
    fastSolveBonus: boolean;
    streakBonus: boolean;
    randomBonus: boolean;
    explicitSubmitButton: boolean;
  }> = {},
) {
  const { createSession, updateResponseOpts, selectSession } = useMultiSurveyV2Store.getState();

  const session = createSession({
    title: '테스트 세션',
    idGen: () => 'test-session-id',
    now: () => new Date(NOW_ISO),
  });

  if (Object.keys(responseOpts).length > 0) {
    updateResponseOpts(session.id, responseOpts);
  }

  // questions 추가
  useMultiSurveyV2Store.setState((s) => ({
    sessions: s.sessions.map((sess) =>
      sess.id === session.id
        ? {
            ...sess,
            questions: [
              makeOXQuestion('q-1', 20, 10),
              makeOXQuestion('q-2', 20, 10),
              makeOXQuestion('q-3', 20, 10),
            ],
          }
        : sess,
    ),
  }));

  selectSession(session.id);
  return useMultiSurveyV2Store.getState().sessions.find((s) => s.id === session.id)!;
}

// ────────────────────────────────────────────────────────────────────────────

describe('useMultiSurveyV2Store — 세션 점수 연결', () => {
  beforeEach(() => {
    resetStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_ISO));
  });

  afterEach(() => {
    vi.useRealTimers();
    resetStore();
  });

  // ── 1. questionOpenedAt 기록 ──────────────────────────────────────────────

  describe('nextPhase — questionOpenedAt 기록', () => {
    it('lobby → open 진입 시 index 0에 현재 시각이 기록된다', () => {
      const session = createTestSession();
      const { startLive, nextPhase } = useMultiSurveyV2Store.getState();

      startLive(session.id);
      // lobby → open
      nextPhase();

      const { questionOpenedAt } = useMultiSurveyV2Store.getState();
      expect(questionOpenedAt[0]).toBe(NOW_ISO);
    });

    it('다음 문항 open 시 index 1에 기록된다', () => {
      const session = createTestSession();
      const { startLive, nextPhase } = useMultiSurveyV2Store.getState();

      startLive(session.id);
      nextPhase(); // lobby → open (index 0)
      nextPhase(); // open → revealed
      nextPhase(); // revealed → open (index 1, showPerQuestionScore=false)

      const { questionOpenedAt } = useMultiSurveyV2Store.getState();
      expect(questionOpenedAt[1]).toBe(NOW_ISO);
    });

    it('startLive 호출 시 questionOpenedAt가 초기화된다', () => {
      const session = createTestSession();
      const { startLive, nextPhase } = useMultiSurveyV2Store.getState();

      startLive(session.id);
      nextPhase(); // lobby → open → questionOpenedAt[0] 기록
      startLive(session.id); // 재시작

      const { questionOpenedAt } = useMultiSurveyV2Store.getState();
      expect(Object.keys(questionOpenedAt)).toHaveLength(0);
    });
  });

  // ── 2. appendResponse — 보너스 OFF (base만) ──────────────────────────────

  describe('appendResponse — 보너스 OFF', () => {
    it('모든 보너스 OFF 시 scoreEarned = base(10점)만', () => {
      const session = createTestSession({
        fastSolveBonus: false,
        streakBonus: false,
        randomBonus: false,
      });
      const { startLive, nextPhase, appendResponse } = useMultiSurveyV2Store.getState();

      startLive(session.id);
      nextPhase(); // open (index 0)

      appendResponse(makeResponse({ studentId: 'stu-1', questionId: 'q-1', isCorrect: true }));

      const { liveSession } = useMultiSurveyV2Store.getState();
      const r = liveSession!.responses[0];
      expect(r!.scoreEarned).toBe(10);
    });

    it('오답이면 보너스 ON이어도 scoreEarned = 0', () => {
      const session = createTestSession({
        fastSolveBonus: true,
        streakBonus: true,
        randomBonus: true,
      });
      const { startLive, nextPhase, appendResponse } = useMultiSurveyV2Store.getState();
      // rng 고정 (최대값)
      useMultiSurveyV2Store.setState({ _rng: () => 0.99 });

      startLive(session.id);
      nextPhase(); // open

      appendResponse(
        makeResponse({
          studentId: 'stu-1',
          questionId: 'q-1',
          isCorrect: false,
          answer: 'X',
          scoreEarned: 0,
        }),
      );

      const { liveSession } = useMultiSurveyV2Store.getState();
      expect(liveSession!.responses[0]!.scoreEarned).toBe(0);
    });
  });

  // ── 3. streakBonus — 연속 정답 누적 ─────────────────────────────────────

  describe('appendResponse — streakBonus', () => {
    it('2연속 정답 후 3번째 정답 시 streak=2 → +4점 보너스', () => {
      const session = createTestSession({
        streakBonus: true,
        fastSolveBonus: false,
        randomBonus: false,
      });
      const { startLive, nextPhase, appendResponse } = useMultiSurveyV2Store.getState();

      startLive(session.id);
      nextPhase(); // open index 0

      // 1번째 정답 — streak=0 → +0보너스, total=10
      appendResponse(makeResponse({ studentId: 'stu-1', questionId: 'q-1', isCorrect: true }));
      // 2번째 문항으로 이동
      nextPhase(); // revealed
      nextPhase(); // open index 1

      // 2번째 정답 — streak=1 → +2보너스, total=12
      appendResponse(makeResponse({ studentId: 'stu-1', questionId: 'q-2', isCorrect: true }));
      // 3번째 문항으로 이동
      nextPhase(); // revealed
      nextPhase(); // open index 2

      // 3번째 정답 — streak=2 → +4보너스, total=14
      appendResponse(makeResponse({ studentId: 'stu-1', questionId: 'q-3', isCorrect: true }));

      const { liveSession } = useMultiSurveyV2Store.getState();
      const responses = liveSession!.responses;
      const r1 = responses.find((r) => r.questionId === 'q-1');
      const r2 = responses.find((r) => r.questionId === 'q-2');
      const r3 = responses.find((r) => r.questionId === 'q-3');

      expect(r1!.scoreEarned).toBe(10); // base만 (streak=0)
      expect(r2!.scoreEarned).toBe(12); // base + streak(1*2=2)
      expect(r3!.scoreEarned).toBe(14); // base + streak(2*2=4)
    });

    it('오답으로 연속 끊기면 이후 문항에서 streak 0부터 재시작', () => {
      const session = createTestSession({
        streakBonus: true,
        fastSolveBonus: false,
        randomBonus: false,
      });
      const { startLive, nextPhase, appendResponse } = useMultiSurveyV2Store.getState();

      startLive(session.id);
      nextPhase(); // open index 0

      // 1번째 정답
      appendResponse(makeResponse({ studentId: 'stu-1', questionId: 'q-1', isCorrect: true }));
      nextPhase(); // revealed
      nextPhase(); // open index 1

      // 2번째 오답 → streak 끊김
      appendResponse(
        makeResponse({
          studentId: 'stu-1',
          questionId: 'q-2',
          isCorrect: false,
          answer: 'X',
          scoreEarned: 0,
        }),
      );
      nextPhase(); // revealed
      nextPhase(); // open index 2

      // 3번째 정답 — streak=0 (오답으로 끊겼으므로)
      appendResponse(makeResponse({ studentId: 'stu-1', questionId: 'q-3', isCorrect: true }));

      const { liveSession } = useMultiSurveyV2Store.getState();
      const r3 = liveSession!.responses.find((r) => r.questionId === 'q-3');
      expect(r3!.scoreEarned).toBe(10); // base만 (streak 리셋)
    });
  });

  // ── 4. fastSolveBonus ────────────────────────────────────────────────────

  describe('appendResponse — fastSolveBonus', () => {
    it('elapsed=0초(즉시 제출)이면 fastSolve = round(score * 0.5) = 5점', () => {
      const session = createTestSession({
        fastSolveBonus: true,
        streakBonus: false,
        randomBonus: false,
      });
      const { startLive, nextPhase, appendResponse } = useMultiSurveyV2Store.getState();

      startLive(session.id);
      nextPhase(); // open index 0 — openedAt = NOW_ISO

      // submittedAt = NOW_ISO (elapsed = 0s) → ratio = 1.0 → fastSolve = round(10 * 0.5 * 1) = 5
      appendResponse(
        makeResponse({
          studentId: 'stu-1',
          questionId: 'q-1',
          isCorrect: true,
          submittedAt: NOW_ISO,
        }),
      );

      const { liveSession } = useMultiSurveyV2Store.getState();
      const r = liveSession!.responses[0];
      // base(10) + fastSolve(5) = 15
      expect(r!.scoreEarned).toBe(15);
    });
  });

  // ── 5. randomBonus — _rng 주입 ───────────────────────────────────────────

  describe('appendResponse — randomBonus + _rng 주입', () => {
    it('_rng=()=>0이면 randomBonus=0', () => {
      const session = createTestSession({
        randomBonus: true,
        fastSolveBonus: false,
        streakBonus: false,
      });
      useMultiSurveyV2Store.setState({ _rng: () => 0 });
      const { startLive, nextPhase, appendResponse } = useMultiSurveyV2Store.getState();

      startLive(session.id);
      nextPhase(); // open

      appendResponse(makeResponse({ studentId: 'stu-1', questionId: 'q-1', isCorrect: true }));

      const { liveSession } = useMultiSurveyV2Store.getState();
      expect(liveSession!.responses[0]!.scoreEarned).toBe(10); // base만
    });

    it('_rng=()=>0.99이면 randomBonus=floor(0.99*6)=5점', () => {
      const session = createTestSession({
        randomBonus: true,
        fastSolveBonus: false,
        streakBonus: false,
      });
      useMultiSurveyV2Store.setState({ _rng: () => 0.99 });
      const { startLive, nextPhase, appendResponse } = useMultiSurveyV2Store.getState();

      startLive(session.id);
      nextPhase(); // open

      appendResponse(makeResponse({ studentId: 'stu-1', questionId: 'q-1', isCorrect: true }));

      const { liveSession } = useMultiSurveyV2Store.getState();
      expect(liveSession!.responses[0]!.scoreEarned).toBe(15); // base(10) + random(5)
    });
  });

  // ── 6. 재제출(upsert) — streak 계산 안전성 ──────────────────────────────

  describe('appendResponse — 재제출(upsert)', () => {
    it('같은 학생·문항 재제출 시 교체되고 streak 계산이 이전 응답 기준으로 동작한다', () => {
      const session = createTestSession({
        streakBonus: true,
        fastSolveBonus: false,
        randomBonus: false,
      });
      const { startLive, nextPhase, appendResponse } = useMultiSurveyV2Store.getState();

      startLive(session.id);
      nextPhase(); // open index 0

      // 첫 제출 (정답)
      appendResponse(makeResponse({ studentId: 'stu-1', questionId: 'q-1', isCorrect: true }));
      nextPhase(); // revealed
      nextPhase(); // open index 1

      // 두 번째 문항 첫 제출 (오답)
      appendResponse(
        makeResponse({
          studentId: 'stu-1',
          questionId: 'q-2',
          isCorrect: false,
          answer: 'X',
          scoreEarned: 0,
        }),
      );
      // 재제출 (정답으로 변경) — streak=1(q-1 정답)
      appendResponse(makeResponse({ studentId: 'stu-1', questionId: 'q-2', isCorrect: true }));

      const { liveSession } = useMultiSurveyV2Store.getState();
      const responses = liveSession!.responses;

      // 재제출로 교체됐으므로 q-2 응답은 1개만
      expect(responses.filter((r) => r.questionId === 'q-2')).toHaveLength(1);
      // streak=1(q-1 정답) → +2
      expect(responses.find((r) => r.questionId === 'q-2')!.scoreEarned).toBe(12);
    });
  });
});
