/**
 * 내 API 키로 서비스를 부르는 쪽 — 정해진 주소로만, 리디렉트 없이, 오류는 갈래로만.
 */
import { describe, expect, it, vi } from 'vitest';
import { createApiKeyClient, type FetchLike } from './apiKeyClient';

const KEY = 'sk-or-v1-0123456789abcdef0123456789abcdef';

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function setup(responder: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const log = vi.fn();
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return responder(url, init);
  };
  const client = createApiKeyClient({ fetch, userAgent: 'ssampin/9.9.9', log });
  return { client, calls, log };
}

const baseChat = {
  key: KEY,
  model: 'anthropic/claude-haiku-5.5',
  messages: [{ role: 'user' as const, content: '안녕' }],
  maxTokens: 100,
  timeoutMs: 5_000,
  sessionId: 'sess-1',
};

describe('보내는 모양', () => {
  it('정해진 주소·Bearer 머리글·리디렉트 금지로 보낸다', async () => {
    const { client, calls } = setup(() => json(200, { choices: [{ message: { content: '네' } }] }));
    const r = await client.chat({ ...baseChat, service: 'openrouter' });
    expect(r).toEqual({ ok: true, text: '네', toolCalls: [] });
    expect(calls[0]?.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(calls[0]?.init.redirect).toBe('error');
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(headers['User-Agent']).toBe('ssampin/9.9.9');
    // temperature 는 보내지 않는다(추론 모델 400 방지)
    expect(JSON.parse(String(calls[0]?.init.body))).not.toHaveProperty('temperature');
  });

  it('오픈코드에는 세션 머리글을 붙이고, 다른 서비스에는 붙이지 않는다', async () => {
    const { client, calls } = setup(() => json(200, { choices: [{ message: { content: 'ok' } }] }));
    await client.chat({ ...baseChat, service: 'opencode-go', model: 'glm-5.3' });
    await client.chat({ ...baseChat, service: 'gemini', model: 'models/gemini-flash-latest' });
    expect((calls[0]?.init.headers as Record<string, string>)['x-opencode-session']).toBe('sess-1');
    expect(calls[0]?.url).toBe('https://opencode.ai/inference/go/openai/v1/chat/completions');
    expect(
      (calls[1]?.init.headers as Record<string, string>)['x-opencode-session'],
    ).toBeUndefined();
    expect(calls[1]?.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    );
  });

  it('도구 호출을 읽는다(인자가 객체로 와도 글자로 바꾼다)', async () => {
    const { client } = setup(() =>
      json(200, {
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { type: 'function', function: { name: 'get_events', arguments: '{"days":7}' } },
                { type: 'function', function: { name: 'get_todos', arguments: { a: 1 } } },
                { type: 'function', function: { name: '' } },
              ],
            },
          },
        ],
      }),
    );
    const r = await client.chat({ ...baseChat, service: 'openrouter' });
    expect(r).toEqual({
      ok: true,
      text: '',
      toolCalls: [
        { name: 'get_events', rawArguments: '{"days":7}' },
        { name: 'get_todos', rawArguments: '{"a":1}' },
      ],
    });
  });
});

