/**
 * Google OAuth IPC 핸들러
 *
 * 로컬 HTTP 서버를 임시로 열어 OAuth 리다이렉트를 수신한 뒤
 * 시스템 브라우저에서 구글 인증 페이지를 열어준다.
 */
import { ipcMain, shell, BrowserWindow } from 'electron';
import http from 'http';
import url from 'url';
import crypto from 'crypto';

/** 현재 실행 중인 OAuth 로컬 서버 (하나만 허용) */
let oauthServer: http.Server | null = null;
/** 사용자 취소 시 pending Promise를 즉시 reject 하기 위한 핸들 */
let pendingReject: ((err: Error) => void) | null = null;

/** PKCE code verifier 생성 (43~128자 base64url) */
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/** PKCE code challenge 생성 (S256) */
function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

/**
 * HTML 출력을 위한 최소 escape — 콜백 에러 페이지에 Google 이 보낸
 * `error` 파라미터를 그대로 노출하지 않기 위함.
 */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 콜백 성공 페이지 — `window.close()` 자동 닫기 시도 + 5초 카운트다운 + 폴백 안내.
 *
 * Chrome/Edge 는 `window.opener` 가 없거나 사용자 액션으로 열린 탭이 아닐 때
 * `window.close()` 를 거부할 수 있으므로, 거부되면 사용자가 직접 닫도록 안내한다.
 *
 * **export 사유**: 메타테스트 ([oauth.callback-html.test.ts]) 에서 `window.close()`
 * 스크립트와 카운트다운이 포함되어 있음을 검증.
 */
