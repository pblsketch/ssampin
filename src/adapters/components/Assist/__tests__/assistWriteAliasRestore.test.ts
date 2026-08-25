/**
 * 쌤핀 AI 쓰기 — **모델이 돌려준 별칭을 실제 값으로 되돌리는가** (2026-08-25)
 *
 * ★이 파일이 생긴 이유.
 *
 * 나가는 쪽은 촘촘하다 — 질문도 카드도 이름을 `［이름1］` 로 가려서 내보낸다.
 * 그런데 **돌아오는 쪽**은 한 군데만 이어져 있었다:
 *
 *   - `answer.text` (모델이 한 말)      → `restoreModelText` 로 되돌린다 ✅
 *   - `toolCalls[].rawArguments` (제안) → **되돌리는 자리가 없었다** ❌
 *
 * 그래서 모델이 `match: "［이름1］ 상담"` 이라고 정확히 옳은 답을 보내도, 앱은 이름이
 * `［이름1］` 인 할 일을 찾다가 없다고 답했다. 선생님에게는 "왜 못 알아듣지?"로 보인다.
 *
 * 학생 쓰기 3종을 여는 이번 변경에서는 이게 **치명적**이다. 출결·관찰·채점은 대상을
 * 가리키는 말이 곧 학생이고, 그 말은 **반드시 별칭으로 나갔다가 별칭으로 돌아온다.**
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { useAssistStore } from '@adapters/stores/useAssistStore';
import type { AssistAnswer, AssistPort } from '@domain/ports/AssistPort';
import { rosterFrom } from '@domain/rules/redactOutbound';
import { isWriteProposal } from '@domain/entities/AssistWrite';
import { buildWriteProposal } from '@usecases/assist/writes/buildWriteProposal';
import type { WriteSources } from '@usecases/assist/writes/writeSources';

const PLANTED = '김지훈';
const ROSTER = rosterFrom([{ name: PLANTED, studentNumber: 15 }]);

/** 실제 할 일에는 **진짜 이름**이 들어 있다. 모델은 이 글자를 본 적이 없다. */
const SRC: WriteSources = {
  today: '2026-08-25',
  periodTimes: [],
  roster: {
    homeroomClassId: '3-2',
    regularPeriodCount: 7,
    homeroom: [],
    teaching: [],
  },
  todos: [
    { id: 't1', text: `${PLANTED} 상담`, completed: false },
    { id: 't2', text: '장보기', completed: false },
  ],
  events: [],
  memos: [],
  progress: [],
  classes: [],
  bookmarks: [],
  bookmarkGroups: [],
  notebooks: [],
  noteSections: [],
  notePages: [],
  attendance: [],
  rubrics: [],
};

const proposeWrite = (name: string, rawArguments: string) =>
  buildWriteProposal(name, rawArguments, SRC);

/** 모델이 **별칭 그대로** 대상을 가리켜 온다 — 실제로 이렇게 온다. */
function portReturningAliasMatch(alias: string): AssistPort {
  const answers: AssistAnswer[] = [
    {
      text: '',
      degraded: null,
      toolCalls: [{ name: 'delete_todo', rawArguments: JSON.stringify({ match: alias }) }],
    },
  ];
  let hop = 0;
  return {
    ask: (): Promise<AssistAnswer> => {
      const answer = answers[hop] ?? { text: '끝', degraded: null };
      hop += 1;
      return Promise.resolve(answer);
    },
  };
}

beforeEach(() => {
  useAssistStore.setState({ enabled: true, turns: [], draft: '' });
});

describe('★모델이 별칭으로 대상을 가리켜도 앱이 알아듣는다', () => {
  it('［이름1］ 상담 → 실제 "김지훈 상담" 할 일을 찾아 제안을 만든다', async () => {
    await useAssistStore
      .getState()
      .ask(
        portReturningAliasMatch('［이름1］ 상담'),
        `${PLANTED} 상담 할 일 지워줘`,
        [],
        ROSTER,
        undefined,
        proposeWrite,
      );

    const turn = useAssistStore.getState().turns[0];
    expect(turn?.proposal, '별칭을 못 되돌려 제안이 만들어지지 않았다').toBeDefined();
    expect(turn?.proposalState).toBe('pending');
  });

  it('되돌린 제안이 **진짜 이름**을 담고 있다 — 화면에는 실명이 보여야 한다', async () => {
    await useAssistStore
      .getState()
      .ask(
        portReturningAliasMatch('［이름1］ 상담'),
        `${PLANTED} 상담 할 일 지워줘`,
        [],
        ROSTER,
        undefined,
        proposeWrite,
      );

    const proposal = useAssistStore.getState().turns[0]?.proposal;
    expect(proposal && isWriteProposal(proposal)).toBe(true);
    expect(JSON.stringify(proposal)).toContain(PLANTED);
    expect(JSON.stringify(proposal)).not.toContain('［이름1］');
  });

  it('모델이 괄호를 바꿔 써도 되돌린다 — 〈이름1〉 형태로 오는 일이 실제로 있다', async () => {
    await useAssistStore
      .getState()
      .ask(
        portReturningAliasMatch('〈이름1〉 상담'),
        `${PLANTED} 상담 할 일 지워줘`,
        [],
        ROSTER,
        undefined,
        proposeWrite,
      );

    expect(useAssistStore.getState().turns[0]?.proposal).toBeDefined();
  });

  it('별칭이 없는 평범한 대상은 그대로 동작한다 — 되돌리기가 멀쩡한 말을 건드리지 않는다', async () => {
    await useAssistStore
      .getState()
      .ask(
        portReturningAliasMatch('장보기'),
        `${PLANTED} 얘기 말고 장보기 할 일 지워줘`,
        [],
        ROSTER,
        undefined,
        proposeWrite,
      );

    const proposal = useAssistStore.getState().turns[0]?.proposal;
    expect(proposal).toBeDefined();
    expect(JSON.stringify(proposal)).toContain('장보기');
  });

  it('인자가 깨져 오면 기존 거절 경로가 그대로 돈다 — 되돌리기가 삼키지 않는다', async () => {
    const port: AssistPort = {
      ask: (): Promise<AssistAnswer> =>
        Promise.resolve({
          text: '',
          degraded: null,
          toolCalls: [{ name: 'delete_todo', rawArguments: '{깨진 JSON' }],
        }),
    };

    await useAssistStore
      .getState()
      .ask(port, `${PLANTED} 상담 할 일 지워줘`, [], ROSTER, undefined, proposeWrite);

    const turn = useAssistStore.getState().turns[0];
    expect(turn?.proposal).toBeUndefined();
    // 조용히 아무 일도 없지 않다 — 이유를 말한다.
    expect(turn?.answer.length ?? 0).toBeGreaterThan(0);
  });
});
