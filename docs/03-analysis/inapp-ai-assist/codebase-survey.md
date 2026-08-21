# 인앱 AI 쌤핀 AI — 착수 전 코드 조사 (2026-08-21)

계획서 `docs/01-plan/features/in-app-chatbot-zen.plan.md` 가 전제로 삼은 코드 사실을 **실제 파일을 열어 검증**한 결과.
목적은 "계획서가 맞게 쓰였는가"를 확인하고, 착수 시 **추측 없이** 손댈 지점을 확정하는 것이다.

> **가장 중요한 결론 3줄**
>
> 1. **관련 코드는 아직 0줄이다.** `src/adapters/components/Assist/`·`assertNoPii`·`sanitizeToolResult` 등 계획서가 제안한 파일은 **전부 미존재**(`find` 0건). 계획 단계가 맞다.
> 2. **1등급 도구 4종이 읽을 "집계 함수"가 하나도 없다.** 스토어는 원시 배열만 들고 있다 → 계획서가 "신규"라고 표기한 것이 **사실로 확인됨**. 이게 Phase 1의 실제 작업량이다.
> 3. **계획서의 전제 하나가 틀렸다** — 아래 §7 "정정" 참조(옆핀은 밀어내기 패턴이 아니다).

---

## 1. 기존 고객지원 챗봇 (`HelpChat`) — 새 패널이 **닮으면 안 되는** 것

`src/adapters/components/HelpChat/`

| 파일                  | 역할                                           |
| --------------------- | ---------------------------------------------- |
| `HelpChatPanel.tsx`   | 최상위. 플로팅 버튼 + 열림 상태                |
| `HelpChatWindow.tsx`  | 헤더 + 메시지 목록 + 입력/에스컬레이션 폼      |
| `HelpChatInput.tsx`   | 입력 + 이미지 첨부(최대 3장, 드래그·붙여넣기)  |
| `HelpChatMessage.tsx` | 버블 렌더 (간이 마크다운 파서, XSS 이스케이프) |
| `useHelpChat.ts`      | 상태·네트워크 로직 훅                          |

- **마운트**: `src/App.tsx:72` import → `src/App.tsx:1315` `<HelpChatPanel />`. **전용 단축키 없음.**
- **렌더 형태**: 모달도 사이드패널도 아닌 **우하단 fixed 오버레이** — `HelpChatPanel.tsx:136-141` `fixed bottom-16 right-4 z-50`. 포털 미사용, App 트리 안에 직접 렌더. **본문을 덮는다.**
- **상태**: 전용 스토어 없음. `useHelpChat.ts:101-104` 로컬 `useState`(`messages`·`status`·`escalationType`·`isOnline`). 열림 여부는 `HelpChatPanel.tsx:11` 로컬 `useState`. 외부 참조는 `useSettingsStore`의 `settings.showChatbot` 하나뿐(`HelpChatPanel.tsx:5,10`).
- **★스트리밍 없음** — `useHelpChat.ts:297-328` 이 일반 `fetch` POST 후 `res.json()` 으로 **한 번에** 받는다.
- **실패 처리**: 429(`useHelpChat.ts:318-322`), 네트워크 오류 시 오프라인 FAQ 폴백(`347-358`), 로딩 중 `<HelpTypingIndicator />`(`HelpChatWindow.tsx:164`).
- **서버**: `useHelpChat.ts:17-18` — `ssampin-chat` · `ssampin-escalate` 두 Edge Function.

**시사점**: 새 쌤핀 AI는 ①**밀어내는** 도킹 패널 ②**스트리밍 있음** ③**도구 호출** 이라는 세 가지가 전부 다르다. 계획서 §5.0의 "다른 물건이다"는 서술이 코드로 뒷받침된다. **HelpChat 코드를 재사용하지 말고 참고만 할 것.**

---

## 2. 명령 팔레트 — 진입점이자 **건드리면 안 되는 경계**

`src/adapters/components/common/CommandPalette/`

| 파일                     | 비고                |
| ------------------------ | ------------------- |
| `CommandPalette.tsx`     | UI 본체             |
| `useCommandPalette.ts`   | 열림 상태 + 단축키  |
| `commandRegistry.ts`     | 명령 목록 빌드·필터 |
| `CommandPaletteHint.tsx` | 힌트 배너           |

