import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 모바일 토큰 갱신은 모든 Drive 요청 바로 앞에 붙는다. 여기가 응답 없이 늘어지면
 * 동기화는 파일을 하나도 건드리지 못한 채 "동기화 중 0%" 로 굳는다.
 * 데스크톱에만 있던 제한시간을 이 경로에도 걸어 두었는지 고정한다.
 */
function hangingFetch(_input: string, init?: RequestInit): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      const err = new Error('The operation was aborted.');
      err.name = 'AbortError';
      reject(err);
    });
  });
}

describe('GoogleOAuthBrowserClient 제한시간', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test-project.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
    vi.stubEnv('VITE_MOBILE_GOOGLE_CLIENT_ID', 'test-client-id');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('토큰 갱신 서버가 응답하지 않으면 30초 뒤 끊고 알린다', async () => {
    vi.stubGlobal('fetch', vi.fn(hangingFetch));
    const { GoogleOAuthBrowserClient } = await import('../GoogleOAuthBrowserClient');
    const client = new GoogleOAuthBrowserClient();

    const pending = client.refreshTokens('refresh-token');
    const asserted = expect(pending).rejects.toThrow('응답 시간 초과');

    await vi.advanceTimersByTimeAsync(30_000);
    await asserted;
  });

  it('교환 서버가 invalid_grant 를 주면 기존 재로그인 안내를 유지한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })),
    );
    const { GoogleOAuthBrowserClient } = await import('../GoogleOAuthBrowserClient');
    const client = new GoogleOAuthBrowserClient();

    await expect(client.refreshTokens('refresh-token')).rejects.toThrow('INVALID_GRANT');
  });
});
