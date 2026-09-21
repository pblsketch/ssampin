import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import { WebSocket } from 'ws';
import { createParticipationQuestion } from '../../src/adapters/multiSurvey/questionCatalog';
import { mapQuestionsForLiveHTML } from '../../src/adapters/multiSurvey/live/liveBridge';
import type { AdvancedQuestion } from '../../src/domain/entities/multiSurvey/AdvancedQuestion';

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());
vi.mock('electron', () => ({
  ipcMain: {
    handle: (name: string, fn: (...args: unknown[]) => unknown) => handlers.set(name, fn),
  },
  BrowserWindow: class {},
}));
vi.mock('./tunnel', () => ({
  isTunnelAvailable: vi.fn(),
  installTunnel: vi.fn(),
  openTunnel: vi.fn(),
  closeTunnel: vi.fn(),
}));
import { registerLiveMultiSurveyHandlers } from './liveMultiSurvey';

const sockets: WebSocket[] = [];
const sent = vi.fn();
const call = (name: string, data?: unknown) =>
  handlers.get('live-multi-survey:' + name)!(null, data);
function message(
  ws: WebSocket,
  predicate: (m: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', receive);
      reject(new Error('학생 응답 대기 시간 초과'));
    }, 4000);
    const receive = (raw: Buffer) => {
      const m = JSON.parse(String(raw)) as Record<string, unknown>;
      if (predicate(m)) {
        clearTimeout(timer);
        ws.off('message', receive);
        resolve(m);
      }
    };
    ws.on('message', receive);
  });
}
async function join(port: number) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  sockets.push(ws);
  await new Promise<void>((resolve) => ws.once('open', resolve));
  const ready = message(ws, (m) => m.type === 'joined');
  ws.send(JSON.stringify({ type: 'join', nickname: '검증용 별명' }));
  const data = await ready;
  return { ws, id: data.sessionId };
}
beforeAll(() =>
  registerLiveMultiSurveyHandlers({
    webContents: { send: sent },
    isDestroyed: () => false,
  } as unknown as BrowserWindow),
);
afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.terminate();
  await call('stop');
});

