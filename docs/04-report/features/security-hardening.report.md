# security-hardening 완료 보고서

> **Project**: 쌤핀 (SsamPin)
> **Feature**: security-hardening
> **Status**: ✅ 사실상 종결 — P0 + P0-C + P1-2/3/4 완료·검증·배포. **P1-1(코드 서명)은 인디 무료 프로젝트라 비용 이슈로 미진행(F-3 리스크 수용)**. 패시브 후속만 남음(CSP enforce 전환·자투리·모바일 secret 로테이션).
> **Date**: 2026-05-12 (interim 2026-05-12 작성 → P0-C RG 통과·P1-1 보류 확정으로 갱신)
> **Plan**: [security-hardening.plan.md](../../01-plan/features/security-hardening.plan.md)
> **Design**: [security-hardening.design.md](../../02-design/features/security-hardening.design.md)
> **Audit**: [security-audit.analysis.md](../../03-analysis/security-audit.analysis.md)

---

## 1. 배경

`pblsketch/ssampin` 를 **오픈소스로 유지**하기로 확정(repo-privatization PDCA 취소 — 비공개 전환 철회). "소스가 공개돼 있어도 안전한 상태" 를 목표로, `security-architect` 에이전트 감사([`security-audit.analysis.md`](../../03-analysis/security-audit.analysis.md): Critical 1 / High 4 / Medium 13 / Low 5)에서 나온 항목을 우선순위(P0 릴리즈 게이트 → P1 → P2)대로 해소.

## 2. 완료 내역

