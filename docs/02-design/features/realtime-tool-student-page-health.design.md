---
template: design
version: 1.0
feature: realtime-tool-student-page-health
date: 2026-05-21
author: pblsketch
project: ssampin
plan_ref: ../../01-plan/features/realtime-tool-student-page-health.plan.md
---

# Design — 실시간 도구 학생 페이지 연결 상태 가시화 + 회귀 가드

> Plan v1.0 기반 Phase 1+2 상세 설계. 4개 학생 페이지(워드클라우드·주관식·객관식·복합)에 우상단 WS 연결 상태 칩을 공용 헬퍼로 주입하고, regression-grep-check 에 5건 가드를 추가한다.

---

## 1. 공용 모듈 — `electron/ipc/_studentPageChrome.ts`

### 1.1 API 시그니처

```ts
/**
 * 학생 페이지(live*HTML.ts) 공용 chrome.
 *
 * 4개 학생 페이지(워드클라우드·주관식·객관식·복합)가 공유하는
 * UI 부속(연결 상태 칩 등)을 한 곳에서 관리한다.
 *
 * 새 라이브 도구를 추가할 때도 이 모듈을 통해야 회귀 메타테스트가 통과한다.
 */

/** 연결 상태 칩 CSS — `<style>` 안에 inline */
export function getConnectionChipCSS(): string;

/** 연결 상태 칩 HTML — `<body>` 안 최상단에 inline. data-state 속성으로 4상태 전환 */
export function getConnectionChipHTML(): string;

/**
 * 연결 상태 칩 JS — `<script>` 안에서 호출.
 * - WS 변수명(`ws`)을 기준으로 onopen/onclose/onerror 훅에 setState 부착
 * - 보내기 버튼 셀렉터를 받아 wsState !== 'connected' 시 disable
 *
 * @param config.submitButtonSelectors — disable 대상 버튼 셀렉터 배열 (도구별로 다름)
 */
export function getConnectionChipJS(config: { submitButtonSelectors: string[] }): string;
```

### 1.2 CSS 정의

```css
/* 연결 상태 칩 — 우상단 fixed */
.sp-conn-chip {
  position: fixed;
  top: 8px;
  right: 8px;
  z-index: 1000;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  background: rgba(19, 26, 43, 0.85);
  border: 1px solid #2a3548;
  color: #e2e8f0;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  user-select: none;
  pointer-events: none;
  transition:
    border-color 0.2s,
    color 0.2s;
}

/* 상태 도트 (●) */
.sp-conn-chip::before {
  content: '';
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

/* 4상태 — data-state 속성으로 색·라벨 전환 */
.sp-conn-chip[data-state='connecting'] {
  color: #fbbf24;
  border-color: rgba(251, 191, 36, 0.4);
}
.sp-conn-chip[data-state='connected'] {
  color: #34d399;
  border-color: rgba(52, 211, 153, 0.4);
}
.sp-conn-chip[data-state='disconnected'] {
  color: #f87171;
  border-color: rgba(248, 113, 113, 0.5);
}
.sp-conn-chip[data-state='reconnecting'] {
  color: #fb923c;
  border-color: rgba(251, 146, 60, 0.4);
}

/* 끊김·재연결 도트 펄스 — 사용자 주의 환기 */
.sp-conn-chip[data-state='disconnected']::before,
.sp-conn-chip[data-state='reconnecting']::before {
  animation: sp-conn-pulse 1.2s ease-in-out infinite;
}
@keyframes sp-conn-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

/* 모바일 — 인풋·키패드와 안전 거리 (top 안전영역 고려) */
@supports (top: env(safe-area-inset-top)) {
  .sp-conn-chip {
    top: calc(env(safe-area-inset-top, 0) + 8px);
  }
}

/* 보내기 버튼 disable 시각 강화 */
.submit-btn[data-ws-blocked='true'] {
  background: #1e293b !important;
  color: #475569 !important;
  cursor: not-allowed;
  pointer-events: none;
}
```

### 1.3 HTML 정의

```html
<div
  class="sp-conn-chip"
  data-state="connecting"
  role="status"
  aria-live="polite"
  aria-label="서버 연결 상태"
  id="spConnChip"
>
  <span class="sp-conn-chip-label">연결 중...</span>
</div>
```

- `role="status" aria-live="polite"` — 스크린리더가 상태 변경을 부드럽게 안내
- `pointer-events: none` — 칩이 인풋·버튼 클릭 가로채지 않음
- `data-state` 속성으로 4상태 전환

### 1.4 JS 정의 (요약)

