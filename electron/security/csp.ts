/**
 * Content-Security-Policy — 메인 앱(`file://.../dist/index.html`)용 CSP 정책.
 *
 * security-hardening PDCA P1-2 / 보안 감사 M-1 ("CSP 부재") 대응.
 *
 * ── 도입 단계 ──────────────────────────────────────────────────────────
 *   1단계 (이번 PR): `Content-Security-Policy-Report-Only` 헤더만 부착.
 *                     아무것도 차단하지 않음 — DevTools/메인 콘솔에 위반만 보고됨.
 *                     수 주간 패키지 빌드에서 위반 로그를 관찰해 화이트리스트를 보정한다.
 *   2단계 (후속 PR): 위반이 0(또는 의도된 화이트리스트만)임을 확인한 뒤
 *                     `attachCsp({ reportOnly: false })` 로 → enforce 헤더로 전환.
 *
 * ── dev / prod 분기 ────────────────────────────────────────────────────
 *   dev 모드(`process.env.VITE_DEV_SERVER_URL` 존재)는 Vite HMR 이 inline `<script>`,
 *   `eval`, `ws://localhost` 를 쓰므로 CSP 를 붙이지 않는다(main.ts 가 prod 일 때만 호출).
 *   본 정책은 패키지(`file://`) 빌드 전용.
 *
 * ── 'unsafe-eval' 금지 ─────────────────────────────────────────────────
 *   M-1 의 핵심은 Electron 보안 경고가 `unsafe-eval` 을 지목한다는 것. 따라서
 *   `script-src` 에 `'unsafe-eval'` 을 절대 넣지 않는다. 어떤 의존성이 `eval`/
 *   `new Function` 을 쓴다면 Report-Only 단계에서 위반으로 드러나며, 그건 별도 이슈로
 *   처리한다(여기서 'unsafe-eval' 을 추가해 무마하지 않는다).
 *
 * ── 'unsafe-inline' 의 현실 ────────────────────────────────────────────
 *   - `style-src 'unsafe-inline'`: Tailwind/런타임(차트·드래그·테마 변수 등)이 inline
 *     `style=""` 속성을 다수 주입하고, `index.html` 에 splash 인라인 `<style>` 블록이 있음.
 *     nonce/hash 로 전부 잡기엔 비용이 크므로 현실적으로 `'unsafe-inline'` 유지.
 *   - `script-src`: Vite 빌드 산출물의 진입점은 외부 `.js` 파일이라 `'self'` 로 충분.
 *     단 `index.html` 의 폰트 `<link ... onload="this.media='all'">` 같은 inline 이벤트
 *     핸들러 속성이 있어 `script-src-attr 'unsafe-inline'` 을 별도로 둔다(`script-src` 본체는
 *     `'unsafe-inline'` 없이 유지 — eval 차단 효과 보존). 인라인 `<script>` 태그가 아니라
 *     *속성* 핸들러용이므로 폭발 반경이 매우 작다.
 *
 * ── 화이트리스트 출처 (코드에서 확인) ─────────────────────────────────
 *   img-src    : 'self' data: blob: ssampin-slides: https:
 *                  — 첨부/아이콘 미리보기, Interactive Slides 이미지 스킴(main.ts 에서
 *                    `bypassCSP: true` 로 등록돼 있지만 명시도 함), 담벼락 OG 미리보기·
 *                    교사 카드 이미지(임의 https origin), `lh3.googleusercontent.com` 등.
 *   font-src   : 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net
 *                  — Noto Sans KR / Material Symbols / JetBrains Mono(Google Fonts) +
 *                    Pretendard Variable(jsDelivr).
 *   style-src  : 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net
 *                  — Tailwind/런타임 inline style + splash + Google Fonts CSS + Pretendard CSS.
 *   connect-src: 'self' data: blob:
 *                https://api.weatherapi.com           — 날씨
 *                https://open.neis.go.kr              — NEIS 급식/학사
 *                https://*.supabase.co                — 챗봇/과제/동기화/분석/단축링크
 *                https://www.googleapis.com           — Calendar/Tasks/Drive/Slides/userinfo
 *                https://oauth2.googleapis.com        — OAuth 토큰 교환/폐기
 *                https://accounts.google.com          — OAuth authorize
 *                https://ssampin.com                  — release-notes.json
 *                https://cdn.jsdelivr.net             — 폰트 CSS 가 참조하는 리소스
 *                ws: wss:                             — 실시간 담벼락 cloudflared 터널 /
 *                                                       YDoc 보드 / 슬라이드 WS
 *   frame-src  : https://www.youtube-nocookie.com     — 담벼락 카드 YouTube 임베드
 *   media-src  : 'self' data: blob:
 *   worker-src : 'self' blob:
 *   object-src : 'none'                               — 플러그인 차단
 *   base-uri   : 'self'
 *   form-action: 'self'
 *   frame-ancestors: 'none'                           — 클릭재킹 방어(file:// 라 무의미하지만 명시)
 *   default-src: 'self'
 *
 * 참고: `student.html` / `mobile.html` / `slides-student.html` 은 로컬 http 서버로 서빙되는
 * 별개 컨텍스트이며 이미 각자 `<meta http-equiv="Content-Security-Policy">` enforce CSP 를
 * 가지고 있다(이번 PR 범위 밖). `index.html` 의 `<meta http-equiv>` 방식은 쓰지 않는다 — 헤더 단일화.
 *
 * Design 문서: docs/02-design/features/security-hardening.design.md §3 P1-2 / §4
 * 감사:        docs/03-analysis/security-audit.analysis.md M-1
 */

