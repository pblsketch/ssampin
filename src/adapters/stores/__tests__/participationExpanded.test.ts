// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { useMultiSurveyV2Store } from '../useMultiSurveyV2Store';
import { createParticipationQuestion } from '../../multiSurvey/questionCatalog';
import { buildResponseFromLiveAnswer } from '../../multiSurvey/live/liveBridge';
import { buildPersonalResults } from '@domain/rules/participationRules';

beforeEach(() => {
  localStorage.clear();
  useMultiSurveyV2Store.setState({
    sessions: [],
    participationResults: [],
    liveSession: null,
    questionOpenedAt: {},
  });
});

describe('통합 활동의 저장과 혼합 문항', () => {
  it('의견 응답은 오답으로 세지 않고 저장 결과는 원본 편집·삭제와 분리된다', async () => {
    const store = useMultiSurveyV2Store.getState();
    const survey = store.createSession({ title: '원래 제목', purpose: 'activity' });
    const quiz = createParticipationQuestion('ox', '정답 질문', 'quiz');
    const opinion = createParticipationQuestion('text', '의견 질문', 'opinion');
    store.updateSession(survey.id, { questions: [quiz, opinion] });
    store.startLive(survey.id);
    store.appendStudent({
      studentId: 's',
      nickname: '검증용',
      pin4: '',
      avatarKey: '',
      isRealName: false,
    });
    store.nextPhase();
    store.appendResponse(
      buildResponseFromLiveAnswer({
        question: quiz,
        studentId: 's',
        payload: { optionIds: ['O'], attempt: 1 },
      })!,
    );
    store.nextPhase();
    store.nextPhase();
    store.appendResponse(
      buildResponseFromLiveAnswer({
        question: opinion,
        studentId: 's',
        payload: { text: '내 의견', attempt: 1 },
      })!,
    );
    store.nextPhase();
    store.saveParticipationResult();
    const current = useMultiSurveyV2Store.getState();
    const personal = buildPersonalResults(current.liveSession!, current.sessions[0]!)[0]!;
    expect(personal.completedCount).toBe(1);
    expect(personal.correctCount).toBe(1);
    expect(personal.score).toBe(10);
    expect(current.liveSession!.responses[1]?.isCorrect).toBeUndefined();
    store.updateSession(survey.id, { title: '바뀐 제목', questions: [] });
    store.deleteSession(survey.id);
    await useMultiSurveyV2Store.persist.rehydrate();
    const saved = useMultiSurveyV2Store.getState().participationResults[0]!;
    expect(saved.survey.title).toBe('원래 제목');
    expect(saved.survey.questions).toHaveLength(2);
    expect(saved.live.responses).toHaveLength(2);
  });
  it('재응답 시 이전 투표를 회차 이력에 보존하고 현재 표를 비운다', () => {
    const store = useMultiSurveyV2Store.getState();
    const survey = store.createSession({ title: '아이디어', purpose: 'activity' });
    store.updateSession(survey.id, {
      questions: [createParticipationQuestion('brainstorm', '질문', 'b')],
    });
    store.startLive(survey.id);
    store.nextPhase();
    store.nextPhase();
    const live = useMultiSurveyV2Store.getState().liveSession!;
    const votes = [{ id: 'idea-0', text: '첫 생각', count: 1 }];
    useMultiSurveyV2Store.setState({ liveSession: { ...live, votesByQuestion: { b: votes } } });
    store.reopenDiscussion();
    const next = useMultiSurveyV2Store.getState().liveSession!;
    expect(next.votesByQuestion?.b).toEqual([]);
    expect(next.voteHistory?.[0]?.votes).toEqual(votes);
    expect(next.attempt).toBe(2);
  });
});
