/**
 * Google OAuth IPC 핸들러
 *
 * 로컬 HTTP 서버를 임시로 열어 OAuth 리다이렉트를 수신한 뒤
 * 시스템 브라우저에서 구글 인증 페이지를 열어준다.
 */
import { ipcMain, shell, BrowserWindow } from 'electron';
import http from 'http';
import url from 'url';

/** 현재 실행 중인 OAuth 로컬 서버 (하나만 허용) */
let oauthServer: http.Server | null = null;

/**
 * OAuth IPC 핸들러 등록
 * @param mainWindow 렌더러에 이벤트를 전달할 메인 윈도우
 */
export function registerOAuthHandlers(mainWindow: BrowserWindow): void {
  /**
   * oauth:start — OAuth 인증 시작
   * 1) 로컬 HTTP 서버 시작 (임의 포트)
   * 2) 시스템 브라우저에서 authUrl 열기
   * 3) 리다이렉트로 code 수신 후 반환
   *
   * @param authUrl Google OAuth 인증 URL (redirect_uri 미포함)
   * @returns 인증 코드(code) 문자열
   */
  ipcMain.handle('oauth:start', async (_event, authUrl: string): Promise<string> => {
    return new Promise<string>((resolve, reject) => {
      // 기존 서버 정리
      if (oauthServer) {
        oauthServer.close();
        oauthServer = null;
      }

      const server = http.createServer((req, res) => {
        const parsedUrl = url.parse(req.url ?? '', true);

        if (parsedUrl.pathname === '/callback') {
          const code = parsedUrl.query['code'] as string | undefined;
          const error = parsedUrl.query['error'] as string | undefined;

          // 성공/실패 페이지 표시
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });

          if (code) {
            res.end(`
              <!DOCTYPE html>
              <html><head><title>쌤핀 인증 완료</title></head>
              <body style="font-family: 'Noto Sans KR', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #0a0e17; color: #e2e8f0;">
                <div style="text-align: center;">
                  <h1 style="font-size: 48px; margin-bottom: 16px;">&#x2705;</h1>
                  <h2>쌤핀 인증 완료!</h2>
                  <p style="color: #94a3b8;">이 창을 닫고 쌤핀으로 돌아가세요.</p>
                </div>
              </body></html>
            `);
            resolve(code);
          } else {
            res.end(`
              <!DOCTYPE html>
              <html><head><title>쌤핀 인증 실패</title></head>
              <body style="font-family: 'Noto Sans KR', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #0a0e17; color: #e2e8f0;">
                <div style="text-align: center;">
                  <h1 style="font-size: 48px; margin-bottom: 16px;">&#x274C;</h1>
                  <h2>인증 실패</h2>
                  <p style="color: #94a3b8;">${error ?? '알 수 없는 오류가 발생했습니다.'}</p>
                </div>
              </body></html>
            `);
            reject(new Error(error ?? 'OAuth failed'));
          }

          // 콜백 처리 후 1초 뒤 서버 종료
          setTimeout(() => {
            server.close();
            oauthServer = null;
          }, 1000);
        }
      });

      // 임의 포트로 서버 시작
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to start OAuth server'));
          return;
        }

        oauthServer = server;
        const port = address.port;
        const redirectUri = `http://127.0.0.1:${port}/callback`;

        // authUrl의 placeholder redirect_uri를 실제 포트로 교체
        const finalUrl = authUrl.replace(
          /redirect_uri=[^&]*/,
          `redirect_uri=${encodeURIComponent(redirectUri)}`,
        );

        // 시스템 브라우저에서 인증 URL 열기
        shell.openExternal(finalUrl);

        // 렌더러에 redirect_uri 전달 (토큰 교환 시 필요)
        mainWindow.webContents.send('oauth:redirect-uri', redirectUri);
      });

      // 5분 타임아웃
      setTimeout(() => {
        if (oauthServer) {
          oauthServer.close();
          oauthServer = null;
          reject(new Error('OAuth timeout (5 minutes)'));
        }
      }, 5 * 60 * 1000);
    });
  });

  /**
   * oauth:cancel — OAuth 인증 취소 (로컬 서버 종료)
   */
  ipcMain.handle('oauth:cancel', (): void => {
    if (oauthServer) {
      oauthServer.close();
      oauthServer = null;
    }
  });
}