describe('오류 갈래', () => {
  it.each([
    [401, '{"error":"bad"}', 'key-invalid'],
    [402, '{"error":{"message":"Insufficient credits"}}', 'key-no-credit'],
    [429, 'slow down', 'key-rate-limited'],
    [404, 'no such model', 'key-model-unavailable'],
    [400, '{"error":{"message":"API key not valid. Please pass a valid API key."}}', 'key-invalid'],
    [
      400,
      '{"error":{"message":"Upstream request failed: Model is unavailable."}}',
      'key-model-unavailable',
    ],
    [503, 'down', 'key-provider-error'],
  ])('%i → %s', async (status, body, reason) => {
    const { client } = setup(() => new Response(body, { status }));
    expect(await client.chat({ ...baseChat, service: 'openrouter' })).toEqual({
      ok: false,
      reason,
    });
  });

  it('200 안에 실린 오류(오픈라우터)도 갈래로 바꾼다', async () => {
    const { client } = setup(() => json(200, { error: { code: 402, message: 'credits' } }));
    expect(await client.chat({ ...baseChat, service: 'openrouter' })).toEqual({
      ok: false,
      reason: 'key-no-credit',
    });
  });

  it('빈 답은 답으로 넘기지 않는다', async () => {
    const { client } = setup(() => json(200, { choices: [{ message: { content: '  ' } }] }));
    expect(await client.chat({ ...baseChat, service: 'gemini' })).toEqual({
      ok: false,
      reason: 'key-provider-error',
    });
  });

  it('인터넷이 끊기면 key-network', async () => {
    const { client } = setup(() => {
      throw new TypeError('fetch failed');
    });
    expect(await client.chat({ ...baseChat, service: 'gemini' })).toEqual({
      ok: false,
      reason: 'key-network',
    });
  });

  it('시간이 넘으면 key-timeout', async () => {
    const { client } = setup(
      (_u, init) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    expect(await client.chat({ ...baseChat, service: 'gemini', timeoutMs: 20 })).toEqual({
      ok: false,
      reason: 'key-timeout',
    });
  });

  it('[중단]이면 cancelled', async () => {
    const ctrl = new AbortController();
    const { client } = setup(
      (_u, init) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          setTimeout(() => ctrl.abort(), 5);
        }),
    );
    expect(await client.chat({ ...baseChat, service: 'gemini', signal: ctrl.signal })).toEqual({
      ok: false,
      reason: 'cancelled',
    });
  });

  it('로그에 키가 남지 않는다 — 서비스가 본문에 키를 되돌려 줘도', async () => {
    const { client, log } = setup(
      () => new Response(`Incorrect API key provided: ${KEY}`, { status: 401 }),
    );
    await client.chat({ ...baseChat, service: 'openrouter' });
    const logged = log.mock.calls.flat().join(' ');
    expect(logged).not.toContain(KEY);
    expect(logged).not.toContain(KEY.slice(0, 20));
    expect(logged).toContain('401');
  });
});

describe('키 확인', () => {
  it('제미나이: 모델 목록으로 확인(대화를 보내지 않는다)', async () => {
    const { client, calls } = setup(() =>
      json(200, { data: [{ id: 'models/gemini-flash-latest' }] }),
    );
    expect(await client.verifyKey('gemini', 'AIza' + 'x'.repeat(35))).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/models');
  });

  it('오픈라우터: 키 정보 주소로 확인', async () => {
    const { client, calls } = setup(() => json(200, { data: { label: 'x' } }));
    expect(await client.verifyKey('openrouter', KEY)).toEqual({ ok: true });
    expect(calls[0]?.url).toBe('https://openrouter.ai/api/v1/key');
  });

  it('오픈코드: 키를 붙인 모델 목록으로 확인한다(대화를 보내지 않는다)', async () => {
    const { client, calls } = setup(() => json(200, { data: [{ id: 'glm-5.3' }] }));
    expect(await client.verifyKey('opencode-zen', 'sk-' + 'z'.repeat(40))).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://opencode.ai/inference/v1/models');
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toMatch(/^Bearer sk-/);
  });

  it('틀린 키면 key-invalid', async () => {
    const { client } = setup(
      () => new Response('{"error":{"message":"User not found."}}', { status: 401 }),
    );
    expect(await client.verifyKey('openrouter', KEY)).toEqual({ ok: false, reason: 'key-invalid' });
  });
});

describe('모델 목록', () => {
  it('쓸 수 있는 모델만, 추천을 맨 위로', async () => {
    const { client } = setup(() =>
      json(200, {
        data: [
          { id: 'models/gemini-2.5-flash' },
          { id: 'models/gemini-2.5-flash-preview-tts' },
          { id: 'models/gemini-embedding-001' },
          { id: 'models/gemma-4-31b-it' },
          { id: 'models/gemini-flash-latest' },
        ],
      }),
    );
    const r = await client.listModels('gemini', 'AIza' + 'x'.repeat(35));
    expect(r.ok && r.models.map((m) => m.id)).toEqual([
      'models/gemini-flash-latest',
      'models/gemini-2.5-flash',
    ]);
  });
});
