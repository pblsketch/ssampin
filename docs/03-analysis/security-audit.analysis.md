# 쌤핀(SsamPin) 코드베이스 보안 감사 — 2026-05-12

> 전제: GitHub 저장소 `pblsketch/ssampin` 는 **퍼블릭(오픈소스)** 으로 유지.
> 그러므로 "tracked 파일에 들어간 비밀"은 즉시 노출로 간주한다.
> 본 문서는 `/pdca plan security-hardening` 의 입력으로 사용된다. 코드 수정 없음 — 분석·문서화만.

감사 범위: 노출 비밀 / Electron 보안 설정 / IPC 입력 검증 / Supabase Edge Functions / 네이티브 FFI / 파일 파싱 / 자동 업데이트 무결성 / 의존성·공급망 / XSS·실시간 입력 검증.

---

## 0. 심각도 요약 (Critical / High)

| # | 심각도 | 항목 | 근거(파일:라인) |
|---|--------|------|------------------|
| F-1 | **Critical** | `ssampin-embed` 관리자 토큰(`ADMIN_API_KEY` = `ssampin-admin-2024-secure`)이 tracked 문서 3곳에 평문 노출 | `docs/02-design/features/dual-tool-view.design.md:597`, `docs/04-report/features/realtime-wall-padlet-mode.report.md:437`, `docs/archive/2026-04/릴리즈_v1.10.3_kickoff.md:184` ↔ `supabase/functions/ssampin-embed/index.ts:58-62` |
| F-2 | **High** | `GOOGLE_CLIENT_SECRET` 이 **렌더러 번들**에 주입됨 (OAuth client secret이 배포 산출물에 들어감) | `vite.config.ts:33`, `vite.mobile.config.ts:115`, `src/global.d.ts`(`process.env.GOOGLE_CLIENT_SECRET`) — 빌드 시 `dist/` 에 평문 포함 |
| F-3 | **High** | 데스크톱 앱에 코드 서명 부재 (Win NSIS / macOS DMG 모두 미서명) — auto-update 무결성은 SHA512+HTTPS로만 보장 | `electron-builder.yml`(서명 설정 없음), `electron/main.ts:1939-1977` (`setupAutoUpdater`, generic provider) |
| F-4 | **High** | `ipcMain.handle('shell:openExternal', url)` / `'shell:openPath'` / `'export:openFile'` / `'calendar:fetch-url'` — 렌더러에서 온 URL/경로를 **검증 없이** `shell.openExternal` · `shell.openPath` · `child mod.get` 에 전달 | `electron/main.ts:2680-2687`(openExternal/openPath), `2672-2677`(openFile), `2849-2879`(calendar:fetch-url) |
| F-5 | **High** | `ipcMain.handle('export:writeFile', filePath, data)` — 렌더러가 **임의 절대 경로**를 지정해 파일을 쓸 수 있음 (경로 화이트리스트 없음) | `electron/main.ts:2617-2637` |

> Medium/Low 는 §2~§9 본문 참조. 위 5건은 릴리즈 게이트 대상.

---

## 1. 노출된 비밀 (가장 시급)

### F-1 [Critical] ssampin-embed 관리자 토큰 평문 노출 — git history 포함
- `EMBED_AUTH_TOKEN=ssampin-admin-2024-secure` 가 다음 tracked 파일에 그대로 들어 있음:
  - `docs/02-design/features/dual-tool-view.design.md:597`
  - `docs/04-report/features/realtime-wall-padlet-mode.report.md:437`
  - `docs/archive/2026-04/릴리즈_v1.10.3_kickoff.md:184`
  - (MEMORY.md 류 자동 메모 파일에도 동일 토큰이 반복 등장 — `CLAUDE.md` 상단 컨텍스트 / `scripts/ingest-chatbot-qa.mjs` 실행 예시)
- 이 토큰은 `supabase/functions/ssampin-embed/index.ts:58-62` 의 `ADMIN_API_KEY` 환경변수와 `Bearer ${adminKey}` 로 직접 비교됨. `ssampin-embed` 는 `list` / `delete` / `upsert` 액션을 제공 — 즉 **공개된 토큰으로 누구나 챗봇 지식베이스(`ssampin_docs` 테이블)를 조회·삭제·임의 문서 삽입 가능**. (삽입 시 SERVICE_ROLE_KEY 로 `insert` → 데이터 오염, 그리고 Gemini 임베딩 쿼터 소모.)
- **퍼블릭 저장소 전제에서는 이미 유출된 것으로 취급해야 함.** 추가로 git history 전체에 박혀 있어 단순 삭제로는 부족.
- **즉시 조치**:
  1. Supabase 대시보드에서 `ADMIN_API_KEY` 를 즉시 새 랜덤 값(예: `openssl rand -hex 32`)으로 로테이션. `scripts/ingest-chatbot-qa.mjs` 실행 시 사용하는 로컬 환경변수도 갱신.
  2. tracked 문서 3곳에서 토큰 문자열 제거 → `<ADMIN_API_KEY>` 같은 placeholder 로 치환. `CLAUDE.md` Release Workflow §3 의 실행 예시도 placeholder 화.
  3. git history 정리: `git filter-repo --replace-text` 로 해당 문자열을 `***REMOVED***` 로 치환 후 force-push (퍼블릭이므로 협력자에게 rebase 안내). 비용 큰 작업이므로 1·2 를 먼저 하고 3 은 hardening 백로그로.
  4. (선택) `ssampin-embed` 를 `--no-verify-jwt` 가 아닌 Supabase service-role 호출 전용으로 바꾸고, 토큰 인증 자체를 제거하거나 Supabase Vault 비밀로 옮기는 설계 재검토.

