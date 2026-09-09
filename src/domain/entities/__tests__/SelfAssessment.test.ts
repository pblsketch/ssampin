import { describe, expect, it } from 'vitest';
import {
  SELF_ASSESSMENT_MAX_ANSWER_LENGTH,
  SELF_ASSESSMENT_MAX_QUESTIONS,
  answerLimitOf,
  clipText,
  isSelfAssessmentEmpty,
  normalizeSelfAssessmentAnswers,
  normalizeSelfAssessmentQuestions,
  parseSelfAssessmentAnswers,
  parseSelfAssessmentQuestions,
  selfAssessmentSlots,
  selfAssessmentTextLength,
  type SelfAssessmentAnswer,
  type SelfAssessmentQuestion,
} from '@domain/entities/SelfAssessment';

const q = (
  id: string,
  prompt: string,
  slot?: string,
  maxLength?: number,
): SelfAssessmentQuestion => ({
  id,
  prompt,
  ...(slot !== undefined ? { slot } : {}),
  ...(maxLength !== undefined ? { maxLength } : {}),
});

const a = (questionId: string, answer: string): SelfAssessmentAnswer => ({
  questionId,
  prompt: '(학생이 보낸 값)',
  answer,
});

describe('selfAssessmentTextLength', () => {
  it('이모지를 한 글자로 센다 — String.length 와 달라야 한다', () => {
    expect(selfAssessmentTextLength('가나다')).toBe(3);
    expect('🙂'.length).toBe(2);
    expect(selfAssessmentTextLength('🙂')).toBe(1);
  });
});

describe('normalizeSelfAssessmentQuestions', () => {
  it('빈 물음과 겹친 id 를 버린다', () => {
    const out = normalizeSelfAssessmentQuestions(
      [q('a', '첫 물음'), q('b', '   '), q('a', '같은 id 다른 물음')],
      'teaching',
    );
    expect(out.map((x) => x.id)).toEqual(['a']);
    expect(out[0]?.prompt).toBe('첫 물음');
  });

  it('상한을 넘는 문항은 잘라 낸다', () => {
    const many = Array.from({ length: 10 }, (_, i) => q(`q${i}`, `물음 ${i}`));
    expect(normalizeSelfAssessmentQuestions(many, 'teaching')).toHaveLength(
      SELF_ASSESSMENT_MAX_QUESTIONS,
    );
  });

  it('알 수 없는 슬롯은 문항을 버리지 않고 슬롯만 뗀다 — 교사가 쓴 물음은 남는다', () => {
    const out = normalizeSelfAssessmentQuestions(
      [q('a', '교사가 쓴 물음', '없는슬롯')],
      'teaching',
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.prompt).toBe('교사가 쓴 물음');
    expect(out[0]?.slot).toBeUndefined();
  });

  it('맥락에 맞는 슬롯은 남긴다', () => {
    expect(
      normalizeSelfAssessmentQuestions([q('a', '물음', '시행착오')], 'teaching')[0]?.slot,
    ).toBe('시행착오');
    // 담임 맥락에서는 교과 슬롯이 허용되지 않는다.
    expect(
      normalizeSelfAssessmentQuestions([q('a', '물음', '시행착오')], 'homeroom')[0]?.slot,
    ).toBeUndefined();
  });

  it('슬롯이 없으면 필드를 아예 만들지 않는다 — 부재와 빈 값을 구분한다', () => {
    const out = normalizeSelfAssessmentQuestions([q('a', '물음')], 'teaching');
    expect('slot' in out[0]!).toBe(false);
  });
});

describe('normalizeSelfAssessmentAnswers', () => {
  const questions = [q('q1', '무엇이 궁금했나요?', '질문'), q('q2', '무엇을 시도했나요?', '시도')];

  it('문항에 없는 questionId 를 버린다 — 학생 화면을 고쳐 보낸 값을 믿지 않는다', () => {
    const out = normalizeSelfAssessmentAnswers(
      [a('q1', '분모가 궁금했다'), a('침입', '아무 값')],
      questions,
    );
    expect(out.map((x) => x.questionId)).toEqual(['q1']);
  });

  it('문항 원문과 슬롯을 문항 정의에서 복사한다 — 학생이 보낸 prompt 를 안 믿는다', () => {
    const out = normalizeSelfAssessmentAnswers([a('q1', '답')], questions);
    expect(out[0]?.prompt).toBe('무엇이 궁금했나요?');
    expect(out[0]?.slot).toBe('질문');
  });

  it('빈 답은 버린다 — 안 쓴 문항이 빈 근거로 뜨면 안 된다', () => {
    expect(normalizeSelfAssessmentAnswers([a('q1', '   ')], questions)).toHaveLength(0);
  });

  it('학생이 보낸 순서가 아니라 문항 순서로 돌려준다', () => {
    const out = normalizeSelfAssessmentAnswers([a('q2', '두번째'), a('q1', '첫번째')], questions);
    expect(out.map((x) => x.questionId)).toEqual(['q1', 'q2']);
  });

  it('길이 상한으로 자른다', () => {
    const long = 'ㄱ'.repeat(SELF_ASSESSMENT_MAX_ANSWER_LENGTH + 50);
    const out = normalizeSelfAssessmentAnswers([a('q1', long)], questions);
    expect(selfAssessmentTextLength(out[0]!.answer)).toBe(SELF_ASSESSMENT_MAX_ANSWER_LENGTH);
  });

  it('문항별 상한이 있으면 그것을 쓴다', () => {
    const short = [q('q1', '한 줄로', '질문', 10)];
    const out = normalizeSelfAssessmentAnswers([a('q1', '가'.repeat(50))], short);
    expect(selfAssessmentTextLength(out[0]!.answer)).toBe(10);
  });

  it('문항 id 가 겹치면 조용히 고르지 않고 멈춘다', () => {
    expect(() =>
      normalizeSelfAssessmentAnswers([a('q1', '답')], [q('q1', '가'), q('q1', '나')]),
    ).toThrow();
  });

  it('같은 문항에 답이 두 개 오면 하나만 쓴다', () => {
    const out = normalizeSelfAssessmentAnswers([a('q1', '첫 답'), a('q1', '둘째 답')], questions);
    expect(out).toHaveLength(1);
    expect(out[0]?.answer).toBe('첫 답');
  });
});

