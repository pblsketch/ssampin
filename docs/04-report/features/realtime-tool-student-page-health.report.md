---
template: report
version: 1.0
feature: realtime-tool-student-page-health
date: 2026-05-21
author: pblsketch (with Claude)
project: ssampin
version_target: v2.0.7 묶음 (notification-modal-stacking-fix와 동반)
match_rate: 98%
status: PASS — Iterate 불필요
---

# realtime-tool-student-page-health — Completion Report

> **사용자 신고 한 문장**: "주관식 설문, 워드클라우드에서 학생이 접속해서 응답을 해도 응답 내용이 보이지 않고 접속 학생 0명으로 떠요. 교내 무선 사용 중이고, 접속할 때 화면에 뜨는 메시지는 없어요."
>
> **결과**: 5단계 데이터 흐름 진단으로 (a) v2.0.4 이하의 학생 페이지 누적 상태 노출 버그 + (b) WS 미연결 침묵형 실패 2가지 부채를 식별. KB Q&A 3건 추가로 챗봇 자력 진단 보강 + 4개 학생 페이지에 우상단 연결 상태 칩 도입으로 학생 자각 보장 + 회귀 5건 추가로 구조적 재발 차단. 6 파일 변경, 1510 테스트 + 22 회귀(17→22) 통과.

---

## 1. 신고-해결 매핑

### 1.1 사용자 신고 증상

워드클라우드/주관식 설문 라이브에서 학생이 휴대폰으로 QR 접속하여 답을 전송했음에도 **교사 화면이 [접속 학생 0명] + 응답 0건**으로 표시. 학생 휴대폰엔 에러 메시지가 안 떠서 학생도 자각 못 함. 교내 Wi-Fi 환경.

### 1.2 근본 원인 (5단계 진단)

5단계 데이터 흐름(터널 발급 → 단축 URL → 학생 HTML 로드 → WS 연결 → 응답 IPC) 중 **③④에 회귀/사각지대** 발견:

- **③ 학생 페이지 상태 누적 노출 (v2.0.4 이하)**: [`liveWordCloudHTML.ts:22`](../../../electron/ipc/liveWordCloudHTML.ts#L22) `[hidden] { display: none !important; }` 가드는 v2.0.5에서 도입. 이하 버전은 다섯 상태(connecting/ready/limit/closed/disconnected)가 한 화면에 누적 노출 → 학생이 입력 UI와 "제출 완료" 메시지를 **동시에** 보고 잘 보냈다고 인지, 실제 WS는 미연결.
- **④ WS 미연결 자각 부재**: WS 실패 시 [`liveWordCloudHTML.ts:341-350`](../../../electron/ipc/liveWordCloudHTML.ts#L341) `submitWord()` 가 `ws.readyState !== OPEN` 일 때 **silent no-op**. 학생은 보내기 버튼을 눌렀는데 아무 일도 안 일어남 → 학교망이 trycloudflare.com WSS 차단하는 환경에서 침묵형 실패.

추가로 **KB 갭** — `scripts/ingest-chatbot-qa.mjs` 전수 검색 결과 이 신고 케이스를 직접 다루는 Q&A 없음. 챗봇이 인접 답변(v2.0.5 hotfix·학교 컴퓨터 보안 프로그램)을 끌어와 오답·부분정답 제공.

### 1.3 해결 매핑

| 신고/부채 측면               | 해결 Phase                                            | 결과                                                  |
| ---------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| 챗봇 자력 진단 불가          | Phase 0 — KB Q&A 3건 추가                             | v2.0.7 troubleshooting 카테고리 신규                  |
| 학생 WS 미연결 자각 부재     | Phase 1 — 4개 학생 페이지 우상단 연결 상태 칩 (4상태) | 색+텍스트 병기, ARIA, pointer-events:none             |
| submit 침묵형 실패           | Phase 1 — submit silent no-op 차단 + 사용자 안내      | 워드클라우드/주관식 placeholder, 객관식/복합 chip dim |
| v2.0.4 누적 노출 회귀 가능성 | Phase 2 — REGRESSION #18~#21 (`[hidden]` 가드 4건)    | 누구도 가드 못 지움                                   |
| 헬스 칩 회귀 가능성          | Phase 2 — REGRESSION #22 (sp-conn-chip + ARIA)        | 칩 구조 영구 강제                                     |

---

## 2. 작업 산출물

### 2.1 신규 파일 (1)

- [electron/ipc/\_studentPageChrome.ts](../../../electron/ipc/_studentPageChrome.ts) — 학생 페이지 공용 chrome (145줄)
  - `getConnectionChipCSS()` — 칩 스타일, 4상태 색상, 펄스 애니메이션, safe-area-inset 가드, dim 스타일
  - `getConnectionChipHTML()` — `role="status" aria-live="polite" aria-label="서버 연결 상태"` 마크업
  - `getConnectionChipJS({submitButtonSelectors})` — `window.spConnSetState` 전역 노출, `data-state` + `data-ws-blocked` 토글
  - `getConnectionChipBundle(...)` — 참고용 일괄 헬퍼

### 2.2 수정 파일 (5 + KB 1)

| 파일                                                                                | 변경                                                                                                                                              |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| [electron/ipc/liveWordCloudHTML.ts](../../../electron/ipc/liveWordCloudHTML.ts)     | import + 칩 CSS/HTML/JS + 4 WS 훅 + submit placeholder 안내 (+25줄)                                                                               |
| [electron/ipc/liveSurveyHTML.ts](../../../electron/ipc/liveSurveyHTML.ts)           | 동일 패턴, 셀렉터 `#submit-btn` (+30줄)                                                                                                           |
| [electron/ipc/liveVoteHTML.ts](../../../electron/ipc/liveVoteHTML.ts)               | 동일 패턴, 셀렉터 `.option-btn` (+25줄)                                                                                                           |
| [electron/ipc/liveMultiSurveyHTML.ts](../../../electron/ipc/liveMultiSurveyHTML.ts) | 칩 1회 마운트, scroll+step 두 connect() 모두 chip 호출, 셀렉터 `['#submit-btn', '#sm-answer-submit']` (+30줄)                                     |
| [scripts/regression-grep-check.mjs](../../../scripts/regression-grep-check.mjs)     | REGRESSION #18~#22 추가 (+35줄)                                                                                                                   |
| [scripts/ingest-chatbot-qa.mjs](../../../scripts/ingest-chatbot-qa.mjs)             | v2.0.7 Q&A 3건 (troubleshooting): "접속 학생 0명·응답 미수신 진단" / "학생 화면 연결 끊김 표시" / "학교 Wi-Fi 차단 — IT 화이트리스트 요청 템플릿" |

### 2.3 문서 (3)

- [docs/01-plan/features/realtime-tool-student-page-health.plan.md](../../01-plan/features/realtime-tool-student-page-health.plan.md) v1.1
- [docs/02-design/features/realtime-tool-student-page-health.design.md](../../02-design/features/realtime-tool-student-page-health.design.md) v1.0
- [docs/03-analysis/realtime-tool-student-page-health.analysis.md](../../03-analysis/realtime-tool-student-page-health.analysis.md) v1.0 (Match Rate 98% PASS)
- 본 Report

---

## 3. 핵심 설계 결정

### 3.1 칩 4상태 색상·라벨

| 상태         | 색상                  | 라벨           | 트리거                            |
| ------------ | --------------------- | -------------- | --------------------------------- |
| connecting   | #fbbf24 (노랑)        | "연결 중..."   | `connect()` 진입, 초기 로드       |
| connected    | #34d399 (녹색)        | "연결됨"       | `ws.onopen`                       |
| disconnected | #f87171 (빨강) + 펄스 | "연결 끊김"    | `ws.onclose`, WebSocket 생성 실패 |
| reconnecting | #fb923c (주황) + 펄스 | "재연결 중..." | `scheduleReconnect()` 안          |

색+텍스트 병기로 색약 사용자 보장. `role="status" aria-live="polite"` 로 스크린리더 알림.

### 3.2 submit 안전망 정책

| 도구         | 1차 가드 (시각)       | 2차 가드 (코드)                             |
| ------------ | --------------------- | ------------------------------------------- | --- | ----------------------------------------------------------------- |
| 워드클라우드 | 보내기 dim            | `if (!ws                                    |     | readyState!==OPEN)` + placeholder "연결을 확인 중입니다..." 1.5초 |
| 주관식       | 보내기 dim            | 동일 placeholder 안내                       |
| 객관식       | `.option-btn` dim     | 클릭 자체 차단 (pointer-events:none)        |
| 복합         | scroll/step 둘 다 dim | scroll: silent return / step: chip dim 의존 |

객관식/복합은 학생이 dim 된 버튼을 눌러도 클릭 자체가 안 됨 → placeholder 불필요. Design §1.5 "안전망" 의도와 부합.

### 3.3 회귀 가드 5건

`scripts/regression-grep-check.mjs` REGRESSION #18~#22:

- #18~#21: 4개 학생 페이지의 `[hidden] { display: none !important; }` CSS 가드 — v2.0.5 hotfix 보호
- #22: `_studentPageChrome.ts` 의 `sp-conn-chip` 클래스 + `role="status"` + `aria-live="polite"` 동시 존재 — 칩 구조 보호

---

## 4. 검증 결과

### 4.1 자동 검증 게이트 4/4

| 게이트                     |        결과        | 비고                                                                                                                                        |
| -------------------------- | :----------------: | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit`         |      0 errors      | TypeScript strict                                                                                                                           |
| `npx eslint <변경 파일>`   |      0 errors      | `_studentPageChrome` + 4개 학생 페이지 모두 깨끗. `regression-grep-check.mjs` 의 16 `console`/`process` no-undef는 본 작업 무관 (기존 부채) |
| `npm run test`             | **1510/1510 PASS** | Vitest 전체                                                                                                                                 |
| `npm run regression-check` |   **22/22 PASS**   | 17→22, 신규 #18~#22 모두 통과                                                                                                               |

### 4.2 gap-detector 분석 (Match Rate 98% PASS)

- FR 10/10 통과 (100%)
- Design §1~3 일치율 100% (API·CSS·HTML·JS·diff·회귀 패턴 모두 1:1)
- HIGH 갭 0건
- MEDIUM 1건 — MED-01 (FR-10 표현 정합화) → Plan v1.1 갱신으로 해소
- LOW 2건 — LOW-01 step mode silent fallback (의도된 안전망, 수정 불필요), LOW-02 모바일 수동 검증 (v2.0.7 출시 전 수행 예정)

### 4.3 사용자 수동 검증 (예정)

v2.0.7 출시 전 사용자가 `npm run electron:dev` 로 다음 6 시나리오 확인 예정 (Plan §11.2):

1. 정상 환경 진입 → 칩 connecting → connected 1초 내 전환
2. 단어/답변 제출 정상
3. 교사 PC Ctrl+C → 칩 disconnected (빨강 펄스)
4. 교사 PC 재시작 → 자동 재연결 → connected
5. WS 미연결 보내기 클릭 → pointer-events 차단
6. 360px 화면(iPhone SE) 칩 위치 + 인풋 충돌 없음

---

## 5. 사용자 영향

### 5.1 즉시 영향 (Phase 0 KB Q&A — ingest 후)

사용자가 `node scripts/ingest-chatbot-qa.mjs` 실행 시점부터:

- 동일 신고에 챗봇이 4단계 진단 흐름(앱 버전 → LTE 테스트 → 방화벽 → 재시작) 자력 안내
- 학교 IT 담당자에게 보낼 화이트리스트 요청 템플릿 제공 (그대로 복사 가능)
- 학생 화면 표시등 색상 안내(🟢/🟡/🟠/🔴)

### 5.2 v2.0.7 출시 후 영향 (Phase 1 학생 페이지 칩)

- 학생이 휴대폰 우상단에서 연결 상태를 **항상** 확인 가능
- WS 미연결 시 보내기 버튼이 dim 처리 → "보냈는데 안 갔다" 침묵 실패 사라짐
- 학교망 차단/일시 끊김/PC 종료 모두 같은 신호로 노출
- 같은 신고 재발 시 학생이 학교 IT 담당에게 직접 신호 전달 가능

### 5.3 v2.0.7 출시 후 영향 (Phase 2 회귀 가드)

- 향후 누구도 학생 페이지의 `[hidden]` 가드 제거 불가 → v2.0.4 회귀 영구 차단
- 칩 구조 변경 시 빌드 실패 → 학생 자각 보장 영구 유지
- 새 라이브 도구 추가 시(예: liveDiscussion) 동일 가드 추가 필요 — 다음 PDCA 작업으로 명시

---

## 6. 잔여 작업 (v2.0.7 묶음 릴리즈 흐름)

### 6.1 즉시 (사용자 행동)

1. **KB ingest 실행** — `node scripts/ingest-chatbot-qa.mjs` (멱등). v2.0.7 신규 3건 upsert. 챗봇에 "주관식 설문 학생이 응답해도 0명으로 떠요" 질문으로 검증.
2. **모바일 수동 검증** (v2.0.7 출시 전) — `npm run electron:dev` 로 4개 도구 학생 페이지 mobile emulation 6 시나리오 확인.

### 6.2 v2.0.7 묶음 릴리즈 (CLAUDE.md §"Release Workflow" 8단계)

1. 버전 6곳 갱신 (package.json / landing config / layout.tsx / Sidebar / Mobile Settings / Mobile More)
2. `public/release-notes.json` v2.0.7 항목 추가 (notification-modal-stacking-fix + 본 작업)
3. 챗봇 KB ingest (위 6.1 이미 완료 상태로 들어옴)
4. 노션 사용자 가이드 갱신
5. 커밋 & 푸시
6. Windows 빌드 (5단계 분리 명령 필수 — EXIT 127 회피)
7. macOS GHA 빌드 (`gh workflow run "Build macOS" --ref main`)
8. GitHub Release 생성 + 4 URL 302 검증

### 6.3 후속 PDCA 후보

- 새 라이브 도구 추가 시 학생 페이지 가드 추가 (gap-detector 분석 §6.2 "남은 가드 공백" 인용)

---

## 7. 학습·결정 보존

### 7.1 기술 학습

- **공용 모듈 패턴**: 4개 학생 페이지의 공통 부속을 `_studentPageChrome.ts` 한 곳에 분리. 회귀 grep 도 단일 헬퍼 구조만 보호하면 됨 → REGRESSION #22 1건으로 4개 파일 칩 구조 보장.
- **standalone HTML 안에 헬퍼 주입**: live\*HTML.ts 가 template literal로 HTML 문자열 생성 → import한 헬퍼 함수의 string 반환값을 `${...}` 삽입. Tailwind/React 무관 환경에서 vanilla CSS/JS 재사용.
- **회귀 grep 정규식**: REGRESSION #22 `sp-conn-chip[\s\S]{0,1500}?role="status"[\s\S]{0,400}?aria-live="polite"` — 라인 거리 제한으로 무관한 코드와 우연 매칭 방지.

### 7.2 v2.0.4 회귀의 교훈

`[hidden]` 속성을 `display:flex` CSS가 덮는 우선순위 충돌은 v2.0.5에서 fix 됐지만, 그 fix가 회귀 가드 없이 코드 라인으로만 존재했음. 누가 CSS 한 줄 지우면 같은 회귀 즉시 재발. **fix 즉시 regression-grep-check 가드 동반 추가가 표준 패턴**이어야 함.

### 7.3 KB 갱신의 회수 효과

본 PDCA의 Phase 0 KB Q&A 3건 추가는 코드 변경 없이도 같은 신고의 자력 진단을 가능하게 함. 빌드/릴리즈 사이클과 독립적이라 v2.0.7 출시 전부터 효과 발생. **KB와 코드 fix를 같은 PDCA에 묶으면 진단 회수 + 구조 차단 동시 달성**.

---

## 8. 메타데이터

| 항목         | 값                                                                     |
| ------------ | ---------------------------------------------------------------------- |
| Match Rate   | 98%                                                                    |
| 변경 파일 수 | 6 (신규 1 + 수정 5)                                                    |
| 라인 변화    | +290 (chrome 145 / 4 학생 페이지 +25~30 / regression +35 / KB +)       |
| 테스트 수    | 1510 (전체 PASS)                                                       |
| 회귀 가드    | 22 (이전 17 + 신규 5)                                                  |
| 검증 게이트  | 4/4 PASS                                                               |
| Phase 수     | 3 (Phase 0 KB / Phase 1 학생 페이지 / Phase 2 회귀)                    |
| 사용자 OQ    | 4건 모두 권고안으로 확정 (2026-05-21)                                  |
| MED 갭 처리  | MED-01 정합화 (Plan v1.1)                                              |
| LOW 갭 처리  | LOW-01 의도된 안전망 (수정 X) / LOW-02 v2.0.7 출시 전 사용자 검증 예정 |

---

## Version History

| Version | Date       | Changes                                                                                | Author               |
| ------- | ---------- | -------------------------------------------------------------------------------------- | -------------------- |
| 1.0     | 2026-05-21 | PDCA 완료 보고서 — Phase 0+1+2 통합. Match Rate 98% PASS. v2.0.7 묶음 릴리즈 후보 등록 | Claude (사용자 요청) |
