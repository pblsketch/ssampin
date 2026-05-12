# security-hardening 설계 문서

> **Summary**: 보안 감사([`security-audit.analysis.md`](../../03-analysis/security-audit.analysis.md)) P0 항목의 구체 설계 — ① 유출 토큰 스크럽(로테이션은 사용자 Supabase 작업) ② `GOOGLE_CLIENT_SECRET` 렌더러 번들 주입 제거 ③ 렌더러→메인 IPC 신뢰 경계 5종(`shell:openExternal`/`shell:openPath`/`export:openFile`/`export:writeFile`/`calendar:fetch-url`). P1(코드 서명·CSP·CI 보안 게이트·Edge Function rate limit)은 스케치만.
>
> **Project**: 쌤핀 (SsamPin)
> **Version**: (P0 = 다음 정식 릴리즈 게이트)
> **Author**: pblsketch
> **Date**: 2026-05-12
> **Status**: Draft
> **Planning Doc**: [security-hardening.plan.md](../../01-plan/features/security-hardening.plan.md)
> **Audit**: [security-audit.analysis.md](../../03-analysis/security-audit.analysis.md)

### Pipeline References

| Phase | Document | Status |
|-------|----------|--------|
| 1~4 | — | N/A (보안 패치 + IPC 경계 + 빌드/CI) |

---

## 1. Overview

### 1.1 Design Goals

1. 공개 저장소에 평문 시크릿이 남지 않게 한다 (`ADMIN_API_KEY`, `GOOGLE_CLIENT_SECRET`).
2. 렌더러는 **이름으로 임의 파일/URL 을 지정해 메인이 그 위치에 쓰거나 열게 할 수 없다** — 메인이 발급한 핸들(토큰)이나 화이트리스트만 통한다.
3. 외부 URL 페치(`calendar:fetch-url`)는 `realtimeWallLinkPreview.ts` 와 동일한 SSRF/리바인딩/크기 방어를 공유한다.
4. 위 변경이 기존 기능(내보내기 저장·열기, 데이터 폴더 열기, 캘린더 구독, OAuth 로그인)을 깨지 않는다.

### 1.2 Design Principles

- **Capability over name**: 렌더러가 `filePath` 문자열을 메인에 던지는 패턴 → 메인이 dialog 로 경로를 정한 뒤 그 결과를 가리키는 1회용 핸들을 발급, 후속 IPC 는 핸들만 받는다. 렌더러는 경로 문자열을 만질 수 없다.
- **Reuse the good guard**: SSRF 방어를 새로 짜지 않고 `realtimeWallLinkPreview.ts` 의 검증된 9중 방어(`isPrivateIP`/`resolveAndVetHost`/`pinDispatcher`/`fetchSingleHop`+`MAX_REDIRECTS`/`MAX_RESPONSE_BYTES`)를 `electron/security/safeFetch.ts` 로 추출해 양쪽이 import.
- **Rotation is the user's**: 토큰 실효는 Supabase 대시보드 작업(코드 밖). 본 PDCA 의 코드 변경은 "스크럽 + 향후 노출 방지"만. 단 P0 완료 판정은 *로테이션이 끝난 뒤* — 안 그러면 placeholder 만 남고 유효 토큰은 git history 에 그대로.
- **CSP/서명은 단계적**: CSP 는 `Report-Only` 로 먼저, 코드 서명은 인증서 조달 일정에 따라 P1 독립 트랙.

---

## 2. Architecture

### 2.1 영향 범위

