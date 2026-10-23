/**
 * 내 API 키 패널 포트 — 쌤핀 AI 와 같은 모양(도구 호출을 돌려주고, 결과를 실어 다시 묻는다).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiKeyAssistPort } from '../ApiKeyAssistPort';
import { AssistBlockedError } from '@domain/ports/AssistPort';
import type { ApiKeyChatPayload, ApiKeyChatResult } from '@domain/entities/ApiKeyProvider';
import type { ModelSafe } from '@domain/entities/AssistTool';
import type { ToolResultShape } from '@domain/services/sanitizeToolResult';

let chat: ReturnType<typeof vi.fn<(p: ApiKeyChatPayload) => Promise<ApiKeyChatResult>>>;
let cancel: ReturnType<typeof vi.fn<(id: string) => Promise<boolean>>>;

const NOW = () => new Date('2026-10-24T01:00:00Z');

beforeEach(() => {
  chat = vi.fn(async () => ({
    ok: true as const,
    text: '［이름1］ 학생은 내일 상담이 있어요.',
    toolCalls: [{ name: 'get_events', rawArguments: '{"days":7}' }],
    service: 'openrouter' as const,
    model: 'anthropic/claude-haiku-5.5',
  }));
  cancel = vi.fn(async () => true);
  vi.stubGlobal('window', { electronAPI: { apiKey: { chat, cancel } } });
});

afterEach(() => vi.unstubAllGlobals());

const data = {
  items: [{ title: '상담', who: '［이름1］' }],
} as unknown as ModelSafe<ToolResultShape>;

const simple = {
  installId: 'i',
  turns: [{ role: 'user' as const, content: 'q' }],
  toolResults: [],
};

describe('ApiKeyAssistPort', () => {
  it('지시문(오늘 날짜) + 이력 + 조회 결과 턴을 보내고, 도구 호출을 돌려준다', async () => {
    const port = new ApiKeyAssistPort({ now: NOW });
    const answer = await port.ask({
      installId: 'i',
      turns: [
        { role: 'user', content: '이전 질문' },
        { role: 'assistant', content: '이전 답' },
        { role: 'user', content: '［이름1］ 일정 알려줘' },
      ],
      toolResults: [{ tool: 'get_events', grade: 1, data }],
      tools: [
        {
          type: 'function',
          function: { name: 'get_events', description: '일정', parameters: { type: 'object' } },
        },
      ],
    });
    expect(answer).toEqual({
      text: '［이름1］ 학생은 내일 상담이 있어요.',
      degraded: null,
      toolCalls: [{ name: 'get_events', rawArguments: '{"days":7}' }],
    });
    const p = chat.mock.calls[0]?.[0];
    expect(p?.purpose).toBe('panel');
    expect(p?.tools).toHaveLength(1);
    expect(p?.messages[0]?.role).toBe('system');
    expect(p?.messages[0]?.content).toContain('2026-10-24 (토)');
    expect(p?.messages.slice(1, 4).map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(p?.messages[4]).toEqual({
      role: 'user',
      content: '[앱에서 조회한 결과]\n- get_events: {"items":[{"title":"상담","who":"［이름1］"}]}',
    });
  });

  it('도구 목록이 없으면 tools 를 싣지 않는다', async () => {
    await new ApiKeyAssistPort({ now: NOW }).ask(simple);
    expect(chat.mock.calls[0]?.[0]).not.toHaveProperty('tools');
  });

  it('한 포트의 왕복은 같은 세션 id 를 쓴다', async () => {
    const port = new ApiKeyAssistPort({ now: NOW });
    await port.ask(simple);
    await port.ask(simple);
    expect(chat.mock.calls[0]?.[0].sessionId).toBe(chat.mock.calls[1]?.[0].sessionId);
    expect(chat.mock.calls[0]?.[0].requestId).not.toBe(chat.mock.calls[1]?.[0].requestId);
  });

  it('이미지는 보내지 않고 정직하게 거절한다', async () => {
    const port = new ApiKeyAssistPort({ now: NOW });
    await expect(
      port.ask({
        ...simple,
        attachments: [{ name: 'a.png', mediaType: 'image/png', dataBase64: 'AAAA' }],
      }),
    ).rejects.toBeInstanceOf(AssistBlockedError);
    expect(chat).not.toHaveBeenCalled();
  });

  it('실패는 갈래를 담은 오류로 — 쌤핀 AI 로 넘기지 않는다', async () => {
    chat.mockResolvedValueOnce({ ok: false, reason: 'key-invalid' });
    await expect(new ApiKeyAssistPort({ now: NOW }).ask(simple)).rejects.toMatchObject({
      name: 'OwnAiRunError',
      kind: 'key-invalid',
    });
  });

  it('통로가 없으면(브라우저) key-missing', async () => {
    vi.stubGlobal('window', {});
    await expect(new ApiKeyAssistPort({ now: NOW }).ask(simple)).rejects.toMatchObject({
      kind: 'key-missing',
    });
  });

  it('[중단]은 진행 중인 요청 id 로 main 에 알린다', async () => {
    let release: (r: ApiKeyChatResult) => void = () => undefined;
    chat.mockImplementationOnce(
      () =>
        new Promise<ApiKeyChatResult>((resolve) => {
          release = resolve;
        }),
    );
    const port = new ApiKeyAssistPort({ now: NOW });
    const pending = port.ask(simple);
    port.cancel();
    const sentId = chat.mock.calls[0]?.[0].requestId;
    expect(cancel).toHaveBeenCalledWith(sentId);
    release({ ok: false, reason: 'cancelled' });
    await expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
  });
});
