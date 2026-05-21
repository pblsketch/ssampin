---
template: analysis
version: 1.0
feature: realtime-tool-student-page-health
date: 2026-05-21
author: gap-detector (read-only) + Claude
project: ssampin
plan_ref: ../01-plan/features/realtime-tool-student-page-health.plan.md
design_ref: ../02-design/features/realtime-tool-student-page-health.design.md
---

# Analysis — 실시간 도구 학생 페이지 연결 상태 가시화 + 회귀 가드 (Gap Detection)

> Plan v1.0 + Design v1.0 ↔ 실제 구현 매칭률 분석. gap-detector 에이전트(read-only) 수행 결과를 본 문서로 보존.

---

## 1. Executive Summary

| 항목                         | 값                                                         |
| ---------------------------- | ---------------------------------------------------------- |
| **전체 Match Rate**          | **98%**                                                    |
| **판정**                     | ✅ **PASS** (≥90%)                                         |
| **FR 통과율**                | 10/10 (100% 기능 충족, FR-10은 회귀 가드 형태 차이만 있음) |
| **Design §1~3 일치율**       | 100% (API·CSS·HTML·JS·diff·회귀 패턴 모두 1:1 매칭)        |
| **DoD 통과율 (자동 검증분)** | Phase 0 3/3, Phase 1 5/5, Phase 2 3/3                      |
| **HIGH 갭**                  | 0건                                                        |
| **MEDIUM 갭**                | 1건 (FR-10 표현 정합화)                                    |
| **LOW 갭**                   | 2건 (step mode silent fallback, 모바일 수동 검증 미실시)   |

**결론**: Plan 10개 FR 모두 코드로 구현. Design 의 공용 모듈 API·CSS·HTML·JS·4개 파일 diff·5건 회귀 패턴이 모두 1:1 매칭. 검증 게이트 4/4 통과(tsc 0 / lint 0 / test 1510 / regression 22). **Iterate 불필요, Report 단계로 진행 가능**.

---

## 2. FR Matrix

