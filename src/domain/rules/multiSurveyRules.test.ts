import { describe, expect, it } from 'vitest';
import type { Question } from '../entities/multiSurvey/Question';
import type { Response } from '../entities/multiSurvey/Response';
import type { ResponseOpts } from '../entities/multiSurvey/MultiSurveyV2';
import {
  calcAccuracy,
  calcSessionScore,
  groupResponsesByChoice,
  isAnswerCorrect,
  isAutoAdvanceEnabled,
  normalizeHangulInitial,
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

// ──────────────────────────────────────────────
// normalizeHangulInitial (작업 4)
// ──────────────────────────────────────────────

describe('normalizeHangulInitial', () => {
  it('완성형 한글 음절을 초성으로 변환 — "한" → "ㅎ"', () => {
    expect(normalizeHangulInitial('한')).toBe('ㅎ');
  });

  it('"한국" → "ㅎㄱ"', () => {
    expect(normalizeHangulInitial('한국')).toBe('ㅎㄱ');
  });

  it('"안녕하세요" → "ㅇㄴㅎㅅㅇ"', () => {
    expect(normalizeHangulInitial('안녕하세요')).toBe('ㅇㄴㅎㅅㅇ');
  });

  it('비한글 문자(영문·숫자·기호)는 그대로 통과', () => {
    expect(normalizeHangulInitial('ABC123!@#')).toBe('ABC123!@#');
  });

  it('혼합 문자열 — 한글 부분만 초성으로 변환', () => {
    expect(normalizeHangulInitial('Hello한국World')).toBe('HelloㅎㄱWorld');
  });

  it('이미 초성인 문자(ㄱ~ㅎ)는 그대로 통과', () => {
    // 초성 자모는 AC00~D7A3 범위 밖이므로 변환 없음
    expect(normalizeHangulInitial('ㅎㄱ')).toBe('ㅎㄱ');
  });

  it('빈 문자열은 빈 문자열 반환', () => {
    expect(normalizeHangulInitial('')).toBe('');
  });
});

// ──────────────────────────────────────────────
// isAnswerCorrect — blank + isHangulInitial (작업 4)
// ──────────────────────────────────────────────

describe('isAnswerCorrect — blank isHangulInitial', () => {
  const blankQ: Question = {
    id: 'q-blank',
    type: 'blank',
    text: '대한민국의 수도는?',
    timerSeconds: 20,
    score: 10,
    acceptedAnswers: ['한국', '대한민국'],
    isHangulInitial: true,
  };

  const blankQPlain: Question = {
    ...blankQ,
    isHangulInitial: false,
  };

  it('isHangulInitial=true — 초성 답("ㅎㄱ")이 acceptedAnswers ["한국"]에 정답', () => {
    expect(isAnswerCorrect(blankQ, 'ㅎㄱ')).toBe(true);
  });

  it('isHangulInitial=true — 완성형 답("한국") 자체도 정답 (초성화되어 일치)', () => {
    expect(isAnswerCorrect(blankQ, '한국')).toBe(true);
  });

  it('isHangulInitial=true — 공백이 있어도 무시 ("한 국" → "ㅎㄱ")', () => {
    expect(isAnswerCorrect(blankQ, '한 국')).toBe(true);
  });

  it('isHangulInitial=true — 틀린 초성("ㅅㅇ")은 오답', () => {
    expect(isAnswerCorrect(blankQ, 'ㅅㅇ')).toBe(false);
  });

  it('isHangulInitial=false — 초성 답("ㅎㄱ")은 오답 (기존 plain match 보존)', () => {
    expect(isAnswerCorrect(blankQPlain, 'ㅎㄱ')).toBe(false);
  });

  it('isHangulInitial=false — 완성형 정답("한국")은 정답', () => {
    expect(isAnswerCorrect(blankQPlain, '한국')).toBe(true);
  });

  it('answer가 문자열 아니면 false', () => {
    expect(isAnswerCorrect(blankQ, 123)).toBe(false);
  });
});

// ──────────────────────────────────────────────
// calcSessionScore (작업 3)
// ──────────────────────────────────────────────

describe('calcSessionScore', () => {
  /** 모든 토글 ON */
  const optsAllOn: ResponseOpts = {
    explicitSubmitButton: false,
    autoAdvance: true,
    fastSolveBonus: true,
    streakBonus: true,
    randomBonus: true,
  };

  /** 모든 토글 OFF */
  const optsAllOff: ResponseOpts = {
    explicitSubmitButton: false,
    autoAdvance: false,
    fastSolveBonus: false,
    streakBonus: false,
    randomBonus: false,
  };

  const quizQ: Question = {
    id: 'q-ox-score',
    type: 'ox',
    text: '지구는 태양 주위를 돈다.',
    timerSeconds: 20,
    score: 10,
    correctAnswer: 'O',
  };

  /** 기준 시각 — 문항 open */
  const openedAt = '2026-06-12T09:00:00.000Z';
  /** 5초 후 제출 */
  const submittedAt5s = '2026-06-12T09:00:05.000Z';
  /** 정확히 timerSeconds(20초) 후 제출 → ratio 0 */
  const submittedAt20s = '2026-06-12T09:00:20.000Z';
  /** timer 초과(25초 후) → ratio 0 */
  const submittedAt25s = '2026-06-12T09:00:25.000Z';

  function makeCorrectResponse(overrides: Partial<Response> = {}): Response {
    return makeResponse({ isCorrect: true, answer: 'O', submittedAt: submittedAt5s, ...overrides });
  }

  function makeWrongResponse(overrides: Partial<Response> = {}): Response {
    return makeResponse({
      isCorrect: false,
      answer: 'X',
      submittedAt: submittedAt5s,
      ...overrides,
    });
  }

  it('오답이면 모든 보너스 포함 전부 0', () => {
    const result = calcSessionScore({
      question: quizQ,
      response: makeWrongResponse(),
      questionOpenedAt: openedAt,
      currentStreak: 5,
      opts: optsAllOn,
      rng: () => 0.99,
    });
    expect(result).toEqual({ base: 0, fastSolve: 0, streak: 0, random: 0, total: 0 });
  });

  it('survey 타입(single-choice)은 base 0, 보너스 전부 0', () => {
    const surveyQ: Question = {
      id: 'q-survey',
      type: 'single-choice',
      text: '좋아하는 과목?',
      timerSeconds: 20,
      score: 0,
      options: [{ id: 'o1', text: '수학' }],
    };
    const result = calcSessionScore({
      question: surveyQ,
      response: makeResponse({ isCorrect: undefined, answer: ['o1'] }),
      questionOpenedAt: openedAt,
      currentStreak: 3,
      opts: optsAllOn,
      rng: () => 0.99,
    });
    expect(result).toEqual({ base: 0, fastSolve: 0, streak: 0, random: 0, total: 0 });
  });

  it('토글 전부 OFF — base만 반환', () => {
    const result = calcSessionScore({
      question: quizQ,
      response: makeCorrectResponse(),
      questionOpenedAt: openedAt,
      currentStreak: 5,
      opts: optsAllOff,
      rng: () => 0.99,
    });
    expect(result.base).toBe(10);
    expect(result.fastSolve).toBe(0);
    expect(result.streak).toBe(0);
    expect(result.random).toBe(0);
    expect(result.total).toBe(10);
  });

  it('fastSolve — 0초 경과(=문항 open 직후 제출) → ratio 1.0, 최대 보너스', () => {
    // elapsed=0 → ratio=1 → fastSolve = round(10 * 0.5 * 1) = 5
    const result = calcSessionScore({
      question: quizQ,
      response: makeCorrectResponse({ submittedAt: openedAt }),
      questionOpenedAt: openedAt,
      currentStreak: 0,
      opts: { ...optsAllOff, fastSolveBonus: true },
    });
    expect(result.fastSolve).toBe(5);
    expect(result.base).toBe(10);
  });

  it('fastSolve — 5초 경과(timerSeconds=20) → ratio=0.75, fastSolve=round(10*0.5*0.75)=4', () => {
    const result = calcSessionScore({
      question: quizQ,
      response: makeCorrectResponse({ submittedAt: submittedAt5s }),
      questionOpenedAt: openedAt,
      currentStreak: 0,
      opts: { ...optsAllOff, fastSolveBonus: true },
    });
    expect(result.fastSolve).toBe(4); // round(3.75) = 4
  });

  it('fastSolve — timerSeconds 경과(20초) → ratio=0 → fastSolve=0', () => {
    const result = calcSessionScore({
      question: quizQ,
      response: makeCorrectResponse({ submittedAt: submittedAt20s }),
      questionOpenedAt: openedAt,
      currentStreak: 0,
      opts: { ...optsAllOff, fastSolveBonus: true },
    });
    expect(result.fastSolve).toBe(0);
  });

  it('fastSolve — timer 초과(25초) → ratio clamp 0 → fastSolve=0', () => {
    const result = calcSessionScore({
      question: quizQ,
      response: makeCorrectResponse({ submittedAt: submittedAt25s }),
      questionOpenedAt: openedAt,
      currentStreak: 0,
      opts: { ...optsAllOff, fastSolveBonus: true },
    });
    expect(result.fastSolve).toBe(0);
  });

  it('fastSolve — timerSeconds=0이면 fastSolve=0 (조건 가드)', () => {
    const noTimerQ: Question = { ...quizQ, timerSeconds: 0 };
    const result = calcSessionScore({
      question: noTimerQ,
      response: makeCorrectResponse({ submittedAt: openedAt }),
      questionOpenedAt: openedAt,
      currentStreak: 0,
      opts: { ...optsAllOff, fastSolveBonus: true },
    });
    expect(result.fastSolve).toBe(0);
  });

  it('streak — currentStreak=3 → streak=3*2=6', () => {
    const result = calcSessionScore({
      question: quizQ,
      response: makeCorrectResponse(),
      questionOpenedAt: openedAt,
      currentStreak: 3,
      opts: { ...optsAllOff, streakBonus: true },
    });
    expect(result.streak).toBe(6);
  });

  it('streak — currentStreak=7 → 상한 5 적용 → streak=5*2=10', () => {
    const result = calcSessionScore({
      question: quizQ,
      response: makeCorrectResponse(),
      questionOpenedAt: openedAt,
      currentStreak: 7,
      opts: { ...optsAllOff, streakBonus: true },
    });
    expect(result.streak).toBe(10);
  });

  it('streak — currentStreak=0 → streak=0', () => {
    const result = calcSessionScore({
      question: quizQ,
      response: makeCorrectResponse(),
      questionOpenedAt: openedAt,
      currentStreak: 0,
      opts: { ...optsAllOff, streakBonus: true },
    });
    expect(result.streak).toBe(0);
  });

  it('random — rng=()=>0.99 → floor(0.99*6)=5', () => {
    const result = calcSessionScore({
      question: quizQ,
      response: makeCorrectResponse(),
      questionOpenedAt: openedAt,
      currentStreak: 0,
      opts: { ...optsAllOff, randomBonus: true },
      rng: () => 0.99,
    });
    expect(result.random).toBe(5);
  });

  it('random — rng=()=>0 → floor(0*6)=0', () => {
    const result = calcSessionScore({
      question: quizQ,
      response: makeCorrectResponse(),
      questionOpenedAt: openedAt,
      currentStreak: 0,
      opts: { ...optsAllOff, randomBonus: true },
      rng: () => 0,
    });
    expect(result.random).toBe(0);
  });

  it('random — rng 미지정 → random=0 (결정성 보장)', () => {
    const result = calcSessionScore({
      question: quizQ,
      response: makeCorrectResponse(),
      questionOpenedAt: openedAt,
      currentStreak: 0,
      opts: { ...optsAllOff, randomBonus: true },
      // rng 미지정
    });
    expect(result.random).toBe(0);
  });

  it('total = base + fastSolve + streak + random 합산 검증', () => {
    // 0초 경과 → fastSolve=5, streak currentStreak=2→4, rng=0.5→floor(3)=3
    const result = calcSessionScore({
      question: quizQ,
      response: makeCorrectResponse({ submittedAt: openedAt }),
      questionOpenedAt: openedAt,
      currentStreak: 2,
      opts: optsAllOn,
      rng: () => 0.5,
    });
    expect(result.base).toBe(10);
    expect(result.fastSolve).toBe(5);
    expect(result.streak).toBe(4);
    expect(result.random).toBe(3);
    expect(result.total).toBe(result.base + result.fastSolve + result.streak + result.random);
    expect(result.total).toBe(22);
  });
});