- **단축키**: `useCommandPalette.ts:20` — `(e.ctrlKey || e.metaKey) && e.key === 'k'`. `window` 전역 `keydown`(`17-35`).
  - ⚠️ 주석은 "input/textarea 포커스 중에도 작동"이라 적혀 있으나 **포커스를 검사하는 코드는 없다.** 전역이라 항상 반응할 뿐이다. 주석을 근거로 "예외 처리가 있다"고 판단하지 말 것.
- **매칭**: `CommandPalette.tsx:83-85` `buildDefaultCommands()` → `filterAndGroupCommands(commands, query, recentIds)`. 0건이면 `CommandPalette.tsx:29-35` "일치하는 명령을 찾을 수 없습니다"(`:32`).
- **현재 AI 연결 0건.** 계획서 §5.1.4·§6.4가 제안한 "매칭 0건 + 질문형일 때만 항목 1개 추가"는 **아직 없다.**

**경계**: 계획서 성공 기준 11 = "매칭이 있는 질의에서는 아무 변화가 없다". `filterAndGroupCommands` 의 기존 결과 경로를 **건드리지 말고**, 0건 분기에만 항목을 더하는 형태여야 한다.

---

## 3. 재사용 자산

### 3.1 `sp-*` 토큰 — 실제 정의는 `docs/design-system.md` 보다 **훨씬 많다**

정의: `src/index.css:17-98` (`:root` = 라이트, 테마별 재정의는 `.theme-*` 셀렉터)

| 갈래   | 변수                                                                                                                                                                                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 색     | `--sp-bg` `--sp-surface-base`/`--sp-surface` `--sp-card-base`/`--sp-card` `--sp-border` `--sp-accent` `--sp-accent-fg` `--sp-highlight` `--sp-info` `--sp-success` `--sp-warning` `--sp-error` `--sp-text` `--sp-muted` `--sp-widget-rgb` `--sp-today-bg` |
| 카드   | `--sp-card-radius` `--sp-card-gap` `--sp-card-border` `--sp-card-shadow`                                                                                                                                                                                  |
| 반경   | `--sp-radius-xs/sm/md/lg/xl/pill`                                                                                                                                                                                                                         |
| 그림자 | `--sp-shadow-none/sm/md/lg/accent`                                                                                                                                                                                                                        |
| 굵기   | `--sp-weight-normal/medium/semibold/bold`                                                                                                                                                                                                                 |
| 모션   | `--sp-duration-quick/base/slow` · `--sp-ease-out` `--sp-ease-out-cubic` `--sp-ease-in-out`                                                                                                                                                                |
| 보드   | `--sp-board-sticky-*` `--sp-board-template-cell` `--sp-board-group-*`                                                                                                                                                                                     |
| 폰트   | `--sp-font-family`                                                                                                                                                                                                                                        |

**★`docs/design-system.md` 에는 색 8개만 적혀 있다.** 반경·그림자·모션 토큰의 존재를 모르고 설계하면 하드코딩이 생긴다. **설계 시 `src/index.css` 를 정본으로 볼 것.**

### 3.2 사이드바 — 진입점 자리

`src/adapters/components/Layout/Sidebar.tsx`

- 로고 `260-310` → `<nav>` 내비 `313-383`(`NAV_ITEMS` 기반) → 하단 블록 `386-461`
- 하단 블록 구성: `SyncStatusBar` · `DriveSyncIndicator` · 설정 `389-403` · 프로필 `405-421` · 추천 `423-434` · 건의 `436-445` · 버전 `447-460`
- **넣을 자리**: `386` `<div className="... border-t border-sp-border">` 안, **설정 버튼과 같은 패턴**.
- `NAV_ITEMS`(`85-98`)에 "쌤핀 AI"는 **없음**(신규).
- 참고: `Sidebar.tsx:180` 이 `useStudentStore((s) => s.students.length)` 로 **컴포넌트가 직접 배열 길이를 센다** — 이 저장소의 기존 관례.

### 3.3 공용 모달·패널

- `<ModalCoordinator />` 가 `App.tsx` 에서 사용됨(존재 확인). 내부 구조는 **미확인**.
- 범용 Modal/Drawer 의 정확한 경로·props 는 **미확인** → 설계 확정 전에 `src/adapters/components/common/` 전수 확인 필요.

---

## 4. 1등급 도구가 읽을 데이터 — **집계 함수가 하나도 없다**

