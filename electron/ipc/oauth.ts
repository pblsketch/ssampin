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
 * 포트 바인딩 가능 여부 사전 확인 (500ms 타임아웃)
 * 학교 보안 프로그램이 localhost를 차단하는지 빠르게 검출한다.
 */
async function canBindLocalhost(): Promise<boolean> {
  return new Promise((resolve) => {
    const testServer = http.createServer();
    const timeout = setTimeout(() => {
      testServer.close();
      resolve(false);
    }, 500);

    testServer.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });

    testServer.listen(0, '127.0.0.1', () => {
      clearTimeout(timeout);
      testServer.close();
      resolve(true);
    });
  });
}

/** 현재 활성 메인 윈도우를 안전하게 조회 (트레이에서 재생성된 경우 대응) */
function getMainWindow(): BrowserWindow | null {
  const wins = BrowserWindow.getAllWindows();
  return wins.find((w) => !w.isDestroyed()) ?? null;
}

/**
 * OAuth IPC 핸들러 등록
 * @param _mainWindow 미사용 — 호환성 유지용. 내부에서 getMainWindow()로 동적 조회
 */
export function registerOAuthHandlers(_mainWindow: BrowserWindow): void {
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
    // 로컬 서버 바인딩 가능 여부 사전 확인
    const canBind = await canBindLocalhost();
    if (!canBind) {
      // localhost 차단 → 즉시 PKCE 폴백 제안 (30초 대기 없이)
      console.log('[oauth] localhost 바인딩 불가 — PKCE 폴백 즉시 제안');
      getMainWindow()?.webContents.send('oauth:fallback-needed', {
        reason: 'LOCALHOST_BLOCKED',
        message: '학교 보안 프로그램이 연결을 차단하고 있어요. 다른 방법으로 로그인할 수 있습니다.',
        elapsedSec: 0,
      });
      // throw하지 않고 Promise를 유지 — PKCE 폴백이 처리하므로
      // 렌더러의 startAuth에서 fallbackCleanup이 이벤트를 수신하여 모달 표시
      // 10분 타임아웃으로 자연 종료
      return new Promise<string>((_, reject) => {
        setTimeout(() => {
          reject(new Error('OAuth timeout — localhost blocked, PKCE fallback offered'));
        }, 10 * 60 * 1000);
      });
    }

    return new Promise<string>((resolve, reject) => {
      // 기존 서버 정리
      if (oauthServer) {
        oauthServer.close();
        oauthServer = null;
      }

      // 콜백 수신 여부 추적 (30초 폴백 타이머용)
      let callbackReceived = false;
      let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

      const server = http.createServer((req, res) => {
        const parsedUrl = url.parse(req.url ?? '', true);

        if (parsedUrl.pathname === '/callback') {
          callbackReceived = true;
          if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }

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
            // access_denied인 경우 (사용자 한도 초과 포함) — 전용 에러 코드 전송
            if (error === 'access_denied') {
              getMainWindow()?.webContents.send('oauth:error', {
                code: 'ACCESS_DENIED',
                message: '구글 인증이 거부되었습니다.',
              });
            }

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

      // 서버 에러 핸들러 (포트 바인딩 실패 등)
      server.on('error', (err) => {
        oauthServer = null;
        if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
        // 렌더러에 에러 전달 → UI에서 안내 표시
        getMainWindow()?.webContents.send('oauth:error', {
          code: 'SERVER_START_FAILED',
          message: err.message,
        });
        reject(new Error(`OAuth 로컬 서버 시작 실패: ${err.message}`));
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
        getMainWindow()?.webContents.send('oauth:redirect-uri', redirectUri);

        // 30초 콜백 미수신 → PKCE 폴백 제안
        // 브라우저→localhost 접근이 보안 프로그램에 의해 차단된 경우를 감지한다.
        // 서버는 종료하지 않음 — 사용자가 폴백을 거부하고 기다릴 수 있으므로.
        fallbackTimer = setTimeout(() => {
          if (!callbackReceived && oauthServer) {
            getMainWindow()?.webContents.send('oauth:fallback-needed', {
              reason: 'CALLBACK_TIMEOUT',
              message: '30초 동안 인증 응답이 없습니다. 보안 프로그램이 연결을 차단하고 있을 수 있어요.',
              elapsedSec: 30,
            });
          }
        }, 30_000);
      });

      // 10분 타임아웃 (학교 Google Workspace 계정의 추가 인증 단계 고려)
      setTimeout(() => {
        if (oauthServer) {
          oauthServer.close();
          oauthServer = null;
          if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
          getMainWindow()?.webContents.send('oauth:error', {
            code: 'TIMEOUT',
            message: '인증 시간이 초과되었습니다.',
          });
          reject(new Error('OAuth timeout (10 minutes)'));
        }
      }, 10 * 60 * 1000);
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