```
electron/
  main.ts                         ← IPC 핸들러 5종 교체 (+ dialogHandleRegistry 사용)
  security/                        ← 신규 디렉토리
    safeFetch.ts                   ← realtimeWallLinkPreview.ts 에서 추출한 SSRF-안전 fetch (신규)
    dialogHandles.ts               ← 저장/열기 dialog 가 발급하는 1회용 경로 핸들 레지스트리 (신규)
  ipc/
    realtimeWallLinkPreview.ts     ← safeFetch.ts 를 import 하도록 리팩토링 (동작 동등)
  preload.ts                       ← export:* / shell:* API 시그니처 변경 반영
src/adapters/...                   ← 내보내기 호출부(showSaveDialog→writeFile 흐름) 핸들 기반으로 수정
vite.config.ts / vite.mobile.config.ts  ← GOOGLE_CLIENT_SECRET define 제거
src/...(OAuth 토큰 교환부)          ← secret 사용처 제거 또는 Edge Function 호출로 변경 (P0-2, 스파이크 후 확정)
docs/02-design/features/dual-tool-view.design.md       ← 토큰 placeholder
docs/04-report/features/realtime-wall-padlet-mode.report.md  ← 토큰 placeholder
docs/archive/2026-04/릴리즈_v1.10.3_kickoff.md           ← 토큰 placeholder
(프로젝트 메모리 MEMORY.md §3)                            ← 토큰 placeholder (repo 밖, 일관성)
--- P1 ---
electron/main.ts (onHeadersReceived) 또는 index.html     ← CSP
electron-builder.yml + .github/workflows/                ← Win 코드 서명 + Win 빌드 CI 이전
.github/workflows/ci.yml                                  ← npm audit 게이트
.github/dependabot.yml + (CodeQL workflow)                ← 신규
supabase/config.toml                                      ← 저장소 추가
supabase/functions/ssampin-escalate/, submit-assignment/  ← rate limit + 에러 메시지 일반화
```

> domain/usecases 무변경. IPC 검증·SSRF·핸들 레지스트리는 전부 `electron/` 안 (infrastructure 상당).

### 2.2 dialog 핸들 흐름 (P0-3 핵심)

```
[기존]
 renderer ── export:showSaveDialog(opts) ──▶ main: dialog.showSaveDialog → filePath(문자열) ──▶ renderer
 renderer ── export:writeFile(filePath, data) ──▶ main: fs.writeFileSync(filePath, data)   ← 임의 경로!
 renderer ── export:openFile(filePath)       ──▶ main: shell.openPath(filePath)             ← 임의 경로/실행!

[변경]
 renderer ── export:showSaveDialog(opts) ──▶ main:
                dialog.showSaveDialog → filePath
                handle = dialogHandles.issue(filePath, {write:true, open:true})  // crypto.randomUUID, TTL 5분, 1회 write
                ──▶ renderer  { handle, fileName }     // 경로 문자열은 안 줌(표시용 basename 만)
 renderer ── export:writeFile({ handle, data }) ──▶ main:
                fp = dialogHandles.consumeForWrite(handle)   // 없거나 만료/이미소비면 throw
                fs.writeFileSync(fp, data)
 renderer ── export:openFile({ handle }) ──▶ main:
                fp = dialogHandles.peekForOpen(handle)       // open 은 소비 안 함(같은 파일 여러 번 열 수 있음), 단 TTL 적용
                shell.openPath(fp)
```

- 마찬가지로 `dialog:showOpen` / 각종 `*:openFile`(picker) 가 반환하는 경로도 `dialogHandles.issue(..., {open:true})` 로 감싸서, "메인이 dialog 로 사용자에게 직접 받은 경로"만 후속 IPC 대상이 되게 한다.
- `shell:openPath(folderPath)` (탐색기로 폴더 열기): 두 경로 중 하나만 허용 — (a) `dialogHandles` 에 등록된 경로의 `path.dirname`, 또는 (b) `app.getPath('userData'|'downloads'|'documents'|'desktop'|'temp'|'home')` 와 그 하위. 그 외 절대경로/`..` 거부.

### 2.3 safeFetch 모듈 (P0-3 calendar)