| 도구                     | 데이터 위치                                                                                                                                                                                                                      | 집계 함수                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `get_attendance_summary` | 전용 스토어 못 찾음. usecase `src/usecases/classManagement/ManageAttendance.ts`(`stampChangedRecords` `:38`, `buildAttendanceSaveData` `:61`) · 규칙 `src/domain/entities/Attendance.ts` · `src/domain/rules/attendanceRules.ts` | **없음** (위 두 함수는 저장용)                                   |
| `get_records_stats`      | `src/adapters/stores/useStudentRecordsStore.ts`(`:27` `:266`) · `src/usecases/classManagement/ManageObservations.ts`(`buildObservationSaveData` `:26`)                                                                           | **없음** (카테고리별 건수 집계 미존재)                           |
| `list_classes`           | `src/adapters/stores/useTeachingClassStore.ts` — `classes: readonly TeachingClass[]`(`:57-58`), `useTeachingClassStore`(`:184`)                                                                                                  | 목록은 있으나 **요약 반환 함수 없음** (원본 객체 그대로 사용 중) |
| `get_my_todos`           | `src/adapters/stores/useTodoStore.ts`(`TodoState` `:8`, `useTodoStore` `:64`)                                                                                                                                                    | **없음** (마감 임박 집계 미존재)                                 |
| `count_students`         | `src/adapters/stores/useStudentStore.ts`(`:75`)                                                                                                                                                                                  | **없음** (컴포넌트가 `.length` 직접 계산)                        |

**→ 계획서 §4.2가 이 4종을 "신규"로 표기한 것은 사실이다.** 그리고 이것이 **Phase 1의 진짜 작업량**이다 — 도구를 "연결"하는 게 아니라 **집계 유스케이스를 새로 만드는 것**이다.

**설계상 이점**: 집계 함수를 새로 만든다는 것은 **반환 스키마를 처음부터 1등급으로 설계할 수 있다**는 뜻이다. 기존 함수를 깎아내는 것보다 안전하다(계획서 §4.4 그물 ②의 "삭제가 아니라 화이트리스트 재구성" 원칙과 맞물린다).

---

## 5. AI 브릿지의 선례 — 그대로 베낄 만한 패턴이 있다

`get_weekly_summary` 는 **이 저장소가 아니라 `E:\github\ssampin-ai-bridge`** 에 있다(본체 `grep` 0건).

- `packages/mcp/src/server.ts:343` 도구 등록 · `:358` `runTool(...)`
- `packages/mcp/test/weeklySummary.mcp.test.ts:53` — `readOnlyHint === true` 를 **테스트로 강제**
- 같은 파일 `59-65` — 마스터 스위치 OFF 시 **fail-closed**(`available === false`, `counts`/`range`/`byCategory` 전부 `undefined`) 검증
- 같은 파일 `17-35` — **함정 픽스처**: 실명(`박지훈`)·전화번호(`010-9999-8888`)를 할 일 제목·카테고리에 **의도적으로 심어** 새는지 확인. 주석에 "탈식별 대상" 명시
- `:8` — `import { buildSecretCorpus, readStudents, scanForLeaks } from '@ssampin-ai-bridge/core'` (PII 스캔 유틸이 `core` 에 있음)

**본체에 이미 있는 PII 자산**: `src/domain/privacy/` — `keywordMask.ts` · `maskRules.ts` · `maskEngine.ts`(+`.test.ts`) · `types.ts`.
소비처: `src/adapters/components/common/RealtimeResponseToggle.regression.test.ts` · `src/usecases/classroomAgreement/classroomAgreementSecurityRegression.test.ts`.

**미존재 확인**(`find` 0건): `assertNoPii` · `sanitizeToolResult` · `AssistTool.ts` · `nameRedaction.ts` · `reidentificationRisk.ts` · `src/adapters/components/Assist/*`.

---

## 6. 옵트인·설정 — **선례가 정확히 있다**

### 6.1 설정 탭 구조

`src/adapters/components/Settings/SettingsSidebar.tsx:24-121` — 5그룹 18탭

