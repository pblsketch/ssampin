import type { IGoogleAuthPort, GoogleAuthTokens } from '@domain/ports/IGoogleAuthPort';
import type { IServerTokenCustodyPort } from '@domain/ports/IServerTokenCustodyPort';
import type { ICalendarSyncRepository } from '@domain/repositories/ICalendarSyncRepository';
import { isTokenExpired } from '@domain/rules/calendarSyncRules';

/**
 * 연결 해제가 어디까지 끝났는가 — **조용히 삼키지 않는다**(ADR-136).
 *
 * 둘 중 하나라도 실패하면 선생님이 구글 계정 권한 페이지에서 한 번 더 해제해야 할 수 있다.
 * 예전에는 구글 폐기 실패를 그냥 넘겨서, 서버와 구글 양쪽에 살아 있는 토큰이 남아도 몰랐다.
 */
export interface DisconnectOutcome {
  /** 서버(과제 수합·온라인 교무실)에 맡긴 토큰을 지웠는가. 맡긴 것이 없어도 true */
  readonly serverCleared: boolean;
  /** 구글에 토큰 폐기를 알렸는가. 저장된 토큰이 없었으면 true */
  readonly revoked: boolean;
}

/** 구글 캘린더 인증 유스케이스 */
export class AuthenticateGoogle {
  constructor(
    private readonly authPort: IGoogleAuthPort,
    private readonly syncRepo: ICalendarSyncRepository,
    private readonly serverTokens?: IServerTokenCustodyPort,
  ) {}

  /** OAuth 인증 URL 생성 */
  getAuthUrl(
    redirectUri: string,
    forceAccountSelect?: boolean,
    additionalScopes?: readonly string[],
  ): string {
    return this.authPort.getAuthUrl(redirectUri, undefined, forceAccountSelect, additionalScopes);
  }

  /** 인증 코드를 토큰으로 교환하고 저장 */
  async authenticate(
    code: string,
    redirectUri: string,
    codeVerifier?: string,
  ): Promise<GoogleAuthTokens> {
    const tokens = await this.authPort.exchangeCode(code, redirectUri, codeVerifier);
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
      try {
        const refreshed = await this.authPort.refreshTokens(tokens.refreshToken);
        await this.syncRepo.saveAuthTokens(refreshed);
        return refreshed.accessToken;
      } catch (err) {
        // invalid_grant: 다른 기기에서 재인증하여 토큰이 무효화된 경우
        if (err instanceof Error && err.message.includes('INVALID_GRANT')) {
          await this.syncRepo.deleteAuthTokens();
          throw new Error(
            'INVALID_GRANT: Google 인증이 만료되었습니다. 설정에서 다시 연결해주세요.',
            { cause: err },
          );
        }
        throw err;
      }
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

  /** 저장된 토큰 만료 시각 반환 (밀리초 timestamp) */
  async getExpiresAt(): Promise<number | null> {
    const tokens = await this.syncRepo.getAuthTokens();
    return tokens?.expiresAt ?? null;
  }

  /**
   * 연결 해제 — **서버 보관분 삭제 → 구글 폐기 → 로컬 삭제** 순서(ADR-136 D4).
   *
   * ★순서가 중요하다. 서버 보관분을 지우려면 본인 확인(access token)이 필요한데, 구글에서
   * 폐기한 뒤에는 그 토큰이 죽는다. 그래서 서버를 먼저 지운다.
   * ★실패해도 로컬은 지운다 — 선생님이 "해제"를 눌렀다. 대신 무엇이 안 됐는지 돌려준다.
   */
  async disconnect(): Promise<DisconnectOutcome> {
    const tokens = await this.syncRepo.getAuthTokens();
    let serverCleared = true;
    let revoked = true;
    if (tokens) {
      if (this.serverTokens) {
        try {
          await this.serverTokens.deleteMine(await this.getValidAccessToken());
        } catch (err) {
          console.warn('[AuthenticateGoogle] 서버 보관 토큰 삭제 실패:', err);
          serverCleared = false;
        }
      }
      try {
        // refreshToken을 폐기하면 연관된 모든 accessToken도 무효화됨
        await this.authPort.revokeTokens(tokens.refreshToken);
      } catch (err) {
        console.warn('[AuthenticateGoogle] 구글 토큰 폐기 실패:', err);
        revoked = false;
      }
    }
    await this.syncRepo.deleteAuthTokens();
    return { serverCleared, revoked };
  }
}
