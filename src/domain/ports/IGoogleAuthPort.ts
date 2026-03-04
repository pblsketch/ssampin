/** 구글 OAuth 인증 토큰 */
export interface GoogleAuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;  // Unix timestamp (ms)
  readonly email: string;
}

/** 구글 OAuth 인증 포트 */
export interface IGoogleAuthPort {
  /** OAuth 인증 URL 생성 */
  getAuthUrl(redirectUri: string, codeChallenge?: string): string;
  /** 인증 코드를 토큰으로 교환 */
  exchangeCode(code: string, redirectUri: string, codeVerifier?: string): Promise<GoogleAuthTokens>;
  /** 리프레시 토큰으로 액세스 토큰 갱신 */
  refreshTokens(refreshToken: string): Promise<GoogleAuthTokens>;
  /** 토큰 폐기 */
  revokeTokens(accessToken: string): Promise<void>;
}
