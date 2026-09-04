import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import {
  createOwnAiRunner,
  defaultKillTreeSync,
  parseClaudeLine,
  parseCodexLine,
  type KillTreeIo,
  type OwnAiRunnerDeps,
  type OwnAiRunRequest,
} from './ownAiRunner';
import { OWN_AI_ACTIVE_GRACE_MS } from '../../src/domain/rules/ownAiWriteGate';
import type { OwnAiRunEvent } from '../../src/domain/entities/OwnAiProvider';

/** 가짜 자식 프로세스 — stdout/stderr 를 우리가 직접 밀어 넣는다. */
class FakeChild extends EventEmitter {
  readonly stdout = new EventEmitter() as unknown as NodeJS.ReadableStream & {
    setEncoding: (e: string) => void;
  };
  readonly stderr = new EventEmitter() as unknown as NodeJS.ReadableStream & {
    setEncoding: (e: string) => void;
  };
  pid: number | undefined = 4242;
  constructor() {
    super();
    (this.stdout as unknown as { setEncoding: () => void }).setEncoding = () => {};
    (this.stderr as unknown as { setEncoding: () => void }).setEncoding = () => {};
  }
  pushOut(s: string): void {
    (this.stdout as unknown as EventEmitter).emit('data', s);
  }
  pushErr(s: string): void {
    (this.stderr as unknown as EventEmitter).emit('data', s);
  }
  close(code: number | null): void {
    this.emit('close', code);
  }
}

interface Harness {
  readonly runner: ReturnType<typeof createOwnAiRunner>;
  readonly events: OwnAiRunEvent[];
  readonly children: FakeChild[];
  readonly killed: number[];
  readonly spawnOpts: Record<string, unknown>[];
  readonly spawnArgs: string[][];
  now: number;
}

function harness(over: Partial<OwnAiRunnerDeps> = {}): Harness {
  const events: OwnAiRunEvent[] = [];
  const children: FakeChild[] = [];
  const killed: number[] = [];
  const spawnOpts: Record<string, unknown>[] = [];
  const spawnArgs: string[][] = [];
  const h = { events, children, killed, spawnOpts, spawnArgs, now: 1_000_000 } as Harness;

  const deps: OwnAiRunnerDeps = {
    // ★.cmd 가 아니다 — Node 20.12.2+ 는 shell 없이 .cmd 를 spawn 하면 EINVAL 이다.
    launch: () => ({ file: 'C:\\npm\\claude.exe', args: [], asNode: false }),
    version: () => '2.1.258',
    cwd: 'C:\\tmp\\cwd',
    emit: (e) => events.push(e),
    platform: 'win32',
    now: () => h.now,
    spawnChild: ((file: string, argv: string[], opts: Record<string, unknown>) => {
      spawnArgs.push(argv);
      spawnOpts.push(opts);
      const c = new FakeChild();
      children.push(c);
      return c as unknown as ChildProcess;
    }) as unknown as OwnAiRunnerDeps['spawnChild'],
    killTreeSync: (pid) => killed.push(pid),
    ...over,
  };
  (h as { runner: ReturnType<typeof createOwnAiRunner> }).runner = createOwnAiRunner(deps);
  return h;
}

function panelReq(over: Partial<OwnAiRunRequest> = {}): OwnAiRunRequest {
  return {
    runId: 'r1',
    provider: 'claude',
    kind: 'panel',
    prompt: '할 일 몇 건?',
    mcpConfigPath: 'C:\\tmp\\mcp.json',
    ...over,
  };
}