```js
(function () {
  var STATE_LABELS = {
    connecting:   '연결 중...',
    connected:    '연결됨',
    disconnected: '연결 끊김',
    reconnecting: '재연결 중...',
  };
  var SUBMIT_SELECTORS = /* 도구별 주입 */;

  var currentState = 'connecting';

  function spConnSetState(state) {
    if (state === currentState) return;
    currentState = state;
    var chip = document.getElementById('spConnChip');
    if (chip) {
      chip.setAttribute('data-state', state);
      var label = chip.querySelector('.sp-conn-chip-label');
      if (label) label.textContent = STATE_LABELS[state] || state;
    }
    // 보내기 버튼 disable 토글
    var blocked = state !== 'connected';
    for (var i = 0; i < SUBMIT_SELECTORS.length; i++) {
      var btns = document.querySelectorAll(SUBMIT_SELECTORS[i]);
      for (var j = 0; j < btns.length; j++) {
        if (blocked) btns[j].setAttribute('data-ws-blocked', 'true');
        else btns[j].removeAttribute('data-ws-blocked');
      }
    }
  }

  // 외부 노출 — live*HTML 의 connect() / ws.onopen / ws.onclose 가 호출
  window.spConnSetState = spConnSetState;
})();
```

호출 패턴 (각 학생 페이지가 자기 ws 라이프사이클에서 호출):

```js
// connect() 함수 진입 시
window.spConnSetState(reconnectTimer ? 'reconnecting' : 'connecting');

// ws.onopen
ws.onopen = function () {
  reconnectDelay = 1000;
  window.spConnSetState('connected');
  ws.send(JSON.stringify({ type: 'join', sessionToken: sessionToken }));
};

// ws.onclose
ws.onclose = function () {
  ws = null;
  window.spConnSetState('disconnected');
  if (remaining > 0) show('disconnected');
  scheduleReconnect();
};

// scheduleReconnect() 안
reconnectTimer = setTimeout(function () {
  reconnectTimer = null;
  window.spConnSetState('reconnecting');
  connect();
}, reconnectDelay);
```

### 1.5 submit 함수 — silent no-op 차단

각 학생 페이지의 submit 함수 패턴 (예: 워드클라우드):

```js
function submitWord() {
  var input = document.getElementById('wordInput');
  var word = input.value.trim();
  if (!word) return;
  if (remaining <= 0) return;

  // NEW — WS 미연결 시 사용자에게 안내 후 abort
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    // 버튼은 이미 data-ws-blocked로 disable 됐을 것이지만
    // 안전망으로 placeholder 변경 (예: "연결을 확인 중입니다")
    input.placeholder = '연결을 확인 중입니다...';
    setTimeout(function () {
      input.placeholder = '단어를 입력하세요';
    }, 1500);
    return;
  }

  ws.send(JSON.stringify({ type: 'submit_word', word: word, sessionToken: sessionToken }));
}
```

---

## 2. 4개 학생 페이지 diff 미리보기

### 2.1 `liveWordCloudHTML.ts`

| 위치                                | 변경                                                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| top 모듈 import                     | `import { getConnectionChipCSS, getConnectionChipHTML, getConnectionChipJS } from './_studentPageChrome';` |
| `<style>` 안 끝                     | `${getConnectionChipCSS()}`                                                                                |
| `<body>` 시작 직후                  | `${getConnectionChipHTML()}`                                                                               |
| `<script>` IIFE 시작부              | `${getConnectionChipJS({ submitButtonSelectors: ['#submitBtn'] })}`                                        |
| `connect()` 함수                    | 진입 시 `window.spConnSetState(...)` 호출                                                                  |
| `ws.onopen`                         | `window.spConnSetState('connected')` 추가                                                                  |
| `ws.onclose`                        | `window.spConnSetState('disconnected')` 추가                                                               |
| `scheduleReconnect()` setTimeout 안 | `window.spConnSetState('reconnecting')` 추가                                                               |
| `submitWord()`                      | WS 미연결 안전망 (placeholder 안내)                                                                        |

추가 ~25줄, 삭제 0줄.

### 2.2 `liveSurveyHTML.ts` (주관식)

- `submitBtn` 셀렉터 `#submitBtn` (확인 필요)
- 동일 패턴 ~25줄 추가

### 2.3 `liveVoteHTML.ts` (객관식·투표)

- submit 은 선택지 버튼들 — `submitButtonSelectors: ['.choice-btn']` (실제 셀렉터 Design Do 단계에서 확인)
- 객관식은 단일 클릭 → 즉시 전송이라 disable 효과가 가장 명확

