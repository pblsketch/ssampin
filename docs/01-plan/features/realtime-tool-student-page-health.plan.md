---
template: plan
version: 1.1
feature: realtime-tool-student-page-health
date: 2026-05-21
author: pblsketch
project: ssampin
version_target: v2.0.7 묶음 (notification-modal-stacking-fix와 동반 — 사용자 확정 2026-05-21)
---

# Plan — 실시간 도구 학생 페이지 연결 상태 가시화 + KB 진단 보강

> **요약**: 사용자 신고 "주관식 설문·워드클라우드에서 학생이 응답해도 응답이 안 보이고 접속 학생 0명으로 표시"의 진단 결과, 가장 유력한 원인은 (a) v2.0.4 이하 버전의 학생 페이지 누적 상태 노출 버그(이미 v2.0.5에서 fix 됐으나 KB 가이드 부재) 또는 (b) 학교망의 `*.trycloudflare.com` WSS 차단(학생이 자각 못 함)이다. 두 가지를 동시에 해소하기 위해 **P0 KB Q&A 보강** + **P1 학생 페이지 WS 연결 상태 헬스 인디케이터** + **P2 회귀 메타테스트 가드** 3단 작업.
>
> **사용자 영향 한 문장**: 학생이 접속한 휴대폰 화면에 "연결됨/연결 끊김" 상태가 항상 보여서 "보냈는데 안 갔다"는 침묵형 실패가 사라지고, 챗봇이 같은 신고에 자력으로 정확한 진단을 안내할 수 있게 된다.
>
> **Project**: ssampin (쌤핀)
> **Status**: v1.0 — 사용자 4개 Open Question 확정 (2026-05-21)
> **우선순위**: 🟡 P1 (전체) / 🔴 P0 (Phase 0 KB 보강만 즉시)
> **트리거**: 사용자 신고 (2026-05-21, 캡처 포함)
> **선행 진단**: 이 세션 §"5단계 회귀 점검" 결과
>
> **사용자 확정 사항 (2026-05-21)**:
>
> 1. KB Q&A 톤: **v2.0.6 기존 톤과 동일** (친근 존댓말 + 단계별 해결책 + 적절한 이모지)
> 2. 학생 페이지 칩: **색상+텍스트 병기** (●연결됨/●연결 끊김) + ARIA live region
> 3. 회귀 grep 항목: **5건** (`[hidden]` 4개 + connection-chip 마크업 1개)
> 4. 릴리즈 묶음: **v2.0.7 묶음 포함** (notification-modal-stacking-fix와 동반)

---

## 1. 사용자 신고 요약

### 1.1 증상

> "주관식 설문, 워드클라우드 브레인스토밍에서 학생이 접속해서 응답을 해도 응답 내용이 보이지 않아요. 접속 중에도 접속 학생 0명이라고 뜨고, 제출 완료 후에도 제출한 내용이 보이지 않아요. 교내 무선 사용중이고, 접속할 때 화면에 뜨는 메시지는 없어요."

사용자 스크린샷: 워드클라우드 라이브 패널, `🌐 인터넷 모드 — Wi-Fi 불필요` 라벨, 터널 URL `championship-lower-thrown-joy.trycloudflare.com` + 짧은 주소 `ssampin.com/s/znrcTu` 정상 표시. 접속 학생 0명. 응답 0건.

### 1.2 진단 결과 (이 세션 §5단계 회귀 점검)

5단계 데이터 흐름(터널 발급 → 단축 URL → 학생 HTML 로드 → WS 연결 → 응답 IPC) 중 **③④에 회귀/사각지대 존재**:

