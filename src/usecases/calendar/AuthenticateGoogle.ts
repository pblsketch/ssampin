import type { IGoogleAuthPort, GoogleAuthTokens } from '@domain/ports/IGoogleAuthPort';
import type { ICalendarSyncRepository } from '@domain/repositories/ICalendarSyncRepository';
import { isTokenExpired } from '@domain/rules/calendarSyncRules';

/** 구글 캘린더 인증 유스케이스 */
export class AuthenticateGoogle {
  constructor(
    private readonly authPort: IGoogleAuthPort,
    private readonly syncRepo: ICalendarSyncRepository,
  ) {}

  /** OAuth 인증 URL 생성 */
  getAuthUrl(redirectUri: string): string {
    return this.authPort.getAuthUrl(redirectUri);
  }

  /** 인증 코드를 토큰으로 교환하고 저장 */
  async authenticate(code: string, redirectUri: string): Promise<GoogleAuthTokens> {
    const tokens = await this.authPort.exchangeCode(code, redirectUri);
    await this.syncRepo.saveAuthTokens(tokens);
    return tokens;
  }

  /** 유효한 액세스 토큰 반환 (만료 시 자동 갱신) */
  async getValidAccessToken(): Promise<string> {
    const tokens = await this.syncRepo.getAuthTokens();
    if (!tokens) throw new Error('Google 계정이 연결되어 있지 않습니다');

    // 스코프 변경 감지: 저장된 토큰에 필요한 스코프가 없으면 재인증 필요
    const required = this.authPort.getRequiredScopes();
    const granted = tokens.grantedScopes ?? [];
    const missingScopes = required.filter((s) => !granted.includes(s));

    if (missingScopes.length > 0) {
      // 기존 토큰 삭제 (재인증 유도)
      await this.syncRepo.deleteAuthTokens();
      throw new Error(
        'Google 계정 권한이 업데이트되었습니다. 설정에서 Google 계정을 다시 연결해주세요.',
      );
    }

    if (isTokenExpired(tokens.expiresAt)) {
      const refreshed = await this.authPort.refreshTokens(tokens.refreshToken);
      await this.syncRepo.saveAuthTokens(refreshed);
      return refreshed.accessToken;
    }

    return tokens.accessToken;
  }

  /** 연결 상태 확인 */
  async isConnected(): Promise<boolean> {
    const tokens = await this.syncRepo.getAuthTokens();
    return tokens !== null;
  }

  /** 연결된 이메일 가져오기 */
  async getEmail(): Promise<string | null> {
    const tokens = await this.syncRepo.getAuthTokens();
    return tokens?.email ?? null;
  }

  /** 저장된 리프레시 토큰 반환 */
  async getRefreshToken(): Promise<string | null> {
    const tokens = await this.syncRepo.getAuthTokens();
    return tokens?.refreshToken ?? null;
  }

  /** 연결 해제 (토큰 폐기 + 로컬 삭제) */
  async disconnect(): Promise<void> {
    const tokens = await this.syncRepo.getAuthTokens();
    if (tokens) {
      try {
        await this.authPort.revokeTokens(tokens.accessToken);
      } catch {
        // 폐기 실패해도 로컬은 삭제
      }
    }
    await this.syncRepo.deleteAuthTokens();
  }
}
