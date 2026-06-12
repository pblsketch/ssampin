/**
 * shareSnapshot.ts 단위 테스트.
 *
 * 검증 항목:
 *  - buildShareSnapshot 변환 정확성
 *  - JSON.stringify 라운드트립 (직렬화 안전)
 *  - entryCode 필드 미포함
 *  - 모든 phase 6종 변환
 *  - currentQuestion이 없을 때 null 반환
 *  - responsesForCurrent 필터링 정확성
 *  - allResponses 전체 포함
 */
import { describe, it, expect } from 'vitest';
import { buildShareSnapshot } from '../shareSnapshot';
import type { LiveSession } from '@domain/entities/multiSurvey/LiveSession';
import type { MultiSurveyV2 } from '@domain/entities/multiSurvey/MultiSurveyV2';
import type { Response } from '@domain/entities/multiSurvey/Response';
import type { Question } from '@domain/entities/multiSurvey/Question';

// ── 최소 픽스처 빌더 ──────────────────────────────────────────────────

function makeQuestion(id: string): Question {
  return {
    id,
    type: 'single',
    stem: `문항 ${id}`,
    options: [
      { id: `${id}-a`, text: '보기1', isCorrect: true },
      { id: `${id}-b`, text: '보기2', isCorrect: false },
    ],
    score: 10,
    timerSeconds: 30,
  } as unknown as Question;
}

function makeResponse(
  overrides: Partial<Response> & { questionId: string; studentId: string },
): Response {
  const { questionId, studentId, ...rest } = overrides;
  return {
    id: `resp-${questionId}-${studentId}`,
    questionId,
    studentId,
    answer: rest.answer ?? { optionIds: [] },
    isCorrect: rest.isCorrect ?? false,
    scoreEarned: rest.scoreEarned ?? 0,
    submittedAt: '2026-06-12T00:00:00.000Z',
    ...rest,
  } as unknown as Response;
}

function makeSurvey(questions: Question[]): MultiSurveyV2 {
  return {
    id: 'survey-1',
    formatVersion: 2,
    title: '테스트 설문',
    createdAt: '2026-06-12T00:00:00.000Z',
    updatedAt: '2026-06-12T00:00:00.000Z',
    questions,
    presentationOpts: {
      showCumulativeScore: true,
      revealExplanation: true,
      allowReentry: false,
    },
    responseOpts: {
      explicitSubmitButton: false,
      autoAdvance: true,
      fastSolveBonus: false,
      streakBonus: false,
      randomBonus: false,
    },
    displayOpts: {
      teacherFocusMode: false,
      showPerQuestionScore: false,
    },
  };
}

function makeLiveSession(overrides: Partial<LiveSession> = {}): LiveSession {
  return {
    id: 'live-1',
    surveyId: 'survey-1',
    round: 1,
    phase: 'lobby',
    currentQuestionIndex: 0,
    students: [],
    responses: [],
    studentInteractions: [],
    focusModeActive: false,
    startedAt: '2026-06-12T00:00:00.000Z',
    ...overrides,
  };
}

// ── 테스트 ─────────────────────────────────────────────────────────────

