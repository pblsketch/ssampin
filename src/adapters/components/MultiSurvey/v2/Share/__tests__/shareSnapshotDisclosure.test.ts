/**
 * 교실 화면으로 **무엇이 나가는가**를 고정한다.
 *
 * 화면이 그리지 않는 것과 창에 보내지 않는 것은 다르다.
 * 응답을 받는 중에도 `correctChoiceIds` 가 통째로 실려 나가던 결함을 다시 만들지 않으려고 둔다.
 */

import { describe, expect, it } from 'vitest';
import { buildShareSnapshot } from '../shareSnapshot';
import type { LiveSession } from '@domain/entities/multiSurvey/LiveSession';
import type { MultiSurveyV2 } from '@domain/entities/multiSurvey/MultiSurveyV2';
import type { Question } from '@domain/entities/multiSurvey/Question';

const quiz: Question = {
  id: 'q1',
  type: 'multiple',
  text: '무엇이 맞나요?',
  timerSeconds: 60,
  score: 10,
  explanation: '이래서 가가 맞아요.',
  choices: [
    { id: 'a', text: '가' },
    { id: 'b', text: '나' },
  ],
  correctChoiceIds: ['a'],
};

function survey(patch: Partial<MultiSurveyV2> = {}): MultiSurveyV2 {
  return {
    id: 's1',
    formatVersion: 2,
    purpose: 'activity',
    title: '활동',
    createdAt: '2026-09-21T00:00:00.000Z',
    updatedAt: '2026-09-21T00:00:00.000Z',
    questions: [quiz],
    presentationOpts: { showCumulativeScore: true, revealExplanation: true, allowReentry: true },
    responseOpts: {
      explicitSubmitButton: false,
      autoAdvance: false,
      fastSolveBonus: false,
      streakBonus: false,
      randomBonus: false,
    },
    displayOpts: { teacherFocusMode: false, showPerQuestionScore: false },
    ...patch,
  };
}

function live(patch: Partial<LiveSession> = {}): LiveSession {
  return {
    id: 'live',
    surveyId: 's1',
    round: 1,
    phase: 'open',
    currentQuestionIndex: 0,
    students: [
      { studentId: 'x', nickname: '가나', pin4: '1234', avatarKey: '', isRealName: false },
    ],
    responses: [
      {
        id: 'r1',
        studentId: 'x',
        questionId: 'q1',
        answer: ['a'],
        submittedAt: '2026-09-21T00:00:01.000Z',
        isCorrect: true,
        scoreEarned: 10,
      },
    ],
    studentInteractions: [],
    focusModeActive: false,
    hiddenWordsByQuestion: {},
    startedAt: '2026-09-21T00:00:00.000Z',
    ...patch,
  };
}

/**
 * 정답 **값**이 실려 있는지 본다.
 *
 * 자리(키)는 남겨 두고 값을 비운다 — 자리까지 없애면 그것을 읽는 화면이 터지기 때문이다.
 * 그래서 키 이름이 아니라 실제 정답 값('a')과 해설 문구가 있는지로 판정한다.
 */
function leaksAnswer(question: unknown): boolean {
  const q = (question ?? {}) as Record<string, unknown>;
  const ids = Array.isArray(q['correctChoiceIds']) ? (q['correctChoiceIds'] as unknown[]) : [];
  return ids.length > 0 || q['correctAnswer'] !== undefined || q['explanation'] !== undefined;
}

describe('교실 화면으로 나가는 자료', () => {
  it('응답을 받는 중에는 정답을 보내지 않는다', () => {
    const snapshot = buildShareSnapshot(live(), survey(), 'http://x');
    expect(leaksAnswer(snapshot.currentQuestion)).toBe(false);
    expect(snapshot.participation?.answer).toBeUndefined();
    expect(snapshot.participation?.explanation).toBeUndefined();
  });

  it('마감만 했을 때도 정답과 응답 원문을 보내지 않는다', () => {
    const snapshot = buildShareSnapshot(live({ phase: 'revealed' }), survey(), 'http://x');
    expect(leaksAnswer(snapshot.currentQuestion)).toBe(false);
    // 자리는 남긴다 — 이 값을 읽는 화면이 터지지 않아야 한다.
    expect(snapshot.currentQuestion).toHaveProperty('correctChoiceIds', []);
    expect(snapshot.responsesForCurrent).toHaveLength(0);
    // 몇 명이 냈는지는 정답이 아니므로 그대로 보여 준다.
    expect(snapshot.participation?.answeredCount).toBe(1);
    expect(snapshot.participation?.stage).toBe('closed');
  });

  it('결과만 공개하면 분포는 가되 정답은 아직 가지 않는다', () => {
    const snapshot = buildShareSnapshot(
      live({ phase: 'revealed', resultsPublished: true }),
      survey(),
      'http://x',
    );
    expect(snapshot.responsesForCurrent).toHaveLength(1);
    expect(leaksAnswer(snapshot.currentQuestion)).toBe(false);
    expect(snapshot.participation?.answer).toBeUndefined();
  });

  it('정답을 공개하면 그때 정답과 해설이 간다', () => {
    const snapshot = buildShareSnapshot(
      live({ phase: 'revealed', resultsPublished: true, answerPublished: true }),
      survey(),
      'http://x',
    );
    expect(snapshot.participation?.answer).toBe('가');
    expect(snapshot.participation?.explanation).toBe('이래서 가가 맞아요.');
    expect(snapshot.currentQuestionScored).toBe(true);
  });

  it('학생 재입장 비번은 어느 단계에서도 나가지 않는다', () => {
    const snapshot = buildShareSnapshot(live(), survey(), 'http://x');
    expect(snapshot.students[0]?.pin4).toBe('');
  });

  it('옛 멀티설문 v2(목적 없음)는 건드리지 않는다', () => {
    const legacy = survey({ purpose: undefined });
    const snapshot = buildShareSnapshot(live({ phase: 'revealed' }), legacy, 'http://x');
    expect(leaksAnswer(snapshot.currentQuestion)).toBe(true);
    expect(snapshot.responsesForCurrent).toHaveLength(1);
  });
});