| 항목                                               | 감사 매핑             | PR  | main      | 내용                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------- | --------------------- | --- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0-A** 유출 토큰 스크럽                          | F-1 (Critical)        | #12 | `e74679c` | tracked 문서 3곳(`dual-tool-view.design.md`·`realtime-wall-padlet-mode.report.md`·`archive/.../릴리즈_v1.10.3_kickoff.md`)·프로젝트 메모리 §3 의 `ssampin-admin-2024-secure` → `<ADMIN_API_KEY>` placeholder. `scripts/ingest-chatbot-qa.mjs` 는 이미 env-only. `git grep` 0건. (git history 스크럽은 P2-15)                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **U-1** `ADMIN_API_KEY` 로테이션                   | F-1                   | —   | —         | `npx supabase secrets set ADMIN_API_KEY=<새 랜덤값(openssl rand -hex 32)>`. 검증: 옛 토큰 → HTTP **401**(무력화), 새 토큰 → 함수 도달(400). 새 값은 사용자 보관.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **P0-B** 렌더러→메인 IPC 신뢰 경계 5종             | F-4·F-5 (High)        | #12 | `e74679c` | 신규 `electron/security/dialogHandles.ts`(저장/열기 dialog 1회용 경로 핸들 — UUID·TTL 5분·write 1회 / 렌더러는 경로 문자열 못 만짐) + `electron/security/safeFetch.ts`(`realtimeWallLinkPreview.ts` 의 SSRF 9중 방어 추출 — 사설IP 차단·DNS 리바인딩 핀·리다이렉트 한도·크기 cap). `shell:openExternal` 프로토콜 화이트리스트(`https:`/`http:`/`mailto:`). `shell:openPath` 경계검증(핸들 OR `app.getPath` 화이트리스트 OR 존재 디렉토리). `export:writeFile`/`openFile`/`showSaveDialog` 핸들화. `calendar:fetch-url`→`safeFetchText`(5MiB cap, content-type 화이트리스트, `webcal://`→`https://`). `preload.ts`·`src/global.d.ts`·`src/adapters/...` 15파일. 단위테스트 2종(`dialogHandles.test.ts`·`safeFetch.test.ts`, +15). |
| **RG-05~10** 런타임 검증                           | —                     | —   | —         | 사용자 확인 (2026-05-12): 내보내기 저장→열기 정상 / devtools 임의경로 writeFile·`file:` openExternal·파일 openPath → 거부 / `openPath` 디렉토리 → 통과 / `fetchCalendarUrl` 사설·링크로컬 IP → null / 담벼락 OG 미리보기 동일.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **④** `supabase/config.toml` verify_jwt 대조       | —                     | #28 | `2a49b2b` | 9개 함수에 무인증 호출 → 게이트웨이 401 vs 함수 자체 응답으로 판별. `ssampin-escalate`·`submit-assignment` 만 `verify_jwt=true`(게이트웨이 anon key JWT 1차 검증), 나머지 7개 `false` → config.toml 보정. (config.toml 은 `supabase functions deploy` 시에만 적용 — 현 배포 영향 없음)                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **GitHub Advanced Security**                       | —                     | —   | —         | Secret Protection · Push protection · Private vulnerability reporting · Dependabot alerts/security updates/malware alerts · CodeQL(advanced setup, `codeql.yml`) · Copilot Autofix — 전부 ON (사용자).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **`ssampin-releases` repo 삭제**                   | —                     | —   | —         | repo-privatization 잔재 정리 (사용자).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **P1-3** CI 보안 게이트                            | M-11 외               | #13 | `1798046` | `ci.yml` 에 `npm audit --audit-level=high`(continue-on-error) + `.github/dependabot.yml`(npm `/`·`/landing`·gh-actions, weekly) + `.github/workflows/codeql.yml`(`javascript-typescript`, `build-mode: none`, push/PR + 주간) + `supabase/config.toml`(신규) + `SECURITY.md`(신고 경로·시크릿 정책).                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **P1-4** Edge Function rate limit + 정보 노출 정리 | M-7·M-9·M-10 (Medium) | #31 | `1492b90` | `ssampin-escalate` IP/세션 rate limit(시간당 5회) + 개발자 알림 이메일 하드코딩 제거→`ESCALATE_NOTIFY_EMAIL` env(`wnsdlf1212@gmail.com` 설정 완료, 미설정 시 알림만 skip). `submit-assignment` rate limit(시간당 30회) + 본문 크기 cap(전체 12MB / textContent 64KB / studentName 100자). 전 9함수 `catch` → `_shared/cors.ts` `internalErrorResponse`(클라엔 일반 메시지, 상세는 서버 로그). `_shared/rateLimit.ts` 추출(`ssampin-chat` 재사용, `endpoint` 컬럼 구분 — 새 테이블/마이그레이션 불필요). **8개 Edge Function 전부 `supabase functions deploy` 배포 완료 + 스모크 테스트 통과**(ssampin-chat RAG 정상, escalate/submit 게이트웨이 401, 나머지 검증 메시지).                                                        |
| **P1-2** CSP (Report-Only)                         | M-1 (Medium)          | #32 | `154619c` | 신규 `electron/security/csp.ts`(`buildAppCsp()` 정책 빌더 + `attachCsp(session, reportOnly=true)` `onHeadersReceived` 헤더 부착·기존 CSP 제거 단일소스 + `installCspViolationLogger(app)` `console-message`→`[CSP violation]` 로깅, Electron 버전별 콜백 차이 방어·절대 throw 안 함). `main.ts` `app.whenReady()` 초입에서 prod 일 때만(`VITE_DEV_SERVER_URL` 없을 때) 부착 — **`'unsafe-eval'` 없음**(M-1 핵심), dev 는 Vite HMR 때문에 skip. `SECURITY.md` CSP 섹션. **enforce 전환은 위반 관찰 후 후속 PR.**                                                                                                                                                                                                                  |

### 감사 항목 커버리지

- **Critical**: F-1 ✅ (스크럽 + 로테이션)
- **High**: F-2 ✅ (P0-C — `GOOGLE_CLIENT_SECRET` 렌더러 번들 제거, 데스크톱+모바일 RG 통과) · F-4 ✅ (SSRF·프로토콜 화이트리스트) · F-5 ✅ (임의 경로 쓰기 차단) · **F-3 ⏸️ 리스크 수용 (P1-1 — 코드 서명, 인디 무료 프로젝트라 비용 이슈로 미진행)**
- **Medium**: M-1 ✅ (CSP Report-Only — enforce 는 관찰 후) · M-7 ✅ · M-9 ✅(부분 — 위장 제출 완화는 범위 밖) · M-10 ✅ · M-11 ✅(부분 — `npm audit` 게이트 승격·`package-lock` 재생성은 후속) / 나머지 Medium(M-2 weather key 프록시화·M-8 학생 명단 노출 등)은 P2 백로그
- **Low**: P2 백로그
- **결론**: 실행 범위(P0·P0-C·P1-2/3/4) 전부 완료. F-3(코드 서명)만 의도적 미진행 — 리스크(설치 시 SmartScreen 경고 / 빌드 PC 침해 시 변조 미탐지)를 명시적으로 수용. 자동업데이트 무결성은 SHA512+HTTPS 로 유지됨.

