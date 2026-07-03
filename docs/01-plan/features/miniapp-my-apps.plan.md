# 내가 만든 앱(미니앱) — 1단계 MVP 구현 계획서 (PRD 수준) — v4 (합의 완료 + 사용자 결정 반영)

**상태:** ⏳ PENDING APPROVAL (실행 미승인 — 사용자 승인 후 착수)
**합의:** ralplan DELIBERATE consensus — Planner 초안 → Architect 조건부승인(must-fix 3) → v2 반영 → Critic ITERATE(MAJOR 3) → v3 반영 → **Critic APPROVE**.
**사용자 결정(v4):** 아이콘=별도파일(기본 이모지) · HTML 상한=20MB · 인터넷=일부 허용(`connect-src https:`+CDN, 2단계 데이터창구 시 재조임).
**대상 커밋 기준:** main `f4757150` (v2.2.7) · **모드:** DELIBERATE consensus · **작성:** Planner+Architect+Critic 합의
**범위:** 단일 HTML 미니앱 등록/실행(격리)/관리 + 위화감 없는 렌더링 + 온보딩. **마켓·공유·데이터창구는 범위 밖(2단계).**

---

## 1. RALPLAN-DR 요약

### Principles

1. **격리 우선(Isolation-first):** 미니앱은 쌤핀 IPC·Node·PC 파일·학생 데이터에 원천 도달 불가. 신뢰 경계는 "코드"가 아니라 "런타임 샌드박스(별 partition + preload 미부착 + origin 분리)".
2. **기존 자산 재사용:** 새 최상위 카테고리·새 BrowserWindow 없이 `ToolWebEmbed`의 `<webview>`, `security-guards.ts`, `electron/security/csp.ts`, `ToolsGrid` 패턴 확장.
3. **비침습적 UI:** 앱 0개면 얇은 안내만. 안 쓰는 교사는 "정리하기"로 숨김. `NAV_ITEMS` 불변.
4. **위화감 제로 렌더링:** 교사 HTML이 네이티브처럼 보이도록 컨테이너·여백·로딩·에러·전체화면을 쌤핀이 책임(콘텐츠는 그대로, 프레임만 쌤핀 소유).
5. **2단계 확장점 예약:** 데이터창구는 "미니앱↔쌤핀 postMessage 브로커" 단일 지점으로 예약만, MVP 미연결.

### Decision Drivers (top 3)

1. 보안 격리 강도 (임의 HTML = 신뢰 불가 코드) — 최우선
2. 위화감 없는 렌더링 품질 — 사용자 1순위 명시
3. 기존 아키텍처/디자인 일관성 + 유지비용

### Viable Options — 실행 격리 방식

- **옵션 A (권장): `miniapp://` 커스텀 프로토콜 + 단일 partition `persist:miniapps` + 앱별 origin `<webview>`.** (v2 synthesis 반영 — 아래 결정 참조)
  - Pros: origin 분리(앱마다 별 origin)→스토리지 자동 격리 · 경로검증·CSP 헤더 주입 한 곳 강제 · `installNavigationGuard` file:// 차단과 무충돌 · 2단계 postMessage 브로커 용이.
  - Cons: 신규 프로토콜 등록·핸들러·메타테스트(초기비용↑).
- **옵션 B: file:// 직접 로드 `<webview>`.**
  - Pros: 신규 인프라 0, 최단순.
  - Cons: `installNavigationGuard`가 file:// navigate 차단 → 자기 index.html 예외 로직과 정면 충돌, 같은 file origin이라 앱 간 격리 불가, `../` 경로조작 위험 → **탈락**.
- **옵션 C: sandbox `<iframe>` + Blob URL.**
  - Pros: webview 태그 불필요, iframe 샌드박스 성숙.
  - Cons: 단일 HTML Blob 서빙 시 상대경로 리소스 로드 불가 · CSP·origin 제어 약함 · 부모와 같은 프로세스 → 격리 약.

**결정: 옵션 A + Architect synthesis 반영.** B는 보안 가드 충돌·격리 불가로 무효화, C는 origin/CSP/프로세스 격리 열세.

