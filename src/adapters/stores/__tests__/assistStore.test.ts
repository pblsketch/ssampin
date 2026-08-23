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
import {
  ASSIST_SEND_LIMITS,
  buildHistoryTurns,
  useAssistStore,
  uuidFallback,
} from '@adapters/stores/useAssistStore';
import type { AssistTurn } from '@adapters/stores/useAssistStore';
import { LIMITS as SERVER_LIMITS } from '../../../../supabase/functions/_shared/assistRequest';

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

  it('★직전 대화를 함께 싣는다 — "어떤 일인지 알려줘"가 통해야 한다 (ADR-067, §8.2 뒤집음)', async () => {
    const port = fakePort();
    await useAssistStore.getState().ask(port, '첫 질문', [safeCard()], []);
    await useAssistStore.getState().ask(port, '두 번째 질문', [safeCard()], []);

    // 두 번째 호출: [첫 질문, 첫 답, 두 번째 질문] — 모델이 앞 대화를 안다.
    const turns = port.calls[1]?.turns ?? [];
    expect(turns.map((t) => t.role)).toEqual(['user', 'assistant', 'user']);
    expect(turns[0]?.content).toBe('첫 질문');
    expect(turns[1]?.content).toBe('3학년 2반은 30명입니다.');
    expect(turns[2]?.content).toBe('두 번째 질문');
  });

  it('막힌 턴은 이력에 싣지 않는다 — 서버가 같은 검사로 또 거절한다', async () => {
    const blockedPort: AssistPort & { calls: AssistRequestPayload[] } = {
      calls: [],
      ask: vi.fn(async (payload: AssistRequestPayload) => {
        blockedPort.calls.push(payload);
        if (blockedPort.calls.length === 1) throw new AssistBlockedError('보낼 수 없는 내용');
        return { text: '답', degraded: null };
      }),
    };
    await useAssistStore.getState().ask(blockedPort, '막힐 질문', [safeCard()], []);
    await useAssistStore.getState().ask(blockedPort, '다음 질문', [safeCard()], []);

    const turns = blockedPort.calls[1]?.turns ?? [];
    expect(turns).toHaveLength(1);
    expect(turns[0]?.content).toBe('다음 질문');
  });

  it('카드가 없는 후속 질문에는 직전 턴의 (가려진) 카드를 다시 싣는다', async () => {
    const port = fakePort();
    await useAssistStore.getState().ask(port, '오늘 할 일 있나', [safeCard()], []);
    // 의도 규칙에 안 걸린 후속 질문 - 카드 없음
    await useAssistStore.getState().ask(port, '어떤 일인지 알려줘', [], []);

    expect(port.calls[1]?.toolResults).toHaveLength(1);
    expect(port.calls[1]?.toolResults[0]?.tool).toBe('count_students');
  });
});

