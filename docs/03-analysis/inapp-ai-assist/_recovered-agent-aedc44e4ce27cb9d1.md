# 조사 결과 — 인앱 AI 업무 도우미 통합 지점

**핵심 발견**: 이 작업에 대한 상세 설계 문서가 이미 존재한다 — `docs/01-plan/features/in-app-chatbot-zen.plan.md` (전체 1378줄, 상태: "초안(승인 대기)", 2026-08-17 작성, 2026-08-21 갱신 노트 포함). 아래는 이 문서의 주장을 **실제 코드를 직접 읽어 검증**한 결과다. 계획 문서 자체는 아직 구현되지 않았다 — `src/adapters/components/Assist/` 등 관련 파일은 **하나도 존재하지 않음**을 확인했다(`find`로 검색, 0건).

---

## 1. 기존 고객지원 챗봇 UI (`HelpChat`)

### 컴포넌트 구성 (`E:\github\ssampin\src\adapters\components\HelpChat\`)

| 파일                  | 역할                                                        |
| --------------------- | ----------------------------------------------------------- |
| `HelpChatPanel.tsx`   | 최상위 컨테이너. 플로팅 버튼 + 열림 상태 관리               |
| `HelpChatWindow.tsx`  | 헤더 + 메시지 목록 + 입력/에스컬레이션 폼 조합              |
| `HelpChatInput.tsx`   | 텍스트 입력 + 이미지 첨부(최대 3장, 드래그/붙여넣기 지원)   |
| `HelpChatMessage.tsx` | 메시지 버블 렌더링(마크다운 간이 파서, XSS 이스케이프 포함) |
| `useHelpChat.ts`      | 상태·네트워크 로직 훅                                       |
| `index.ts`            | `export { HelpChatPanel } from './HelpChatPanel'`           |

### 진입점 / 렌더 위치

- `src/App.tsx:72` — `import { HelpChatPanel } from '@adapters/components/HelpChat';`
- `src/App.tsx:1315` — `<HelpChatPanel />` 로 마운트. 전용 단축키 없음, 우하단 고정 플로팅 원형 버튼(`HelpChatPanel.tsx:163-192`)으로 열고 닫는다.
- 렌더 형태: **모달도 사이드패널도 아닌 fixed 포지션 오버레이**. `HelpChatPanel.tsx:136-141`에서 `className="fixed bottom-16 right-4 z-50 ..."` 로 화면 위에 뜬다(덮는 방식). 포털을 별도로 쓰지 않고 App 트리 안에 직접 렌더.

### 상태 관리

- 전용 zustand 스토어 없음. `useHelpChat.ts:101-104`에서 로컬 `useState`로 `messages`, `status`, `escalationType`, `isOnline`을 관리(`useHelpChat` 자체가 상태를 캡슐화한 커스텀 훅).
- 열림 여부(`isOpen`)는 `HelpChatPanel.tsx:11`에서 로컬 `useState`.
- 오직 `useSettingsStore`(`HelpChatPanel.tsx:5,10`)만 참조 — 챗봇 표시 여부 설정값(`settings.showChatbot`).

### 메시지 렌더링 / 스트리밍 / 실패 UI

- `HelpChatMessage.tsx:48-58` `renderSimpleMarkdown()` — `**bold**`, `` `code` ``, 리스트를 정규식으로 변환 후 `dangerouslySetInnerHTML`(입력은 사전에 이스케이프됨).
- **스트리밍 없음** — `useHelpChat.ts:297-328`에서 일반 `fetch` POST 후 `res.json()`으로 응답 전체를 한 번에 받는다.
- 실패 UI: `useHelpChat.ts:318-322`(429 처리), `347-358`(네트워크 에러 시 오프라인 FAQ 폴백), `HelpChatWindow.tsx:164` `status === 'loading'`일 때 `<HelpTypingIndicator />` 표시.

### 서버 호출 경로

- `useHelpChat.ts:17-18` — `CHAT_ENDPOINT = ${SUPABASE_URL}/functions/v1/ssampin-chat`, `ESCALATE_ENDPOINT = .../ssampin-escalate` 두 개의 Supabase Edge Function을 호출.

---

## 2. 명령 팔레트 (`CommandPalette`)

