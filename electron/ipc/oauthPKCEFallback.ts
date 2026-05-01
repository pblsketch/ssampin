/**
 * PKCE 폴백 OAuth (loopback 변형)
 *
 * Google이 OOB(urn:ietf:wg:oauth:2.0:oob) 플로우를 2023-08-31부로 폐기하고
 * 2025년 완전 차단했기 때문에, OOB 대신 **loopback PKCE**를 사용한다.
 *
 * 흐름:
 * 1. 렌더러에서 oauth:pkce-start 호출 → code verifier/challenge 생성 + redirect_uri = http://127.0.0.1:0/callback
 * 2. 시스템 브라우저에서 인증 URL 열기
 * 3. Google이 redirect → 브라우저가 localhost로 콜백 시도
 *    - 학교망에서 localhost 자체가 차단되더라도, 브라우저 주소창에는 ?code=... 가 그대로 노출됨
 * 4. 사용자가 브라우저 주소창의 URL(또는 code=...)을 복사하여 앱에 붙여넣기
 * 5. 렌더러에서 oauth:pkce-exchange 호출 → verifier + redirect_uri 반환
 * 6. 렌더러가 토큰 교환을 진행 (redirect_uri는 PKCE 시작 시 사용한 값과 동일해야 함)
 */
import { ipcMain, shell } from 'electron';
import crypto from 'crypto';

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

interface PendingPKCE {
  verifier: string;
  redirectUri: string;
}

let pendingPKCE: PendingPKCE | null = null;

/** PKCE 모드 시 콜백을 받을 고정 포트 (사용 중이면 OS가 할당하는 임의 포트로 fallback) */
const PKCE_LOOPBACK_HOST = '127.0.0.1';

export function registerPKCEFallbackHandlers(): void {
  ipcMain.handle(
    'oauth:pkce-start',
    async (_event, baseAuthUrl: string): Promise<{ verifier: string; redirectUri: string }> => {
      const verifier = generateCodeVerifier();
      const challenge = generateCodeChallenge(verifier);

      // 임시 서버를 짧게 listen 해서 OS가 할당한 포트를 얻는다.
      // 학교망에서 localhost 자체가 차단된 경우에도 브라우저 주소창에 code가 노출되므로
      // 사용자가 직접 복사할 수 있어 PKCE 플로우 자체는 동작한다.
      const port = await new Promise<number>((resolve) => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
        const http = require('http') as typeof import('http');
        const tmp = http.createServer();
        tmp.on('error', () => resolve(8421));
        tmp.listen(0, PKCE_LOOPBACK_HOST, () => {
          const addr = tmp.address();
          const p = addr && typeof addr !== 'string' ? addr.port : 8421;
          tmp.close(() => resolve(p));
        });
      });

      const redirectUri = `http://${PKCE_LOOPBACK_HOST}:${port}/callback`;
      pendingPKCE = { verifier, redirectUri };

      // URL 파라미터 교체/추가
      let finalUrl = baseAuthUrl.replace(
        /redirect_uri=[^&]*/,
        `redirect_uri=${encodeURIComponent(redirectUri)}`,
      );

      if (finalUrl.includes('code_challenge=')) {
        finalUrl = finalUrl.replace(
          /code_challenge=[^&]*/,
          `code_challenge=${challenge}`,
        );
      } else {
        finalUrl += `&code_challenge=${challenge}&code_challenge_method=S256`;
      }

      // PKCE에서는 client_secret을 쓰지 않으므로 client_secret 파라미터를 명시하지 않는 게 안전
      // (auth URL에는 원래 secret이 들어있지 않으므로 별도 처리 불필요)

      console.log('[oauth:pkce-start]', { redirectUri });
      await shell.openExternal(finalUrl);

      return { verifier, redirectUri };
    },
  );

  /**
   * oauth:pkce-exchange — 토큰 교환에 필요한 verifier + redirect_uri 반환
   * 실제 토큰 교환은 렌더러에서 수행한다.
   */
  ipcMain.handle(
    'oauth:pkce-exchange',
    async (): Promise<{ verifier: string; redirectUri: string }> => {
      if (!pendingPKCE) {
        throw new Error('PKCE 정보가 없습니다. 인증을 다시 시작해주세요.');
      }
      const result = pendingPKCE;
      pendingPKCE = null;
      return result;
    },
  );
}
