# 설문 도구 실시간 답변 확인 (Survey Realtime Response View) Planning Document

> **Summary**: 쌤핀의 객관식 설문(Poll) · 주관식 설문(Survey) · 복합 유형 설문(MultiSurvey) 세 도구는 워드클라우드처럼 학생 답변이 실시간으로 도착하지만, **UI가 의도적으로 텍스트 내용을 숨기고 카운트(`{N}명 응답`)와 익명 카드(`#1` "학생 제출 완료")만 노출**한다. 결과는 "설문 종료 → 결과 보기"를 눌러야만 보인다. 본 PDCA는 교사가 문항 설계 단계에서 **"실시간 답변 확인" 토글을 켜면 학생 답변 텍스트가 라이브 화면에 즉시 표시되도록** UI 레이어를 개선한다. IPC/서버 로직은 이미 텍스트를 broadcast 중이라 비파괴 확장이 가능하다. 워드클라우드(`ToolWordCloud.tsx`)의 즉시-반영 패턴을 3도구에 통일 적용한다.
>
> **Project**: SsamPin
> **Version**: v2.0.6 또는 v2.1.0 (예정 — minor, 다른 작업과 묶음 릴리즈 후보)
> **Author**: pblsketch
> **Date**: 2026-05-14
> **Status**: Draft v0.1 (`/pdca plan survey-realtime-response-view` 직후)
> **Scope**: Standard (3도구 통일 토글 + UX 개선, 사용자 결정 2026-05-14)

---

## 1. 개요

### 1.1 목적

이 PDCA가 해결하는 문제:

1. **주관식 설문(Survey)**: 학생 답변 텍스트가 이미 `live-survey:student-submitted` 이벤트로 broadcast되지만 ([`liveSurvey.ts:189-192`](e:/github/ssampin/electron/ipc/liveSurvey.ts#L189)) UI에서 의도적으로 무시한다. [`ToolSurvey.tsx:665-678`](e:/github/ssampin/src/adapters/components/Tools/ToolSurvey.tsx#L665)의 SurveyingView 카드는 `sub.id` · 시각 · "학생 제출 완료" 문구만 렌더한다. 교사는 학생들이 무엇을 답했는지 종료 전까지 알 수 없다.
2. **복합 유형 설문(MultiSurvey) scroll 모드**: 답변 배열이 `live-multi-survey:student-submitted` 페이로드로 전달되지만 ([`liveMultiSurvey.ts:689-690`](e:/github/ssampin/electron/ipc/liveMultiSurvey.ts#L689)) [`ToolMultiSurvey.tsx:1100-1106`](e:/github/ssampin/src/adapters/components/Tools/ToolMultiSurvey.tsx#L1100)의 submission feed에서 동일하게 `#N`·시각만 표시한다. phase 모드(stepMode=true)는 `aggregatedPreview`를 받아 TeacherControlPanel에 부분적으로 집계하지만, 도구별 일관성이 없다.
3. **객관식 설문(Poll)**: 옵션별 카운트(`option.votes`)는 broadcast되고 `showResults` 토글로 즉석에서 막대그래프를 표시할 수 있지만 ([`ToolPoll.tsx:837-846, 939, 1115`](e:/github/ssampin/src/adapters/components/Tools/ToolPoll.tsx#L1115)), **기본값이 `useState(false)`로 OFF**라 신규 교사는 토글이 있는지조차 모를 수 있다. 또한 직접 입력(자유 텍스트) 옵션의 누가 무엇을 골랐는지 같은 상세 데이터는 없다.
4. **워드클라우드와의 비대칭**: 워드클라우드는 라이브 모드 진입 즉시 학생 단어 빈도가 화면에 누적 표시되고, 토글이 없다(`ToolWordCloud.tsx`). 교사 경험이 도구마다 완전히 다르다.
5. **교사의 결정권 부재**: "공정성 보장(다른 학생 영향 회피)" 목적으로 익명·카운트만 노출하는 것이 합리적인 사용 사례도 있다. 그러나 브레인스토밍·아이스브레이커·즉석 의견 수렴 등 **실시간 노출이 더 유익한 사용 사례**에 대해 교사가 선택할 수 없다.

### 1.2 배경

2026-05-14 사용자 대화에서 발견:

> "주관식 설문을 했을 때 학생들의 답변이 그때그때 보이면 좋겠는데 지금 그게 구현되어 있어? 현재는 몇 명의 학생이 답변했는지만 보이는 거 아냐?"

사용자 추측이 맞았다. 코드 확인 결과:

- `liveSurvey.ts:189-192` — IPC 이벤트 페이로드에 `text` 필드가 이미 포함됨
- `ToolSurvey.tsx:673` — UI는 그 필드를 그냥 버림(`<span>학생 제출 완료</span>`)

추가 확인:

- `liveMultiSurvey.ts:689` — scroll 모드도 동일하게 `answers` 배열을 broadcast 중인데 UI(`ToolMultiSurvey.tsx:1106`)에서 숨김
- `ToolPoll.tsx:1115` — `showResults` 기본 OFF, 교사가 매 세션마다 수동으로 켜야 함

워드클라우드 reference 패턴:

- 라이브 모드 진입 시 학생 단어 → IPC `live-wordcloud:word-submitted` (`{ word, count, totalWords }`) → 화면 즉시 반영
- 토글 없음. "라이브 시작" = "실시간 답변 확인 ON".

사용자 결정 (2026-05-14 AskUserQuestion 응답):

| 차원         | 선택                              | 비고                                                                     |
| ------------ | --------------------------------- | ------------------------------------------------------------------------ |
| 작업 범위    | **3도구 통일 토글 + UX 개선**     | 문항 설계 화면에 "실시간 답변 확인" 옵션 통일 추가 + 도구별 갭 각각 보완 |
| Feature 이름 | **survey-realtime-response-view** | docs/ 폴더명 + PDCA 식별자                                               |

### 1.3 관련 문서

- 사용자 피드백: 본 세션 대화 (2026-05-14)
- Reference 도구: [`ToolWordCloud.tsx`](e:/github/ssampin/src/adapters/components/Tools/ToolWordCloud.tsx) — 실시간 즉시 반영의 모범 사례
- 영향 도구 (3종):
  - [`ToolPoll.tsx`](e:/github/ssampin/src/adapters/components/Tools/ToolPoll.tsx) (객관식 설문, ~1700줄)
  - [`ToolSurvey.tsx`](e:/github/ssampin/src/adapters/components/Tools/ToolSurvey.tsx) (주관식 설문, ~1400줄)
  - [`ToolMultiSurvey.tsx`](e:/github/ssampin/src/adapters/components/Tools/ToolMultiSurvey.tsx) (복합 유형 설문, ~1700줄)
- 영향 IPC:
  - [`electron/ipc/liveVote.ts`](e:/github/ssampin/electron/ipc/liveVote.ts) — Poll
  - [`electron/ipc/liveSurvey.ts`](e:/github/ssampin/electron/ipc/liveSurvey.ts) — Survey
  - [`electron/ipc/liveMultiSurvey.ts`](e:/github/ssampin/electron/ipc/liveMultiSurvey.ts) — MultiSurvey
- 관련 컴포넌트:
  - [`TeacherControlPanel.tsx`](e:/github/ssampin/src/adapters/components/Tools/TeacherControlPanel.tsx) — phase 모드 집계 패널
  - [`MultiSurveyLiveBoard/`](e:/github/ssampin/src/adapters/components/Tools/MultiSurveyLiveBoard/) — 별도 전체화면 보드 (현재 수동 토글, 본 PDCA 범위 외 손대지 않음)
- 워드클라우드 IPC: [`electron/ipc/liveWordCloud.ts`](e:/github/ssampin/electron/ipc/liveWordCloud.ts)

---

## 2. 범위

### 2.1 포함 범위 (In Scope)

#### Layer 1 — 도메인 스키마 확장 (P0)

각 설문의 **문항 또는 세션 단위 설정**에 `realtimeResponseView: boolean` 필드 추가. 저장 위치 결정 기준:

- **세션 단위가 자연스러운 경우** (`Poll`, `Survey`, `MultiSurvey` scroll 모드): 도구 상태 객체 또는 useXxxStore의 세션 설정에 booleanflag 추가. 기본값 `false`(현행 익명 유지).
- **문항 단위가 자연스러운 경우** (`MultiSurvey` phase 모드 — 객관식/주관식 혼합): 문항(`Question` 또는 `Slide`) 객체에 `realtimeResponseView?: boolean` 필드 추가. 기본값 `false`.
- 사용자의 표현 "교사가 문항을 설계할 때 ... 실시간 답변 확인 설정을 켜면"을 따라 **MultiSurvey는 문항별 토글**을 우선 고려한다. Poll/Survey는 세션 단위 토글로 간단화.

#### Layer 2 — 문항 설계 UI 토글 (P0)

3도구 각각의 **문항(또는 세션) 편집 화면**에 일관된 형태의 토글 컴포넌트 추가:

```
┌────────────────────────────────────────────┐
│ ☐ 실시간 답변 확인                          │
│   학생 답변이 도착하는 즉시 교사 화면에     │
│   표시됩니다. 다른 학생들이 보이지 않게     │
│   별도 디스플레이/프로젝터 환경에서         │
│   사용하세요.                               │
└────────────────────────────────────────────┘
```

- 신규 공통 컴포넌트 후보: `RealtimeResponseToggle.tsx` (3도구 공유). 라벨·설명 카피·디자인 시스템 토큰(`sp-card`/`sp-border`/`sp-accent`) 통일.
- 위치:
  - `ToolPoll` — 옵션 설정 패널 아래 (옵션 색상·다중 선택 토글 영역 인접)
  - `ToolSurvey` — 1인당 글자 수 제한 옵션 아래
  - `ToolMultiSurvey` — 문항별 편집 카드 내부 (각 Question 카드 푸터) 또는 세션 전역 (Design 단계에서 확정)
- a11y: `role="switch"` + `aria-checked` + Tab 포커스 가능 + Space/Enter 토글.

#### Layer 3 — 라이브 화면 답변 렌더링 (P0)

**ToolSurvey.tsx 변경** — `SurveyingView` 카드 (line 665-678):

```diff
- <span className="text-sp-text text-sm">학생 제출 완료</span>
+ {realtimeResponseView ? (
+   <span className="text-sp-text text-sm flex-1 line-clamp-2">{sub.answers[0]?.text || sub.text}</span>
+ ) : (
+   <span className="text-sp-text text-sm">학생 제출 완료</span>
+ )}
```

- 답변 텍스트 표시 시 `line-clamp-2`로 행 높이 안정화 (긴 답변 잘림 처리).
- 호버 시 전체 답변 툴팁 또는 확장 카드.
- 답변 길이가 0인 경우(이론상 IPC에서 빈 텍스트 필터링하지만 보수적으로) "학생 제출 완료" 폴백.

**ToolMultiSurvey.tsx 변경** — RunningView (line 1100-1106) 동일 패턴. scroll 모드에서 답변 배열을 문항별로 펼쳐 보여주거나 마지막 문항 답변만 미니 미리보기.

**ToolPoll.tsx 변경** — `realtimeResponseView`가 ON이면 `showResults`도 자동으로 켜진 효과(또는 두 토글 동기화)로 막대그래프 + 카운트 즉시 표시. OFF면 현행 유지(카운트는 보이지만 사용자가 막대 보기 토글 수동). 또한 직접 입력 옵션의 누가 입력했는지 학생명 익명/실명 표시는 본 스코프 외(향후 확장).

#### Layer 4 — 워드클라우드와 통일된 시각 처리 (P0)

- 새 답변 카드가 화면 상단에 push될 때 짧은 fade-in 애니메이션 (200ms, `transition-opacity ease-out`).
- 답변 수가 늘어남에 따라 카드 높이가 균일하게 유지되도록 `min-h-` Tailwind 유틸 적용.
- 답변이 화면을 넘어가면 가장 오래된 카드부터 fade-out + 자동 스크롤 옵션 (또는 누적 카운트 헤더 + 스크롤).

#### Layer 5 — 학생 보호 가드 (P0)

토글이 ON이라도 **다음 두 조건에서는 답변 텍스트 표시 금지**(보수적 가드):

- 학생 화면(`liveSurveyHTML.ts` 등)에는 다른 학생 답변 표시 안 함 (현재도 안 함, 유지).
- 교사 화면이 학생들이 볼 수 있는 디스플레이(프로젝터/공유 화면)에 노출되는지 여부는 SsamPin이 알 수 없음. 토글 라벨에 명시적 경고 카피 ("다른 학생들이 보이지 않게 별도 디스플레이/프로젝터 환경에서 사용하세요").
- 본 스코프에서는 위 가드는 UX 카피 수준이며, "프레젠테이션 모드 자동 차단" 같은 기술 가드는 별도 PDCA.

#### Layer 6 — 회귀 안전망 (P0)

- **단위 테스트** (Vitest):
  - 도구별 `realtimeResponseView` 토글 ON/OFF 시 카드 렌더링 차이 (스냅샷 또는 텍스트 매칭) 3종
  - `liveSurvey.ts` `text` 페이로드 → `SurveyingView` 렌더링 통합 (mock IPC)
- **메타 테스트** (grep 기반, regression-check 스타일):
  - `__tests__/regression/survey-realtime-response.test.ts` — 3 도구 라이브 화면에 토글 분기 존재 확인 (`realtimeResponseView ? ` 패턴 존재)
- **수동 RG** 시나리오 6종 (인수 기준 §6에 명시).

### 2.2 제외 범위 (Out of Scope, 후속 PDCA)

- **학생 화면에 다른 학생 답변 표시** (peer-visible 답변) — 별도 큰 PDCA, 실시간 게시판(RealtimeWall) 기능과 중복 가능.
- **답변 작성자 식별** (Poll 직접입력 누가 했는지, Survey 누가 답했는지). 현재 모두 익명. 식별 기능은 floor/closed session/QR identity와 별도 PDCA.
- **워드클라우드 같은 단어 빈도 시각화** for Survey/MultiSurvey — 텍스트 자연어 처리(NLP) 또는 빈도 집계 UI는 더 큰 작업, 본 PDCA는 "답변을 글자 그대로 보여준다"까지만.
- **MultiSurveyLiveBoardView 전체화면 보드 항상 노출** — 현재 수동 토글. 본 스코프 외, 사용자가 별도로 켜는 형태 유지.
- **모달/팝업 전용 라이브 디스플레이 모드**(전체화면 외부 모니터 송출 등) — Out of Scope.
- **모바일(`src/mobile/`) 영향** — 본 PDCA는 데스크톱 도구 UI만 수정. 모바일은 학생 답변 화면이라 자연 분리.
- **IPC 서버 측 페이로드 변경** — 이미 `text`/`answers`가 broadcast되고 있어 변경 불필요. 만약 phase 모드에서 텍스트가 누락되어 있다면 Design 단계에서 보수적으로 추가 결정.
- **저장된 PDF/Excel/HWPX 내보내기 형식 변경** — 결과 종료 후 export는 그대로.

### 2.3 비목표

- **IPC 서버 흐름 비파괴** — `electron/ipc/live*.ts`의 WebSocket 핸들러, 학생 페이지(`*HTML.ts`), 세션 시작/종료 시퀀스 변경 없음. Layer 1~5는 모두 렌더러(UI) 측 또는 페이로드 추가 필드 수준.
- **공정성 보장 모드(현행 기본 동작) 유지** — `realtimeResponseView`는 옵트인(기본 OFF). 기존 사용자가 토글을 켜지 않는 한 화면 동작은 동일.
- **워드클라우드 자체 변경 금지** — Reference로만 사용. ToolWordCloud.tsx 수정 없음.
- **TeacherControlPanel.tsx 침습 최소화** — phase 모드 패널은 이미 `aggregatedPreview`를 노출 중이라 본 PDCA에서는 새 토글이 phase 모드에 어떻게 적용되는지만 추가. 패널 구조 자체 리팩토링 없음.
- **release-notes.json 스키마 파괴 변경 금지** — 본 기능 안내는 `highlights`/`changes`로 추가.

---

## 3. 산출물 (Deliverables)

| ID   | 산출물                                                                                                           | Layer | 우선순위 |
| ---- | ---------------------------------------------------------------------------------------------------------------- | ----- | -------- |
| D-01 | `RealtimeResponseToggle.tsx` 신규 공통 컴포넌트 — 3도구 공유, role=switch                                        | 2     | P0       |
| D-02 | `ToolPoll.tsx` 옵션 설정 패널에 토글 추가 + `showResults` 동기화 로직                                            | 1·2·3 | P0       |
| D-03 | `ToolSurvey.tsx` 설정 영역에 토글 추가 + 세션 상태에 `realtimeResponseView` 필드                                 | 1·2   | P0       |
| D-04 | `ToolSurvey.tsx` `SurveyingView` 카드 텍스트 분기 렌더링 (line 665-678)                                          | 3·4   | P0       |
| D-05 | `ToolMultiSurvey.tsx` 문항 카드/세션 설정에 토글 추가 + 도메인 타입(Question) 필드 확장                          | 1·2   | P0       |
| D-06 | `ToolMultiSurvey.tsx` `RunningView` submission feed 분기 렌더링 (line 1100-1106)                                 | 3·4   | P0       |
| D-07 | `ToolMultiSurvey.tsx` phase 모드(TeacherControlPanel)에서 `realtimeResponseView`가 ON일 때 답변 텍스트 노출 강화 | 3     | P1       |
| D-08 | 카드 fade-in/fade-out 애니메이션 + 자동 스크롤 또는 누적 카운트 헤더                                             | 4     | P1       |
| D-09 | 단위 테스트 — `ToolPoll`/`ToolSurvey`/`ToolMultiSurvey` 토글 분기 렌더링 3종                                     | 6     | P0       |
| D-10 | 통합 테스트 — mock IPC `live-survey:student-submitted` → SurveyingView 텍스트 렌더 확인                          | 6     | P0       |
| D-11 | 메타 테스트 `__tests__/regression/survey-realtime-response.test.ts` — 3도구에 토글 분기 존재 보장                | 6     | P0       |
| D-12 | `docs/02-design/features/survey-realtime-response-view.design.md` — 컴포넌트 diff·상태 흐름·a11y·카피            | —     | P0       |
| D-13 | 챗봇 KB Q&A 추가 (3건: 토글 위치·다른 학생에게 안 보이는지·기본값)                                               | —     | P1       |
| D-14 | 노션 가이드 — 객관식/주관식/복합 설문 카드에 "실시간 답변 확인" 섹션 추가                                        | —     | P1       |
| D-15 | (선택) `docs/04-report/features/survey-realtime-response-view.report.md` — Match Rate ≥ 90% 후 작성              | —     | P1       |

---

## 4. 구현 계획 (1.5~2주 타임라인)

### Week 1 — Layer 1~3 핵심 동작

| Day     | 작업                                                                               | 산출물                  | 의존성 |
| ------- | ---------------------------------------------------------------------------------- | ----------------------- | ------ |
| D1 (월) | 공통 토글 컴포넌트 `RealtimeResponseToggle` 신규 + a11y(role=switch)               | D-01                    | —      |
| D1 (월) | 3도구 도메인/상태 필드 확장 (Poll·Survey 세션 단위 / MultiSurvey 문항 단위)        | D-02·D-03·D-05 (필드만) | D-01   |
| D2 (화) | `ToolSurvey` 토글 + `SurveyingView` 카드 분기 렌더                                 | D-03·D-04               | D-01   |
| D3 (수) | `ToolMultiSurvey` 토글 + `RunningView` submission feed 분기 렌더                   | D-05·D-06               | D-01   |
| D4 (목) | `ToolPoll` 토글 + `showResults` 동기화 로직 (토글 ON 시 자동 ON, 기존 사용자 호환) | D-02                    | D-01   |
| D5 (금) | 단위 테스트 3종 + 메타 테스트 + lint/typecheck 0 errors                            | D-09·D-11               | 전체   |

### Week 2 — Layer 4·5·6 + 통합 + 묶음 릴리즈 준비

| Day      | 작업                                                                                                      | 산출물    | 의존성    |
| -------- | --------------------------------------------------------------------------------------------------------- | --------- | --------- |
| D6 (월)  | 카드 fade-in/out 애니메이션 + `line-clamp-2` 안정화 + 자동 스크롤 (옵션)                                  | D-08      | D-04·D-06 |
| D7 (화)  | MultiSurvey phase 모드 TeacherControlPanel에서 토글 ON일 때 텍스트 강화                                   | D-07      | D-05      |
| D8 (수)  | 통합 테스트 (mock IPC → 렌더) + 수동 RG 시나리오 6종                                                      | D-10      | 전체      |
| D9 (목)  | `/pdca design survey-realtime-response-view` Design 단계 보강 + bkit:gap-detector 검증 + 챗봇 KB Q&A 작성 | D-12·D-13 | 전체      |
| D10 (금) | 묶음 릴리즈 후보 점검 (모바일 PR / 다른 진행 PDCA와 합류 여부) — 단독 patch 보다 묶음 minor 권장          | —         | 전체      |

**병렬 가능 작업**: D2/D3/D4 (도구별 토글 통합)은 D-01 완료 후 독립 가능. 단, 같은 워킹트리에서 충돌 회피를 위해 한 PR로 모음 권장.

### 4.1 빌드·배포 트러블 회피 (메모리 기록 적용)

CLAUDE.md / MEMORY.md "Release Workflow Step 6"의 5단계 분리 명령을 그대로 적용:

```
npx tsc -b
npx vite build
npx vite build --config vite.student.config.ts
node scripts/build-electron.mjs
npx electron-builder
```

### 4.2 챗봇 KB / 노션 가이드 갱신 항목

- 챗봇 Q&A 추가 (`scripts/ingest-chatbot-qa.mjs`):
  - Q. "주관식 설문 답변을 실시간으로 보고 싶어요" → A. "주관식 설문 만들 때 '실시간 답변 확인' 토글을 켜면 학생이 제출하는 즉시 답변이 라이브 화면에 표시돼요. 단, 화면이 학생들에게 보이지 않는 환경(별도 모니터)에서 사용하세요."
  - Q. "객관식 설문 막대그래프가 안 보여요" → A. "라이브 중 화면 하단 '👁️ 결과 보기' 버튼을 누르거나, 문항 만들 때 '실시간 답변 확인' 토글을 미리 켜두면 처음부터 보여요."
  - Q. "실시간 답변 보기가 학생 화면에도 보이나요?" → A. "아니요. 교사 화면에만 표시됩니다. 학생 화면은 익명 처리되며 다른 학생 답변은 보이지 않아요."

- 노션 가이드: 객관식/주관식/복합 설문 카드 각각에 "실시간 답변 확인 토글" 사용법 1~2줄 추가.

---

## 5. 위험 및 완화

| 위험                                                                               | 영향          | 가능성 | 완화                                                                                                                  |
| ---------------------------------------------------------------------------------- | ------------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| 토글이 ON인 상태에서 교사 화면이 프로젝터에 송출돼 학생이 답변을 보고 영향받음     | 공정성 훼손   | 중     | 토글 라벨에 명시적 경고 카피 + 노션 가이드 + 토글 첫 ON 시 1회성 안내 모달 (선택 사항, Design 단계 결정).             |
| 답변 길이가 매우 길어 카드 높이가 일정하지 않음                                    | UX 저하       | 중     | `line-clamp-2` + `min-h` 안정화. 호버 시 전체 보기 툴팁.                                                              |
| MultiSurvey phase 모드에서 TeacherControlPanel과 토글 동작 충돌                    | 회귀 위험     | 중     | Design 단계에서 phase 모드 동작 명세 확정. 보수적 기본값(phase 모드는 토글 무시하고 기존 패널 우선) 또는 명시적 통합. |
| Poll의 `showResults`와 `realtimeResponseView` 두 토글 의미 중복으로 사용자 혼란    | 학습 곡선 ↑   | 중     | 한쪽으로 통합 또는 동기화 (토글 ON 시 자동 showResults=true). Design에서 명세.                                        |
| 도구마다 상태 저장 위치가 달라 Zustand persist 시 충돌                             | 데이터 일관성 | 낮     | 각 도구 store에 격리(`useToolPollStore.realtimeResponseView` 등). 공유 store 만들지 않음.                             |
| 답변 카드 fade-in/scroll 애니메이션이 저사양 PC에서 버벅임                         | UX 저하       | 낮     | `transition-opacity ease-out` 단순 효과만 사용, FLIP 같은 무거운 패턴 회피.                                           |
| IPC 페이로드에 텍스트 필드가 누락된 도구(예: MultiSurvey phase 모드)가 있을 가능성 | 기능 불가     | 낮     | Design 단계에서 3 도구 모두 페이로드 확인. 누락 시 IPC 측 payload 추가(비파괴 옵션 필드).                             |
| 본 PDCA가 모바일 학생 화면(`liveSurveyHTML.ts`)에 영향 주는 PR과 충돌              | 머지 충돌     | 낮     | 본 PDCA는 학생 HTML 페이지 안 건드림. 영역 자연 분리.                                                                 |

---

## 6. 인수 기준 (Acceptance Criteria)

### A. 토글 컴포넌트 (Layer 1·2)

- [ ] `RealtimeResponseToggle.tsx`는 role=switch, aria-checked, Tab 포커스, Space/Enter 토글 모두 지원.
- [ ] 3 도구의 문항/세션 편집 화면에 동일한 라벨·디자인의 토글 노출.
- [ ] 기본값은 모두 OFF(현행 동작 호환). 사용자가 켜면 도구 상태(또는 문항 객체)에 영속.

### B. 주관식 설문 (Survey)

- [ ] **RG-01**: 토글 OFF → 라이브 화면 카드에 "학생 제출 완료" 문구만 표시(현행 유지).
- [ ] **RG-02**: 토글 ON → 학생이 답변 제출 시 카드에 답변 텍스트가 즉시 노출(2초 이내).
- [ ] **RG-03**: 답변 길이 200자 초과 시 `line-clamp-2`로 자르고 호버 또는 클릭 시 전체 표시.
- [ ] **RG-04**: 세션 종료 후 ResultsView는 토글 상태와 무관하게 항상 전체 답변 표시(현행 유지).

### C. 객관식 설문 (Poll)

- [ ] **RG-05**: 토글 ON → 라이브 시작 즉시 `showResults=true`로 동기화돼 막대그래프 + 카운트 표시.
- [ ] **RG-06**: 토글 OFF → 현행 동작(처음 OFF, 교사가 수동으로 "👁️ 결과 보기" 클릭해야 표시).
- [ ] **RG-07**: 직접 입력 옵션이 있는 경우, 누가 무엇을 입력했는지 학생명은 익명 유지(본 스코프 외 변경 없음).

### D. 복합 유형 설문 (MultiSurvey)

- [ ] **RG-08**: scroll 모드(stepMode=false)에서 토글 ON → submission feed 카드에 각 문항 답변 미리보기 노출.
- [ ] **RG-09**: phase 모드(stepMode=true)에서 토글 ON → TeacherControlPanel에 답변 텍스트 강화 노출(기존 집계 패널 보완).
- [ ] **RG-10**: 문항이 객관식인 경우 카운트 + 옵션별 막대, 주관식인 경우 답변 텍스트 카드.

### E. UX 일관성 (Layer 4)

- [ ] 3 도구의 라이브 화면 답변 카드 디자인이 통일 (디자인 시스템 토큰 `sp-card`/`sp-border`, `rounded-lg`, padding 일치).
- [ ] 신규 답변 카드 fade-in 200ms 애니메이션 적용.
- [ ] 답변이 화면을 넘어가면 자동 스크롤 또는 누적 카운트 헤더로 정보 손실 방지.

### F. 보호 가드 (Layer 5)

- [ ] 토글 라벨에 "다른 학생들이 보이지 않게 별도 디스플레이/프로젝터 환경에서 사용하세요" 경고 카피 포함.
- [ ] 학생 화면(`liveSurveyHTML.ts` 등)에는 다른 학생 답변 표시 안 함(현행 유지 검증).

### G. 회귀 안전망 (Layer 6)

- [ ] 단위 테스트 3종(도구별 토글 분기 렌더) 통과.
- [ ] 통합 테스트 1종(mock IPC → SurveyingView) 통과.
- [ ] 메타 테스트 `__tests__/regression/survey-realtime-response.test.ts` — 3 도구 각각에 `realtimeResponseView` 패턴 존재 확인.
- [ ] `npx tsc -b` 에러 0건, `npm run lint` 에러 0건.
- [ ] 기존 테스트 카운트(현재 ~1071) + 신규 4종 = 1075 모두 통과.

### H. 통합 + 릴리즈

- [ ] 묶음 후보 식별 (모바일 PR 또는 다른 진행 PDCA와 같이 묶을 시 minor 버전, 단독 시 patch).
- [ ] 챗봇 KB Q&A 3건 추가 + 재임베딩.
- [ ] 노션 사용자 가이드 3개 카드(객관식/주관식/복합) 갱신.
- [ ] release-notes.json 항목 작성 (WRITING-STYLE.md 4슬롯 가이드 적용).

---

## 7. 메트릭 (사후 측정 가능 지표)

| 메트릭                                  | 측정 방법                                  | 목표                   |
| --------------------------------------- | ------------------------------------------ | ---------------------- |
| "실시간으로 답변 안 보인다" 피드백 건수 | 수동 모니터링 (피드백 폼·노션 KB Q&A 유입) | v2.0.6 출시 후 4주 0건 |
| 토글 ON 사용 비율 (객관식/주관식/복합)  | 향후 텔레메트리 (v2.1.0+)                  | 30%+                   |
| 라이브 답변 카드 첫 노출 지연 시간      | DevTools 측정 (학생 제출 → 화면 표시)      | ≤ 500ms                |
| TypeScript / lint 에러                  | `npx tsc -b`, `npm run lint`               | 0건                    |
| 신규 단위 테스트 통과율                 | Vitest                                     | 4/4                    |

---

## 8. 다음 단계

1. **이 Plan 사용자 승인** — 3도구 통일 토글 + UX 개선 범위, 1.5~2주 타임라인, 기본값 OFF 옵트인 모두 확정. 추가 결정 사항 발견 시 v0.2로 갱신.
2. **Design 단계 진입** — `/pdca design survey-realtime-response-view`
   - Layer 1 Design: 도메인 필드 위치 (세션 vs 문항) 도구별 확정
   - Layer 2 Design: `RealtimeResponseToggle` props·a11y·디자인 토큰 명세
   - Layer 3 Design: 3 도구 카드 렌더링 diff (정확한 라인 + JSX 변경)
   - Layer 4 Design: 애니메이션·`line-clamp`·자동 스크롤 정책
   - Layer 5 Design: 보호 카피 정확한 문구 + 1회성 안내 모달 여부 결정
   - Layer 6 Design: 테스트 케이스 시그니처
   - MultiSurvey phase 모드 동작 명세 (위험 §5)
3. **bkit:design-validator** 검증 (Plan/Design 일관성)
4. **Do 단계** — D-01 → D-02~06 (3 도구 병렬 가능) → D-07~08 → D-09~11(테스트) → 통합 → 챗봇 KB → 묶음 릴리즈 검토.

---

> **Status**: Draft v0.1 — 사용자 승인 대기 중. 승인 후 `/pdca design survey-realtime-response-view`로 Design 단계 진입.
