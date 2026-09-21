import { describe, expect, it } from 'vitest';
import {
  advancedCorrect,
  parseAdvancedAnswer,
  validateAdvancedQuestion,
} from './advancedQuestionRules';
import type {
  AdvancedQuestion,
  AdvancedQuestionType,
} from '../entities/multiSurvey/AdvancedQuestion';
import { mapQuestionsForLiveHTML } from '../../adapters/multiSurvey/live/liveBridge';
import { buildPersonalResults, participationStandings } from './participationRules';
import { useMultiSurveyV2Store } from '../../adapters/stores/useMultiSurveyV2Store';
import { validateSession } from './multiSurveyRules';
import type { OXQuestion } from '../entities/multiSurvey/Question';

function advanced(type: AdvancedQuestionType): AdvancedQuestion {
  return {
    id: 'q',
    type,
    text: '질문',
    timerSeconds: 30,
    score: 10,
    settings: {
      items: [
        { id: 'x1', text: '첫 항목' },
        { id: 'x2', text: '둘째 항목' },
      ],
      min: 0,
      max: 10,
      step: 1,
      total: 100,
      unit: '개',
      xLabel: '중요도',
      yLabel: '가능성',
      imageUrl: 'https://example.com/image.png',
      maxIdeas: 3,
    },
  };
}
const ox: OXQuestion = {
  id: 'q',
  type: 'ox',
  text: '문제',
  timerSeconds: 30,
  score: 10,
  correctAnswer: 'O',
  explanation: '해설',
};
const store = useMultiSurveyV2Store;
function setup() {
  store.setState({
    sessions: [],
    participationResults: [],
    liveSession: null,
    questionOpenedAt: {},
  });
  const survey = store.getState().createSession({ title: '활동', purpose: 'activity' });
  store.getState().updateSession(survey.id, { questions: [ox], competitionMode: true });
  store.getState().startLive(survey.id);
  for (const studentId of ['가', '나', '다'])
    store
      .getState()
      .appendStudent({
        studentId,
        nickname: studentId,
        pin4: '',
        avatarKey: '',
        isRealName: false,
      });
  store.getState().nextPhase();
  return survey.id;
}

describe('참여교실 새 문항 입력 계약', () => {
  it.each(['order', 'ranking'] as const)('%s는 중복·미등록·누락 항목을 거부한다', (type) => {
    const q = advanced(type);
    expect(parseAdvancedAnswer(q, '["x2","x1"]')).toEqual(['x2', 'x1']);
    for (const input of ['["x1","x1"]', '["x1"]', '["x1","foreign"]'])
      expect(parseAdvancedAnswer(q, input)).toBeNull();
  });
  it('숫자 범위와 허용 오차를 검증하며 정답 없는 문항을 채점하지 않는다', () => {
    const q = advanced('numeric');
    expect(parseAdvancedAnswer(q, '11')).toBeNull();
    expect(parseAdvancedAnswer(q, '"3"')).toBeNull();
    expect(parseAdvancedAnswer(q, '1e999')).toBeNull();
    expect(advancedCorrect(q, '3')).toBeUndefined();
    expect(advancedCorrect({ ...q, solution: { number: 5, tolerance: 1 } }, '6')).toBe(true);
    expect(advancedCorrect({ ...q, solution: { number: 5, tolerance: 1 } }, '7')).toBe(false);
  });
  it('배분은 정수·합계, 여러 척도와 2축은 항목별 범위를 검사한다', () => {
    expect(parseAdvancedAnswer(advanced('allocation'), '{"x1":30,"x2":70}')).toEqual({
      x1: 30,
      x2: 70,
    });
    for (const answer of ['{"x1":-1,"x2":101}', '{"x1":30,"x2":60}', '{"x1":30.5,"x2":69.5}'])
      expect(parseAdvancedAnswer(advanced('allocation'), answer)).toBeNull();
    expect(parseAdvancedAnswer(advanced('rating'), '{"x1":2,"x2":11}')).toBeNull();
    expect(
      parseAdvancedAnswer(advanced('matrix'), '{"x1:x":2,"x1:y":3,"x2:x":4,"x2:y":5}'),
    ).not.toBeNull();
    expect(parseAdvancedAnswer(advanced('matrix'), '{"x1:x":2}')).toBeNull();
  });
  it('이미지 좌표와 정답 영역의 경계를 검사한다', () => {
    const q = {
      ...advanced('pin'),
      solution: { region: { x: 0.2, y: 0.2, width: 0.3, height: 0.3 } },
    };
    expect(validateAdvancedQuestion(q)).toEqual([]);
    expect(advancedCorrect(q, '{"x":0.3,"y":0.3}')).toBe(true);
    expect(advancedCorrect(q, '{"x":0.8,"y":0.3}')).toBe(false);
    expect(parseAdvancedAnswer(q, '{"x":-1,"y":0.3}')).toBeNull();
  });
  it('아이디어 길이·개수를 제한하고 공개 문항에서 정답 필드를 제거한다', () => {
    expect(parseAdvancedAnswer(advanced('brainstorm'), '["생각 하나","생각 둘"]')).toEqual([
      '생각 하나',
      '생각 둘',
    ]);
    expect(parseAdvancedAnswer(advanced('brainstorm'), '[" "]')).toBeNull();
    const q = { ...advanced('numeric'), solution: { number: 9, tolerance: 1 } };
    const publicQuestion = mapQuestionsForLiveHTML([q])[0]!;
    expect(publicQuestion.interaction).not.toHaveProperty('solution');
    expect(JSON.stringify(publicQuestion)).not.toContain('tolerance');
  });
});

