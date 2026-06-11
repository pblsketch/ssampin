import { describe, expect, it } from 'vitest';
import type { Question } from '../entities/multiSurvey/Question';
import type { Response } from '../entities/multiSurvey/Response';
import {
  calcAccuracy,
  groupResponsesByChoice,
  isAnswerCorrect,
  isAutoAdvanceEnabled,
} from './multiSurveyRules';

// ──────────────────────────────────────────────
// 테스트 픽스처
// ──────────────────────────────────────────────

const oxQuestion: Question = {
  id: 'q-ox',
  type: 'ox',
  text: '지구는 태양 주위를 돈다.',
  timerSeconds: 20,
  score: 10,
  correctAnswer: 'O',
};

const multipleQuestion: Question = {
  id: 'q-multiple',
  type: 'multiple',
  text: '광합성에 필요한 것을 모두 고르시오.',
  timerSeconds: 30,
  score: 10,
  choices: [
    { id: 'c1', text: '빛' },
    { id: 'c2', text: '이산화탄소' },
    { id: 'c3', text: '산소' },
    { id: 'c4', text: '물' },
  ],
  correctChoiceIds: ['c1', 'c2', 'c4'],
};

const shortQuestion: Question = {
  id: 'q-short',
  type: 'short',
  text: '대한민국의 수도는?',
  timerSeconds: 15,
  score: 10,
  acceptedAnswers: ['서울', 'Seoul'],
  caseSensitive: false,
};

const singleChoiceQuestion: Question = {
  id: 'q-single',
  type: 'single-choice',
  text: '좋아하는 과목을 선택하세요.',
  timerSeconds: 20,
  score: 0,
  options: [
    { id: 'o1', text: '수학' },
    { id: 'o2', text: '영어' },
  ],
};

const scaleQuestion: Question = {
  id: 'q-scale',
  type: 'scale',
  text: '수업 만족도를 선택하세요.',
  timerSeconds: 20,
  score: 0,
  scaleMin: 1,
  scaleMax: 5,
};

function makeResponse(overrides: Partial<Response>): Response {
  return {
    id: 'r1',
    studentId: 's1',
    questionId: 'q1',
    answer: 'O',
    submittedAt: '2026-05-29T00:00:00.000Z',
    scoreEarned: 0,
    ...overrides,
  };
}

// ──────────────────────────────────────────────
// isAutoAdvanceEnabled (DN-08)
// ──────────────────────────────────────────────

describe('isAutoAdvanceEnabled', () => {
  const opts = { autoAdvance: true, showPerQuestionScore: false };

  it('quiz 타입 + autoAdvance ON + showPerQuestionScore OFF + timerSeconds > 0 → true', () => {
    expect(isAutoAdvanceEnabled(opts, oxQuestion)).toBe(true);
  });

  it('survey 타입(single-choice)은 false — quiz 메카닉 미적용', () => {
    expect(isAutoAdvanceEnabled(opts, singleChoiceQuestion)).toBe(false);
  });

  it('survey 타입(scale)은 false', () => {
    expect(isAutoAdvanceEnabled(opts, scaleQuestion)).toBe(false);
  });

  it('autoAdvance OFF → false', () => {
    expect(
      isAutoAdvanceEnabled({ autoAdvance: false, showPerQuestionScore: false }, oxQuestion),
    ).toBe(false);
  });

  it('showPerQuestionScore ON → false (T10이 켜지면 중간 순위 phase로 진행)', () => {
    expect(
      isAutoAdvanceEnabled({ autoAdvance: true, showPerQuestionScore: true }, oxQuestion),
    ).toBe(false);
  });

  it('timerSeconds === 0 → false', () => {
    const noTimer: Question = { ...oxQuestion, timerSeconds: 0 };
    expect(isAutoAdvanceEnabled(opts, noTimer)).toBe(false);
  });
});

// ──────────────────────────────────────────────
// calcAccuracy (DN-02)
// ──────────────────────────────────────────────