- 경로: `src/adapters/components/common/CommandPalette/`
  - `CommandPalette.tsx` — UI 본체
  - `useCommandPalette.ts` — 열림 상태 + 단축키 훅
  - `commandRegistry.ts` — 명령 목록 빌드/필터링(존재 확인, 내부 상세는 열지 않음)
  - `CommandPaletteHint.tsx` — 힌트 배너
- 단축키: `useCommandPalette.ts:20` — `(e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'` → `Ctrl+K`/`Cmd+K` 토글. 주석에 "input/textarea 포커스 중에도 작동"이라 적혀 있으나, 실제 구현은 포커스 여부를 검사하지 않고 `window`에 전역으로 붙는 `keydown` 리스너다(`useCommandPalette.ts:17-35`) — 즉 입력창 포커스 여부와 무관하게 항상 반응한다는 뜻이지, 별도 예외 처리 코드가 있는 게 아니다.
- 현재 매칭 방식: `CommandPalette.tsx:83-85` — `buildDefaultCommands()` → `filterAndGroupCommands(commands, query, recentIds)` → 결과 없으면 `CommandPalette.tsx:29-35`에서 "일치하는 명령을 찾을 수 없습니다" 표시(`CommandPalette.tsx:32`).
- 마운트 위치: `src/App.tsx`에서 `<CommandPalette onNavigate={setCurrentPage} />` (App.tsx 하단부, HelpChatPanel과 같은 형제 레벨).

**경계(계획 문서가 명시한 것과 실제 코드 상태)**: 계획서(§5.1.4, §6.4)는 `commandRegistry.ts`에 "매칭 0건 + 질문형일 때만 AI에게 묻기 항목 1개 추가"를 제안하지만, **현재 `commandRegistry.ts`에는 그런 로직이 없다**(내가 읽은 것은 존재 확인뿐, 내용은 미검토 — 다만 `Assist/` 관련 코드가 전무하므로 미구현 상태는 명백). 즉 지금 이 순간 명령 팔레트는 AI 기능과 아무 연결이 없다.

---

## 3. 재사용 가능한 UI 자산

### 공용 Modal/Panel/Drawer

- 이번 조사에서 범용 Modal/Drawer 컴포넌트의 정확한 경로·props 시그니처는 **확인하지 못함**(시간 제약으로 `src/adapters/components/common/` 하위를 전수 조사하지 않음). `ModalCoordinator`(`App.tsx`에서 `<ModalCoordinator />` 사용 확인)가 존재하나 내부 구조는 미확인.

### `sp-*` 토큰

- 정의 파일: `E:\github\ssampin\src\index.css` (라이트 테마 `:root` 블록 17번째 줄부터, 다크/그레이 테마는 `.dark`/`.gray` 등 하위 셀렉터로 재정의, 확인한 줄: 222행대·243행대).
- 실제 확인한 CSS 변수 목록(`src/index.css:17-98`):
  - 색상: `--sp-bg`, `--sp-surface-base`/`--sp-surface`, `--sp-card-base`/`--sp-card`, `--sp-border`, `--sp-accent`, `--sp-accent-fg`, `--sp-highlight`, `--sp-info`, `--sp-success`, `--sp-warning`, `--sp-error`, `--sp-text`, `--sp-muted`, `--sp-widget-rgb`, `--sp-today-bg`
  - 카드: `--sp-card-radius`, `--sp-card-gap`, `--sp-card-border`, `--sp-card-shadow`
  - 폰트: `--sp-font-family`
  - 보드 스티커/그룹 색: `--sp-board-sticky-*`(yellow/pink/blue/green/purple), `--sp-board-template-cell`, `--sp-board-group-*`(r/b/y/g/p/o)
  - 반경: `--sp-radius-xs/sm/md/lg/xl/pill`
  - 그림자: `--sp-shadow-none/sm/md/lg/accent`
  - 폰트 굵기: `--sp-weight-normal/medium/semibold/bold`
  - 애니메이션: `--sp-duration-quick/base/slow`, `--sp-ease-out`, `--sp-ease-out-cubic`, `--sp-ease-in-out`
- Tailwind 클래스로는 `bg-sp-accent`, `text-sp-text`, `border-sp-border` 등으로 소비됨(HelpChat 컴포넌트들 전반에서 실사용 확인).

### 사이드바(`Sidebar.tsx`) 구조 — 새 진입점 자리

