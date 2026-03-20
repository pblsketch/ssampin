/**
 * PKCE 폴백 OAuth
 * 로컬 서버를 사용하지 않고, 사용자가 직접 인증 코드를 입력하는 방식.
 * 학교 보안 프로그램이 localhost를 차단하는 환경에서 사용.
 *
 * 흐름:
 * 1. 렌더러에서 oauth:pkce-start 호출 → code verifier/challenge 생성
 * 2. 시스템 브라우저에서 인증 URL 열기 (redirect_uri = OOB)
 * 3. Google이 인증 코드를 브라우저 화면에 표시
 * 4. 사용자가 인증 코드를 복사하여 앱에 붙여넣기
 * 5. 렌더러에서 oauth:pkce-exchange 호출 → verifier 반환
 *
 * 참고: Google OOB 방식이 제한된 경우, 커스텀 URI scheme으로 대체 필요.
 */
import { ipcMain, shell } from 'electron';
import crypto from 'crypto';

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

let pendingVerifier: string | null = null;

export function registerPKCEFallbackHandlers(): void {
  /**
   * oauth:pkce-start — PKCE 방식 OAuth 시작
   * redirect_uri를 urn:ietf:wg:oauth:2.0:oob 로 설정하여
   * Google이 인증 코드를 브라우저 화면에 표시하게 한다.
   */
  ipcMain.handle(
    'oauth:pkce-start',
    async (_event, baseAuthUrl: string): Promise<{ verifier: string }> => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);
      pendingVerifier = verifier;

      // redirect_uri를 OOB(Out-Of-Band)로 설정
      const redirectUri = 'urn:ietf:wg:oauth:2.0:oob';

      // URL 파라미터 교체/추가
      let finalUrl = baseAuthUrl.replace(
        /redirect_uri=[^&]*/,
        `redirect_uri=${encodeURIComponent(redirectUri)}`,
      );

      // code_challenge가 이미 있으면 교체, 없으면 추가
      if (finalUrl.includes('code_challenge=')) {
        finalUrl = finalUrl.replace(
          /code_challenge=[^&]*/,
          `code_challenge=${challenge}`,
        );
      } else {
        finalUrl += `&code_challenge=${challenge}&code_challenge_method=S256`;
      }

      // 시스템 브라우저에서 인증 URL 열기
      await shell.openExternal(finalUrl);

      return { verifier };
    },
  );

  /**
   * oauth:pkce-exchange — 사용자가 입력한 인증 코드에 대응하는 verifier 반환
   * 실제 토큰 교환은 렌더러에서 수행한다.
   */
  ipcMain.handle(
    'oauth:pkce-exchange',
    async (): Promise<string> => {
      if (!pendingVerifier) {
        throw new Error('PKCE verifier not found. Please restart the login process.');
      }
      const verifier = pendingVerifier;
      pendingVerifier = null;
      return verifier;
    },
  );
}
