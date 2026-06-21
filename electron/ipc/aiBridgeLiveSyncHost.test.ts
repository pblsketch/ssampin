/**
 * AI 브릿지 live-sync 호스트(main process 배선) 단위 테스트 — 매 요청 capability 재확인(#4) +
 * 호스트 멱등 dedup 의 내용 결합(#7).
 *
 * electron(ipcMain/BrowserWindow)과 http 서버는 mock 하고, host 의 applyWrite 델리게이트를 캡처해
 * 직접 호출한다(서버를 띄우지 않고 게이트·멱등 로직만 검증).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

// hoisted 공유 상태 — mock 팩토리가 참조한다.
const h = vi.hoisted(() => ({
  ipcHandlers: new Map<string, (...a: unknown[]) => unknown>(),
  ipcListeners: new Map<string, (...a: unknown[]) => unknown>(),
  state: {
    applyWrite: null as
      | null
      | ((req: unknown) => Promise<{ ok: boolean; status?: number; ref?: string }>),
  },
}));

vi.mock('electron', () => ({
  ipcMain: {
    on: (ch: string, fn: (...a: unknown[]) => unknown) => h.ipcListeners.set(ch, fn),
    handle: (ch: string, fn: (...a: unknown[]) => unknown) => h.ipcHandlers.set(ch, fn),
    removeHandler: () => undefined,
  },
}));

// startLiveSyncServer mock — applyWrite 델리게이트를 캡처하고 가짜 핸들을 돌려준다.
vi.mock('./aiBridgeLiveSync', () => ({
  startLiveSyncServer: async (opts: { applyWrite: (req: unknown) => Promise<unknown> }) => {
    h.state.applyWrite = opts.applyWrite as typeof h.state.applyWrite;
    return { port: 1234, token: 'tok', stop: async () => undefined };
  },
}));

import { registerLiveSyncHost } from './aiBridgeLiveSyncHost';
import { writeCapability, type Capability } from './aiBridgeLiveSyncCore';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sab-host-'));
  h.state.applyWrite = null;
  h.ipcHandlers.clear();
  h.ipcListeners.clear();
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

/** 렌더러 응답을 흉내내는 가짜 메인 창 — apply-write 수신 시 result 리스너를 다음 틱에 호출. */
function fakeWindow(respond: (req: { idempotencyKey: string }) => { ok: boolean; ref?: string }) {
  return {
    isDestroyed: () => false,
    webContents: {
      send: (ch: string, payload: { requestId: string; req: { idempotencyKey: string } }) => {
        if (ch !== 'aiBridge:apply-write') return;
        const listener = h.ipcListeners.get('aiBridge:apply-write-result');
        const result = respond(payload.req);
        queueMicrotask(() => listener?.({}, { requestId: payload.requestId, result }));
      },
    },
  };
}

describe('registerLiveSyncHost — #4 매 요청 capability 재확인', () => {
  it('서버가 떠 있어도(allowRecordWrite ON) allowWrite=false 면 todos 쓰기 403', async () => {
    // 서버는 allowWrite || allowRecordWrite 면 뜬다 → 생기부만 켜도 서버 가동. 그래도 todos 는 막아야 한다.
    writeCapability(dir, caps({ allowRecordWrite: true }));
    const host = registerLiveSyncHost({ getMainWindow: () => null, dataDir: dir });
    await vi.waitFor(() => expect(h.state.applyWrite).not.toBeNull());
    const res = await h.state.applyWrite!({
      domain: 'todos',
      op: 'create',
      idempotencyKey: 'k',
      data: { text: 'x' },
    });
    expect(res).toMatchObject({ ok: false, status: 403 });
    await host.stop();
  });

  it('토글을 끄면(파일 갱신) 매 요청 새로 읽어 즉시 차단', async () => {
    writeCapability(dir, caps({ allowWrite: true }));
    const win = fakeWindow((req) => ({ ok: true, ref: req.idempotencyKey }));
    const host = registerLiveSyncHost({ getMainWindow: () => win as never, dataDir: dir });
    await vi.waitFor(() => expect(h.state.applyWrite).not.toBeNull());
    // 켜진 상태: 통과
    expect(
      (
        await h.state.applyWrite!({
          domain: 'todos',
          op: 'create',
          idempotencyKey: 'a',
          data: { text: 'x' },
        })
      ).ok,
    ).toBe(true);
    // 파일에서 토글 OFF → 매 요청 readCapability 재확인이라 즉시 403
    writeCapability(dir, caps({ allowWrite: false }));
    expect(
      await h.state.applyWrite!({
        domain: 'todos',
        op: 'create',
        idempotencyKey: 'b',
        data: { text: 'y' },
      }),
    ).toMatchObject({ ok: false, status: 403 });
    await host.stop();
  });
});

describe('registerLiveSyncHost — #7 호스트 멱등 dedup 내용 결합', () => {
  it('같은 키+같은 내용은 두 번째를 렌더러로 안 보냄 / 같은 키+다른 내용은 보냄', async () => {
    writeCapability(dir, caps({ allowWrite: true }));
    let sends = 0;
    const win = fakeWindow((req) => {
      sends++;
      return { ok: true, ref: req.idempotencyKey };
    });
    const host = registerLiveSyncHost({ getMainWindow: () => win as never, dataDir: dir });
    await vi.waitFor(() => expect(h.state.applyWrite).not.toBeNull());
    const aw = h.state.applyWrite!;

    await aw({ domain: 'todos', op: 'create', idempotencyKey: 'k', data: { text: 'A' } });
    await aw({ domain: 'todos', op: 'create', idempotencyKey: 'k', data: { text: 'A' } }); // 같은 내용 → dedup
    expect(sends).toBe(1);
    await aw({ domain: 'todos', op: 'create', idempotencyKey: 'k', data: { text: 'B' } }); // 다른 내용 → 보냄(삼키지 않음)
    expect(sends).toBe(2);
    await host.stop();
  });
});