describe('calcAccuracy', () => {
  it('quiz 응답만 있을 때 정답률 계산', () => {
    const responses: Response[] = [
      makeResponse({ isCorrect: true }),
      makeResponse({ id: 'r2', isCorrect: true }),
      makeResponse({ id: 'r3', isCorrect: false }),
      makeResponse({ id: 'r4', isCorrect: false }),
    ];
    expect(calcAccuracy(responses)).toBeCloseTo(0.5);
  });

  it('survey 응답(isCorrect undefined)은 분모에서 제외', () => {
    const responses: Response[] = [
      makeResponse({ isCorrect: true }),
      makeResponse({ id: 'r2', isCorrect: undefined }), // survey
      makeResponse({ id: 'r3', isCorrect: undefined }), // survey
    ];
    // quiz 1건 중 1건 정답 → 1.0
    expect(calcAccuracy(responses)).toBeCloseTo(1.0);
  });

  it('quiz 응답이 0건(전부 survey)이면 0', () => {
    const responses: Response[] = [
      makeResponse({ isCorrect: undefined }),
      makeResponse({ id: 'r2', isCorrect: undefined }),
    ];
    expect(calcAccuracy(responses)).toBe(0);
  });

  it('빈 배열이면 0', () => {
    expect(calcAccuracy([])).toBe(0);
  });
});

// ──────────────────────────────────────────────
// isAnswerCorrect (DN-02)
// ──────────────────────────────────────────────

describe('isAnswerCorrect', () => {
  it('survey 타입(single-choice)은 undefined 반환', () => {
    expect(isAnswerCorrect(singleChoiceQuestion, 'o1')).toBeUndefined();
  });

  it('survey 타입(scale)은 undefined 반환', () => {
    expect(isAnswerCorrect(scaleQuestion, 3)).toBeUndefined();
  });

  it('OX — 정답 O 입력 시 true', () => {
    expect(isAnswerCorrect(oxQuestion, 'O')).toBe(true);
  });

  it('OX — 오답 X 입력 시 false', () => {
    expect(isAnswerCorrect(oxQuestion, 'X')).toBe(false);
  });

  it('multiple — 정확히 일치하는 correctChoiceIds → true', () => {
    expect(isAnswerCorrect(multipleQuestion, ['c1', 'c2', 'c4'])).toBe(true);
  });

  it('multiple — 순서가 달라도 동일 집합이면 true', () => {
    expect(isAnswerCorrect(multipleQuestion, ['c4', 'c1', 'c2'])).toBe(true);
  });

  it('multiple — 오답 포함 시 false', () => {
    expect(isAnswerCorrect(multipleQuestion, ['c1', 'c2', 'c3'])).toBe(false);
  });

  it('short — caseSensitive false, 대소문자 무시 정답', () => {
    expect(isAnswerCorrect(shortQuestion, 'seoul')).toBe(true);
  });

  it('short — 오답 입력 시 false', () => {
    expect(isAnswerCorrect(shortQuestion, '부산')).toBe(false);
  });
});

// ──────────────────────────────────────────────
// groupResponsesByChoice (DN-05)
// ──────────────────────────────────────────────

describe('groupResponsesByChoice', () => {
  it('OX 문항 — O/X 응답 집계', () => {
    const responses: Response[] = [
      makeResponse({ answer: 'O' }),
      makeResponse({ id: 'r2', answer: 'O' }),
      makeResponse({ id: 'r3', answer: 'X' }),
    ];
    const result = groupResponsesByChoice(responses, oxQuestion);
    expect(result).toHaveLength(2);
    const oEntry = result.find((r) => r.choiceId === 'O');
    const xEntry = result.find((r) => r.choiceId === 'X');
    expect(oEntry?.count).toBe(2);
    expect(xEntry?.count).toBe(1);
    expect(oEntry?.ratio).toBeCloseTo(2 / 3);
  });

  it('single-choice 문항 — 선택지별 카운트', () => {
    const responses: Response[] = [
      makeResponse({ answer: ['o1'] }),
      makeResponse({ id: 'r2', answer: ['o1'] }),
      makeResponse({ id: 'r3', answer: ['o2'] }),
    ];
    const result = groupResponsesByChoice(responses, singleChoiceQuestion);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.choiceId === 'o1')?.count).toBe(2);
    expect(result.find((r) => r.choiceId === 'o2')?.count).toBe(1);
  });

  it('text 문항은 빈 배열 반환', () => {
    const textQ: Question = {
      id: 'q-text',
      type: 'text',
      text: '자유롭게 작성하세요.',
      timerSeconds: 60,
      score: 0,
    };
    const result = groupResponsesByChoice([], textQ);
    expect(result).toEqual([]);
  });

  it('scale 문항은 빈 배열 반환', () => {
    const result = groupResponsesByChoice([], scaleQuestion);
    expect(result).toEqual([]);
  });

  it('응답 없으면 ratio 모두 0', () => {
    const result = groupResponsesByChoice([], oxQuestion);
    expect(result.every((r) => r.ratio === 0)).toBe(true);
    expect(result.every((r) => r.count === 0)).toBe(true);
  });
});
