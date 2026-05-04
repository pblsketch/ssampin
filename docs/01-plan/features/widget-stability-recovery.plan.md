# 위젯 모드 안정성·복구 진단 (Widget Stability & Recovery) Planning Document

> **Summary**: Win+D, 절전, Explorer 재시작, 디스플레이 변경 등으로 위젯이 사라지거나 화면 밖으로 밀려도 사용자가 직접 1~2클릭으로 복구할 수 있는 **위젯 상태 진단·복구 센터**를 신설한다. WorkerW/Native Desktop 마이그레이션 없이 현재 위젯 모드의 신뢰성을 끌어올리는 독립 가치 기능.
>
> **Project**: SsamPin
> **Version**: v2.0.3 또는 v2.1.0 (예정)
> **Author**: pblsketch
> **Date**: 2026-05-04
> **Status**: Draft v0.1

---

## 1. 개요

### 1.1 목적

이 기능이 해결하는 문제:

1. **"위젯이 사라졌어요"** — Win+D / 절전 복귀 / Explorer 재시작 / 멀티모니터 disconnect 후 위젯이 안 보일 때 사용자가 손쓸 방법이 명확하지 않다.
2. **"위젯이 화면 밖에 있는 것 같아요"** — bounds가 어긋나도 사용자가 인지할 시각적 단서가 없다.
3. **"alwaysOnTop이 풀린 것 같아요"** — `desktopMode='topmost'`를 켜둬도 어떤 OS 이벤트로 풀려있을 수 있는데 확인할 방법이 없다.
4. **불안한 신뢰성** — 매일 켜두는 핵심 기능인데 한 번 사라지면 "앱을 껐다 켜야 하나?" 외엔 답이 없다.
5. **개발자 측면** — 사용자에게 "스크린샷 보내주세요"라고 요청해야 할 때, 클릭 한 번으로 진단 정보를 복사할 수 있어야 한다.

### 1.2 배경

쌤핀 사용자에게 위젯은 단순 보조 UI가 아니라 **하루 종일 떠 있는 데스크톱 가구**다. 위젯 분실 사고가 한 번이라도 일어나면 사용자는 "이 앱 믿을 수 있나?"부터 다시 검토하게 된다.

이미 [`electron/main.ts`](e:/github/ssampin/electron/main.ts)에는 다음과 같은 복구 자산이 있지만 사용자가 명시적으로 호출할 수 없다:

| 기존 자산 | 위치 | 현황 |
|----------|------|------|
| `recoverWidget()` (Win+D 복원) | [main.ts:1165-1176](e:/github/ssampin/electron/main.ts#L1165) | minimize 이벤트 + 1초 폴링으로 자동 호출만 됨 |
| `ensureWidgetOnScreen()` (화면 밖 보정) | [main.ts:1201-1244](e:/github/ssampin/electron/main.ts#L1201) | `display-removed` 또는 setBounds 직후만 호출 |
| `restoreWidgetAfterSleep()` (절전 복귀) | [main.ts:1249-1262](e:/github/ssampin/electron/main.ts#L1249) | `powerMonitor` resume 이벤트만 트리거 |
| `doRestoreWidget()` (위젯 재생성 포함) | [main.ts:1264 부근](e:/github/ssampin/electron/main.ts#L1264) | 절전 복귀 시 destroy → createWidgetWindow 재호출 가능 |
| 트레이 메뉴의 "위젯 보이기" | [main.ts](e:/github/ssampin/electron/main.ts) | 1개 액션만 — 진단·이동·재생성은 없음 |

즉, **백엔드 복구 함수는 갖춰져 있지만 사용자 노출 UI가 없다**. 본 PDCA는 이 격차를 메우는 것이 핵심이다.

또한 [`electron/main.ts`](e:/github/ssampin/electron/main.ts)는 **3,587 lines**로 비대해져 있다. 새 진단 로직은 별도 모듈(`electron/widgetDiagnostics.ts`)로 분리해야 한다.

### 1.3 관련 문서

- 사용자 제안 컨텍스트: 본 세션 (2026-05-04) — `02_widget-mode-stability.md` 프롬프트
- 가까운 구현 자산:
  - `electron/main.ts:32` — `widgetWindow` 전역
  - `electron/main.ts:48-58` — `getAllAppWindows()` 헬퍼 (icon-mode 라운드에서 추출)
  - `electron/main.ts:77` — `currentDesktopMode` (`'normal' | 'topmost'`)
  - `electron/main.ts:579` — `currentWindowMode` (`'main' | 'widget' | 'icon'`)
  - `electron/main.ts:1165-1176` — `recoverWidget()`
  - `electron/main.ts:1178-1199` — Win+D 폴링 시작/중지
  - `electron/main.ts:1201-1244` — `ensureWidgetOnScreen()`
  - `electron/main.ts:1249-1262` — `restoreWidgetAfterSleep()`
  - `electron/main.ts:1351-1359` — 위젯 destroy → createWidgetWindow 재생성 패턴
  - `electron/main.ts:1362-1510` — `createWidgetWindow()` 본체
  - `electron/main.ts:1761-1773` — `window:toggleWidget` IPC
  - `electron/main.ts:1856 부근` — `window:applyWidgetSettings` IPC
  - `electron/preload.ts:12-105` — `electronAPI` 노출 구조
  - `src/adapters/components/Widget/WidgetContextMenu.tsx` — 위젯 우클릭 메뉴
  - `src/adapters/components/Settings/tabs/WidgetTab.tsx:40` — 위젯 설정 탭 진입점
- 라운딩 정책: 메모리 `feedback_rounding_policy.md` — `rounded-sp-*` 금지, Tailwind 기본 키만
- 프론트 협업 정책: 메모리 `feedback_frontend_agent_collaboration.md` — UI 작업 시 `frontend-design` 또는 `bkit:frontend-architect` 협업 필수
- 디자인 시스템: `CLAUDE.md` 디자인 시스템 섹션 (sp-* 토큰)

---

## 2. 범위

### 2.1 포함 범위 (In Scope)

#### 진단(Diagnostics)
- [ ] 신규 모듈 `electron/widgetDiagnostics.ts` 생성 — 진단·복구 로직 분리
- [ ] 진단 결과 타입 `WidgetDiagnosticsReport` 정의 (strict TS)
  - exists, visible, focused, minimized, destroyed, alwaysOnTop, opacity
  - bounds (x/y/width/height), insideAnyDisplay (boolean), displayId
  - desktopMode (`'normal' | 'topmost'`), currentWindowMode (`'main' | 'widget' | 'icon'`)
  - lastRecoveredAt (epoch ms | null), lastErrorMessage (string | null)
  - osPlatform (`'win32' | 'darwin' | 'linux'`)
- [ ] IPC 채널 `widget:getDiagnostics` (renderer → main)
- [ ] 사용자 친화적 메시지 매핑 함수 (순수 함수, 단위 테스트 가능)
  - 예: `{ exists:false } → "위젯 창이 없습니다. 다시 만들 수 있어요."`
  - 예: `{ insideAnyDisplay:false } → "위젯이 모든 모니터 밖으로 밀려 있어요."`

#### 복구(Recovery)
- [ ] IPC 채널 `widget:recover` with action union (renderer → main)
  - `'show'` — `widgetWindow.show()` + `showInactive` + `restore` (숨겨진 위젯 다시 보이기)
  - `'moveIntoVisibleArea'` — 기존 `ensureWidgetOnScreen()` 호출 (화면 안으로 이동)
  - `'recreate'` — destroy → `createWidgetWindow()` 재생성 (기존 절전 복귀 패턴 재사용)
  - `'reapplyAlwaysOnTop'` — `setAlwaysOnTop(currentDesktopMode === 'topmost')` 재적용
  - `'resetPosition'` — `getDefaultWidgetBounds()` 위치로 강제 리셋 (이미 있는 트레이 액션과 합치)
- [ ] 복구 결과 응답 타입 `WidgetRecoveryResult { ok, action, message, beforeBounds?, afterBounds? }`
- [ ] 마지막 복구 시각 / 마지막 오류 메시지 추적 (in-memory, 영속화 불필요)
- [ ] **사이드 이펙트 격리**: 진단 IPC는 read-only, 복구 IPC만 mutation

#### UI
- [ ] 신규 컴포넌트 `src/adapters/components/Settings/WidgetTroubleshootingPanel.tsx`
  - 진단 결과 카드 (5~6개 항목, 한국어 자연어)
  - 복구 액션 버튼 4개 (다시 보이기, 화면 안으로 이동, 위젯 재생성, 항상 위 재적용)
  - "진단 정보 복사" 버튼 (clipboard에 JSON+요약 복사 — 사용자 지원 시 활용)
- [ ] `WidgetTab.tsx`에 "위젯 문제 해결" 진입 버튼 추가 (또는 카드 직접 임베드)
- [ ] `WidgetContextMenu.tsx`에 "위젯 문제 해결…" 메뉴 항목 추가 (Settings로 이동 OR 인라인 모달)
- [ ] 토스트 피드백 — 복구 액션 성공/실패 시 한국어 토스트

#### 타입 / IPC 브리지
- [ ] `electron/preload.ts`에 IPC 노출
  - `electronAPI.widgetDiagnostics.get(): Promise<WidgetDiagnosticsReport>`
  - `electronAPI.widgetDiagnostics.recover(action): Promise<WidgetRecoveryResult>`
- [ ] `src/types/electron.d.ts` 또는 글로벌 타입 파일에 시그니처 반영
- [ ] **외부 서버 전송 0건**: 진단/오류 로그는 로컬 in-memory + 사용자 클립보드 복사만

#### 테스트
- [ ] 순수 함수 단위 테스트 (vitest)
  - 진단 상태 → 한국어 메시지 매핑 (8~10 케이스)
  - bounds 보정 로직 (`computeRecoveredBounds(bounds, displays) → bounds`)
- [ ] IPC handler mock 테스트 (가능한 범위에서 `mockBrowserWindow`)
- [ ] 회귀 시나리오 5개 수동 체크리스트

### 2.2 제외 범위 (Out of Scope)

- WorkerW / Native Desktop API 통합 — 별도 PDCA
- Desktop Icon Zone pass-through 구현 — 별도 PDCA
- 자동 복구 정책 변경 (기존 Win+D 폴링/절전 복귀는 그대로 유지)
- 진단 결과를 외부 서버로 전송 (Sentry, 자체 API 등) — 모두 로컬 처리
- 위젯 외 윈도우(아이콘 모드, 메인 윈도우) 진단 — 본 라운드는 위젯에 집중
- 모바일 앱(`src/mobile/`) — 데스크톱 Electron 전용
- 위젯 자체 UI 개편 — 진단 패널만 신설

---

## 3. 요구사항

### 3.1 기능 요구사항 (Functional Requirements)

| ID | 요구사항 | 우선순위 | 상태 |
|----|----------|----------|------|
| FR-01 | 사용자는 설정 > 위젯 탭에서 "위젯 문제 해결" 패널을 열 수 있다 | Must | Pending |
| FR-02 | 위젯 우클릭 컨텍스트 메뉴에 "위젯 문제 해결…" 항목이 있다 | Must | Pending |
| FR-03 | 진단 패널은 위젯 창 alive 여부 / 표시 여부 / bounds / desktopMode / alwaysOnTop / 모든 디스플레이 안에 있는지를 한국어로 표시한다 | Must | Pending |
| FR-04 | 진단 패널은 마지막 자동 복구 시각·마지막 오류 메시지를 표시한다 | Should | Pending |
| FR-05 | "위젯 다시 보이기" 버튼 — 숨겨진 위젯을 즉시 표시한다 (기존 `widgetWindow.show()` 흐름 재사용) | Must | Pending |
| FR-06 | "화면 안으로 이동" 버튼 — `ensureWidgetOnScreen()` 호출, 보정된 bounds 반환 | Must | Pending |
| FR-07 | "위젯 창 재생성" 버튼 — destroy → `createWidgetWindow()` 호출, 200ms 이내 완료 | Must | Pending |
| FR-08 | "항상 위 재적용" 버튼 — `setAlwaysOnTop(currentDesktopMode==='topmost')` 호출 | Should | Pending |
| FR-09 | 복구 액션 성공/실패 시 한국어 토스트로 결과 안내 | Must | Pending |
| FR-10 | "진단 정보 복사" 버튼 — JSON + 한국어 요약을 클립보드에 복사 (사용자 지원용) | Should | Pending |
| FR-11 | 진단 IPC `widget:getDiagnostics`는 mutation 없이 read-only | Must | Pending |
| FR-12 | 복구 IPC `widget:recover`는 action union으로 5개 액션을 수신 | Must | Pending |
| FR-13 | 위젯이 destroy 상태일 때 "다시 보이기"는 자동으로 "재생성"으로 폴백된다 | Should | Pending |
| FR-14 | macOS / Linux에서 Windows 전용 값(예: WorkerW 관련)은 `null` 또는 `'unsupported'`로 안전하게 표시한다 | Must | Pending |
| FR-15 | 외부 서버로 진단 정보를 전송하지 않는다 (개인정보 보호) | Must | Pending |
| FR-16 | 진단 패널 자체는 위젯 윈도우 안에서도 열 수 있다 (위젯 컨텍스트 메뉴 → 인라인 또는 메인 윈도우 호출) | Could | Pending |
| FR-17 | 진단 결과는 로컬 메모리에만 저장 (재시작 시 초기화), `lastRecoveredAt`은 in-memory 누적 | Must | Pending |

### 3.2 비기능 요구사항 (Non-Functional Requirements)

| 분류 | 기준 | 측정 방법 |
|------|------|-----------|
| 성능 (진단) | `widget:getDiagnostics` 응답 < 30ms | 콘솔 로그 / vitest perf |
| 성능 (복구) | `widget:recover` 응답 < 200ms (recreate 포함) | 콘솔 로그 |
| 안정성 (회귀) | 기존 Win+D 폴링 / 절전 복귀 자동 복구 동작 100% 유지 | 회귀 시나리오 5개 |
| 안정성 (멀티모니터) | 모니터 disconnect 후 "화면 안으로 이동" 클릭 → primary로 복귀 | 수동 검증 |
| 아키텍처 | `electron/main.ts`에 추가되는 코드 < 80 lines (나머지는 `widgetDiagnostics.ts`로 분리) | LOC 측정 |
| 아키텍처 | Clean Architecture 의존성 규칙 준수 (renderer는 IPC 통해서만 진단 호출) | `npx tsc --noEmit` |
| 디자인 일관성 | sp-* 토큰 사용, `rounded-sp-*` 금지, Tailwind 기본 라운딩만 | 코드 리뷰 + grep |
| 접근성 | 진단 카드 / 버튼이 키보드 네비게이션 가능, 토스트가 스크린리더 인지 | 수동 검증 |
| 보안 | 외부 서버 전송 0건, 사용자 데이터 미포함 (위젯 좌표만) | 코드 리뷰 |
| 테스트 | 순수 함수 단위 테스트 80% 이상 라인 커버리지 | `npm run test` |

---

## 4. 사용자 시나리오 (User Stories)

**US-1: 절전 후 위젯 분실**
> 점심시간에 노트북이 절전됐다가 깨어났는데 위젯이 안 보인다. 평소에는 자동 복구되는데 오늘은 안 됐다.
>
> - 흐름: 트레이 우클릭 → "위젯 보이기" 클릭했지만 여전히 안 보임 → 트레이/위젯 메뉴에서 "위젯 문제 해결" → 진단 패널에 "창은 있지만 화면 밖에 있어요" 표시 → "화면 안으로 이동" 클릭 → 위젯이 우하단으로 복귀
> - 수용 기준: 사용자가 코드를 보지 않고도 어떤 상태인지 한국어로 이해할 수 있고, 1클릭으로 복구된다.

**US-2: 멀티모니터 disconnect**
> 외부 모니터를 분리했더니 위젯이 안 보인다. 외부 모니터에 두고 왔는데 모니터 분리되니 화면 밖이 됐다.
>
> - 흐름: 위젯 우클릭 → "위젯 문제 해결" → "디스플레이 밖에 있어요" 안내 → "화면 안으로 이동" 클릭 → 즉시 primary 모니터로 복귀
> - 수용 기준: `display-removed` 자동 보정이 실패한 케이스에서도 수동 복구 가능.

**US-3: 위젯이 alwaysOnTop 풀린 상태**
> Excel을 띄웠더니 위젯이 가려지는데, 분명 "항상 위" 모드로 켰었다.
>
> - 흐름: 진단 패널 열기 → "현재 항상 위: 켜짐 / 시스템 적용: 꺼짐" 표시 → "항상 위 재적용" 클릭 → 위젯이 다시 최상위로 부상
> - 수용 기준: 일부 OS 이벤트(전체화면 진입 후 복귀 등)로 alwaysOnTop이 풀려도 사용자가 직접 재적용 가능.

**US-4: 위젯 창 자체가 destroy됨**
> Explorer가 충돌했는지, 위젯 창이 완전히 사라진 듯하다.
>
> - 흐름: 진단 패널 → "위젯 창이 없어요" → "위젯 창 재생성" 클릭 → 200ms 이내 새 위젯이 마지막 위치에 등장
> - 수용 기준: 앱 재시작 없이 복구 가능.

**US-5: 사용자 지원 요청**
> 사용자가 "위젯이 이상해요" 문의를 보낸다.
>
> - 흐름: 사용자가 진단 패널 → "진단 정보 복사" 클릭 → 클립보드에 JSON 요약 복사 → 카카오톡으로 붙여넣어 전송
> - 수용 기준: 외부 서버 전송 없이 사용자 자발적 공유 경로만 제공. 개인 데이터(좌표 외) 미포함.

---

## 5. 성공 기준

### 5.1 완료 정의 (Definition of Done)

- [ ] FR-01 ~ FR-17 모두 구현 완료 (FR-16은 Could)
- [ ] `electron/widgetDiagnostics.ts` 신규 모듈로 진단·복구 로직 분리
- [ ] `npx tsc --noEmit` 에러 0개
- [ ] `npm run build` 성공
- [ ] `npm run build:electron` 성공
- [ ] `npm run test` 통과 (신규 단위 테스트 포함)
- [ ] 회귀 시나리오 5개 수동 체크 PASS
- [ ] 디자인 검토 통과 (`frontend-design` 또는 `bkit:frontend-architect`)
- [ ] PDCA Match Rate ≥ 90%
- [ ] release-notes.json 새 버전 항목 추가
- [ ] AI 챗봇 KB Q&A 추가 ("위젯이 사라졌어요" 등 3~5개)

### 5.2 품질 기준

- [ ] `domain/` → 외부 의존 0건
- [ ] `usecases/` → `adapters/`, `infrastructure/` import 0건 (해당 시)
- [ ] `any` 타입 사용 0건
- [ ] `rounded-sp-*` 사용 0건
- [ ] sp-* 디자인 토큰만 사용 (하드코딩 hex 0건)
- [ ] `electron/main.ts`에 추가되는 코드 < 80 lines
- [ ] 진단 IPC는 mutation 0건 (read-only 보장)

### 5.3 회귀 검증 시나리오 (5개)

| ID | 시나리오 | 기대 결과 |
|----|----------|-----------|
| RG-01 | 진단 패널 열기/닫기 후 Win+D 폴링 자동 복구 | 정상 동작 (기존 동작 유지) |
| RG-02 | 진단 패널 열기/닫기 후 절전 → 복귀 자동 복구 | 정상 동작 |
| RG-03 | "위젯 재생성" 후 `currentDesktopMode='topmost'`이면 alwaysOnTop 자동 재적용 | 자동 재적용됨 |
| RG-04 | 진단 패널을 위젯 모드에서 열어도 위젯이 자체적으로 hide되지 않음 | 위젯 표시 유지 |
| RG-05 | macOS에서 Windows 전용 값 표시 시 crash 없음 | "지원되지 않음" 메시지 표시 |

---

## 6. 위험 및 대응

| 위험 | 영향도 | 발생 가능성 | 대응 |
|------|--------|-------------|------|
| **`electron/main.ts` 추가 비대화** — 3,587 lines에 또 추가하면 유지보수 위험 | High | High | **`electron/widgetDiagnostics.ts` 신규 모듈 분리 필수**. main.ts에는 IPC handler 등록과 모듈 위임만 남김 (< 80 lines 추가). |
| **위젯 destroy 상태에서 진단 호출** — null reference crash | High | Medium | 모든 진단 함수가 `widgetWindow == null` 또는 `isDestroyed()` 케이스를 우선 처리. 진단 결과는 `exists:false`로 명시. |
| **"위젯 재생성"이 사용자 데이터 손실 유발** | High | Low | createWidgetWindow는 마지막 bounds를 디스크에서 다시 읽어서 복원. renderer는 stateless (Zustand는 main 윈도우에서 영속화). 사용자 입력 중인 폼은 위젯에 없음 (메모/할일은 자동 저장). |
| **alwaysOnTop 재적용 race** — `setAlwaysOnTop(true)` 직후 OS가 다시 풀어버리면 효과 없음 | Medium | Medium | 재적용 후 100ms 뒤 진단을 한 번 더 갱신해서 사용자에게 시각 피드백 제공. |
| **macOS에서 동작 차이** — Windows 가정으로 작성된 진단이 mac에서 의미 없음 | Medium | Medium | `process.platform` 분기. macOS는 `currentDesktopMode='topmost'`만 의미 있음. WorkerW 관련 진단은 Windows 전용으로 표시. |
| **클립보드 복사 권한** — Electron에서는 항상 가능하지만 전제 검증 | Low | Low | `clipboard.writeText` 직접 호출 (renderer가 아닌 main에서). |
| **사용자가 진단 패널을 자주 안 씀** — 학습 비용 | Low | Medium | 위젯 우클릭 메뉴 + 설정 탭 양쪽에 진입점 배치. 첫 사용 시 1회성 코치마크는 본 라운드 제외(추후 검토). |
| **개인정보 우려** — 진단 정보 복사 시 어떤 데이터가 포함되는지 불투명 | Low | Low | 클립보드에 복사되는 JSON은 좌표·플래그 외 데이터 0건. 패널에 "이 정보에는 메모/학생 데이터가 포함되지 않아요" 안내 라벨. |

---

## 7. 아키텍처 고려사항

### 7.1 프로젝트 레벨 선택

| 레벨 | 특성 | 추천 대상 | 선택 |
|------|------|-----------|:---:|
| Starter | 단순 구조 | 정적 사이트 | ☐ |
| **Dynamic** | 기능 단위 모듈 | Electron 데스크톱 앱 | **☑ (현재)** |
| Enterprise | 엄격한 레이어 분리 + DI | 마이크로서비스 | ☐ |

### 7.2 핵심 아키텍처 결정

| 결정 | 옵션 | 선택 | 근거 |
|------|------|------|------|
| 진단 로직 위치 | `main.ts` 인라인 / 별도 모듈 | **별도 모듈 `electron/widgetDiagnostics.ts`** | main.ts 비대화 차단. 순수 함수 단위 테스트 가능. |
| 진단 결과 저장 | 영속화 / in-memory | **in-memory** | 진단은 현재 상태 스냅샷이므로 영속화 불필요. `lastRecoveredAt`도 세션 단위로 충분. |
| IPC 채널 분리 | get/recover 단일 vs 분리 | **분리 (`widget:getDiagnostics`, `widget:recover`)** | read/write 분리로 사이드 이펙트 격리. mock 테스트 용이. |
| 복구 액션 표현 | 채널 다중화 / action union | **action union** | 미래 액션 추가 시 IPC 채널 폭증 방지. payload 타입 명확. |
| UI 위치 | 모달 / 페이지 / 인라인 카드 | **설정 탭 인라인 카드 + 위젯 우클릭 메뉴 항목** | 별도 모달 추가는 학습 비용. 기존 설정 패턴 재사용. |
| 외부 로그 전송 | Sentry / 자체 / 없음 | **없음 (로컬 + 클립보드)** | 개인정보 보호 우선. 사용자 자발적 공유 경로만 제공. |
| Win/Mac 분기 | 통합 / 분기 | **분기** | macOS는 WorkerW 등 Windows 전용 진단 항목 무관. fallback 메시지로 처리. |

### 7.3 Clean Architecture 적용

```
Selected Level: Dynamic (Electron + React + Clean Architecture 4-layer)

본 기능의 레이어별 변경:

┌─────────────────────────────────────────────────────────────┐
│ infrastructure/ (Electron, 파일 I/O)                        │
│  └─ electron/widgetDiagnostics.ts (NEW)                     │
│      - collectWidgetDiagnostics(widgetWindow, ctx)          │
│      - executeWidgetRecovery(action, widgetWindow, ctx)     │
│      - computeRecoveredBounds(bounds, displays) [pure]      │
│      - mapDiagnosticsToHumanMessage(report) [pure]          │
│  └─ electron/main.ts (MODIFIED, < 80 lines 추가)            │
│      - IPC handler 2개 등록 (widget:getDiagnostics/recover) │
│      - lastRecoveredAt / lastErrorMessage 추적 hook         │
│  └─ electron/preload.ts (MODIFIED)                          │
│      - electronAPI.widgetDiagnostics.{get,recover} 노출     │
├─────────────────────────────────────────────────────────────┤
│ adapters/  (React + Zustand)                                │
│  └─ components/Settings/WidgetTroubleshootingPanel.tsx (NEW)│
│      - 진단 카드 + 복구 버튼 + 진단 정보 복사               │
│  └─ components/Settings/tabs/WidgetTab.tsx (MODIFIED)       │
│      - 패널 임베드                                          │
│  └─ components/Widget/WidgetContextMenu.tsx (MODIFIED)      │
│      - "위젯 문제 해결…" 메뉴 항목 추가                     │
│  └─ types/electron.d.ts (MODIFIED)                          │
│      - widgetDiagnostics 메서드 시그니처                    │
├─────────────────────────────────────────────────────────────┤
│ usecases/  (애플리케이션 로직)                              │
│  └─ (해당 없음 — 진단/복구는 인프라 측 동작)                │
├─────────────────────────────────────────────────────────────┤
│ domain/  (순수 비즈니스 규칙)                               │
│  └─ (해당 없음)                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.4 IPC 채널 추가 (총 2개)

| 채널 | 방향 | payload | 응답 | 용도 |
|------|------|---------|------|------|
| `widget:getDiagnostics` | renderer → main | `void` | `WidgetDiagnosticsReport` | 위젯 상태 스냅샷 조회 (read-only) |
| `widget:recover` | renderer → main | `{ action: 'show' \| 'moveIntoVisibleArea' \| 'recreate' \| 'reapplyAlwaysOnTop' \| 'resetPosition' }` | `WidgetRecoveryResult` | 위젯 수동 복구 |

### 7.5 타입 스케치 (Design 단계에서 정밀화)

```typescript
// electron/widgetDiagnostics.ts
export type WidgetRecoveryAction =
  | 'show'
  | 'moveIntoVisibleArea'
  | 'recreate'
  | 'reapplyAlwaysOnTop'
  | 'resetPosition';

export interface WidgetDiagnosticsReport {
  exists: boolean;
  visible: boolean;
  focused: boolean;
  minimized: boolean;
  destroyed: boolean;
  alwaysOnTop: boolean;
  opacity: number;
  bounds: { x: number; y: number; width: number; height: number } | null;
  insideAnyDisplay: boolean;
  displayId: number | null;
  desktopMode: 'normal' | 'topmost';
  currentWindowMode: 'main' | 'widget' | 'icon';
  lastRecoveredAt: number | null;
  lastErrorMessage: string | null;
  osPlatform: NodeJS.Platform;
  unsupportedReason: string | null; // macOS/Linux에서 일부 항목 무관할 때
}

export interface WidgetRecoveryResult {
  ok: boolean;
  action: WidgetRecoveryAction;
  message: string;             // 한국어 사용자 메시지
  beforeBounds: { x: number; y: number; width: number; height: number } | null;
  afterBounds: { x: number; y: number; width: number; height: number } | null;
}
```

---

## 8. 컨벤션 사전 검토

### 8.1 기존 프로젝트 컨벤션 체크

- [x] `CLAUDE.md`에 코딩 컨벤션 섹션 존재
- [x] `tsconfig.json` strict 모드 적용
- [x] Path Alias 정의됨 (`@domain/*`, `@usecases/*`, `@adapters/*`, `@infrastructure/*`)
- [x] Tailwind CSS 디자인 시스템 (sp-* 토큰)
- [x] Noto Sans KR 폰트
- [ ] 라운딩 정책 (`feedback_rounding_policy.md`) — `rounded-sp-*` 금지, Tailwind 기본 키만 사용 ← **본 기능 준수 필수**

### 8.2 본 기능에서 추가/유지할 컨벤션

| 분류 | 현재 상태 | 본 기능에서 적용 | 우선순위 |
|------|-----------|------------------|:--------:|
| 라운딩 | `rounded-sp-*` 금지 | `rounded-xl` (카드), `rounded-lg` (버튼) | High |
| 디자인 토큰 | sp-* 사용 | `sp-card`, `sp-border`, `sp-accent` 사용 | High |
| Import 순서 | 레이어별 분리 | infrastructure → adapters 순 | Medium |
| any 금지 | strict 모드 | 모든 IPC payload/응답 타입 정의 | High |
| 외부 의존 신규 도입 | 없음 | 신규 npm 의존성 0건 | High |
| 모듈 분리 | main.ts 비대화 차단 | `electron/widgetDiagnostics.ts`로 분리 | High |

### 8.3 환경 변수

추가 환경 변수 없음.

---

## 9. 다음 단계

1. [ ] 사용자 승인 → `/pdca design widget-stability-recovery` 진행
2. [ ] Design 단계에서 다음 정밀화:
   - `WidgetDiagnosticsReport` / `WidgetRecoveryResult` 타입 최종 확정
   - `mapDiagnosticsToHumanMessage(report)` 한국어 매핑 케이스 표 (10+ 케이스)
   - Settings 탭 / 위젯 컨텍스트 메뉴 양쪽 진입점 mockup HTML
   - `frontend-design` 또는 `bkit:frontend-architect` 협업으로 디자인 검토
3. [ ] 구현 (Do Phase) — 예상 1.5~2 작업일
   - Step 1: `electron/widgetDiagnostics.ts` 신규 + 단위 테스트
   - Step 2: `main.ts` IPC 등록 + `preload.ts` 노출 + 글로벌 타입
   - Step 3: `WidgetTroubleshootingPanel.tsx` UI
   - Step 4: `WidgetTab.tsx` + `WidgetContextMenu.tsx` 진입점
4. [ ] Gap 분석 (Check Phase) — Match Rate ≥ 90%
5. [ ] 회귀 시나리오 5개 수동 체크
6. [ ] release-notes.json 항목 추가 + AI 챗봇 KB Q&A 3~5개 추가
7. [ ] 다음 릴리스 (v2.0.3 또는 v2.1.0)에 포함

---

## Version History

| 버전 | 날짜 | 변경사항 | 작성자 |
|------|------|----------|--------|
| 0.1 | 2026-05-04 | 최초 Draft 작성. 사용자 프롬프트(`02_widget-mode-stability.md`) 기반. icon-mode.plan.md 템플릿 준수. 기존 `recoverWidget`/`ensureWidgetOnScreen`/`doRestoreWidget` 자산 재활용 전제. | pblsketch |
