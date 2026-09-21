import { describe, expect, it } from 'vitest';
import {
  mayShowAnswer,
  mayShowResults,
  participationStage,
  responseTally,
  stageActions,
} from './participationStage';
import type { LiveSession } from '../entities/multiSurvey/LiveSession';
import type { Question } from '../entities/multiSurvey/Question';

const quizQuestion: Question = {
  id: 'q1',
  type: 'multiple',
  text: '무엇이 맞나요?',
  timerSeconds: 60,
  score: 10,
  choices: [
    { id: 'a', text: '가' },
    { id: 'b', text: '나' },
  ],
  correctChoiceIds: ['a'],
};

const opinionQuestion: Question = {
  id: 'q2',
  type: 'text',
  text: '어떻게 생각하나요?',
  timerSeconds: 60,
  score: 0,
  maxLength: 500,
};

function live(patch: Partial<LiveSession> = {}): LiveSession {
  return {
    id: 'live',
    surveyId: 's',
    round: 1,
    phase: 'open',
    currentQuestionIndex: 0,
    students: [],
    responses: [],
    studentInteractions: [],
    focusModeActive: false,
    hiddenWordsByQuestion: {},
    startedAt: '2026-09-21T00:00:00.000Z',
    ...patch,
  };
}

describe('진행 단계', () => {
  it('마감은 공개가 아니다 — 응답만 닫은 상태를 따로 둔다', () => {
    expect(participationStage(live({ phase: 'open' }))).toBe('collecting');
    expect(participationStage(live({ phase: 'revealed' }))).toBe('closed');
    expect(participationStage(live({ phase: 'revealed', resultsPublished: true }))).toBe('results');
    expect(
      participationStage(
        live({ phase: 'revealed', resultsPublished: true, answerPublished: true }),
      ),
    ).toBe('answer');
  });

  it('대기실과 종료는 그대로 구분한다', () => {
    expect(participationStage(live({ phase: 'lobby' }))).toBe('lobby');
    expect(participationStage(live({ phase: 'podium' }))).toBe('finished');
    expect(participationStage(live({ phase: 'end' }))).toBe('finished');
  });

  it('마감만 한 상태에서는 결과도 정답도 보이지 않는다', () => {
    expect(mayShowResults('closed', quizQuestion)).toBe(false);
    expect(mayShowAnswer('closed', quizQuestion)).toBe(false);
  });

  it('정답이 없는 의견 문항은 받는 중에도 모인 생각을 보여 준다', () => {
    expect(mayShowResults('collecting', opinionQuestion)).toBe(true);
    expect(mayShowResults('collecting', quizQuestion)).toBe(false);
  });

  it('정답이 없는 문항에는 정답 공개가 없다', () => {
    expect(mayShowAnswer('answer', opinionQuestion)).toBe(false);
    expect(stageActions('closed', opinionQuestion).canPublishAnswer).toBe(false);
    expect(stageActions('closed', quizQuestion).canPublishAnswer).toBe(true);
  });

  it('직선 절차로 가두지 않는다 — 마감 뒤에는 공개 없이도 다음으로 갈 수 있다', () => {
    const actions = stageActions('closed', quizQuestion);
    expect(actions.canAdvance).toBe(true);
    expect(actions.canReopen).toBe(true);
    // 결과를 건너뛰고 정답만 공개해도 된다
    expect(actions.canPublishAnswer).toBe(true);
  });

  it('결과를 공개한 뒤에는 결과 공개 단추를 다시 내주지 않는다', () => {
    expect(stageActions('results', quizQuestion).canPublishResults).toBe(false);
    expect(stageActions('collecting', quizQuestion).canPublishResults).toBe(false);
    expect(stageActions('closed', quizQuestion).canPublishResults).toBe(true);
  });
});

describe('응답 현황 수치', () => {
  const session = live({
    students: [
      { studentId: 's1', nickname: '가나', pin4: '', avatarKey: '', isRealName: false },
      { studentId: 's2', nickname: '다라', pin4: '', avatarKey: '', isRealName: false },
      { studentId: 's3', nickname: '마바', pin4: '', avatarKey: '', isRealName: false },
    ],
    responses: [
      {
        id: 'r1',
        studentId: 's1',
        questionId: 'q1',
        answer: ['a'],
        submittedAt: '2026-09-21T00:00:01.000Z',
        scoreEarned: 10,
      },
    ],
  });

  it('입장 인원과 이번 문항 응답 수를 따로 센다', () => {
    const tally = responseTally(session, quizQuestion);
    expect(tally.joined).toBe(3);
    expect(tally.answered).toBe(1);
    expect(tally.pending).toBe(2);
  });

  it('미응답자 명단을 돌려준다 — 교사 화면에만 쓴다', () => {
    expect(responseTally(session, quizQuestion).pendingNames).toEqual(['다라', '마바']);
  });

  it('한 학생이 두 번 세어지지 않는다', () => {
    const twice = live({
      ...session,
      responses: [
        ...session.responses,
        {
          id: 'r1b',
          studentId: 's1',
          questionId: 'q1',
          answer: ['b'],
          submittedAt: '2026-09-21T00:00:02.000Z',
          scoreEarned: 0,
        },
      ],
    });
    expect(responseTally(twice, quizQuestion).answered).toBe(1);
  });
});
