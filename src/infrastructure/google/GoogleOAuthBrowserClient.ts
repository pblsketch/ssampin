/**
 * Google OAuth 2.0 브라우저 전용 PKCE 클라이언트 (모바일 PWA)
 * 웹 애플리케이션 타입 OAuth 클라이언트 — client_secret 필수
 */
import type { IGoogleAuthPort, GoogleAuthTokens } from '@domain/ports/IGoogleAuthPort';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface RefreshTokenResponse {
  access_token: string;
  expires_in: number;
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
  private readonly clientSecret: string;

  constructor() {
    this.clientId = import.meta.env.VITE_MOBILE_GOOGLE_CLIENT_ID ?? '';
    this.clientSecret = import.meta.env.VITE_MOBILE_GOOGLE_CLIENT_SECRET ?? '';
  }

  getAuthUrl(redirectUri: string, codeChallenge?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GoogleOAuthBrowserClient.SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
    });
    if (codeChallenge) {
      params.set('code_challenge', codeChallenge);
      params.set('code_challenge_method', 'S256');
    }
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(
    code: string,
    redirectUri: string,
    codeVerifier?: string,
  ): Promise<GoogleAuthTokens> {
    const body: Record<string, string> = {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    };
    if (codeVerifier) {
      body.code_verifier = codeVerifier;
    }

    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Token exchange failed: ${res.status} ${err}`);
    }
    const data = (await res.json()) as TokenResponse;
    const email = await this.fetchEmail(data.access_token);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      email,
    };
  }

  async refreshTokens(refreshToken: string): Promise<GoogleAuthTokens> {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Token refresh failed: ${res.status} ${err}`);
    }
    const data = (await res.json()) as RefreshTokenResponse;
    const email = await this.fetchEmail(data.access_token);

    return {
      accessToken: data.access_token,
      refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
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