**[v2 반영] 격리 세분화 방식 확정 — 단일 partition + 앱별 origin:** 앱별 partition(`persist:miniapp-<id>`)은 `protocol.handle`이 **호출 세션에만** 붙는 특성 때문에 앱마다 세션별 핸들러를 재등록해야 하는 비용을 낳고, "단일 지점 등록"이라는 이점과 상충한다. 대신 **단일 partition `persist:miniapps` + 앱별 origin `miniapp://<appId>`** 를 채택한다. 이유: (a) `registerSchemesAsPrivileged` 1회 + `protocol.handle` 1회로 세션 스코프 문제 소멸, (b) 브라우저 SOP가 origin 단위로 localStorage/IndexedDB를 자동 격리 → AC5(앱 간 스토리지 격리)를 origin만으로 충족, (c) 격리 강도는 partition 세분화가 아니라 **§3의 `will-attach-webview` main 강제**로 실질 확보. 앱 간 격리는 origin(SOP)이 담당하므로 partition은 본체와의 경계용 1개면 충분하다(미니앱은 쿠키를 쓰지 않아 세션 공유 표면도 무해).

### Pre-mortem (3 시나리오)

1. **격리 구멍(미니앱이 쌤핀 API 접근):** webview에 preload 상속/`nodeintegration` 켜짐, **또는 쌤핀 렌더러 자체가 뚫려 JSX 속성이 위조됨**. → 완화: **main 프로세스 `will-attach-webview`에서 preload 삭제·`sandbox=true`·`contextIsolation=true`·`nodeIntegration=false` 강제 + `miniapp://` 스킴 외 attach 거부**(신뢰 경계를 렌더러가 아닌 main이 보증). 메타테스트("will-attach-webview가 preload 삭제·sandbox 강제" + "webview에 preload/allowpopups 속성 없음") + E2E(`electronAPI===undefined`, `require` 부재).
2. **경로 조작(`miniapp://<id>/../../userData/secrets`):** → 완화: `path.normalize` 후 앱 루트 밖 거부, 심링크/`..`/절대경로 거부, 악성입력 10종 테스트.
3. **위화감 실패(흰 배경·이중 스크롤):** → 완화: 표준 프레임(§4), 로딩 스켈레톤, 전체화면 토글, 마이크로카피, 실렌더 게이트(Playwright+실 electron:dev 3샘플).

### 확장 테스트 계획

- Unit: 경로검증기, MiniApp 유효성(이름·아이콘·id중복), usecase, 저장경로 산출.
- Integration: 프로토콜↔파일저장(등록→200+CSP헤더), 설정 persist 왕복, syncRegistry 왕복.
- E2E(Playwright+실 electron:dev): 등록→카드클릭→로드→격리단언→전체화면→삭제.
- Observability: 프로토콜/CSP 위반 warn(기존 `installCspViolationLogger`), 로드 실패율/시간 diag 로그, 메타테스트=관측점.

---

## 2. 레이어별 구현 분해

### domain/ (외부 의존성 import 금지)

- 신규 `src/domain/entities/MiniApp.ts`: `MiniApp { id; name; description; icon: {kind:'emoji';value} | {kind:'image';fileName}; createdAt; order }` + 상수 + `validateMiniApp`.
- 신규 `src/domain/repositories/IMiniAppRepository.ts`: `list/save(app,htmlBytes)/remove/updateOrder/saveIcon`.
- 수정 `src/domain/entities/Settings.ts`: `miniApps?`/`miniAppsOrder?`/`hiddenMiniApps?` 메타 추가(HTML 바이트는 파일 저장). `toolsOrder`/`hiddenTools` 패턴 준수.

### usecases/

- 신규 `src/usecases/miniapp/RegisterMiniApp.ts`(HTML 검증: 단일HTML, **크기상한 20MB(사용자 결정 — 로컬 저장이라 여유), 확장자/시그니처** → save → 메타 등록). **정책 명시(Critic 갭):** id는 새로 생성(파일명 무관), 앱 개수 상한(예 50개)·총 용량 상한, **동일 앱 "업데이트"는 기존 id 유지 재저장**(신규 등록과 구분), 이름 중복 허용(id로 식별). `RemoveMiniApp.ts`(파일+메타 원자적 제거), `ReorderMiniApps.ts`, `ListMiniApps.ts`.
- (2단계 예약) 데이터창구 usecase 자리 문서 예약.

### infrastructure/