describe('claude stream-json 파싱 — 실제로 받은 모양', () => {
  it('텍스트 델타만 글자로 흘린다', () => {
    const line = JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '남은 ' } },
    });
    expect(parseClaudeLine(line, 'r')).toEqual([{ type: 'delta', runId: 'r', text: '남은 ' }]);
  });

  it('생각(thinking) 델타는 글자로 흘리지 않는다', () => {
    const line = JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: '음...' } },
    });
    expect(parseClaudeLine(line, 'r')).toEqual([]);
  });

  it('도구 호출을 이름만 뽑는다', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'mcp__ssampin__get_todos', input: {} }] },
    });
    expect(parseClaudeLine(line, 'r')).toEqual([
      { type: 'tool', runId: 'r', tool: 'mcp__ssampin__get_todos' },
    ]);
  });

  it('★rate_limit_event 에서 남은 사용량을 뽑는다 — 한도를 맞기 전에 안내할 수 있다', () => {
    const line = JSON.stringify({
      type: 'rate_limit_event',
      rate_limit_info: {
        status: 'allowed',
        unifiedWindows: { five_hour: { utilization: 0.83, resetsAt: 1788525000 } },
      },
    });
    expect(parseClaudeLine(line, 'r')).toEqual([
      { type: 'usage', runId: 'r', fiveHourUtilization: 0.83, resetsAt: 1788525000 },
    ]);
  });

  it('result 가 최종 답이다', () => {
    const line = JSON.stringify({ type: 'result', result: '남은 할 일은 2건입니다.' });
    expect(parseClaudeLine(line, 'r')).toEqual([
      { type: 'done', runId: 'r', text: '남은 할 일은 2건입니다.' },
    ]);
  });

  it('깨진 줄과 모르는 줄은 조용히 버린다', () => {
    expect(parseClaudeLine('{깨짐', 'r')).toEqual([]);
    expect(parseClaudeLine('', 'r')).toEqual([]);
    expect(parseClaudeLine(JSON.stringify({ type: 'system', subtype: 'init' }), 'r')).toEqual([]);
  });
});

describe('codex JSONL 파싱 — 실제로 받은 모양', () => {
  it('mcp_tool_call 에서 도구 이름을 뽑는다', () => {
    const line = JSON.stringify({
      type: 'item.completed',
      item: { id: 'item_2', type: 'mcp_tool_call', server: 'ssampin', tool: 'get_todos' },
    });
    expect(parseCodexLine(line, 'r')).toEqual([{ type: 'tool', runId: 'r', tool: 'get_todos' }]);
  });

  it('agent_message 는 통째로 온다(델타가 없다)', () => {
    const line = JSON.stringify({
      type: 'item.completed',
      item: { type: 'agent_message', text: '쌤핀에 남은 할 일은 2건입니다.' },
    });
    expect(parseCodexLine(line, 'r')).toEqual([
      { type: 'delta', runId: 'r', text: '쌤핀에 남은 할 일은 2건입니다.' },
    ]);
  });

  it('★item.type === "error" 를 실패로 올리지 않는다 — 스킬 예산 경고도 이 모양이다', () => {
    const line = JSON.stringify({
      type: 'item.completed',
      item: { type: 'error', message: 'Skill descriptions were shortened…' },
    });
    expect(parseCodexLine(line, 'r')).toEqual([]);
  });

  it('시작 이벤트는 흘리지 않는다', () => {
    expect(parseCodexLine(JSON.stringify({ type: 'item.started', item: {} }), 'r')).toEqual([]);
  });
});

describe('실행 — stdin 과 프로세스 옵션', () => {
  it('★stdin 을 닫는다 — 안 닫으면 codex 는 무한 대기한다(실측)', () => {
    const h = harness();
    h.runner.start(panelReq());
    expect(h.spawnOpts[0]?.['stdio']).toEqual(['ignore', 'pipe', 'pipe']);
  });

  it('프롬프트를 인자로 넘긴다(파이프가 아니라)', () => {
    const h = harness();
    h.runner.start(panelReq());
    expect(h.spawnArgs[0]).toContain('할 일 몇 건?');
  });

  it('빈 작업 폴더에서 띄운다', () => {
    const h = harness();
    h.runner.start(panelReq());
    expect(h.spawnOpts[0]?.['cwd']).toBe('C:\\tmp\\cwd');
  });

  it('CLI 를 못 찾으면 띄우지 않고 not-installed 로 알린다', () => {
    const h = harness({ launch: () => null });
    const r = h.runner.start(panelReq());
    expect(r.ok).toBe(false);
    expect(h.children).toHaveLength(0);
    expect(h.events.at(-1)).toEqual({ type: 'error', runId: 'r1', kind: 'not-installed' });
  });

  it('패널 실행은 동시에 하나만 — 두 번째는 거절한다', () => {
    const h = harness();
    expect(h.runner.start(panelReq()).ok).toBe(true);
    const second = h.runner.start(panelReq({ runId: 'r2' }));
    expect(second.ok).toBe(false);
    expect(second.kind).toBe('busy');
    expect(h.children).toHaveLength(1);
  });
});

