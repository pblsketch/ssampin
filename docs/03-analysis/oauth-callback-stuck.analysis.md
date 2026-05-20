# Gap Analysis — OAuth 콜백 URL 정지 버그 (핫픽스)

- **작성일**: 2026-05-19
- **Plan**: [`docs/01-plan/features/oauth-callback-stuck.plan.md`](../01-plan/features/oauth-callback-stuck.plan.md)
- **Design**: [`docs/02-design/features/oauth-callback-stuck.design.md`](../02-design/features/oauth-callback-stuck.design.md) (052cf33 통합 갱신본)
- **분석 방식**: gap-detector 에이전트 2회 호출 모두 529 서버 과부하 — 변경 범위가 작아(5 파일) 직접 산정
- **Match Rate**: **96%**

---

## 1. Match Rate 산정

Design §4 (구현 순서 6단계 — 052cf33 통합 후) 와 §1 Layer 1 / §3 Layer 3 요구사항을 항목별로 가중치 부여해 산정.

| #   | Design 요구사항                                                          | 가중치 | 충족 | 비고                                                                  |
| --- | ------------------------------------------------------------------------ | -----: | :--: | --------------------------------------------------------------------- |
| 1   | `buildCallbackSuccessHtml` / `buildCallbackErrorHtml` 함수 추출 + export |     15 |  ✅  | [electron/ipc/oauth.ts:49,85](../../electron/ipc/oauth.ts)            |
| 2   | 성공 페이지에 `window.close()` + 5초 카운트다운                          |     15 |  ✅  | oauth.ts:63-74 (`var n = 5`, `setInterval`, `try/catch window.close`) |
| 3   | 실패 페이지에 `window.close()` + 10초 카운트다운                         |     10 |  ✅  | oauth.ts:101-112                                                      |
| 4   | 거부 시 폴백 안내 ("창이 닫히지 않으면 직접 닫고")                       |      8 |  ✅  | oauth.ts:58, 96                                                       |
| 5   | Google `error` 파라미터 HTML escape                                      |     10 |  ✅  | oauth.ts:31-38 `escapeHtml`, oauth.ts:86 적용                         |
| 6   | 콜백 응답에서 빌더 함수 사용 (인라인 HTML 제거)                          |     10 |  ✅  | oauth.ts:152-189 → 빌더 호출로 교체                                   |
| 7   | `extractAuthCode` export                                                 |      5 |  ✅  | useGoogleAccountStore.ts:11 `export function`                         |
| 8   | 콜백 HTML 메타테스트 (14건)                                              |     12 |  ✅  | electron/ipc/oauth.callback-html.test.ts — 14/14 통과                 |
| 9   | `extractAuthCode` 회귀 테스트 (사용자 신고 URL 포함)                     |     10 |  ✅  | src/adapters/stores/**tests**/extractAuthCode.test.ts — 10/10 통과    |
| 10  | security-hardening report 데스크톱 secret 복원 메모 추가                 |      5 |  ✅  | docs/04-report/features/security-hardening.report.md §3.5             |

**충족 가중치 합계**: 100/100 = **100% (코드/문서 기준)**

**Match Rate 96%로 산정한 이유** — 코드 일치율은 100% 이나, 다음 두 항목을 -4 차감:

- **-2**: 콜백 응답 HTML 의 자동 닫기 동작이 **수동 RG 미실시** (사용자 환경에서 실제로 창이 5초 후 닫히는지 확인 안 됨). `window.close()` 가 거부되면 폴백 안내가 뜨도록 설계되어 정합성은 보장되지만, 정상 닫힘 케이스의 실측은 빌드 후 사용자 RG 단계로 이연.
- **-2**: 052cf33 의 보안 영향(F-2 부분 회귀)은 security-hardening report §3.5 에 문서화됐으나, **재패키징 후 `grep dist*/` 0건 회귀** 확인은 빌드 단계 RG (사용자가 다음 릴리즈 빌드 시 수행해야 할 후속).

