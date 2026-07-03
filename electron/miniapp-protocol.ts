/**
 * 미니앱("내가 만든 앱") 격리 실행용 커스텀 프로토콜(`miniapp://`).
 *
 * 교사가 AI로 만든 단일 HTML 웹앱을 쌤핀 안에서 **격리 실행**하기 위한 저수준 코어다.
 * 신뢰 경계는 "코드"가 아니라 "런타임 샌드박스"다 — 다음 3층으로 격리를 보증한다.
 *
 *   1) origin 분리 : `miniapp://<appId>/` 앱마다 host(=origin)가 달라 브라우저 SOP가
 *                    localStorage/IndexedDB를 앱 간 자동 격리한다.
 *   2) 단일 partition : 미니앱은 모두 `persist:miniapps` 세션에서 실행돼 쌤핀 본체
 *                    (기본 세션·`persist:tools`)와 스토리지가 분리된다.
 *   3) 경로 검증 + CSP : 프로토콜 핸들러가 앱 폴더 밖 접근을 403으로 막고,
 *                    모든 응답에 enforce CSP 헤더를 강제 주입한다.
 *
 * ⚠️ 이 모듈은 **메인 프로세스 전용**이다. `registerMiniAppScheme`/`registerMiniAppProtocol`은
 *    함수라 모듈 로드 시 부작용이 없으므로, preload 번들로 새어들지 않도록 순수하게 유지한다
 *    (esbuild가 preload에서 트리셰이킹으로 제거 가능).
 *
 * 설계 문서: docs/01-plan/features/miniapp-my-apps.plan.md §3
 */

import { protocol, session } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

/**
 * 미니앱 전용 세션 partition. 쌤핀 본체와 저장소(쿠키·스토리지)를 분리하는 경계.
 * `<webview partition="persist:miniapps">` 와 `session.fromPartition(...)` 양쪽에서 이 값을 쓴다.
 */
export const MINIAPP_PARTITION = 'persist:miniapps';

/**
 * 등록된 미니앱 id 형식 — 영숫자·하이픈·언더스코어 1~64자.
 * `electron/ipc/miniapp.ts`의 `assertSafeAppId`와 동일 규칙(경로 조작 원천 차단).
 */
const SAFE_APP_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * `miniapp` 스킴을 특권 스킴으로 등록한다 (**app ready 이전 1회** 호출 필수).
 *
 * - `standard: true`  : `miniapp://host/path` 형식의 표준 origin 파싱(호스트=appId) 활성화.
 * - `secure: true`    : 안전 컨텍스트로 취급(https 유사) → SubtleCrypto·secure 쿠키 등 동작.
 * - `supportFetchAPI: false` / `corsEnabled: false` : 미니앱은 자기 origin fetch가 불필요
 *   (리소스는 `<script src>`/`<img>` 등으로 로드). 죽은 권한을 열지 않아 표면을 최소화.
 */
export function registerMiniAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'miniapp',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: false,
        corsEnabled: false,
      },
    },
  ]);
}

/**
 * 미니앱 응답에 강제 주입할 Content-Security-Policy 문자열(순수함수, enforce).
 *
 * 본체 CSP(Report-Only)와 달리 미니앱은 신뢰 불가 코드이므로 처음부터 enforce한다.
 * 1단계는 데이터 창구가 없어 유출할 학생 정보가 없으므로 `connect-src https:`로 인터넷을
 * 일부 허용(CDN·공개 API 즉시 동작). 평문 http·플러그인(`object-src 'none'`)·프레임
 * 임베드(`frame-ancestors 'none'`)는 차단한다. (2단계 데이터 창구 도입 시 재조임.)
 */
export function buildMiniAppCsp(): string {
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline' https: miniapp:",
    "style-src 'unsafe-inline' https: miniapp:",
    'img-src https: data: blob: miniapp:',
    'font-src https: data: miniapp:',
    'media-src https: data: blob: miniapp:',
    'connect-src https:',
    'worker-src blob:',
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join('; ');
}

