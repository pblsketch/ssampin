# security-hardening 계획서

> **Summary**: 쌤핀 코드베이스 보안 감사([`docs/03-analysis/security-audit.analysis.md`](../../03-analysis/security-audit.analysis.md)) 결과 발견된 Critical 1·High 4·Medium 13·Low 5 항목을 우선순위(P0 게이트 → P1 → P2)대로 해소한다. `pblsketch/ssampin` 은 **오픈소스 유지** 전제. 가장 시급한 건 유출된 관리자 토큰(`ssampin-admin-2024-secure`) 로테이션 + 문서 스크럽.
>
> **Project**: 쌤핀 (SsamPin)
> **Version**: (P0 는 다음 정식 릴리즈 게이트 — 미정)
> **Author**: pblsketch
> **Date**: 2026-05-12
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

저장소를 퍼블릭(오픈소스)으로 유지하기로 한 만큼, "소스가 공개돼 있어도 안전한" 상태를 만든다. 구체적으로:
1. 공개 저장소에 평문으로 들어간 시크릿(관리자 토큰, OAuth client secret, 날씨 API 키)을 제거·로테이션한다.
2. 렌더러 → 메인 IPC 의 신뢰 경계를 강화한다 (임의 경로 쓰기, 임의 URL open, SSRF).
3. 자동 업데이트·빌드 파이프라인 무결성(코드 서명, 빌드 PC 의존 제거)을 보강한다.
4. Edge Function 의 rate limit·권한·정보 노출을 손본다.
5. 공급망/의존성 모니터링(Dependabot·CodeQL·`npm audit` 게이트)을 켠다.

### 1.2 Background

- `repo-privatization` PDCA(소스 비공개 전환)는 취소됨 — 사용자가 "오픈소스 강조 + 보안 강화"로 선회. 그 Phase A 는 PR #11(main `4816b79`)로 전부 롤백 완료.
- `security-architect` 에이전트 감사 리포트: [`docs/03-analysis/security-audit.analysis.md`](../../03-analysis/security-audit.analysis.md) (Critical 1 / High 4 / Medium 13 / Low 5). 이미 양호한 부분(7 BrowserWindow 전부 contextIsolation, navigation/drop guard SSOT, OAuth 토큰 AES-256-GCM 서버 암호화, `realtimeWallLinkPreview.ts` 9중 SSRF 방어, 실시간 WS Zod+rate limit, 챗봇 escape-first 등)은 리포트 부록 B 참조.

### 1.3 Related Documents

- 감사 리포트: [`docs/03-analysis/security-audit.analysis.md`](../../03-analysis/security-audit.analysis.md)
- 취소된 선행 PDCA: [`docs/01-plan/features/repo-privatization.plan.md`](repo-privatization.plan.md) (CANCELLED)
- Release Workflow: 프로젝트 메모리 "Release Workflow" 섹션 (P0-1 에서 토큰 스크럽 대상)

---

## 2. Scope

### 2.1 In Scope — P0 (릴리즈/머지 게이트, 다음 정식 릴리즈 전 필수)

- [ ] **P0-1 — `ADMIN_API_KEY`(`ssampin-admin-2024-secure`) 로테이션 + 문서 스크럽** (코드 변경 거의 없음)
  - Supabase `ssampin-embed` 의 env 를 `openssl rand -hex 32` 새 값으로 교체
  - tracked 문서 3곳 placeholder 치환: `docs/02-design/features/dual-tool-view.design.md:597`, `docs/04-report/features/realtime-wall-padlet-mode.report.md:437`, `docs/archive/2026-04/릴리즈_v1.10.3_kickoff.md`
  - 프로젝트 메모리 `MEMORY.md` §3(AI 챗봇) 예시 명령의 토큰도 placeholder 로 (메모리는 로컬이라 repo 영향 없지만 일관성)
  - `scripts/ingest-chatbot-qa.mjs` 가 토큰을 하드코딩하는지 확인 후, 한다면 env-only 로
  - (git history 의 토큰 문자열 제거는 P2-15 로 분리 — 비용 큼, 로테이션이 우선)
- [ ] **P0-2 — `GOOGLE_CLIENT_SECRET` 을 렌더러 번들에서 제거** + 로테이션
  - `vite.config.ts:33` / `vite.mobile.config.ts:115` 의 `define` 에서 `GOOGLE_CLIENT_SECRET` 제거
  - OAuth authorization-code 교환을 Supabase Edge Function 으로 이전 (또는 Google Cloud Console 에서 client type 이 native/installed 면 secret 불필요한지 확인 — PKCE만으로 충분한지)
  - Google Cloud Console 에서 secret 로테이션