describe('새 문항 학생 HTTP와 WebSocket 실제 왕복', () => {
  it('확장 입력 10종을 같은 참여 주소에서 연속 제출하고 저장한다', async () => {
    const types = [
      'order',
      'ranking',
      'pin',
      'numeric',
      'allocation',
      'matrix',
      'brainstorm',
      'rating',
      'valueline',
      'quadrant',
    ] as const;
    const questions = types.map((type, index) => {
      const q = createParticipationQuestion(type, type, `q${index}`) as AdvancedQuestion;
      return {
        ...q,
        settings: {
          ...q.settings,
          items: [
            { id: 'a', text: '가' },
            { id: 'b', text: '나' },
          ],
        },
      };
    });
    const answers = [
      ['b', 'a'],
      ['a', 'b'],
      { x: 0.2, y: 0.7 },
      15,
      { a: 40, b: 60 },
      { 'a:x': 1, 'a:y': 2, 'b:x': 3, 'b:y': 4 },
      ['생각'],
      { a: 2, b: 4 },
      { 'a:x': 2, 'b:x': 3 },
      [{ x: 0.25, y: 0.75 }],
    ];
    const info = (await call('start', {
      questions: mapQuestionsForLiveHTML(questions),
      stepMode: true,
      participation: {
        roomId: 'all',
        title: '모든 유형',
        purpose: 'activity',
        competitionMode: false,
      },
    })) as { port: number };
    const { ws, id } = await join(info.port);
    call('participation-control', {
      roomId: 'all',
      questionIndex: 0,
      attempt: 1,
      action: 'activate',
    });
    for (let i = 0; i < questions.length; i++) {
      const ack = message(ws, (m) => m.type === 'ack');
      ws.send(
        JSON.stringify({
          type: 'answer',
          sessionId: id,
          roomId: 'all',
          questionId: `q${i}`,
          questionIndex: i,
          attempt: 1,
          answer: { text: JSON.stringify(answers[i]) },
        }),
      );
      await ack;
      const closed = call('participation-control', {
        roomId: 'all',
        questionIndex: i,
        attempt: 1,
        action: 'close',
      }) as { answers: { answer: { text: string } }[] };
      expect(JSON.parse(closed.answers[0]!.answer.text)).toEqual(answers[i]);
      call('participation-control', {
        roomId: 'all',
        questionIndex: i,
        attempt: 1,
        action: 'advance',
      });
    }
  });
  it('숫자 입력을 실제 서버에서 검증하고 정답은 보내지 않는다', async () => {
    const base = createParticipationQuestion('numeric', '숫자 질문', 'n') as AdvancedQuestion;
    const q = { ...base, solution: { number: 42, tolerance: 2 } };
    const info = (await call('start', {
      questions: mapQuestionsForLiveHTML([q]),
      stepMode: true,
      participation: {
        roomId: 'test-room',
        title: '검증',
        purpose: 'activity',
        competitionMode: false,
      },
    })) as { port: number };
    const http = await fetch(`http://127.0.0.1:${info.port}`);
    expect(http.status).toBe(200);
    expect(await http.text()).toContain('advancedInput');
    const { ws, id } = await join(info.port);
    const opening = message(ws, (m) => m.phase === 'open');
    call('participation-control', {
      roomId: 'test-room',
      questionIndex: 0,
      attempt: 1,
      action: 'activate',
    });
    const state = await opening;
    expect(JSON.stringify(state)).not.toContain('solution');
    const invalid = message(ws, (m) => m.type === 'error');
    ws.send(
      JSON.stringify({
        type: 'answer',
        sessionId: id,
        roomId: 'test-room',
        questionId: 'n',
        questionIndex: 0,
        attempt: 1,
        answer: { text: '101' },
      }),
    );
    expect((await invalid).message).toContain('입력');
    const ack = message(ws, (m) => m.type === 'ack');
    ws.send(
      JSON.stringify({
        type: 'answer',
        sessionId: id,
        roomId: 'test-room',
        questionId: 'n',
        questionIndex: 0,
        attempt: 1,
        answer: { text: '43' },
      }),
    );
    await ack;
    const result = call('participation-control', {
      roomId: 'test-room',
      questionIndex: 0,
      attempt: 1,
      action: 'close',
    }) as { answers: { answer: { text: string } }[] };
    expect(result.answers[0]?.answer.text).toBe('43');
  });
  it('아이디어 공개 후에만 투표하며 중복 메시지는 공감을 늘리지 않는다', async () => {
    const q = createParticipationQuestion('brainstorm', '아이디어', 'b');
    const info = (await call('start', {
      questions: mapQuestionsForLiveHTML([q]),
      stepMode: true,
      participation: {
        roomId: 'votes',
        title: '검증',
        purpose: 'activity',
        competitionMode: false,
      },
    })) as { port: number };
    const { ws, id } = await join(info.port);
    call('participation-control', {
      roomId: 'votes',
      questionIndex: 0,
      attempt: 1,
      action: 'activate',
    });
    const ack = message(ws, (m) => m.type === 'ack');
    ws.send(
      JSON.stringify({
        type: 'answer',
        sessionId: id,
        roomId: 'votes',
        questionId: 'b',
        questionIndex: 0,
        attempt: 1,
        answer: { text: '["생각 하나","생각 둘"]' },
      }),
    );
    await ack;
    const reveal = message(ws, (m) => m.phase === 'revealed');
    call('participation-control', {
      roomId: 'votes',
      questionIndex: 0,
      attempt: 1,
      action: 'close',
    });
    const state = await reveal;
    expect(state.voteCandidates).toHaveLength(2);
    for (let i = 0; i < 2; i++) {
      const voted = message(
        ws,
        (m) => m.phase === 'revealed' && Array.isArray(m.myVotes) && m.myVotes.length === 1,
      );
      ws.send(
        JSON.stringify({
          type: 'vote',
          roomId: 'votes',
          questionIndex: 0,
          attempt: 1,
          target: 'idea-0',
          selected: true,
        }),
      );
      expect((await voted).voteCandidates).toEqual([
        { id: 'idea-0', text: '생각 하나', count: 1 },
        { id: 'idea-1', text: '생각 둘', count: 0 },
      ]);
    }
  });
});
