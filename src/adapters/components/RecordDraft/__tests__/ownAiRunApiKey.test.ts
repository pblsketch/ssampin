/**
 * askOnce 의 내 API 키 갈래(ADR-143) — 생기부 초안·근거 정리·분량 조절이 모두 이 길을 지난다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askOnce, type OwnAiRunApi } from '../ownAiRun';
import type { ApiKeyChatPayload, ApiKeyChatResult } from '@domain/entities/ApiKeyProvider';

const cliApi: OwnAiRunApi = {
  run: vi.fn(async () => ({ ok: true })),
  onEvent: () => () => undefined,
};

let chat: ReturnType<typeof vi.fn<(p: ApiKeyChatPayload) => Promise<ApiKeyChatResult>>>;
let cancel: ReturnType<typeof vi.fn<(id: string) => Promise<boolean>>>;

beforeEach(() => {
  chat = vi.fn(async () => ({
    ok: true as const,
    text: '초안 본문',
    toolCalls: [],
    service: 'gemini' as const,
    model: 'models/gemini-flash-latest',
  }));
  cancel = vi.fn(async () => true);
  vi.stubGlobal('window', { electronAPI: { apiKey: { chat, cancel } } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(cliApi.run).mockClear();
});

describe('askOnce — provider apikey', () => {
  it('CLI 를 띄우지 않고 키 통로로 보낸다. 규정은 system, 묶음은 user', async () => {
    await expect(askOnce(cliApi, 'apikey', '근거 묶음', '1층 규정')).resolves.toBe('초안 본문');
    expect(cliApi.run).not.toHaveBeenCalled();
    const payload = chat.mock.calls[0]?.[0];
    expect(payload?.purpose).toBe('draft');
    expect(payload?.messages).toEqual([
      { role: 'system', content: '1층 규정' },
      { role: 'user', content: '근거 묶음' },
    ]);
    expect(payload?.requestId).toMatch(/^[A-Za-z0-9_-]{1,80}$/);
  });

  it('규정이 없으면 system 을 싣지 않는다', async () => {
    await askOnce(cliApi, 'apikey', '묶음');
    expect(chat.mock.calls[0]?.[0].messages).toEqual([{ role: 'user', content: '묶음' }]);
  });

  it('실패 갈래를 그대로 던진다', async () => {
    chat.mockResolvedValueOnce({ ok: false, reason: 'key-no-credit' });
    await expect(askOnce(cliApi, 'apikey', '묶음')).rejects.toBe('key-no-credit');
  });

  it('모르는 갈래·예외는 key-provider-error', async () => {
    chat.mockResolvedValueOnce({ ok: false, reason: 'weird' as never });
    await expect(askOnce(cliApi, 'apikey', '묶음')).rejects.toBe('key-provider-error');
    chat.mockRejectedValueOnce(new Error('ipc down'));
    await expect(askOnce(cliApi, 'apikey', '묶음')).rejects.toBe('key-provider-error');
  });

  it('[중단]하면 main 에 취소를 알린다', async () => {
    const ctrl = new AbortController();
    chat.mockImplementationOnce(async () => {
      ctrl.abort();
      return { ok: false, reason: 'cancelled' };
    });
    await expect(askOnce(cliApi, 'apikey', '묶음', undefined, ctrl.signal)).rejects.toBe(
      'cancelled',
    );
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('이미 멈춘 신호면 보내지 않는다', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(askOnce(cliApi, 'apikey', '묶음', undefined, ctrl.signal)).rejects.toBe(
      'cancelled',
    );
    expect(chat).not.toHaveBeenCalled();
  });

  it('데스크톱 통로가 없으면(브라우저) key-missing', async () => {
    vi.stubGlobal('window', {});
    await expect(askOnce(cliApi, 'apikey', '묶음')).rejects.toBe('key-missing');
  });
});