- 경로: `src/adapters/components/Layout/Sidebar.tsx`
- 구조: 로고(260-310행) → `<nav>` 내비게이션 항목(313-383행, `NAV_ITEMS` 배열 기반) → 하단 블록(386-461행: `SyncStatusBar`, `DriveSyncIndicator`, 설정 버튼(389-403행), 프로필(405-421행), "지인에게 추천"(423-434행), "건의사항 보내기"(436-445행), 버전 표시(447-460행)).
- **새 항목을 넣을 자리**: 하단 블록(386행 `<div className="... border-t border-sp-border">`)에 "설정" 버튼과 같은 패턴으로 버튼 하나 추가하는 구조가 자연스럽다(계획서 §5.1.5·§6.4가 이 위치를 지목). 실제로 아직 "업무 도우미" 항목은 **존재하지 않음**(`NAV_ITEMS` 배열, `Sidebar.tsx:85-98`에 없음).

### "패널이 본문을 밀어내는" 레이아웃 선례

- `App.tsx:1241` — `<div className="flex flex-1 min-h-0">` 안에 `<Sidebar />`(1243행)와 본문 `<div className="flex flex-1 min-h-0 flex-col">`(1255행, 내부 `<main className="flex-1 min-h-0 overflow-y-auto ...">` 1259행)가 **형제(flex row)**로 배치되어 있다. 즉 Sidebar가 이미 "밀어내는" 구조의 선례이며, `main`의 오른쪽에 새 형제 요소를 추가하면 구조적으로 동일한 패턴이 된다(계획서가 근거로 삼은 지점, 실제 줄 번호는 문서가 적은 1241/1255와 내가 확인한 줄이 일치).
- **옆핀(SidePin)은 밀어내는 패턴이 아니라 별도 BrowserWindow다.** `src/domain/services/resolveSidePinTransition.ts:45` — `export const SIDE_PIN_COLLAPSE_DELAY_MS = 400;`(포인터가 나가면 400ms 뒤 자동 접힘), 같은 파일 373행에서 `scheduleOf('collapse', revision, ctx.nowMs, SIDE_PIN_COLLAPSE_DELAY_MS)`로 사용됨을 확인. 옆핀 관련 파일은 `src/adapters/components/SidePin/`, `electron/sidePin*.ts`, `src/usecases/sidePin/` 등 다수 존재(확인만, 상세 미열람).

---

## 4. 1등급 도구가 읽어야 할 데이터 소스

각 항목에 대해 **집계 함수가 이미 존재하는지 직접 확인**했다. 결론: **어느 것도 아직 존재하지 않는다** — 스토어는 원시 배열만 들고 있고, 집계/카운트 함수는 새로 만들어야 한다.

| 항목                              | 스토어/usecase                                                                                                                                                                                                               | 집계 함수 존재 여부                                                                                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 출결(attendance)                  | `src/adapters/stores/`에 전용 출결 스토어는 못 찾음. usecase는 `src/usecases/classManagement/ManageAttendance.ts`(exports: `stampChangedRecords`, `buildAttendanceSaveData` — `ManageAttendance.ts:38,61`)                   | **없음.** 위 두 함수는 저장용이지 요약/집계용이 아니다. 관련 규칙 파일은 `src/domain/entities/Attendance.ts`, `src/domain/rules/attendanceRules.ts` 등(존재만 확인)               |
| 학생 관찰/누가 기록(records) 통계 | `src/adapters/stores/useStudentRecordsStore.ts`(export: `useStudentRecordsStore`, `RECORD_COLOR_MAP` — 27행, 266행), usecase `src/usecases/classManagement/ManageObservations.ts`(export: `buildObservationSaveData` — 26행) | **없음.** 카테고리별 건수 집계 함수는 확인되지 않음                                                                                                                               |
| 담당 학급 목록(classes)           | `src/adapters/stores/useTeachingClassStore.ts` — `TeachingClassState.classes: readonly TeachingClass[]`(57-58행), `useTeachingClassStore`(184행)                                                                             | 목록 자체는 스토어에 있음(`state.classes`). 별도의 "요약용" 함수(`list_classes`에 대응하는 `{id,name,grade,classNum}` 반환 함수)는 **없음** — 스토어 원본 객체를 그대로 쓰는 상태 |
| 할 일(todo)                       | `src/adapters/stores/useTodoStore.ts` — `TodoState`(8행), `useTodoStore`(64행)                                                                                                                                               | 목록은 스토어에 있으나 집계(마감 임박 건수 등) 전용 함수는 **없음**                                                                                                               |
| 학생 수 세기(count)               | `src/adapters/stores/useStudentStore.ts` — `useStudentStore`(75행)                                                                                                                                                           | 전용 count 함수는 없고, `Sidebar.tsx:180`에서 `useStudentStore((s) => s.students.length)` 처럼 **컴포넌트가 배열 길이를 직접 계산**하는 패턴이 기존 관례임을 확인                 |