describe('활성 판정(activeUntil) — 쓰기 게이트가 보는 값', () => {
  it('기본값은 비활성이다', () => {
    expect(harness().runner.ownAiActiveUntil()).toBe(0);
  });

  it('패널 실행이 시작되면 곧바로 활성이 된다', () => {
    const h = harness();
    h.runner.start(panelReq());
    expect(h.runner.ownAiActiveUntil()).toBe(Number.POSITIVE_INFINITY);
  });

  it('★실행 중 쓰기 토글을 켜도 안전하다 — capability 와 무관하게 활성이다', () => {
    // capability 를 전혀 보지 않고 활성으로 만든다는 것을 값으로 확인한다.
    const h = harness();
    h.runner.start(panelReq());
    expect(h.runner.ownAiActiveUntil()).toBe(Number.POSITIVE_INFINITY);
  });

  it('★끝나면 유예값을 대입한다 — max 가 아니라 대입이라 영원히 활성으로 남지 않는다', () => {
    const h = harness();
    h.runner.start(panelReq());
    h.now = 2_000_000;
    h.children[0]?.close(0);
    expect(h.runner.ownAiActiveUntil()).toBe(2_000_000 + OWN_AI_ACTIVE_GRACE_MS);
    expect(Number.isFinite(h.runner.ownAiActiveUntil())).toBe(true);
  });

  it('생기부 실행은 활성값을 건드리지 않는다 — 브릿지가 없어 쓰기가 올 수 없다', () => {
    const h = harness();
    h.runner.start({ runId: 'd1', provider: 'claude', kind: 'draft', prompt: '초안' });
    expect(h.runner.ownAiActiveUntil()).toBe(0);
    h.children[0]?.close(0);
    expect(h.runner.ownAiActiveUntil()).toBe(0);
  });

  it('spawn 이 던지면 활성값을 되돌린다 — 자식도 없는데 게이트가 켜져 있으면 안 된다', () => {
    const h = harness({
      spawnChild: (() => {
        const e = new Error('spawn 실패') as Error & { code?: string };
        e.code = 'ENOENT';
        throw e;
      }) as unknown as OwnAiRunnerDeps['spawnChild'],
    });
    h.runner.start(panelReq());
    expect(h.runner.ownAiActiveUntil()).toBe(0);
    expect(h.events.at(-1)).toEqual({ type: 'error', runId: 'r1', kind: 'not-installed' });
  });
});

describe('종료 처리', () => {
  it('정상 종료면 최종 답을 준다', () => {
    const h = harness();
    h.runner.start(panelReq());
    h.children[0]?.pushOut(
      `${JSON.stringify({ type: 'result', result: '남은 할 일은 2건입니다.' })}\n`,
    );
    h.children[0]?.close(0);
    expect(h.events.at(-1)).toEqual({ type: 'done', runId: 'r1', text: '남은 할 일은 2건입니다.' });
  });

  it('여러 줄이 한 덩어리로 와도 줄 단위로 나눠 읽는다', () => {
    const h = harness();
    h.runner.start(panelReq());
    const a = JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '가' } },
    });
    const b = JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '나' } },
    });
    h.children[0]?.pushOut(`${a}\n${b}\n`);
    const deltas = h.events.filter((e) => e.type === 'delta');
    expect(deltas).toHaveLength(2);
  });

  it('줄이 중간에 잘려 와도 이어 붙인다', () => {
    const h = harness();
    h.runner.start(panelReq());
    const line = JSON.stringify({ type: 'result', result: '끝' });
    h.children[0]?.pushOut(line.slice(0, 10));
    h.children[0]?.pushOut(`${line.slice(10)}\n`);
    h.children[0]?.close(0);
    expect(h.events.at(-1)).toEqual({ type: 'done', runId: 'r1', text: '끝' });
  });

  it('실패로 끝나면 stderr 로 갈래를 가른다', () => {
    const h = harness();
    h.runner.start(panelReq());
    h.children[0]?.pushErr('[claude-code:unrecognized_model] {"model":"gpt-9"}');
    h.children[0]?.close(1);
    expect(h.events.at(-1)).toEqual({ type: 'error', runId: 'r1', kind: 'model-unavailable' });
  });

  it('★finalize 는 멱등이다 — error 와 close 가 둘 다 와도 한 번만 마무리한다', () => {
    const h = harness();
    h.runner.start(panelReq());
    h.children[0]?.emit('error', Object.assign(new Error('x'), { code: 'ENOENT' }));
    h.children[0]?.close(null);
    const finals = h.events.filter((e) => e.type === 'done' || e.type === 'error');
    expect(finals).toHaveLength(1);
  });
});