---

## 2. 일치 항목 (Design ↔ 구현)

### Layer 1 — 콜백 페이지 자체 견고화 (4/4)

| Design 요구                       | 구현 위치                      | 검증                                                        |
| --------------------------------- | ------------------------------ | ----------------------------------------------------------- |
| HTML 빌더 함수 추출 + export      | `electron/ipc/oauth.ts:49, 85` | 메타테스트 `oauth.callback-html.test.ts` 14건               |
| `window.close()` 자동 호출        | oauth.ts:72, 110               | 정규식 `try { window.close(); } catch` 패턴 검증            |
| 카운트다운 (성공 5초 / 실패 10초) | oauth.ts:63, 101               | `var n = 5` / `var n = 10` 패턴 검증                        |
| 거부 폴백 안내                    | oauth.ts:58, 96                | "창이 닫히지 않으면" 문구 검증                              |
| HTML escape                       | oauth.ts:31-38, 86             | `<script>alert(1)</script>` → `&lt;script&gt;...` 변환 검증 |

### Layer 3 — 회귀 메타테스트 (2/2)

| 파일                                                    | 케이스 수 | 핵심 케이스                                                                                                                                  |
| ------------------------------------------------------- | --------: | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `electron/ipc/oauth.callback-html.test.ts`              |        14 | window.close 포함 / 카운트다운 5·10초 / try-catch / 거부 폴백 / escape (script·따옴표·꺾쇠)                                                  |
| `src/adapters/stores/__tests__/extractAuthCode.test.ts` |        10 | **2026-05-19 사용자 신고 URL 정확 파싱** (`iss=...&code=4/0AeoWuM...&scope=...&prompt=consent`) / raw code / 단편 / URL 디코딩 / trim / 빈값 |

### 052cf33 통합 (선행, 다른 세션)

| 변경                                      | 위치                                | 본 PDCA 영향                                    |
| ----------------------------------------- | ----------------------------------- | ----------------------------------------------- |
| `clientSecret` 필드 + 토큰 교환 body 주입 | `GoogleOAuthClient.ts:69, 132, 182` | 진짜 근본 원인 해결 — 본 PDCA Layer 2 폐기 근거 |
| `VITE_GOOGLE_CLIENT_SECRET` define 복원   | `vite.config.ts:32-34`              | 빌드 시점 secret 주입 복원                      |

### 검증 게이트 (4/4)

- TypeScript `tsc --noEmit`: 0 errors
- ESLint: 0 errors (warnings 118 = 기존, 신규 0)
- Vitest: **1180/1180** (메타테스트 24건 신규 포함)
- regression-grep-check: 9/9

---

## 3. Gap 목록

### Gap-1 (P2 — 후속 모니터링)

**항목**: 빌드 산출물(`dist/`)에 `GOOGLE_CLIENT_SECRET` 평문 재포함

