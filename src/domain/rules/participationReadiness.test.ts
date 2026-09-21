import { describe, expect, it } from 'vitest';
import { participationReadiness } from './participationReadiness';
import type { MultiSurveyV2 } from '../entities/multiSurvey/MultiSurveyV2';
import type { Question } from '../entities/multiSurvey/Question';

function survey(questions: readonly Question[], title = '활동'): MultiSurveyV2 {
  return {
    id: 's1',
    formatVersion: 2,
    purpose: 'activity',
    title,
    createdAt: '2026-09-21T00:00:00.000Z',
    updatedAt: '2026-09-21T00:00:00.000Z',
    questions,
    presentationOpts: { showCumulativeScore: true, revealExplanation: true, allowReentry: true },
    responseOpts: {
      explicitSubmitButton: false,
      autoAdvance: false,
      fastSolveBonus: false,
      streakBonus: false,
      randomBonus: false,
    },
    displayOpts: { teacherFocusMode: false, showPerQuestionScore: false },
  };
}

const base = { timerSeconds: 60, score: 10 } as const;

describe('실행할 수 없는 이유', () => {
  it('보기가 비면 몇 번 문항의 몇 번째 보기인지 말한다', () => {
    const issues = participationReadiness(
      survey([
        {
          ...base,
          id: 'q1',
          type: 'multiple',
          text: '첫 문항',
          choices: [
            { id: 'a', text: '가' },
            { id: 'b', text: '' },
            { id: 'c', text: '다' },
          ],
          correctChoiceIds: ['a'],
        },
        {
          ...base,
          id: 'q2',
          type: 'multiple',
          text: '둘째 문항',
          choices: [
            { id: 'a', text: '가' },
            { id: 'b', text: '나' },
            { id: 'c', text: '  ' },
          ],
          correctChoiceIds: ['a'],
        },
      ]),
    );
    expect(issues.map((i) => i.message)).toContain('1번 문항의 두 번째 보기를 입력해 주세요.');
    expect(issues.map((i) => i.message)).toContain('2번 문항의 세 번째 보기를 입력해 주세요.');
  });

  it('고칠 자리를 함께 돌려준다 — 화면이 그 입력칸으로 데려갈 수 있게', () => {
    const issues = participationReadiness(
      survey([
        {
          ...base,
          id: 'q1',
          type: 'multiple',
          text: '',
          choices: [
            { id: 'a', text: '가' },
            { id: 'b', text: '나' },
          ],
          correctChoiceIds: ['a'],
        },
      ]),
    );
    const textIssue = issues.find((i) => i.message.includes('질문을 입력'));
    expect(textIssue?.questionIndex).toBe(0);
    expect(textIssue?.focus).toBe('질문 또는 논제');
  });

  it('정답을 고르지 않은 객관식 퀴즈를 잡는다', () => {
    const issues = participationReadiness(
      survey([
        {
          ...base,
          id: 'q1',
          type: 'multiple',
          text: '질문',
          choices: [
            { id: 'a', text: '가' },
            { id: 'b', text: '나' },
          ],
          correctChoiceIds: [],
        },
      ]),
    );
    expect(issues.map((i) => i.message)).toContain('1번 문항의 정답을 골라 주세요.');
  });

  it('제목과 문항이 갖춰지면 빈 목록을 돌려준다', () => {
    const issues = participationReadiness(
      survey([
        {
          ...base,
          id: 'q1',
          type: 'text',
          score: 0,
          text: '어떻게 생각하나요?',
          maxLength: 500,
        },
      ]),
    );
    expect(issues).toEqual([]);
  });

  it('문항이 하나도 없으면 그것만 말한다', () => {
    expect(participationReadiness(survey([])).map((i) => i.message)).toEqual([
      '문항을 하나 이상 추가해 주세요.',
    ]);
  });

  it('제목이 비면 활동 전체 문제로 잡는다', () => {
    const issues = participationReadiness(
      survey([{ ...base, id: 'q1', type: 'text', score: 0, text: '질문', maxLength: 500 }], '  '),
    );
    expect(issues[0]).toMatchObject({ questionIndex: null, focus: '활동 제목' });
  });

  it('가치수직선 한 줄짜리는 항목 이름이 비어도 괜찮다', () => {
    const issues = participationReadiness(
      survey([
        {
          ...base,
          id: 'q1',
          type: 'valueline',
          score: 0,
          text: '얼마나 동의하나요?',
          settings: {
            items: [{ id: 'i1', text: '' }],
            min: 1,
            max: 10,
            step: 1,
            total: 100,
            unit: '',
            xLabel: '',
            yLabel: '',
            imageUrl: '',
            maxIdeas: 3,
            xMinLabel: '반대',
            xMaxLabel: '찬성',
          },
        },
      ]),
    );
    expect(issues).toEqual([]);
  });
});