- 신규 `src/infrastructure/storage/MiniAppFileRepository.ts`: `userData/miniapps/<appId>/index.html` + `icon.*`. renderer→IPC로 main에 위임(파일쓰기 main 권한). **아이콘 저장 방식(사용자 결정): 별도 파일**(`userData/miniapps/<id>/icon.*`) — 설정엔 파일명만. 이유: 설정(settings)은 동기화 대상이라 base64 이미지를 넣으면 동기화가 무거워짐. 기본은 이모지(저장 0). 이미지 아이콘은 파일이므로 다른 기기엔 미동기(HTML과 동일 정책, 이모지는 메타라 동기됨).
- 신규 IPC `electron/ipc/miniapp.ts`: `miniapp:save/remove/list/saveIcon`. **미니앱 webview엔 미노출**(쌤핀 renderer만).
- 신규 `electron/miniapp-protocol.ts`: `app.whenReady` 이전 `registerSchemesAsPrivileged([{scheme:'miniapp',privileges:{standard:true,secure:true,corsEnabled:false}}])` (※ `connect-src https:`이므로 미니앱은 **외부 https fetch/API 가능**. 자기 origin(`miniapp://`) fetch까지 허용하려면 `supportFetchAPI:true`+`connect-src`에 `miniapp:` 추가 검토 — 리소스는 `<script src>`/`<img>` 등으로 로드되므로 MVP엔 불필요); 이후 **`session.fromPartition('persist:miniapps').protocol.handle('miniapp',...)` 1회 등록**(host=appId, path→폴더 매핑, 경로검증, CSP 헤더 주입). ※ defaultSession이 아니라 미니앱 partition 세션에 등록해야 함(Architect must-fix #2).
- 수정 `electron/main.ts`: `:4698` app.whenReady 블록에 `registerMiniAppProtocol()`(registerSchemesAsPrivileged는 whenReady 이전 모듈로드시), `registerIpcHandlers()` 부근에 `registerMiniAppIpc()`, **mainWindow 생성 직후 `installMiniAppWebviewGuard(mainWindow.webContents)` 호출**(will-attach-webview 강제). **새 BrowserWindow 없음**(webviewTag `:1678` 이미 true).
- 수정 `src/domain/entities/Settings.ts`만으로 동기화 편승: `miniApps` 메타를 `Settings`에 넣으면 **이미 등록된 `'settings'` 동기화 도메인**(`syncRegistry.ts:58-68`, `subscribeExcluded:true`)에 자동 편승 → **새 syncRegistry 엔트리/App.tsx 등록 불필요**(Architect 지적: 이중 등록 모순 제거). MVP: 메타만 동기화, HTML 바이트는 로컬 파일.

### adapters/ (UI)

- 수정 `src/adapters/components/Tools/ToolsGrid.tsx`: 평평한 격자 하단에 "내가 만든 앱" 섹션. 0개면 얇은 안내. 미니앱은 PageId 유니온에 넣지 않음(사이드바 오염 방지).
- 신규 `MiniApps/MiniAppsSection.tsx`(섹션 헤더+카드그리드 sp-\*, 추가 버튼, 삭제/정보, DnD 재사용).
- 신규 `MiniApps/MiniAppRegisterModal.tsx`(HTML 업로드→이름·설명·아이콘→미리보기→저장, Modal/IconButton 공용).
- 신규 `MiniApps/MiniAppRunner.tsx`(ToolWebEmbed 확장, `src=miniapp://<id>/index.html`, `partition="persist:miniapps"`(단일), **`allowpopups` 미부착**, preload 미부착, 로딩/에러/전체화면). 실제 sandbox/preload 강제는 §3 will-attach-webview(main)가 보증.
- 신규 `MiniApps/MiniAppOnboarding.tsx`(§5).
- 수정 `ToolWebEmbed.tsx` webview 타입에 preload/nodeintegration 없음 유지, 최소 속성만.

---

## 3. 보안 설계

- **격리 다층 (main이 보증하는 순서로):**
  1. **[핵심·must-fix] `will-attach-webview` main 강제 — 두 책임 분리(Critic MAJOR-1):** `mainWindow.webContents.on('will-attach-webview', (e, webPreferences, params) => {...})`에서:
     - **(a) webPreferences strip — `params.partition` 무관 전체 적용:** `delete webPreferences.preload`, `webPreferences.nodeIntegration=false`, `webPreferences.contextIsolation=true`. → preload 미부착이 **렌더러 JSX가 아니라 main의 보증 사실**이 됨(Electron 보안 권고 #12). 기존 `persist:tools` webview도 함께 봉합.
     - **(b) 스킴 화이트리스트 + sandbox — `params.partition === 'persist:miniapps'`인 webview에만:** `webPreferences.sandbox=true` 강제하고 `params.src`가 `miniapp://`로 시작하지 않으면 `e.preventDefault()`. → **기존 외부 https:// 쌤도구(`ToolWebEmbed`, `persist:tools`)를 차단하지 않음.** (스킴 화이트리스트를 전체 적용하면 `ToolWebEmbed`의 `src=https://…`가 attach 단계에서 막혀 쌤도구 전종 회귀 — 반드시 분기.)
     - ⚠️ **회귀 주의:** (a)의 strip을 기존 `persist:tools`에도 적용하는 것은 동작 변경 가능성 → S2 검증에 "기존 외부 쌤도구(숲소리/PBL스케치 등) 정상 로드·동작" 회귀 항목 필수. sandbox는 (b)로 miniapps에만 걸어 tools 동작 변경 없음.
  2. **origin 분리:** `miniapp://<appId>/` 앱마다 다른 host=다른 origin → SOP로 앱 간 localStorage/IndexedDB 자동 격리(AC5 충족).
  3. **preload 미부착 + 채널 미노출:** `electronAPI`/`require`/`ipcRenderer` 미존재, 쌤핀 IPC 채널 참조 불가.
  4. **단일 partition `persist:miniapps`:** 쌤핀 본체(`persist:tools`/기본 세션)와 스토리지 분리. (앱 간 분리는 origin이 담당하므로 partition은 본체와의 경계용 1개면 충분.)
  - ※ "webview=별 프로세스라 격리"는 **보증 아님**(Electron process 모델은 상황에 따라 공유). 격리 근거는 프로세스가 아니라 origin+sandbox+CSP로 서술.
- **CSP(프로토콜 핸들러 응답 헤더) — 인터넷 일부 허용(사용자 결정):** `default-src 'none'; script-src 'unsafe-inline' https: miniapp:; style-src 'unsafe-inline' https: miniapp:; img-src https: data: blob: miniapp:; font-src https: data: miniapp:; media-src https: data: blob: miniapp:; connect-src https:; worker-src blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; object-src 'none'`.
  - **결정 근거:** 1단계는 **데이터 창구가 없어 미니앱이 학생 PII에 접근 불가** → 인터넷을 열어도 유출할 민감정보가 없음. 대신 Gemini류 앱이 흔히 쓰는 **CDN(폰트/차트 라이브러리)·API(날씨·환율)**가 즉시 작동해 "그냥 되는" 경험 확보.
  - `https:`만 허용(평문 `http:` 차단), `object-src 'none'`(플러그인 차단), `frame-ancestors 'none'`, `base-uri`/`form-action` 봉쇄로 최소 안전선 유지. 미니앱은 처음부터 **enforce**(본체는 Report-Only).
  - **⚠️ 2단계 결합 규칙(필수):** 데이터 창구 도입 시 **학생 데이터를 받는 앱은 `connect-src`를 조여야** 함("정보 접근"과 "인터넷"을 동시에 열지 않음 — 유출 경로 차단). ADR Follow-up·§8에 못박음.
- **경로 검증:** `root=join(userData,'miniapps',appId); resolved=normalize(join(root,urlPath)); if(!resolved.startsWith(root+sep)) 403` + appId 화이트리스트(등록된 id만) + 심링크/`..`/절대경로 거부.
- **프로토콜 세션 스코프 [must-fix]:** `protocol.handle('miniapp',...)`은 호출 세션에만 붙는다. 단일 partition `persist:miniapps` 채택으로 **`session.fromPartition('persist:miniapps').protocol.handle(...)` 1회 등록**이면 모든 앱을 커버(앱별 재등록 불필요). `registerSchemesAsPrivileged`는 `app.whenReady` 이전 1회.
- **네비게이션 가드:** 미니앱 `miniapp://` origin이라 기존 file:// 로직 무충돌. MiniAppRunner webview는 `will-navigate`/`setWindowOpenHandler`에서 miniapp:// 내부만 허용, 외부 deny(shell.openExternal만). `allowpopups` 속성 **미부착**(기존 ToolWebEmbed의 `allowpopups=""` 복붙 금지). 이들 + will-attach-webview 강제를 `security-guards.ts`의 `installMiniAppWebviewGuard`로 SSOT화.
- **IPC 차단:** 미니앱 webview에 preload/채널 미노출.
- **2단계 확장점(예약):** 미니앱↔쌤핀 통신은 오직 postMessage 브로커 단일 지점. 쌤핀 renderer 허가 UI 후 화이트리스트 스냅샷만 `webContents.send`. MVP 미장착+주석 예약.

---

## 4. 위화감 없는 렌더링 설계

- 표준 프레임: `ToolLayout`(제목·뒤로·전체화면)로 감싸고 콘텐츠 `rounded-xl overflow-hidden`, 여백은 쌤핀 제공.
- 로딩: 스피너 + 최소 표시시간(250ms), `dom-ready`/`did-finish-load` 해제, 12초 타임아웃 폴백.
- 에러: 표준 에러 카드("앱을 불러올 수 없습니다·다시 시도"), 흰 화면 금지.
- **크래시/폭주 복구(Critic 갭):** webview `render-process-gone`/`unresponsive` 이벤트 수신 → "앱이 응답하지 않아요. 새로고침" 복구 카드. 교사가 올린 깨진/무한루프 HTML이 프레임을 걸리게 해도 앱 전체가 아니라 해당 미니앱만 복구.
- 여백/배경: 콘텐츠 배경 중립(흰/앱지정)+얇은 경계선(`sp-border`)으로 "앱 영역" 구분 → 다크 테마에서도 "의도된 창"처럼.
- 전체화면/발표: `isFullscreen` 토글, 이중 스크롤 방지 `height:100vh`.
- 크기/반응형: webview `absolute inset-0 w-full h-full`; 온보딩에서 `<meta viewport>`+`%`/`vh` 권장; 고정폭 대비 `overflow-auto`.
- 미리보기: 등록 모달에서 저장 전 동일 프레임 렌더.

---

## 5. 온보딩/가이드 설계

- 앱 내 "AI로 앱 만들기"(MiniAppOnboarding): 빈 상태+모달 상단 3스텝.
  1. 만들기: 복사 가능 예시 프롬프트 — _"학생용 [주제] 활동 웹앱을 HTML 파일 하나로 만들어줘. 조건: (1) HTML 한 파일로 완결(내 코드는 인라인), (2) 필요하면 CDN(폰트·라이브러리)·공개 API는 https로 불러와도 됨, (3) 모바일/큰 화면 반응형(`<meta viewport>`), (4) 학생 개인정보를 수집·저장·전송하지 않음."_ (인터넷 https 허용 결정 반영 — CDN·API 사용 가능.)
  2. 저장: `index.html`로 저장, 단일 파일 강조(HTML 본문은 한 파일, 단 외부 CDN/API는 https로 참조 가능).
  3. 올리기: 쌤도구>내가 만든 앱>앱 추가.
- 마이크로카피: "앱마다 디자인이 다를 수 있어요. 쌤핀은 안전하게 격리 실행합니다(PC·학생정보 미접근)."
- /docs: `landing/src/content/docs.ts`에 항목 추가+스크린샷, 릴리즈 시 `docs:check`+build, 링크는 `GUIDE_URL`/ssampin.com/docs만.

---

## 6. 단계별 작업 순서

1. **S1 도메인 골격:** MiniApp 엔티티+IMiniAppRepository+Settings 메타. 검증: tsc0+엔티티 test.
2. **S2 프로토콜+파일저장+webview 강제(격리 코어, 먼저):** miniapp-protocol(단일 partition 세션에 handle 등록)+MiniAppFileRepository+IPC+`installMiniAppWebviewGuard`(will-attach-webview 두 책임 분리)+main 등록. 검증: path-traversal 10종, 200+CSP integration, will-attach-webview 메타테스트, **기존 외부 쌤도구(숲소리/PBL스케치) 정상 로드 회귀 검증**, electron:dev 재시작 수동 로드.
3. **S3 실행기:** MiniAppRunner(단일 partition, preload/allowpopups 미부착). 검증: E2E 격리단언(electronAPI 부재+sandbox=true), 실렌더 3샘플.
4. **S4 관리 UI:** MiniAppsSection+RegisterModal+삭제/순서. 검증: frontend-design 협업, 등록→실행→삭제 E2E.
5. **S5 온보딩+동기화+/docs:** Onboarding, syncRegistry+App.tsx, docs.ts. 검증: docs:check+build, 동기화 왕복.
6. **S6 메타테스트+게이트:** 회귀 메타테스트+전체 게이트. architect 승인.

각 단계 후 4단계 게이트(tsc→lint→test→regression-check) 통과 범위 명시.

---

## 7. 테스트 계획 + 수용 기준

### 메타테스트

- `electron/miniapp-protocol.meta.test.ts`: (a) miniapp 스킴 standard+secure 등록, (b) 앱 루트 밖 403, (c) 응답에 CSP 헤더 존재 + `connect-src https:`(평문 http·object 차단), (d) handle이 `persist:miniapps` 세션에 등록됨(defaultSession 아님).
- `electron/miniapp-webview-guard.meta.test.ts` **[must-fix]**: `will-attach-webview`가 preload 삭제·`sandbox=true`·`nodeIntegration=false`·`contextIsolation=true` 강제하고, `miniapp://` 아닌 src를 preventDefault한다.
- `MiniAppRunner.meta.test.tsx`: webview에 **preload 없음 + `allowpopups` 없음** + partition `persist:miniapps` + nodeintegration 미설정.
- 새 BrowserWindow 미생성 → security-guards 창 메타테스트 대상 아님(문서화).

### Acceptance Criteria

- AC1: 업로드→이름·아이콘→저장 시 카드가 섹션에 나타남.
- AC2: 클릭 시 `miniapp://<id>/index.html` 프레임 렌더 + 미니앱 컨텍스트에서 `window.electronAPI===undefined` & `typeof require==='undefined'` & `typeof process==='undefined'`. (sandbox 강제 여부는 렌더러에서 `getWebPreferences()` 관측 불가 → **main 측 메타테스트로 검증**; Critic MAJOR-3.)
- AC3: 미니앱 `fetch('https://…')`는 **허용**(CDN/API 동작), `fetch('http://…')`(평문)와 `<object>`/원격 플러그인은 CSP로 차단+로깅. 미니앱에서 쌤핀 origin(`file://`/앱 IPC) 접근 시도는 실패.
- AC4: `miniapp://<id>/../../<userData>` 403.
- AC5: **절차** — 미니앱 2개(A,B) 등록 → A에서 `localStorage.setItem` write → B와 쌤핀 본체에서 같은 키 read 시도 → 모두 `null`(origin SOP 격리 확인). E2E 단계로 명문화.
- AC6: 0개면 얇은 안내만+정리하기 숨김 가능.
- AC7: 지연·실패 시 흰 화면 없이 스피너/에러 카드+전체화면 토글.
- AC8: 삭제 시 파일+메타 함께 제거.
- AC9: 4단계 게이트+landing docs:check+build 통과.
- AC10: 온보딩에 복사 가능 프롬프트+/docs 반영.

---

## 8. 리스크 & 2단계 확장

- R1 격리구멍(치명): §3 다층+메타테스트 AC2/AC5, S2/S3 먼저 검증.
- R2 경로조작: root 가드+테스트(AC4).
- R3 위화감: §4 프레임+실렌더 게이트(frontend-design).
- R4 인터넷 허용(https)으로 인한 위험: 1단계는 데이터창구 부재로 유출할 PII 없음 → 수용. **2단계 결합 규칙**(데이터 받는 앱은 connect-src 조임)으로 완화. 악성 앱의 트래킹/광고 가능성은 "내가 만든 앱만" 전제로 낮음.
- R5 electron 메인/IPC 변경 미반영: build-electron+재시작(MEMORY 함정).
- R6 동기화: MVP 메타만, syncRegistry+App.tsx 두 곳 주의.
- R7 프로토콜 등록 타이밍: registerSchemesAsPrivileged는 whenReady 이전, 메타테스트 고정.

**2단계 확장:** 격리 유지+단일 브로커 지점만 개방. 허가 UI 후 화이트리스트 스냅샷 postMessage. MVP 미장착+수신 지점 주석 예약.

- **[필수 결합 규칙] 인터넷 × 데이터 분리:** 2단계에서 어떤 미니앱이 명단·시간표 등 학생 데이터를 받도록 허가되면, **그 앱의 `connect-src`를 조여** 외부 전송 경로를 차단한다("정보 접근"과 "인터넷"을 동시에 열지 않음). 1단계에서 인터넷을 넓게 연 것은 데이터창구가 없어 유출할 PII가 없기 때문이며, 데이터가 들어오는 순간 이 전제가 깨지므로 반드시 짝을 맞춰야 한다.

---

## ADR

- **Decision:** `miniapp://` 커스텀 프로토콜 + **단일 partition `persist:miniapps` + 앱별 origin `miniapp://<appId>`** `<webview>`(preload 미부착, sandbox·CSP enforce, will-attach-webview main 강제), 쌤도구 하단 섹션.
- **Drivers:** 보안격리 > 위화감없는렌더링 > 아키텍처/디자인 일관성.
- **Alternatives:** B(file://) 가드충돌·격리불가 무효화 / C(iframe+Blob) origin/CSP/프로세스·상대경로 열세 / 앱별 partition은 `protocol.handle` 세션스코프 비용으로 단일 partition+origin에 열세.
- **Why:** 앱 간 격리는 origin(SOP)이, 본체와의 격리는 단일 partition이, 실행 강제는 will-attach-webview(main)가 담당 → 세션 스코프 문제 없이 `protocol.handle` 1회 등록. 2단계 브로커 확장성 유지. 초기비용은 메타테스트로 상쇄.
- **Consequences:** 신규 프로토콜/IPC/메타테스트(유지비 소폭↑), 미니앱 오프라인·인라인 단일HTML 제약(의도), 사이드바 불변. `<webview>` 태그 재사용(Electron 장기 비권장 리스크 수용).
- **Follow-ups:** 2단계 브로커 + **인터넷×데이터 결합 규칙(데이터 받는 앱은 connect-src 조임)**, HTML/이미지아이콘 클라우드 동기화, 다중파일(zip) 지원, **`<webview>`→`WebContentsView` 마이그레이션(Electron이 webview 태그 제거 announce 시 트리거)**.

### Open Questions (v4 — 전건 해소)

1. ~~아이콘 이미지 저장~~ → **해소(사용자): 별도 파일 저장, 기본은 이모지.**
2. ~~HTML 크기 상한~~ → **해소(사용자): 20MB.**
3. ~~미니앱 메타 동기화 범위~~ → **해소: 메타만 'settings' 도메인 편승, 파일은 로컬(Architect).**
4. ~~partition 세분화~~ → **해소: 단일 partition `persist:miniapps`+앱별 origin(Architect).**
5. ~~`connect-src` 완전차단 vs 허용~~ → **해소(사용자): 인터넷 일부 허용(`connect-src https:`+CDN). 2단계 데이터창구 시 데이터 받는 앱은 재조임.**

---

## v2 변경 이력 (Architect 조건부 승인 반영)

- must-fix ①: `will-attach-webview` main 강제(preload strip·sandbox·스킴 화이트리스트) 추가 → §3, S2, 메타테스트, AC2.
- must-fix ②: `protocol.handle` 세션 스코프 확정 → `persist:miniapps` 단일 partition 세션 등록.
- must-fix ③: `allowpopups` 제거 + sandbox 명시 → §3, MiniAppRunner, 메타테스트.
- synthesis: 앱별 partition → 단일 partition + 앱별 origin.
- should-fix: 동기화 이중등록 제거(settings 편승), CSP `media-src`/`worker-src` 추가, webview→WebContentsView follow-up.

## v3 변경 이력 (Critic ITERATE 반영)

- MAJOR-1: will-attach-webview를 (a)webPreferences strip=전체 적용 / (b)스킴 화이트리스트+sandbox=`persist:miniapps`에만 으로 **분리 명문화** → 기존 외부 쌤도구 회귀 방지 + S2에 회귀 검증 추가.
- MAJOR-2: 옵션 A 헤딩·ADR Decision/Alternatives/Consequences를 `단일 partition persist:miniapps + 앱별 origin`으로 교정(앱별 partition 잔존 제거).
- MAJOR-3: AC2의 `getWebPreferences().sandbox` 런타임 단언 → main 측 메타테스트로 위임, 런타임은 `electronAPI/require/process` 부재.
- 권장 반영: 크래시/폭주 복구 UX(`render-process-gone`, §4), RegisterMiniApp 중복/용량/업데이트 정책, AC5 cross-read E2E 절차.
- M1: 스킴에서 `supportFetchAPI` 제거(connect-src 'none'과 죽은 권한 정합).
