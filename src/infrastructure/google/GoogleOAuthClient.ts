/**
 * Google OAuth 2.0 인증 클라이언트
 *
 * IGoogleAuthPort 구현체. 네이티브 fetch 사용 (외부 라이브러리 없음).
 * PKCE(S256) 지원.
 */
import type { IGoogleAuthPort, GoogleAuthTokens } from '@domain/ports/IGoogleAuthPort';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

/** 토큰 교환 API 응답 */
interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/** 토큰 갱신 API 응답 (refresh_token 없음) */
interface RefreshTokenResponse {
  access_token: string;
  expires_in: number;
}

/** Google userinfo API 응답 */
interface UserInfoResponse {
  email: string;
}

export class GoogleOAuthClient implements IGoogleAuthPort {
  private static readonly SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email',
  ] as const;

  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor() {
    // Vite define은 dot 표기만 치환하므로 dot 표기 사용
    this.clientId = process.env.GOOGLE_CLIENT_ID ?? '';
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? '';
  }

  /**
   * OAuth 인증 URL 생성
   * @param redirectUri 리다이렉트 URI (로컬 서버 콜백)
   * @param codeChallenge PKCE code challenge (S256)
   */
  getAuthUrl(redirectUri: string, codeChallenge?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GoogleOAuthClient.SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
    });

    if (codeChallenge) {
      params.set('code_challenge', codeChallenge);
      params.set('code_challenge_method', 'S256');
    }

    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  /**
   * 인증 코드를 액세스/리프레시 토큰으로 교환
   * @param code OAuth 인증 코드
   * @param redirectUri 리다이렉트 URI
   * @param codeVerifier PKCE code verifier
   */
  async exchangeCode(
    code: string,
    redirectUri: string,
    codeVerifier?: string,
  ): Promise<GoogleAuthTokens> {
    const body: Record<string, string> = {
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    };

    if (codeVerifier) {
      body['code_verifier'] = codeVerifier;
    }

    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Token exchange failed: ${res.status} ${err} [redirect_uri=${redirectUri}, client_id=${this.clientId.substring(0, 10)}...]`);
    }

    const data = (await res.json()) as TokenResponse;

    // 사용자 이메일 가져오기
    const email = await this.fetchUserEmail(data.access_token);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
      email,
      grantedScopes: [...GoogleOAuthClient.SCOPES],
    };
  }

  /**
   * 리프레시 토큰으로 액세스 토큰 갱신
   * @param refreshToken 기존 리프레시 토큰
   */
  async refreshTokens(refreshToken: string): Promise<GoogleAuthTokens> {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      // invalid_grant = 다른 기기에서 재인증하여 토큰이 무효화됨
      if (res.status === 400 && err.includes('invalid_grant')) {
        throw new Error('INVALID_GRANT: Google 인증이 만료되었습니다. 다시 로그인해주세요.');
      }
      throw new Error(`Token refresh failed: ${res.status} ${err}`);
    }

    const data = (await res.json()) as RefreshTokenResponse;

    // 사용자 이메일 가져오기
    const email = await this.fetchUserEmail(data.access_token);

    return {
      accessToken: data.access_token,
      refreshToken, // refresh token은 변경되지 않음
      expiresAt: Date.now() + data.expires_in * 1000,
      email,
      grantedScopes: [...GoogleOAuthClient.SCOPES],
    };
  }

  /**
   * 액세스 토큰 폐기
   * @param accessToken 폐기할 액세스 토큰
   */
  async revokeTokens(accessToken: string): Promise<void> {
    await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(accessToken)}`, {
      method: 'POST',
    });
  }

  /**
   * 액세스 토큰으로 교사 이메일 조회
   * @param accessToken OAuth 액세스 토큰
   */
  async getEmail(accessToken: string): Promise<string> {
    return this.fetchUserEmail(accessToken);
  }

  /**
   * 앱에서 필요한 OAuth 스코프 목록 반환
   */
  getRequiredScopes(): readonly string[] {
    return GoogleOAuthClient.SCOPES;
  }

  /**
   * 액세스 토큰으로 사용자 이메일 조회 (내부 헬퍼)
   */
  private async fetchUserEmail(accessToken: string): Promise<string> {
    const emailRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!emailRes.ok) {
      throw new Error(`Failed to fetch user info: ${emailRes.status}`);
    }

    const userInfo = (await emailRes.json()) as UserInfoResponse;
    return userInfo.email;
  }
}
