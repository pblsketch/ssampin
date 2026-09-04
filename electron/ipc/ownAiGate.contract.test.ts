/**
 * 쓰기 게이트 계약 — "선생님이 [실행]을 누르기 전에는 저장되지 않는다"를 고정한다.
 *
 * ★이 파일이 지키는 불변식(ADR-082 C3′). 깨지면 학생 기록이 카드 없이 바뀐다:
 *
 * 1. "내 AI로 실행" 활성 중에 온 쓰기는 렌더러로 **위임되지 않고** 409 로 즉시 돌아온다.
 * 2. 끝난 뒤 15초(유예창) 안에 온 늦은 쓰기도 여전히 409 다.
 * 3. 유예창이 지나면 원래 경로로 돌아간다 — 영원히 막히면 다른 AI 앱이 못 쓴다.
 * 4. 애초에 허용되지 않은 도메인은 활성 중에도 403 이다(카드조차 띄우지 않는다).
 * 5. 서버 생존 조건에 **채점(allowGradeWrite)** 이 들어 있다 — 채점 쓰기는 loopback 을
 *    거치지 않고 앱이 없을 때 파일에 직접 쓰므로, 서버가 떠 있어야 브릿지가 거부한다.
 *
 * electron·http 서버는 mock 하고 `applyWrite` 델리게이트를 직접 부른다
 * (`aiBridgeLiveSyncHost.test.ts` 와 같은 방식).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {
  OWN_AI_ACTIVE_GRACE_MS,
  OWN_AI_WRITE_PENDING_STATUS,
  graceUntil,
} from '../../src/domain/rules/ownAiWriteGate';

const h = vi.hoisted(() => ({
  ipcHandlers: new Map<string, (...a: unknown[]) => unknown>(),
  ipcListeners: new Map<string, (...a: unknown[]) => unknown>(),
  sent: [] as { channel: string; payload: unknown }[],
  startCalls: 0,
  startShouldFail: false,
  state: {
    applyWrite: null as
      | null
      | ((req: unknown) => Promise<{ ok: boolean; status?: number; error?: string }>),
  },
}));

vi.mock('electron', () => ({
  ipcMain: {
    on: (ch: string, fn: (...a: unknown[]) => unknown) => h.ipcListeners.set(ch, fn),
    handle: (ch: string, fn: (...a: unknown[]) => unknown) => h.ipcHandlers.set(ch, fn),
    removeHandler: () => undefined,
  },
}));

vi.mock('./aiBridgeLiveSync', () => ({
  startLiveSyncServer: async (opts: { applyWrite: (req: unknown) => Promise<unknown> }) => {
    h.startCalls += 1;
    if (h.startShouldFail) throw new Error('listen 실패');
    h.state.applyWrite = opts.applyWrite as typeof h.state.applyWrite;
    return { port: 1234, token: 'tok', stop: async () => undefined };
  },
}));

import { registerLiveSyncHost } from './aiBridgeLiveSyncHost';
import { writeCapability, type Capability } from './aiBridgeLiveSyncCore';

let dir: string;
let activeUntil = 0;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'own-ai-gate-'));
  h.state.applyWrite = null;
  h.ipcHandlers.clear();
  h.ipcListeners.clear();
  h.sent.length = 0;
  h.startCalls = 0;
  h.startShouldFail = false;
  activeUntil = 0;
});

function caps(p: Partial<Capability>): Capability {
  return {
    allowWrite: false,
    allowContent: false,
    allowGradeWrite: false,
    allowRecordWrite: false,
    updatedAt: 1,
    ...p,
  };
}

/** 렌더러 창 대역 — 무엇이 보내졌는지 기록만 한다. */
function fakeWindow() {
  return {
    isDestroyed: () => false,
    webContents: {
      send: (channel: string, payload: unknown) => h.sent.push({ channel, payload }),
    },
  } as unknown as import('electron').BrowserWindow;
}

function host() {
  return registerLiveSyncHost({
    getMainWindow: () => fakeWindow(),
    dataDir: dir,
    ownAiActiveUntil: () => activeUntil,
  });
}

const TODO_WRITE = {
  domain: 'todos',
  op: 'create',
  idempotencyKey: 'k1',
  data: { text: '가정통신문 정리' },
};

/** 위임(`aiBridge:apply-write`) 이 몇 번 갔는가 — 0 이면 저장 시도조차 없었다는 뜻. */
function delegations(): number {
  return h.sent.filter((s) => s.channel === 'aiBridge:apply-write').length;
}
function proposals(): { channel: string; payload: unknown }[] {
  return h.sent.filter((s) => s.channel === 'ownAi:write-proposal');
}