describe('이력 한도 — 서버가 거절하기 전에 앱이 자른다', () => {
  it('★앱의 한도 거울값이 서버 한도와 같은 값이다', () => {
    expect(ASSIST_SEND_LIMITS.maxTurns).toBe(SERVER_LIMITS.maxTurns);
    expect(ASSIST_SEND_LIMITS.maxTurnChars).toBe(SERVER_LIMITS.maxTurnChars);
    expect(ASSIST_SEND_LIMITS.maxTotalChars).toBe(SERVER_LIMITS.maxTotalChars);
    expect(ASSIST_SEND_LIMITS.maxToolResults).toBe(SERVER_LIMITS.maxToolResults);
  });

  function doneTurn(i: number, answerChars = 10): AssistTurn {
    return {
      id: String(i),
      question: `질문${i}`,
      cards: [],
      answer: 'ㅇ'.repeat(answerChars),
      outboundAnswer: 'ㅇ'.repeat(answerChars),
      outboundCards: [],
      degraded: null,
      status: 'done',
      maskedCount: 0,
      blankedCount: 0,
    };
  }

  it('턴 수가 서버 상한(12)을 넘지 않는다 — 오래된 대화부터 떨어진다', () => {
    const prior = Array.from({ length: 20 }, (_, i) => doneTurn(i));
    const turns = buildHistoryTurns(prior, '현재 질문');

    expect(turns.length).toBeLessThanOrEqual(SERVER_LIMITS.maxTurns);
    expect(turns.at(-1)?.content).toBe('현재 질문');
    // 최신 대화가 남는다
    expect(turns.at(-2)?.content).toBe('ㅇ'.repeat(10));
    expect(turns.at(-3)?.content).toBe('질문19');
  });

  it('글자 수가 서버 상한(8000)을 넘지 않는다', () => {
    const prior = Array.from({ length: 10 }, (_, i) => doneTurn(i, 1_900));
    const turns = buildHistoryTurns(prior, '현재 질문');

    const total = turns.reduce((n, t) => n + t.content.length, 0);
    expect(total).toBeLessThanOrEqual(SERVER_LIMITS.maxTotalChars);
  });

  it('축소(degraded)로 답이 빈 턴은 질문만 싣는다 — 빈 턴을 보내면 서버가 거절한다', () => {
    const empty = { ...doneTurn(1), outboundAnswer: '' };
    const turns = buildHistoryTurns([empty], '현재 질문');

    expect(turns.map((t) => t.content)).toEqual(['질문1', '현재 질문']);
    expect(turns.every((t) => t.content.length > 0)).toBe(true);
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

  it('★이력으로 다시 나가는 답변도 별칭 그대로다 — 화면용을 실으면 이름이 샌다 (ADR-067)', async () => {
    const port: AssistPort & { calls: AssistRequestPayload[] } = {
      calls: [],
      ask: vi.fn(async (payload: AssistRequestPayload) => {
        port.calls.push(payload);
        return { text: '［이름1］ 학부모 면담이 가장 급해요.', degraded: null };
      }),
    };

    await useAssistStore.getState().ask(port, '할 일', [todoCard(['김지훈 학부모 면담'])], ROSTER);
    // 화면에는 "김지훈"이 복원돼 있다. 이 상태에서 후속 질문을 하면 -
    await useAssistStore.getState().ask(port, '어떤 것부터 할까', [], ROSTER);

    const history = port.calls[1]?.turns ?? [];
    const assistant = history.find((t) => t.role === 'assistant');
    // 이력의 답변은 서버가 준 그대로(별칭)여야 한다. 복원본이면 이름이 다시 나간다.
    expect(assistant?.content).toBe('［이름1］ 학부모 면담이 가장 급해요.');
    expect(JSON.stringify(history)).not.toContain('김지훈');
  });

  it('★모델이 괄호를 흘려도 되돌아온다 (실측: 원형 보존은 16.7%뿐이었다)', async () => {
    // solar-pro3 는 ［이름1］ 을 〈이름1〉·(이름1)·이름1 등으로 바꿔 돌려준다.
    // 정확 일치만 보면 선생님이 찌꺼기를 그대로 보게 된다.
    const port: AssistPort = {
      ask: vi.fn(async () => ({ text: '이름1 학생 면담이 급해요.', degraded: null })),
    };

    await useAssistStore.getState().ask(port, '할 일', [todoCard(['김지훈 상담'])], ROSTER);

    expect(useAssistStore.getState().turns[0]?.answer).toBe('김지훈 학생 면담이 급해요.');
  });

  it('매핑에 없는 별칭은 그대로 둔다 — 엉뚱한 이름이 끼어들지 않는다', async () => {
    const port: AssistPort = {
      ask: vi.fn(async () => ({ text: '［이름7］ 면담이 급해요.', degraded: null })),
    };

    await useAssistStore.getState().ask(port, '할 일', [todoCard(['김지훈 상담'])], ROSTER);

    expect(useAssistStore.getState().turns[0]?.answer).toBe('［이름7］ 면담이 급해요.');
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