### 2.4 `liveMultiSurveyHTML.ts` (복합)

- 1932 라인 가장 큼. 여러 페이지(질문별)지만 칩 마운트는 1회
- submit 셀렉터 여러 개 가능 → 배열로 처리

---

## 3. 회귀 가드 — `regression-grep-check.mjs` 5건

```js
// REGRESSION #18~#22 — realtime-tool-student-page-health Phase 2 (2026-05-21)
// 학생 페이지 [hidden] CSS 가드와 연결 상태 칩 마크업의 부재를 차단.
// 누락 시 회귀: (a) v2.0.4 이하의 상태 누적 노출 버그 재발,
//             (b) 학생이 WS 미연결 자각 못 하는 침묵 실패 재발.

{
  file: 'electron/ipc/liveWordCloudHTML.ts',
  pattern: /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/,
  name: 'REGRESSION #18: liveWordCloudHTML.ts 학생 페이지 [hidden] 가드 (v2.0.5 hotfix)',
},
{
  file: 'electron/ipc/liveSurveyHTML.ts',
  pattern: /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/,
  name: 'REGRESSION #19: liveSurveyHTML.ts 학생 페이지 [hidden] 가드 (v2.0.5 hotfix)',
},
{
  file: 'electron/ipc/liveVoteHTML.ts',
  pattern: /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/,
  name: 'REGRESSION #20: liveVoteHTML.ts 학생 페이지 [hidden] 가드 (v2.0.5 hotfix)',
},
{
  file: 'electron/ipc/liveMultiSurveyHTML.ts',
  pattern: /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/,
  name: 'REGRESSION #21: liveMultiSurveyHTML.ts 학생 페이지 [hidden] 가드 (v2.0.5 hotfix)',
},
{
  file: 'electron/ipc/_studentPageChrome.ts',
  pattern: /export\s+function\s+getConnectionChipHTML[\s\S]{0,800}?sp-conn-chip[\s\S]{0,400}?role="status"[\s\S]{0,400}?aria-live="polite"/,
  name: 'REGRESSION #22: _studentPageChrome 연결 상태 칩 구조 (sp-conn-chip + role=status + aria-live=polite)',
},
```

5건 모두 존재 검사 (부재 검사 아님). 4개 학생 페이지 + 공용 칩 헬퍼.

---

## 4. 변경 파일 요약

| 파일                                  | 변경 유형 | 추가 줄수  | 비고                              |
| ------------------------------------- | --------- | ---------- | --------------------------------- |
| `electron/ipc/_studentPageChrome.ts`  | 신규      | ~120       | 공용 헬퍼                         |
| `electron/ipc/liveWordCloudHTML.ts`   | 수정      | +25        | import + 칩 + WS 훅 + submit 가드 |
| `electron/ipc/liveSurveyHTML.ts`      | 수정      | +25        | 동일 패턴                         |
| `electron/ipc/liveVoteHTML.ts`        | 수정      | +20        | 객관식 — submit 가드 약함         |
| `electron/ipc/liveMultiSurveyHTML.ts` | 수정      | +25        | 가장 큰 파일, 칩 1회 마운트       |
| `scripts/regression-grep-check.mjs`   | 수정      | +35        | REGRESSION #18~#22                |
| **합계**                              |           | **~250줄** |                                   |

---

## 5. 시각 시안

```
┌─────────────────────────────────────────┐
│                            🟢 연결됨    │  ← 우상단 칩 (12px font, blur bg)
│                                          │
│           ☁️ 쌤핀 워드클라우드           │
│                                          │
│        이 주제에 대해 떠오르는           │
│             단어는?                      │
│                                          │
│  ┌────────────────────────┐  ┌──────┐ │
│  │ 단어를 입력하세요       │  │보내기│ │  ← 보내기 enable
│  └────────────────────────┘  └──────┘ │
│                                          │
│         남은 횟수: 5/5                   │
└─────────────────────────────────────────┘

상태 전환 예시 (WS 끊김):

┌─────────────────────────────────────────┐
│                       🔴 연결 끊김 ●     │  ← 펄스 애니메이션
│                                          │
│           ☁️ 쌤핀 워드클라우드           │
│                                          │
│        이 주제에 대해 떠오르는           │
│             단어는?                      │
│                                          │
│  ┌────────────────────────┐  ┌──────┐ │
│  │ 단어를 입력하세요       │  │보내기│ │  ← dim·click 차단
│  └────────────────────────┘  └──────┘ │
│                                          │
└─────────────────────────────────────────┘
```

