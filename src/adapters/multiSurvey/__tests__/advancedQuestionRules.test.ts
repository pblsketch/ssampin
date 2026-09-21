import { describe, expect, it } from 'vitest';
import {
  ADVANCED_TYPES,
  type AdvancedQuestion,
} from '@domain/entities/multiSurvey/AdvancedQuestion';
import {
  advancedAnswerLabel,
  advancedCorrect,
  parseAdvancedAnswer,
  quadrantIndexOf,
  validateAdvancedQuestion,
  valuelineKeys,
} from '@domain/rules/advancedQuestionRules';
import { mapQuestionsForLiveHTML, buildResponseFromLiveAnswer } from '../live/liveBridge';
import { createParticipationQuestion, questionCatalog } from '../questionCatalog';

function question(type: AdvancedQuestion['type']): AdvancedQuestion {
  const q = createParticipationQuestion(type, '질문', 'test') as AdvancedQuestion;
  return {
    ...q,
    settings: {
      ...q.settings,
      items: [
        { id: 'a', text: '가' },
        { id: 'b', text: '나' },
      ],
    },
  };
}

describe('확장 문항의 실제 입력 계약', () => {
  it('모든 유형이 학생에게 고유 입력 방식으로 전달된다', () => {
    for (const type of ADVANCED_TYPES)
      expect(mapQuestionsForLiveHTML([question(type)])[0]?.interaction?.type).toBe(type);
  });
  it('정답·허용 오차·영역은 학생 payload에 포함되지 않는다', () => {
    const q = { ...question('numeric'), solution: { number: 42, tolerance: 3 } };
    const payload = mapQuestionsForLiveHTML([q])[0];
    expect(JSON.stringify(payload)).not.toMatch(/solution|tolerance|42/);
    expect(payload?.scored).toBe(true);
  });
  it('순서의 누락·중복·알 수 없는 항목을 거부한다', () => {
    const q = question('order');
    for (const value of [['a'], ['a', 'a'], ['a', 'x']])
      expect(parseAdvancedAnswer(q, JSON.stringify(value))).toBeNull();
    expect(parseAdvancedAnswer(q, '["b","a"]')).toEqual(['b', 'a']);
  });
  it('배분 총점과 음수·소수·추가 필드를 검증한다', () => {
    const q = question('allocation');
    for (const value of [
      { a: 40, b: 40 },
      { a: -1, b: 101 },
      { a: 49.5, b: 50.5 },
      { a: 50, b: 50, c: 0 },
    ])
      expect(parseAdvancedAnswer(q, JSON.stringify(value))).toBeNull();
    expect(parseAdvancedAnswer(q, '{"a":40,"b":60}')).toEqual({ a: 40, b: 60 });
  });
  it('좌표와 각 항목별 두 축의 누락·범위를 검증한다', () => {
    expect(parseAdvancedAnswer(question('pin'), '{"x":1.1,"y":0.5}')).toBeNull();
    expect(parseAdvancedAnswer(question('matrix'), '{"a:x":1,"a:y":2,"b:x":3}')).toBeNull();
    expect(
      parseAdvancedAnswer(question('matrix'), '{"a:x":1,"a:y":2,"b:x":3,"b:y":4}'),
    ).not.toBeNull();
  });
  it('빈 아이디어와 제한 개수 초과를 거부한다', () => {
    const q = question('brainstorm');
    expect(parseAdvancedAnswer(q, '[" "]')).toBeNull();
    expect(parseAdvancedAnswer(q, '["a","b","c","d"]')).toBeNull();
    expect(parseAdvancedAnswer(q, '["생각 하나"]')).toEqual(['생각 하나']);
  });
  it('숫자 허용 오차를 적용하며 의견은 오답·점수로 바꾸지 않는다', () => {
    const q = { ...question('numeric'), score: 10, solution: { number: 42, tolerance: 2 } };
    expect(advancedCorrect(q, '44')).toBe(true);
    expect(advancedCorrect(q, '45')).toBe(false);
    expect(
      buildResponseFromLiveAnswer({ question: q, studentId: 's', payload: { text: '43' } })
        ?.scoreEarned,
    ).toBe(10);
    const opinion = buildResponseFromLiveAnswer({
      question: question('numeric'),
      studentId: 's',
      payload: { text: '43' },
    });
    expect(opinion?.isCorrect).toBeUndefined();
    expect(opinion?.scoreEarned).toBe(0);
  });
  it('잘못된 이미지·정답 순서를 시작 전에 차단한다', () => {
    expect(validateAdvancedQuestion(question('pin'))).not.toEqual([]);
    expect(
      validateAdvancedQuestion({ ...question('order'), solution: { order: ['a', 'a'] } }),
    ).not.toEqual([]);
  });
});