/**
 * `miniapp://<appId>/<urlPath>` 요청을 실제 디스크 경로로 해석한다(순수함수).
 *
 * 앱 루트(`<root>/<appId>`) 밖으로 벗어나는 모든 경로를 거부해 path traversal을 막는다.
 * - appId : 영숫자·`-`·`_`만 허용(`..`·경로 구분자·드라이브문자 원천 차단).
 * - urlPath : `decodeURIComponent` 후 선행 슬래시 제거(정상 URL pathname 상대화).
 *   남은 절대경로/드라이브문자(`C:` 등)는 탈출로 간주해 거부, `..`는 정규화 후 경계 검사로 차단.
 *
 * @returns 경계 안이면 `{ ok: true, filePath }`, 아니면 `{ ok: false }`.
 */
export function resolveMiniAppFilePath(
  root: string,
  appId: string,
  urlPath: string,
): { ok: true; filePath: string } | { ok: false } {
  // appId 정규화 — 상위 폴더 이탈·경로 구분자·드라이브문자를 원천 차단.
  if (!SAFE_APP_ID.test(appId)) {
    return { ok: false };
  }
  const appRoot = path.resolve(root, appId);

  // urlPath 디코드(빈 값·루트는 index.html). 잘못된 % 인코딩은 거부.
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath || 'index.html');
  } catch {
    return { ok: false };
  }
  // URL pathname의 선행 슬래시를 벗겨 상대 경로화. 남는 절대/드라이브 경로는 탈출로 간주.
  const relative = decoded.replace(/^[/\\]+/, '') || 'index.html';
  if (path.isAbsolute(relative) || /^[A-Za-z]:/.test(relative)) {
    return { ok: false };
  }

  // 결합 → 정규화(path.resolve가 `..`를 계산) → 앱 루트 경계 안이어야 통과.
  const filePath = path.resolve(appRoot, relative);
  if (filePath !== appRoot && !filePath.startsWith(appRoot + path.sep)) {
    return { ok: false };
  }
  return { ok: true, filePath };
}

/** 파일 확장자 → Content-Type 추정. 미지정은 application/octet-stream. */
function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
    case '.htm':
      return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.ico':
      return 'image/x-icon';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    case '.ttf':
      return 'font/ttf';
    case '.txt':
      return 'text/plain; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

/**
 * 미니앱 partition 세션에 `miniapp` 프로토콜 핸들러를 등록한다(**app ready 이후 1회**).
 *
 * ⚠️ `protocol.handle`은 호출한 세션에만 붙는다 → 반드시 `persist:miniapps` 세션에 등록해야
 *    하며 defaultSession에 붙이면 안 된다(본체와 격리 붕괴). 단일 partition이라 1회 등록으로
 *    모든 앱을 커버한다(앱별 재등록 불필요).
 *
 * @param userDataRoot `app.getPath('userData')` 결과. 앱 파일은 `<userData>/miniapps/<id>/`.
 */
export function registerMiniAppProtocol(userDataRoot: string): void {
  const miniappsRoot = path.join(userDataRoot, 'miniapps');
  const miniappSession = session.fromPartition(MINIAPP_PARTITION);

  miniappSession.protocol.handle('miniapp', async (request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      // host = appId, pathname = 앱 폴더 내 상대 경로.
      const resolved = resolveMiniAppFilePath(miniappsRoot, url.hostname, url.pathname);
      if (!resolved.ok) {
        console.warn('[miniapp] blocked path traversal:', request.url);
        return new Response('Forbidden', { status: 403 });
      }

      let buf: Buffer;
      try {
        buf = await fs.promises.readFile(resolved.filePath);
      } catch {
        // 파일 없음(또는 읽기 불가) → 404. 경로·내용은 로그에 남기지 않는다.
        return new Response('Not Found', { status: 404 });
      }

      const body = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': contentTypeFor(resolved.filePath),
          'Content-Security-Policy': buildMiniAppCsp(),
        },
      });
    } catch (err) {
      console.warn('[miniapp] handler error:', err instanceof Error ? err.message : String(err));
      return new Response('Bad Request', { status: 400 });
    }
  });
}