describe('answerLimitOf', () => {
  it('전역 상한을 넘겨 잡을 수 없다', () => {
    expect(answerLimitOf(q('a', '물음', undefined, 999_999))).toBe(
      SELF_ASSESSMENT_MAX_ANSWER_LENGTH,
    );
  });

  it('이상한 값은 기본 상한으로', () => {
    expect(answerLimitOf(q('a', '물음', undefined, -1))).toBe(SELF_ASSESSMENT_MAX_ANSWER_LENGTH);
    expect(answerLimitOf(q('a', '물음', undefined, Number.NaN))).toBe(
      SELF_ASSESSMENT_MAX_ANSWER_LENGTH,
    );
  });
});

describe('selfAssessmentSlots', () => {
  it('첫 등장 순서를 보존하고 중복을 지운다', () => {
    const out = selfAssessmentSlots(
      [
        { questionId: 'a', prompt: 'p', slot: '질문', answer: 'x' },
        { questionId: 'b', prompt: 'p', answer: 'y' },
        { questionId: 'c', prompt: 'p', slot: '질문', answer: 'z' },
        { questionId: 'd', prompt: 'p', slot: '시도', answer: 'w' },
      ],
      'teaching',
    );
    expect(out).toEqual(['질문', '시도']);
  });

  it('슬롯이 하나도 없으면 빈 배열 — 호출자가 필드를 안 만들도록', () => {
    expect(
      selfAssessmentSlots([{ questionId: 'a', prompt: 'p', answer: 'x' }], 'teaching'),
    ).toEqual([]);
  });

  it('★목록에 없는 갈래를 버린다 — 서버는 갈래를 못 거르므로 여기가 방어선이다', () => {
    const answers = [
      { questionId: 'a', prompt: 'p', slot: '질문', answer: 'x' },
      { questionId: 'b', prompt: 'p', slot: '위조된갈래', answer: 'y' },
    ];
    expect(selfAssessmentSlots(answers, 'teaching')).toEqual(['질문']);
    // 담임 맥락에서는 교과 갈래('질문')도 안 남는다.
    expect(selfAssessmentSlots(answers, 'homeroom')).toEqual([]);
  });

  it('교사가 추가한 갈래는 남긴다', () => {
    expect(
      selfAssessmentSlots(
        [{ questionId: 'a', prompt: 'p', slot: '내갈래', answer: 'y' }],
        'teaching',
        ['내갈래'],
      ),
    ).toEqual(['내갈래']);
  });
});

describe('clipText — 자르는 자리가 이모지 한복판이어도 반쪽 글자를 남기지 않는다', () => {
  it('코드 포인트 기준으로 자른다', () => {
    expect(clipText('🙂🙂🙂', 2)).toBe('🙂🙂');
    // String.slice(0,2) 였다면 반쪽 글자 하나가 남는다.
    expect('🙂🙂🙂'.slice(0, 2)).toBe('🙂');
    expect(Array.from(clipText('🙂🙂🙂', 2))).toHaveLength(2);
  });

  it('문항도 같은 규칙으로 잘린다', () => {
    const long = '🙂'.repeat(300);
    const out = normalizeSelfAssessmentQuestions([q('a', long)], 'teaching');
    expect(selfAssessmentTextLength(out[0]!.prompt)).toBe(200);
    // 반쪽 글자(lone surrogate)가 없어야 Postgres jsonb 저장이 실패하지 않는다.
    expect(out[0]!.prompt).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });
});

describe('isSelfAssessmentEmpty', () => {
  it('없거나 전부 공백이면 비었다', () => {
    expect(isSelfAssessmentEmpty(undefined)).toBe(true);
    expect(isSelfAssessmentEmpty([])).toBe(true);
    expect(isSelfAssessmentEmpty([{ questionId: 'a', prompt: 'p', answer: '  ' }])).toBe(true);
    expect(isSelfAssessmentEmpty([{ questionId: 'a', prompt: 'p', answer: '답' }])).toBe(false);
  });
});

describe('서버 JSONB 파싱', () => {
  it('배열이 아니면 빈 배열', () => {
    expect(parseSelfAssessmentQuestions(null)).toEqual([]);
    expect(parseSelfAssessmentQuestions('문자열')).toEqual([]);
    expect(parseSelfAssessmentAnswers({ a: 1 })).toEqual([]);
  });

  it('모양이 안 맞는 항목만 버린다', () => {
    expect(
      parseSelfAssessmentQuestions([{ id: 'a', prompt: 'p' }, { id: 1, prompt: 'p' }, null]),
    ).toEqual([{ id: 'a', prompt: 'p' }]);
  });

  it('prompt 없는 답변은 버린다 — 문항 원문 보존이 계약이다', () => {
    expect(parseSelfAssessmentAnswers([{ questionId: 'a', answer: 'x' }])).toEqual([]);
    expect(parseSelfAssessmentAnswers([{ questionId: 'a', prompt: 'p', answer: 'x' }])).toEqual([
      { questionId: 'a', prompt: 'p', answer: 'x' },
    ]);
  });
});
