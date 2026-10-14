import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleOAuthClient } from '../GoogleOAuthClient';

/**
 * 구글 토큰 갱신·교환 계약.
 *
 * 갱신은 한 시간마다 일어나고 실패하면 캘린더·할 일 동기화가 함께 멈춘다. 그래서
 * (1) 리프레시 토큰을 그대로 유지하는지, (2) 인증이 풀린 경우를 구분하는지,
 * (3) 실패 메시지에 이메일·client_id·redirect_uri 가 새어 나가지 않는지를 고정한다.
 */
const CLIENT_ID = 'test-client-id-1234567890.apps.googleusercontent.com';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('GoogleOAuthClient 토큰 갱신·교환', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  it('갱신 성공: 새 액세스 토큰을 받고 리프레시 토큰은 그대로 유지한다', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: 'new-access', expires_in: 3600, scope: 'a b' }))
      .mockResolvedValueOnce(json({ email: 'teacher@school.kr' }));

    const before = Date.now();
    const tokens = await new GoogleOAuthClient().refreshTokens('old-refresh');

    expect(tokens.accessToken).toBe('new-access');
    expect(tokens.refreshToken).toBe('old-refresh');
    expect(tokens.email).toBe('teacher@school.kr');
    expect(tokens.grantedScopes).toEqual(['a', 'b']);
    expect(tokens.expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000 - 1000);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const body = new URLSearchParams(String(init.body));
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('old-refresh');
  });

  it('인증이 풀린 경우(invalid_grant)는 INVALID_GRANT 로 구분한다', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'invalid_grant' }, 400));
    await expect(new GoogleOAuthClient().refreshTokens('revoked')).rejects.toThrow(
      /^INVALID_GRANT/,
    );
  });

  it('그 밖의 갱신 실패는 상태 코드를 담아 알린다', async () => {
    fetchMock.mockResolvedValueOnce(new Response('upstream down', { status: 503 }));
    await expect(new GoogleOAuthClient().refreshTokens('r')).rejects.toThrow(
      'Token refresh failed: 503',
    );
  });

  it('코드 교환이 실패해도 오류에 redirect_uri·client_id 를 싣지 않는다', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"error":"invalid_request"}', { status: 400 }));
    const promise = new GoogleOAuthClient().exchangeCode(
      'code',
      'http://127.0.0.1:54321/callback',
      'verifier',
    );
    await expect(promise).rejects.toThrow(/^Token exchange failed: 400/);
    await promise.catch((e: Error) => {
      expect(e.message).not.toContain('127.0.0.1');
      expect(e.message).not.toContain('54321');
      expect(e.message).not.toContain(CLIENT_ID.slice(0, 10));
    });
  });

  it('코드 교환에 성공해도 이메일·redirect_uri 를 콘솔에 남기지 않는다', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    fetchMock
      .mockResolvedValueOnce(
        json({ access_token: 'a', refresh_token: 'r', expires_in: 3600, scope: 'x' }),
      )
      .mockResolvedValueOnce(json({ email: 'teacher@school.kr' }));

    await new GoogleOAuthClient().exchangeCode('code', 'http://127.0.0.1:54321/callback', 'v');

    const printed = log.mock.calls.map((c) => c.map((a) => JSON.stringify(a)).join(' ')).join('\n');
    expect(printed).not.toContain('teacher@school.kr');
    expect(printed).not.toContain('127.0.0.1');
    expect(printed).not.toContain('54321');
  });

  it('승인된 스코프 외에는 인증 URL 에 싣지 않는다(추가 스코프는 호출 쪽이 넘긴 것만)', () => {
    const client = new GoogleOAuthClient();
    const base = new URL(client.getAuthUrl('http://127.0.0.1:1/callback'));
    expect((base.searchParams.get('scope') ?? '').split(' ').sort()).toEqual([
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/userinfo.email',
    ]);

    const withTasks = new URL(
      client.getAuthUrl('http://127.0.0.1:1/callback', undefined, false, [
        GoogleOAuthClient.TASKS_SCOPE,
      ]),
    );
    expect((withTasks.searchParams.get('scope') ?? '').split(' ').sort()).toEqual([
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/tasks',
      'https://www.googleapis.com/auth/userinfo.email',
    ]);
  });
});