- [ ] **P0-3 — 렌더러→메인 IPC 신뢰 경계 5종 패치**
  - `shell:openExternal` ([`electron/main.ts:2680-2687`](../../../electron/main.ts#L2680-L2687)) — 프로토콜 화이트리스트(`https:`/`http:`/`mailto:` 만)
  - `shell:openPath` / `export:openFile` ([`electron/main.ts:2672-2677`](../../../electron/main.ts#L2672-L2677), `2849-2879`) — `app.getPath` 하위 또는 dialog 로 받은 경로만 허용 (경계 검증)
  - `export:writeFile(filePath, data)` ([`electron/main.ts:2617-2637`](../../../electron/main.ts#L2617-L2637)) — 임의 절대 경로 금지: dialog-token 패턴(메인이 발급한 saveAs 핸들만 쓰기 허용) 또는 단일 `saveAs(suggestedName, data)` IPC 로 대체
  - `calendar:fetch-url` ([`electron/main.ts:2849-2879`](../../../electron/main.ts#L2849-L2879)) — `realtimeWallLinkPreview.ts` 의 SSRF 방어(사설 IP·리다이렉트·스킴·크기 제한) 패턴 적용 → 공통 모듈로 추출(P1-5 와 통합)

### 2.2 In Scope — P1 (다음 스프린트)

- [ ] **P1-1 (=F-3)** — Windows 코드 서명 인증서 발급 + **Windows 빌드를 GitHub Actions 로 이전**(빌드 PC 침해 위험 제거); macOS Apple Developer + notarization → 인앱 자동업데이트 복원. (비용·시간 큼 — 별도 트랙 가능)
- [ ] **P1-2 (=M-1)** — CSP 헤더 도입 (`session.defaultSession.webRequest.onHeadersReceived` 또는 `index.html` 메타). `ssampin-slides://` 를 `img-src` 에 허용. 인라인 스크립트/스타일 정리 필요 범위 조사
- [ ] **P1-3 (=M-11)** — `package-lock.json` 클린 재생성 + CI 에 `npm audit --audit-level=high` 게이트 + GitHub **Dependabot** + **CodeQL** 활성화(퍼블릭 무료). `supabase/config.toml` 저장소 추가
- [ ] **P1-4 (=M-7/M-9/M-10)** — Edge Function 보강: `ssampin-escalate` rate limit + 개발자 이메일 env 필수화(하드코딩 제거); `submit-assignment` rate limit + 위장 제출 완화(과제별 학생 코드 옵션 검토); 모든 Edge Function 에러 메시지 일반화(스택·내부정보 노출 금지)

### 2.3 In Scope — P2 (백로그)

- [ ] M-8 `get-assignment-public` 학생 명단 노출 완화
- [ ] `webviewTag` 사용 여부 확인 후 제거 또는 가드
- [ ] `safeStorage` 미가용 시 평문 폴백 → 거부 또는 명시 경고 UI
- [ ] student-records 등 민감 도메인 데이터에 `safeStorage` 암호화 옵션
- [ ] 모든 파일 import 진입점(.ssampin / roster / HWPX / Excel)에 크기·행수·페이지 cap 일괄 적용
- [ ] `WEATHER_API_KEY`(M-2) / NEIS 키 프록시화 + 로테이션 → 소스 트리에서 제거
- [ ] **P2-15 — git history 스크럽**: `git filter-repo --replace-text` 로 `ssampin-admin-2024-secure` → `***REMOVED***` 후 force-push (퍼블릭이므로 협력자 rebase 안내). P0-1 로테이션 이후라 긴급도는 낮음
- [ ] 공급망 모니터링: `@nut-tree-fork/nut-js`·`koffi`·`cloudflared` 버전 핀·릴리즈 워치
- [ ] Supabase RLS 전수 감사

### 2.4 Out of Scope

- `repo-privatization`(비공개 전환) — 취소됨, 본 PDCA 와 무관
- 침투 테스트(pentest) 외주 — 별도
- 신규 기능 추가

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | `ADMIN_API_KEY` 가 로테이션되고, 공개 저장소의 어떤 tracked 파일에도 유효한 시크릿 값이 없다 (`git grep` 검증) | P0 | Pending |
| FR-02 | 빌드 산출물(`dist/`, `dist-mobile/`)에 `GOOGLE_CLIENT_SECRET` 평문이 포함되지 않는다 (빌드 후 `grep` 검증) | P0 | Pending |
| FR-03 | `shell:openExternal`/`openPath`, `export:openFile`/`writeFile`, `calendar:fetch-url` 가 검증되지 않은 렌더러 입력을 OS/네트워크로 전달하지 않는다 | P0 | Pending |
| FR-04 | Windows 인스톨러가 코드 서명되고, Windows 빌드가 신뢰된 CI 에서 생성된다 | P1 | Pending |
| FR-05 | 앱에 CSP 가 적용된다 (`script-src`/`object-src` 'none' 수준, 필요한 출처만 허용) | P1 | Pending |
| FR-06 | CI 에 `npm audit --audit-level=high` 게이트 + Dependabot + CodeQL 이 켜져 있다 | P1 | Pending |
| FR-07 | `ssampin-escalate`·`submit-assignment` 에 rate limit 이 있고, Edge Function 에러 메시지가 내부 정보를 노출하지 않는다 | P1 | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement |
|----------|----------|-------------|
| 회귀 없음 | P0~P1 변경 후 `npm run typecheck && npm run lint && npm run test && npm run regression-check` 그린 | CI |
| 무중단 | OAuth 로그인·자동업데이트·날씨·챗봇이 변경 후 정상 동작 | 수동 RG |
| 추적성 | 각 FR ↔ 감사 리포트 항목(F-/M-) ↔ 커밋 매핑 | 보고서에 표 |

---

## 4. Success Criteria

### 4.1 Definition of Done (단계별)

- **P0 완료** = FR-01·FR-02·FR-03 충족 + 검증(`git grep`/빌드 grep/수동 IPC 테스트) + CI 그린 → **다음 정식 릴리즈에 포함**
- **P1 완료** = FR-04~FR-07 충족 (코드 서명은 인증서 조달 일정에 따라 분리 가능)
- **P2** = 백로그, 점진 처리
- 전체 마무리: `/pdca analyze security-hardening` → `/pdca report security-hardening` (P0+P1 기준)

### 4.2 Quality Criteria

- [ ] Lint·typecheck·test·regression 그린 (변경 범위)
- [ ] 빌드(앱 + 랜딩) 성공
- [ ] 감사 리포트의 모든 P0·P1 항목이 "해소" 또는 "의도적 보류(사유 명시)" 로 마킹

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| OAuth code 교환을 서버로 옮기다 로그인 흐름이 깨짐 | High | Medium | Edge Function 으로 옮기기 전, Google client type 확인 — native client면 secret 자체가 불필요(PKCE)하니 define 만 제거하면 끝. 그 경우 서버 이전 불필요. 변경 후 로그인 RG 필수 |
| `export:writeFile` 패턴 변경이 내보내기 기능(HWPX/Excel/PDF 저장)을 깨뜨림 | High | Medium | dialog-token 패턴: 기존 "저장 위치 선택" dialog 가 이미 있으면 그 결과 경로만 화이트리스트. 모든 export 경로 RG |
| 코드 서명 인증서 조달 지연 | Medium | High | P1-1 을 독립 트랙으로 분리. 그 사이 다운로드 무결성은 SHA512+HTTPS 로 유지(현 상태와 동일). macOS 인앱 업데이트는 이미 릴리즈 페이지 안내로 폴백 중 |
| git history filter-repo force-push 가 협력자/포크에 혼란 | Medium | Low | P2 로 분리. 로테이션(P0-1)이 실질 위협을 제거하므로 history 스크럽은 정리 차원. 실행 시 사전 공지 |
| CSP 도입이 인라인 스크립트/스타일·외부 리소스(폰트 CDN 등)를 깨뜨림 | Medium | Medium | 먼저 `Content-Security-Policy-Report-Only` 로 위반 수집 → 화이트리스트 확정 후 enforce |
| `npm audit` 게이트가 픽스 불가 transient 취약점으로 CI 를 막음 | Low | Medium | `--audit-level=high` 로 시작, 필요시 특정 advisory `--exclude` 또는 `overrides`. 처음엔 `continue-on-error` 로 가시화만 → 안정화 후 게이트 |

---

## 6. Architecture Considerations

> 본 작업은 보안 패치 + IPC 경계 강화 + 빌드/CI 설정 + 문서 스크럽 + Edge Function 보강. 애플리케이션 4레이어 구조 변경 없음. IPC 검증 로직은 `electron/` 안에서 처리(infrastructure 상당) — SSRF 방어 공통 모듈을 `electron/` 하위에 추출(`realtimeWallLinkPreview.ts` 와 `calendar:fetch-url` 가 공유). domain/usecases 는 손대지 않음.

### 6.1 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| OAuth secret 처리 | (a) 렌더러 define 제거만(native client+PKCE) / (b) code 교환을 Edge Function 으로 이전 | **먼저 (a) 가능성 확인** → 안 되면 (b) | 대부분의 데스크톱 OAuth 는 native client + PKCE 라 secret 불필요. 확인이 선행 |
| `export:writeFile` 임의 경로 차단 | dialog-token / 화이트리스트 디렉토리 / saveAs 단일 IPC | **dialog-token** (메인이 발급한 핸들로만 쓰기) | 기존 "저장 위치 선택" UX 유지하면서 임의 경로 차단. 변경 최소 |
| SSRF 방어 | 각 IPC 마다 인라인 / 공통 모듈 추출 | **공통 모듈 추출** | `realtimeWallLinkPreview.ts` 의 9중 방어가 이미 모범 사례 — `calendar:fetch-url` 와 향후 추가 fetch IPC 가 재사용 |
| 코드 서명 | Win OV / Win EV / Azure Trusted Signing / 미서명 유지 | **Win 서명 도입(방식은 P1 에서 비용 비교)** + Win 빌드 CI 이전 | 미서명은 빌드 PC 침해 시 변조 탐지 불가 + SmartScreen 경고. CI 이전이 빌드 PC 의존 제거 |
| Dependabot/CodeQL | 켬 / 안 켬 | **켬** | 퍼블릭 저장소 무료. 오픈소스 신뢰도에도 +-

### 6.2 Clean Architecture Approach

변경 위치(전부 기존 폴더):
- `electron/main.ts`, `electron/ipc/*.ts`, 신규 `electron/security/urlGuard.ts`(가칭, SSRF 공통) — infrastructure/메인
- `vite.config.ts`, `vite.mobile.config.ts`, `electron-builder.yml`, `.github/workflows/*.yml`, `supabase/config.toml`(신규) — 빌드/인프라
- `supabase/functions/ssampin-escalate/`, `submit-assignment/`, (기타 에러 메시지) — Edge Functions
- `docs/02-design/features/dual-tool-view.design.md`, `docs/04-report/features/realtime-wall-padlet-mode.report.md`, `docs/archive/2026-04/릴리즈_v1.10.3_kickoff.md`, `scripts/ingest-chatbot-qa.mjs` — 문서/스크립트 스크럽
- `index.html` 또는 메인의 `onHeadersReceived` — CSP

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] `CLAUDE.md` 코딩 컨벤션 / `tsconfig.json` strict / ESLint·Prettier·CI 하드 게이트(typecheck·lint·test·regression) 존재
- [x] 다중 세션 충돌 시 `git worktree` 사용 (CLAUDE.md/메모리)

### 7.2 Conventions to Define

| Category | To Define | Priority |
|----------|-----------|----------|
| 시크릿 관리 | 어떤 env 가 server-only / build-time / 절대 클라이언트 금지인지 명문화 (예: `docs/SECURITY.md` 또는 `CLAUDE.md` 섹션) | P1 |
| IPC 입력 검증 | "렌더러 입력은 메인에서 항상 검증" 규칙 + 경로/URL 검증 헬퍼 사용 의무 | P0~P1 |
| 파일 import cap | 모든 파일 파서 진입점의 표준 크기/행수 한도 | P2 |

### 7.3 Secrets / 환경 변수 정리 (감사 후 분류)

| Variable | 현 상태 | 목표 |
|----------|---------|------|
| `ADMIN_API_KEY` (ssampin-embed) | tracked 문서에 평문 | 로테이션, server-only, 문서에서 제거 |
| `GOOGLE_CLIENT_SECRET` | 렌더러 번들에 주입 | 제거(native client+PKCE) 또는 server-only, 로테이션 |
| `WEATHER_API_KEY` | 소스 트리 평문(추정) | 프록시화 또는 build-time env, 로테이션 |
| NEIS 키 | 소스 트리 평문(추정) | 위와 동일 |
| Supabase anon key, OAuth client ID | 공개 무방 | 유지 (구분 명문화) |

---

## 8. Next Steps

1. [ ] 본 계획 승인 + P0/P1/P2 우선순위 확정
2. [ ] (선택) `/pdca design security-hardening` — P0 항목의 구체 설계(IPC 패치 diff, dialog-token 흐름, SSRF 공통 모듈 인터페이스, 검증 체크리스트). 또는 P0 가 비교적 명확하면 바로 Do
3. [ ] Do — P0 먼저(릴리즈 게이트) → P1
4. [ ] `/pdca analyze` → `/pdca report` (P0+P1 기준)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-05-12 | 초안 — security-architect 감사 리포트(`docs/03-analysis/security-audit.analysis.md`) 기반. P0(토큰 로테이션·OAuth secret·IPC 경계 5종) / P1(코드서명·CSP·Dependabot·Edge Function) / P2 백로그 | pblsketch |
