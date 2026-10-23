/**
 * 내 API 키 IPC — ★어떤 통로의 응답에도 키 원문이 실리지 않는다.
 *
 * 금고는 실제 파일(임시 폴더), 서비스는 가짜 fetch 다. 모든 통로를 실제로 불러 응답을 훑는다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { IpcMainInvokeEvent } from 'electron';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerApiKeyHandlers } from './apiKey';
import { createApiKeyClient, type FetchLike } from './apiKeyClient';
import { createApiKeyVault } from './apiKeyVault';

const KEY = 'AIzaSyD-handler-secret-0123456789abcdefgh';
type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

let dir = '';
let trusted = true;
let handlers = new Map<string, Handler>();
let fetchCalls: { url: string; init: RequestInit }[] = [];
let responder: (url: string, init: RequestInit) => Response | Promise<Response>;
const opened: string[] = [];
const clipboardCleared: string[] = [];
let clock = Date.parse('2026-10-24T03:00:00Z');

const EVENT = {} as IpcMainInvokeEvent;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

async function call(channel: string, ...args: unknown[]): Promise<unknown> {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`핸들러 없음: ${channel}`);
  return await fn(EVENT, ...args);
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'byok-ipc-'));
  trusted = true;
  handlers = new Map();
  fetchCalls = [];
  opened.length = 0;
  clipboardCleared.length = 0;
  clock = Date.parse('2026-10-24T03:00:00Z');
  responder = (url) =>
    url.endsWith('/models')
      ? json(200, {
          data: [{ id: 'models/gemini-flash-latest' }, { id: 'models/gemini-2.5-flash' }],
        })
      : json(200, { choices: [{ message: { content: '안녕하세요' } }] });
  const fetch: FetchLike = async (url, init) => {
    fetchCalls.push({ url, init });
    return responder(url, init);
  };
  registerApiKeyHandlers({
    vault: createApiKeyVault({
      dir,
      encryptionAvailable: () => true,
      encrypt: (s) => Buffer.from(`ENC:${Buffer.from(s).toString('base64')}`),
      decrypt: (b) => Buffer.from(b.toString().slice(4), 'base64').toString(),
    }),
    client: createApiKeyClient({ fetch, userAgent: 'ssampin/test' }),
    isTrustedSender: () => trusted,
    openExternal: async (url) => {
      opened.push(url);
    },
    handle: (channel, fn) => handlers.set(channel, fn),
    clearClipboardIfHolds: (key) => clipboardCleared.push(key),
    now: () => clock,
  });
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('키는 화면으로 돌아가지 않는다', () => {
  it('모든 통로의 응답에 키 원문·앞부분이 없다', async () => {
    const results: unknown[] = [];
    results.push(await call('apiKey:save', 'gemini', `  "${KEY}"\n`));
    results.push(await call('apiKey:status'));
    results.push(await call('apiKey:models', 'gemini', true));
    results.push(await call('apiKey:setActive', 'gemini', 'models/gemini-2.5-flash'));
    results.push(
      await call('apiKey:chat', {
        requestId: 'r1',
        purpose: 'panel',
        messages: [{ role: 'user', content: '안녕' }],
      }),
    );
    results.push(await call('apiKey:cancel', 'r1'));
    results.push(await call('apiKey:openKeyPage', 'gemini'));
    results.push(await call('apiKey:remove', 'gemini'));
    const all = JSON.stringify(results);
    expect(all).not.toContain(KEY);
    expect(all).not.toContain(KEY.slice(0, 16));
    expect(all).not.toContain(KEY.slice(-16));
  });

  it('키는 정해진 서비스 주소로만 나간다', async () => {
    await call('apiKey:save', 'gemini', KEY);
    await call('apiKey:chat', {
      requestId: 'r2',
      purpose: 'draft',
      messages: [{ role: 'user', content: '초안' }],
    });
    for (const c of fetchCalls) {
      expect(new URL(c.url).hostname).toBe('generativelanguage.googleapis.com');
    }
  });
});

describe('저장', () => {
  it('붙여 넣기 군더더기를 걷고, 확인 뒤 저장하고, 추천 모델을 고른다', async () => {
    const r = (await call('apiKey:save', 'gemini', `GEMINI_API_KEY=${KEY}`)) as {
      ok: boolean;
      status: { active: { service: string; model: string } | null };
      models: { id: string }[];
    };
    expect(r.ok).toBe(true);
    expect(r.status.active).toEqual({ service: 'gemini', model: 'models/gemini-flash-latest' });
    expect(r.models[0]?.id).toBe('models/gemini-flash-latest');
    const auth = (fetchCalls[0]?.init.headers as Record<string, string>).Authorization;
    expect(auth).toBe(`Bearer ${KEY}`);
  });

  it('★다른 서비스 키 모양이면 **보내지 않고** 알려 준다 — 키가 엉뚱한 회사로 가지 않는다', async () => {
    const r = await call('apiKey:save', 'openrouter', KEY);
    expect(r).toEqual({ ok: false, reason: 'key-invalid', looksLike: 'gemini' });
    expect(fetchCalls).toHaveLength(0);
  });

  it('서비스가 거절하면 저장하지 않는다', async () => {
    responder = () => new Response('{"error":{"message":"API key not valid"}}', { status: 400 });
    expect(await call('apiKey:save', 'gemini', KEY)).toEqual({ ok: false, reason: 'key-invalid' });
    const status = (await call('apiKey:status')) as { services: { configured: boolean }[] };
    expect(status.services.every((s) => !s.configured)).toBe(true);
  });

  it('저장에 성공하면 클립보드에 남은 그 키를 비우게 한다', async () => {
    await call('apiKey:save', 'gemini', `"${KEY}"`);
    expect(clipboardCleared).toEqual([KEY]);
  });

  it('입력이 이상하면 서비스에 묻지도 않는다', async () => {
    expect(await call('apiKey:save', 'gemini', '키 붙여넣기')).toEqual({
      ok: false,
      reason: 'invalid-chars',
    });
    expect(fetchCalls).toHaveLength(0);
  });
});

describe('대화', () => {
  beforeEach(async () => {
    await call('apiKey:save', 'gemini', KEY);
    fetchCalls = [];
  });

  it('고른 모델로 보내고, 서비스·모델을 함께 돌려준다', async () => {
    const r = await call('apiKey:chat', {
      requestId: 'a',
      purpose: 'panel',
      messages: [
        { role: 'system', content: '지시' },
        { role: 'user', content: '질문' },
      ],
      tools: [
        {
          type: 'function',
          function: { name: 'get_events', description: '일정', parameters: { type: 'object' } },
        },
      ],
    });
    expect(r).toEqual({
      ok: true,
      text: '안녕하세요',
      toolCalls: [],
      service: 'gemini',
      model: 'models/gemini-flash-latest',
    });
    const body = JSON.parse(String(fetchCalls[0]?.init.body)) as {
      model: string;
      tools: unknown[];
    };
    expect(body.model).toBe('models/gemini-flash-latest');
    expect(body.tools).toHaveLength(1);
  });

  it.each([
    [
      '역할이 이상한 대화',
      { requestId: 'b', purpose: 'panel', messages: [{ role: 'tool', content: 'x' }] },
    ],
    [
      '마지막이 assistant',
      { requestId: 'b', purpose: 'panel', messages: [{ role: 'assistant', content: 'x' }] },
    ],
    ['갈래 없음', { requestId: 'b', messages: [{ role: 'user', content: 'x' }] }],
    [
      'id 에 이상한 글자',
      { requestId: '../x', purpose: 'panel', messages: [{ role: 'user', content: 'x' }] },
    ],
    [
      '너무 긴 대화',
      {
        requestId: 'b',
        purpose: 'panel',
        messages: [{ role: 'user', content: 'x'.repeat(400_001) }],
      },
    ],
    [
      '도구 이름이 이상함',
      {
        requestId: 'b',
        purpose: 'panel',
        messages: [{ role: 'user', content: 'x' }],
        tools: [{ type: 'function', function: { name: 'a b', description: '', parameters: {} } }],
      },
    ],
  ])('%s → 보내지 않는다', async (_label, payload) => {
    const r = await call('apiKey:chat', payload);
    expect(r).toEqual({ ok: false, reason: 'key-provider-error' });
    expect(fetchCalls).toHaveLength(0);
  });

  it('키를 지운 뒤에는 key-missing', async () => {
    await call('apiKey:remove', 'gemini');
    expect(
      await call('apiKey:chat', {
        requestId: 'c',
        purpose: 'panel',
        messages: [{ role: 'user', content: 'x' }],
      }),
    ).toEqual({ ok: false, reason: 'key-missing' });
  });

  it('[중단]하면 cancelled 로 끝난다', async () => {
    responder = (_u, init) =>
      new Promise<Response>((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const pending = call('apiKey:chat', {
      requestId: 'long',
      purpose: 'draft',
      messages: [{ role: 'user', content: 'x' }],
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(await call('apiKey:cancel', 'long')).toBe(true);
    expect(await pending).toEqual({ ok: false, reason: 'cancelled' });
  });

  it('동시에 3개를 넘으면 busy', async () => {
    responder = (_u, init) =>
      new Promise<Response>((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const msg = { purpose: 'panel', messages: [{ role: 'user', content: 'x' }] };
    const p = [1, 2, 3].map((i) => call('apiKey:chat', { ...msg, requestId: `p${i}` }));
    await new Promise((r) => setTimeout(r, 5));
    expect(await call('apiKey:chat', { ...msg, requestId: 'p4' })).toEqual({
      ok: false,
      reason: 'busy',
    });
    for (const i of [1, 2, 3]) await call('apiKey:cancel', `p${i}`);
    await Promise.all(p);
  });
});

describe('돈이 새지 않게', () => {
  beforeEach(async () => {
    await call('apiKey:save', 'gemini', KEY);
  });
  const msg = { purpose: 'panel', messages: [{ role: 'user', content: 'x' }] };

  it('분당 30회를 넘으면 key-rate-limited — 1분 지나면 풀린다', async () => {
    for (let i = 0; i < 30; i += 1) {
      expect(await call('apiKey:chat', { ...msg, requestId: `m${i}` })).toMatchObject({ ok: true });
    }
    expect(await call('apiKey:chat', { ...msg, requestId: 'm30' })).toEqual({
      ok: false,
      reason: 'key-rate-limited',
    });
    clock += 61_000;
    expect(await call('apiKey:chat', { ...msg, requestId: 'm31' })).toMatchObject({ ok: true });
  });

  it('고른 모델 파일을 바깥에서 고쳐도(무료·다른 회사 모델) 보내지 않는다', async () => {
    fs.writeFileSync(
      path.join(dir, 'active.json'),
      JSON.stringify({ service: 'gemini', model: 'models/gemini-2.5-flash-preview-tts' }),
    );
    fetchCalls = [];
    expect(await call('apiKey:chat', { ...msg, requestId: 'x' })).toEqual({
      ok: false,
      reason: 'key-model-unavailable',
    });
    expect(fetchCalls).toHaveLength(0);
  });

  it('모델 목록을 못 받으면 모델을 바꾸지 않는다(열어 두지 않는다)', async () => {
    clock += 11 * 60_000; // 목록 캐시(10분)가 지났다
    responder = () => new Response('down', { status: 503 });
    // 원래 목록에 있던 모델이어도, 지금 확인할 수 없으면 바꾸지 않는다.
    const s = (await call('apiKey:setActive', 'gemini', 'models/gemini-2.5-flash')) as {
      active: { model: string };
    };
    expect(s.active.model).toBe('models/gemini-flash-latest');
  });

  it('키를 지우면 그 키로 가던 요청도 끊긴다', async () => {
    responder = (_u, init) =>
      new Promise<Response>((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const pending = call('apiKey:chat', { ...msg, purpose: 'draft', requestId: 'long' });
    await new Promise((r) => setTimeout(r, 5));
    await call('apiKey:remove', 'gemini');
    expect(await pending).toEqual({ ok: false, reason: 'cancelled' });
  });
});

describe('모델 고르기·키 받는 곳', () => {
  it('목록에 없는 모델은 고를 수 없다', async () => {
    await call('apiKey:save', 'gemini', KEY);
    const s = (await call('apiKey:setActive', 'gemini', 'models/gemini-ultra-expensive')) as {
      active: { model: string };
    };
    expect(s.active.model).toBe('models/gemini-flash-latest');
  });

  it('키 받는 곳 주소는 화면이 아니라 표에서 꺼낸다', async () => {
    expect(await call('apiKey:openKeyPage', 'openrouter')).toBe(true);
    expect(await call('apiKey:openKeyPage', 'https://evil.example')).toBe(false);
    expect(opened).toEqual(['https://openrouter.ai/settings/keys']);
  });
});

describe('믿을 수 없는 창', () => {
  it('아무것도 하지 않는다', async () => {
    trusted = false;
    expect(await call('apiKey:save', 'gemini', KEY)).toEqual({ ok: false, reason: 'key-invalid' });
    expect(await call('apiKey:openKeyPage', 'gemini')).toBe(false);
    expect(fetchCalls).toHaveLength(0);
    expect(opened).toHaveLength(0);
  });
});