### 다른 비밀 전수 조사 결과
- **노출 OK / 의도된 공개값** (조치 불필요):
  - Supabase URL `https://ddbkyaxvnpaxkbqbpijg.supabase.co` — 공개 정보.
  - Supabase anon key — (코드베이스에서 직접 발견되지 않음; 발견되더라도 RLS 전제하에 공개 무방. RLS 정책 점검은 별도 권장 — §4 참조.)
  - OAuth client **ID** — 공개돼도 무방.
  - `NEIS_API_KEY = 'e36a3e86a5ef45c2b93cc2c40e3af688'` (`src/domain/entities/Meal.ts:6`) — 나이스 오픈 API "공용 키"로 주석에 명시. 공개 데이터 read-only API. **Low** (남용 시 쿼터 영향 정도). 장기적으로는 프록시 경유 권장.
  - `WEATHER_API_KEY = '183106431a614a27bfb220356260103'` (`src/infrastructure/weather/index.ts:67`) — WeatherAPI.com 무료 키. **Medium** — 퍼블릭 노출 시 제3자가 본인 키처럼 호출해 무료 쿼터 소진/계정 차단 위험. 브라우저 모드에서는 `/weather-api` 프록시를 쓰지만 Electron 모드는 키를 직접 fetch URL 에 넣어 `api.weatherapi.com` 호출 → 패키지된 `dist/` 에도 평문 포함됨. **권장**: (a) Supabase Edge Function 또는 landing 의 serverless 프록시로 옮기거나, (b) 최소한 키를 빌드 시 env 주입(`VITE_WEATHER_API_KEY`)으로 바꿔 소스 트리에서 제거 + 키 로테이션.
- **서버 측 비밀** (`Deno.env.get(...)` — Supabase Functions 환경변수, 코드에 평문 없음, OK):
  `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`(Edge Function 측), `GOOGLE_API_KEY`, `RESEND_API_KEY`, `DEVELOPER_EMAIL`, `ADMIN_API_KEY`. — 코드에는 키 문자열이 없으므로 노출 아님. 단 F-1 처럼 `ADMIN_API_KEY` 의 값이 *문서*에 박혀 있는 게 문제.
- **`GOOGLE_SLIDES_API_KEY`** — `electron/ipc/slidesSource.ts:43` 에서 `process.env.GOOGLE_SLIDES_API_KEY` 로 읽음. 빌드 시 메인 번들(`dist-electron/`)에만 주입한다고 주석에 명시 — 렌더러 노출은 안 됨. 패키지된 메인 번들에 평문 포함되긴 하나, Google Slides 공개 API 읽기 키이고 메인 프로세스 격리 의도가 있음 → **Low** (키 로테이션 용이성만 확보).
- `.env` / `.env*.local` 은 `.gitignore` 에 포함됨 — tracked 되지 않음. OK.

---

## 2. Electron 보안 설정

### 양호한 부분
- 모든 `new BrowserWindow({...})` 의 `webPreferences` 가 `contextIsolation: true`, `nodeIntegration: false` — 7개 윈도우(main/widget/icon/quickAdd/stickerPicker/printWin) 전부. ✅
- `installNavigationGuard(win)` 가 main/widget/icon/quickAdd/stickerPicker 5개 윈도우에 적용 — `will-navigate` 에서 `file://`(자기 dist/index.html 제외) 차단 + `setWindowOpenHandler` 가 모든 `window.open` deny. `electron/security-guards.ts:74-104`. `electron/preload.ts:8` 가 `installDropGuard()` 로 drop navigate 도 차단. ✅ (이미 PDCA 완료된 영역)
- `preload.ts` 의 `contextBridge` 노출 API 는 전부 `ipcRenderer.invoke` 래퍼 — 직접 fs/shell 노출 없음. ✅
- `ssampin-slides://` 커스텀 protocol 핸들러 — `cache/slides` 디렉토리 내부 + `.png` 확장자만 허용, path traversal 정규화 검증 (`electron/main.ts:4128-4154`). ✅
- `forms:*` IPC — `resolveFormsPath` 가 userData 경계 강제 + 확장자 화이트리스트(`.hwpx/.pdf/.xlsx/.png`), 절대경로 거부 (`electron/main.ts:2884-2906`). ✅
- `sticker:*` IPC — `validateStickerId`(영숫자·하이픈·언더스코어 + 길이 ≤64), `validateAbsoluteSourcePath`(null byte 차단 + `path.resolve` 정규화) (`electron/main.ts:3089-3132`). ✅
- `uncaughtException`/`unhandledRejection` 에서 native cleanup (`desktopWidgetManager.disable()`) — mouse hook 잔류 방지. ✅
- `printWin` 은 `sandbox: true` (`electron/main.ts:2986-2992`). 다른 윈도우는 sandbox 미명시 → 기본값(Electron 20+에서 renderer는 sandbox 기본 활성이지만 preload가 있으면 sandbox 동작이 제한됨; preload 들은 모두 동일 `preload.js`).

### 개선 항목

