import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {
  startLiveSyncServer,
  type ApplyWriteResult,
  type LiveSyncServerHandle,
} from './aiBridgeLiveSync';
import { readControlFile, type ApplyWriteRequest } from './aiBridgeLiveSyncCore';

let dir: string;
let handle: LiveSyncServerHandle | null = null;
let received: ApplyWriteRequest[] = [];
let nextResult: ApplyWriteResult = { ok: true, ref: 'ref-1' };

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sab-ls-srv-'));
  received = [];
  nextResult = { ok: true, ref: 'ref-1' };
});
afterEach(async () => {
  if (handle) await handle.stop();
  handle = null;
});

async function start(): Promise<LiveSyncServerHandle> {
  handle = await startLiveSyncServer({
    dataDir: dir,
    heartbeatMs: 60_000,
    applyWrite: async (req) => {
      received.push(req);
      return nextResult;
    },
  });
  return handle;
}

interface Resp {
  status: number;
  body: unknown;
}
function request(
  port: number,
  opts: { method?: string; token?: string; origin?: string; body?: string },
): Promise<Resp> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (opts.token !== undefined) headers['x-ssampin-token'] = opts.token;
    if (opts.origin !== undefined) headers['origin'] = opts.origin;
    const req = http.request(
      { host: '127.0.0.1', port, method: opts.method ?? 'POST', path: '/', headers },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let body: unknown = data;
          try {
            body = JSON.parse(data);
          } catch {
            /* leave as text */
          }
          resolve({ status: res.statusCode ?? 0, body });
        });
      },
    );
    req.on('error', reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

const validBody = JSON.stringify({
  domain: 'todos',
  op: 'create',
  idempotencyKey: 'k1',
  data: { text: '시험지 인쇄' },
});

describe('startLiveSyncServer (loopback)', () => {
  it('127.0.0.1 에 listen + control.json 에 port/token/pid/heartbeat 기록', async () => {
    const h = await start();
    expect(h.port).toBeGreaterThan(0);
    const control = readControlFile(dir);
    expect(control?.port).toBe(h.port);
    expect(control?.token).toBe(h.token);
    expect(control?.pid).toBe(process.pid);
    expect(typeof control?.heartbeatAt).toBe('number');
  });

  it('유효 토큰 POST → 델리게이트 호출 + 200 + 결과', async () => {
    const h = await start();
    const res = await request(h.port, { token: h.token, body: validBody });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, ref: 'ref-1' });
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ domain: 'todos', op: 'create', idempotencyKey: 'k1' });
  });

  it('토큰 없음 → 401, 델리게이트 미호출', async () => {
    const h = await start();
    const res = await request(h.port, { body: validBody });
    expect(res.status).toBe(401);
    expect(received).toHaveLength(0);
  });

  it('GET → 405', async () => {
    const h = await start();
    expect((await request(h.port, { method: 'GET', token: h.token })).status).toBe(405);
  });

  it('Origin 헤더 있는 POST → 403 (브라우저 차단)', async () => {
    const h = await start();
    const res = await request(h.port, {
      token: h.token,
      origin: 'http://evil.local',
      body: validBody,
    });
    expect(res.status).toBe(403);
    expect(received).toHaveLength(0);
  });

  it('깨진 JSON → 400, 잘못된 도메인 → 400', async () => {
    const h = await start();
    expect((await request(h.port, { token: h.token, body: '{bad' })).status).toBe(400);
    const badDomain = JSON.stringify({
      domain: 'students',
      op: 'create',
      idempotencyKey: 'k',
      data: {},
    });
    expect((await request(h.port, { token: h.token, body: badDomain })).status).toBe(400);
    expect(received).toHaveLength(0);
  });

  it('델리게이트가 충돌(ok:false,status:409) 반환 → 409', async () => {
    const h = await start();
    nextResult = { ok: false, status: 409, error: '충돌' };
    expect((await request(h.port, { token: h.token, body: validBody })).status).toBe(409);
  });

  it('stop() 후 control.json 제거', async () => {
    const h = await start();
    await h.stop();
    handle = null;
    expect(readControlFile(dir)).toBeNull();
  });
});
