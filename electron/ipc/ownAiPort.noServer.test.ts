/**
 * "저장 통로가 못 떴으면 아예 실행하지 않는다" — 계획서 §4 의 마지막 안전 계약.
 *
 * ★왜 이게 중요한가: 오른쪽 AI 패널은 쓰기가 열려 있을 수 있다. 그 상태에서 앱 안의
 * loopback 서버가 못 뜨면, 동봉 브릿지는 "앱이 꺼져 있다"고 판단해 **파일에 직접 쓴다** —
 * 미리보기도, [실행] 카드도 없이. 그래서 그런 상태에서는 CLI 를 띄우지도 않는다.
 *
 * ★생기부 초안(kind:'draft')은 도구를 안 쓰므로 이 조건과 무관하다. 서버가 없어도 돌아간다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  ipcHandlers: new Map<string, (...a: unknown[]) => unknown>(),
  ipcListeners: new Map<string, (...a: unknown[]) => unknown>(),
  sent: [] as { channel: string; payload: unknown }[],
  /** 러너가 실제로 CLI 를 띄우려 한 요청들. 비어 있으면 "실행 안 함". */
  started: [] as Record<string, unknown>[],
  readiness: { needsServer: true, ready: true },
}));

vi.mock('electron', () => ({
  ipcMain: {
    on: (ch: string, fn: (...a: unknown[]) => unknown) => h.ipcListeners.set(ch, fn),
    handle: (ch: string, fn: (...a: unknown[]) => unknown) => h.ipcHandlers.set(ch, fn),
    removeHandler: () => undefined,
  },
  app: { isPackaged: false, getAppPath: () => 'E:\\app', getPath: () => 'E:\\data' },
}));

vi.mock('../dataRoot', () => ({ getContentRoot: () => 'E:\\data' }));

vi.mock('./ownAiRunner', () => ({
  createOwnAiRunner: () => ({
    start: (req: Record<string, unknown>) => {
      h.started.push(req);
      return { ok: true };
    },
    cancel: () => undefined,
    cancelAllSync: () => undefined,
    ownAiActiveUntil: () => 0,
  }),
  defaultKillTreeSync: () => undefined,
}));

// CLI 는 이 테스트의 관심이 아니다 — 찾지 못한 것으로 두고, 실행 여부만 본다.
vi.mock('./ownAiCli', () => ({
  defaultCliDeps: () => ({}),
  inspectConnection: () => ({ provider: 'claude', state: 'not-installed' }),
  loginArgs: () => [],
  logoutArgs: () => [],
  resolveCliLaunch: () => null,
  readVersion: () => null,
}));

import { registerOwnAiHandlers } from './ownAi';

function fakeWindow() {
  return {
    isDestroyed: () => false,
    webContents: {
      send: (channel: string, payload: unknown) => h.sent.push({ channel, payload }),
    },
  } as unknown as import('electron').BrowserWindow;
}

beforeEach(() => {
  h.ipcHandlers.clear();
  h.ipcListeners.clear();
  h.sent.length = 0;
  h.started.length = 0;
  h.readiness = { needsServer: true, ready: true };

  registerOwnAiHandlers({
    getMainWindow: () => fakeWindow(),
    ensureLiveSyncServer: async () => h.readiness,
  });
});

async function run(kind: 'panel' | 'draft') {
  const fn = h.ipcHandlers.get('ownAi:run');
  expect(fn).toBeTruthy();
  return (await fn!(
    {},
    {
      runId: 'r1',
      provider: 'claude',
      kind,
      prompt: '오늘 우리 반 출결',
    },
  )) as { ok: boolean; reason?: string };
}

/** 화면으로 흘러간 오류 이벤트. */
function errors(): unknown[] {
  return h.sent
    .filter((s) => s.channel === 'ownAi:event')
    .map((s) => s.payload)
    .filter((p) => (p as { type?: string }).type === 'error');
}

describe('패널 실행 — 저장 통로가 필요한데 못 떴을 때', () => {
  it('★CLI 를 띄우지 않는다 — 띄우면 브릿지가 파일에 직접 쓴다', async () => {
    h.readiness = { needsServer: true, ready: false };

    const r = await run('panel');

    expect(r).toEqual({ ok: false, reason: 'write-server-unavailable' });
    expect(h.started).toHaveLength(0);
  });

  it('왜 안 되는지 화면에 알린다 — 아무 반응 없이 끝나면 안 된다', async () => {
    h.readiness = { needsServer: true, ready: false };

    await run('panel');

    expect(errors()).toEqual([{ type: 'error', runId: 'r1', kind: 'write-server-unavailable' }]);
  });

  it('통로가 떴으면 그대로 실행한다', async () => {
    h.readiness = { needsServer: true, ready: true };

    const r = await run('panel');

    expect(r).toEqual({ ok: true });
    expect(h.started).toHaveLength(1);
  });

  it('쓰기가 꺼져 있어 통로가 필요 없으면 실행한다 — 조회만 하는 선생님을 막지 않는다', async () => {
    h.readiness = { needsServer: false, ready: false };

    const r = await run('panel');

    expect(r).toEqual({ ok: true });
    expect(h.started).toHaveLength(1);
  });
});

describe('생기부 초안 실행', () => {
  it('★저장 통로와 무관하게 돌아간다 — 초안은 도구를 쓰지 않는다', async () => {
    h.readiness = { needsServer: true, ready: false };

    const r = await run('draft');

    expect(r).toEqual({ ok: true });
    expect(h.started).toHaveLength(1);
    expect(errors()).toEqual([]);
  });

  it('초안에는 브릿지 통로를 붙이지 않는다 — 도구가 아예 없어야 한다', async () => {
    await run('draft');

    const req = h.started[0] ?? {};
    expect(req['mcpConfigPath']).toBeUndefined();
    expect(req['bridge']).toBeUndefined();
  });
});