describe('가치수직선 통합 — 척도·여러 항목 척도를 한 유형으로', () => {
  it('목록에는 가치수직선 하나만 남고 합쳐진 유형은 사라진다', () => {
    const types = questionCatalog.map((item) => item.type);
    expect(types).toContain('valueline');
    for (const gone of ['scale', 'matrix', 'rating', 'qna']) expect(types).not.toContain(gone);
  });
  it('기본값은 한 줄·항목 하나이고 양 끝 이름을 갖는다', () => {
    const q = createParticipationQuestion('valueline', '찬성하나요?') as AdvancedQuestion;
    expect(q.type).toBe('valueline');
    expect(q.settings.items).toHaveLength(1);
    expect(q.settings.xMinLabel).toBe('반대');
    expect(validateAdvancedQuestion(q)).toEqual([]);
  });
  it('항목이 여럿이면 이름을 요구하고, 양 끝 이름이 비면 막는다', () => {
    const base = createParticipationQuestion('valueline', '질문', 'v') as AdvancedQuestion;
    const many = {
      ...base,
      settings: {
        ...base.settings,
        items: [
          { id: 'a', text: '가' },
          { id: 'b', text: '' },
        ],
      },
    };
    expect(validateAdvancedQuestion(many)).not.toEqual([]);
    expect(
      validateAdvancedQuestion({ ...base, settings: { ...base.settings, xMaxLabel: ' ' } }),
    ).not.toEqual([]);
  });
  it('항목마다 값 하나만 받는다 — 세로 값을 덧붙이면 막는다', () => {
    const base = createParticipationQuestion('valueline', '질문', 'v') as AdvancedQuestion;
    const one = {
      ...base,
      settings: { ...base.settings, items: [{ id: 'a', text: '가' }] },
    };
    expect(parseAdvancedAnswer(one, '{"a:x":4}')).toEqual({ 'a:x': 4 });
    expect(parseAdvancedAnswer(one, '{"a":4}')).toBeNull();
    expect(parseAdvancedAnswer(one, '{"a:x":4,"a:y":4}')).toBeNull();
    expect(parseAdvancedAnswer(one, '{"a:x":99}')).toBeNull();
  });
  it('학생에게는 슬라이더 설정이 그대로 가고 정답 개념이 없다', () => {
    const q = createParticipationQuestion('valueline', '질문', 'v') as AdvancedQuestion;
    const payload = mapQuestionsForLiveHTML([q])[0];
    expect(payload?.interaction?.type).toBe('valueline');
    expect(payload?.interaction?.settings.xMaxLabel).toBe('찬성');
    expect(payload?.scored).toBe(false);
    expect(payload?.allowVoting).toBe(false);
  });
  it('이름 없는 항목 하나면 값만, 이름이 있으면 이름과 함께 읽어 준다', () => {
    const base = createParticipationQuestion('valueline', '질문', 'v') as AdvancedQuestion;
    const one = { ...base, settings: { ...base.settings, items: [{ id: 'a', text: '' }] } };
    expect(advancedAnswerLabel(one, '{"a:x":6}')).toBe('6');
    const named = { ...one, settings: { ...one.settings, items: [{ id: 'a', text: '가' }] } };
    expect(advancedAnswerLabel(named, '{"a:x":6}')).toBe('가: 6');
  });
});

describe('아이디어 모으기 통합 — 투표를 켜고 끌 수 있다', () => {
  it('새 문항은 투표를 받고, 끄면 학생 화면에 투표가 가지 않는다', () => {
    const q = createParticipationQuestion(
      'brainstorm',
      '무엇이 필요할까요?',
      'b',
    ) as AdvancedQuestion;
    expect(q.settings.allowVoting).toBe(true);
    expect(mapQuestionsForLiveHTML([q])[0]?.allowVoting).toBe(true);
    const noVote = { ...q, settings: { ...q.settings, allowVoting: false } };
    expect(mapQuestionsForLiveHTML([noVote])[0]?.allowVoting).toBe(false);
  });
  it('설정이 없는 옛 자료는 그대로 투표를 받는다', () => {
    const q = createParticipationQuestion('brainstorm', '질문', 'b') as AdvancedQuestion;
    const legacy = { ...q, settings: { ...q.settings, allowVoting: undefined } };
    expect(mapQuestionsForLiveHTML([legacy])[0]?.allowVoting).toBe(true);
  });
  it('옛 질문 받기 문항은 계속 읽히고 투표도 유지된다', () => {
    const qna = createParticipationQuestion('qna', '궁금한 점', 'q');
    expect(qna.type).toBe('qna');
    expect(mapQuestionsForLiveHTML([qna])[0]?.allowVoting).toBe(true);
  });
});

