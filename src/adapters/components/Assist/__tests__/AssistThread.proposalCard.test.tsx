/**
 * @vitest-environment jsdom
 *
 * 쌤핀 AI 쓰기 — 미리보기 카드 (브릿지 동등화 Phase 3)
 *
 * ★[실행]을 누르기 전에는 아무것도 바뀌지 않는다. 그러니 이 카드가 **무엇이 저장될지를
 * 다 보여주는가**가 안전 구조의 마지막 한 칸이다. 값을 감추면 버튼은 확인이 아니라
 * 요식이 되고, 잘못된 날짜가 그대로 통과하는 자리가 정확히 거기다.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { AssistThread } from '../AssistThread';
import type { AssistTurn } from '@adapters/stores/useAssistStore';
import type { AssistProposalState } from '@domain/entities/AssistWrite';
import { isWriteProposal } from '@domain/entities/AssistWrite';
import { buildWriteProposal } from '@usecases/assist/writes/buildWriteProposal';
import type { WriteSources } from '@usecases/assist/writes/writeSources';

afterEach(cleanup);

const SRC: WriteSources = {
  today: '2026-08-23',
  periodTimes: [],
  roster: {
    homeroomClassId: '3-2',
    regularPeriodCount: 7,
    homeroom: [],
    teaching: [],
  },
  todos: [{ id: 't1', text: '장보기', completed: false, dueDate: '2026-08-25' }],
  events: [],
  memos: [],
  progress: [],
  classes: [{ id: 'c1', name: '3학년 2반' }],
  bookmarks: [],
  bookmarkGroups: [{ id: 'g1', name: '업무' }],
  notebooks: [],
  noteSections: [],
  notePages: [],
  attendance: [],
  rubrics: [],
};

function turnWith(tool: string, args: object, state: AssistProposalState): AssistTurn {
  const outcome = buildWriteProposal(tool, JSON.stringify(args), SRC);
  if (!isWriteProposal(outcome)) throw new Error(`제안이어야 한다: ${outcome.reason}`);
  return {
    id: 'turn-1',
    question: '해줘',
    cards: [],
    answer: '아래 내용을 확인하고 [실행]을 누르면 저장할게요.',
    outboundAnswer: '',
    outboundCards: [],
    degraded: null,
    status: 'done',
    maskedCount: 0,
    blankedCount: 0,
    proposal: outcome,
    proposalState: state,
  };
}

describe('AssistThread — 쓰기 미리보기 카드', () => {
  it('★파싱된 값이 하나도 빠짐없이 화면에 남는다', () => {
    render(
      <AssistThread
        turns={[
          turnWith(
            'create_progress',
            { className: '3학년 2반', date: '2026-08-25', period: 3, unit: '2단원 함수' },
            'pending',
          ),
        ]}
      />,
    );

    expect(screen.getByText('진도 추가')).toBeTruthy();
    expect(screen.getByText('3학년 2반')).toBeTruthy();
    expect(screen.getByText('2026-08-25')).toBeTruthy();
    expect(screen.getByText('3교시')).toBeTruthy();
    expect(screen.getByText('2단원 함수')).toBeTruthy();
  });

  it('★아직 저장되지 않았음을 화면이 말한다', () => {
    render(<AssistThread turns={[turnWith('create_todo', { text: '결재' }, 'pending')]} />);
    expect(screen.getByText('아직 저장 안 함')).toBeTruthy();
  });

  it('★삭제는 지울 것의 원문을 보여주고, 버튼도 "지우기"라고 말한다', () => {
    render(<AssistThread turns={[turnWith('delete_todo', { match: '장보기' }, 'pending')]} />);

    expect(screen.getByText('지울 할 일')).toBeTruthy();
    expect(screen.getByText('장보기')).toBeTruthy();
    // 색만으로 위험을 알리지 않는다 — 글자로 말한다.
    expect(screen.getByRole('button', { name: '지우기' })).toBeTruthy();
    expect(screen.getByText('누르면 위 내용이 사라져요')).toBeTruthy();
  });

  it('[실행]을 눌러야 바깥으로 알린다 — 화면은 저장하지 않는다', () => {
    const onRun = vi.fn();
    const turn = turnWith('create_todo', { text: '결재 올리기' }, 'pending');
    render(<AssistThread turns={[turn]} onRunProposal={onRun} />);

    expect(onRun).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '실행' }));

    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onRun.mock.calls[0]?.[0]).toBe('turn-1');
    expect(onRun.mock.calls[0]?.[1]).toBe(turn.proposal);
  });

  it('★이미 실행했으면 버튼이 없다 — 두 번 눌러 두 건이 들어가지 않는다', () => {
    const done: AssistTurn = {
      ...turnWith('create_todo', { text: '결재' }, 'done'),
      proposalMessage: '할 일 "결재"을(를) 추가했어요.',
    };
    render(<AssistThread turns={[done]} />);

    expect(screen.queryByRole('button', { name: '실행' })).toBeNull();
    expect(screen.getByText(/추가했어요/)).toBeTruthy();
  });

  it('★소멸한 제안은 버튼이 없고, 왜 없는지 말해 준다', () => {
    render(<AssistThread turns={[turnWith('delete_todo', { match: '장보기' }, 'expired')]} />);

    expect(screen.queryByRole('button', { name: '지우기' })).toBeNull();
    expect(screen.getByText(/이 제안은 취소됐어요/)).toBeTruthy();
  });

  it('실패하면 무엇이 안 됐는지 남는다', () => {
    const failed: AssistTurn = {
      ...turnWith('create_todo', { text: '결재' }, 'failed'),
      proposalMessage: '저장하다가 문제가 생겼어요.',
    };
    render(<AssistThread turns={[failed]} />);
    expect(screen.getByText(/문제가 생겼어요/)).toBeTruthy();
  });
});