---

## 6. Accessibility 체크리스트

- [x] `role="status"` — 정보 변경 영역 명시
- [x] `aria-live="polite"` — 스크린리더가 다른 발화 안 끊고 안내
- [x] `aria-label="서버 연결 상태"` — 칩 자체 의미 명시
- [x] 색상 의존 X — 4상태 모두 텍스트 라벨 병기 ("연결됨"·"연결 끊김" 등)
- [x] `pointer-events: none` — 키보드/터치 포커스 방해 없음
- [x] 색 대비 — 칩 배경 `rgba(19,26,43,0.85)` + 텍스트 #e2e8f0 = 대비 12:1 (WCAG AAA)
- [x] 상태 색상 단독 대비도 다크 배경에서 4.5:1 이상

---

## 7. 호환·회귀 가드

- 기존 `show(id)` 함수와 칩은 **독립 작동** — 칩은 항상 마운트, 기존 화면 상태와 무관
- `[hidden]` CSS 가드는 칩과 별개 — 기존 5개 상태(connecting/ready/limit/closed/disconnected) DOM 은 그대로
- WS 변수명·이벤트 핸들러 시그니처 0건 변경 (`spConnSetState` 호출만 추가)
- sessionToken·remaining·재연결 백오프 로직 0건 변경
- 학생 페이지 4개 외 다른 파일 영향 없음 (Tailwind/React/스토어 무관)

---

## 8. 검증 시나리오 (Plan §11.2 구체화)

| #   | 시나리오                              | 사전 조건                                                                                    | 기대                                                |
| --- | ------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | 정상 환경 진입                        | `npm run electron:dev` + 워드클라우드 라이브 시작 + 휴대폰 LTE/PC mobile emulation 으로 접속 | 칩 `connecting` → 1초 내 `connected` (녹색 ●)       |
| 2   | 단어 제출 정상                        | 시나리오 1 후                                                                                | 칩 `connected` 유지, 단어 입력 + 전송, 교사 화면 +1 |
| 3   | 교사 PC `npm run electron:dev` Ctrl+C | 시나리오 2 직후                                                                              | 칩 즉시 `disconnected` (빨강 펄스), 보내기 dim      |
| 4   | 교사 PC 재실행 후 학생 자동 재접속    | 시나리오 3 후 1초 대기                                                                       | 칩 `reconnecting` (주황 펄스) → `connected` 복귀    |
| 5   | WS 미연결 상태 보내기 클릭            | 시나리오 3 상태                                                                              | 클릭 자체 안 됨 (pointer-events none, dim)          |
| 6   | 인풋 클릭은 정상 동작                 | 시나리오 1                                                                                   | 칩이 인풋 영역과 안 겹치고 입력 가능                |
| 7   | 360px 화면(SE) 칩 위치                | DevTools mobile emulation iPhone SE                                                          | 우상단 fixed, 인풋과 충돌 없음                      |
| 8   | safe-area 지원 (iPhone 14+)           | iOS Safari                                                                                   | env(safe-area-inset-top) 만큼 아래로                |
| 9   | 4개 도구 모두 동일 시각               | 워드클라우드·주관식·객관식·복합 각각                                                         | 칩 외관·상태 전환 일관                              |
| 10  | 회귀 grep                             | `npm run regression-check`                                                                   | REGRESSION #18~#22 모두 PASS                        |

---

## 9. Open Questions for Phase 1 Do

| #   | 질문                                              | 권고                                                           |
| --- | ------------------------------------------------- | -------------------------------------------------------------- |
| 1   | submit 버튼 셀렉터를 도구별로 어떻게 정확히 파악? | Design Do 단계에서 각 HTML 파일 grep으로 자동 추출 — 추측 X    |
| 2   | `liveDiscussion.ts` (토론) 도 적용?               | 4개 우선, 토론은 별도 PDCA (Plan §4.2 Out of Scope 그대로)     |
| 3   | 칩이 좌상단·우상단 어디?                          | 우상단 — 한국 사용자 UI 관습 + 인풋 우측 끝 버튼과 시각적 균형 |

내부 결정 — 사용자 OQ 불필요.

---

## Version History

| Version | Date       | Changes                                                                           | Author               |
| ------- | ---------- | --------------------------------------------------------------------------------- | -------------------- |
| 1.0     | 2026-05-21 | Phase 1 (공용 칩 헬퍼 + 4개 학생 페이지 적용) + Phase 2 (5건 회귀 가드) 상세 설계 | Claude (사용자 요청) |