describe('2×2 매트릭스', () => {
  const matrix = (patch: Partial<AdvancedQuestion['settings']> = {}) => {
    const q = createParticipationQuestion('quadrant', '놓아 보세요', 'qd') as AdvancedQuestion;
    return { ...q, settings: { ...q.settings, ...patch } };
  };

  it('목록에 있고 기본값은 점 하나·글 없음이다', () => {
    expect(questionCatalog.map((item) => item.type)).toContain('quadrant');
    const q = matrix();
    expect(q.settings.maxPoints).toBe(1);
    expect(q.settings.collectPointText).toBe(false);
    expect(validateAdvancedQuestion(q)).toEqual([]);
  });

  it('네 끝 이름이 비면 막고, 점 개수는 1~5만 받는다', () => {
    expect(validateAdvancedQuestion(matrix({ yMaxLabel: ' ' }))).not.toEqual([]);
    expect(validateAdvancedQuestion(matrix({ maxPoints: 0 }))).not.toEqual([]);
    expect(validateAdvancedQuestion(matrix({ maxPoints: 6 }))).not.toEqual([]);
    expect(validateAdvancedQuestion(matrix({ quadrantLabels: ['하나', '둘'] }))).not.toEqual([]);
  });

  it('정한 개수보다 많이 놓거나 판 밖으로 나가면 거부한다', () => {
    const q = matrix({ maxPoints: 2 });
    expect(parseAdvancedAnswer(q, '[]')).toBeNull();
    expect(
      parseAdvancedAnswer(q, '[{"x":0.1,"y":0.1},{"x":0.2,"y":0.2},{"x":0.3,"y":0.3}]'),
    ).toBeNull();
    expect(parseAdvancedAnswer(q, '[{"x":1.2,"y":0.5}]')).toBeNull();
    expect(parseAdvancedAnswer(q, '[{"x":0.5}]')).toBeNull();
    expect(parseAdvancedAnswer(q, '[{"x":0.5,"y":0.5,"where":"위"}]')).toBeNull();
    expect(parseAdvancedAnswer(q, '[{"x":0.25,"y":0.75}]')).toEqual([{ x: 0.25, y: 0.75 }]);
  });

  it('글을 받는 문항은 빈 글을 거부하고, 받지 않는 문항은 글이 오면 거부한다', () => {
    const withText = matrix({ collectPointText: true });
    expect(parseAdvancedAnswer(withText, '[{"x":0.5,"y":0.5}]')).toBeNull();
    expect(parseAdvancedAnswer(withText, '[{"x":0.5,"y":0.5,"text":"  "}]')).toBeNull();
    expect(parseAdvancedAnswer(withText, '[{"x":0.5,"y":0.5,"text":" 자리 바꾸기 "}]')).toEqual([
      { x: 0.5, y: 0.5, text: '자리 바꾸기' },
    ]);
    expect(parseAdvancedAnswer(matrix(), '[{"x":0.5,"y":0.5,"text":"몰래"}]')).toBeNull();
  });

  it('왼쪽 위가 (0,0)이다 — 칸 번호는 읽는 순서를 따른다', () => {
    expect(quadrantIndexOf({ x: 0.1, y: 0.1 })).toBe(0);
    expect(quadrantIndexOf({ x: 0.9, y: 0.1 })).toBe(1);
    expect(quadrantIndexOf({ x: 0.1, y: 0.9 })).toBe(2);
    expect(quadrantIndexOf({ x: 0.9, y: 0.9 })).toBe(3);
  });

  it('칸 이름을 적었으면 그 이름으로, 없으면 자리 이름으로 읽어 준다', () => {
    const named = matrix({
      collectPointText: true,
      quadrantLabels: ['계획해서 하기', '지금 바로 하기', '안 해도 되기', '빠르게 처리하기'],
    });
    expect(advancedAnswerLabel(named, '[{"x":0.9,"y":0.1,"text":"청소"}]')).toBe(
      '청소 (지금 바로 하기)',
    );
    expect(advancedAnswerLabel(matrix(), '[{"x":0.1,"y":0.9}]')).toBe('왼쪽 아래');
  });

  it('정답 개념이 없고 학생에게 정답을 보내지 않는다', () => {
    const payload = mapQuestionsForLiveHTML([matrix()])[0];
    expect(payload?.interaction?.type).toBe('quadrant');
    expect(payload?.scored).toBe(false);
    expect(payload?.allowVoting).toBe(false);
    expect(advancedCorrect(matrix(), '[{"x":0.5,"y":0.5}]')).toBeUndefined();
  });

  it('가치수직선은 이제 한 줄만 만든다 — 두 기준은 매트릭스가 맡는다', () => {
    const line = createParticipationQuestion('valueline', '질문', 'v') as AdvancedQuestion;
    expect(line.settings.yMinLabel).toBeUndefined();
    expect(valuelineKeys(line)).toEqual(line.settings.items.map((i) => `${i.id}:x`));
  });
});