`electron/security/safeFetch.ts` — `realtimeWallLinkPreview.ts` 에서 추출:
```ts
export interface SafeFetchOptions {
  maxBytes?: number;       // 기본 1 MiB (캘린더 ICS 는 크다 — link-preview 의 256 KiB 보다 큼)
  maxRedirects?: number;   // 기본 3
  timeoutMs?: number;      // 기본 30_000
  allowedContentTypes?: string[]; // 선택 (캘린더는 text/calendar, text/plain 허용)
}
// http(s) 만, hostname → DNS resolve → 모든 A/AAAA 가 공인 IP 인지 검증(isPrivateIP) → 그 IP 로 핀(undici Agent, DNS 리바인딩 차단)
// → 최대 N hop(매 hop 마다 재검증) → 응답 maxBytes 초과 시 중단 → 본문 텍스트 반환
export async function safeFetchText(rawUrl: string, opts?: SafeFetchOptions): Promise<string>;
```
- `realtimeWallLinkPreview.ts` 는 `isPrivateIP`/`resolveAndVetHost`/`pinDispatcher`/`fetchSingleHop` 를 `safeFetch.ts` 로 옮기고 그걸 import (link-preview 전용 로직 — OG 파싱·이미지 sanitize 는 그대로 남김). **동작 동등성**이 핵심 — 기존 담벼락 OG 미리보기 회귀 테스트 통과 필수.
- `calendar:fetch-url` 핸들러:
```ts
ipcMain.handle('calendar:fetch-url', async (_e, url: string): Promise<string | null> => {
  try {
    return await safeFetchText(url, { maxBytes: 5 * 1024 * 1024, allowedContentTypes: ['text/calendar', 'text/plain', 'application/octet-stream'] });
  } catch { return null; }   // 기존처럼 실패 시 null (호출부 호환)
});
```

### 2.4 shell:openExternal 프로토콜 화이트리스트

```ts
const OPEN_EXTERNAL_ALLOWED = new Set(['https:', 'http:', 'mailto:']);
ipcMain.handle('shell:openExternal', (_e, url: string): void => {
  let u: URL; try { u = new URL(url); } catch { throw new Error('잘못된 URL'); }
  if (!OPEN_EXTERNAL_ALLOWED.has(u.protocol)) throw new Error(`허용되지 않은 프로토콜: ${u.protocol}`);
  void shell.openExternal(u.toString());
});
```
> `file:`/`javascript:`/`vbscript:`/`smb:`/커스텀 스킴 전부 차단. 앱 안에서 정당하게 외부로 여는 건 웹 링크와 메일뿐.

### 2.5 GOOGLE_CLIENT_SECRET 제거 (P0-2)

먼저 **스파이크**: Google Cloud Console 의 OAuth client type 확인.
- **Case A — "Desktop app"(installed) 클라이언트**: PKCE 만으로 충분 → secret 불필요. `vite.config.ts:33`·`vite.mobile.config.ts:115,117` 의 `GOOGLE_CLIENT_SECRET` define 만 제거하고, 토큰 교환 코드에서 `client_secret` 파라미터 제거(이미 PKCE `code_verifier` 보내고 있으면 끝). → 가장 깔끔.
- **Case B — "Web application" 클라이언트** (현재 ssampin.com 도메인 등록 정황상 가능성 있음): client_secret 없이는 code 교환 불가 → 교환을 **Supabase Edge Function `oauth-exchange`** 로 이전. 함수가 `GOOGLE_CLIENT_SECRET`(서버 env)을 들고 `code`+`code_verifier`+`redirect_uri` 를 받아 토큰을 돌려줌. 렌더러는 secret 을 영영 안 봄. (이미 `save-teacher-token` Edge Function 패턴 있으니 그 형태 재사용.)
- 두 경우 모두 **secret 로테이션**(Google Console) 필수 — 이미 dist 에 평문으로 배포된 적 있으므로.
- 산출물 검증: 빌드 후 `grep -r "GOCSPX\|client_secret" dist/ dist-mobile/` → 0건.

### 2.6 토큰 스크럽 (P0-1)

