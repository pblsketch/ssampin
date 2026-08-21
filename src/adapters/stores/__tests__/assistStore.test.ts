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
import { useAssistStore, uuidFallback } from '@adapters/stores/useAssistStore';

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
    await useAssistStore.getState().ask(port, '오늘 출결 어때요?', [safeCard()], []);

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
    await useAssistStore.getState().ask(port, '우리 반 몇 명?', [safeCard()], []);

    const [turn] = useAssistStore.getState().turns;
    expect(turn?.cards).toHaveLength(1);
    expect(turn?.answer).toContain('30명');
    expect(turn?.status).toBe('done');
    expect(port.calls).toHaveLength(1);
  });

  it('★AI 가 실패해도 숫자 카드는 남는다 (P5)', async () => {
    const port: AssistPort = { ask: vi.fn(async () => Promise.reject(new Error('끊김'))) };
    await useAssistStore.getState().ask(port, '우리 반 몇 명?', [safeCard()], []);

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
    await useAssistStore.getState().ask(port, '질문', [safeCard()], []);

    const [turn] = useAssistStore.getState().turns;
    expect(turn?.status).toBe('blocked');
    expect(turn?.blockedMessage).toContain('보낼 수 없는');
    expect(turn?.cards).toHaveLength(1);
  });

  it('★대화 이력을 모델에 다시 보내지 않는다 (§8.2)', async () => {
    const port = fakePort();
    await useAssistStore.getState().ask(port, '첫 질문', [safeCard()], []);
    await useAssistStore.getState().ask(port, '두 번째 질문', [safeCard()], []);

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

/**
 * ★이음매 테스트 — 그물 ③ 이 **실제 경로에 배선돼 있는가**
 *
 * QA 에서 이게 없어서 결함이 살아남았다. `assertNoPii` 는 초록불이었는데
 * **부르는 곳이 0건**이었고, 개인정보처리방침과 화면은 "이름은 지워집니다"라고
 * 약속하고 있었다. 층이 아니라 **층 사이**를 지키는 테스트가 이것이다.
 */
describe('★그물 ③ — 이름이 포트까지 못 간다', () => {
  const ROSTER = [{ label: '이름', values: ['김지훈', '박서연'] }] as const;

  /** 실제 경로 그대로 — 선생님이 할 일 제목에 학생 이름을 적은 상황 */
  function todoCard(titles: readonly string[]): { tool: string; data: ModelSafe<ToolResultShape> } {
    const tool = findAssistTool('get_my_todos');
    if (!tool) throw new Error('도구 없음');
    return {
      tool: tool.id,
      data: sanitizeToolResult(tool, {
        total: titles.length,
        items: titles.map((title) => ({ title, due: '2026-08-25', done: false })),
      }),
    };
  }

  beforeEach(() => {
    useAssistStore.setState({ enabled: true });
  });

  it('할 일 제목에 든 학생 이름이 포트로 나가지 않는다', async () => {
    const port = fakePort();
    await useAssistStore
      .getState()
      .ask(port, '이번 주 할 일', [todoCard(['김지훈 학부모 면담', '수행평가 채점'])], ROSTER);

    const sent = JSON.stringify(port.calls[0]?.toolResults);
    expect(sent, '학생 이름이 그대로 나갔다').not.toContain('김지훈');
    // ★이름 자리는 별칭으로 남는다 — 지워버리면 AI 가 '면담이 있다'는 말조차 못 한다.
    expect(sent).toContain('학부모 면담');
    expect(sent).toContain('수행평가 채점');
  });

  it('연락처가 든 제목은 통째로 비운다 (가리지 않는다)', async () => {
    const port = fakePort();
    await useAssistStore
      .getState()
      .ask(port, '할 일', [todoCard(['학부모 010-1234-5678 연락'])], ROSTER);

    expect(JSON.stringify(port.calls[0]?.toolResults)).not.toContain('1234-5678');
  });

  it('★화면 카드는 원본 그대로 남는다 — "이름은 화면에 남고, 숫자만 밖으로 나간다"', async () => {
    const port = fakePort();
    await useAssistStore.getState().ask(port, '할 일', [todoCard(['김지훈 상담'])], ROSTER);

    const [turn] = useAssistStore.getState().turns;
    expect(JSON.stringify(turn?.cards)).toContain('김지훈');
    expect(turn?.maskedCount).toBe(1);
  });

  it('정상 집계는 하나도 지워지지 않는다 (그물이 과하게 잡으면 기능이 죽는다)', async () => {
    const port = fakePort();
    await useAssistStore
      .getState()
      .ask(port, '할 일', [todoCard(['교무회의 자료 준비', '성적 입력'])], ROSTER);

    const [turn] = useAssistStore.getState().turns;
    expect(turn?.maskedCount).toBe(0);
    expect(turn?.blankedCount).toBe(0);
    expect(port.calls[0]?.toolResults).toHaveLength(1);
  });

  it('★AI 답변의 별칭은 화면에 띄우기 전에 실제 이름으로 되돌아온다', async () => {
    // 모델은 ［이름1］ 만 봤고, 선생님은 "김지훈"을 본다.
    // 이름이 컴퓨터 밖으로 나가지 않으면서도 답변은 자연스럽게 읽힌다.
    const port: AssistPort & { calls: AssistRequestPayload[] } = {
      calls: [],
      ask: vi.fn(async (payload: AssistRequestPayload) => {
        port.calls.push(payload);
        return { text: '［이름1］ 학부모 면담이 가장 급해요.', degraded: null };
      }),
    };

    await useAssistStore.getState().ask(port, '할 일', [todoCard(['김지훈 학부모 면담'])], ROSTER);

    const [turn] = useAssistStore.getState().turns;
    expect(turn?.answer).toBe('김지훈 학부모 면담이 가장 급해요.');
    // 그래도 **나간 것**에는 이름이 없어야 한다.
    expect(JSON.stringify(port.calls[0]?.toolResults)).not.toContain('김지훈');
  });

  it('모델이 별칭을 망가뜨려도 원문이 새지는 않는다', async () => {
    const port: AssistPort = {
      ask: vi.fn(async () => ({ text: '이름1 학생 면담이 급해요.', degraded: null })),
    };

    await useAssistStore.getState().ask(port, '할 일', [todoCard(['김지훈 상담'])], ROSTER);

    // 되돌리기가 실패하면 별칭이 그대로 보일 뿐, 다른 학생 이름이 끼어들지 않는다.
    expect(useAssistStore.getState().turns[0]?.answer).toBe('이름1 학생 면담이 급해요.');
  });

  it('★crypto.randomUUID 가 없어도 서버 정규식을 통과한다', () => {
    // 서버(`assistRequest.ts`)가 쓰는 것과 **같은 정규식**이다.
    const SERVER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (let i = 0; i < 200; i += 1) {
      expect(uuidFallback()).toMatch(SERVER);
    }
  });

  it('★installId 는 서버가 받는 UUID 모양이다', async () => {
    const port = fakePort();
    await useAssistStore.getState().ask(port, '우리 반 몇 명?', [safeCard()], []);

    expect(port.calls[0]?.installId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