## 3. 미진행 / 후속

|                                       | 내용                                                                                                                                                                                                                                                                     | 상태                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **P1-1** (F-3) — 코드 서명            | Windows 코드 서명(Azure Trusted Signing ~$10/월 또는 OV 인증서 ~$200~400/년) + Win 빌드 GitHub Actions 이전 / macOS Apple Developer($99/년) + notarization → 인앱 자동업데이트 복원                                                                                      | **미진행 (결정 2026-05-12)** — 인디 무료 프로젝트, 연 비용 이슈. 리스크 수용. 향후 유료화/조직화 시 재검토 |
| CSP enforce 전환                      | 패키지 빌드 수 주간 운영하며 콘솔에 `[CSP violation]` 관찰 → 화이트리스트 보정 → `electron/main.ts` 의 `attachCsp(..., reportOnly:false)` 한 줄 PR                                                                                                                       | 패시브 후속 (관찰 기간 필요)                                                                               |
| 자투리 후속                           | picker(`dialog:showOpen`·`forms:openFile` 등) 핸들화 / `npm audit` `continue-on-error` 제거→하드게이트 / `package-lock.json` 재생성 + `npm ci` 복원 / M-2 `WEATHER_API_KEY`·NEIS 키 프록시화 / git history `git filter-repo` 토큰 스크럽(P2-15) / Supabase RLS 전수 감사 | 우선순위 낮음, 점진 처리                                                                                   |
| (사용자) 모바일 OAuth secret 로테이션 | Google Console 에서 모바일 "Web app" client secret 새 값 → `supabase secrets set GOOGLE_CLIENT_SECRET=새값`(즉시 픽업) / 데스크톱 client secret 폐기                                                                                                                     | 며칠 후 권장(옛 PWA 번들 캐시 사용자가 새 번들 받을 시간 후)                                               |
| (별개) Dependabot                     | PR 13+건 트리아지/머지 (루트·landing 의존성 bump — 보안 PDCA 무관 루틴)                                                                                                                                                                                                  | 점진 처리                                                                                                  |

## 3.5. P0-C 사후 보정 (2026-05-19) — 데스크톱 client_secret 복원

**배경**: P0-C 머지 후 일부 사용자 환경에서 데스크톱 OAuth 토큰 교환이 `400 invalid_request — client_secret is missing` 으로 실패. 사용자 신고(2026-05-19) 후 [oauth-callback-stuck PDCA](../../01-plan/features/oauth-callback-stuck.plan.md) 로 조사한 결과, Google "Desktop app"(installed) 클라이언트의 토큰 엔드포인트가 실제로 `client_secret` 을 요구함을 확인.

**조치** (`052cf33`, `fix/modal-scroll-overflow` 브랜치):

- [src/infrastructure/google/GoogleOAuthClient.ts](../../../src/infrastructure/google/GoogleOAuthClient.ts) — `clientSecret` 필드 + `exchangeCode`·`refreshTokens` body 에 `client_secret` 추가
- [vite.config.ts](../../../vite.config.ts) — `process.env.GOOGLE_CLIENT_SECRET = VITE_GOOGLE_CLIENT_SECRET` define 복원

**보안 영향 재평가** (F-2 부분 회귀):