| 그룹        | 탭 id                                                                    |
| ----------- | ------------------------------------------------------------------------ |
| 기본 정보   | `school` `period`                                                        |
| 화면 구성   | `display` `widget` `sidebar`                                             |
| 기능별 설정 | `calendar` `todo` `seat` `weather` `record-reminder` `tools` `shortcuts` |
| 연동·백업   | `google` **`ai-bridge`** `backup` `archive`                              |
| 시스템      | `security` `system` `about`                                              |

- **★`SettingsSidebar.tsx:17` 주석**: "탭 id·라벨은 딥링크(`settings#widget`)와 사용자 가이드(`/docs`)가 참조하므로 바꾸지 않는다"
- 계약 테스트 존재: `src/adapters/components/Settings/__tests__/settingsTabIds.test.ts`
- **→ 새 탭을 만들지 말고 기존 `ai-bridge` 탭(라벨 "AI 연결", `:82-86`) 안에 카드를 추가한다.** 관련 파일: `tabs/AiBridgeTab.tsx` · `aiBridge/AiBridgeCard.tsx`(존재 확인, 내용 미열람).

### 6.2 "기본 꺼짐 + 최초 1회 안내" 선례 — `useAiBridgeConsentStore`

`src/adapters/stores/useAiBridgeConsentStore.ts`

- `:21` `AI_BRIDGE_NOTICE_VERSION = 1` — **고지문 버전**
- `:24` `HighRiskGate = 'allowGradeWrite' | 'allowRecordWrite'`
- `:55-62` `needsConsent()` — 해당 **학기 + 고지문 버전** 조합 기록이 없으면 `true`
- `:73-76` `acknowledge()` — 확인 시각을 `localStorage` 영속(`persist`, `:81-85` `ssampin-aibridge-consent-v1`)
- `:6-17` 설계 의도 주석: "같은 학기·같은 버전 안에서는 반복해서 묻지 않는다"(경고 피로 회피), "학기가 바뀌거나 버전이 오르면 다음 첫 ON 시 1회 재확인"
- 테스트: `__tests__/useAiBridgeConsentStore.test.ts`

**→ 구조·API 를 그대로 재사용할 수 있다.** ADR-061 결정 7이 요구하는 "학습 이용 고지"는 **고지문 버전을 올리는 것**으로 재고지가 자동 처리된다.

---

## 7. ★계획서 전제 정정 2건

### 정정 1 — 옆핀은 "밀어내기" 선례가 아니다

계획서가 도킹 패널의 근거로 옆핀을 언급하지만, **옆핀은 별도 `BrowserWindow`** 다
(`src/adapters/components/SidePin/` · `electron/sidePin*.ts` · `src/usecases/sidePin/`,
`src/domain/services/resolveSidePinTransition.ts:45` `SIDE_PIN_COLLAPSE_DELAY_MS = 400`).

**진짜 선례는 사이드바다**: `src/App.tsx:1241` `<div className="flex flex-1 min-h-0">` 안에
`<Sidebar/>`(`:1243`)와 본문(`:1255`, 내부 `<main className="flex-1 min-h-0 overflow-y-auto">` `:1259`)이
**flex row 형제**로 놓여 있다. **본문 오른쪽에 형제를 하나 더 두면 같은 패턴이 된다.**

### 정정 2 — 계획서 §7의 결과 경로가 틀렸다

계획서 줄 874: `docs/03-analysis/in-app-chatbot-zen/`
**실제**: `docs/03-analysis/opencode-zen-phase0/`

---

## 8. 아직 확인 못 한 것 (착수 전 확인 필요)

- 범용 Modal/Panel/Drawer 컴포넌트의 경로·props 시그니처
- `commandRegistry.ts` 내부 로직(0건 분기에 항목을 더하는 정확한 지점)
- `AiBridgeTab.tsx`·`AiBridgeCard.tsx` 의 실제 UI 구조(카드 추가 형태를 맞추려면 필요)
- `ssampin-ai-bridge` 의 `summaryTools.ts` egress 구현과 `@ssampin-ai-bridge/core` 의 `scanForLeaks`
- 도킹 폭 기준(1280/1024px)의 실측 근거 — **계획서에도 실측 기록 없음**(§14 Q11 미해결)

---

## 9. `_shared/chatLlm.ts` — 재사용할 패턴과 **재사용 못 하는 이유**

`supabase/functions/_shared/chatLlm.ts` (212줄). ADR-048로 만들어진 **답변 생성 전용** 공통 계층.

### 공개 계약

