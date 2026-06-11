/**
 * liveBridge 단위 테스트 — 9종 문항 → 학생 HTML 4종 매핑 + 답변 → Response 변환.
 */
import { describe, it, expect } from 'vitest';
import type {
  OXQuestion,
  MultipleQuestion,
  ShortQuestion,
  BlankQuestion,
  DescriptionQuestion,
  SingleChoiceQuestion,
  ScaleQuestion,
  TextQuestion,
} from '@domain/entities/multiSurvey/Question';
import {
  mapQuestionsForLiveHTML,
  mapStudentAnswerToDomain,
  buildResponseFromLiveAnswer,
  OX_OPTIONS,
} from '../liveBridge';

const base = { text: '문항', timerSeconds: 20, score: 10 } as const;

const ox: OXQuestion = { ...base, id: 'q-ox', type: 'ox', correctAnswer: 'O' };
const multiple: MultipleQuestion = {
  ...base,
  id: 'q-mul',
  type: 'multiple',
  choices: [
    { id: 'c1', text: '보기1' },
    { id: 'c2', text: '보기2' },
    { id: 'c3', text: '보기3' },
  ],
  correctChoiceIds: ['c1', 'c3'],
};
const short: ShortQuestion = {
  ...base,
  id: 'q-short',
  type: 'short',
  acceptedAnswers: ['세종대왕'],
  caseSensitive: false,
};
const blank: BlankQuestion = {
  ...base,
  id: 'q-blank',
  type: 'blank',
  acceptedAnswers: ['ㅅㅈㄷㅇ'],
  isHangulInitial: true,
};
const description: DescriptionQuestion = {
  ...base,
  id: 'q-desc',
  type: 'description',
  minLength: 5,
  maxLength: 200,
};
const singleChoice: SingleChoiceQuestion = {
  ...base,
  id: 'q-sc',
  type: 'single-choice',
  score: 0,
  options: [
    { id: 'o1', text: 'A' },
    { id: 'o2', text: 'B' },
  ],
};
const scale: ScaleQuestion = {
  ...base,
  id: 'q-scale',
  type: 'scale',
  score: 0,
  scaleMin: 1,
  scaleMax: 5,
  scaleMinLabel: '별로',
  scaleMaxLabel: '최고',
};
const text: TextQuestion = { ...base, id: 'q-text', type: 'text', score: 0, maxLength: 300 };

describe('mapQuestionsForLiveHTML', () => {
  it('v1 4종은 타입을 보존하고 question 필드에 text를 매핑한다', () => {
    const mapped = mapQuestionsForLiveHTML([singleChoice, scale, text]);
    expect(mapped[0]).toMatchObject({
      id: 'q-sc',
      type: 'single-choice',
      question: '문항',
      options: [
        { id: 'o1', text: 'A' },
        { id: 'o2', text: 'B' },
      ],
    });
    expect(mapped[1]).toMatchObject({
      type: 'scale',
      scaleMin: 1,
      scaleMax: 5,
      scaleMinLabel: '별로',
      scaleMaxLabel: '최고',
    });
    expect(mapped[2]).toMatchObject({ type: 'text', maxLength: 300 });
  });

  it('ox는 O/X 고정 선택지 single-choice로 다운매핑한다 (id가 정답 비교 키)', () => {
    const [mapped] = mapQuestionsForLiveHTML([ox]);
    expect(mapped).toMatchObject({ type: 'single-choice' });
    expect(mapped!.options?.map((o) => o.id)).toEqual(['O', 'X']);
    expect(OX_OPTIONS.map((o) => o.id)).toEqual(['O', 'X']);
  });

  it('multiple은 choices id를 보존한 multi-choice로 다운매핑한다', () => {
    const [mapped] = mapQuestionsForLiveHTML([multiple]);
    expect(mapped).toMatchObject({ type: 'multi-choice' });
    expect(mapped!.options?.map((o) => o.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('short/blank/description은 text로 다운매핑하고 정답 정보를 노출하지 않는다', () => {
    const mapped = mapQuestionsForLiveHTML([short, blank, description]);
    for (const m of mapped) {
      expect(m.type).toBe('text');
      // 정답 유출 0 — payload 직렬화 시 acceptedAnswers/correctAnswer 부재
      expect(JSON.stringify(m)).not.toContain('세종대왕');
      expect(JSON.stringify(m)).not.toContain('acceptedAnswers');
    }
    expect(mapped[2]).toMatchObject({ maxLength: 200 });
  });
});

describe('mapStudentAnswerToDomain', () => {
  it('ox: optionIds[0]이 O/X일 때만 string으로 변환한다', () => {
    expect(mapStudentAnswerToDomain(ox, { optionIds: ['O'] })).toBe('O');
    expect(mapStudentAnswerToDomain(ox, { optionIds: ['Z'] })).toBeNull();
    expect(mapStudentAnswerToDomain(ox, { text: 'O' })).toBeNull();
  });

  it('multiple: optionIds 배열을 그대로 반환한다', () => {
    expect(mapStudentAnswerToDomain(multiple, { optionIds: ['c1', 'c3'] })).toEqual(['c1', 'c3']);
    expect(mapStudentAnswerToDomain(multiple, { optionIds: [] })).toBeNull();
  });

  it('short/blank/description: 공백뿐인 text는 null', () => {
    expect(mapStudentAnswerToDomain(short, { text: '세종대왕' })).toBe('세종대왕');
    expect(mapStudentAnswerToDomain(short, { text: '   ' })).toBeNull();
  });

  it('scale: 유한 숫자만 허용한다', () => {
    expect(mapStudentAnswerToDomain(scale, { scale: 4 })).toBe(4);
    expect(mapStudentAnswerToDomain(scale, { text: '4' })).toBeNull();
  });
});

describe('buildResponseFromLiveAnswer', () => {
  const now = (): Date => new Date('2026-06-11T09:00:00.000Z');

  it('quiz 정답이면 isCorrect=true + scoreEarned=score', () => {
    const r = buildResponseFromLiveAnswer({
      question: ox,
      studentId: 'stu-1',
      payload: { optionIds: ['O'] },
      now,
    });
    expect(r).toMatchObject({
      studentId: 'stu-1',
      questionId: 'q-ox',
      answer: 'O',
      isCorrect: true,
      scoreEarned: 10,
      submittedAt: '2026-06-11T09:00:00.000Z',
    });
  });

  it('quiz 오답이면 isCorrect=false + scoreEarned=0', () => {
    const r = buildResponseFromLiveAnswer({
      question: multiple,
      studentId: 'stu-2',
      payload: { optionIds: ['c1', 'c2'] },
      now,
    });
    expect(r).toMatchObject({ isCorrect: false, scoreEarned: 0 });
  });

  it('survey 타입(v1)은 isCorrect=undefined + scoreEarned=0 (DN-02)', () => {
    const r = buildResponseFromLiveAnswer({
      question: singleChoice,
      studentId: 'stu-3',
      payload: { optionIds: ['o1'] },
      now,
    });
    expect(r?.isCorrect).toBeUndefined();
    expect(r?.scoreEarned).toBe(0);
  });

  it('payload가 문항 타입과 어긋나면 null', () => {
    expect(
      buildResponseFromLiveAnswer({ question: ox, studentId: 's', payload: { scale: 3 }, now }),
    ).toBeNull();
  });
});
