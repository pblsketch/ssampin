/**
 * 쌤핀 AI — 구글에서 받은 일정·할 일은 **밖으로 나가지 않는다** (ADR-136)
 *
 * 구글 규정은 캘린더·할 일 API 로 받은 자료를 학습에 쓰는 곳으로 넘기는 것을 금지한다.
 * 쌤핀 AI 는 무료 조건이라 보낸 내용이 학습에 쓰일 수 있으므로 원본은 물론 **개수도** 보내지
 * 않는다. 대신 선생님 화면에는 카드의 `localOnly` 로 따로 보여 준다.
 *
 * 여기서는 ① 도구 실행 결과의 `data`(밖으로 나가는 쪽)에 구글 항목·개수가 없는지,
 * ② 화면용 `localOnly` 에는 남는지, ③ 스토어가 실제로 보내는 페이로드에 `localOnly` 가
 * 실리지 않는지를 본다.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { buildCards, executeAssistTool, type ExecutorSources } from '../AssistDockContainer';
import { useAssistStore } from '@adapters/stores/useAssistStore';
import type { AssistAnswer, AssistPort, AssistRequestPayload } from '@domain/ports/AssistPort';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';

const LOCAL_EVENT = '학년 협의회';
const GOOGLE_EVENT = '치과 예약';
const LOCAL_TODO = '공문 회신';
const GOOGLE_TODO = '택배 찾기';

const event = (id: string, title: string, date: string): SchoolEvent => ({
  id,
  title,
  date,
  category: 'school',
});

function sources(linked: boolean): ExecutorSources {
  return {
    students: [],
    classes: [],
    todos: [{ text: LOCAL_TODO, dueDate: '2026-09-25', completed: false }],
    records: [],
    meals: [],
    events: [event('e1', LOCAL_EVENT, '2026-09-24')],
    google: {
      linked,
      todos: [{ text: GOOGLE_TODO, dueDate: '2026-09-26', completed: false }],
      events: [event('gcal:c:g1', GOOGLE_EVENT, '2026-09-24')],
    },
    ddays: [],
    getDaySchedule: () => [],
    progress: [],
    memos: [],
    notes: { notebooks: [], sections: [], pages: [] },
    bookmarks: [],
    bookmarkGroups: [],
    classAttendance: [],
    gradePlans: [],
    gradeScores: [],
    seating: { rows: 0, cols: 0, seats: [], layout: 'grid' },
    rubrics: [],
    rubricGradings: [],
  };
}

const WEEK_ARGS = JSON.stringify({ from: '2026-09-21', to: '2026-09-27' });

describe('★나가는 쪽(data)에는 구글 항목도, 구글 항목 개수도 없다', () => {
  it('일정 — 구글 일정은 data 에 없고 화면용 localOnly 에만 있다', () => {
    const card = executeAssistTool('get_events', WEEK_ARGS, sources(true));
    const outbound = JSON.stringify(card?.data);
    expect(outbound).toContain(LOCAL_EVENT);
    expect(outbound).not.toContain(GOOGLE_EVENT);
    expect(card?.localOnly?.items.map((i) => i.title)).toEqual([GOOGLE_EVENT]);
  });

  it('할 일 — 미완료 수도 구글 할 일을 빼고 센다', () => {
    const card = executeAssistTool('get_my_todos', '{}', sources(true));
    const outbound = JSON.stringify(card?.data);
    expect(outbound).toContain(LOCAL_TODO);
    expect(outbound).not.toContain(GOOGLE_TODO);
    expect(card?.data.undone).toBe(1);
    expect(card?.localOnly?.items.map((i) => i.title)).toEqual([GOOGLE_TODO]);
  });

  it('한 주 요약 — 날짜 칸의 일정·미완료 할 일 수 모두 구글 것을 뺀다', () => {
    const card = executeAssistTool('get_week_overview', WEEK_ARGS, sources(true));
    const outbound = JSON.stringify(card?.data);
    expect(outbound).toContain(LOCAL_EVENT);
    expect(outbound).not.toContain(GOOGLE_EVENT);
    expect(card?.data.todoUndone).toBe(1);
    expect(card?.localOnly?.items.map((i) => i.title)).toEqual([GOOGLE_EVENT, '미완료 할 일 1개']);
  });

  it('정규식 지름길("할 일")도 같다', () => {
    const [card] = buildCards('오늘 할 일 알려줘', sources(true));
    expect(card?.tool).toBe('get_my_todos');
    expect(JSON.stringify(card?.data)).not.toContain(GOOGLE_TODO);
    expect(card?.localOnly?.items.map((i) => i.title)).toEqual([GOOGLE_TODO]);
  });
});

describe('모델에게는 "구글 항목은 빠져 있다"는 고정 안내만 간다', () => {
  it('구글 계정이 연결돼 있으면 안내가 붙는다', () => {
    const card = executeAssistTool('get_events', WEEK_ARGS, sources(true));
    expect(card?.data.googleItemsNotIncluded).toBe(true);
  });

  it('연결돼 있지 않으면 붙지 않는다', () => {
    const card = executeAssistTool('get_events', WEEK_ARGS, sources(false));
    expect(card?.data).not.toHaveProperty('googleItemsNotIncluded');
  });
});

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

describe('★스토어가 실제로 보내는 페이로드에 localOnly 가 실리지 않는다', () => {
  beforeEach(() => {
    useAssistStore.setState({ enabled: true, provider: 'ssampin', turns: [], draft: '' });
  });

  it('1왕복(정규식 카드) — 구글 할 일은 화면에만 남는다', async () => {
    const cards = buildCards('오늘 할 일 알려줘', sources(true));
    const { port, payloads } = recordingPort([{ text: '답', degraded: null }]);

    await useAssistStore.getState().ask(port, '오늘 할 일 알려줘', cards, []);

    expect(payloads).toHaveLength(1);
    expect(JSON.stringify(payloads[0])).not.toContain(GOOGLE_TODO);
    expect(JSON.stringify(useAssistStore.getState().turns[0]?.cards)).toContain(GOOGLE_TODO);
  });

  it('2왕복(모델이 고른 도구) — 실행 결과의 localOnly 도 나가지 않는다', async () => {
    const src = sources(true);
    const { port, payloads } = recordingPort([
      { text: '', degraded: null, toolCalls: [{ name: 'get_events', rawArguments: WEEK_ARGS }] },
      { text: '답', degraded: null },
    ]);

    await useAssistStore
      .getState()
      .ask(port, '이번 주 일정', [], [], (name, raw) => executeAssistTool(name, raw, src));

    expect(payloads.length).toBeGreaterThanOrEqual(2);
    for (const payload of payloads) {
      expect(JSON.stringify(payload)).not.toContain(GOOGLE_EVENT);
    }
    // 실행 결과가 실제로 실려 나갔는지도 본다 — 빈 것을 검사하면 아무것도 증명 못 한다.
    expect(JSON.stringify(payloads[1]?.toolResults)).toContain(LOCAL_EVENT);
    expect(JSON.stringify(useAssistStore.getState().turns[0]?.cards)).toContain(GOOGLE_EVENT);
  });
});