- `git grep -l 'ssampin-admin-2024-secure'` → 3개 docs: `docs/02-design/features/dual-tool-view.design.md:597`, `docs/04-report/features/realtime-wall-padlet-mode.report.md:437`, `docs/archive/2026-04/릴리즈_v1.10.3_kickoff.md` — 토큰 값을 `<ADMIN_API_KEY>` (또는 `$ADMIN_API_KEY`) placeholder 로 치환.
- 프로젝트 메모리 `C:\Users\wnsdl\.claude\projects\e--github-ssampin\memory\MEMORY.md` §3 의 예시 명령도 동일 치환 (repo 밖이지만 일관성).
- `scripts/ingest-chatbot-qa.mjs` 가 토큰을 하드코딩하는지 확인(현재 `git grep` 상 scripts 엔 없음 — env 로만 받는 듯). 하드코딩이면 `process.env.EMBED_AUTH_TOKEN` 만 쓰도록.
- **git history 의 토큰 문자열 제거(`git filter-repo --replace-text`)는 P2-15** — 로테이션이 실질 위협을 제거하므로 history 스크럽은 정리 차원, 별도. 본 PDCA 에선 안 함(force-push 가 협력자/포크 영향).
- ⚠️ **사용자 선행 작업**: Supabase 대시보드에서 `ssampin-embed` 의 `ADMIN_API_KEY`(=문서상 `EMBED_AUTH_TOKEN`) env 를 `openssl rand -hex 32` 새 값으로 교체. 그 전엔 스크럽해도 git history 의 옛 값이 유효.

---

## 3. P1 스케치 (이번 PDCA 후반 또는 별도)