```ts
export type ReasoningLevel = 'minimal' | 'low';
export interface LlmTurn {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}
export interface GenerateTextOptions {
  readonly system?: string; // 시스템 지시
  readonly turns: readonly LlmTurn[]; // 대화 순서, 마지막이 이번 질문
  readonly temperature: number;
  readonly maxOutputTokens: number; // '답변' 길이 상한 (추론 토큰은 자동 가산)
  readonly reasoning: ReasoningLevel;
  readonly timeoutMs: number;
  readonly stage: string; // 로그 식별용 (hyde/rerank/answer). 사용자 입력 금지
}
```

동작: **업스테이지 우선 → 실패 시 Gemini 자동 폴백**. 업스테이지는 OpenAI 호환
`POST {base}/chat/completions`, `Authorization: Bearer`, 응답 `choices[0].message.content`.

### 환경변수 (그대로 따를 패턴)

`UPSTAGE_API_KEY` · `UPSTAGE_MODEL`(기본 `solar-pro3`) · `UPSTAGE_BASE_URL`(기본 `https://api.upstage.ai/v1`)
· `GOOGLE_API_KEY` · `GEMINI_MODEL`

**★공급자·모델·엔드포인트가 전부 환경변수다** — ADR-061 결정 5의 "코드에 박지 않는다"가 이미 이 파일에서 지켜지고 있다. 새 함수도 같은 형태로 만든다.

### ★★그대로 쓸 수 없는 이유 — **도구 호출을 지원하지 않는다**

`UpstageRequestBody` 는 `model` · `messages` · `temperature` · `max_tokens` · `reasoning_effort` 뿐이고
**`tools` / `tool_choice` 필드가 없다.** 반환도 `choices[0].message.content` 문자열만 꺼내고
`message.tool_calls` 를 보지 않는다. 스트리밍(SSE)도 없다.

→ **인앱 AI는 별도 호출 계층이 필요하다.** 계획서 §6.6이 새 파일을 두기로 한 것은 옳다.
다만 이름은 `zenLlm.ts` 가 아니라 공급자 중립 또는 업스테이지 기준으로 바꾼다(US-002).

### ★건드리면 안 되는 이유

`chatLlm.ts` 는 **운영 중인 고객지원 챗봇의 심장**이다(ssampin-chat 3곳에서 사용: HyDE·재정렬·최종 답변).
여기에 `tools` 를 얹으면 챗봇 회귀 위험이 생긴다. 계획서 성공 기준 10("기존 고객지원 챗봇이 코드·동작 모두 무회귀")을
지키려면 **이 파일은 읽기만 한다.**

### 알아둘 함정 2건 (ADR-048에서 기록됨)

1. **추론 모델의 `max_tokens` 는 '생각' 토큰까지 포함한다.** 답변 예산을 그대로 넘기면 생각하다 예산이
   떨어져 **빈 답변**이 나온다. 그래서 `REASONING_TOKEN_HEADROOM = 4096` 을 더한다(`chatLlm.ts:34`).
   실측: `solar-pro3` 는 `reasoning_effort: 'low'` 에서도 reasoning_tokens 0, `solar-pro4` 는 한 줄 질문에 990.
2. **폴백이 설정 실수를 삼킨다.** 모델을 비추론 계열로 잘못 끼워 400이 나면 조용히 Gemini 로 넘어가
   "잘 되는 줄" 안다. 그래서 400은 **옵션 없이 한 번 재시도**하고 폴백 발동은 항상 `console.error` 로 남긴다.
   → **새 함수도 폴백을 둔다면 같은 규칙을 지킬 것.**

### ★검증 그물

`npx tsc --noEmit`(`include: ["src"]`)·`npm run lint`(`src/**`) 가 **`supabase/functions/` 를 검사하지 않는다.**
이 영역의 타입 그물은 **`deno check` 뿐이다.**

---

## 조사 방법

두 개의 읽기 전용 탐색 에이전트를 병렬로 돌려 각각 (a) 통합 지점 (b) 계획서 감사를 수행하고, 결과를 대조해 정리했다.
**에이전트 반환값이 비어 오는 기존 함정**([[feedback_omc_agent_empty_return]])이 재현되어, 재실행 대신 세션 전사(`subagents/agent-*.jsonl`)에서 회수했다.
원본 회수분: `_recovered-agent-*.md` 2건(같은 폴더).