- **현황**: 052cf33 이 `vite.config.ts` define 으로 secret 을 다시 주입 → 패키지 빌드 시 `dist/` 에 평문 포함됨 (security-hardening P0-C 의 의도와 반대)
- **보안 평가**: Google 공식상 [Desktop(installed) 클라이언트 secret 은 "기밀 아님"](https://developers.google.com/identity/protocols/oauth2/native-app) (RFC 8252) — 실효 위협 낮음
- **권장 조치**: 별도 코드 변경 불필요. 다음 릴리즈 빌드 후 `grep -r "VITE_GOOGLE_CLIENT_SECRET\|GOOGLE_CLIENT_SECRET" dist/` 가 secret 값을 노출하는지 한 번 확인하고, 노출되더라도 Google 정책상 허용임을 다시 명시 (security-hardening report §3.5 에 이미 정리). 모바일 Edge Function 경로는 영향 없음
- **Severity**: P2 (이미 의사결정 + 문서화 완료)

### Gap-2 (P2 — 수동 RG 후속)

**항목**: 콜백 페이지 자동 닫기 동작의 실제 사용자 환경 검증

- **현황**: 메타테스트 14건이 HTML 구조의 정합성(`window.close()` 호출, 카운트다운, 폴백 안내)은 검증하지만, Chrome/Edge 실 브라우저에서 5초 후 창이 실제로 닫히는지의 사용자 RG 는 빌드 후 수행 필요
- **권장 조치**: 다음 릴리즈 (v2.0.6 예정) 빌드 후 사용자 RG 시나리오 1건 추가:
  - 정상 OAuth → 동의 → 콜백 페이지 5초 카운트다운 표시 → 자동 닫힘 (or 폴백 안내 표시)
  - `access_denied` 케이스 → 실패 페이지 10초 후 닫힘
- **Severity**: P2 (Layer 1 의도된 UX 효과 확인용 — 핫픽스 완료에는 영향 없음)

### Gap-3 (P2 — 추적용)

**항목**: 콜백 응답 단계별 진단 로그 (Design §1.2)

- **현황**: Design §1.2 에 "단계별 타임스탬프 로그" 가 권장됐으나 본 세션 구현 범위에서 제외됨 (가설이 틀려 진단 가치가 낮아짐 — 진짜 원인은 토큰 교환 단계라 콜백 도착 타이밍 자체는 정상)
- **권장 조치**: 별도 변경 없음. 향후 OAuth 관련 새 버그가 들어오면 그 때 추가
- **Severity**: P2 (Design 의 nice-to-have 항목, 본 핫픽스 가치에 영향 없음)

---

## 4. 권장 결정

### Match Rate 96% ≥ 90% — Report 진행 가능

✅ **`/pdca report oauth-callback-stuck` 로 즉시 진행 권장**

근거:

1. Design §4 6단계 체크리스트 100% 충족 (코드 + 문서)
2. 검증 게이트 4종 모두 통과, 신규 메타테스트 24건 추가
3. 진짜 근본 원인(client_secret 누락)은 052cf33 으로 해결 — Plan/Design 의 폐기 처리가 명확히 문서화
4. Gap 3건 모두 P2 (후속 모니터링 / 사용자 RG 단계 이연 / nice-to-have) — iterate 필요 없음

### iterate 권장 항목 (없음)

P0/P1 Gap 0건. 본 PDCA 는 iterate 단계 생략하고 바로 Report.

### 사용자 행동 필요 (Report 후속)

1. **PR 생성**: 현재 `fix/modal-scroll-overflow` 브랜치에 본 세션 변경 5개 파일 + 052cf33 1개 커밋이 함께 있음. 별도 commit 으로 분리 후 PR (또는 같은 PR 안에 다중 커밋)
2. **v2.0.6 릴리즈**: 사용자가 다른 세션 작업까지 묶어서 릴리즈 예정이라고 명시. 릴리즈 시 Release Workflow 8단계(CLAUDE.md) 준수
3. **빌드 후 grep 확인** (Gap-1 후속): `release/win-unpacked/resources/app.asar` 또는 `dist/` 에서 secret 노출 위치를 한 번 확인하고 보고
4. **사용자 RG** (Gap-2 후속): 빌드된 앱에서 콜백 페이지 자동 닫기 확인

---

## 5. 보안 영향 요약 (security-hardening 후속)

- F-2 (High) 부분 회귀: 데스크톱 한정 client_secret 빌드 산출물 재포함
- 모바일 Edge Function 경로는 그대로 보존 — 서버 env 격리 유효
- Google 공식 정책상 native app secret 은 "기밀 아님" 으로 분류 → 실효 위협 낮음
- 의사결정 문서화 완료: `docs/04-report/features/security-hardening.report.md` §3.5 (2026-05-19 사후 보정)
- 별도 후속 PDCA 불필요 — 본 분석에서 모니터링 항목으로만 인식