describe('참여교실 점수와 원본 보존', () => {
  it('공동 순위에 미응답자를 포함하고 공개 전 결과를 누출하지 않는다', () => {
    const id = setup();
    for (const studentId of ['가', '나'])
      store
        .getState()
        .appendResponse({
          id: studentId,
          studentId,
          questionId: 'q',
          answer: 'O',
          isCorrect: true,
          scoreEarned: 10,
          submittedAt: new Date().toISOString(),
          attempt: 1,
        });
    const live = store.getState().liveSession!;
    const survey = store.getState().sessions.find((s) => s.id === id)!;
    expect(participationStandings(live).map((r) => r.rank)).toEqual([1, 1, 3]);
    expect(buildPersonalResults(live, survey)[0]).toMatchObject({ score: 0, correctCount: 0 });
    expect(buildPersonalResults(live, survey)[0]).not.toHaveProperty('answer');
    expect(buildPersonalResults({ ...live, phase: 'revealed' }, survey)[0]).toMatchObject({
      score: 10,
      correctCount: 1,
    });
    expect(
      buildPersonalResults(
        { ...live, phase: 'revealed' },
        { ...survey, competitionMode: false },
      )[0],
    ).not.toHaveProperty('rank');
  });
  it('재응답 전 답과 이유를 남기고 실행 결과는 원본 수정·삭제 후에도 유지한다', () => {
    const id = setup();
    store
      .getState()
      .updateSession(id, {
        questions: [{ id: 'q', type: 'text', text: '논제', score: 0, timerSeconds: 30 }],
      });
    store
      .getState()
      .appendResponse({
        id: 'r1',
        studentId: '가',
        questionId: 'q',
        answer: '첫 생각',
        reason: '첫 근거',
        scoreEarned: 0,
        submittedAt: new Date().toISOString(),
        attempt: 1,
      });
    store.getState().nextPhase();
    store.getState().reopenDiscussion();
    expect(store.getState().liveSession!.responseHistory?.[0]).toMatchObject({
      answer: '첫 생각',
      reason: '첫 근거',
    });
    expect(store.getState().liveSession!.responses).toHaveLength(0);
    store
      .getState()
      .appendResponse({
        id: 'r2',
        studentId: '가',
        questionId: 'q',
        answer: '새 생각',
        reason: '새 근거',
        scoreEarned: 0,
        submittedAt: new Date().toISOString(),
        attempt: 2,
      });
    store.getState().endLive();
    store.getState().exitLive();
    store.getState().updateSession(id, { title: '새 제목', questions: [] });
    store.getState().deleteSession(id);
    const result = store.getState().participationResults[0]!;
    expect(result.survey.title).toBe('활동');
    expect(result.live.responses[0]?.answer).toBe('새 생각');
    expect(result.live.responseHistory?.[0]?.answer).toBe('첫 생각');
  });
  it('공백뿐인 단답·빈칸 정답으로 활동을 시작할 수 없다', () => {
    const id = setup();
    const survey = store.getState().sessions.find((s) => s.id === id)!;
    expect(
      validateSession({
        ...survey,
        questions: [{ ...ox, type: 'short', acceptedAnswers: [' '], caseSensitive: false }],
      }).ok,
    ).toBe(false);
    expect(
      validateSession({
        ...survey,
        questions: [{ ...ox, type: 'blank', acceptedAnswers: [''], isHangulInitial: false }],
      }).ok,
    ).toBe(false);
  });
});