즉 계획서(§4.2)가 "신규"로 표기한 `get_attendance_summary`, `count_students`, `list_classes`, `get_records_stats`가 실제로 신규가 맞다 — 대응하는 집계 usecase가 현재 리포지토리에 없다.

---

## 5. AI 브릿지의 선례

- **`get_weekly_summary`는 이 저장소(`ssampin`)가 아니라 별도 저장소 `E:\github\ssampin-ai-bridge`에 있다.** 본체(`ssampin`) 안에서는 흔적을 찾지 못했다(`grep -r`로 소스 트리 전체 검색, 계획 문서 텍스트 외 매치 없음).
- `ssampin-ai-bridge` 저장소에서 확인한 파일:
  - `packages/mcp/src/server.ts:343` — 도구명 등록: `'get_weekly_summary'`
  - `packages/mcp/src/server.ts:358` — `runTool('get_weekly_summary', () => getWeeklySummary(ctx, args as GetWeeklySummaryArgs))`
  - `packages/mcp/src/summaryTools.ts` — `getWeeklySummary` 함수 정의(파일 존재만 확인, import 라인으로 검증: `packages/mcp/test/weeklySummary.mcp.test.ts:9`)
  - `packages/mcp/test/weeklySummary.mcp.test.ts:53` — `expect(tools.find((t) => t.name === 'get_weekly_summary')?.annotations?.readOnlyHint).toBe(true)` — 읽기 전용임을 테스트로 강제.
  - 같은 테스트 파일 59-65행 — **마스터 스위치 OFF일 때 fail-closed**(`res.available === false`이고 `counts`/`range`/`byCategory`가 전부 `undefined`)를 검증하는 테스트 존재.
  - 테스트 픽스처(17-35행)에 실명(`박지훈`)·전화번호(`010-9999-8888`)를 할 일 제목·카테고리에 **의도적으로 심어 두고**(주석: "탈식별 대상") 새는지 검증하는 "함정 픽스처" 패턴이 실제로 쓰이고 있음을 확인.
  - `packages/mcp/test/weeklySummary.mcp.test.ts:8` — `import { buildSecretCorpus, readStudents, scanForLeaks } from '@ssampin-ai-bridge/core';` — PII 스캔 유틸이 별도 `core` 패키지에 존재함을 확인(내용은 미열람).

- **본체(`ssampin`)에 있는 egress/PII 관련 가드**: `src/domain/privacy/` 디렉터리에 아래 파일들이 실존한다.
  - `src/domain/privacy/keywordMask.ts`
  - `src/domain/privacy/maskRules.ts`
  - `src/domain/privacy/maskEngine.ts` (+ `maskEngine.test.ts`)
  - `src/domain/privacy/types.ts`
  - 이 모듈을 소비하는 곳: `src/adapters/components/common/RealtimeResponseToggle.regression.test.ts`, `src/usecases/classroomAgreement/classroomAgreementSecurityRegression.test.ts` (둘 다 `keywordMask.ts`/`maskRules.ts`를 참조하는 회귀 테스트로, `grep` 결과 확인).
  - 계획서(§4.4, §6.1)가 주장하는 `assertNoPii`, `sanitizeToolResult`, `AssistTool.ts`, `nameRedaction.ts`, `reidentificationRisk.ts` 등은 **모두 미존재**(전수 `find` 검색, 0건) — 계획 단계일 뿐 아직 코드화되지 않았다.

---

## 6. 옵트인·설정

### 설정 화면 구조

