import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import type { BrowserWindow } from 'electron';
import type {
  ParticipationControl,
  ParticipationControlResult,
} from '../../src/domain/entities/multiSurvey/ParticipationProtocol';
import type { MultiSurveyQuestionForHTML } from './liveMultiSurveyHTML';

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());
vi.mock('electron', () => ({
  ipcMain: {
    handle: (name: string, fn: (...args: unknown[]) => unknown) => handlers.set(name, fn),
  },
}));
vi.mock('./tunnel', () => ({
  closeTunnel: vi.fn(),
  isTunnelAvailable: vi.fn(),
  installTunnel: vi.fn(),
  openTunnel: vi.fn(),
}));
import { registerLiveMultiSurveyHandlers } from './liveMultiSurvey';

type Message = Record<string, unknown>;
const sockets: WebSocket[] = [];
const sent = vi.fn();
const teacher = {
  isDestroyed: () => false,
  webContents: { send: sent, isDestroyed: () => false },
} as unknown as BrowserWindow;
const invoke = (name: string, data?: unknown) =>
  handlers.get(`live-multi-survey:${name}`)!(null, data);
const control = (
  action: ParticipationControl['action'],
  questionIndex = 0,
  attempt = 1,
  results?: ParticipationControl['results'],
) =>
  invoke('participation-control', {
    action,
    questionIndex,
    attempt,
    roomId: 'room-test',
    results,
  }) as ParticipationControlResult;

async function start(questions: MultiSurveyQuestionForHTML[]) {
  return (await invoke('start', {
    questions,
    stepMode: true,
    participation: {
      roomId: 'room-test',
      title: '참여교실 테스트',
      purpose: 'activity',
      competitionMode: true,
    },
  })) as { port: number };
}

async function student(port: number, nickname: string, priorId?: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  sockets.push(ws);
  const messages: Message[] = [];
  ws.on('message', (data) => messages.push(JSON.parse(String(data)) as Message));
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  ws.send(JSON.stringify({ type: 'join', nickname, sessionId: priorId }));
  await vi.waitFor(() => expect(messages.some((m) => m.type === 'joined')).toBe(true));
  const sessionId = messages.find((m) => m.type === 'joined')!.sessionId as string;
  return {
    ws,
    messages,
    sessionId,
    answer(
      answer: Message,
      questionIndex = 0,
      attempt = 1,
      questionId = 'q1',
      extra: Message = {},
    ) {
      ws.send(
        JSON.stringify({
          type: 'answer',
          sessionId,
          roomId: 'room-test',
          questionIndex,
          questionId,
          attempt,
          answer,
          ...extra,
        }),
      );
    },
    latest() {
      return messages.filter((m) => m.type === 'state').at(-1)!;
    },
  };
}

const choice: MultiSurveyQuestionForHTML = {
  id: 'q1',
  type: 'single-choice',
  question: '하나를 고르세요',
  required: true,
  options: [
    { id: 'a', text: '첫째' },
    { id: 'b', text: '둘째' },
  ],
};

beforeEach(() => {
  handlers.clear();
  sent.mockClear();
  registerLiveMultiSurveyHandlers(teacher);
});
afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await invoke('stop');
});

