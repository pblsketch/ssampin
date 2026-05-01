# 아이콘 모드 (Icon Mode) Planning Document

> **Summary**: 메인 프로그램 종료 시 화면 위에 떠 있는 작은 플로팅 아이콘으로 전환되는 3번째 윈도우 모드를 신설하고, 아이콘 클릭 시 부드러운 fade 애니메이션과 함께 위젯 또는 풀앱으로 확장되도록 한다. 기존 `widget`/`tray`/`ask` 3종이던 X 버튼 동작에 `icon` 옵션을 추가한다.
>
> **Project**: SsamPin
> **Version**: v2.0.2 (예정)
> **Author**: pblsketch
> **Date**: 2026-05-01
> **Status**: Draft v0.2 (사용자 결정 반영: 풀스크린 자동 hide 제거, 뱃지 제거, v2.0.2 타깃)

---

## 1. 개요

### 1.1 목적

이 기능이 해결하는 문제:

1. **현재의 위젯 모드는 화면 면적을 적지 않게 차지** — 수업 중 PPT 발표 등 풀스크린 작업 중에는 거추장스럽다.
2. **반대로 트레이로만 숨기면 존재감이 사라져** — 다음 교시 시작·미확인 일정 등을 놓치기 쉽다.
3. 두 모드 사이의 빈자리: **존재는 인지되되 화면을 거의 차지하지 않는 floating 아이콘**이 필요하다.
4. 학생 시점에서 봐도 안전한 "최소 노출" 모드 (수업 중 학생 모니터에 비춰질 때 학생 정보가 노출되지 않음)

### 1.2 배경

쌤핀 사용자의 실제 사용 시나리오는 3-state 모델로 자연스럽게 분류된다:

| 시나리오 | 적합한 모드 | 비고 |
|----------|-------------|------|
| 방과 후 업무 (일정/메모/학생기록 입력) | 풀앱 | 현재 `mainWindow` |
| 쉬는 시간 (다음 교시·할일 빠른 확인) | 위젯 | 현재 `widgetWindow` |
| 수업 중 (PPT 풀스크린, 학생 시선 노출 위험) | **아이콘** (NEW) | 본 기능 |

