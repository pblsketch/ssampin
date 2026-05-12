/**
 * Google OAuth 2.0 브라우저 전용 PKCE 클라이언트 (모바일 PWA)
 *
 * 모바일 PWA 는 Google "Web application" OAuth 클라이언트라 code↔token 교환에 client_secret
 * 이 필요하다. 그 secret 을 PWA 번들에 넣으면 안 되므로(감사 F-2), 교환을 Supabase Edge
 * Function `oauth-exchange` 로 위임한다 — 이 클라이언트는 PKCE code_challenge 만 만들고
 * 토큰 교환은 서버가 수행한다(클라이언트는 client_secret 을 영영 보지 않는다).
 *
 * security-hardening P0-C / security-audit F-2
 */
import type { IGoogleAuthPort, GoogleAuthTokens } from '@domain/ports/IGoogleAuthPort';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

/** oauth-exchange Edge Function 응답 (Google token endpoint 패스스루) */
interface TokenExchangeResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  /** 오류 시 — Google error code (예: invalid_grant) 또는 함수 자체 에러 */
  error?: string;
  error_description?: string;
}

interface UserInfoResponse {
  email: string;
}

export class GoogleOAuthBrowserClient implements IGoogleAuthPort {
  private static readonly SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email',
  ] as const;

  private readonly clientId: string;
  private readonly exchangeUrl: string;
  private readonly anonKey: string;

  constructor() {
    this.clientId = (import.meta.env.VITE_MOBILE_GOOGLE_CLIENT_ID ?? '').trim();
    const supabaseUrl = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').trim();
    this.anonKey = ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '').trim();
    this.exchangeUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/oauth-exchange` : '';
  }

  getAuthUrl(redirectUri: string, codeChallenge?: string, forceAccountSelect?: boolean): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GoogleOAuthBrowserClient.SCOPES.join(' '),
      access_type: 'offline',
      prompt: forceAccountSelect ? 'select_account consent' : 'consent',
    });
    if (codeChallenge) {
      params.set('code_challenge', codeChallenge);
      params.set('code_challenge_method', 'S256');
    }
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  /** oauth-exchange Edge Function 호출 — code/refresh_token → 토큰 */
  private async callExchange(payload: Record<string, string>): Promise<TokenExchangeResponse> {
    if (!this.exchangeUrl) {
      throw new Error('OAuth 교환 서버가 설정되지 않았습니다. 잠시 후 다시 시도해주세요.');
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.anonKey) {
      headers['apikey'] = this.anonKey;
      headers['Authorization'] = `Bearer ${this.anonKey}`;
    }
    const res = await fetch(this.exchangeUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...payload, clientId: this.clientId }),
    });
    const data = (await res.json().catch(() => ({ error: 'invalid_response' }))) as TokenExchangeResponse;
    if (!res.ok || data.error) {
      const code = data.error ?? `exchange_failed_${res.status}`;
      if (code === 'invalid_grant') {
        throw new Error('INVALID_GRANT: Google 인증이 만료되었습니다. 다시 로그인해주세요.');
      }
      throw new Error(`Token exchange failed: ${code}${data.error_description ? ` (${data.error_description})` : ''}`);
    }
    return data;
  }

  async exchangeCode(
    code: string,
    redirectUri: string,
    codeVerifier?: string,
  ): Promise<GoogleAuthTokens> {
    const payload: Record<string, string> = {
      grantType: 'authorization_code',
      code,
      redirectUri,
    };
    if (codeVerifier) {
      payload.codeVerifier = codeVerifier;
    }
    const data = await this.callExchange(payload);
    if (!data.access_token) {
      throw new Error('Token exchange failed: access_token 없음');
    }
    const email = await this.fetchEmail(data.access_token);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? '',
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
      email,
    };
  }

  async refreshTokens(refreshToken: string): Promise<GoogleAuthTokens> {
    const data = await this.callExchange({ grantType: 'refresh_token', refreshToken });
    if (!data.access_token) {
      throw new Error('Token refresh failed: access_token 없음');
    }
    const email = await this.fetchEmail(data.access_token);

    return {
      accessToken: data.access_token,
      refreshToken, // refresh_token 은 변경되지 않음
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
      email,
    };
  }

  async revokeTokens(accessToken: string): Promise<void> {
    await fetch(`${GOOGLE_REVOKE_URL}?token=${accessToken}`, { method: 'POST' });
  }

  getRequiredScopes(): readonly string[] {
    return GoogleOAuthBrowserClient.SCOPES;
  }

  private async fetchEmail(accessToken: string): Promise<string> {
    const res = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return '';
    const data = (await res.json()) as UserInfoResponse;
    return data.email;
  }
}