- ③ [`liveWordCloudHTML.ts:22`](../../../electron/ipc/liveWordCloudHTML.ts#L22) `[hidden] { display: none !important; }` 가드는 **v2.0.5에서 도입**. v2.0.4 이하는 다섯 상태(연결중·입력·제출완료·종료·끊김)가 한 화면에 누적 노출 — 학생이 입력 UI를 보고 입력했지만 실제 WS 미연결, "제출 완료" 메시지도 동시에 보여서 자각 못 함.
- ④ WS 연결 실패 시 [`liveWordCloudHTML.ts:320-326`](../../../electron/ipc/liveWordCloudHTML.ts#L320-L326) `ws.onclose` 가 `show('disconnected')` 호출 — 다만 학생이 화면 변화에 둔감하거나 학교망이 WSS upgrade를 차단하는 환경에서 **"보냈는데 안 갔다"는 침묵형 실패**가 발생.

### 1.3 KB 갭

`scripts/ingest-chatbot-qa.mjs` 전수 grep 결과 "**학생이 접속해서 답을 보내도 교사 화면이 0명이고 응답 없음 + 학교 Wi-Fi**" 조합을 직접 다루는 Q&A 없음. 챗봇이 [1252](../../../scripts/ingest-chatbot-qa.mjs#L1252) (실시간 답변 확인 토글)·[1268](../../../scripts/ingest-chatbot-qa.mjs#L1268) (v2.0.5 학생 페이지 hotfix) 등 인접 Q&A를 끌어와 **오답·부분정답**을 내놓는 중.

---

## 2. 근본 원인 분석

### 2.1 직접 원인 — 학생 자각 없는 침묵형 실패

[`liveWordCloudHTML.ts:263-331`](../../../electron/ipc/liveWordCloudHTML.ts#L263-L331) 의 학생 페이지 JS 흐름:

```js
function submitWord() {
  // ...
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'submit_word', ... }));
  }
  // ❌ else 가 없음 — WS 미연결 시 submit 은 silent no-op
}
```

WS 가 연결 안 됐을 때:

- v2.0.4 이하: 모든 div 동시 노출 — 학생은 입력 UI와 "✓ 제출 완료!" 를 동시에 봐서 잘 제출됐다고 인지
- v2.0.5+: `disconnected` 단독 표시되지만, 학생이 그 메시지를 못 보거나 무시할 가능성 (배경색·아이콘 차이 약함)

같은 패턴이 [`liveSurveyHTML.ts`](../../../electron/ipc/liveSurveyHTML.ts), [`liveVoteHTML.ts`](../../../electron/ipc/liveVoteHTML.ts), [`liveMultiSurveyHTML.ts`](../../../electron/ipc/liveMultiSurveyHTML.ts) 4개 학생 페이지에 모두 잠재.

### 2.2 구조적 부채 — 학생 입력 UX가 "연결 상태" 정보를 안 보여줌

| 항목                     | 현재                                        | 결과                                   |
| ------------------------ | ------------------------------------------- | -------------------------------------- |
| WS 연결 상태 표시        | 없음 (실패 시에만 `disconnected` 단독 화면) | 학생이 "지금 연결돼 있는지" 알 수 없음 |
| 보내기 버튼 disable 조건 | `remaining <= 0` 만 체크                    | WS 미연결이어도 클릭 가능, 침묵 실패   |
| 제출 ack 시각 피드백     | `word_accepted` 받으면 input 비우기만       | 학교망에서 ack 지연 시 사용자 혼란     |
| 학교망 진단 가이드       | 없음                                        | 사용자가 "왜 안 되지" 추측             |

### 2.3 진단 흐름의 KB 갭

| 사용자 증상                                 | 현재 챗봇 답변                   | 정확도                                          |
| ------------------------------------------- | -------------------------------- | ----------------------------------------------- |
| "학생이 응답해도 응답 내용이 보이지 않아요" | "[실시간 답변 확인] 토글 켜세요" | ❌ 무관 (토글은 v2.0.5+ 객관식 막대그래프 정책) |
| "접속 중에도 0명"                           | "QR/URL이 같은지 확인하세요"     | ⚠️ 부분 (사용자는 이미 같은 QR 보임)            |
| "교내 무선 사용중"                          | "학교 컴퓨터 보안 프로그램"      | ⚠️ Google 연결 답변 끌어옴 (무관)               |
| 정답 (이 세션 진단)                         | (없음)                           | —                                               |

---

## 3. 솔루션 비교

### 옵션 A — P0 KB Q&A 추가만

KB에 "주관식 설문/워드클라우드 0명·응답 없음 + 학교 Wi-Fi" Q&A 1건 추가.

- ✅ 30분, 즉시 배포 가능 (KB ingest 만)
- ✅ 다음 피드백 사용자가 챗봇으로 자력 진단
- ❌ 학생 침묵 실패는 그대로 — UX 개선 없음
- ❌ 같은 케이스 재발 가능

### 옵션 B — P0 + P1 학생 페이지 WS 헬스 인디케이터

4개 live\*HTML 학생 페이지에 우상단 연결 상태 칩 + 보내기 버튼 disable 조건 강화.

- ✅ 학생이 "안 보내지고 있다" 즉시 자각
- ✅ 학교망 차단·인터넷 끊김·교사 PC 종료 모두 같은 신호로 노출
- ✅ 침묵형 실패 → 명시적 실패로 전환
- ⚠️ 4개 HTML 파일 모두 수정 필요 (각 ~30줄)

### 옵션 C — P0 + P1 + P2 회귀 메타테스트 — **선택**

옵션 B + `regression-grep-check.mjs` 에 4개 학생 페이지의 헬스 인디케이터 패턴 강제.

- ✅ 향후 학생 페이지 리팩토링 시 헬스 인디케이터 제거 차단
- ✅ 새 라이브 도구 추가 시 누락 시 빌드 단계에서 감지
- ✅ `[hidden] { display: none !important; }` 가드도 함께 강제 (v2.0.4 회귀 차단)
- ⚠️ regression-grep-check 항목 +5~7건 (현재 17건 → 약 23건)

### 결정 — **옵션 C 채택**

이유:

1. 사용자가 "C로 가자" 명시
2. 같은 부채가 4개 학생 페이지에 잠재 — 한 번에 정리
3. 향후 새 라이브 도구(`liveDiscussion.ts` 등) 추가 시 회귀 차단 자동화
4. P0 머지 직후 KB ingest 만 별도로 실행하면 사용자 회신은 KB만으로도 가능 (P1 빌드 대기 불필요)
5. v2.0.7 묶음에 [notification-modal-stacking-fix](./notification-modal-stacking-fix.plan.md)와 함께 통합

---

## 4. Scope

### 4.1 In Scope

**모든 Phase는 v2.0.7 묶음 릴리즈에 통합.** 머지 순서: Phase 0 (KB만) → Phase 1 (학생 페이지) → Phase 2 (메타테스트).

**Phase 0 — KB Q&A 추가 + ingest (단일 세션, ~30분)**

- [`scripts/ingest-chatbot-qa.mjs`](../../../scripts/ingest-chatbot-qa.mjs) 신규 Q&A 3건 추가:
  - Q1: "워드클라우드/주관식 설문에서 접속 학생 0명·응답 미수신" — 5단계 진단 (앱 버전 → 학교망 LTE 테스트 → 방화벽)
  - Q2: "학생 화면에 '연결 끊김' 또는 '연결 안 됨' 표시가 떠요" — 원인별 대응
  - Q3: "학교 Wi-Fi 에서만 안 되고 휴대폰 데이터는 잘 돼요" — `*.trycloudflare.com` WSS 차단 안내 + 관리자 화이트리스트 요청 템플릿
- Q&A ingest (사용자가 `ADMIN_API_KEY` 사용해 직접 실행)

**Phase 1 — 학생 페이지 WS 연결 상태 헬스 인디케이터 (단일 세션, ~2시간)**

대상 파일 4개:

- [`electron/ipc/liveWordCloudHTML.ts`](../../../electron/ipc/liveWordCloudHTML.ts)
- [`electron/ipc/liveSurveyHTML.ts`](../../../electron/ipc/liveSurveyHTML.ts)
- [`electron/ipc/liveVoteHTML.ts`](../../../electron/ipc/liveVoteHTML.ts)
- [`electron/ipc/liveMultiSurveyHTML.ts`](../../../electron/ipc/liveMultiSurveyHTML.ts)

각 파일에 적용:

- **우상단 연결 상태 칩** — 항상 표시. 상태 enum: `connecting(노랑 ●)` / `connected(녹색 ●)` / `disconnected(빨강 ● + "연결 끊김")` / `reconnecting(주황 ● + "재연결 중...")`
- **보내기 버튼 disable 조건 강화** — `remaining <= 0 || wsState !== 'connected'` 으로 확장
- **submit 함수에서 WS 미연결 시 사용자 메시지** — silent no-op 대신 인풋 옆 작은 토스트/배지로 "연결을 확인 중입니다" 표시
- **CSS — 칩이 다른 상태와 독립적으로 항상 보이도록** (`[hidden]` 가드와 별도 z 평면)

**Phase 2 — 회귀 차단 메타테스트 (단일 세션, ~1시간)**

[`scripts/regression-grep-check.mjs`](../../../scripts/regression-grep-check.mjs) 에 신규 존재 검사 항목 추가:

```
REGRESSION #18: liveWordCloudHTML.ts 에 [hidden] { display: none !important; } 가드 존재
REGRESSION #19: liveSurveyHTML.ts 에 [hidden] { display: none !important; } 가드 존재
REGRESSION #20: liveVoteHTML.ts 에 [hidden] { display: none !important; } 가드 존재
REGRESSION #21: liveMultiSurveyHTML.ts 에 [hidden] { display: none !important; } 가드 존재
REGRESSION #22: 4개 학생 페이지에 wsState/connectionChip 패턴 존재 (헬스 인디케이터 가드)
REGRESSION #23: 4개 학생 페이지의 submit 함수가 WS 미연결 시 사용자 피드백 제공 (silent no-op 차단)
```

선택적으로 단위 테스트 (`__tests__/liveStudentPageHealth.test.ts`) — 정적 파싱으로 4개 파일에 칩 컴포넌트 구조 존재 확인.

### 4.2 Out of Scope

- 학생 페이지 시각 디자인 전면 리뉴얼 (Phase 1은 칩 추가만, 기존 외관 보존)
- 교사 PC localhost 서버의 health 엔드포인트 강화 (`/health` 는 이미 존재)
- 학교망 진단을 위한 `cloudflared` 로그 UI 노출 (Out — 별도 PDCA)
- 모바일 PWA(`src/mobile`) — 본 부채와 무관
- 새 라이브 도구 자체 신설

### 4.3 Non-Goals

- WS 재연결 백오프 알고리즘 변경 (현재 1s → 10s 지수 백오프 그대로)
- Supabase `short_links` 만료(4시간) 정책 변경
- cloudflared 바이너리 자체 업그레이드

---

## 5. Requirements

### 5.1 Functional Requirements

| ID    | Requirement                                                                                                                                                                   | Phase | Priority                                                                                                                    |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------- | --- | ------ |
| FR-01 | KB에 "접속 학생 0명·응답 미수신" 진단 Q&A 추가 (5단계 진단 흐름)                                                                                                              | 0     | High                                                                                                                        |
| FR-02 | KB에 "학생 화면 연결 끊김 표시" Q&A 추가                                                                                                                                      | 0     | Medium                                                                                                                      |
| FR-03 | KB에 "학교 Wi-Fi 에서만 안 됨" Q&A 추가 + 관리자 요청 템플릿                                                                                                                  | 0     | Medium                                                                                                                      |
| FR-04 | 4개 학생 페이지(워드클라우드·주관식·객관식·복합)에 우상단 연결 상태 칩 표시                                                                                                   | 1     | High                                                                                                                        |
| FR-05 | 칩이 `connecting/connected/disconnected/reconnecting` 4상태 색상·텍스트로 항상 가시                                                                                           | 1     | High                                                                                                                        |
| FR-06 | 보내기 버튼이 WS 미연결 시 disable + 시각적 dim 처리                                                                                                                          | 1     | High                                                                                                                        |
| FR-07 | submit 함수가 WS 미연결 시 silent no-op 대신 인풋 근처에 안내 메시지                                                                                                          | 1     | Medium                                                                                                                      |
| FR-08 | regression-grep-check 에 4개 학생 페이지의 `[hidden]` 가드 존재 검사 추가                                                                                                     | 2     | High                                                                                                                        |
| FR-09 | regression-grep-check 에 헬스 인디케이터 패턴 존재 검사 추가                                                                                                                  | 2     | High                                                                                                                        |
| FR-10 | ~~regression-grep-check 에 submit 함수 사용자 피드백 패턴 존재 검사 추가~~ → **5건에 흡수됨**: chip JS 의 `data-ws-blocked` dim 보장(FR-06) + 4개 파일 submit 함수의 `if (!ws |       | ws.readyState !== WebSocket.OPEN) return` 코드 안전망(FR-07)으로 silent no-op 차단. 별도 grep 항목 추가 안 함 (v1.1 정합화) | 2   | Medium |

### 5.2 Non-Functional Requirements

| Category      | Criteria                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------- |
| Performance   | 헬스 인디케이터 추가로 인한 학생 페이지 렌더 추가 비용 < 1ms (단순 div + CSS animation)         |
| Accessibility | 칩에 `aria-live="polite"` + `role="status"` — 스크린리더 학생이 상태 변경 인지 가능             |
| Compatibility | 학생 페이지는 IE11 제외 모든 모바일 브라우저 (iOS Safari 14+, Chrome 90+, Samsung Internet 12+) |
| Visual        | 라이트/다크 양 환경 모두 칩 가독성 보장 (현재 학생 페이지 배경은 `#0a0e17` 다크 단일)           |
| Bundle Size   | 학생 페이지 HTML 1KB 미만 증가                                                                  |

---

## 6. Success Criteria

### 6.1 Phase 0 Definition of Done

- [ ] `scripts/ingest-chatbot-qa.mjs` 에 Q&A 3건 추가 (lint 통과)
- [ ] 사용자가 `ADMIN_API_KEY` 로 ingest 실행 (Claude 는 명령 가이드만 제공)
- [ ] 챗봇 KB upsert 확인 (실제 사용자 질문으로 회신 정확도 테스트)

### 6.2 Phase 1 Definition of Done

- [ ] 4개 학생 페이지 HTML 에 우상단 연결 상태 칩 컴포넌트 추가
- [ ] 4개 페이지 모두 4상태(connecting/connected/disconnected/reconnecting) 정상 전환
- [ ] 보내기 버튼이 `wsState !== 'connected'` 일 때 disable
- [ ] 시각 검증 — 실제 모바일 (Android Chrome / iOS Safari) 에서 칩 가독성 확인
- [ ] 검증 게이트 4/4 통과 (tsc 0 / lint 0 / test pass / regression pass)

### 6.3 Phase 2 Definition of Done

- [ ] `regression-grep-check.mjs` 신규 항목 5~7건 추가 (REGRESSION #18~#23 이상)
- [ ] 메타테스트 — 일부러 학생 페이지에서 칩 패턴 삭제 시 regression check FAIL 확인
- [ ] `npm run regression-check` 23/23 이상 PASS

### 6.4 Quality Criteria

- [ ] 변경 파일 수: Phase 0 = 1개, Phase 1 = 4개, Phase 2 = 1개 (총 6개)
- [ ] 학생 페이지 라인수 증가 ≤ 40줄/파일
- [ ] 시각 회귀 0건 — 기존 학생 페이지 외관 동등 (칩만 추가)
- [ ] 기능 회귀 0건 — 정상 환경에서 제출 흐름 영향 없음

---

## 7. Risks and Mitigation

| Risk                                                                       | Impact | Likelihood | Mitigation                                                                                                                       |
| -------------------------------------------------------------------------- | ------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 칩이 작은 화면(아이폰 SE)에서 인풋·키패드와 겹침                           | Medium | Medium     | 우상단 fixed 위치 + 인풋 영역 padding-top 보장. 실제 기기 테스트                                                                 |
| WS 상태 추적 로직 버그로 항상 disconnected 표시 → 정상 환경 회귀           | High   | Low        | Phase 1 시각 시나리오 6종 수동 검증 + reconnect 카운트다운 표시                                                                  |
| 학생 페이지 4개의 칩 구현이 미세하게 달라져 회귀 메타테스트 통과/실패 차이 | Medium | Medium     | 4개 파일에 동일 패턴 강제 — 4번 복붙이 아니라 공용 헬퍼 함수(`emitConnectionChipHTML`/`emitConnectionChipJS`)를 별도 모듈로 추출 |
| KB ingest 가 사용자 환경(`ADMIN_API_KEY` 분실)에서 실패                    | Medium | Low        | reference_admin_api_key.md 절차 + 사용자가 직접 실행 (Claude 는 명령만 제공)                                                     |
| 회귀 grep 패턴이 너무 엄격해 정상 변경도 차단                              | Medium | Medium     | 패턴은 함수명·string literal 수준 — 구조 변경 가능. 한 번에 너무 많이 추가 안 함 (5~7건)                                         |
| 학생 페이지 다크 단일 테마에서 빨강 disconnected 칩이 너무 자극적          | Low    | Low        | 빨강은 한 번 표시 후 reconnecting 으로 자동 전환 (1초). 항상 빨강 고정 X                                                         |
| Phase 1 중 다른 회귀 발견 → Phase 1 scope 확대                             | Medium | Medium     | Phase 1 끝에 명시적 게이트 — 회귀 발견 시 별도 PDCA 분리                                                                         |

---

## 8. Architecture Considerations

### 8.1 Project Level

Enterprise (Clean Architecture 4 layers). 본 작업은 모두 `electron/ipc` 레이어(학생 페이지 HTML 문자열 생성) + `scripts/` (ingest, regression).

### 8.2 Key Architectural Decisions

| Decision            | Selected                                                          | Rationale                                                               |
| ------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 헬스 칩 구현 위치   | 학생 페이지 HTML inline 스크립트                                  | 학생 페이지는 standalone HTML — React 컴포넌트 불가, vanilla JS 만 가능 |
| 4개 페이지 공통화   | 새 모듈 `electron/ipc/_studentPageChrome.ts` (헬퍼 함수만 export) | 4번 복붙 회피, 회귀 메타테스트 단순화                                   |
| 칩 상태 전환 트리거 | `ws.onopen/onclose/onerror` + reconnect timer                     | 기존 reconnect 로직 그대로 활용                                         |
| 시각 디자인         | 단색 점 + 짧은 라벨 (●연결됨 / ●연결 끊김)                        | 학생 페이지 미니멀 톤 유지, frontend-design 협업 생략 가능한 수준       |
| KB Q&A 카테고리     | `troubleshooting` + `tools`                                       | 기존 분류 체계 유지                                                     |

### 8.3 Clean Architecture Approach

- `electron/ipc/_studentPageChrome.ts` (신규) — 학생 페이지 공용 CSS/JS 스니펫 (UI 레이어 외부 — Electron main process이지만 HTML 생성기일 뿐)
- 4개 live\*HTML.ts 가 새 모듈 import 해서 칩 HTML/JS 삽입
- `scripts/ingest-chatbot-qa.mjs` Q&A 데이터만 추가 (스키마 변경 없음)
- `scripts/regression-grep-check.mjs` 신규 항목 push (스키마 변경 없음)

### 8.4 호환 가드

- 학생 페이지 외부 API(QR URL, 짧은 URL, WS 프로토콜) 변경 0건
- 기존 sessionToken 발급·재연결 로직 변경 0건
- v2.0.6 이하 사용자가 v2.0.7로 업데이트 시 페이지만 새로워짐 (서버 측 호환)

---

## 9. Convention Prerequisites

### 9.1 Existing Project Conventions

- [x] [`CLAUDE.md`](../../../CLAUDE.md) — 비개발자 설명 원칙, 검증 게이트 4단계
- [x] 학생 페이지는 standalone HTML (electron/ipc/live\*HTML.ts 의 template literal)
- [x] [scripts/regression-grep-check.mjs](../../../scripts/regression-grep-check.mjs) — 존재/부재 검사 패턴
- [x] [scripts/ingest-chatbot-qa.mjs](../../../scripts/ingest-chatbot-qa.mjs) — Q&A 배열 push 패턴
- [x] [reference_admin_api_key.md](../../../.claude/projects/e--github-ssampin/memory/reference_admin_api_key.md) — ADMIN_API_KEY 로테이션·ingest 절차

### 9.2 Conventions to Verify

- 학생 페이지 칩 디자인이 기존 다크 테마(`#0a0e17` 배경)와 어울리는지
- KB Q&A 톤이 [Q&A 작성 스타일](../../../scripts/ingest-chatbot-qa.mjs) 일관성 (Q: ... A: ..., 친근 존댓말)
- 회귀 grep 패턴이 현재 17건과 같은 형식

---

## 10. Implementation Order

### Phase 0 — KB Q&A 추가 (단일 세션, ~30분)

1. `scripts/ingest-chatbot-qa.mjs` 신규 Q&A 3건 작성 (v2.0.6 묶음 끝에 추가)
2. lint 통과 확인 (`npm run lint -- scripts/`)
3. 사용자에게 ingest 명령 제공 (`SUPABASE_URL=... EMBED_AUTH_TOKEN=... node scripts/ingest-chatbot-qa.mjs`)
4. 사용자가 실행 → 챗봇 KB upsert 확인

### Phase 1 — 학생 페이지 WS 헬스 인디케이터 (단일 세션, ~2시간)

1. `electron/ipc/_studentPageChrome.ts` 신규 — `getConnectionChipCSS()` + `getConnectionChipHTML()` + `getConnectionChipJS(wsVarName)` 3 함수 export
2. `liveWordCloudHTML.ts` 수정 — 칩 CSS/HTML/JS 삽입, 보내기 disable 조건 강화
3. `liveSurveyHTML.ts` 수정 (동일 패턴)
4. `liveVoteHTML.ts` 수정 (객관식이라 보내기 = 선택지 클릭, disable 조건 동일)
5. `liveMultiSurveyHTML.ts` 수정 (가장 큰 파일, 단계별 진행 — 페이지 전체 칩만 1회 마운트)
6. 시각 검증 — `npm run electron:dev` 로 4개 도구 각각 학생 페이지 모바일 브라우저 접속 (DevTools mobile emulation)
7. 검증 게이트 4/4

### Phase 2 — 회귀 메타테스트 (단일 세션, ~1시간)

1. `regression-grep-check.mjs` REGRESSION #18~#23 추가
2. 의도적 삭제 실험 — `liveWordCloudHTML.ts` 에서 `[hidden]` CSS 한 줄 지우고 `npm run regression-check` FAIL 확인
3. 복원 → PASS 확인
4. 검증 게이트 4/4

### 단계 간 게이트

각 Phase 끝에 `npx tsc --noEmit` 즉시 확인. Phase 1 끝에 모바일 emulation 4개 도구 수동 검증 필수.

---

## 11. Verification Plan

### 11.1 Automated

```bash
npx tsc --noEmit              # TypeScript 에러 0
npm run lint                  # ESLint 0 error
npm run test                  # Vitest 통과
npm run regression-check      # 23/23 이상 통과 (현재 17 → 신규 5~7건)
```

### 11.2 Manual — Phase 1 학생 페이지 4종

| #   | 시나리오                                     | 기대                                                                     |
| --- | -------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | 정상 환경 — 학생 페이지 진입                 | 칩이 `connecting(노랑)` → 1초 내 `connected(녹색)` 전환                  |
| 2   | 정상 환경 — 단어/답변 제출                   | 칩 `connected` 유지, 제출 정상                                           |
| 3   | 교사 PC `npm run electron:dev` 중지          | 칩 `disconnected(빨강)` → `reconnecting(주황)` 무한 반복, 보내기 disable |
| 4   | 교사 PC 재시작 후 학생 페이지 자동 reconnect | 칩 `reconnecting` → `connected` 복귀, 보내기 enable                      |
| 5   | 학생이 WS 미연결 상태에서 보내기 클릭        | 버튼 disable 상태라 클릭 자체 안 됨 (시각 dim)                           |
| 6   | 칩이 작은 화면(360px)에서 인풋·키패드 가림 X | 우상단 fixed, 인풋 padding-top 보장                                      |

### 11.3 Manual — Phase 2 회귀 가드

| #   | 시나리오                                                | 기대                                 |
| --- | ------------------------------------------------------- | ------------------------------------ |
| 1   | `[hidden]` CSS 한 줄 삭제 후 `npm run regression-check` | REGRESSION #18~#21 중 해당 항목 FAIL |
| 2   | 헬스 칩 HTML 마크업 삭제                                | REGRESSION #22 FAIL                  |
| 3   | 모든 패턴 복원                                          | 23/23 PASS                           |

### 11.4 KB 검증 (Phase 0)

- 사용자가 ingest 실행 후 챗봇에 동일 신고 질문 → "v2.0.5+ 업데이트 확인 → 학교망 WSS 차단 LTE 테스트 → 학교 IT 화이트리스트 요청" 흐름으로 답변

---

## 12. 일정

현재 릴리즈: v2.0.6 (출시 완료). 다음 릴리즈: **v2.0.7 묶음** (notification-modal-stacking-fix와 동반).

| 단계                            | 예상 소요 | 머지 시점      | 비고                                                                 |
| ------------------------------- | --------- | -------------- | -------------------------------------------------------------------- |
| 2026-05-21 — Plan v0.1 작성     | —         | —              | (이 문서)                                                            |
| Plan v1.0 확정 (사용자 OQ 확정) | 10분      | —              | OQ 없으면 바로 v1.0                                                  |
| Phase 0 Do (KB Q&A 작성)        | 30분      | main 즉시 머지 | Claude 단독                                                          |
| Phase 0 사용자 ingest           | 5분       | —              | 사용자 행동 (Claude 명령만 제공)                                     |
| Phase 1 Design + Do             | 2시간     | main 머지      | 4개 HTML + 공용 모듈                                                 |
| Phase 2 Do                      | 1시간     | main 머지      | regression-grep-check                                                |
| 통합 gap-detector               | 30분      | —              | Match Rate ≥ 90%                                                     |
| Report + PROGRESS 갱신          | 30분      | —              | v2.0.7 후보 추가                                                     |
| **v2.0.7 묶음 릴리즈**          | —         | —              | notification-modal-stacking-fix 와 동반 (CLAUDE.md 8단계 워크플로우) |

KB는 Phase 0 머지 직후 사용자가 ingest 하면 즉시 챗봇에 반영 (v2.0.7 릴리즈 대기 불필요).

---

## 13. Resolved Decisions (사용자 확정 — 2026-05-21)

| #   | 질문                | 사용자 결정                                                                    | Plan 반영 위치                   |
| --- | ------------------- | ------------------------------------------------------------------------------ | -------------------------------- |
| 1   | KB Q&A 3건의 톤     | **v2.0.6 기존 톤과 동일** (친근 존댓말 + 단계별 해결책 + 이모지)               | §4.1 Phase 0, §10 Phase 0        |
| 2   | 학생 페이지 칩 시각 | **색상+텍스트 병기** (●연결됨/●연결 끊김) + `role="status" aria-live="polite"` | §4.1 Phase 1, §5.2 Accessibility |
| 3   | 회귀 grep 항목      | **5건** (`[hidden]` 4개 + connection-chip 마크업 1개)                          | §4.1 Phase 2, §10 Phase 2        |
| 4   | 릴리즈 묶음         | **v2.0.7 묶음 포함** — notification-modal-stacking-fix 와 동반                 | §3 결정, §12                     |

내부 결정(사용자 OQ 불필요):

- Phase 1 공용 모듈 위치: `electron/ipc/_studentPageChrome.ts` 단일 파일 (4개 import 만 됨, 폴더 분리 불필요)

---

## 14. Next Steps

1. ~~사용자 4개 Open Question 답변~~ ✅ 완료 (2026-05-21)
2. ~~Plan v1.0 확정~~ ✅ 완료 (2026-05-21)
3. `/pdca design realtime-tool-student-page-health` — Phase 1 학생 페이지 칩 디자인 (HTML/CSS/JS 스니펫 + 4개 파일 diff 미리보기) + Phase 2 grep 패턴 정의
4. `/pdca do realtime-tool-student-page-health` Phase 0 — KB Q&A 추가 → 사용자 ingest 안내
5. Phase 1 Do — 4개 학생 페이지 수정 + 시각 검증
6. Phase 2 Do — regression-grep-check 항목 추가
7. 통합 `/pdca analyze realtime-tool-student-page-health` — gap-detector
8. `/pdca report realtime-tool-student-page-health` + PROGRESS.md 갱신
9. v2.0.7 묶음 릴리즈 (notification-modal-stacking-fix 와 함께, CLAUDE.md §"Release Workflow" 8단계)

---

## Version History

| Version | Date       | Changes                                                                                                                                                               | Author                 |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 0.1     | 2026-05-21 | 초안 — 사용자 신고 "워드클라우드·주관식 설문 0명·응답 미수신" 진단 결과를 기반으로 C 옵션(P0 KB + P1 학생 페이지 헬스 인디케이터 + P2 회귀 메타테스트) 통합 Plan 작성 | Claude (사용자 요청)   |
| 1.0     | 2026-05-21 | 사용자 4개 OQ 모두 권고안으로 확정. 동일 톤/색+텍스트/5건 grep/v2.0.7 묶음. Resolved Decisions 섹션 추가                                                              | Claude                 |
| 1.1     | 2026-05-21 | gap-detector 분석 결과(Match Rate 98% PASS) 반영 MED-01 정합화 — FR-10 을 "5건에 흡수됨"으로 표기. §4.1·§10·§13 "5건" 확정과 일치. 기능적 변경 없음                   | Claude (사용자 결정 A) |