describe('참여교실 실제 HTTP/WebSocket 왕복', () => {
  it('실제 학생 HTML을 제공하고, 서버가 소유한 신원과 회차로만 응답을 받는다', async () => {
    const { port } = await start([choice]);
    const response = await fetch(`http://127.0.0.1:${port}/`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('참여교실');
    const a = await student(port, '가');
    const b = await student(port, '나');
    control('activate');
    a.answer({ optionIds: ['b'] }, 0, 1, 'q1', { sessionId: b.sessionId });
    a.answer({ optionIds: ['b'] }, 0, 0);
    a.answer({ optionIds: ['missing'] });
    a.answer({ optionIds: ['a'] });
    await vi.waitFor(() => expect(a.latest().totalAnswered).toBe(1));
    a.answer({ optionIds: ['b'] });
    await vi.waitFor(() => expect(a.messages.filter((m) => m.type === 'ack').length).toBe(2));
    const closed = control('close');
    expect(closed.answers).toHaveLength(1);
    expect(closed.answers[0]).toMatchObject({
      studentId: a.sessionId,
      answer: { optionIds: ['a'], attempt: 1 },
    });
    expect(() =>
      invoke('participation-control', {
        roomId: 'old-room',
        action: 'end',
        questionIndex: 0,
        attempt: 1,
      }),
    ).toThrow();
  });

  it('마감 후 개인 결과는 본인에게만 전달하고 재접속해도 복구한다', async () => {
    const { port } = await start([choice]);
    const a = await student(port, '가');
    const b = await student(port, '나');
    control('activate');
    a.answer({ optionIds: ['a'] });
    await vi.waitFor(() => expect(a.latest().totalAnswered).toBe(1));
    expect(a.latest().personal).toBeUndefined();
    control('close');
    control('publish', 0, 1, [
      {
        studentId: a.sessionId,
        score: 10,
        correctCount: 1,
        completedCount: 1,
        rank: 1,
        review: [],
      },
      { studentId: b.sessionId, score: 0, correctCount: 0, completedCount: 1, rank: 2, review: [] },
    ]);
    await vi.waitFor(() => expect(a.latest().personal).toMatchObject({ score: 10 }));
    expect(b.latest().personal).toMatchObject({ score: 0 });
    const reconnected = await student(port, '가', a.sessionId);
    await vi.waitFor(() => expect(reconnected.latest().personal).toMatchObject({ score: 10 }));
  });

  it('재응답을 새 회차로 열고 이전 회차 응답은 받지 않는다', async () => {
    const { port } = await start([{ ...choice, collectReason: true }]);
    const a = await student(port, '가');
    control('activate');
    a.answer({ optionIds: ['a'], reason: '처음 근거' });
    await vi.waitFor(() => expect(a.latest().totalAnswered).toBe(1));
    const first = control('close');
    expect(first.answers[0]?.answer.reason).toBe('처음 근거');
    control('reopen');
    a.answer({ optionIds: ['a'], reason: '늦은 이전 응답' });
    a.answer({ optionIds: ['b'], reason: '새 근거' }, 0, 2);
    await vi.waitFor(() =>
      expect(a.latest().myAnswer).toMatchObject({ reason: '새 근거', attempt: 2 }),
    );
    expect(control('close', 0, 2).answers).toHaveLength(1);
  });

  it('공개한 질문에만 공감을 받고 중복 투표를 한 표로 센다', async () => {
    const { port } = await start([
      { id: 'q1', type: 'text', question: '궁금한 점', required: true, allowVoting: true },
    ]);
    const a = await student(port, '가');
    control('activate');
    a.answer({ text: '왜 그럴까요?' });
    await vi.waitFor(() => expect(a.latest().totalAnswered).toBe(1));
    const vote = {
      type: 'vote',
      roomId: 'room-test',
      questionIndex: 0,
      attempt: 1,
      target: 'idea-0',
      selected: true,
    };
    a.ws.send(JSON.stringify(vote));
    await new Promise<void>((resolve) => {
      a.ws.once('pong', () => resolve());
      a.ws.ping();
    });
    control('close');
    await vi.waitFor(() => expect(a.latest().voteCandidates).toBeDefined());
    const candidates = a.latest().voteCandidates as Array<{ id: string; count: number }>;
    expect(candidates[0]?.count).toBe(0);
    a.ws.send(JSON.stringify({ ...vote, target: candidates[0]!.id }));
    a.ws.send(JSON.stringify({ ...vote, target: candidates[0]!.id }));
    await vi.waitFor(() =>
      expect((a.latest().voteCandidates as Array<{ count: number }>)[0]?.count).toBe(1),
    );
  });
});