- **P1-1 코드 서명 + Win 빌드 CI 이전**: Win — OV 코드서명 인증서(또는 Azure Trusted Signing) 발급 → `electron-builder.yml` `win.certificateFile`/`certificatePassword`(또는 Azure) → Win 빌드를 GitHub Actions 로 이전(secret 으로 인증서 주입, 빌드 PC 의존 제거). macOS — Apple Developer + `hardenedRuntime`+`entitlements`(이미 있음)+notarization → 인앱 자동업데이트 복원(`update:download` 의 mac 분기 제거 가능). **비용·조달 일정 의존 → 독립 트랙**.
- **P1-2 CSP** — ✅ **Report-Only 도입됨** (PR `feat/security-hardening-p1-2-csp`): 패키지(`file://`) 빌드에서만 `session.defaultSession.webRequest.onHeadersReceived` 로 `Content-Security-Policy-Report-Only` 헤더 부착(dev 모드는 Vite HMR 의 inline script + eval + `ws://localhost` 때문에 skip). 정책 본문은 `electron/security/csp.ts` `buildAppCsp()` 한 곳. `index.html` 메타 태그 방식은 안 씀(헤더 단일화). 위반은 `electron/security/csp.ts` `installCspViolationLogger` 가 `webContents` 의 `console-message` 에서 `[CSP violation]` 로 메인 콘솔에 가볍게 남김(정식 report-uri 엔드포인트는 안 만듦). **enforce(`Content-Security-Policy`) 전환은 후속 PR** — 패키지 빌드에서 앱 전 화면을 돌려보며 Report-Only 위반을 수 주간 관찰해 화이트리스트를 보정한 뒤 `attachCsp({ reportOnly: false })` 로 스위치.
  - **'unsafe-eval' 절대 금지** (이게 M-1 의 핵심 — Electron 경고가 unsafe-eval 을 지목). `script-src` 본체는 `'self'` 만; 인라인 이벤트 핸들러 속성(`index.html` 의 폰트 `<link onload="this.media='all'">`)용으로 `script-src-attr 'unsafe-inline'` 만 별도. `style-src 'unsafe-inline'` 은 Tailwind/런타임 inline style + splash 인라인 `<style>` 때문에 현실적으로 유지(정리는 후속). 어떤 의존성이 `eval`/`new Function` 을 쓰면 Report-Only 단계에서 위반으로 드러나며 별도 이슈로 처리(여기서 'unsafe-eval' 추가해 무마하지 않음).
  - **화이트리스트 출처**(코드에서 확인):
    - `img-src 'self' data: blob: ssampin-slides: https:` — 첨부/아이콘 미리보기, Interactive Slides 이미지 스킴(`bypassCSP: true` 등록돼 있지만 명시도 함), 담벼락 OG 미리보기·교사 카드 이미지(임의 https origin) + `lh3.googleusercontent.com` 등.
    - `font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net` — Noto Sans KR / Material Symbols / JetBrains Mono(Google Fonts) + Pretendard Variable(jsDelivr).
    - `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net` — Tailwind/런타임 inline style + splash + Google Fonts CSS + Pretendard CSS.
    - `connect-src 'self' data: blob: https://api.weatherapi.com https://open.neis.go.kr https://*.supabase.co https://www.googleapis.com https://oauth2.googleapis.com https://accounts.google.com https://ssampin.com https://cdn.jsdelivr.net ws: wss:` — 날씨 / NEIS / 챗봇·과제·동기화·분석·단축링크 / Calendar·Tasks·Drive·Slides·userinfo / OAuth 토큰·폐기 / OAuth authorize / release-notes.json / 폰트 CSS 참조 / 실시간 담벼락 cloudflared 터널·YDoc 보드·슬라이드 WS.
    - `frame-src https://www.youtube-nocookie.com` — 담벼락 카드 YouTube 임베드.
    - `media-src 'self' data: blob:`, `worker-src 'self' blob:`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`, `default-src 'self'`.
  - 참고: `student.html` / `mobile.html` / `slides-student.html` 은 로컬 http 서버로 서빙되는 별개 컨텍스트이며 이미 각자 `<meta http-equiv="Content-Security-Policy">` enforce CSP 를 갖고 있음(이번 PR 범위 밖).
- **P1-3 CI 보안 게이트**: `ci.yml` 에 `npm audit --audit-level=high`(처음 `continue-on-error` → 안정 후 게이트) + `.github/dependabot.yml`(npm + github-actions, weekly) + CodeQL workflow(`javascript-typescript`) + `supabase/config.toml` 저장소 추가(현재 누락 → IaC 가시화).
- **P1-4 Edge Function**: `ssampin-escalate` — IP/세션 기반 rate limit(예: 5/시간) + 개발자 알림 이메일을 하드코딩 → env(`ESCALATE_NOTIFY_EMAIL`) 필수. `submit-assignment` — rate limit + (선택) 과제별 학생 코드 옵션으로 위장 제출 완화. 모든 Edge Function — catch 에서 내부 에러/스택 노출 금지, 일반 메시지 + 서버 로그만.

---

## 4. 구현 순서 (Do 체크리스트)

### Phase 0 — 사용자 선행 (코드 외)
- [ ] U-1. Supabase: `ssampin-embed` 의 `ADMIN_API_KEY` 로테이션 (`openssl rand -hex 32`). 로컬 `scripts/ingest-chatbot-qa.mjs` 실행용 env 도 갱신.
- [ ] U-2. Google Cloud Console: OAuth client type 확인 → Claude 에게 알려주면 P0-2 가 Case A/B 확정. (필요 시 secret 로테이션은 P0-2 후)

### Phase P0-A — 토큰 스크럽 (PR, 사소·즉시) — ✅ 완료 (PR `feat/security-hardening-p0`)
- [x] A-1. 3개 docs 의 `ssampin-admin-2024-secure` → `<ADMIN_API_KEY>` placeholder (`dual-tool-view.design.md`, `realtime-wall-padlet-mode.report.md`, `릴리즈_v1.10.3_kickoff.md`). 프로젝트 메모리 §3 은 repo 밖 — 이 PR 범위 아님
- [x] A-2. `scripts/ingest-chatbot-qa.mjs` 토큰 하드코딩 없음 확인 — 이미 `process.env.EMBED_AUTH_TOKEN` 만 사용. 변경 불필요
- [x] A-3. `git grep -i ssampin-admin-2024-secure` → 0건 확인 + 커밋

### Phase P0-B — IPC 경계 5종 (PR) — ✅ 완료 (PR `feat/security-hardening-p0`)
- [x] B-1. `electron/security/dialogHandles.ts` — `issueWriteHandle(filePath)` / `issueOpenHandle(filePath)` / `consumeWritePath(handle)` / `peekOpenPath(handle)`, `crypto.randomUUID`, TTL 5분, write 1회 소비, lazy GC, 메모리 Map
- [x] B-2. `electron/security/safeFetch.ts` — `realtimeWallLinkPreview.ts` 에서 `isPrivateIP`/`normalizeHostname`/`resolveAndVetHost`/`pinDispatcher`/`fetchSingleHop` 추출 + `fetchFollowingRedirects` + `safeFetchText(url, opts)` (기본 maxBytes 1 MiB, maxRedirects 3, timeoutMs 30_000)
- [x] B-3. `realtimeWallLinkPreview.ts` 리팩토링 → `safeFetch.ts` 의 `fetchSingleHop`/`resolveAndVetHost` import (OG 파싱·charset 감지·이미지 sanitize·256KiB cap·HTML content-type 검사 잔류, ogs 경로 동작 동등 — 미사용 데드코드 `extractMetaContent`/`extractTitleTag`/`decodeHtmlEntities` 제거)
- [x] B-4. `main.ts` — `shell:openExternal` 프로토콜 화이트리스트 `https:`/`http:`/`mailto:` (§2.4)
- [x] B-5. `main.ts` — `shell:openPath` 경계: (a) `dialogHandles` 핸들 / (b) `app.getPath('userData'|'downloads'|'documents'|'desktop'|'home'|'temp')` 또는 하위 / (c) 디스크상 존재하는 디렉토리(PC 폴더 즐겨찾기 — 사용자가 디렉토리 picker 로 직접 고른 폴더; 폴더 열기는 코드 실행 아님, 임의 *파일* 실행은 (c)가 차단). **PC 폴더 즐겨찾기를 핸들/화이트리스트로 완전 잠그는 건 후속**(영속 `bookmark.url` 가 ephemeral 핸들과 충돌 → persistent capability 토큰 설계 필요). RG-08 의 `C:\Users\Public` 류 "존재하는 임의 디렉토리"는 (c)로 통과 — RG 갱신 필요
- [x] B-6. `main.ts` — `export:showSaveDialog` → `{handle, fileName}` 반환(경로 미반환); `export:writeFile({handle,data})` (옛 `(filePath,data)` → throw); `export:openFile({handle})`. **`dialog:showOpen`/`forms:openFile`/`audio:importAlarm`/`font:import`/`share:import`/`bookmarks:import` 등 나머지 picker 핸들화는 후속** — 이번 PR 은 임의-경로 *쓰기/실행* 누수가 있는 `export:*` 와 `shell:openPath` 만 우선(picker 들은 메인이 받은 경로를 메인 안에서만 소비; `dialog:showOpen` 만 경로 문자열을 렌더러로 돌려주지만 소비처가 picker UI 한정)
- [x] B-7. `main.ts` — `calendar:fetch-url` → `safeFetchText(url, { maxBytes: 5 MiB, allowedContentTypes: [...] })` (§2.3). `webcal://` → `https://` 정규화 추가
- [x] B-8. `preload.ts` + `src/global.d.ts` — `showSaveDialog`/`writeFile`/`openFile` 시그니처 변경 반영 (`openExternal`/`openPath` 는 string 인자 유지 — 검증은 메인)
- [x] B-9. `src/adapters/...` 15 파일 — 내보내기(시간표 HWPX·좌석/출결/명렬/관찰 Excel·일정 .ssampin·즐겨찾기/도구 그룹·담벼락 PDF 등) 호출부를 `const saved = await showSaveDialog(...)` → `writeFile(saved.handle, ...)` → `openFile(saved.handle)` 핸들 기반으로 수정. 브라우저 폴백(Blob 다운로드)은 그대로
- [ ] B-10. `npm run typecheck && lint && test && regression-check` 그린 — CI 에서 확인 (worktree node_modules 상태에 따라 로컬은 best-effort)