describe('취소와 앱 종료', () => {
  it('취소하면 프로세스 트리를 죽이고 cancelled 로 마무리한다', () => {
    const h = harness();
    h.runner.start(panelReq());
    h.runner.cancel('r1');
    expect(h.killed).toEqual([4242]);
    h.children[0]?.close(null);
    expect(h.events.at(-1)).toEqual({ type: 'error', runId: 'r1', kind: 'cancelled' });
  });

  it('없는 실행을 취소해도 아무 일이 없다', () => {
    const h = harness();
    h.runner.cancel('없음');
    expect(h.killed).toEqual([]);
  });

  it('★cancelAllSync 는 동기로 전부 죽이고 활성값을 즉시 내린다', () => {
    const h = harness();
    h.runner.start(panelReq());
    h.runner.start({ runId: 'd1', provider: 'claude', kind: 'draft', prompt: '초안' });
    h.runner.cancelAllSync();
    expect(h.killed).toHaveLength(2);
    expect(h.runner.ownAiActiveUntil()).toBe(0);
    expect(h.runner.hasActivePanelRun()).toBe(false);
  });

  it('cancelAllSync 뒤에 늦게 온 close 가 활성값을 되살리지 않는다', () => {
    const h = harness();
    h.runner.start(panelReq());
    h.runner.cancelAllSync();
    h.now = 9_000_000;
    h.children[0]?.close(null);
    expect(h.runner.ownAiActiveUntil()).toBe(0);
  });
});

describe('프로세스 트리 종료', () => {
  function killIo(): { io: KillTreeIo; calls: string[][]; groups: number[] } {
    const calls: string[][] = [];
    const groups: number[] = [];
    return {
      io: {
        runSync: (file, argv) => calls.push([file, ...argv]),
        killGroup: (pid) => groups.push(pid),
      },
      calls,
      groups,
    };
  }

  it('★Windows 는 taskkill /T /F 로 손자까지 죽인다 — /T 가 없으면 브릿지가 남는다', () => {
    const k = killIo();
    defaultKillTreeSync(1234, 'win32', k.io);
    expect(k.calls).toEqual([['taskkill', '/PID', '1234', '/T', '/F']]);
    expect(k.groups).toEqual([]);
  });

  it('mac·linux 는 프로세스 그룹째 보낸다(detached 로 띄웠다)', () => {
    const k = killIo();
    defaultKillTreeSync(1234, 'darwin', k.io);
    expect(k.groups).toEqual([1234]);
    expect(k.calls).toEqual([]);
  });

  it('이미 죽은 프로세스여도 던지지 않는다', () => {
    const io: KillTreeIo = {
      runSync: () => {
        throw new Error('ESRCH');
      },
      killGroup: () => {
        throw new Error('ESRCH');
      },
    };
    expect(() => defaultKillTreeSync(1, 'win32', io)).not.toThrow();
    expect(() => defaultKillTreeSync(1, 'darwin', io)).not.toThrow();
  });
});