export function buildCallbackSuccessHtml(): string {
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>쌤핀 인증 완료</title></head>
<body style="font-family: 'Noto Sans KR', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #0a0e17; color: #e2e8f0;">
  <div style="text-align: center; max-width: 420px; padding: 0 24px;">
    <h1 style="font-size: 48px; margin-bottom: 16px;">&#x2705;</h1>
    <h2 style="margin: 0 0 12px;">쌤핀 인증 완료!</h2>
    <p id="countdown" style="color: #94a3b8; margin: 0;">잠시 후 이 창이 자동으로 닫혀요...</p>
    <p style="font-size: 13px; color: #64748b; margin-top: 24px;">
      창이 닫히지 않으면 직접 닫고 쌤핀으로 돌아가세요.
    </p>
  </div>
  <script>
    (function() {
      var n = 5;
      var el = document.getElementById('countdown');
      function render() { el.textContent = n + '초 후 자동으로 닫힙니다...'; }
      render();
      var tick = setInterval(function() {
        n -= 1;
        if (n > 0) { render(); return; }
        clearInterval(tick);
        el.textContent = '창을 닫는 중입니다...';
        try { window.close(); } catch (e) { /* 브라우저가 거부하면 무시 */ }
      }, 1000);
    })();
  </script>
</body></html>`;
}

/**
 * 콜백 실패 페이지 — Google 이 보낸 `error` 파라미터를 escape 해서 노출하고,
 * 실패 케이스도 동일하게 자동 닫기 시도(단 10초로 더 길게 — 사용자가 사유를 읽도록).
 *
 * @param error Google 의 `error` 파라미터(예: `access_denied`) 또는 빈 문자열
 */
export function buildCallbackErrorHtml(error: string): string {
  const safeError = escapeHtml(error || '알 수 없는 오류가 발생했습니다.');
  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>쌤핀 인증 실패</title></head>
<body style="font-family: 'Noto Sans KR', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #0a0e17; color: #e2e8f0;">
  <div style="text-align: center; max-width: 420px; padding: 0 24px;">
    <h1 style="font-size: 48px; margin-bottom: 16px;">&#x274C;</h1>
    <h2 style="margin: 0 0 12px;">인증 실패</h2>
    <p style="color: #94a3b8; margin: 0;">${safeError}</p>
    <p id="countdown" style="color: #64748b; font-size: 13px; margin-top: 16px;">잠시 후 이 창이 자동으로 닫혀요...</p>
    <p style="font-size: 13px; color: #64748b; margin-top: 16px;">
      창이 닫히지 않으면 직접 닫고 쌤핀에서 다시 시도해주세요.
    </p>
  </div>
  <script>
    (function() {
      var n = 10;
      var el = document.getElementById('countdown');
      function render() { el.textContent = n + '초 후 자동으로 닫힙니다...'; }
      render();
      var tick = setInterval(function() {
        n -= 1;
        if (n > 0) { render(); return; }
        clearInterval(tick);
        el.textContent = '창을 닫는 중입니다...';
        try { window.close(); } catch (e) { /* 브라우저가 거부하면 무시 */ }
      }, 1000);
    })();
  </script>
</body></html>`;
}

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
   * 2) PKCE code verifier/challenge 생성 + authUrl 에 code_challenge 주입
   * 3) 시스템 브라우저에서 authUrl 열기
   * 4) 리다이렉트로 code 수신 후 반환 (code_verifier 동봉 — 렌더러가 토큰 교환에 사용)
   *
   * 데스크톱 앱은 Google "Desktop app"(installed) OAuth 클라이언트라 client_secret 없이
   * PKCE 만으로 토큰을 교환한다. (security-hardening P0-C / 감사 F-2)
   *
   * @param authUrl Google OAuth 인증 URL (redirect_uri placeholder 포함)
   * @returns { code, redirectUri, codeVerifier }
   */
  ipcMain.handle(
    'oauth:start',
    async (
      _event,
      authUrl: string,
    ): Promise<{ code: string; redirectUri: string; codeVerifier: string }> => {
      console.log('[oauth] oauth:start invoked');
      // 이전 호출에서 남아있을 수 있는 pending Promise 정리
      if (pendingReject) {
        pendingReject(new Error('OAuth cancelled — superseded by new request'));
        pendingReject = null;
      }

      // 이 인증 흐름에서 쓸 PKCE 페어 생성
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);

      // 로컬 서버 바인딩 가능 여부 사전 확인
      const canBind = await canBindLocalhost();
      console.log('[oauth] canBindLocalhost', canBind);
      if (!canBind) {
        // localhost 차단 → 즉시 PKCE 폴백 제안 (30초 대기 없이)
        console.log('[oauth] localhost 바인딩 불가 — PKCE 폴백 즉시 제안');
        getMainWindow()?.webContents.send('oauth:fallback-needed', {
          reason: 'LOCALHOST_BLOCKED',
          message:
            '학교 보안 프로그램이 연결을 차단하고 있어요. 다른 방법으로 로그인할 수 있습니다.',
          elapsedSec: 0,
        });
        // throw하지 않고 Promise를 유지 — PKCE 폴백이 처리하므로
        // 렌더러의 startAuth에서 fallbackCleanup이 이벤트를 수신하여 모달 표시
        // 10분 타임아웃 또는 oauth:cancel로 종료
        return new Promise<{ code: string; redirectUri: string; codeVerifier: string }>(
          (_, reject) => {
            pendingReject = reject;
            setTimeout(
              () => {
                if (pendingReject === reject) {
                  pendingReject = null;
                  reject(new Error('OAuth timeout — localhost blocked, PKCE fallback offered'));
                }
              },
              10 * 60 * 1000,
            );
          },
        );
      }

      return new Promise<{ code: string; redirectUri: string; codeVerifier: string }>(
        (resolve, reject) => {
          let resolvedRedirectUri: string | null = null;
          pendingReject = reject;
          const wrappedResolve = (code: string) => {
            if (pendingReject === reject) pendingReject = null;
            if (!resolvedRedirectUri) {
              reject(new Error('OAuth internal error: redirect_uri 미확정 상태에서 code 수신'));
              return;
            }
            console.log('[oauth] IPC promise resolving', {
              hasCode: Boolean(code),
              redirectUri: resolvedRedirectUri,
            });
            resolve({ code, redirectUri: resolvedRedirectUri, codeVerifier });
          };
          const wrappedReject = (err: Error) => {
            if (pendingReject === reject) pendingReject = null;
            reject(err);
          };

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
            console.log('[oauth] callback request', { url: req.url, path: parsedUrl.pathname });

            if (parsedUrl.pathname === '/callback') {
              callbackReceived = true;
              if (fallbackTimer) {
                clearTimeout(fallbackTimer);
                fallbackTimer = null;
              }

              const code = parsedUrl.query['code'] as string | undefined;
              const error = parsedUrl.query['error'] as string | undefined;
              console.log('[oauth] callback parsed', { hasCode: Boolean(code), error });

              // 성공/실패 페이지 표시 (자동 닫기 스크립트 포함)
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });

              if (code) {
                res.end(buildCallbackSuccessHtml());
                console.log('[oauth] resolving IPC promise with code');
                wrappedResolve(code);
              } else {
                // access_denied인 경우 (사용자 한도 초과 포함) — 전용 에러 코드 전송
                if (error === 'access_denied') {
                  getMainWindow()?.webContents.send('oauth:error', {
                    code: 'ACCESS_DENIED',
                    message: '구글 인증이 거부되었습니다.',
                  });
                }

                res.end(buildCallbackErrorHtml(error ?? ''));
                wrappedReject(new Error(error ?? 'OAuth failed'));
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
            if (fallbackTimer) {
              clearTimeout(fallbackTimer);
              fallbackTimer = null;
            }
            // 렌더러에 에러 전달 → UI에서 안내 표시
            getMainWindow()?.webContents.send('oauth:error', {
              code: 'SERVER_START_FAILED',
              message: err.message,
            });
            wrappedReject(new Error(`OAuth 로컬 서버 시작 실패: ${err.message}`));
          });

          // 임의 포트로 서버 시작
          server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
              wrappedReject(new Error('Failed to start OAuth server'));
              return;
            }

            oauthServer = server;
            const port = address.port;
            const redirectUri = `http://127.0.0.1:${port}/callback`;
            // 클로저 변수에 저장 — 콜백 도착 시 wrappedResolve가 사용
            resolvedRedirectUri = redirectUri;
            console.log('[oauth] server listening', { redirectUri });

            // authUrl의 placeholder redirect_uri를 실제 포트로 교체
            let finalUrl = authUrl.replace(
              /redirect_uri=[^&]*/,
              `redirect_uri=${encodeURIComponent(redirectUri)}`,
            );

            // PKCE code_challenge 주입 (getAuthUrl 은 codeChallenge 를 받지 않은 채 호출되므로
            // 여기서 추가한다 — Desktop app 클라이언트는 client_secret 대신 PKCE 로 교환)
            if (finalUrl.includes('code_challenge=')) {
              finalUrl = finalUrl.replace(
                /code_challenge=[^&]*/,
                `code_challenge=${codeChallenge}`,
              );
            } else {
              finalUrl += `&code_challenge=${codeChallenge}&code_challenge_method=S256`;
            }

            // 시스템 브라우저에서 인증 URL 열기
            shell.openExternal(finalUrl);

            // 렌더러에 redirect_uri 전달 (구버전 호환용 — 신규 코드는 IPC 응답의 redirectUri 사용)
            getMainWindow()?.webContents.send('oauth:redirect-uri', redirectUri);

            // 30초 콜백 미수신 → PKCE 폴백 제안
            // 브라우저→localhost 접근이 보안 프로그램에 의해 차단된 경우를 감지한다.
            // 서버는 종료하지 않음 — 사용자가 폴백을 거부하고 기다릴 수 있으므로.
            fallbackTimer = setTimeout(() => {
              if (!callbackReceived && oauthServer) {
                getMainWindow()?.webContents.send('oauth:fallback-needed', {
                  reason: 'CALLBACK_TIMEOUT',
                  message:
                    '30초 동안 인증 응답이 없습니다. 보안 프로그램이 연결을 차단하고 있을 수 있어요.',
                  elapsedSec: 30,
                });
              }
            }, 30_000);
          });

          // 10분 타임아웃 (학교 Google Workspace 계정의 추가 인증 단계 고려)
          setTimeout(
            () => {
              if (oauthServer) {
                oauthServer.close();
                oauthServer = null;
                if (fallbackTimer) {
                  clearTimeout(fallbackTimer);
                  fallbackTimer = null;
                }
                getMainWindow()?.webContents.send('oauth:error', {
                  code: 'TIMEOUT',
                  message: '인증 시간이 초과되었습니다.',
                });
                wrappedReject(new Error('OAuth timeout (10 minutes)'));
              }
            },
            10 * 60 * 1000,
          );
        },
      );
    },
  );

  /**
   * oauth:cancel — OAuth 인증 취소 (로컬 서버 종료 + pending Promise reject)
   */
  ipcMain.handle('oauth:cancel', (): void => {
    if (oauthServer) {
      oauthServer.close();
      oauthServer = null;
    }
    if (pendingReject) {
      pendingReject(new Error('OAuth cancelled by user'));
      pendingReject = null;
    }
  });
}