describe('활성 중에는 저장하지 않고 제안만 남긴다', () => {
  it('★[실행] 없이는 렌더러로 위임되지 않는다 — 409 로 즉시 돌아온다', async () => {
    writeCapability(dir, caps({ allowWrite: true }));
    host();
    await new Promise((r) => setTimeout(r, 0)); // 부팅 자동 시작 대기
    activeUntil = Number.POSITIVE_INFINITY;

    const res = await h.state.applyWrite?.(TODO_WRITE);

    expect(res?.ok).toBe(false);
    expect(res?.status).toBe(OWN_AI_WRITE_PENDING_STATUS);
    expect(delegations()).toBe(0);
    expect(proposals()).toHaveLength(1);
  });

  it('제안에 요청 원문과 출처가 실려 카드를 그릴 수 있다', async () => {
    writeCapability(dir, caps({ allowWrite: true }));
    host();
    await new Promise((r) => setTimeout(r, 0));
    activeUntil = Number.POSITIVE_INFINITY;

    await h.state.applyWrite?.(TODO_WRITE);

    const p = proposals()[0]?.payload as {
      proposalId?: string;
      request?: { idempotencyKey?: string };
      source?: string;
    };
    expect(typeof p?.proposalId).toBe('string');
    expect(p?.request?.idempotencyKey).toBe('k1');
    // 어느 AI 앱이 보냈는지 아직 못 가른다 — 카드에 그렇게 적어야 한다.
    expect(p?.source).toBe('unknown');
  });

  it('모델이 다시 시도하지 말라는 문구를 함께 돌려준다', async () => {
    writeCapability(dir, caps({ allowWrite: true }));
    host();
    await new Promise((r) => setTimeout(r, 0));
    activeUntil = Number.POSITIVE_INFINITY;

    const res = await h.state.applyWrite?.(TODO_WRITE);
    expect(res?.error).toContain('승인');
    expect(res?.error).toContain('다시 시도하지 마세요');
  });
});

describe('유예창 — 끝난 직후의 늦은 쓰기', () => {
  it('★close 후 14초에 온 쓰기도 409 다 — 브릿지는 12초까지 늦게 도착할 수 있다', async () => {
    writeCapability(dir, caps({ allowWrite: true }));
    host();
    await new Promise((r) => setTimeout(r, 0));

    const closedAt = Date.now();
    activeUntil = graceUntil(closedAt); // 실행이 방금 끝났다
    const res = await h.state.applyWrite?.(TODO_WRITE);

    expect(res?.status).toBe(OWN_AI_WRITE_PENDING_STATUS);
    expect(delegations()).toBe(0);
    expect(OWN_AI_ACTIVE_GRACE_MS).toBeGreaterThan(12_000);
  });

  it('★유예창이 지나면 원래 경로로 돌아간다 — 영원히 막히면 다른 AI 앱을 쓸 수 없다', async () => {
    writeCapability(dir, caps({ allowWrite: true }));
    host();
    await new Promise((r) => setTimeout(r, 0));

    activeUntil = Date.now() - 1; // 이미 지났다
    void h.state.applyWrite?.(TODO_WRITE);
    await new Promise((r) => setTimeout(r, 0));

    expect(delegations()).toBe(1);
    expect(proposals()).toHaveLength(0);
  });

  it('활성값이 없으면(기존 동작) 그대로 위임한다', async () => {
    writeCapability(dir, caps({ allowWrite: true }));
    registerLiveSyncHost({ getMainWindow: () => fakeWindow(), dataDir: dir });
    await new Promise((r) => setTimeout(r, 0));

    void h.state.applyWrite?.(TODO_WRITE);
    await new Promise((r) => setTimeout(r, 0));

    expect(delegations()).toBe(1);
  });
});

describe('도메인 게이트가 먼저다', () => {
  it('★허용되지 않은 도메인은 활성 중에도 403 — 카드조차 띄우지 않는다', async () => {
    // 생기부 쓰기는 꺼 두고 일반 쓰기만 켠다
    writeCapability(dir, caps({ allowWrite: true, allowRecordWrite: false }));
    host();
    await new Promise((r) => setTimeout(r, 0));
    activeUntil = Number.POSITIVE_INFINITY;

    const res = await h.state.applyWrite?.({
      domain: 'recordDrafts',
      op: 'create',
      idempotencyKey: 'k9',
      data: {},
    });

    expect(res?.status).toBe(403);
    expect(proposals()).toHaveLength(0);
    expect(delegations()).toBe(0);
  });
});

describe('서버 생존 조건 — 채점을 빠뜨리면 파일이 직접 쓰인다', () => {
  it('★채점만 켜도 서버가 뜬다', async () => {
    writeCapability(dir, caps({ allowGradeWrite: true }));
    const hst = host();
    const readiness = await hst.ensureServer();

    expect(readiness.needsServer).toBe(true);
    expect(readiness.ready).toBe(true);
  });

  it('생기부 쓰기만 켜도 서버가 뜬다', async () => {
    writeCapability(dir, caps({ allowRecordWrite: true }));
    const readiness = await host().ensureServer();
    expect(readiness).toEqual({ needsServer: true, ready: true });
  });

  it('전부 꺼져 있으면 서버가 필요 없다 — 브릿지가 호출마다 거부한다', async () => {
    writeCapability(dir, caps({}));
    const readiness = await host().ensureServer();
    expect(readiness.needsServer).toBe(false);
  });

  it('★서버를 못 띄우면 ready:false 를 준다 — 러너는 이걸 보고 실행하지 않는다', async () => {
    h.startShouldFail = true;
    writeCapability(dir, caps({ allowWrite: true }));
    const readiness = await host().ensureServer();
    expect(readiness).toEqual({ needsServer: true, ready: false });
  });

  it('★ensureServer 는 직접 시작한다 — 부팅 때 실패해도 [다시 시도]가 살아난다', async () => {
    // 부팅 시 실패시킨 뒤, 이어서 성공하게 바꾸고 다시 부른다
    h.startShouldFail = true;
    writeCapability(dir, caps({ allowWrite: true }));
    const hst = host();
    await new Promise((r) => setTimeout(r, 0));
    expect((await hst.ensureServer()).ready).toBe(false);

    h.startShouldFail = false;
    const retry = await hst.ensureServer();
    expect(retry.ready).toBe(true);
  });
});