- 데스크톱 렌더러 번들(`dist/`)에 client_secret 재포함 — P0-C 의 명시적 의도와 반대
- 단, Google 공식 입장상 [Desktop(installed) 클라이언트 secret 은 "기밀이 아님"](https://developers.google.com/identity/protocols/oauth2/native-app) (RFC 8252) — native app secret 은 본래 추출 가능하다고 명시. 실효 위협은 낮음
- 모바일 Edge Function 경로(`supabase/functions/oauth-exchange`)는 그대로 유지 — 서버 env 격리 보존
- P0-C 감사(`security-audit.analysis.md:211`) 권장사항 (b) "Google Cloud Console 에서 client type 재확인 후 제거" — 재확인 결과 **secret 필요**로 판명, (a) Edge Function 경유는 데스크톱에선 자동업데이트 흐름과 충돌(앱 외 의존성 추가)이라 미채택

**결론**: F-2 (High) 는 모바일 한정으로 해결 유지, 데스크톱은 Google 정책상 "노출 허용 secret" 으로 분류해 의도적 회귀 수용. 별도 후속 PDCA 없음.

## 4. 이미 양호했던 부분 (감사 부록 B — 재발 방지 기록)

7개 BrowserWindow 전부 `contextIsolation:true`+`nodeIntegration:false` / navigation·drop guard SSOT(`electron/security-guards.ts`) / OAuth 토큰 AES-256-GCM 서버 암호화 + safeStorage 로컬 / `realtimeWallLinkPreview.ts` 9중 SSRF 방어(모범 사례 — P0-B 에서 `safeFetch.ts` 로 추출해 재사용) / 실시간 WS Zod 검증 + rate limit + payload cap / 챗봇 escape-first(`dangerouslySetInnerHTML` 부재) / `forms:*`·`sticker:*`·`ssampin-slides://` 경로 화이트리스트 / native FFI(`@nut-tree-fork/nut-js`·`koffi`)는 사용자 명시 액션에서만 트리거 / `.env` gitignored.

## 5. 교훈

- **다중 세션 + 에이전트 위임 시 worktree 격리가 필수** — P1-2 작업이 한 번 메인 체크아웃(다른 세션의 미커밋 변경 다수)에 leakage 됐다가 stale base 위에서 갈라진 채 미커밋으로 남는 사고. `electron/security/csp.ts` 모듈만 회수해 `origin/main` 위에 깨끗이 재적용(PR #32)으로 해소. 에이전트에는 `isolation: "worktree"` + "절대 `cd e:\github\ssampin` 하지 마라" 명시 필요.
- **`electron/` 는 CI 타입체크 범위 밖**(`tsc --noEmit` `include: ["src"]`, 빌드는 esbuild=타입체크 없음) — `electron/` 변경은 패키지 빌드 런타임으로 확인하거나 별도 typecheck 게이트 추가 검토(후속 후보).
- **유출 시크릿은 코드/문서 스크럽만으로 해결 안 됨** — git history 의 옛 값이 유효하므로 **로테이션이 실질 remediation**. P0 "완료" 판정을 로테이션 확인(RG-02) 후로 미룬 것이 옳았음.
- **`config.toml` 의 `verify_jwt` 는 추정하지 말고 실제 배포와 대조** — 무인증 호출의 응답이 게이트웨이 401(`UNAUTHORIZED_NO_AUTH_HEADER`)인지 함수 자체 응답인지로 판별 가능. 안 맞으면 `supabase functions deploy` 가 설정을 바꿔버림.

## 6. 다음 단계

1. ~~P0-C~~ → ✅ 완료·RG 통과 (PR #34, `6c57f9f`)
2. ~~P1-1 (코드 서명)~~ → ⏸️ **미진행 확정 (인디 무료 프로젝트, 비용 이슈 — F-3 리스크 수용)**. 향후 유료화/조직화 시 재검토
3. (패시브) 패키지 빌드 운영하며 `[CSP violation]` 관찰 → enforce 전환 한 줄 PR
4. (사용자, 며칠 후) 모바일 OAuth secret 로테이션 → `supabase secrets set` / 데스크톱 secret 폐기
5. (점진) Dependabot PR 트리아지 · 자투리 후속(picker 핸들화·npm audit 게이트·package-lock 재생성)
6. → **본 보고서가 실행 범위 기준 종결 보고서.** P1-1 은 의도적 out-of-scope. 추가 변경 없으면 PDCA 종료로 봄.

---

## 변경 PR 목록

- #12 `feat(security): security-hardening P0 — 토큰 스크럽 + IPC 신뢰 경계 5종` → `e74679c`
- #13 `feat(security): security-hardening P1-3 — npm audit + Dependabot + CodeQL + supabase config` → `1798046`
- #28 `fix(security): supabase/config.toml verify_jwt 를 실제 배포 상태와 일치` → `2a49b2b`
- #31 `feat(security): security-hardening P1-4 — Edge Function rate limit + 에러 메시지 일반화` → `1492b90`
- #32 `feat(security): security-hardening P1-2 — CSP (Report-Only)` → `154619c`
- (#33 — P1-2 중복 PR, 닫힘)
