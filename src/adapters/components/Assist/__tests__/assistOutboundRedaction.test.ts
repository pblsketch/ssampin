/**
 * 쌤핀 AI — **나가는 모든 왕복**에 이름이 없는지 (그물 ③ 배선, 행동 검사)
 *
 * ★이 파일이 생긴 이유 (2026-08-23, 옆 세션 지적)
 *
 * 회귀 #57(grep)은 `redactOutbound(` 와 `toolResults: effectiveOutbound.map(` 이
 * 가까이 있는지를 본다. 그런데 그 앵커는 **1왕복째만** 잡는다. 2·3왕복째는
 * `secondOutbound.map(` 이라 **어느 그물에도 안 걸려 있었다** — 지금 새는 건 아니지만,
 * 나중에 누가 거기에 `executed`(가리기 전)를 그대로 넘겨도 전부 초록불로 통과한다.
 *
 * grep 은 "가까이 있는가"를 볼 뿐 "무엇이 나갔는가"는 못 본다. 그래서 여기서는
 * **가짜 포트로 실제 페이로드를 받아** 왕복마다 이름이 들어 있는지 직접 본다.
 * 왕복이 몇 번으로 늘어나든 이 검사는 자동으로 따라간다.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { useAssistStore } from '@adapters/stores/useAssistStore';
import type { AssistCard } from '@adapters/stores/useAssistStore';
import type { AssistAnswer, AssistPort, AssistRequestPayload } from '@domain/ports/AssistPort';
import { rosterFrom } from '@domain/rules/redactOutbound';
import { findAssistTool } from '@domain/services/assistToolRegistry';
import { sanitizeToolResult } from '@domain/services/sanitizeToolResult';
import type { ToolResultShape } from '@domain/services/sanitizeToolResult';

/** 실제 명렬표가 있는 학급이라고 치자. 이 이름이 한 번이라도 나가면 실패다. */
const PLANTED = '김지훈';
const ROSTER = rosterFrom([{ name: PLANTED, studentNumber: 15 }, { name: '박서연' }]);

/** 이름이 박힌 카드를 **실제 경로 그대로**(레지스트리 → 재구성) 만든다. */
function cardWithName(): AssistCard {
  const tool = findAssistTool('get_my_todos');
  if (!tool) throw new Error('도구 없음');
  return {
    tool: tool.id,
    data: sanitizeToolResult(tool, {
      items: [{ title: `${PLANTED} 학부모 면담`, due: '2026-08-26', done: false }],
      undone: 1,
    } as ToolResultShape),
  };
}

/** 모든 왕복의 페이로드를 모아 두는 가짜 포트 */
function recordingPort(answers: readonly AssistAnswer[]): {
  port: AssistPort;
  payloads: AssistRequestPayload[];
} {
  const payloads: AssistRequestPayload[] = [];
  let hop = 0;
  const port: AssistPort = {
    ask: (payload): Promise<AssistAnswer> => {
      payloads.push(payload);
      const answer = answers[hop] ?? { text: '끝', degraded: null };
      hop += 1;
      return Promise.resolve(answer);
    },
  };
  return { port, payloads };
}

/** 한 왕복에서 실제로 밖으로 나간 글자 전부 */
function outboundText(payload: AssistRequestPayload): string {
  return JSON.stringify({ turns: payload.turns, toolResults: payload.toolResults });
}

beforeEach(() => {
  useAssistStore.setState({ enabled: true, turns: [], draft: '' });
});

describe('★어느 왕복에도 학생 이름이 실리지 않는다', () => {
  it('1왕복 — 정규식 카드 경로', async () => {
    const { port, payloads } = recordingPort([{ text: '답', degraded: null }]);

    await useAssistStore.getState().ask(port, '오늘 할 일', [cardWithName()], ROSTER);

    expect(payloads).toHaveLength(1);
    expect(outboundText(payloads[0]!)).not.toContain(PLANTED);
    // 가렸다는 사실이 화면에도 남는다.
    expect(useAssistStore.getState().turns[0]?.maskedCount).toBeGreaterThan(0);
  });

  it('★2왕복 — 모델이 고른 도구를 실행한 결과 (여기가 그물 밖이었다)', async () => {
    const { port, payloads } = recordingPort([
      { text: '', degraded: null, toolCalls: [{ name: 'get_my_todos', rawArguments: '{}' }] },
      { text: '답', degraded: null },
    ]);

    await useAssistStore.getState().ask(port, '할 일 뭐 있어', [], ROSTER, () => cardWithName());

    expect(payloads.length).toBeGreaterThanOrEqual(2);
    for (const [index, payload] of payloads.entries()) {
      expect(outboundText(payload), `${index + 1}왕복에 이름이 나갔다`).not.toContain(PLANTED);
    }
    // 실행 결과가 실제로 실려 나갔는지도 확인한다 — 빈 것을 검사하면 아무것도 증명 못 한다.
    expect(payloads[1]?.toolResults.length).toBeGreaterThan(0);
  });

  it('★3왕복 — 문장이 비어 도구 없이 한 번 더 물을 때', async () => {
    const { port, payloads } = recordingPort([
      { text: '', degraded: null, toolCalls: [{ name: 'get_my_todos', rawArguments: '{}' }] },
      // 문장 없이 또 도구를 부른다 → 앱이 도구 없이 한 번 더 묻는다
      { text: '', degraded: null, toolCalls: [{ name: 'get_meals', rawArguments: '{}' }] },
      { text: '답', degraded: null },
    ]);

    await useAssistStore.getState().ask(port, '할 일 뭐 있어', [], ROSTER, () => cardWithName());

    expect(payloads).toHaveLength(3);
    for (const [index, payload] of payloads.entries()) {
      expect(outboundText(payload), `${index + 1}왕복에 이름이 나갔다`).not.toContain(PLANTED);
    }
    // 마지막 왕복은 도구를 싣지 않는다(왕복 상한 3).
    expect(payloads[2]?.tools ?? []).toHaveLength(0);
  });

  it('★후속 질문에 직전 카드를 다시 실을 때도 가려진 쪽만 간다', async () => {
    const first = recordingPort([{ text: '답', degraded: null }]);
    await useAssistStore.getState().ask(first.port, '오늘 할 일', [cardWithName()], ROSTER);

    // 카드가 안 생기는 질문 → 직전 턴의 outboundCards 를 재전송하는 경로
    const second = recordingPort([{ text: '답2', degraded: null }]);
    await useAssistStore.getState().ask(second.port, '그게 뭔데', [], ROSTER);

    expect(second.payloads[0]?.toolResults.length).toBeGreaterThan(0);
    expect(outboundText(second.payloads[0]!)).not.toContain(PLANTED);
  });

  it('★화면에는 실제 이름이 그대로 남는다 — "이름은 화면에 남고, 숫자만 밖으로 나간다"', async () => {
    const { port } = recordingPort([{ text: '답', degraded: null }]);
    await useAssistStore.getState().ask(port, '오늘 할 일', [cardWithName()], ROSTER);

    const turn = useAssistStore.getState().turns[0];
    expect(JSON.stringify(turn?.cards)).toContain(PLANTED);
  });
});