- `src/adapters/components/Settings/SettingsSidebar.tsx:24-121` — `TAB_GROUPS` 배열에 5개 그룹, 총 18개 탭 id 정의:
  1. **기본 정보**: `school`, `period`
  2. **화면 구성**: `display`, `widget`, `sidebar`
  3. **기능별 설정**: `calendar`, `todo`, `seat`, `weather`, `record-reminder`, `tools`, `shortcuts`
  4. **연동·백업**: `google`, `ai-bridge`, `backup`, `archive`
  5. **시스템**: `security`, `system`, `about`
- 주석(`SettingsSidebar.tsx:17`): "탭 id·라벨은 딥링크('settings#widget')와 사용자 가이드(/docs)가 참조하므로 바꾸지 않는다" — 새 옵트인 항목을 넣는다면 탭을 새로 만들지 말고 기존 `ai-bridge` 탭(라벨 "AI 연결", `SettingsSidebar.tsx:82-86`) 안에 카드를 추가하는 것이 안전하다는 근거가 코드 주석에서도 확인됨.
- 실제 해당 탭 컴포넌트: `src/adapters/components/Settings/tabs/AiBridgeTab.tsx`(존재 확인, 내용 미열람), 관련 카드 컴포넌트 `src/adapters/components/Settings/aiBridge/AiBridgeCard.tsx`(존재 확인).
- 탭 id 목록에 대한 계약 테스트: `src/adapters/components/Settings/__tests__/settingsTabIds.test.ts`(존재 확인).

### "기본 꺼짐 + 최초 1회 안내" 기존 사례

- `src/adapters/stores/useAiBridgeConsentStore.ts` 전체를 확인. 이 스토어가 정확히 그 패턴의 선례다:
  - `useAiBridgeConsentStore.ts:21` — `export const AI_BRIDGE_NOTICE_VERSION = 1;`(고지문 버전)
  - `useAiBridgeConsentStore.ts:24` — `export type HighRiskGate = 'allowGradeWrite' | 'allowRecordWrite';`
  - `useAiBridgeConsentStore.ts:55-62` — `needsConsent()` 함수: 해당 학기(`academicTerm`)·버전 조합의 확인 기록이 없으면 `true` 반환 → 안내를 다시 띄워야 함을 판정
  - `useAiBridgeConsentStore.ts:73-76` — `acknowledge()`: 확인 시각을 `localStorage`에 영속 기록(`persist` 미들웨어, 81-85행 `name: 'ssampin-aibridge-consent-v1'`)
  - 주석(`useAiBridgeConsentStore.ts:6-17`)에 설계 의도가 명시됨: "같은 학기·같은 고지문 버전 안에서는 토글을 켤 때마다 반복해서 묻지 않는다"(경고 피로 회피), "학사 학기가 바뀌거나 고지문 버전이 오르면 다음 첫 ON 시 1회 재확인"
  - 관련 테스트: `src/adapters/stores/__tests__/useAiBridgeConsentStore.test.ts`(존재 확인)

이 스토어는 이번 조사 대상인 "인앱 AI 업무 도우미"가 아니라 **기존 AI 브릿지의 고위험 게이트(채점/생기부 쓰기) 고지 확인용**이지만, 요청한 "기본 꺼짐 + 최초 1회 안내" 패턴 자체의 실제 구현 선례로서 구조·API가 그대로 재사용 가능한 형태다.

---

## 확인 못 한 것 (명시)

- 범용 Modal/Panel/Drawer 컴포넌트의 정확한 경로와 props 시그니처 — 조사하지 못함
- `commandRegistry.ts`, `useCommandRecentStore.ts`, `CommandPaletteHint.tsx`의 내부 로직 — 존재만 확인, 내용 미열람
- `AiBridgeTab.tsx`, `AiBridgeCard.tsx`의 실제 UI 구조 — 존재만 확인, 내용 미열람
- `ssampin-ai-bridge`의 `packages/mcp/src/summaryTools.ts` 내부 구현(egress 로직 자체) — 파일 존재는 간접 확인(import 라인)했으나 직접 읽지 않음
- `ssampin-ai-bridge`의 `@ssampin-ai-bridge/core` 패키지(`buildSecretCorpus`, `scanForLeaks` 등)의 실제 구현 — 미열람
- 도킹 패널 폭 반응형 기준(1280/1024px)이 실측된 적 있는지 — 계획서에 "Phase 3에서 실렌더로 확정"이라고만 적혀 있고, 실측 기록은 찾지 못함
