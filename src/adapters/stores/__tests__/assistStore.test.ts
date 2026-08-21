/**
 * 쌤핀 AI — 스토어: **꺼짐이 차단선**임을 고정한다
 *
 * 계획서 성공 기준 5: "옵트인 꺼짐 상태에서 `ssampin-assist` 요청이 0건이다."
 * 화면이 안 보이는 것만으로는 부족하다 — 화면을 우회해 불러도 안 나가야 한다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AssistPort, AssistRequestPayload } from '@domain/ports/AssistPort';
import { AssistBlockedError } from '@domain/ports/AssistPort';
import type { ModelSafe } from '@domain/entities/AssistTool';
import type { ToolResultShape } from '@domain/services/sanitizeToolResult';
import { findAssistTool } from '@domain/services/assistToolRegistry';
import { sanitizeToolResult } from '@domain/services/sanitizeToolResult';
import { useAssistStore } from '@adapters/stores/useAssistStore';

/** 실제 경로 그대로 만든다 — 재구성을 거쳐야만 `ModelSafe` 가 된다. */
function safeCard(): { tool: string; data: ModelSafe<ToolResultShape> } {
  const tool = findAssistTool('count_students');
  if (!tool) throw new Error('도구 없음');
  return { tool: tool.id, data: sanitizeToolResult(tool, { className: '3학년 2반', count: 30 }) };
}

function fakePort(): AssistPort & { calls: AssistRequestPayload[] } {
  const calls: AssistRequestPayload[] = [];
  return {
    calls,
    ask: vi.fn(async (payload: AssistRequestPayload) => {
      calls.push(payload);
      return { text: '3학년 2반은 30명입니다.', degraded: null };
    }),
  };
}

beforeEach(() => {
  useAssistStore.setState({
    enabled: false,
    acknowledgedNoticeVersion: 0,
    open: false,
    turns: [],
    draft: '',
  });
});

describe('꺼짐이 차단선이다', () => {
  it('★꺼져 있으면 요청이 나가지 않는다 (성공 기준 5)', async () => {
    const port = fakePort();
    await useAssistStore.getState().ask(port, '오늘 출결 어때요?', [safeCard()]);

    expect(port.calls).toHaveLength(0);
    expect(useAssistStore.getState().turns).toHaveLength(0);
  });

  it('꺼져 있으면 패널을 열 수 없다', () => {
    useAssistStore.getState().setOpen(true);
    expect(useAssistStore.getState().open).toBe(false);
  });

  it('끄면 열려 있던 패널도 닫힌다', () => {
    useAssistStore.getState().setEnabled(true);
    useAssistStore.getState().setOpen(true);
    expect(useAssistStore.getState().open).toBe(true);

    useAssistStore.getState().setEnabled(false);
    expect(useAssistStore.getState().open).toBe(false);
  });
});

describe('고지문 — 켤 때 한 번', () => {
  it('아직 확인 안 했으면 안내가 필요하다', () => {
    expect(useAssistStore.getState().needsNotice()).toBe(true);
  });

  it('확인하면 다시 묻지 않는다', () => {
    useAssistStore.getState().acknowledgeNotice();
    expect(useAssistStore.getState().needsNotice()).toBe(false);
  });

  it('★고지문 버전을 올리면 다시 묻는다', () => {
    useAssistStore.getState().acknowledgeNotice();
    // 버전이 올랐다고 가정 — 문구가 바뀌면 다시 안내해야 한다.
    useAssistStore.setState({ acknowledgedNoticeVersion: 0 });
    expect(useAssistStore.getState().needsNotice()).toBe(true);
  });
});

describe('켜져 있을 때 — 숫자 카드가 먼저 남는다', () => {
  beforeEach(() => {
    useAssistStore.setState({ enabled: true });
  });

  it('질문하면 카드가 먼저 들어가고 답이 채워진다', async () => {
    const port = fakePort();
    await useAssistStore.getState().ask(port, '우리 반 몇 명?', [safeCard()]);

    const [turn] = useAssistStore.getState().turns;
    expect(turn?.cards).toHaveLength(1);
    expect(turn?.answer).toContain('30명');
    expect(turn?.status).toBe('done');
    expect(port.calls).toHaveLength(1);
  });

  it('★AI 가 실패해도 숫자 카드는 남는다 (P5)', async () => {
    const port: AssistPort = { ask: vi.fn(async () => Promise.reject(new Error('끊김'))) };
    await useAssistStore.getState().ask(port, '우리 반 몇 명?', [safeCard()]);

    const [turn] = useAssistStore.getState().turns;
    expect(turn?.cards, '카드가 사라졌다').toHaveLength(1);
    expect(turn?.degraded).toBe('upstream');
  });

  it('서버가 막으면 그 사유를 화면에 남긴다', async () => {
    const port: AssistPort = {
      ask: vi.fn(async () =>
        Promise.reject(new AssistBlockedError('보낼 수 없는 내용이 있습니다')),
      ),
    };
    await useAssistStore.getState().ask(port, '질문', [safeCard()]);

    const [turn] = useAssistStore.getState().turns;
    expect(turn?.status).toBe('blocked');
    expect(turn?.blockedMessage).toContain('보낼 수 없는');
    expect(turn?.cards).toHaveLength(1);
  });

  it('★대화 이력을 모델에 다시 보내지 않는다 (§8.2)', async () => {
    const port = fakePort();
    await useAssistStore.getState().ask(port, '첫 질문', [safeCard()]);
    await useAssistStore.getState().ask(port, '두 번째 질문', [safeCard()]);

    // 두 번째 호출에도 턴이 1개뿐 - 앞 대화를 다시 싣지 않는다.
    expect(port.calls[1]?.turns).toHaveLength(1);
    expect(port.calls[1]?.turns[0]?.content).toBe('두 번째 질문');
  });
});

describe('입력 판정은 막지 않는다', () => {
  it('민감 표현이 있어도 판정만 돌려준다', () => {
    useAssistStore.getState().setDraft('아버지 실직 얘기를 꺼냈는데');
    const screening = useAssistStore.getState().screenDraft();

    expect(screening.severity).toBe('caution');
    expect('blocked' in screening).toBe(false);
  });

  it('정상 질문은 아무것도 걸리지 않는다', () => {
    useAssistStore.getState().setDraft('오늘 3학년 2반 출결 어때요?');
    expect(useAssistStore.getState().screenDraft().severity).toBeNull();
  });
});