기술 검토 결과 `electron/main.ts`의 [`stickerPickerWindow`](e:/github/ssampin/electron/main.ts#L283) 패턴 (frameless + transparent + alwaysOnTop + `screen-saver` level + `visibleOnFullScreen:true`)이 사실상 아이콘 윈도우의 완성된 템플릿이며, [`fadeInQuickAddWindow`](e:/github/ssampin/electron/main.ts#L108)의 opacity 보간 코드도 fade 전환에 그대로 재사용 가능하다. 따라서 신규 인프라 위험은 매우 낮다.

UX 검토 결과 사용자가 4개 X 버튼 동작(widget/icon/tray/ask)을 한 번에 익히는 것은 학습 비용이 높으므로, **풀앱 → 위젯 → 아이콘**이라는 단계적 축소 계층으로 멘탈 모델을 구성하는 편이 자연스럽다.

### 1.3 관련 문서

- 사용자 제안 컨텍스트: 본 세션 대화 (2026-05-01)
- 기술 검토 보고: oh-my-claudecode:architect 에이전트 출력 (본 세션)
- UX/UI 검토 보고: bkit:frontend-architect 에이전트 출력 (본 세션)
- 디자인 톤 레퍼런스: `design examples/` 폴더, `CLAUDE.md` 디자인 시스템 섹션
- 가까운 구현 템플릿:
  - `electron/main.ts:283-373` — stickerPickerWindow (frameless transparent floating window)
  - `electron/main.ts:108-125` — fadeInQuickAddWindow (opacity 보간)
  - `electron/main.ts:475-504` — widget bounds 저장 패턴
  - `electron/main.ts:760-803` — ensureWidgetOnScreen (멀티모니터 안전망)
  - `electron/main.ts:1076-1106` — readSettingsWidgetOptions (closeAction 스키마)
- 라운드 정책: `feedback_rounding_policy.md` (메모리) — `rounded-sp-*` 금지, Tailwind 기본 키만 사용
- 프론트 협업 정책: `feedback_frontend_agent_collaboration.md` (메모리)

---

## 2. 범위

### 2.1 포함 범위 (In Scope)

- [ ] 새 BrowserWindow `iconWindow` 생성 (frameless + transparent + alwaysOnTop=`screen-saver` + `visibleOnFullScreen:true`)
- [ ] 아이콘 렌더러 컴포넌트 신설: `src/adapters/components/Icon/IconWindow.tsx`
- [ ] `closeAction` 스키마에 `'icon'` 옵션 추가 (`'widget' | 'tray' | 'ask' | 'icon'`)
- [ ] 설정 페이지(`SettingsPage.tsx`) "X 버튼 동작" 라디오에 "아이콘으로 접기" 항목 추가
- [ ] 아이콘 → 위젯 / 아이콘 → 풀앱 전환 시 opacity fade 애니메이션 (Electron `setOpacity` 보간)
- [ ] 역방향 (위젯 → 아이콘, 풀앱 → 아이콘) 전환
- [ ] 아이콘 위치 영속화 (`icon-bounds.json`, 디바운스 500ms — widget-bounds.json 패턴 복제)
- [ ] 멀티모니터 안전망 (`ensureIconOnScreen` — `ensureWidgetOnScreen` 복제)
- [ ] 트레이 컨텍스트 메뉴에 "아이콘 위치 초기화" 추가
- [ ] 기존 윈도우 배열 패턴 통합: `getAllAppWindows()` 헬퍼 추출 (회귀 격리 선결 PR)
- [ ] `data:write` 브로드캐스트 + autoUpdater 등 **8곳 이상에 흩어진 `[mainWindow, widgetWindow]` 배열을 헬퍼로 일원화**
- [ ] 아이콘 우클릭 컨텍스트 메뉴 (위젯 열기 / 전체 앱 열기 / 위치 초기화 / 종료)
- [ ] 아이콘 더블클릭 → 풀앱 직행
- [ ] 아이콘 (단일) 클릭 → 마지막 state 복원 (위젯이었으면 위젯, 풀앱이었으면 풀앱)
- [ ] 아이콘 드래그 이동 (`-webkit-app-region: drag`)
- [ ] 호버 시 100ms 딜레이 툴팁 (현재 교시 + 다음 교시 정보)
- [ ] 알림 발생 시 펄스 효과 (`animate-pulse`, `ring-2 ring-sp-accent`)
- [ ] 아이콘 비주얼: `build/icon.png` 축소판 (쌤핀 앱 아이콘 그대로, 56×56에 맞춰 렌더)
- [ ] `prefers-reduced-motion: reduce` 시 fade duration 0
- [ ] 첫 활성화 시 1회성 코치마크 ("드래그로 이동, 클릭으로 위젯 열기")
- [ ] 마이그레이션: 기존 사용자는 `closeAction='widget'` 기본값 유지 (강제 전환 금지)
- [ ] 업데이트 카드(UpdateNotification.tsx) "새 기능: 아이콘 모드" 안내
- [ ] **첫 실행 시 인앱 토스트**: "X 버튼 동작 설정에서 아이콘 모드를 켤 수 있어요" (1회성)
- [ ] release-notes.json v2.0.2 항목 추가
- [ ] AI 챗봇 KB 문서에 아이콘 모드 Q&A 추가 (`scripts/ingest-chatbot-qa.mjs`)

### 2.2 제외 범위 (Out of Scope)

- 모바일 앱(`src/mobile/`) — 데스크톱 Electron 전용
- macOS 네이티브 위젯 SDK 통합 (NSPopover 등) — 비용 대비 가치 낮음
- 아이콘에 라이브 차트/미니 캘린더 등 정보량 큰 표시 — 56×56 px 한계로 노이즈 위험
- 위젯 ↔ 풀앱 직접 전환 애니메이션 변경 (기존 동작 유지)
- 아이콘에서 직접 메모/할일 입력 (Quick Add 별도 기능 활용)
- 아이콘 모양/색상 사용자 커스터마이징 (v2 검토)
- 위치 자석 효과 (화면 가장자리 snap) — v2 검토

---

## 3. 요구사항

### 3.1 기능 요구사항 (Functional Requirements)

| ID | 요구사항 | 우선순위 | 상태 |
|----|----------|----------|------|
| FR-01 | 설정에서 X 버튼 동작을 `'아이콘으로 접기'`로 선택할 수 있다 | Must | Pending |
| FR-02 | 풀앱에서 X 클릭 → `closeAction='icon'`이면 풀앱 hide + 아이콘 윈도우 show (opacity 0→1) | Must | Pending |
| FR-03 | 위젯 우클릭 컨텍스트 메뉴에 "아이콘으로 접기" 항목이 표시되고 클릭 시 위젯 hide + 아이콘 show | Must | Pending |
| FR-04 | 아이콘 단일 클릭 시 마지막으로 열려있던 state (위젯/풀앱) 복원, opacity 1→0으로 아이콘 사라짐 | Must | Pending |
| FR-05 | 아이콘 더블클릭 시 항상 풀앱 직행 | Should | Pending |
| FR-06 | 아이콘은 56×56 px frameless transparent BrowserWindow, `alwaysOnTop='screen-saver'`, `visibleOnFullScreen:true` | Must | Pending |
| FR-07 | 아이콘 위치는 `icon-bounds.json`에 디바운스 500ms로 저장, 다음 실행 시 복원 | Must | Pending |
| FR-08 | 아이콘이 모든 디스플레이 밖으로 밀리면 자동으로 보이는 영역으로 보정 (`ensureIconOnScreen`) | Must | Pending |
| FR-09 | 트레이 우클릭 메뉴에 "아이콘 위치 초기화" 항목 (사용자가 분실 시 복구) | Should | Pending |
| FR-10 | 아이콘 우클릭 시 컨텍스트 메뉴 (위젯 열기 / 전체 앱 열기 / 위치 초기화 / 종료) | Should | Pending |
| FR-11 | 아이콘 호버 시 100ms 후 툴팁 — 현재 교시 + 다음 교시 (없으면 "오늘 일정 없음") | Should | Pending |
| FR-12 | 다음 교시 시작 5분 전·미확인 알림 발생 시 펄스 효과 (`animate-pulse`, `ring-2 ring-sp-accent`) | Should | Pending |
| FR-13 | 아이콘 비주얼: `build/icon.png` 축소판 (쌤핀 앱 아이콘 그대로, 56×56에 맞춰 렌더). 우상단 뱃지 없음 | Must | Pending |
| FR-14 | `prefers-reduced-motion: reduce` 시 fade duration = 0 (즉시 전환) | Must | Pending |
| ~~FR-15~~ | ~~다른 앱 풀스크린 진입 감지 시 아이콘 자동 hide~~ | **제외** (사용자 결정 2026-05-01: 그냥 떠 있어도 됨) | — |
| FR-16 | 첫 활성화 시 1회성 코치마크 말풍선 노출 ("드래그로 이동, 클릭으로 열기") | Could | Pending |
| FR-17 | 기존 사용자는 v2.0.2 업데이트 후에도 `closeAction='widget'` 기본값 유지 (강제 전환 금지) | Must | Pending |
| FR-18 | 신규 IPC 채널 4개: `icon:show`, `icon:hide`, `icon:set-bounds`, `icon:expand` | Must | Pending |
| FR-19 | 모든 윈도우 배열 패턴(`[mainWindow, widgetWindow]`)을 `getAllAppWindows()` 헬퍼로 일원화 (회귀 격리, **`feature/icon-mode` 브랜치 내 첫 커밋으로 분리**) | Must | Pending |
| FR-20 | autoUpdater 알림 + `data:write` 브로드캐스트 + 단축키가 아이콘 윈도우에서도 정상 동작 | Must | Pending |
| FR-21 | v2.0.2 첫 실행 시 1회성 인앱 토스트: "X 버튼 동작 설정에서 아이콘 모드를 켤 수 있어요" | Should | Pending |

### 3.2 비기능 요구사항 (Non-Functional Requirements)

| 분류 | 기준 | 측정 방법 |
|------|------|-----------|
| 성능 (메모리) | 아이콘 모드 진입 시 RAM 증가 < 50MB (3-state 모두 alive 시) | 작업 관리자 — 풀앱 단독 vs 풀앱+아이콘 비교 |
| 성능 (애니메이션) | fade 220ms 동안 60fps 유지, 끊김 없음 | Windows + macOS 양쪽 육안 검증 |
| 안정성 (풀스크린) | Windows PPT 슬라이드쇼 + macOS Keynote 위에서 아이콘이 보임 (또는 자동 hide 옵션 동작) | 실제 환경 PoC #1 |
| 안정성 (멀티모니터) | 모니터 disconnect 후 재연결 시 아이콘 위치 복구 | `display-removed` 이벤트 발생 시 보정 확인 |
| 안정성 (회귀) | 기존 위젯 모드·트레이 모드 동작 100% 유지 | 회귀 시나리오 7개 수동 체크 (아래 5.5 참조) |
| 아키텍처 | Clean Architecture 의존성 규칙 준수 | `npx tsc --noEmit` 에러 0개 |
| 디자인 일관성 | sp-* 토큰 사용, `rounded-sp-*` 금지, Tailwind 기본 라운딩만 | 코드 리뷰 + grep 체크 |
| 접근성 | WCAG 2.5.5 (터치 타겟 ≥ 44×44 px), `prefers-reduced-motion` 대응 | 자동/수동 검증 |
| 테스트 | vitest 신규 테스트 (스키마 마이그레이션, 위치 보정 로직) | `npm run test` |

---

## 4. 사용자 시나리오 (User Stories)

**US-1: 수업 중 풀스크린 PPT 사용**
> 교사가 PPT를 풀스크린으로 띄운 채 수업한다. 쌤핀이 화면을 가리지 않으면서도 다음 교시 알림은 놓치고 싶지 않다.
>
> - 흐름: 수업 전 풀앱에서 X 클릭 → 아이콘으로 축소 → PPT 풀스크린 진행 → 다음 교시 5분 전 아이콘 펄스 → 수업 종료 후 아이콘 클릭 → 위젯으로 펼쳐서 다음 교시 정보 확인
> - 수용 기준: PPT 풀스크린 위에 56×56 아이콘이 보인다 (`alwaysOnTop='screen-saver'` + `visibleOnFullScreen:true`).

**US-2: 학생 시선 노출 회피**
> 교사 모니터가 빔프로젝터에 미러링되는 환경에서, 학생 정보가 적힌 풀앱·위젯이 학생들에게 보이는 것을 원하지 않는다.
>
> - 흐름: 수업 전 X 클릭 → 아이콘 모드 → 학생 정보 일체 노출 없음 (아이콘 자체에 정보 표시 없음)
> - 수용 기준: 56×56 앱 아이콘 외에는 어떤 학생 데이터도 화면에 노출되지 않는다. 호버 시에만 툴팁 노출.

**US-3: 책상 한 켠에 항상 떠 있는 알림 안테나**
> 풀앱이나 위젯을 띄울 만큼은 아니지만, 쌤핀이 살아있다는 시각적 신호는 받고 싶다.
>
> - 흐름: 출근 후 풀앱 → 일정 입력 → X 클릭 → 아이콘 모드로 하루 종일 우하단에 떠 있음 → 알림 발생 시 펄스
> - 수용 기준: 아이콘이 화면 우하단에 항상 보이고, 펄스 시 시야 끝에서도 인지 가능하다.

**US-4: 아이콘 클릭으로 위젯 자연 확장**
> 아이콘 클릭 시 갑자기 큰 창이 튀어나오는 게 아니라, 부드럽게 펼쳐지는 느낌을 받고 싶다.
>
> - 흐름: 아이콘 클릭 → 220ms fade-out → 동시에 위젯 fade-in
> - 수용 기준: 사용자가 "확장처럼" 느낀다 (PoC #2에서 체감 검증).

**US-5: 아이콘 분실 후 복구**
> 모니터를 disconnect 했더니 아이콘이 사라졌다. 또는 화면 밖으로 드래그해서 못 찾겠다.
>
> - 흐름: 트레이 우클릭 → "아이콘 위치 초기화" 클릭 → 화면 우하단으로 복귀
> - 수용 기준: 1클릭으로 복구 가능, `display-removed` 이벤트 시 자동 보정.

**US-6: 기존 위젯 모드 사용자**
> v1.13.x로 업데이트했지만 평소처럼 X 클릭 → 위젯 모드로 동작했으면 한다.
>
> - 흐름: 기존 사용자 → 업데이트 → X 클릭 → 기존과 동일하게 위젯 모드
> - 수용 기준: 기본값 변경 없음, 업데이트 카드에 "새 기능 안내" 1회성 노출만.

---

## 5. 성공 기준

### 5.1 완료 정의 (Definition of Done)

- [ ] FR-01 ~ FR-21 모두 구현 완료 (FR-15 제외)
- [ ] PoC #1 (PPT 풀스크린 위 가시성) PASS
- [ ] PoC #2 (fade 220ms 체감) PASS
- [ ] `npx tsc --noEmit` 에러 0개
- [ ] `npm run build` 성공
- [ ] `npm run test` 통과
- [ ] 회귀 시나리오 7개 수동 체크 PASS (아래 5.5)
- [ ] 디자인 검토 통과 (frontend-design 또는 bkit:frontend-architect 에이전트)
- [ ] AI 챗봇 KB 업데이트 + release-notes.json v1.13.x 항목 추가
- [ ] PDCA Match Rate ≥ 90%

### 5.2 품질 기준

- [ ] `domain/` → 외부 의존 0건 (import 검사)
- [ ] `usecases/` → `adapters/`, `infrastructure/` import 0건
- [ ] `any` 타입 사용 0건
- [ ] `rounded-sp-*` 사용 0건 (라운딩 정책 준수)
- [ ] sp-* 디자인 토큰만 사용 (하드코딩 hex 0건)
- [ ] 메모리 증가 < 50MB

### 5.3 PoC 통과 기준 (선결 조건)

| PoC | 검증 항목 | 통과 기준 | 예상 시간 |
|-----|----------|-----------|-----------|
| #1 | Windows PPT 슬라이드쇼 위에 아이콘이 보이는가 | 보임 (또는 자동 hide 옵션 정상 동작) | 0.5일 |
| #2 | macOS Keynote 풀스크린 위에 아이콘이 보이는가 | 보임 | 0.5일 (Mac 빌드 GitHub Actions) |
| #3 | opacity 0→1 fade 220ms가 "확장처럼" 느껴지는가 | 사용자 1명 체감 PASS | 0.5일 |

PoC #1/#3 실패 시 본 기능 전면 재검토 (IPC 트릭, BrowserWindow 위치 보정 등 대안 모색).

### 5.4 위험 평가 결과 (검토 결과 — 통과 시 본격 착수)

| 위험 | 검토 의견 | 결론 |
|------|-----------|------|
| 윈도우 배열 누락 회귀 | `getAllAppWindows()` 헬퍼 선결 PR로 격리 | 진행 가능 |
| PPT 풀스크린 가림 | PoC #1로 사전 검증 | PoC 결과 의존 |
| 3-state 전환 race | 상태머신화로 격리 (Design 단계) | 진행 가능 |

### 5.5 회귀 검증 시나리오 (7개)

| ID | 시나리오 | 기대 결과 |
|----|----------|-----------|
| RG-01 | 기존 사용자 업데이트 후 X 클릭 | 위젯 모드 진입 (기본값 유지) |
| RG-02 | `closeAction='widget'`로 명시 설정 후 X 클릭 | 위젯 모드 진입 |
| RG-03 | `closeAction='tray'`로 설정 후 X 클릭 | 트레이로만 숨김 |
| RG-04 | `closeAction='ask'`로 설정 후 X 클릭 | 다이얼로그 표시 |
| RG-05 | 아이콘 모드 진입 → autoUpdater 업데이트 알림 발생 | 알림이 누락되지 않고 표시 (트레이 또는 아이콘에 시각화) |
| RG-06 | 아이콘 모드에서 다른 기기 동기화로 데이터 변경 | `data:write` 브로드캐스트가 아이콘 윈도우에도 도달 |
| RG-07 | 위젯 모드에서 X 클릭 (위젯 자체 닫기) | 트레이로 숨김 (기존 동작) |

---

## 6. 위험 및 대응

| 위험 | 영향도 | 발생 가능성 | 대응 |
|------|--------|-------------|------|
| **윈도우 배열 누락 회귀** — `[mainWindow, widgetWindow]` 패턴이 8곳 이상 흩어져 있어 iconWindow 추가 시 1곳만 빠뜨려도 silent bug | High | High | **선결 PR로 `getAllAppWindows()` 헬퍼 추출 후 머지 → 그 위에 본 기능 PR**. autoUpdater + IPC + 단축키 + 브로드캐스트 4영역 체크리스트화 |
| **PPT 풀스크린 위 동작 불확실** — Windows F11/슬라이드쇼는 `visibleOnFullScreen:true`(Mission Control 기준)와 별개 | High | Medium | **PoC #1 우선** 실시. PoC 실패 시 사용자가 우클릭으로 수동 hide 가능하게 fallback (FR-15 자동 hide는 사용자 결정으로 제외됨) |
| **3-state 전환 race** — 기존 `isQuitting`/`isSystemSuspending` 플래그 분기에 icon state 추가 시 미묘한 race | High | Medium | Design 단계에서 명시적 상태머신(state diagram) 작성. icon ↔ widget ↔ main 전환은 단일 IPC 핸들러로 시리얼화 |
| **사용자 아이콘 분실** — 화면 밖, 모니터 disconnect | Medium | Medium | `ensureIconOnScreen` + `display-removed` 핸들러 + 트레이 메뉴 "위치 초기화" (FR-09) |
| **메모리 비용 증가** — 3-state 모두 alive 시 RAM 부담 | Medium | Low | `memorySaverMode` 패턴 검토 — 아이콘 모드 진입 시 메인 destroy 옵션 (별도 PDCA 검토) |
| **fade 애니메이션 끊김** — Windows DWM 한계 | Medium | Low | `setBounds` 애니메이션 시도 금지, opacity 보간만 사용 (검증된 `fadeInQuickAddWindow` 패턴 복제) |
| **사용자 학습 비용** — 4옵션 라디오는 혼란 | Low | Medium | "풀앱 → 위젯 → 아이콘"이라는 단계적 축소 멘탈 모델로 설명. 1회성 코치마크 (FR-16) |
| **알림 노이즈** — 펄스/뱃지 과다 시 거추장스러움 | Low | Medium | 뱃지는 다음 교시 번호 단일 지표만, 펄스는 이벤트 발생 시만 (확인 시 즉시 중단) |

---

## 7. 아키텍처 고려사항

### 7.1 프로젝트 레벨 선택

| 레벨 | 특성 | 추천 대상 | 선택 |
|------|------|-----------|:---:|
| Starter | 단순 구조 | 정적 사이트 | ☐ |
| **Dynamic** | 기능 단위 모듈 | Electron 데스크톱 앱 | **☑ (현재)** |
| Enterprise | 엄격한 레이어 분리 + DI | 마이크로서비스 | ☐ |

쌤핀은 이미 Dynamic 레벨이며 Clean Architecture 4레이어 구조를 사용 중. 본 기능도 동일 구조에 통합한다.

### 7.2 핵심 아키텍처 결정

| 결정 | 옵션 | 선택 | 근거 |
|------|------|------|------|
| 윈도우 구현 | 트레이 / frameless BrowserWindow / 네이티브 위젯 | **frameless transparent BrowserWindow** | `stickerPickerWindow` 검증된 패턴 재사용. 화면 위 floating 요건 충족 |
| 전환 애니메이션 | `setBounds` 보간 / opacity 보간 / CSS transform | **opacity 보간 (Electron `setOpacity`)** | Windows DWM에서 setBounds는 항상 jerky. 검증된 `fadeInQuickAddWindow` 패턴 |
| 윈도우 인스턴스 | 단일 윈도우 resize / 다중 윈도우 show-hide / 다중 윈도우 destroy-create | **다중 윈도우 show-hide** | 기존 `mainWindow`/`widgetWindow` 패턴과 일치. 메모리 우려는 `memorySaverMode`로 별도 해결 |
| 상태 영속화 | localStorage / JSON 파일 | **JSON 파일 (`icon-bounds.json`)** | `widget-bounds.json`과 동일 패턴, 디바운스 500ms |
| `closeAction` 스키마 | enum 확장 / 별도 키 신설 | **enum 확장 (`'widget' \| 'tray' \| 'ask' \| 'icon'`)** | 하위 호환 유지 (`closeToWidget` 폴백 로직 보존) |
| 윈도우 배열 패턴 통합 | 인라인 유지 / `getAllAppWindows()` 헬퍼 추출 | **헬퍼 추출 (선결 PR)** | 8곳 이상 흩어진 배열 → 회귀 격리 필수 |

### 7.3 Clean Architecture 적용

```
Selected Level: Dynamic (Electron + React + Clean Architecture 4-layer)

본 기능의 레이어별 변경:

┌─────────────────────────────────────────────────────────────┐
│ infrastructure/  (Electron, 파일 I/O)                       │
│  └─ electron/main.ts                                        │
│       - createIconWindow() 신규                             │
│       - readSettingsWidgetOptions: closeAction에 'icon' 추가│
│       - getAllAppWindows() 헬퍼 (선결)                      │
│       - icon-bounds.json 영속화                             │
│       - ensureIconOnScreen 안전망                           │
│  └─ electron/preload.ts                                     │
│       - icon:show / icon:hide / icon:set-bounds /            │
│         icon:expand IPC bridge                              │
├─────────────────────────────────────────────────────────────┤
│ adapters/  (React + Zustand)                                │
│  └─ components/Icon/IconWindow.tsx (NEW)                    │
│  └─ components/Icon/IconBadge.tsx (NEW)                     │
│  └─ components/Icon/IconTooltip.tsx (NEW)                   │
│  └─ components/Settings/SettingsPage.tsx                    │
│       - X 버튼 동작 라디오에 '아이콘으로 접기' 추가         │
│  └─ components/Widget/WidgetContextMenu.tsx                 │
│       - "아이콘으로 접기" 메뉴 항목 추가                    │
├─────────────────────────────────────────────────────────────┤
│ usecases/  (애플리케이션 로직)                              │
│  └─ window/ResolveCloseAction.ts (선택적, 검토)             │
│       - closeAction 분기 결정 로직 (현재 main.ts에 있음)    │
├─────────────────────────────────────────────────────────────┤
│ domain/  (순수 비즈니스 규칙)                               │
│  └─ valueObjects/WindowMode.ts (NEW, 옵션)                  │
│       - type WindowMode = 'icon' | 'widget' | 'main'        │
└─────────────────────────────────────────────────────────────┘
```

### 7.4 IPC 채널 추가 (총 4개)

| 채널 | 방향 | 용도 |
|------|------|------|
| `icon:show` | renderer → main | 아이콘 윈도우 표시 (fade-in) |
| `icon:hide` | renderer → main | 아이콘 윈도우 숨김 (fade-out) |
| `icon:set-bounds` | renderer → main | 사용자 드래그 후 위치 저장 (디바운스 500ms) |
| `icon:expand` | renderer → main | 아이콘 → 위젯 또는 풀앱 전환 (단일 클릭/더블클릭 결과) |

---

## 8. 컨벤션 사전 검토

### 8.1 기존 프로젝트 컨벤션 체크

- [x] `CLAUDE.md`에 코딩 컨벤션 섹션 존재
- [x] `tsconfig.json` strict 모드 적용
- [x] Path Alias 정의됨 (`@domain/*`, `@usecases/*`, `@adapters/*`, `@infrastructure/*`)
- [x] Tailwind CSS 디자인 시스템 (sp-* 토큰)
- [x] Noto Sans KR 폰트
- [ ] 라운딩 정책 (메모리 `feedback_rounding_policy.md`) — `rounded-sp-*` 금지, Tailwind 기본 키만 사용 ← **본 기능 준수 필수**

### 8.2 본 기능에서 추가/유지할 컨벤션

| 분류 | 현재 상태 | 본 기능에서 적용 | 우선순위 |
|------|-----------|------------------|:--------:|
| 라운딩 | `rounded-sp-*` 금지 | `rounded-2xl` (아이콘), `rounded-full` (뱃지), `rounded-xl` (툴팁) | High |
| 디자인 토큰 | sp-* 사용 | `sp-card`, `sp-border`, `sp-accent` 사용 | High |
| 모션 | `prefers-reduced-motion` 대응 | duration 0 폴백 필수 | High |
| Import 순서 | 레이어별 분리 | infrastructure → adapters → usecases → domain 순 | Medium |
| any 금지 | strict 모드 | 모든 IPC payload 타입 정의 | High |

### 8.3 환경 변수

추가 환경 변수 없음. 기존 `IS_DEV`, `VITE_DEV_SERVER_URL` 활용.

---

## 9. 다음 단계

1. [ ] 사용자 승인 → `/pdca design icon-mode` 진행
2. [ ] **PoC #1 ~ #3 실시 (1.5일)** — Design 단계 진행 중에 병행 가능
   - PoC #1: Windows PPT 풀스크린 위 56×56 transparent 윈도우 가시성
   - PoC #2: macOS Keynote 풀스크린 위 가시성 (GitHub Actions Mac 빌드)
   - PoC #3: opacity 0→1 fade 220ms 체감 검증
3. [ ] **선결 커밋** (단일 브랜치 내): `getAllAppWindows()` 헬퍼 추출 + 8곳 이상 흩어진 `[mainWindow, widgetWindow]` 배열 통일 + 메타테스트 1개 추가 (회귀 격리 목적, `feature/icon-mode` 브랜치의 첫 커밋)
4. [ ] Design 문서에서 상태머신(icon ↔ widget ↔ main) 명시
5. [ ] 디자인 검토 — frontend-design 또는 bkit:frontend-architect 에이전트와 mockup HTML 작성 (`mockup/icon-mode/`)
6. [ ] 구현 (Do Phase) — 예상 3~4 작업일
7. [ ] Gap 분석 (Check Phase) — Match Rate ≥ 90% 목표
8. [ ] 회귀 시나리오 7개 수동 체크
9. [ ] AI 챗봇 KB 업데이트 + release-notes.json v2.0.2 항목 추가
10. [ ] v2.0.2 릴리즈

---

## Version History

| 버전 | 날짜 | 변경사항 | 작성자 |
|------|------|----------|--------|
| 0.1 | 2026-05-01 | 최초 Draft 작성. 기술 검토(architect) + UX 검토(frontend-architect) 결과 통합 | pblsketch |
| 0.2 | 2026-05-01 | 사용자 결정 반영: (1) 풀스크린 자동 hide(FR-15) 제외 — 그냥 떠 있음, (2) 우상단 뱃지(FR-13 구) 제거 — 알림은 펄스만, (3) 아이콘 비주얼은 build/icon.png 축소판, (4) 타깃 버전 v1.13.x → **v2.0.2**, (5) 첫 실행 인앱 토스트 FR-21 추가, (6) 브랜치 분리 안 함 — `feature/icon-mode` 단일 브랜치 + 커밋 단위로 분리, (7) PoC #2(macOS Keynote) 필수 사전 검증 | pblsketch |