import { app, session } from 'electron';

/**
 * 메인 앱 CSP 디렉티브 문자열을 만든다.
 *
 * Report-Only / enforce 모두 같은 정책 본문을 쓰며, 차이는 헤더 이름뿐이다
 * (`attachCsp` 의 `reportOnly` 옵션 참고).
 */
export function buildAppCsp(): string {
  const directives: Record<string, readonly string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    // 인라인 이벤트 핸들러 속성(예: index.html 의 <link onload="...">) 전용.
    // 인라인 <script> 태그가 아니므로 폭발 반경이 작고, script-src 본체는 'unsafe-inline' 없이 유지.
    'script-src-attr': ["'unsafe-inline'"],
    'style-src': [
      "'self'",
      "'unsafe-inline'",
      'https://fonts.googleapis.com',
      'https://cdn.jsdelivr.net',
    ],
    'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
    'img-src': ["'self'", 'data:', 'blob:', 'ssampin-slides:', 'https:'],
    'connect-src': [
      "'self'",
      'data:',
      'blob:',
      'https://api.weatherapi.com',
      'https://open.neis.go.kr',
      'https://*.supabase.co',
      'https://www.googleapis.com',
      'https://oauth2.googleapis.com',
      'https://accounts.google.com',
      'https://ssampin.com',
      'https://cdn.jsdelivr.net',
      'ws:',
      'wss:',
    ],
    'media-src': ["'self'", 'data:', 'blob:'],
    'frame-src': ['https://www.youtube-nocookie.com'],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };

  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

export interface AttachCspOptions {
  /**
   * `true`(기본) → `Content-Security-Policy-Report-Only` 헤더(아무것도 차단 안 함).
   * `false` → `Content-Security-Policy`(enforce). **enforce 전환은 후속 PR.**
   */
  reportOnly?: boolean;
}

/**
 * `session.defaultSession.webRequest.onHeadersReceived` 로 CSP 헤더를 모든 응답에 부착한다.
 *
 * - **prod 전용**: main.ts 에서 `process.env.VITE_DEV_SERVER_URL` 가 없을 때만 호출.
 * - 기존 응답 헤더에 CSP 가 있으면(드물지만) 우리 헤더로 덮어쓴다(헤더는 하나만).
 *
 * `app.whenReady()` 이후 호출해야 한다(`session.defaultSession` 접근 가능 시점).
 */
export function attachCsp(opts: AttachCspOptions = {}): void {
  const reportOnly = opts.reportOnly ?? true;
  const headerName = reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
  const policy = buildAppCsp();

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(details.responseHeaders ?? {})) {
      const lower = key.toLowerCase();
      if (lower === 'content-security-policy' || lower === 'content-security-policy-report-only') {
        continue; // CSP 류는 우리가 단일 소스 — 기존 것 제거
      }
      responseHeaders[key] = Array.isArray(value) ? value : [value];
    }
    responseHeaders[headerName] = [policy];
    callback({ responseHeaders });
  });
}

/**
 * 모든 `webContents` 의 `console-message` 이벤트에서 CSP 위반(Report-Only 포함)을
 * 메인 프로세스 콘솔에 가볍게 남긴다.
 *
 * 정식 `report-uri`/`report-to` 엔드포인트는 만들지 않는다(과함) — Chromium 이 CSP 위반을
 * 렌더러 콘솔에 `Refused to ... because it violates the following Content Security Policy
 * directive ...` 로 찍으므로 그 메시지를 메인 콘솔로 끌어와 패키지 빌드 로그에서도 보이게 한다.
 */
export function installCspViolationLogger(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('console-message', (details) => {
      const { message, lineNumber, sourceId } = details;
      if (message.includes('Content Security Policy')) {
        console.warn(`[CSP violation] ${message} (${sourceId}:${lineNumber})`);
      }
    });
  });
}
