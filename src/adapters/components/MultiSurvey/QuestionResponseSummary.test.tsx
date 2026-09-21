// @vitest-environment jsdom
import { render, cleanup, screen, fireEvent, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { AdvancedQuestion } from '@domain/entities/multiSurvey/AdvancedQuestion';
import { createParticipationQuestion } from '@adapters/multiSurvey/questionCatalog';
import { QuestionResponseSummary } from './QuestionResponseSummary';

afterEach(cleanup);
it('음수에서 0까지인 척도를 유한한 비율로 표시한다', () => {
  const base = createParticipationQuestion('rating', '평가', 'rating') as AdvancedQuestion;
  const question = {
    ...base,
    settings: {
      ...base.settings,
      min: -5,
      max: 0,
      items: [
        { id: 'a', text: '항목' },
        { id: 'b', text: '다른 항목' },
      ],
    },
  };
  const { container } = render(
    <QuestionResponseSummary
      question={question}
      responses={[
        {
          id: 'r',
          studentId: 's',
          questionId: 'rating',
          answer: '{"a":-3,"b":0}',
          submittedAt: '2026-09-21',
          scoreEarned: 0,
        },
      ]}
    />,
  );
  expect(container.innerHTML).toContain('width: 40%');
  expect(container.innerHTML).toContain('width: 100%');
  expect(container.innerHTML).not.toContain('NaN');
});

function response(id: string, answer: string) {
  return {
    id,
    studentId: id,
    questionId: 'vl',
    answer,
    submittedAt: '2026-09-21',
    scoreEarned: 0,
  };
}

it('가치수직선 한 줄은 평균과 응답 수, 양 끝 이름을 보여 준다', () => {
  const base = createParticipationQuestion(
    'valueline',
    '얼마나 동의하나요?',
    'vl',
  ) as AdvancedQuestion;
  const question = {
    ...base,
    settings: { ...base.settings, items: [{ id: 'a', text: '' }] },
  };
  const { container } = render(
    <QuestionResponseSummary
      question={question}
      responses={[response('r1', '{"a:x":2}'), response('r2', '{"a:x":8}')]}
    />,
  );
  // 숫자만 고정폭 글꼴로 감싸 두어 글자가 여러 요소로 쪼개진다 — 합친 글로 확인한다.
  expect(container.textContent).toContain('평균 5.0 · 2명');
  expect(screen.getByText('반대')).toBeTruthy();
  expect(screen.getByText('찬성')).toBeTruthy();
  // 1~10 척도에서 2는 왼쪽에서 약 11%, 8은 약 78% 자리에 찍힌다.
  expect(container.innerHTML).toContain('left: 11.11');
  expect(container.innerHTML).not.toContain('NaN');
});

it('가치수직선은 항목마다 줄을 따로 그리고 이름을 붙인다', () => {
  const base = createParticipationQuestion('valueline', '평가해 보세요', 'vl') as AdvancedQuestion;
  const question = {
    ...base,
    settings: {
      ...base.settings,
      items: [
        { id: 'a', text: '분리수거' },
        { id: 'b', text: '아침 독서' },
      ],
    },
  };
  const { container } = render(
    <QuestionResponseSummary
      question={question}
      responses={[response('r1', '{"a:x":2,"b:x":6}'), response('r2', '{"a:x":4,"b:x":8}')]}
    />,
  );
  expect(screen.getByText('분리수거')).toBeTruthy();
  expect(screen.getByText('아침 독서')).toBeTruthy();
  // 평균은 각각 3.0 · 7.0 이고 두 줄 모두 2명이 답했다.
  expect(container.textContent).toContain('3.0');
  expect(container.textContent).toContain('7.0');
  expect(container.innerHTML).not.toContain('NaN');
});

it('응답이 하나도 없어도 가치수직선이 깨지지 않는다', () => {
  const question = createParticipationQuestion('valueline', '질문', 'vl') as AdvancedQuestion;
  expect(() =>
    render(<QuestionResponseSummary question={question} responses={[]} />),
  ).not.toThrow();
});

it('2×2 매트릭스는 칸마다 몇 개가 모였는지와 점 자리를 함께 보여 준다', () => {
  const base = createParticipationQuestion('quadrant', '놓아 보세요', 'qd') as AdvancedQuestion;
  const question = {
    ...base,
    settings: {
      ...base.settings,
      quadrantLabels: ['계획해서 하기', '지금 바로 하기', '안 해도 되기', '빠르게 처리하기'],
    },
  };
  const { container } = render(
    <QuestionResponseSummary
      question={question}
      responses={[
        // 오른쪽 위 두 개, 왼쪽 아래 하나.
        response('r1', '[{"x":0.8,"y":0.2}]'),
        response('r2', '[{"x":0.9,"y":0.1}]'),
        response('r3', '[{"x":0.2,"y":0.8}]'),
      ]}
    />,
  );
  const cell = (name: string) => screen.getByText(name).parentElement?.textContent ?? '';
  expect(cell('지금 바로 하기')).toContain('2');
  expect(cell('안 해도 되기')).toContain('1');
  expect(cell('계획해서 하기')).toContain('0');
  // 점 세 개가 모두 판 위에 찍힌다.
  expect(container.querySelectorAll('span[style*="left:"]')).toHaveLength(3);
  expect(container.innerHTML).not.toContain('NaN');
});

it('매트릭스에 글을 함께 받으면 칸마다 모아서 읽어 준다', () => {
  const base = createParticipationQuestion('quadrant', '놓아 보세요', 'qd') as AdvancedQuestion;
  const question = {
    ...base,
    settings: { ...base.settings, maxPoints: 2, collectPointText: true },
  };
  render(
    <QuestionResponseSummary
      question={question}
      responses={[
        response('r1', '[{"x":0.8,"y":0.2,"text":"급식 남기지 않기"}]'),
        response('r2', '[{"x":0.9,"y":0.1,"text":"복도에서 뛰지 않기"}]'),
      ]}
    />,
  );
  expect(screen.getByText('급식 남기지 않기')).toBeTruthy();
  expect(screen.getByText('복도에서 뛰지 않기')).toBeTruthy();
  // 칸 이름을 따로 짓지 않았으면 자리 이름으로 묶어 준다.
  expect(screen.getAllByText('오른쪽 위').length).toBeGreaterThan(0);
});

it('응답이 하나도 없어도 매트릭스가 깨지지 않는다', () => {
  const question = createParticipationQuestion('quadrant', '질문', 'qd') as AdvancedQuestion;
  const { container } = render(<QuestionResponseSummary question={question} responses={[]} />);
  expect(container.textContent).toContain('아직 응답이 없어요.');
  expect(container.innerHTML).not.toContain('NaN');
});

it('교사 화면에서는 매트릭스 판을 크게 볼 수 있고, 교실 화면에는 그 단추가 없다', async () => {
  const question = createParticipationQuestion('quadrant', '놓아 보세요', 'qd') as AdvancedQuestion;
  const responses = [response('r1', '[{"x":0.8,"y":0.2}]')];
  const { unmount } = render(<QuestionResponseSummary question={question} responses={responses} />);
  const open = screen.getByRole('button', { name: '크게 보기' });
  fireEvent.click(open);
  const dialog = await screen.findByRole('dialog');
  expect(dialog.textContent).toContain('놓아 보세요');
  fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  unmount();

  // 교실 화면(프로젝터)은 아무도 누르지 않는다 — 단추를 두지 않는다.
  render(<QuestionResponseSummary question={question} responses={responses} size="display" />);
  expect(screen.queryByRole('button', { name: '크게 보기' })).toBeNull();
});

it('크게 보기는 Esc 로도 닫힌다', async () => {
  const question = createParticipationQuestion('quadrant', '놓아 보세요', 'qd') as AdvancedQuestion;
  render(
    <QuestionResponseSummary
      question={question}
      responses={[response('r1', '[{"x":0.8,"y":0.2}]')]}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '크게 보기' }));
  await screen.findByRole('dialog');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
});

/**
 * 교실 화면은 정답을 공개하기 전까지 **정답을 비운 문항**을 받는다(shareSnapshot).
 * 그 값으로도 결과 그림이 그려져야 한다 — 실제로 여기서 화면이 통째로 하얘진 적이 있다.
 */
it('정답을 비운 문항으로도 결과를 그린다', () => {
  const question = {
    id: 'q',
    type: 'multiple' as const,
    text: '무엇이 맞나요?',
    timerSeconds: 60,
    score: 10,
    choices: [
      { id: 'a', text: '가' },
      { id: 'b', text: '나' },
    ],
    // 공개 전에는 빈 배열로 내려온다
    correctChoiceIds: [] as readonly string[],
  };
  render(
    <QuestionResponseSummary
      question={question}
      responses={[
        {
          id: 'r',
          studentId: 's',
          questionId: 'q',
          answer: ['a'],
          submittedAt: '2026-09-21T00:00:00.000Z',
          scoreEarned: 0,
        },
      ]}
    />,
  );
  expect(screen.getByText('가')).toBeTruthy();
  // 정답 표시는 붙지 않는다
  expect(screen.queryByText(/· 정답/)).toBeNull();
});
