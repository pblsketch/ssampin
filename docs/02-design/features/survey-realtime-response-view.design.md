# 설문 도구 실시간 답변 확인 (Survey Realtime Response View) Design Document

> **Plan**: [`survey-realtime-response-view.plan.md`](../../01-plan/features/survey-realtime-response-view.plan.md) v0.1
> **Project**: SsamPin
> **Version**: v2.0.6 또는 v2.1.0 (예정 — minor)
> **Date**: 2026-05-14
> **Status**: Draft v0.1 — Plan v0.1의 미결 2건 확정 + 정확 JSX diff

---

## 0. 문서 구조

Plan §3의 6 Layer + 안전망을 차례로 상세 설계한다.

- §1 Plan 미결 2건 확정 (MultiSurvey 토글 단위 / Poll 통합 방식)
- §2 시나리오 흐름도
- §3 Layer 1 Design — 도메인/상태 필드 (세션 단위 통일)
- §4 Layer 2 Design — 공통 `RealtimeResponseToggle` 컴포넌트
- §5 Layer 3 Design — 3 도구 라이브 화면 카드 분기 렌더링 (정확 JSX diff)
- §6 Layer 4 Design — 시각·애니메이션·line-clamp·자동 스크롤
- §7 Layer 5 Design — 학생 보호 가드 카피 + 1회성 안내 모달
- §8 Layer 6 Design — 단위/통합/메타 테스트 시그니처
- §9 a11y/디자인 토큰 점검 매트릭스
- §10 인수 기준(RG-01~10) 시나리오 detail

---

## 1. Plan 미결 2건 확정

### 1.1 MultiSurvey 토글 단위 → **세션 단위 통일**

| 기준                               | 세션 단위 (채택)                  | 문항 단위                                    |
| ---------------------------------- | --------------------------------- | -------------------------------------------- |
| 일관성                             | 3도구 모두 세션 단위 통일         | MultiSurvey만 다름                           |
| UX 명료성                          | "이 설문은 실시간 노출" 단일 정책 | 문항A 노출 / 문항B 익명 → 학생 인식 혼란     |
| scroll 모드(stepMode=false) 적합성 | 자연                              | 문항 모두 한 번에 받아 문항별 토글 무의미    |
| phase 모드(stepMode=true) 적합성   | 자연 (모든 문항 동일 정책)        | 가능하나 over-engineering                    |
| 구현 비용                          | 상태 1개 추가                     | EditableQuestion 필드 추가 + 문항 UI 토글 ×N |

**확정**: MultiSurvey 토글은 **세션 단위**. 도구 컴포넌트 state(`useState<boolean>(false)`)에 저장. 향후 문항별 토글 요청이 누적되면 별도 PDCA로 확장.

### 1.2 Poll의 `showResults` vs `realtimeResponseView` → **신규 토글이 상위 + 라이브 시작 시 초기값 동기화**

현재:

- [`ToolPoll.tsx:1115`](e:/github/ssampin/src/adapters/components/Tools/ToolPoll.tsx#L1115) `const [showResults, setShowResults] = useState(false)` — 매 세션마다 라이브 중 수동으로 켜야 막대그래프 노출.
- [`ToolPoll.tsx:939`](e:/github/ssampin/src/adapters/components/Tools/ToolPoll.tsx#L939) "👁️ 결과 보기/숨기기" 버튼.

확정:

- `realtimeResponseView`(신규, 문항 설계 화면)와 `showResults`(라이브 중 즉석 토글)는 **다른 시점·다른 입자**의 설정.
- `realtimeResponseView=true` → 라이브 시작 직후 `setShowResults(true)` 자동 호출 (초기값 동기화). 사용자가 라이브 중 수동으로 결과 숨기기 가능.
- `realtimeResponseView=false` → 현행 동작(`showResults=false` 시작, 수동으로 켜야 노출).
- 두 토글의 라벨이 의미 중복으로 혼란 가능성 → "👁️ 결과 보기" 버튼에 호버 툴팁 추가 "라이브 중 즉석 토글 — 문항 설계 시 [실시간 답변 확인]을 켜면 처음부터 켜진 상태로 시작".

| `realtimeResponseView` | 라이브 시작 시 `showResults` 초기값 | 라이브 중 수동 토글       | 의미                             |
| ---------------------- | ----------------------------------- | ------------------------- | -------------------------------- |
| false (기본)           | false                               | 가능                      | 현행 — 막대 숨김 시작, 수동 노출 |
| true                   | true                                | 가능 (숨기기로 일시 회수) | 신규 — 막대 즉시 노출            |

### 1.3 두 결정의 데이터 모델 시사점

| 도구        | 저장 위치                        | 필드명                           | 기본값  | 영속화                                                        |
| ----------- | -------------------------------- | -------------------------------- | ------- | ------------------------------------------------------------- |
| Poll        | `ToolPoll` 컴포넌트 state        | `realtimeResponseView` (boolean) | `false` | 토구 템플릿 저장 시 함께 (`useToolTemplateStore` 객체에 포함) |
| Survey      | `ToolSurvey` 컴포넌트 state      | `realtimeResponseView` (boolean) | `false` | 토구 템플릿 저장 시 함께                                      |
| MultiSurvey | `ToolMultiSurvey` 컴포넌트 state | `realtimeResponseView` (boolean) | `false` | 토구 템플릿 저장 시 함께                                      |

**Zustand store 신설 불필요**. 각 도구의 기존 패턴(`useState`)을 따른다. 영속화는 도구 템플릿 저장/불러오기 흐름에 자연 합류 (`useToolTemplateStore` 객체 스키마에 옵션 필드 추가).

---

## 2. 시나리오 흐름도

### 2.1 메인 분기 (3도구 공통)

```
┌──────────────────────────────────┐
│ 교사: 문항 설계 화면              │
│   [실시간 답변 확인] 토글 OFF→ON │
└────────────────┬─────────────────┘
                 │ state.realtimeResponseView = true
                 ▼
┌──────────────────────────────────┐
│ 교사: 라이브 시작 버튼 클릭        │
│   (📱 학생 설문)                  │
└────────────────┬─────────────────┘
                 │
        ┌────────┴─────────┐
        │                  │
   Poll만: showResults    공통
   = true 자동 셋          │
        │                  │
        └────────┬─────────┘
                 ▼
┌──────────────────────────────────┐
│ 학생: 답변 제출 → WS → IPC        │
│   (기존 흐름, 무변경)              │
└────────────────┬─────────────────┘
                 ▼
┌──────────────────────────────────┐
│ 교사 화면 라이브 카드:              │
│   if (realtimeResponseView)        │
│     → 답변 텍스트/막대 즉시 표시   │
│   else                             │
│     → "학생 제출 완료" 익명 카드   │
│       (현행 동작 100% 유지)        │
└──────────────────────────────────┘
```

### 2.2 IPC 이벤트 페이로드 점검 (사전 검증)

| 도구               | 이벤트                                | 페이로드                                                                   | 답변 텍스트 포함?                                                                                                                      |
| ------------------ | ------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Poll               | `live-vote:student-voted`             | `{ optionId, totalVoters }`                                                | ❌ (옵션 ID — 정상, 객관식이라 텍스트 없음)                                                                                            |
| Survey             | `live-survey:student-submitted`       | `{ text, totalResponders }`                                                | ✅ ([`liveSurvey.ts:189`](e:/github/ssampin/electron/ipc/liveSurvey.ts#L189))                                                          |
| MultiSurvey scroll | `live-multi-survey:student-submitted` | `{ answers: string[], totalResponders }`                                   | ✅ ([`liveMultiSurvey.ts:689-691`](e:/github/ssampin/electron/ipc/liveMultiSurvey.ts#L689))                                            |
| MultiSurvey phase  | `live-multi-survey:student-answered`  | `{ sessionId, nickname, questionIndex, totalAnswered, aggregatedPreview }` | △ (aggregatedPreview에 텍스트 답변 array 포함, [`liveMultiSurvey.ts:214-221`](e:/github/ssampin/electron/ipc/liveMultiSurvey.ts#L214)) |

**결론**: 모든 IPC가 이미 텍스트를 broadcast 중. **서버 측 변경 0건**. 본 PDCA는 100% 렌더러(UI) 작업.

---

## 3. Layer 1 Design — 도메인/상태 필드

### 3.1 ToolPoll

[`ToolPoll.tsx:1115`](e:/github/ssampin/src/adapters/components/Tools/ToolPoll.tsx#L1115) 인근에 새 state 추가:

```diff
  const [showResults, setShowResults] = useState(false);
+ const [realtimeResponseView, setRealtimeResponseView] = useState(false);
```

라이브 시작 핸들러(`onStartLive` 또는 `handleStart`)에서 초기값 동기화:

```typescript
// 라이브 시작 직전
if (realtimeResponseView) {
  setShowResults(true); // 막대그래프 즉시 노출
}
// 라이브 종료 시 showResults 그대로 유지 (사용자가 마지막으로 설정한 값 보존)
```

### 3.2 ToolSurvey

[`ToolSurvey.tsx:924`](e:/github/ssampin/src/adapters/components/Tools/ToolSurvey.tsx#L924) `const [submissions, setSubmissions] = useState<SurveySubmission[]>([])` 인근에 추가:

```diff
  const [submissions, setSubmissions] = useState<SurveySubmission[]>([]);
+ const [realtimeResponseView, setRealtimeResponseView] = useState(false);
```

`SurveySubmission` 타입은 이미 `answers: { questionId: string; text: string }[]`을 포함하므로 변경 불필요.

### 3.3 ToolMultiSurvey

[`ToolMultiSurvey.tsx:1172`](e:/github/ssampin/src/adapters/components/Tools/ToolMultiSurvey.tsx#L1172) `const [submissions, setSubmissions] = useState<MultiSurveySubmission[]>([])` 인근에 추가:

```diff
  const [submissions, setSubmissions] = useState<MultiSurveySubmission[]>([]);
+ const [realtimeResponseView, setRealtimeResponseView] = useState(false);
```

phase 모드(`stepMode=true`)에서도 동일 state 사용. TeacherControlPanel은 prop으로 받음 (§5.3 참조).

### 3.4 ToolTemplate 영속화

[`@domain/entities/ToolTemplate`](e:/github/ssampin/src/domain/entities/ToolTemplate.ts)의 도구별 페이로드 객체에 옵션 필드 추가 (비파괴 확장):

```typescript
interface ToolTemplate {
  // ... 기존 필드
  payload: {
    // poll | survey | multiSurvey 도구별
    realtimeResponseView?: boolean; // 신규, 옵션, 기본값 false
    // ... 기존 필드
  };
}
```

기존 템플릿은 누락 시 `false`로 fallback. 마이그레이션 없음.

---

## 4. Layer 2 Design — 공통 `RealtimeResponseToggle` 컴포넌트

### 4.1 위치

```
src/adapters/components/common/RealtimeResponseToggle.tsx (신규)
```

기존 [`Settings/shared/Toggle.tsx`](e:/github/ssampin/src/adapters/components/Settings/shared/Toggle.tsx)는 단순 스위치만 제공. 본 컴포넌트는 라벨 + 설명 + 경고 카피까지 한 묶음으로 캡슐화해 3도구에서 동일하게 사용.

### 4.2 시그니처

```typescript
interface RealtimeResponseToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** 도구별 미세 카피 차이를 위한 옵션 */
  tool: 'poll' | 'survey' | 'multiSurvey';
  disabled?: boolean;
}

export function RealtimeResponseToggle({
  checked,
  onChange,
  tool,
  disabled,
}: RealtimeResponseToggleProps): JSX.Element;
```

### 4.3 렌더링 (의사 JSX)

```tsx
<div className="bg-sp-card border border-sp-border rounded-xl p-4 flex items-start gap-3">
  <div className="flex-1">
    <label htmlFor={`realtime-toggle-${tool}`} className="block text-sp-text font-medium text-sm">
      {/* 도구별 라벨 통일 */}
      실시간 답변 확인
    </label>
    <p className="text-sp-muted text-xs mt-1 leading-relaxed">
      {tool === 'poll'
        ? '학생 투표가 들어오는 즉시 화면에 표시됩니다. 라이브 시작 시 결과 막대가 처음부터 노출됩니다.'
        : tool === 'survey'
          ? '학생 답변이 도착하는 즉시 교사 화면에 표시됩니다.'
          : '학생 답변이 도착하는 즉시 라이브 화면에 표시됩니다. 객관식 문항은 막대, 주관식은 텍스트로 누적됩니다.'}
      <br />
      <span className="text-amber-400/80">
        ⚠ 학생들에게 화면이 보이지 않는 별도 모니터에서 사용하세요.
      </span>
    </p>
  </div>
  <button
    id={`realtime-toggle-${tool}`}
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label="실시간 답변 확인 토글"
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0
      ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      ${checked ? 'bg-sp-accent' : 'bg-sp-surface'}`}
  >
    <span
      className={`inline-block h-5 w-5 rounded-full bg-white border border-gray-300 transition-transform
        ${checked ? 'translate-x-[22px]' : 'translate-x-[2px]'}`}
    />
  </button>
</div>
```

### 4.4 a11y

- `role="switch"` + `aria-checked` (Settings/shared/Toggle 패턴 재사용)
- `<label htmlFor>` ↔ `<button id>` 연결로 라벨 클릭 시도 토글 (선택적: button에 라벨 클릭 핸들러 직접 연결 권장 — htmlFor는 button에 native 동작 없음)
- Tab으로 포커스 가능, Space/Enter로 토글
- 비활성화 시 `disabled` + opacity 50% + cursor-not-allowed
- 경고 카피는 색상으로만 강조하지 않고 `⚠` 이모지 + amber 색상 + 본문 텍스트 자체에 "별도 모니터" 명시

### 4.5 디자인 토큰

- 배경: `bg-sp-card` (디자인 시스템 v3.2)
- 테두리: `border-sp-border`
- 텍스트: `text-sp-text` / 설명 `text-sp-muted`
- 강조: `bg-sp-accent` (체크 시)
- 경고: `text-amber-400/80` (현재 Tailwind 임시 색 — 추후 `sp-warning` 토큰 정착 시 마이그레이션, 본 PDCA 범위 외)
- 둥글기: `rounded-xl` (카드) / `rounded-full` (스위치)

---

## 5. Layer 3 Design — 3 도구 라이브 화면 카드 분기 렌더링 (정확 JSX diff)

### 5.1 ToolSurvey.tsx 변경

#### 5.1.1 SetupView/메인 영역에 토글 추가

위치: 1인당 글자 수 제한 옵션 컨트롤 아래 (Plan §2.1). 정확 위치는 `SurveyingView` 외부, 라이브 시작 전 설정 화면. 현재 컴포넌트 구조상 `ToolSurvey` 함수 본체에서 `isLiveMode === false` 분기 영역.

```diff
  // 설정 화면 (isLiveMode=false)
  <div className="flex flex-col gap-4">
    {/* 기존 질문 입력 영역 */}
    {/* 기존 maxLength 옵션 */}
+   <RealtimeResponseToggle
+     checked={realtimeResponseView}
+     onChange={setRealtimeResponseView}
+     tool="survey"
+   />
    {/* 기존 학생 설문 시작 버튼 */}
  </div>
```

#### 5.1.2 SurveyingView 카드 텍스트 분기

[`ToolSurvey.tsx:665-678`](e:/github/ssampin/src/adapters/components/Tools/ToolSurvey.tsx#L665) — 라이브 중 카드:

```diff
  submissions.map((sub, idx) => (
    <div
      key={sub.id}
-     className="bg-sp-card border border-sp-border rounded-lg px-4 py-2.5 flex items-center gap-3"
+     className="bg-sp-card border border-sp-border rounded-lg px-4 py-2.5 flex items-start gap-3 min-h-[3rem] animate-fade-in"
    >
      <span className="text-sp-accent font-mono text-sm font-bold">
        #{submissions.length - idx}
      </span>
-     <span className="text-sp-text text-sm">학생 제출 완료</span>
+     {realtimeResponseView ? (
+       <div className="flex-1 min-w-0">
+         {sub.answers.map((a, i) => (
+           <p
+             key={i}
+             className="text-sp-text text-sm line-clamp-2 leading-snug"
+             title={a.text}
+           >
+             {a.text || '(빈 답변)'}
+           </p>
+         ))}
+       </div>
+     ) : (
+       <span className="text-sp-text text-sm">학생 제출 완료</span>
+     )}
      <span className="text-sp-muted text-xs ml-auto shrink-0">
        {new Date(sub.submittedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
    </div>
  ))
```

**Props 전달**: `SurveyingView`에 `realtimeResponseView: boolean` prop 추가:

```diff
  interface SurveyingViewProps {
    questions: SurveyQuestion[];
    submissions: SurveySubmission[];
+   realtimeResponseView: boolean;
    // ... 기존 props
  }
```

[`ToolSurvey.tsx:1278`](e:/github/ssampin/src/adapters/components/Tools/ToolSurvey.tsx#L1278) 인근 호출처에서 `realtimeResponseView={realtimeResponseView}` 전달.

#### 5.1.3 ResultsView는 무변경

세션 종료 후 ResultsView는 항상 전체 답변 표시 (현행). 토글과 무관.

### 5.2 ToolPoll.tsx 변경

#### 5.2.1 SetupView/문항 설정 영역에 토글 추가

문항 옵션 색상 설정 영역 인근. 정확 위치는 Plan에서 "옵션 색상·다중 선택 토글 영역 인접"이라 명시. `ToolPoll` 함수 본체의 `isLiveMode=false` 분기 영역.

```diff
  // 문항 설정 화면
  <div className="flex flex-col gap-4">
    {/* 기존 옵션 색상 / 다중 선택 컨트롤 */}
+   <RealtimeResponseToggle
+     checked={realtimeResponseView}
+     onChange={setRealtimeResponseView}
+     tool="poll"
+   />
    {/* 기존 라이브 시작 버튼 */}
  </div>
```

#### 5.2.2 라이브 시작 시 showResults 동기화

`onStartLive` 또는 동등 핸들러 진입 직후:

```diff
  function handleStartLive() {
    // ... 기존 라이브 시작 로직
+   if (realtimeResponseView) {
+     setShowResults(true);
+   }
    setIsLiveMode(true);
  }
```

#### 5.2.3 "결과 보기" 버튼 호버 툴팁 보강

[`ToolPoll.tsx:935-940`](e:/github/ssampin/src/adapters/components/Tools/ToolPoll.tsx#L935):

```diff
- <button
-   onClick={onToggleResults}
-   className="px-4 py-2 rounded-xl bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-all text-sm font-medium"
- >
-   {showResults ? '\u{1F441}️ 결과 숨기기' : '\u{1F441}️ 결과 보기'}
- </button>
+ <button
+   onClick={onToggleResults}
+   title="라이브 중 즉석 토글 — 문항 설계 시 [실시간 답변 확인]을 켜면 처음부터 켜진 상태로 시작합니다."
+   className="px-4 py-2 rounded-xl bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-all text-sm font-medium"
+ >
+   {showResults ? '\u{1F441}️ 결과 숨기기' : '\u{1F441}️ 결과 보기'}
+ </button>
```

### 5.3 ToolMultiSurvey.tsx 변경

#### 5.3.1 SetupView 토글 — 세션 단위

문항 리스트 위 또는 아래 세션 전역 설정 영역. `ToolMultiSurvey` 본체에서 `phase === 'create'` 영역.

```diff
  // 문항 설계 화면 (phase=create)
  <div className="flex flex-col gap-4">
    {/* 기존 문항 리스트 */}
+   <RealtimeResponseToggle
+     checked={realtimeResponseView}
+     onChange={setRealtimeResponseView}
+     tool="multiSurvey"
+   />
    {/* 기존 학생 설문 시작 / 다음 단계 버튼 */}
  </div>
```

#### 5.3.2 RunningView submission feed 분기 — scroll 모드

[`ToolMultiSurvey.tsx:1100-1106`](e:/github/ssampin/src/adapters/components/Tools/ToolMultiSurvey.tsx#L1100):

```diff
  submissions.map((sub, idx) => (
    <div
      key={sub.id}
-     className="bg-sp-card border border-sp-border rounded-lg px-4 py-2.5 flex items-center gap-3"
+     className="bg-sp-card border border-sp-border rounded-lg px-4 py-2.5 flex items-start gap-3 min-h-[3rem] animate-fade-in"
    >
      <span className="text-sp-accent font-mono text-sm font-bold">
        #{submissions.length - idx}
      </span>
-     {/* 기존 익명 표시 */}
+     {realtimeResponseView ? (
+       <div className="flex-1 min-w-0 flex flex-col gap-1">
+         {sub.answers.map((a, qIdx) => {
+           const q = questions[qIdx];
+           if (!q) return null;
+           return (
+             <div key={qIdx} className="flex items-start gap-2 text-xs">
+               <span className="text-sp-muted shrink-0">Q{qIdx + 1}.</span>
+               <span className="text-sp-text line-clamp-1 flex-1" title={renderAnswerPreview(q, a)}>
+                 {renderAnswerPreview(q, a)}
+               </span>
+             </div>
+           );
+         })}
+       </div>
+     ) : (
+       <span className="text-sp-text text-sm">학생 제출 완료</span>
+     )}
      <span className="text-sp-muted text-xs ml-auto shrink-0">
        {/* 기존 시각 */}
      </span>
    </div>
  ))
```

신규 헬퍼 `renderAnswerPreview(q: EditableQuestion, a: AnswerValue): string`:

- 객관식(single/multi-choice): `option.text` 조회 (다중일 경우 ", "로 join)
- 주관식(text): `a.text` 또는 빈 답변 처리
- 척도(scale): `${a.value}/${q.scaleMax}`

위치: `ToolMultiSurvey.tsx` 내부 또는 별도 헬퍼 파일.

#### 5.3.3 RunningView 비-stepMode 분기

[`ToolMultiSurvey.tsx:1124-1131`](e:/github/ssampin/src/adapters/components/Tools/ToolMultiSurvey.tsx#L1124) 하단 카운트 영역:

```diff
- 📋 <span className="text-sp-text font-bold">{submissions.length}명</span> 응답
+ 📋 <span className="text-sp-text font-bold">{submissions.length}명</span> 응답
+ {realtimeResponseView && (
+   <span className="text-sp-muted text-xs ml-3">실시간 표시 ON</span>
+ )}
```

#### 5.3.4 phase 모드 (TeacherControlPanel)

`stepMode=true` 일 때 [`TeacherControlPanel`](e:/github/ssampin/src/adapters/components/Tools/TeacherControlPanel.tsx)이 `aggregated` prop을 통해 이미 집계를 받음. 본 PDCA 범위 내 변경 최소화 원칙(Plan 비목표):

- TeacherControlPanel 자체는 침습 X. 대신 `realtimeResponseView` prop을 추가로 전달해 패널 내부에서 텍스트 답변 카드의 노출 정도를 결정.
- `realtimeResponseView=false` (현행 동작): 익명 카운트 + 닉네임 list 중심 표시 (기존).
- `realtimeResponseView=true`: 텍스트 답변(`textAnswerDetail`/`aggregated.answers[]`)을 카드 영역에 표시.

```diff
  <TeacherControlPanel
    phase={teacherPhase}
    currentQuestionIndex={teacherQuestionIndex}
    // ... 기존 props
+   realtimeResponseView={realtimeResponseView}
  />
```

TeacherControlPanel 내부 변경(최소):

```diff
  interface TeacherControlPanelProps {
    // ... 기존
+   realtimeResponseView?: boolean;
  }

  // 패널 내부, 주관식 답변 list 렌더링 부분
- {/* 텍스트 답변 익명 카운트 */}
+ {realtimeResponseView ? (
+   <ul>{textAnswerDetail.map((entry, i) => <li key={i}>{entry.text}</li>)}</ul>
+ ) : (
+   <span>{textAnswerDetail.length}명 답변</span>
+ )}
```

정확한 라인 / JSX 변경은 Do 단계에서 `TeacherControlPanel`의 텍스트 답변 영역 코드를 직접 보고 결정. **Design 단계에서는 인터페이스만 명시**.

---

## 6. Layer 4 Design — 시각·애니메이션

### 6.1 fade-in 애니메이션

Tailwind config에 keyframe 추가:

```diff
  // tailwind.config.js (또는 .ts)
  module.exports = {
    // ...
    theme: {
      extend: {
+       keyframes: {
+         'fade-in': {
+           '0%': { opacity: '0', transform: 'translateY(-4px)' },
+           '100%': { opacity: '1', transform: 'translateY(0)' },
+         },
+       },
+       animation: {
+         'fade-in': 'fade-in 200ms ease-out',
+       },
      },
    },
  };
```

각 답변 카드에 `animate-fade-in` 클래스. 신규 카드 등장 시 200ms fade-in. CSS 전용 (JS 애니메이션 라이브러리 미사용 — 저사양 PC 영향 최소).

### 6.2 line-clamp 안정화

```css
/* Tailwind line-clamp-1 / line-clamp-2 — 이미 v3.4 기본 지원 */
```

`line-clamp-1` (MultiSurvey 문항별 요약) / `line-clamp-2` (Survey 답변 본문). `title` 속성으로 호버 시 전체 텍스트 노출.

### 6.3 자동 스크롤 정책

- 라이브 카드 영역의 `overflow-y-auto` 컨테이너. 신규 답변은 `reverse()` (line 665, 1100)로 이미 최신 위에 표시.
- 사용자가 스크롤 위치 조작 중일 때(상단 0이 아닐 때) 자동 스크롤 충돌 방지 위해 자동 스크롤은 **하지 않음**. 신규 답변이 위에 추가되는 형태로 자연 노출.
- 누적 카운트 헤더(`📝 12명 응답`)는 이미 하단에 존재. 답변이 화면을 초과해도 카운트는 항상 보임.

### 6.4 카드 높이 안정화

- `min-h-[3rem]` (3개 텍스트 행 안전 높이) 부착.
- 신규 답변 카드만 `animate-fade-in`. 기존 카드는 layout 재배치 시 애니메이션 없음 (사용자 인지 부담 최소).

---

## 7. Layer 5 Design — 학생 보호 가드 + 1회성 안내 모달

### 7.1 토글 라벨 경고 카피 (확정)

§4.3에 명시된 카피:

> ⚠ 학생들에게 화면이 보이지 않는 별도 모니터에서 사용하세요.

색상: `text-amber-400/80` (Tailwind, sp-warning 토큰 향후 정착 시 마이그레이션 예정).

### 7.2 1회성 안내 모달 — **채택**

토글을 **처음** ON으로 바꿀 때만 안내 모달 1회 노출. 사용자가 이해했다고 확인하면 다시 안 뜸. 사용자 선택지 도구 단위 또는 전역 단위 결정.

**확정**: **전역 1회** (localStorage 키 `ssampin-realtime-response-toggle-warned-v1`). 3 도구 어디서든 처음 ON 시도 시 1회 모달, 이후 모든 도구에서 침묵.

#### 7.2.1 모달 카피

```
제목: 실시간 답변 확인 — 시작 전 확인

본문:
이 옵션을 켜면 학생 답변이 도착하는 즉시 교사 화면에 표시됩니다.

⚠ 학생들이 화면을 볼 수 있는 환경(프로젝터·교실 TV 공유 화면)에서는
권장하지 않아요. 다른 학생 답변이 보이면 공정한 응답이 어려워질 수 있어요.

권장 환경:
- 별도 모니터 (교사 PC만 보임)
- 화면 공유를 일시 끔
- 브레인스토밍·아이스브레이커처럼 답변 공유가 의도된 활동

[취소]  [확인하고 켜기]
```

#### 7.2.2 모달 컴포넌트

기존 [`common/Modal.tsx`](e:/github/ssampin/src/adapters/components/common/Modal.tsx) 사용 (focus-trap-react 기반, 디자인 시스템 정착됨).

```tsx
<Modal isOpen={showWarning} onClose={handleCancel} title="실시간 답변 확인 — 시작 전 확인">
  {/* 본문 */}
  <div className="flex justify-end gap-2 mt-4">
    <Button variant="secondary" onClick={handleCancel}>
      취소
    </Button>
    <Button variant="primary" onClick={handleConfirm}>
      확인하고 켜기
    </Button>
  </div>
</Modal>
```

#### 7.2.3 흐름

```
사용자 토글 클릭 (OFF → ON)
  ↓
localStorage.getItem('ssampin-realtime-response-toggle-warned-v1') === 'true' ?
  ├── Yes → 즉시 setRealtimeResponseView(true) (모달 스킵)
  └── No  → showWarning=true (모달 표시)
              ├── [취소] → setRealtimeResponseView(false) (롤백)
              └── [확인하고 켜기]
                    → setRealtimeResponseView(true)
                    → localStorage.setItem('ssampin-realtime-response-toggle-warned-v1', 'true')
                    → showWarning=false
```

#### 7.2.4 토글 OFF 동작

OFF로 되돌릴 때는 모달 없음. 즉시 `setRealtimeResponseView(false)`.

### 7.3 `RealtimeResponseToggle` 내부에서 모달 관리

토글 컴포넌트 자체에 모달 로직 캡슐화 — 3 도구가 동일 동작 보장. 모달 컴포넌트 임포트는 `RealtimeResponseToggle.tsx` 내부.

```tsx
export function RealtimeResponseToggle({ checked, onChange, tool, disabled }: Props) {
  const [showWarning, setShowWarning] = useState(false);

  const handleClick = () => {
    const next = !checked;
    if (next && localStorage.getItem(WARN_KEY) !== 'true') {
      setShowWarning(true);
    } else {
      onChange(next);
    }
  };

  const handleConfirm = () => {
    localStorage.setItem(WARN_KEY, 'true');
    onChange(true);
    setShowWarning(false);
  };

  const handleCancel = () => {
    setShowWarning(false);
    // onChange 호출 안 함 — 토글 OFF 상태 유지
  };

  return (
    <>
      {/* 토글 UI */}
      {showWarning && (
        <RealtimeResponseWarningModal onConfirm={handleConfirm} onCancel={handleCancel} />
      )}
    </>
  );
}
```

---

## 8. Layer 6 Design — 단위/통합/메타 테스트 시그니처

### 8.1 단위 테스트 — `RealtimeResponseToggle.test.tsx` (신규)

```typescript
describe('RealtimeResponseToggle', () => {
  beforeEach(() => localStorage.clear());

  it('renders role=switch + aria-checked=false initially', () => {
    const onChange = vi.fn();
    render(<RealtimeResponseToggle checked={false} onChange={onChange} tool="survey" />);
    const sw = screen.getByRole('switch');
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });

  it('first ON click shows warning modal, does not call onChange immediately', () => {
    const onChange = vi.fn();
    render(<RealtimeResponseToggle checked={false} onChange={onChange} tool="survey" />);
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByText(/시작 전 확인/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('confirm in modal calls onChange(true) + writes localStorage', () => {
    const onChange = vi.fn();
    render(<RealtimeResponseToggle checked={false} onChange={onChange} tool="survey" />);
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByText('확인하고 켜기'));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(localStorage.getItem('ssampin-realtime-response-toggle-warned-v1')).toBe('true');
  });

  it('after warned once, subsequent ON skips modal', () => {
    localStorage.setItem('ssampin-realtime-response-toggle-warned-v1', 'true');
    const onChange = vi.fn();
    render(<RealtimeResponseToggle checked={false} onChange={onChange} tool="poll" />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.queryByText(/시작 전 확인/)).toBeNull();
  });

  it('cancel in modal keeps OFF, does not write localStorage', () => {
    const onChange = vi.fn();
    render(<RealtimeResponseToggle checked={false} onChange={onChange} tool="multiSurvey" />);
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByText('취소'));
    expect(onChange).not.toHaveBeenCalled();
    expect(localStorage.getItem('ssampin-realtime-response-toggle-warned-v1')).toBeNull();
  });

  it('OFF click never shows modal', () => {
    localStorage.setItem('ssampin-realtime-response-toggle-warned-v1', 'true');
    const onChange = vi.fn();
    render(<RealtimeResponseToggle checked={true} onChange={onChange} tool="survey" />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText(/시작 전 확인/)).toBeNull();
  });
});
```

### 8.2 통합 테스트 — `ToolSurvey.realtimeResponseView.test.tsx` (신규)

```typescript
describe('ToolSurvey realtime response view', () => {
  it('OFF: SurveyingView card shows "학생 제출 완료" instead of answer text', () => {
    const submissions = [
      { id: 'a', answers: [{ questionId: 'q1', text: '안녕하세요' }], submittedAt: Date.now() },
    ];
    render(<SurveyingView submissions={submissions} realtimeResponseView={false} {...defaultProps} />);
    expect(screen.getByText('학생 제출 완료')).toBeInTheDocument();
    expect(screen.queryByText('안녕하세요')).toBeNull();
  });

  it('ON: SurveyingView card shows answer text', () => {
    const submissions = [
      { id: 'a', answers: [{ questionId: 'q1', text: '안녕하세요' }], submittedAt: Date.now() },
    ];
    render(<SurveyingView submissions={submissions} realtimeResponseView={true} {...defaultProps} />);
    expect(screen.getByText('안녕하세요')).toBeInTheDocument();
    expect(screen.queryByText('학생 제출 완료')).toBeNull();
  });

  it('empty answer falls back to "(빈 답변)"', () => {
    const submissions = [
      { id: 'a', answers: [{ questionId: 'q1', text: '' }], submittedAt: Date.now() },
    ];
    render(<SurveyingView submissions={submissions} realtimeResponseView={true} {...defaultProps} />);
    expect(screen.getByText('(빈 답변)')).toBeInTheDocument();
  });
});
```

ToolPoll / ToolMultiSurvey도 동등한 통합 테스트 (총 3 도구 × 핵심 분기 2건 = 6 케이스).

### 8.3 메타 테스트 — `__tests__/regression/survey-realtime-response.test.ts` (신규)

grep 기반 회귀 차단:

```typescript
import { readFileSync } from 'node:fs';

const FILES = [
  'src/adapters/components/Tools/ToolPoll.tsx',
  'src/adapters/components/Tools/ToolSurvey.tsx',
  'src/adapters/components/Tools/ToolMultiSurvey.tsx',
];

describe('regression: realtime response view toggle branches', () => {
  for (const file of FILES) {
    it(`${file} contains realtimeResponseView state`, () => {
      const src = readFileSync(file, 'utf-8');
      expect(src).toMatch(/realtimeResponseView/);
    });

    it(`${file} imports RealtimeResponseToggle`, () => {
      const src = readFileSync(file, 'utf-8');
      expect(src).toMatch(/RealtimeResponseToggle/);
    });
  }

  it('RealtimeResponseToggle component has warning modal logic', () => {
    const src = readFileSync('src/adapters/components/common/RealtimeResponseToggle.tsx', 'utf-8');
    expect(src).toMatch(/ssampin-realtime-response-toggle-warned-v1/);
    expect(src).toMatch(/role="switch"/);
  });
});
```

### 8.4 lint/typecheck

- `npx tsc -b` 0 errors
- `npm run lint` 0 errors (no new `no-restricted-imports`, no `any` types)

---

## 9. a11y / 디자인 토큰 점검 매트릭스

| 항목                             | 토큰/속성                                                        | 검증                                   |
| -------------------------------- | ---------------------------------------------------------------- | -------------------------------------- |
| 토글 role                        | `role="switch"`                                                  | ✅ 본 Design                           |
| 토글 상태                        | `aria-checked`                                                   | ✅                                     |
| 키보드                           | Tab 포커스 + Space/Enter                                         | ✅ (button native)                     |
| 라벨 연결                        | `htmlFor` + button id (또는 label이 button 자식)                 | ✅                                     |
| 경고 카피 색상 의존 안 함        | `⚠` 이모지 + 본문 텍스트                                         | ✅                                     |
| 모달 focus-trap                  | `Modal.tsx` 기존 패턴                                            | ✅                                     |
| 카드 호버 툴팁                   | `title` 속성                                                     | ✅                                     |
| line-clamp 후 전체 텍스트 접근성 | `title` 또는 클릭 시 펼치기                                      | ✅ (`title`)                           |
| 디자인 토큰                      | `sp-card`/`sp-border`/`sp-accent`/`sp-text`/`sp-muted` 모두 v3.2 | ✅                                     |
| 임시 색 (sp-warning 부재)        | `amber-400/80` Tailwind 임시                                     | △ — 후속 토큰 정착 시 마이그레이션     |
| 다크 모드                        | 기본 다크 (sp-card 등)                                           | ✅ — 라이트 모드 미지원 (전체 앱 동일) |

---

## 10. 인수 기준 (RG-01 ~ RG-10) 시나리오 detail

Plan §6의 인수 기준을 Design 변경에 맞춰 정확한 시나리오로 확장.

### 10.1 RG-01 (Survey OFF)

1. ToolSurvey 진입, 질문 1개 입력.
2. `RealtimeResponseToggle` 그대로 OFF.
3. "📱 학생 설문" 클릭.
4. 학생 화면(`localhost:port`)에서 텍스트 "안녕하세요" 제출.
5. **Expected**: 교사 화면 카드에 `#1 학생 제출 완료 [시각]`. "안녕하세요" 텍스트는 안 보임.

### 10.2 RG-02 (Survey ON)

1. ToolSurvey 진입, 질문 1개 입력.
2. `RealtimeResponseToggle` ON 클릭 → 1회성 안내 모달 노출 → "확인하고 켜기".
3. localStorage 키 셋. 토글 ON.
4. "📱 학생 설문" 클릭. 학생이 "안녕하세요" 제출.
5. **Expected**: 교사 화면 카드에 `#1 안녕하세요 [시각]`. 2초 이내 표시. fade-in 200ms.

### 10.3 RG-03 (Survey ON, 200자 초과)

1. RG-02 setup.
2. 학생이 250자 답변 제출.
3. **Expected**: 카드에 첫 2행만 노출 (line-clamp-2). `title` 속성에 전체 텍스트. 호버 시 브라우저 기본 툴팁.

### 10.4 RG-04 (Survey 결과 보기)

1. RG-01 또는 RG-02 끝까지.
2. "설문 종료 → 결과 보기" 클릭.
3. **Expected**: ResultsView는 토글 상태와 무관하게 모든 답변 텍스트 표시 (현행 동작 100% 유지).

### 10.5 RG-05 (Poll ON)

1. ToolPoll 진입, 옵션 3개 입력.
2. 토글 ON → 모달 → 확인.
3. "📱 학생 설문" 클릭.
4. **Expected**: 라이브 시작 즉시 `showResults=true`. 막대그래프 + 카운트 0표 표시(`0표`). 학생 1명 투표 → 해당 옵션 막대 +1, fade-in 효과.

### 10.6 RG-06 (Poll OFF, 수동 결과 보기 가능)

1. ToolPoll 진입, 토글 OFF (기본).
2. 라이브 시작.
3. **Expected**: `showResults=false`. 막대 숨김. "👁️ 결과 보기" 버튼 호버 → 툴팁 "라이브 중 즉석 토글 — 문항 설계 시...".
4. 버튼 클릭 → 막대 노출 (현행 동작 보존).

### 10.7 RG-07 (Poll 직접 입력 학생 익명)

1. ToolPoll 직접입력 옵션 활성.
2. 토글 ON.
3. 학생이 "철수"라는 직접 입력 답변 제출.
4. **Expected**: 옵션 막대 +1. 작성자 학생 ID/이름 익명 (현행 비목표). 본 PDCA는 답변 내용만 노출, 작성자 식별 미지원.

### 10.8 RG-08 (MultiSurvey scroll ON)

1. ToolMultiSurvey 진입, scroll 모드 (stepMode=false 기본).
2. 문항 3개 (객관식 + 주관식 + 척도).
3. 토글 ON → 모달 → 확인.
4. 학생 1명 모든 문항 답변 제출.
5. **Expected**: 카드에 `Q1. 옵션B / Q2. 안녕 / Q3. 4/5` 형태 미리보기. 각 줄 line-clamp-1, title 전체.

### 10.9 RG-09 (MultiSurvey phase ON)

1. stepMode=true 모드.
2. 토글 ON → 모달 → 확인.
3. 문항 진행 + 학생 답변.
4. **Expected**: TeacherControlPanel 내부 텍스트 답변 영역에 답변 내용 표시. `realtimeResponseView` prop이 패널에 전달돼 분기 작동.

### 10.10 RG-10 (MultiSurvey 객관식/주관식 혼합)

1. RG-08 setup, 객관식 + 주관식 혼합.
2. **Expected**: 객관식은 옵션 텍스트, 주관식은 답변 텍스트, 척도는 `값/최대` 표기. `renderAnswerPreview` 헬퍼가 타입별 분기.

---

## 11. 변경 파일 목록 (Do 단계 사전 확인)

| 파일                                                                          | 변경 종류                                                                   | 우선순위 |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------- |
| `src/adapters/components/common/RealtimeResponseToggle.tsx`                   | 신규                                                                        | P0       |
| `src/adapters/components/common/RealtimeResponseWarningModal.tsx`             | 신규 (또는 Toggle 내부 inline)                                              | P0       |
| `src/adapters/components/Tools/ToolPoll.tsx`                                  | state + setup UI + showResults sync + title 툴팁                            | P0       |
| `src/adapters/components/Tools/ToolSurvey.tsx`                                | state + setup UI + SurveyingView 분기 + props 전달                          | P0       |
| `src/adapters/components/Tools/ToolMultiSurvey.tsx`                           | state + setup UI + RunningView 분기 + 헬퍼 + TeacherControlPanel props 전달 | P0       |
| `src/adapters/components/Tools/TeacherControlPanel.tsx`                       | props 1개 + 텍스트 답변 분기 (최소 변경)                                    | P0       |
| `src/domain/entities/ToolTemplate.ts` (또는 동등 타입)                        | 옵션 필드 추가 (비파괴)                                                     | P1       |
| `tailwind.config.{js,ts}`                                                     | `fade-in` keyframe + animation                                              | P1       |
| `src/adapters/components/common/RealtimeResponseToggle.test.tsx`              | 신규 (6 케이스)                                                             | P0       |
| `src/adapters/components/Tools/ToolSurvey.realtimeResponseView.test.tsx`      | 신규 (3 케이스)                                                             | P0       |
| `src/adapters/components/Tools/ToolPoll.realtimeResponseView.test.tsx`        | 신규 (3 케이스)                                                             | P0       |
| `src/adapters/components/Tools/ToolMultiSurvey.realtimeResponseView.test.tsx` | 신규 (3 케이스)                                                             | P0       |
| `__tests__/regression/survey-realtime-response.test.ts`                       | 신규 메타 테스트                                                            | P0       |

**무변경 영역 (비파괴 보장)**:

- `electron/ipc/liveVote.ts`, `electron/ipc/liveSurvey.ts`, `electron/ipc/liveMultiSurvey.ts` (IPC 서버)
- `electron/ipc/liveVoteHTML.ts`, `liveSurveyHTML.ts`, `liveMultiSurveyHTML.ts` (학생 화면)
- `src/adapters/components/Tools/MultiSurveyLiveBoard/*` (별도 전체화면 보드 — 기존 토글 유지)
- `src/adapters/components/Tools/ToolWordCloud.tsx` (Reference만)

---

## 12. 다음 단계

1. **이 Design 사용자 승인** — Plan 미결 2건 확정 결과(세션 단위 통일, 신규 토글 상위), 1회성 안내 모달 채택, `RealtimeResponseToggle` 컴포넌트 단일 위치 모두 OK인지 확인.
2. **bkit:design-validator** Plan/Design 일관성 검증.
3. **Do 단계** — `/pdca do survey-realtime-response-view`
   - D-01 `RealtimeResponseToggle` + Modal 신규 + 단위 테스트
   - D-02~06 3 도구 차례 통합 (도구별 PR 분리 가능)
   - D-07 TeacherControlPanel 최소 prop 추가 (실제 라인 확인 후)
   - D-08 fade-in keyframe + line-clamp 안정화
   - D-09~11 테스트 작성
   - 메타 테스트 추가
   - 챗봇 KB / 노션 가이드 갱신
   - 묶음 릴리즈 후보 점검

---

> **Status**: Draft v0.1 — 사용자 승인 대기 중. 승인 후 `bkit:design-validator` 검증 → `/pdca do survey-realtime-response-view`.