#### M-1 [Medium] CSP(Content-Security-Policy) 부재
- `index.html` / `BrowserWindow` 어디에도 CSP 메타 태그·`onHeadersReceived` CSP 헤더 설정 없음. Electron 보안 권고(checklist #6)는 CSP 설정. 렌더러가 로컬 `file://` 만 로드하고 `nodeIntegration:false`+`contextIsolation:true` 이므로 즉각적 RCE 경로는 좁지만, 챗봇 응답·OG 미리보기·실시간 담벼락 사용자 입력이 렌더링되는 만큼 `script-src 'self'; object-src 'none'; ...` CSP 를 추가하면 XSS 폭발 반경이 크게 줄어든다. `ssampin-slides://` 는 `bypassCSP: true` 로 등록돼 있으니 CSP 적용 시 `img-src` 에 그 scheme 허용 필요.
- **권장**: `session.defaultSession.webRequest.onHeadersReceived` 로 CSP 주입, 또는 빌드 산출물 `index.html` 에 `<meta http-equiv="Content-Security-Policy">`.

#### M-2 [Medium] `webviewTag: true` (mainWindow)
- `electron/main.ts:1351` — mainWindow 에 `webviewTag: true`. `<webview>` 가 실제로 사용되는지 확인 필요. 사용 안 하면 제거(공격면 축소). 사용한다면 `will-attach-webview` 에서 `webPreferences` 강제(`nodeIntegration:false`, preload 제거 등) + src 화이트리스트 필요.

#### M-3 [Medium] `quickAddWindow` / `stickerPickerWindow` 가 `setVisibleOnAllWorkspaces(true, {visibleOnFullScreen:true})` + `alwaysOnTop screen-saver` — 보안이라기보단 UX, 단 잠금화면 위 표시 가능성. 기능 요구사항이므로 정보성 기재.

#### L-1 [Low] `quickAddWindow.loadURL(\`${VITE_DEV_SERVER_URL}?${qs}\`)` 등에서 query 파라미터가 사용자 제어가 아니므로 문제 없음. (정보성)

---

## 3. IPC 핸들러 입력 검증

### F-4 [High] `shell:openExternal` / `shell:openPath` / `export:openFile` 가 URL/경로 무검증
- `electron/main.ts:2680` `ipcMain.handle('shell:openExternal', (_event, url: string) => { shell.openExternal(url); })` — **프로토콜 검증 없음**. 렌더러(혹은 렌더러를 침해한 XSS 페이로드, 혹은 실시간 담벼락이 학생에게서 받은 링크를 교사 화면에 띄울 때)가 `file:///C:/Windows/...`, `smb://attacker/...`, `javascript:...`(브라우저별로는 무시되나), 또는 OS-handler 가 등록된 위험 스킴(`ms-cxh:`, `search-ms:`, custom protocol)을 넘길 수 있다. `shell.openExternal` 은 OS 기본 핸들러로 전달하므로 임의 프로토콜 핸들러 트리거 = 잠재적 RCE 보조 경로.
  - **권장**: `new URL(url)` 파싱 후 `protocol` 이 `https:` / `http:` / `mailto:` 화이트리스트인 경우만 허용. (이미 `realtimeWallLinkPreview.ts` 가 유사 패턴을 갖고 있음 — 재사용.)
- `electron/main.ts:2685` `shell:openPath` — 임의 경로를 OS 기본 프로그램으로 연다. `export:openFile`(2672), `forms:openFile` 와 달리 경계 검증 없음. 폴더 열기 용도라지만 렌더러가 임의 실행 파일 경로를 넘기면 OS가 그 파일을 "연다"(실행 가능). **권장**: 디렉토리만 허용하거나, 최소한 `app.getPath('userData')` / `dialog` 로 얻은 경로만 허용.
- `electron/main.ts:2672` `export:openFile` — `shell.openPath(filePath)` 무검증. export 산출물 열기 용도지만 경로는 렌더러 제공. 위와 동일.

### F-5 [High] `export:writeFile` 임의 절대 경로 쓰기
- `electron/main.ts:2617` `ipcMain.handle('export:writeFile', (_event, filePath: string, data) => fs.writeFileSync(filePath, ...))` — **경로 화이트리스트 없음**. 정상 흐름은 `export:showSaveDialog` 가 반환한 경로를 그대로 넘기는 것이지만, IPC 채널은 렌더러가 임의 인자를 줄 수 있어 침해된 렌더러가 `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\evil.bat` 같은 곳에 쓸 수 있다.
  - **권장**: `export:showSaveDialog` 에서 받은 경로를 main 측에 토큰으로 등록하고 `export:writeFile` 가 그 토큰만 받게 하거나, 최소한 `dialog.showSaveDialog` 를 main 에서 다시 호출하는 단일 IPC(`export:saveAs(data, filters)`)로 합치는 리팩토링.

### M-4 [Medium] `calendar:fetch-url` — SSRF 가능
- `electron/main.ts:2849-2879` — 렌더러가 준 URL을 `http`/`https` 모듈로 직접 GET, 301/302 리다이렉트 따라감. **IP 대역 검증·DNS rebinding 방어 없음** (반면 `realtimeWallLinkPreview.ts` 는 완전한 SSRF 방어를 갖춤). 외부 캘린더(.ics) 페치 용도지만 `http://127.0.0.1:port/...`, `http://169.254.169.254/...`(클라우드 메타데이터; 데스크톱이라 보통 의미 없으나 사내망 환경 고려), 사내망 호스트로 접근 가능. 응답은 string 으로 렌더러에 반환됨 → 내부망 응답 누설.
  - **권장**: `realtimeWallLinkPreview.ts` 의 `resolveAndVetHost` + `pinDispatcher` 패턴을 공통 모듈로 추출해 `calendar:fetch-url` 에도 적용. 최소한 private/loopback/link-local IP 거부 + 리다이렉트 hop 별 재검증.

### M-5 [Medium] `audio:importAlarm` / `font:import` — dialog 로 사용자가 직접 고른 파일이므로 path traversal 위험은 낮음. 크기 제한(5MB/10MB) 있음. MIME 은 확장자 기반 추론 → 위조 가능하나 `data:` URL 로 렌더러에 넘겨 `<audio>`/`@font-face` 에 쓰는 정도라 영향 제한적. **Low~Medium**. 폰트는 신뢰 불가 파일 파싱(브라우저 폰트 엔진) 경로 — §6 참조.

### L-2 [Low] `data:read`/`data:write`/`data:remove` — `filename` 이 `path.join(dataDir, \`${filename}.json\`)` 에 들어감. `filename` 에 `../` 가 들어가면 dataDir 밖으로 나갈 수 있음 (`path.join('/data', '../../etc/passwd')` → 정규화됨). 다만 이건 **렌더러 자기 자신의 저장 데이터**라 렌더러가 이미 신뢰됨 + 항상 `.json` 확장자 강제. 실질 위험 낮으나, 방어 차원에서 `filename` 정규식 검증(`/^[a-z0-9._-]+$/i` + `..` 거부) 추가 권장. `electron/main.ts:1995, 2030, 2089`.

### M-6 [Medium] `second-instance` / CLI 인자의 `.ssampin` 파일 — `electron/main.ts:4109-4120, 4242-4248` — `argv` 에서 `.ssampin` 으로 끝나는 인자를 찾아 `fs.readFileSync` 후 렌더러에 전송. 파일 내용 자체는 renderer 에서 `validateShareFile` (§6) 로 검증되지만, 파일 크기 제한이 없음 — 거대 파일 드롭 시 main 프로세스 메모리 폭주(DoS). 크기 cap(예: 10MB) 권장.

---

## 4. Supabase Edge Functions

### 인증 모델 요약
| 함수 | 인증 방식 | 평가 |
|------|-----------|------|
| `ssampin-embed` | `Bearer ADMIN_API_KEY` (env) | **F-1 — 토큰 평문 노출. Critical.** |
| `ssampin-chat` | 인증 없음 + IP/세션 rate limit | OK (의도된 공개 챗봇) — §아래 |
| `ssampin-escalate` | 인증 없음 | **M-7** — rate limit 없음 |
| `save-teacher-token` | Google access_token → userinfo 검증 | OK — 토큰 소유자만 자기 행 upsert |
| `create-assignment` | Google access_token → userinfo 검증 | OK — teacher_email 로 행 생성, `admin_key` = `crypto.randomUUID()` |
| `get-assignment-public` | 인증 없음 | OK — admin_key/teacher_id/student id 제외하고 반환. 단 §M-8 |
| `submit-assignment` | 인증 없음 (학생용) | OK 의도, 단 §M-9 |
| `get-submissions` | `adminKey` body 파라미터 비교 | OK — `assignment.admin_key !== adminKey` 시 403 |
| `delete-assignment` | `adminKey` body 파라미터 비교 | OK — 동일 |

> **모든 함수가 `Access-Control-Allow-Origin: '*'`** (`_shared/cors.ts:3`, `ssampin-embed`/`ssampin-chat`/`ssampin-escalate` 의 자체 CORS). 학생 제출 페이지가 `m.ssampin.com` / 랜딩 / 임의 origin(터널 URL)에서 호출돼야 하므로 와일드카드가 불가피한 측면이 있으나, `ssampin-embed`(관리용) 만큼은 origin 화이트리스트 적용 권장.

### M-7 [Medium] `ssampin-escalate` — rate limit 부재
- `supabase/functions/ssampin-escalate/index.ts` — 입력 검증(type/length≤2000)은 있으나 IP·세션 기준 rate limit 없음. 공개 엔드포인트라 누구나 `Resend API` 를 통해 개발자 이메일(`wnsdlf1212@gmail.com` 하드코딩 fallback, `index.ts:62`)로 메일 폭주 가능 + `ssampin_escalations` 테이블 오염. `ssampin-chat` 의 `checkRateLimit` 패턴(`ssampin_rate_limits` 테이블)을 재사용 권장. 또한 개발자 이메일을 코드 fallback 으로 두지 말고 env 필수화.

### M-8 [Medium] `get-assignment-public` — assignmentId 만 알면 학생 명단(번호+이름+학년+반) 전체 노출
- `supabase/functions/get-assignment-public/index.ts:50-52` — `student_list` 의 `{number, name, grade, classNum}` 를 그대로 반환. 학생 출석 페이지 구현상 필요하지만, assignmentId(UUID)는 학생들 사이에 공유되는 값 → 사실상 그 반 전체 명단이 UUID 만 알면 누구나 조회 가능. 개인정보(학생 실명) 노출 면에서 **Medium**. 완화책: (a) 제출 시 이름을 자유 입력받고 명단 미리보기를 제거하거나, (b) `identify_by_name` 옵션처럼 명단 노출을 교사가 선택하게 하거나, (c) 명단을 hash 로만 비교(클라이언트는 이름 입력 → 서버가 hash 일치 확인).

### M-9 [Medium] `submit-assignment` — IDOR / 위장 제출 가능
- `supabase/functions/submit-assignment/index.ts` — 학생 인증이 전혀 없음(의도). 학년·반·번호·이름만 form-data 로 받아 `submissions` 에 upsert. 따라서:
  - 같은 반 학생이 **다른 학생 번호로 제출**해 그 학생의 제출 슬롯을 덮어쓸 수 있다(`onConflict: assignment_id,student_grade,student_class,student_number` 이므로 기존 제출 교체). `allow_resubmit=false` 면 한 명이 다른 번호를 선점해 정상 제출을 막을 수도 있음.
  - 파일 검증은 양호: 10MB cap, `BLOCKED_EXTENSIONS`(exe/bat/js/ps1 등) 차단, 파일타입 화이트리스트. ✅
  - **완화책**: 제출 시 간단한 토큰(과제 생성 시 학생별 개별 코드 발급) 또는 제출 후 수정 불가(첫 제출만 인정) 옵션. 현 위협 모델(학교 내부, 저신뢰)에서는 수용 가능할 수 있으나 hardening 백로그에 기재.
- rate limit 없음 — 한 학생이 대용량 파일을 반복 제출해 교사 Google Drive 쿼터 소진 가능. **Medium**.

### M-10 [Medium] Edge Function 에러 메시지가 내부 정보 노출
- 다수 함수가 `errorResponse(\`서버 오류: ${(err as Error).message}\`, 500)` (`create-assignment:102`, `submit-assignment:424`, `save-teacher-token:74` 등) — DB 에러 메시지·스택 일부가 클라이언트에 그대로 전달됨. `ssampin-chat`/`ssampin-embed` 는 `'처리 중 오류 발생'` 으로 일반화함 — 그게 올바른 패턴. 나머지 함수도 동일하게 일반 메시지로 바꾸고 상세는 `console.error` 로만.

### 양호
- `teacher_tokens` — OAuth access/refresh 토큰을 **AES-256-GCM** 으로 토큰별 별도 IV·tag 와 함께 암호화 저장(`_shared/crypto.ts`, `save-teacher-token/index.ts:40-66`). 키는 `ENCRYPTION_KEY` env. SERVICE_ROLE_KEY 로만 읽힘 → 평문 저장 아님. ✅ (단 `ENCRYPTION_KEY` 가 Supabase env 에만 있고 코드/문서에 없음 — 확인됨.)
- `--no-verify-jwt` 배포 여부: `supabase/config.toml` 이 저장소에 없음(`supabase/` 디렉토리에 `functions/` + `migrations/`(있다면) 만). 함수들이 `Authorization` 헤더를 자체 파싱하는 패턴(Google token 또는 admin_key)이므로 사실상 `--no-verify-jwt` 로 배포된 것으로 보임. `MEMORY.md` 의 배포 명령에도 `--no-verify-jwt` 명시(`npx supabase functions deploy ssampin-chat ... --no-verify-jwt`). **권장**: `config.toml` 을 저장소에 추가해 `[functions.X] verify_jwt = false` 를 명시적으로 문서화(현재 암묵).
- **RLS 정책 확인 필요(별도)**: `assignments` / `submissions` / `teacher_tokens` / `ssampin_docs` / `ssampin_conversations` / `ssampin_escalations` / `ssampin_rate_limits` 테이블의 RLS 가 켜져 있고 anon 키로 직접 접근이 막혀 있는지 — 코드만으로는 확인 불가. anon 키가 어딘가 노출되면(landing 등) RLS 가 마지막 방어선. hardening 백로그에 "Supabase 대시보드 RLS 감사" 항목 추가 권장.

---

## 5. 네이티브 FFI / 시스템 권한

### 평가: Medium (트리거 경로가 사용자 명시 액션에 한정됨)
- **`@nut-tree-fork/nut-js`** — 스티커 자동 붙여넣기. `sticker:paste` IPC 가 호출될 때만 `nut.keyboard.pressKey(Ctrl, V)` 1회 디스패치 (`electron/main.ts:3382-3486`). 트리거는 사용자가 스티커 피커에서 스티커를 클릭하는 명시적 액션. **임의 키 입력 주입 경로 아님** — 항상 고정된 Ctrl+V 만 보냄. 공유 파일 import → 자동 붙여넣기 같은 자동 체인 없음. 클립보드 복원 모드는 현재 강제 비활성화(`restoreMode = false`, `main.ts:3615`). ✅ 위협 모델상 문제 없음.
  - 다만 `nut-js` 의 `.node` 네이티브 바이너리가 asar 외부로 언팩됨(`electron-builder.yml:36-47`) — 공급망 측면에서 이 패키지(원본 `@nut-tree/nut-js` 는 2024년 npm 에서 제거됨, 포크 사용 중)의 신뢰성을 주기적으로 점검 권장. **Low**.
- **`koffi`** — native-desktop 모드(바탕화면 아이콘 아래) Win32 FFI(WorkerW 조작, WH_MOUSE_LL hook). Win32 전용. 트리거는 사용자가 설정에서 desktopMode='native-desktop' 을 선택할 때만(`createDesktopWidgetManager` 가 platform/load 가드 → no-op 또는 win32 manager). mouse hook 은 위젯 bounds 안의 LBUTTONDOWN 만 처리(`main.ts:683-734`, `desktopWidgetManager.ts`). `uncaughtException`/`unhandledRejection`/`before-quit`/`window-all-closed` 에서 모두 `desktopWidgetManager.disable()` 호출 → hook 잔류 방지 안전망 다수. ✅ FFI 코드 자체(C 함수 시그니처 typed)의 메모리 안전성은 koffi 의 책임 + 입력이 OS HWND/RECT 라 외부 신뢰 불가 데이터가 FFI 인자로 흐르지 않음.
- 결론: 악의적 *데이터*(공유 파일·실시간 입력)로 네이티브 FFI 가 트리거되는 경로는 **현재 없음**. 두 모듈 모두 사용자 명시 액션에서만 동작. 다만 `nut-js` 포크 + `koffi` 의 의존성 신뢰성 모니터링을 백로그에 기재.

---

## 6. 파일 파싱 안전성

### 평가: Medium~Low — 일부 cap 부재
- **`.ssampin` 공유 파일** — `src/domain/rules/shareRules.ts:14-73` `validateShareFile` 가 `JSON.parse` 결과에 대해 구조 검증(meta.type/version/createdAt, categories[], events[] 각 필드 타입, date 정규식). **prototype pollution**: `JSON.parse` 자체로는 `__proto__` 가 일반 속성으로 들어갈 뿐 프로토타입 오염은 안 됨; 다만 이후 import 처리(`ImportEvents` usecase)에서 `{...incoming}` spread 나 deep merge 시 `__proto__` 키가 있으면 위험 — 코드 확인 결과 events/categories 는 id/title/date 같은 정해진 필드만 읽어 새 객체로 재구성하므로 안전한 편. **크기 제한 부재**: `share:import`(`main.ts:2787-2812`)·`second-instance`(§M-6)·CLI 인자 경로에서 파일 크기 cap 이 없음 → 거대 JSON 으로 메모리 DoS. **권장**: import 진입점에서 파일 크기 cap(10MB) + `JSON.parse` 전 길이 체크.
- **roster import** — `src/domain/rules/rosterImportRules.ts` / `rosterImportPlan.ts` / `usecases/roster/applyImportPlan.ts`. Excel(`.xlsx`) 또는 텍스트 붙여넣기로 명렬표 가져오기. `exceljs` 로 파싱(신뢰 불가 파일을 파싱 — zip 기반 포맷이므로 zip-slip 이론적 가능성, 단 `exceljs` 는 메모리 파싱이라 디스크 추출 안 함 → zip-slip 무관). **과대 입력**: 거대 시트(수만 행) 파싱 시 메모리/CPU — 행 수 cap 권장. XXE: `exceljs` 가 XML 파서를 자체 갖고 외부 엔티티 비활성 — 일반적으로 안전. **Low~Medium**.
- **HWPX import** (`@ubermensch1218/hwpxcore`) / **Excel import** — `src/infrastructure/export/` 의 역방향. HWPX 는 zip+XML, Excel 은 zip+XML. 신뢰 불가 파일 파싱 경로. 이 라이브러리들의 XXE/zip-slip 내성은 외부 의존 — `npm audit` + 라이브러리 보안 이력 점검 필요. 파일 크기/페이지 cap 권장. **Medium**.
- **PDF import** (interactive-slides, `pdfjs-dist`) — renderer 측에서 렌더 후 PNG 바이트를 main 에 전달. `electron/ipc/slidesSource.ts:79-82, 221-275` 가 `PDF_MAX_PAGES=100`, 페이지당 5MB, 전체 50MB cap + `contentHash`/`pageId` 정규식 검증. ✅ cap 잘 적용됨. `pdfjs-dist` 자체의 파싱 취약점은 의존성 audit 대상.
- **이미지 파싱** (스티커: `nativeImage.createFromPath`/`createFromBuffer`, `splitSheet`) — Electron `nativeImage`(Skia 기반)로 디코딩. 신뢰 불가 이미지를 디코딩하는 경로지만 Electron/Chromium 의 이미지 코덱은 비교적 견고. 360×360 으로 정규화. cap(스티커 64자 ID, 360px) 있음. **Low**.
- **`audio:importAlarm`/`font:import`** — 폰트는 `data:` URL 로 `@font-face` 에 주입 → 브라우저 폰트 엔진이 신뢰 불가 폰트 파싱(역사적으로 폰트 파싱 취약점 다수). 10MB cap 있음. **Medium** (Chromium 폰트 샌드박싱에 의존).

---

## 7. 자동 업데이트 무결성

### F-3 [High] 코드 서명 부재
- `electron-builder.yml` — Win NSIS / macOS DMG 모두 **코드 서명 인증서 설정 없음**(`win.certificateFile`/`csc*` 부재, `mac` 은 `hardenedRuntime: true` 지만 서명 인증서 없으면 무의미, `gatekeeperAssess: false`). 사용자가 SmartScreen/Gatekeeper 경고를 우회해 설치 — 챗봇 KB 에 "백신 끄고 설치" 안내가 있을 정도로 일상화됨.
- `electron-updater` 무결성 검증: `latest.yml`/`latest-mac.yml` 의 SHA512 해시로 다운로드 파일 무결성 검증 — feed URL 이 HTTPS(`https://github.com/pblsketch/ssampin-releases/releases/latest/download`, `electron/main.ts:1945`)이므로 중간자 공격으로 `latest.yml` 자체를 바꾸려면 GitHub HTTPS 를 깨야 함 → 실질적으로 OK. **즉, 다운로드 무결성은 SHA512+HTTPS 로 확보됨. 문제는 "최초 배포 산출물이 누구 손도 안 거쳤다"는 보장(=서명)이 없다는 것.** 빌드 PC 침해 → 서명 없으니 변조 탐지 불가.
- **권장(우선순위 표기)**:
  - **High**(릴리즈 전 권장이지만 비용 발생): Windows EV/OV 코드 서명 인증서(연 ~20만원대) — SmartScreen 평판도 누적. macOS Apple Developer ($99/년) + notarization — Gatekeeper 통과 + 인앱 업데이트 가능(현재 macOS 는 코드서명 없어 인앱 업데이트 차단, `main.ts:3062-3076` 가 릴리즈 페이지로 우회 중).
  - **Medium**: 당장 비용이 부담되면 (a) `latest.yml` 생성 후 별도 GPG 서명 파일을 릴리즈에 첨부 + README 에 검증 방법 게시, (b) 빌드를 GitHub Actions(현재 macOS 빌드는 이미 Actions)로 옮겨 빌드 출처 재현성 확보. Windows 빌드도 Actions 로 옮기면 로컬 PC 침해 위험 제거.
  - **Low/즉시**: 릴리즈 노트/다운로드 페이지에 SHA256 체크섬 게시(이미 `latest.yml` 에 SHA512 있으니 사용자 검증 안내 추가).

### 양호
- feed URL 이 별도 퍼블릭 저장소(`ssampin-releases`)를 가리킴 — 소스 저장소와 분리. generic provider 로 GitHub API rate limit 회피. ✅
- 네트워크 오류는 silent(`main.ts:1971-1976`) — 사용자 혼란 방지, 정보 누설 없음. ✅

---

## 8. 의존성 / 공급망

### M-11 [Medium] `npm audit` / Dependabot 미적용
- `package-lock.json` 이 현재 git status 에서 `D`(삭제됨) 상태 — CI 가 `npm install`(lockfile 보정)로 우회 중(`MEMORY.md` 의 safe-guard CI 부채 #2). **lockfile 없이 빌드 = 공급망 무결성 약화**(매 빌드마다 트랜지티브 의존성이 달라질 수 있음). `MEMORY.md` 에 이미 "`rm -rf node_modules package-lock.json && npm install` 재생성 후 `npm ci` 복원" 이 부채로 적혀 있음 — security-hardening 백로그에 승격.
- GitHub repo 설정에서 **Dependabot alerts + security updates** 활성화, **code scanning(CodeQL)** 활성화 권장 — 퍼블릭 저장소는 무료. CI 에 `npm audit --audit-level=high` 게이트 추가.
- 주목할 의존성: `cloudflared`(터널 — 외부 바이너리 ~40MB 를 런타임 다운로드, `electron/ipc/tunnel.ts:62-69` — 다운로드 무결성 검증은 `cloudflared` npm 패키지에 위임), `@nut-tree-fork/nut-js`(원본 패키지 npm 제거 이력), `koffi`(FFI), `open-graph-scraper`, `exceljs`, `@ubermensch1218/hwpxcore`, `pdfjs-dist`, `ws`, `undici`. 정기 audit 대상.

---

## 9. 기타 (XSS / 실시간 입력 / 데이터 민감도)

### 양호
- **실시간 담벼락 사용자 입력 → XSS**: `RealtimeWallCard.tsx`/`RealtimeWallCardMarkdown.tsx` 가 `dangerouslySetInnerHTML` 을 **일절 사용 안 함** — 사용자 텍스트는 React 텍스트 노드로 렌더(자동 escape) + 마크다운은 `react-markdown`(선언적 ReactNode 트리, 자체 innerHTML 미사용). fuzz 테스트(`RealtimeWallCardMarkdown.fuzz.test.tsx`)로 회귀 방지. ✅
- **챗봇 응답 렌더링**: `HelpChatMessage.tsx:81` 이 `dangerouslySetInnerHTML={{__html: renderSimpleMarkdown(message.content)}}` 를 쓰지만, `renderSimpleMarkdown`(`HelpChatMessage.tsx:14-23`)이 **먼저 `&`/`<`/`>` 를 HTML 엔티티로 escape** 한 뒤 `**bold**`/백틱 코드만 제한적으로 태그화 → XSS 안전. ✅ (단 챗봇 응답은 LLM 출력이므로 신뢰 불가 입력은 아니지만, 향후 응답에 사용자 입력 echo 가 섞일 수 있어 escape-first 패턴 유지 중요.)
- **OG 미리보기**: `electron/ipc/realtimeWallLinkPreview.ts` — SSRF 다층 방어(프로토콜 화이트리스트 → DNS lookup IP 대역 검증 → undici Agent IP 핀(DNS rebinding 방어) → 리다이렉트 hop 별 재검증 → 3초 timeout → 256KB cap → Content-Type 화이트리스트 → 파싱 결과 길이 제한 + bidi/제어문자 제거 → og:image 호스트 재검증). 에러는 콘솔/렌더러 어디에도 안 남김(SSRF 정탐 오라클 방지). **모범 사례 — 이 패턴을 `calendar:fetch-url` 에도 적용해야 함(§M-4).** ✅
- **실시간 WS 서버**: `sessionedWebSocketServer.ts` — Zod 스키마로 모든 클라이언트 메시지 검증(`clientMessageSchema.safeParse`), sliding-window per-key rate limit(`isRateLimited`), maxPayload cap(realtime-wall 20MB / interactive-slides 2MB), 메시지당 try/catch 격리, JSON 파싱 실패 silent drop. `realtimeWall.ts` 가 text 길이 cap(`session.maxTextLength`, 80~1000), linkUrl 500자, pdfUrl 15MB, `RATE_LIMIT_WINDOW_MS` 적용. ✅ regression-check #5 "v2.1 rate-limit" 가 실제로 구현돼 있음 확인.
- **데이터 민감도**: 학생 기록(`student-records`)·출석부·담임 메모는 `app.getPath('userData')/data/*.json` 에 **평문 JSON** 으로 저장. OAuth 토큰만 `safeStorage`(DPAPI/Keychain)로 암호화(`secureStorage.ts`). 학생 개인정보(실명·기록)가 평문이라는 점은 — 데스크톱 앱이고 OS 사용자 계정 격리에 의존하는 설계상 일반적이지만, "학교 공용 PC + 여러 교사 공유 계정" 시나리오에서는 위험. **권장**: 민감 도메인(student-records)도 `safeStorage` 로 암호화하는 옵션 제공, 또는 최소한 설정 PIN 잠금이 데이터 자체를 보호하지 않음을 사용자에게 명시. **Medium**.

### M-12 [Medium] `safeStorage` 미가용 시 OAuth 토큰 평문 폴백
- `electron/ipc/secureStorage.ts:42-46` — `safeStorage.isEncryptionAvailable()` 가 false 면 `console.warn` 후 **평문으로 파일 저장**. Linux 헤드리스/일부 환경에서 발생 가능. 토큰 같은 민감값이 평문 폴백되는 건 위험 — 폴백 시 저장을 거부하거나(기능 비활성 + 사용자 안내), 최소한 사용자에게 명시적 경고 UI 노출 권장.

---

## 부록 A — `/pdca plan security-hardening` 우선순위 백로그

### P0 — 즉시 (릴리즈/머지 게이트)
1. **F-1**: `ADMIN_API_KEY` 로테이션 + tracked 문서 3곳 + `CLAUDE.md`/`scripts` 의 토큰 문자열 제거. (코드 변경 없이 Supabase 대시보드 + 문서 편집으로 가능.)
2. **F-2**: `vite.config.ts:33` / `vite.mobile.config.ts:115` 에서 `GOOGLE_CLIENT_SECRET` 렌더러 주입 제거. OAuth code 교환을 Supabase Edge Function(`exchange-oauth-code`)으로 옮기거나(권장), 데스크톱 native client 타입이라 secret 이 정말 필요 없는지 Google Cloud Console 에서 client type 재확인 후 제거. → client secret 도 로테이션.
3. **F-4/F-5**: `shell:openExternal`(프로토콜 화이트리스트), `shell:openPath`/`export:openFile`(경계 검증 또는 dialog-token 패턴), `export:writeFile`(dialog-token 또는 단일 saveAs IPC). 5개 IPC 핸들러 패치.

### P1 — 다음 스프린트
4. **F-3**: 코드 서명 — Windows 인증서 발급 + Win 빌드를 GitHub Actions 로 이전(빌드 PC 침해 위험 제거). macOS Apple Developer + notarization → 인앱 업데이트 복원.
5. **M-4**: `calendar:fetch-url` 에 `realtimeWallLinkPreview.ts` 의 SSRF 방어 패턴 적용(공통 모듈 추출).
6. **M-1**: CSP 헤더 도입(`onHeadersReceived` 또는 `index.html` 메타). `ssampin-slides://` `img-src` 허용 포함.
7. **M-11**: `package-lock.json` 재생성 + `npm ci` 복원 + CI 에 `npm audit --audit-level=high` 게이트. GitHub Dependabot + CodeQL 활성화.
8. **M-7/M-9/M-10**: `ssampin-escalate` rate limit + 개발자 이메일 env 필수화. `submit-assignment` rate limit + 위장 제출 완화(과제별 학생 코드 옵션). Edge Function 에러 메시지 일반화.

### P2 — 백로그
9. **M-8**: `get-assignment-public` 학생 명단 노출 완화(이름 hash 비교 등).
10. **M-2**: `webviewTag` 사용 여부 확인 → 미사용 시 제거, 사용 시 `will-attach-webview` 가드.
11. **M-12**: `safeStorage` 미가용 시 평문 폴백 → 거부 또는 명시적 경고 UI.
12. **§9 데이터 민감도**: student-records 등 민감 도메인 `safeStorage` 암호화 옵션.
13. **§6**: 모든 파일 import 진입점에 크기·행수·페이지 cap 일괄 적용(.ssampin, roster Excel, HWPX). 거대 입력 DoS 방어.
14. **WEATHER_API_KEY / NEIS_API_KEY**: 프록시 경유로 이전 또는 빌드 시 env 주입 + 로테이션 (Medium/Low).
15. **F-1 후속**: git history 에서 `ssampin-admin-2024-secure` filter-repo 정리(force-push, 협력자 rebase 안내).
16. **공급망 모니터링**: `@nut-tree-fork/nut-js`(원본 npm 제거 이력) / `koffi` / `cloudflared`(런타임 바이너리 다운로드) 정기 점검 항목화.
17. **Supabase RLS 감사**: 모든 테이블 RLS on + anon 키 직접 접근 차단 확인. `supabase/config.toml` 을 저장소에 추가(`verify_jwt = false` 명시).

---

## 부록 B — 양호 사항 (재발 방지용으로 보존)
- 7개 BrowserWindow 전부 `contextIsolation:true` + `nodeIntegration:false`.
- `installNavigationGuard` / `installDropGuard` 가 SSOT(`security-guards.ts`)로 5개 윈도우 전부 적용 + 메타 테스트 존재.
- `preload.ts` contextBridge — 직접 fs/shell 미노출, 전부 IPC invoke 래퍼.
- `forms:*` / `sticker:*` IPC — 경로/ID 화이트리스트 검증.
- `ssampin-slides://` protocol — cache 디렉토리 + .png 화이트리스트.
- OAuth access/refresh 토큰 — AES-256-GCM(토큰별 IV/tag) 서버 암호화 저장.
- `secureStorage` — Electron safeStorage(DPAPI/Keychain) 사용.
- `realtimeWallLinkPreview.ts` — SSRF 9중 방어 + DNS rebinding 핀 + 에러 무로깅. (모범 사례.)
- 실시간 WS — Zod 검증 + per-key rate limit + maxPayload cap + 핸들러 격리.
- 실시간 담벼락·챗봇 렌더링 — `dangerouslySetInnerHTML` 부재(담벼락) / escape-first(챗봇).
- `submit-assignment` — exe/bat/js/ps1 등 위험 확장자 차단 + 10MB cap + 파일타입 화이트리스트.
- native FFI(nut-js/koffi) — 사용자 명시 액션에서만 트리거, 악의적 데이터 트리거 경로 없음, cleanup 안전망 다수.
- auto-update — feed URL HTTPS + 별도 퍼블릭 저장소 + SHA512 무결성 검증.
- `.env` / `.env*.local` gitignored.