describe('buildShareSnapshot', () => {
  const q1 = makeQuestion('q1');
  const q2 = makeQuestion('q2');
  const survey = makeSurvey([q1, q2]);
  const ENTRY_URL = 'http://192.168.0.1:3000';

  it('phase가 lobby일 때 currentQuestion은 첫 번째 문항이다', () => {
    const live = makeLiveSession({ phase: 'lobby', currentQuestionIndex: 0 });
    const snap = buildShareSnapshot(live, survey, ENTRY_URL);
    expect(snap.phase).toBe('lobby');
    expect(snap.currentQuestion).toEqual(q1);
  });

  it('currentQuestionIndex가 범위를 벗어나면 currentQuestion은 null이다', () => {
    const live = makeLiveSession({ phase: 'end', currentQuestionIndex: 99 });
    const snap = buildShareSnapshot(live, survey, ENTRY_URL);
    expect(snap.currentQuestion).toBeNull();
  });

  it('questionNumber는 1-based이다', () => {
    const live = makeLiveSession({ currentQuestionIndex: 1 });
    const snap = buildShareSnapshot(live, survey, ENTRY_URL);
    expect(snap.questionNumber).toBe(2);
  });

  it('totalQuestions은 survey.questions.length와 같다', () => {
    const live = makeLiveSession();
    const snap = buildShareSnapshot(live, survey, ENTRY_URL);
    expect(snap.totalQuestions).toBe(2);
  });

  it('responsesForCurrent는 현재 문항 응답만 포함한다', () => {
    const r1 = makeResponse({ questionId: 'q1', studentId: 's1' });
    const r2 = makeResponse({ questionId: 'q2', studentId: 's1' });
    const live = makeLiveSession({
      currentQuestionIndex: 0,
      responses: [r1, r2],
    });
    const snap = buildShareSnapshot(live, survey, ENTRY_URL);
    expect(snap.responsesForCurrent).toHaveLength(1);
    expect(snap.responsesForCurrent[0]?.questionId).toBe('q1');
  });

  it('allResponses는 모든 응답을 포함한다', () => {
    const r1 = makeResponse({ questionId: 'q1', studentId: 's1' });
    const r2 = makeResponse({ questionId: 'q2', studentId: 's1' });
    const live = makeLiveSession({ responses: [r1, r2] });
    const snap = buildShareSnapshot(live, survey, ENTRY_URL);
    expect(snap.allResponses).toHaveLength(2);
  });

  it('responsesForCurrent는 currentQuestion이 null이면 빈 배열이다', () => {
    const r1 = makeResponse({ questionId: 'q1', studentId: 's1' });
    const live = makeLiveSession({ currentQuestionIndex: 99, responses: [r1] });
    const snap = buildShareSnapshot(live, survey, ENTRY_URL);
    expect(snap.responsesForCurrent).toHaveLength(0);
  });

  it('students는 liveSession.students를 그대로 담는다', () => {
    const student = {
      studentId: 's1',
      nickname: '홍길동',
      pin4: '1234',
      avatarKey: 'cat',
      isRealName: false,
    };
    const live = makeLiveSession({ students: [student] });
    const snap = buildShareSnapshot(live, survey, ENTRY_URL);
    expect(snap.students).toHaveLength(1);
    expect(snap.students[0]?.studentId).toBe('s1');
  });

  it('revealExplanation은 survey.presentationOpts.revealExplanation과 같다', () => {
    const live = makeLiveSession();
    const snap = buildShareSnapshot(live, survey, ENTRY_URL);
    expect(snap.revealExplanation).toBe(survey.presentationOpts.revealExplanation);
  });

  it('allowReentry는 survey.presentationOpts.allowReentry와 같다', () => {
    const live = makeLiveSession();
    const snap = buildShareSnapshot(live, survey, ENTRY_URL);
    expect(snap.allowReentry).toBe(survey.presentationOpts.allowReentry);
  });

  it('entryUrl이 스냅샷에 포함된다', () => {
    const live = makeLiveSession();
    const snap = buildShareSnapshot(live, survey, ENTRY_URL);
    expect(snap.entryUrl).toBe(ENTRY_URL);
  });

  it('entryCode 필드가 스냅샷에 없다 (폐기 결정 2026-06-12)', () => {
    const live = makeLiveSession();
    const snap = buildShareSnapshot(live, survey, ENTRY_URL);
    expect(snap).not.toHaveProperty('entryCode');
  });

  it('6가지 phase 모두 변환 가능하다', () => {
    const phases = ['lobby', 'open', 'revealed', 'round_result', 'podium', 'end'] as const;
    for (const phase of phases) {
      const live = makeLiveSession({ phase });
      const snap = buildShareSnapshot(live, survey, ENTRY_URL);
      expect(snap.phase).toBe(phase);
    }
  });

  it('JSON.stringify 라운드트립 — 직렬화 안전 (함수·Date 객체 없음)', () => {
    const r1 = makeResponse({
      questionId: 'q1',
      studentId: 's1',
      isCorrect: true,
      scoreEarned: 10,
    });
    const live = makeLiveSession({
      phase: 'open',
      currentQuestionIndex: 0,
      responses: [r1],
      students: [
        { studentId: 's1', nickname: '홍길동', pin4: '1234', avatarKey: 'cat', isRealName: false },
      ],
    });
    const snap = buildShareSnapshot(live, survey, ENTRY_URL);
    const serialized = JSON.stringify(snap);
    const parsed = JSON.parse(serialized) as typeof snap;
    expect(parsed.phase).toBe('open');
    expect(parsed.students).toHaveLength(1);
    expect(parsed.allResponses).toHaveLength(1);
    expect(parsed.entryUrl).toBe(ENTRY_URL);
  });

  it('정답 정보가 포함된다 — reveal phase에서 교실 화면에 노출 가능', () => {
    const live = makeLiveSession({ phase: 'revealed', currentQuestionIndex: 0 });
    const snap = buildShareSnapshot(live, survey, ENTRY_URL);
    // currentQuestion에 options(isCorrect 포함)가 그대로 전달된다
    expect(snap.currentQuestion).not.toBeNull();
    if (snap.currentQuestion) {
      // Question 타입이 options를 가지면 정답 정보 포함 확인
      const opts = (snap.currentQuestion as unknown as { options?: Array<{ isCorrect: boolean }> })
        .options;
      if (opts) {
        expect(opts.some((o) => o.isCorrect)).toBe(true);
      }
    }
  });
});