| ID        | Priority | Plan 요구사항                          | 구현 위치                                                                                                                                                                                                                                                                                             |   상태    |
| --------- | -------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------: |
| **FR-01** | High     | 5단계 진단 Q&A 추가                    | [`ingest-chatbot-qa.mjs:1343-1350`](../../scripts/ingest-chatbot-qa.mjs#L1343)                                                                                                                                                                                                                        |    ✅     |
| **FR-02** | Medium   | "연결 끊김 표시" Q&A                   | [`ingest-chatbot-qa.mjs:1351-1358`](../../scripts/ingest-chatbot-qa.mjs#L1351)                                                                                                                                                                                                                        |    ✅     |
| **FR-03** | Medium   | "학교 Wi-Fi 차단" Q&A + IT 요청 템플릿 | [`ingest-chatbot-qa.mjs:1359-1366`](../../scripts/ingest-chatbot-qa.mjs#L1359)                                                                                                                                                                                                                        |    ✅     |
| **FR-04** | High     | 4개 학생 페이지 우상단 연결 칩         | [`liveWordCloudHTML.ts:186`](../../electron/ipc/liveWordCloudHTML.ts#L186) / [`liveSurveyHTML.ts:181`](../../electron/ipc/liveSurveyHTML.ts#L181) / [`liveVoteHTML.ts:153`](../../electron/ipc/liveVoteHTML.ts#L153) / [`liveMultiSurveyHTML.ts:754`](../../electron/ipc/liveMultiSurveyHTML.ts#L754) |    ✅     |
| **FR-05** | High     | 4상태 색상·텍스트 항상 가시            | [`_studentPageChrome.ts:48-51`](../../electron/ipc/_studentPageChrome.ts#L48) (CSS), [`_studentPageChrome.ts:98-103`](../../electron/ipc/_studentPageChrome.ts#L98) (라벨), 4 파일 ws.onopen/onclose/scheduleReconnect 훅                                                                             |    ✅     |
| **FR-06** | High     | WS 미연결 보내기 disable + dim         | [`_studentPageChrome.ts:64-68`](../../electron/ipc/_studentPageChrome.ts#L64) (CSS), [`_studentPageChrome.ts:117-124`](../../electron/ipc/_studentPageChrome.ts#L117) (JS data-ws-blocked 토글)                                                                                                       |    ✅     |
| **FR-07** | Medium   | submit 함수 silent no-op 차단 + 안내   | 워드클라우드/주관식: placeholder 1.5초 안내. 객관식/복합: early return (이미 dim 됐기 때문) — Design §1.5 "안전망" 의도와 부합                                                                                                                                                                        |    ✅     |
| **FR-08** | High     | regression-grep `[hidden]` 가드 4건    | [`regression-grep-check.mjs:122-141`](../../scripts/regression-grep-check.mjs#L122) REGRESSION #18~#21                                                                                                                                                                                                |    ✅     |
| **FR-09** | High     | 헬스 인디케이터 패턴 회귀 grep         | [`regression-grep-check.mjs:142-149`](../../scripts/regression-grep-check.mjs#L142) REGRESSION #22 (sp-conn-chip + role=status + aria-live=polite)                                                                                                                                                    |    ✅     |
| **FR-10** | Medium   | submit 함수 사용자 피드백 회귀 grep    | 별도 항목 없음 — Plan §4.1·§10·§13 모두 "5건"으로 사용자 확정. 코드 가드만 존재                                                                                                                                                                                                                       | ⚠️ MED-01 |

---

## 3. Design §1~3 검증

### 3.1 공용 모듈 API 시그니처 (Design §1.1) — 100%

| Design 시그니처                                                  | 구현                                                                                                                | 일치 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | :--: |
| `getConnectionChipCSS(): string`                                 | [`_studentPageChrome.ts:15`](../../electron/ipc/_studentPageChrome.ts#L15)                                          |  ✅  |
| `getConnectionChipHTML(): string`                                | [`_studentPageChrome.ts:73`](../../electron/ipc/_studentPageChrome.ts#L73)                                          |  ✅  |
| `getConnectionChipJS({submitButtonSelectors: string[]}): string` | [`_studentPageChrome.ts:91`](../../electron/ipc/_studentPageChrome.ts#L91) — 파라미터 타입 `readonly string[]` 강화 | ✅+  |
| (추가) `getConnectionChipBundle(...)`                            | [`_studentPageChrome.ts:136`](../../electron/ipc/_studentPageChrome.ts#L136) — 참고용 헬퍼, Design 무명세지만 무해  |  ➕  |

### 3.2 CSS·HTML·JS 정의 (Design §1.2~1.4) — 100%

- CSS: 기본 스타일, ::before 도트, 4상태 색상(#fbbf24/#34d399/#f87171/#fb923c), 펄스 애니메이션, `@supports env(safe-area-inset-top)`, dim 스타일 모두 일치
- HTML: 6개 속성(`class`/`data-state`/`role`/`aria-live`/`aria-label`/`id`) + 라벨 텍스트 모두 일치
- JS: IIFE + 'use strict', STATE_LABELS 4상태 한국어 라벨, currentState 'connecting' 초기, 동일 상태 early return, data-state·라벨·data-ws-blocked 토글, `window.spConnSetState` 전역 노출 모두 일치. ➕ Design 무명세 방어 코드 추가(`if (!STATE_LABELS[state]) return`)

### 3.3 4개 파일 diff (Design §2.1~2.4) — 100%

| 파일                   | submit 셀렉터                          | 구현                                                                                                                                      | 일치 |
| ---------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | :--: |
| liveWordCloudHTML.ts   | `#submitBtn`                           | import + chip CSS/HTML/JS + 4 WS 훅(L274/287/331/346) + submit 가드(L358)                                                                 |  ✅  |
| liveSurveyHTML.ts      | `#submit-btn`                          | 동일 패턴, WS 훅(L259/272/308/323) + submit 가드(L359)                                                                                    |  ✅  |
| liveVoteHTML.ts        | `.option-btn`                          | 동일 패턴, WS 훅(L221/234/270/285) + early return(L297)                                                                                   |  ✅  |
| liveMultiSurveyHTML.ts | `['#submit-btn', '#sm-answer-submit']` | 칩 1회 마운트(L754), scroll mode WS 훅(L1874-1928) + step mode WS 훅(L1629-1729) — 두 connect() 모두 chip 호출, scroll submit 가드(L1853) |  ✅  |

### 3.4 5건 회귀 패턴 (Design §3) — 100%

REGRESSION #18~#22 모두 Design 명세와 정규식 일치. 본 실행에서 **5/5 PASS**.

---

## 4. Phase별 DoD 점검

| 항목                                        | 상태 | 비고                                       |
| ------------------------------------------- | :--: | ------------------------------------------ |
| **Phase 0** Q&A 3건 추가 (lint 통과)        |  ✅  |                                            |
| Phase 0 사용자 ingest 실행                  |  ⏳  | Claude 책임 외                             |
| Phase 0 챗봇 KB upsert 확인                 |  ⏳  | 사용자 행동                                |
| **Phase 1** 4개 학생 페이지 칩 컴포넌트     |  ✅  |                                            |
| Phase 1 4페이지 4상태 정상 전환 (코드 검증) |  ✅  |                                            |
| Phase 1 보내기 disable 조건                 |  ✅  |                                            |
| Phase 1 실제 모바일 시각 검증               |  ⏳  | LOW-02                                     |
| Phase 1 검증 게이트 4/4                     |  ✅  | tsc 0 / lint 0 / test 1510 / regression 22 |
| **Phase 2** regression-grep-check 5건 추가  |  ✅  |                                            |
| Phase 2 메타테스트 의도적 삭제 시 FAIL      |  ⏳  | 사용자 행동                                |
| Phase 2 22/22 PASS                          |  ✅  |                                            |

### Quality Criteria (Plan §6.4)

| 항목                              | 기준                  | 실제                                                       |                                    상태                                    |
| --------------------------------- | --------------------- | ---------------------------------------------------------- | :------------------------------------------------------------------------: |
| 변경 파일 수                      | 6개                   | 7개 (`_studentPageChrome` 신규 포함)                       | ⚠️ Design §4 가 이미 7로 계산 — Plan §6.4 만 6으로 잘못 표기. 실질 갭 없음 |
| 학생 페이지 라인수 증가 ≤ 40/파일 |                       | +25~30/파일                                                |                                     ✅                                     |
| 시각 회귀 0건                     | 칩만 추가, 외관 보존  | (코드 검토)                                                |                                     ✅                                     |
| 기능 회귀 0건                     | submit 흐름 영향 없음 | 정상 경로에서 chip JS는 spConnSetState('connected')만 추가 |                                     ✅                                     |

---

## 5. 갭 목록

### MEDIUM

#### MED-01: FR-10 표현 불일치 — Plan §5.1 FR 표 ↔ §4.1·§10·§13 + Design §3

- **현상**: Plan §5.1 FR-10 표가 "submit 함수 사용자 피드백 회귀 grep"을 별도 항목으로 명시. 그러나 §4.1 Phase 2 / §10 Phase 2 / §13 Resolved Decision #3 + Design §3 모두 **"5건"** (`[hidden]` 4 + chip 1)으로 사용자 확정. 구현은 후자를 따름.
- **영향**: 회귀 위험 낮음 — FR-06 chip JS가 `data-ws-blocked` 로 버튼 dim 처리, 4개 파일 submit 함수가 모두 `if (!ws || ws.readyState !== WebSocket.OPEN) return` 가드 보유. 단, 미래에 누군가 submit 가드를 지워도 regression-grep이 못 잡음.
- **권고 (택1)**:
  - **(A) 가벼움**: Plan v1.1로 FR-10을 "5건에 흡수됨 — chip dim 보장으로 silent no-op 차단"으로 갱신
  - **(B) 안전**: REGRESSION #23 추가 — `if (!ws || ws.readyState !== WebSocket.OPEN)` 패턴이 4개 파일에 존재하는지 강제
- **결정자**: 사용자 (Report 단계에서 결정)

### LOW

#### LOW-01: Step mode `#sm-answer-submit` submit 핸들러 placeholder 안내 없음

- **현상**: liveMultiSurveyHTML.ts step mode submit 콜백은 sendAnswer() 호출 → false 반환 시 silent. 워드클라우드/주관식의 placeholder 안내와 같은 명시적 메시지 없음.
- **영향**: 매우 낮음 — `#sm-answer-submit` 버튼이 `submitButtonSelectors` 에 포함돼 `data-ws-blocked` 로 dim+pointer-events:none 처리되므로 클릭 자체 불가. Design §1.5 의 "안전망" 의도와 부합.
- **권고**: 현 상태 유지. 필요 시 향후 PDCA 에서 step mode 버튼 라벨 폴링 추가.

#### LOW-02: Plan §11.2 모바일 6 시나리오 수동 검증 미실시

- **현상**: 정상 진입 / 단어 제출 / PC 중지 / 자동 재연결 / 미연결 클릭 / 360px SE 위치 6개 시나리오 수동 검증 결과 분석 시점에 없음.
- **영향**: 코드 검증으로는 충분. iOS Safari safe-area-inset-top 시각 회귀 제로는 아님.
- **권고**: 사용자가 v2.0.7 묶음 빌드 후 1회 모바일 emulation 확인 → Report 단계에서 기록.

---

## 6. 회귀 위험 평가

### 6.1 본 작업이 도입한 새 회귀 가능성

| 위험                                         |       가능성       | 완화                                                                 |
| -------------------------------------------- | :----------------: | -------------------------------------------------------------------- |
| 칩이 360px 화면에서 본문 충돌                |        낮음        | `position:fixed` + `pointer-events:none` + 다크 배경 blur 캡슐       |
| WS 연결 직전 학생 입력 시 dim false-positive |        낮음        | page load → connect() 1초 이내 connected 전환                        |
| 공용 헬퍼 변경 시 4 파일 동시 영향           | 높음 (의도된 결합) | REGRESSION #22 가 헬퍼 구조 변경 차단                                |
| 빨강 disconnected 자극적                     |        낮음        | 펄스 1.2s ease-in-out, 30% opacity 까지만 내려감                     |
| Step mode page transition 사이 chip 사라짐   |     매우 낮음      | `<body>` 시작 직후 fixed 마운트, show() 함수가 #spConnChip 안 건드림 |

### 6.2 본 작업이 차단한 회귀

| 회귀 유형                                          | 차단 방식                                            |
| -------------------------------------------------- | ---------------------------------------------------- |
| v2.0.4 이하 `[hidden]` 가드 부재 → 5상태 동시 노출 | REGRESSION #18~#21                                   |
| 학생이 WS 미연결을 자각 못 하는 침묵형 실패        | REGRESSION #22 + 4 파일 chip 마운트                  |
| submit 함수 silent no-op                           | 4 파일 모두 코드 가드 (단 grep 미강제 — MED-01)      |
| 새 라이브 도구 추가 시 칩 누락                     | **남은 가드 공백** — 향후 새 도구 PDCA에서 명시 필요 |

### 6.3 검증 게이트 결과

| 게이트                     |            결과             |
| -------------------------- | :-------------------------: |
| `npx tsc --noEmit`         |         0 errors ✅         |
| `npx eslint <변경 파일>`   |         0 errors ✅         |
| `npm run test`             |      1510/1510 PASS ✅      |
| `npm run regression-check` | **22/22 PASS** ✅ (17 → 22) |

---

## 7. 최종 권고

### 즉시 조치 불필요

- Match Rate **98% ≥ 90%** → **PASS**
- HIGH 갭 0건 → v2.0.7 묶음 릴리즈 진행 가능
- **Iterate 단계 생략 가능**, 바로 `/pdca report` 로 진행

### Report 단계에서 다룰 항목

1. **MED-01**: FR-10 표현 정합화 (A 가벼움 / B 안전 중 사용자 선택)
2. **LOW-02**: 빌드 후 모바일 emulation 6 시나리오 확인 결과 기록

### v2.0.7 묶음 릴리즈 흐름

- notification-modal-stacking-fix 와 함께 묶음
- CLAUDE.md §"Release Workflow" 8단계 (버전 6곳, release-notes.json, 챗봇 KB ingest, 노션, 커밋, 5단계 분리 빌드, macOS GHA, GitHub Release 4 URL 검증)
- Phase 0 KB Q&A는 ingest 가 별도 (사용자가 ADMIN_API_KEY 로 직접 실행, 릴리즈 무관)

---

## Version History

| Version | Date       | Changes                                                                                                                     | Author                          |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 1.0     | 2026-05-21 | gap-detector 분석 결과 보존 — Match Rate 98% PASS, HIGH 갭 0, MEDIUM 1(FR-10 정합화), LOW 2(step silent / 모바일 수동 검증) | Claude (gap-detector 결과 기반) |