### Phase P0-C — GOOGLE_CLIENT_SECRET (PR)
- [ ] C-1a (데스크톱, Case A): `vite.config.ts:33` 의 `GOOGLE_CLIENT_SECRET` define 제거 + 데스크톱 토큰 교환 코드에서 `client_secret` 파라미터 제거(PKCE `code_verifier` 만 — 이미 보내고 있으면 끝)
- [ ] C-1b (모바일, Case B): Supabase Edge Function `oauth-exchange`(또는 모바일 전용) 신설 — `GOOGLE_CLIENT_SECRET`(서버 env)으로 `code`+`code_verifier`+`redirect_uri` → 토큰. 모바일 렌더러를 그 호출로 변경. `vite.mobile.config.ts:115,117` 의 `GOOGLE_CLIENT_SECRET`/`VITE_MOBILE_GOOGLE_CLIENT_SECRET` define 제거
- [ ] C-2. secret 로테이션 — 데스크톱 client + 모바일 client 둘 다 (Google Console)
- [ ] C-3. 빌드 후 `grep -rE "client_secret|GOCSPX" dist/ dist-mobile/` → 0건. OAuth 로그인(데스크톱 앱 + 모바일 PWA) 수동 RG

### Phase P1 (별도 PR 들)
- [ ] P1-1 코드 서명 + Win 빌드 CI
- [x] P1-2 CSP — **Report-Only 도입됨**(PR `feat/security-hardening-p1-2-csp`: `electron/security/csp.ts` + main.ts prod-only `attachCsp` + `installCspViolationLogger`). **enforce 전환은 후속** — 패키지 빌드 위반 관찰 후 `attachCsp({ reportOnly: false })`.
- [x] P1-3 npm audit+Dependabot+CodeQL+config.toml (PR #13)
- [x] P1-4 Edge Function rate limit·에러 일반화 (PR #31)

### Phase Check/Report
- [ ] `/pdca analyze security-hardening` (gap: 설계 vs 구현) → `/pdca report` (P0+P1 기준; P1 코드서명이 인증서 일정상 미완이면 "보류+사유"로)

---

## 5. 검증 체크리스트 (RG)

| ID | 검증 | 기대 |
|----|------|------|
| RG-01 | `git grep -i 'ssampin-admin-2024-secure'` (워킹트리) | 0건 |
| RG-02 | (사용자) 옛 `ADMIN_API_KEY` 로 `ssampin-embed` 호출 | 401/403 (실효 확인) |
| RG-03 | 빌드 후 `grep -rE "client_secret|GOCSPX" dist/ dist-mobile/` | 0건 |
| RG-04 | OAuth 로그인 — 데스크톱 앱 + 모바일 PWA | 정상 (토큰 발급·갱신·캘린더/Tasks 동기화) |
| RG-05 | 내보내기: 시간표 HWPX / 좌석 Excel / 보드 PDF / 칠판 이미지 저장 | dialog → 저장 성공 → "파일 열기" 정상 동작 |
| RG-06 | 렌더러에서 조작된 `export:writeFile({handle:'../../etc/x', data})` 류 (devtools) | throw (임의 경로 거부) |
| RG-07 | `shell:openExternal('file:///C:/Windows/system32/cmd.exe')` (devtools) | throw |
| RG-08 | `shell:openPath('C:\\Windows\\System32\\cmd.exe')` (존재하는 *파일*, 화이트리스트 밖) | throw. 단 `shell:openPath('C:\\Users\\Public')` 처럼 *존재하는 디렉토리*는 (c) 규칙으로 통과(PC 폴더 즐겨찾기 보존 — 후속에서 핸들/persistent-capability 로 강화). 데이터 폴더 열기·내보내기 폴더 열기·PC 폴더 즐겨찾기는 정상 |
| RG-09 | `calendar:fetch-url('http://169.254.169.254/...')`, `http://localhost:...`, 사설 IP, 5MiB 초과 응답 | null (차단) / 정상 ICS URL 은 구독 동작 |
| RG-10 | 담벼락 링크 붙여넣기 → OG 미리보기 | 변경 전과 동일 (safeFetch 추출 회귀 없음) — 기존 테스트 + 수동 |
| RG-11 | `npm run typecheck && lint && test && regression-check` | 그린 |
| RG-12 (P1) | 새 인스톨러 — Win 서명 검증(`signtool verify`), macOS `spctl -a -t exec` | 통과 |
| RG-13 (P1) | CSP enforce 후 앱 전 화면 콘솔 | CSP 위반 0 (또는 의도된 화이트리스트만) |
| RG-14 (P1) | CI 에 `npm audit`·CodeQL·Dependabot 동작 | 보임 |
| RG-15 (P1) | `ssampin-escalate` 6회 연속 호출 / `submit-assignment` 폭주 | rate limit 응답 |

---

## 6. Risks & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 핸들 기반 전환이 내보내기 흐름을 깨뜨림 (renderer 가 path 문자열을 쓰는 곳이 많을 수 있음) | High | Medium | B-9 에서 호출부 전수 grep(`export:writeFile`/`openFile`/`showSaveDialog`) → 하나씩 핸들 기반으로. RG-05 로 모든 export 경로 수동 확인. 호환 위해 `export:writeFile` 가 `{handle}` 형 아닌 옛 인자 받으면 throw 하되 명확한 메시지 |
| `safeFetch` 추출이 담벼락 OG 미리보기 동작을 미묘하게 바꿈 | High | Medium | "동작 동등" 원칙 — 순수 이동 + import. 기존 link-preview 테스트(있으면) 통과 + RG-10 수동. 추출 시 link-preview 전용(256KiB cap, OG 파싱)은 옵션으로 보존 |
| `GOOGLE_CLIENT_SECRET` 제거가 로그인 깨뜨림 | High | Medium | U-2 스파이크로 client type 먼저 확정. Case A 면 변경 최소. Case B 면 Edge Function 추가하고 점진 전환(기존 흐름 유지하며 새 경로 추가→스위치). RG-04 필수 |
| `calendar:fetch-url` 차단이 정당한 캘린더 구독(사내 캘린더 서버 등)을 막음 | Medium | Low | 사설 IP 차단은 표준 SSRF 방어 — 사내 캘린더는 보통 공인 도메인. 막히면 사용자 신고 시 화이트리스트(설정) 검토. ICS 크기 한도 5MiB 는 넉넉 |
| CSP enforce 가 외부 폰트/리소스/inline 깨뜨림 | Medium | Medium | Report-Only 선행 + 화이트리스트 확정 후 enforce. P1, P0 와 분리 |
| 코드 서명 인증서 조달 지연으로 P1-1 장기화 | Medium | High | P1-1 독립 트랙. 그 사이 다운로드 무결성은 현 상태(SHA512+HTTPS) 유지 |
| (사용자) 토큰 로테이션을 잊고 placeholder 만 머지 | High | Medium | RG-02 를 P0 완료 게이트에 포함 — 로테이션 확인 전엔 "P0 완료" 선언 안 함. 보고서에 명시 |

---

## 7. Open Questions (Do 전 확정)

1. ~~OAuth client type~~ → **확정(2026-05-12)**: **데스크톱 앱 = Desktop(installed) 클라이언트 → Case A**(PKCE, secret 불필요 — `vite.config.ts:33` define 제거 + 토큰 교환의 `client_secret` 제거). **모바일 PWA = Web application 클라이언트 → Case B**(secret 이 PWA 번들에 노출됨 → code 교환을 Supabase Edge Function 으로 이전, `vite.mobile.config.ts:115,117` define 제거). 즉 P0-C 는 desktop=A / mobile=B 로 나눠 처리. 모바일 secret 도 로테이션.
2. `export:writeFile` 호환: 옛 시그니처(filePath 문자열) 호출이 남으면 throw vs 1릴리즈 deprecation? → **throw** (단순·안전; 같은 PR 에서 호출부 다 고치므로).
3. `shell:openPath` 화이트리스트 디렉토리 목록 — `userData/downloads/documents/desktop/temp/home` 로 충분한가? (내보내기 기본 저장 위치가 이 중 하나여야 함 — 확인 필요).
4. `calendar:fetch-url` 의 `allowedContentTypes` — `text/calendar`/`text/plain`/`application/octet-stream` 외에 실제로 오는 게 있나? (구글/네이버 캘린더 ICS 응답 헤더 확인 — 너무 빡빡하면 content-type 검사 생략하고 크기·SSRF 만).
5. P1 을 이 PDCA 안에서 다 할지 vs P0 끝나면 별도 PDCA(`security-hardening-p1`)로 분리할지 — 코드 서명은 외부 조달이라 분리가 자연스러움.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-05-12 | 초안 — P0 상세 설계(토큰 스크럽, GOOGLE_CLIENT_SECRET 제거, IPC 5종: dialogHandles 레지스트리 + safeFetch 추출 + 프로토콜 화이트리스트), P1 스케치, Phase P0-A/B/C 체크리스트, RG-01~15, 리스크, Open Q | pblsketch |
