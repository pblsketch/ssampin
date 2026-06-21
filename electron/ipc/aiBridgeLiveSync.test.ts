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
import { readControlFile, writeControlFile, type ApplyWriteRequest } from './aiBridgeLiveSyncCore';

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

describe('startLiveSyncServer — 보안·정합성 회귀(#3·#6·#9)', () => {
  it('#3 stop(): listen 중에는 control 유지 → server.close 후에만 제거', async () => {
    const h = await start();
    expect(readControlFile(dir)).not.toBeNull();
    const stopping = h.stop();
    // 동기 시점(server.close 콜백 이전): control 이 아직 남아있어야 한다.
    // 버그 버전은 removeControlFile 를 server.close 보다 '먼저' 동기 호출 → 이 시점에 이미 null.
    expect(readControlFile(dir)).not.toBeNull();
    await stopping;
    handle = null;
    expect(readControlFile(dir)).toBeNull();
  });

  it('#3 재시작 레이스: 새 서버(다른 token)가 control 을 소유하면 이전 stop 이 지우지 않음', async () => {
    const h1 = await start(); // 서버1 — control=token1
    const ctrl = readControlFile(dir)!;
    // off→on 으로 새 서버가 떠 control 을 자기 token 으로 덮어쓴 상황을 모사.
    writeControlFile(dir, { ...ctrl, token: 'NEW-SERVER-TOKEN' });
    await h1.stop(); // 서버1 종료 — 자기 token 이 아니므로 새 서버 control 을 지우면 안 됨
    handle = null;
    expect(readControlFile(dir)?.token).toBe('NEW-SERVER-TOKEN'); // 새 서버 control 보존
  });

  it('#6 한글·이모지 본문이 손상 없이 파싱됨(end 에서 1회 decode)', async () => {
    const h = await start();
    const text = '한글 테스트 ✅ 이모지 🎒 까지 — 청크 경계 무손상';
    const res = await request(h.port, {
      token: h.token,
      body: JSON.stringify({ domain: 'todos', op: 'create', idempotencyKey: 'k1', data: { text } }),
    });
    expect(res.status).toBe(200);
    expect(received).toHaveLength(1);
    expect((received[0] as ApplyWriteRequest).data['text']).toBe(text);
  });

  it('#6 글자수는 한도 미만이어도 바이트 초과면 거부(413 또는 연결 끊김)', async () => {
    const h = await start();
    // '가' 30,000자 = 30,000 < 65,536(글자수) 이지만 90,000바이트 > 64KB(바이트 한도).
    // 글자수로 비교하던 버그는 통과시켜 #5 의 400(text>500)을 돌려준다 — 413/reset 이 아님.
    const big = '가'.repeat(30_000);
    const body = JSON.stringify({
      domain: 'todos',
      op: 'create',
      idempotencyKey: 'k',
      data: { text: big },
    });
    const result = await new Promise<{ status: number; reset: boolean }>((resolve) => {
      let settled = false;
      const done = (v: { status: number; reset: boolean }): void => {
        if (!settled) {
          settled = true;
          resolve(v);
        }
      };
      const data = Buffer.from(body, 'utf-8');
      const req = http.request(
        {
          host: '127.0.0.1',
          port: h.port,
          method: 'POST',
          path: '/',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length,
            'x-ssampin-token': h.token,
          },
        },
        (res) => {
          res.on('data', () => {});
          res.on('end', () => done({ status: res.statusCode ?? 0, reset: false }));
        },
      );
      req.on('error', () => done({ status: 0, reset: true }));
      req.end(data);
    });
    expect(result.status === 413 || result.reset).toBe(true);
    expect(received).toHaveLength(0);
  });

  it('#9 Origin: null 도 거부 → 403', async () => {
    const h = await start();
    const res = await request(h.port, { token: h.token, origin: 'null', body: validBody });
    expect(res.status).toBe(403);
    expect(received).toHaveLength(0);
  });
});
