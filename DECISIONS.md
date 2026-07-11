# Architecture Decisions

결정은 시간순으로 기록한다. 변경 시 기존 결정을 삭제하지 않고 상태를 `superseded`로 바꾼다.

---

## ADR-001: Clean Architecture 4 레이어

- **상태**: active
- **일자**: 프로젝트 초기
- **결정**: domain → usecases → adapters → infrastructure 4 레이어 구조를 채택한다.
- **근거**: 비즈니스 규칙(domain)을 UI/Electron 기술에서 분리하여 테스트 용이성과 유지보수성 확보.
- **트레이드오프**: 간단한 기능도 4 레이어를 거쳐야 하므로 초기 개발 속도가 느림.

---

## ADR-002: 로컬 JSON 저장 (오프라인 우선)

- **상태**: active
- **일자**: 프로젝트 초기
- **결정**: 모든 데이터를 로컬 JSON 파일로 저장한다. 서버 의존성 없음.
- **근거**: 학교 네트워크 환경이 불안정하므로 오프라인 완전 동작이 핵심 요구사항.
- **트레이드오프**: 기기 간 동기화가 자체 구현 필요. Google Drive 동기화로 보완 중.

---

## ADR-003: Zustand 상태관리

- **상태**: active
- **일자**: 프로젝트 초기
- **결정**: Redux 대신 Zustand를 사용한다.
- **근거**: 보일러플레이트 최소화, TypeScript 친화적, 작은 번들 사이즈.

---

## ADR-004: sp-\* CSS 변수 기반 테마 시스템

- **상태**: active
- **일자**: v2.x
- **결정**: 9개 프리셋 테마 + 커스텀 테마를 `--sp-*` CSS 변수로 구현한다.
- **근거**: Tailwind 유틸리티와 CSS 변수를 결합하여 런타임 테마 전환 지원.
- **트레이드오프**: 하드코딩 HEX를 전면 금지하므로 모든 색상이 토큰을 거쳐야 함.

---

## ADR-005: 지침 분리 전략 (하네스 엔지니어링)

- **상태**: active
- **일자**: 2026-05-19
- **결정**: CLAUDE.md는 80줄 이내 라우팅 문서로 유지하고, 도메인 규칙은 `docs/architecture-rules.md`, `docs/design-system.md`, `docs/coding-conventions.md`로 분리한다.
- **근거**: 하네스 엔지니어링의 "Lost in the Middle" 방지 원칙. CLAUDE.md 294줄에서 핵심 규칙이 세부사항에 묻혀 무시되는 문제 해결.

---

## ADR-006: PDCA 문서 구조

- **상태**: active
- **일자**: 2026-05-19 (기존 구조 문서화)
- **결정**: 기능별 문서를 docs/01-plan → 02-design → 03-analysis → 04-report 4단계로 관리한다.
- **근거**: 기능 개발의 계획-설계-검증-완료 사이클을 문서로 추적. 106개 문서가 이미 이 구조로 운영 중.

---

## ADR-007: 위젯 모드 휠 sign 컨벤션 — blink 채택 + SSOT helper로 추출

- **상태**: active
- **일자**: 2026-05-23
- **결정**:
  - 위젯 모드(LowLevelMouseProc + `webContents.sendInputEvent`) 휠 부호 정책을 `electron/platform/win32Desktop.ts`의 순수 helper `computeWheelDeltas(rawDelta, axis)`로 추출하고 **단일 진실 원천(SSOT)** 으로 삼는다.
  - 부호 컨벤션은 **blink `WebMouseWheelEvent`** 컨벤션을 따른다: Win32 raw 부호를 **그대로 보존** (`deltaY = rawDelta`, `deltaX = rawDelta`). forward 휠(Win32 +120) → blink deltaY +120 → 콘텐츠가 위로 스크롤.
  - 메타테스트 16건(`win32Desktop.test.ts`)이 부호 정책을 enforce해 회귀를 차단한다.
  - 수평 축(WM_MOUSEHWHEEL)은 현 동작 freeze. 사용자 신고 발생 시 별도 PDCA로 재검토.
- **근거**:
  - 원본 코드는 `deltaY = -delta`(DOM `WheelEvent` 컨벤션 오해)로 동작해 사용자 신고 "위젯 모드 상하 스크롤 반대"를 유발.
  - 진단 과정에서 사용자 자가 비교 "다른 브라우저 창에서는 정상" 진술로 OS 자연 스크롤 가설 부정 → sendInputEvent가 OS layer를 우회해 blink로 직접 합성된다는 사실 확정.
  - 정책을 manager inline 코드와 주석에만 두면 회귀 차단 불가 → 순수 helper + 메타테스트로 SSOT 구축.
- **트레이드오프**:
  - blink convention은 DOM `WheelEvent`와 반대 부호 — 일반 BrowserWindow의 wheel 이벤트 핸들러 작성 시 헷갈릴 수 있음. 본 SSOT는 위젯 모드 sendInputEvent 경로에만 적용. React 컴포넌트의 `onWheel` 등은 여전히 DOM 컨벤션을 따른다.
  - Electron major 업그레이드 시 blink 컨벤션이 바뀔 가능성 낮지만 0%는 아님 — ADR과 helper 주석에 "Verified against Electron 40.9.3 on Win11 24H2"를 명시해 업그레이드 트리거 시 메타테스트 + 수동 검증을 재실행한다.
- **헛돈 추론 이력 (미래 회귀 차단용)**:
  - 1차 fix: `+rawDelta`로 정정 시도 → 사용자 "여전히 반대" 보고로 DOM 컨벤션 가설 추정.
  - 2차 정정: `-rawDelta`로 회귀 → 사용자 "여전히 반대" + "다른 브라우저 정상" 보고.
  - 3차 진단: `dist-electron/main.js` mtime + `computeWheelDeltas` grep으로 dev 스크립트가 `electron/` 폴더 변경을 watch하지 않아 1차/2차 fix 모두 한 번도 실행 인스턴스에 도달하지 못했음을 확인. 사용자가 본 동작은 모두 원본 `-delta` 코드.
  - 4차 fix: `node scripts/build-electron.mjs` 명시적 실행 후 dev 재시작 → blink convention 정답 확정.
- **Follow-up (별도 PDCA 권장)**:
  - `scripts/electron-dev.mjs`에 `electron/` 폴더 watch + `build-electron.mjs` 자동 호출 + electron 자동 재실행 추가. 본 함정은 PROGRESS.md(2026-05-21 realtime-tool-student-page-health 빌드 노트)에도 이미 기록된 반복 사고로, 인프라 차원에서 해소 필요.

---

## ADR-008: native-desktop resize SetWindowPos sync 채택 — Electron setBounds WS_CHILD 회귀

- **상태**: active
- **일자**: 2026-05-23
- **결정**:
  - native-desktop(WS_CHILD on WorkerW) 모드의 위젯 가장자리 resize MOUSEMOVE 경로에서 `BrowserWindow.setBounds({x, y, width, height})` 호출을 **`win32 SetWindowPos` sync 호출 (`SWP_ASYNCWINDOWPOS` 제외)** 로 전환한다.
  - 신규 헬퍼 `moveAndResizeWidgetSync(hwnd, x, y, w, h)`를 `electron/platform/win32Desktop.ts`에 추가하며, `moveWidget`(drag 경로용, ASYNC 유지)과는 별개로 보존한다.
  - resize 산식 자체는 순수 함수 `computeResizeBounds(edge, start, dx, dy, minW, minH)`로 추출해 회귀 가드 단위 테스트를 동봉(5케이스).

- **근거**:
  - 사용자 신고(2026-05-23): "바탕화면 위젯 모드에서 위젯 왼쪽 테두리 드래그 시 위젯이 한 번에 사라짐". 작업 표시줄 "위젯 위치 초기화"로 복귀 → BrowserWindow는 살아 있고 좌표/사이즈만 비정상 상태.
  - 진단: 단일 프레임 결정적 teleport. 누적 드리프트 아님 → clamp hysteresis 가설(B2) 폐기.
  - right edge는 정상 → setBounds의 size-only call은 OK, origin+size 동시 변경에서만 회귀.
  - drag 경로(같은 native SetWindowPos, ASYNC 플래그 포함)는 origin-only 변경이라 정상 동작 → sync 변형의 안전성 입증.
  - WS_CHILD HWND + Electron BrowserWindow.setBounds 좌표계 mismatch가 결합되어 단일 프레임 teleport를 일으키는 것으로 진단.

- **트레이드오프**:
  - sync 호출은 매 MOUSEMOVE마다 OS 동기 대기 발생. 다만 resize는 사용자 의도적 드래그 동작이라 빈도가 drag보다 낮고, 정확성이 hot path 성능보다 우선.
  - `cachedPhysicalBounds`를 setBounds 결과가 아닌 의도값으로 직접 갱신 → BrowserWindow.getBounds()와의 일시적 disconnect 가능. resize 종료 시 LBUTTONUP 분기의 `recalcPhysicalBounds` 호출로 재동기화하므로 누적 차이 없음.

- **헛돈 추론 이력 (미래 회귀 차단용)**:
  - 1차 fix(2026-05-07): `win32 SetWindowPos`의 `SWP_ASYNCWINDOWPOS` 플래그로 인한 origin+size race 회피 목적으로 Electron `setBounds`로 전환. 그러나 WS_CHILD HWND 환경에서 setBounds 자체가 새 단일 프레임 teleport 회귀를 만들었음을 사용자 신고로 확인.
  - 2차 fix(2026-05-23, 본 ADR): `SWP_ASYNCWINDOWPOS`만 제외한 sync 변형(`moveAndResizeWidgetSync`)으로 두 race를 동시 해소.
  - 교훈: WS_CHILD HWND 상태에서 Electron 추상화(BrowserWindow.setBounds)는 좌표계 가정이 어긋날 수 있다. native 경로가 더 예측 가능. drag/resize 동선이 같은 native API를 공유하도록 통일하면 회귀 노출 면적이 작아진다.

- **검증 환경**: Electron 40.9.3 on Windows 11 24H2. 사용자 직접 재현 확인 필요.

- **회귀 가드**:
  - `electron/desktopWidgetManager.resize.test.ts` — 5 케이스(left edge clamp 미적용/적용, right edge, top-left corner, SWP flag SSOT 메타테스트).
  - SWP flag 메타테스트는 ADR-007 패턴 차용 — 부호/플래그 SSOT 회귀 차단.

---

## ADR-009: 점심 위치 1급 도메인 승격 + 표 내 인라인 위·아래 버튼 (C안)

- **상태**: active
- **일자**: 2026-05-29

- **결정**:
  - `Settings`에 `lunchAfterPeriod?: number` 정식 필드를 추가한다 (1-based, 이 교시 직후에 점심).
  - 마이그레이션은 **lazy** — 사용자가 PeriodTab에서 위·아래 버튼을 처음 누르는 순간 박힌다. 부팅 시 자동 마이그레이션은 수행하지 않는다.
  - PeriodTab 교시 표 안의 점심 행에 인라인 [↑][↓] 버튼을 배치한다. 위·아래 버튼은 키보드 접근성(↑/↓ 화살표) 1급, 경계 도달 시 disabled+aria-disabled.
  - `getLunchBreakIndex` 우선순위 3단: ① `lunchAfterPeriod` ② `lunchStart`/`lunchEnd` ③ 30분 갭 자동 추정(레거시).
  - 도메인 순수 함수 5개 신규: `shiftPeriodsFrom`, `validatePeriodTimes`, `canMoveLunch`, `moveLunchToAfterPeriod`, `inferLunchAfterPeriod`.

- **근거**:
  - 사용자 피드백(2026-05): "3교시 후 점심으로 옮기는 단일 액션이 없거나 발견하기 어렵다".
  - UX 분석(designer + critic 병렬 분석 2026-05-29): 발견성 3/10. 점심 위치는 사용자 멘탈 모델의 1급 개념인데 UI는 "시간 겹침"으로만 노출해 멘탈 모델 충돌. `lunchAfterPeriod` 셀렉트가 빠른 설정 패널 안에 묻혀 있고 그 셀렉트의 유일한 적용 경로 `[자동 생성]`이 교시 전체를 덮어쓰는 파괴적 액션이라 사용자가 회피.
  - 호출처 사전 조사: `infrastructure/`(NEIS/Excel/HWPX) 직접 의존 0건, `getLunchBreakIndex` 호출처는 PeriodTab/TimetablePage/TimetableEditor 3곳. TimetablePage·TimetableEditor는 학급/교사 탭 두 가지가 같은 lunchIndex를 공유 → 단일 변경으로 양쪽 자동 적용.

- **대안**:
  - **Option α (채택)**: 위·아래 버튼 + lazy 마이그레이션 + 평탄 필드 `lunchAfterPeriod?: number`.
  - **Option β (Phase 3 이연)**: HTML5 드래그 인터랙션 추가. 디자인 시스템 일관성·접근성 검증 비용이 표면적보다 크며, MVP 안정화 후 사용자 행동 데이터 기반으로 결정.
  - **Option γ (Phase 3 이연)**: 모바일 PeriodTimesEditor 동등 기능. 모바일은 시간표 그리드 화면 자체가 없어(`SchedulePage.tsx`는 월별 캘린더) 점심 UI 추가의 컨텍스트가 부재. 시간표 도입과 묶어야 의미 있음.

- **트레이드오프**:
  - lazy 마이그레이션은 부팅 시 invisible state change를 회피하지만, `lunchAfterPeriod`가 박히기 전까지는 폴백 경로(`getLunchBreakIndex` ②/③)로 동작해 동일 사용자가 첫 클릭 전엔 자동 추정과 같은 결과를 본다 — 사용자 입장에선 차이를 못 느낌.
  - 위·아래 버튼은 안전·접근성 1급이지만 "표 안에서 직접 옮긴다"는 시그니파이어가 드래그보다 약함. 점심 행 amber 강조 + grip-style 아이콘으로 부분 보완.
  - `Settings.lunchAfterPeriod`는 옵셔널이므로 동기화 sync 정책에 영향 0. 다중 기기에서 모르는 필드는 그대로 보존됨(모바일 `EditableSettings`가 patch 방식 → passthrough).

- **검증 환경**: Electron 40.x on Windows 11 24H2. 데스크톱 only(Phase 1).

- **회귀 가드**:
  - `src/domain/rules/periodRules.test.ts` — 도메인 함수 9건(A1~A8 + B0): noop, 한 칸 위/아래, 여러 칸 점프, boundary, invalid-duration, overflow, shiftPeriodsFrom 양방향, inferLunchAfterPeriod 성공/실패.
  - `src/adapters/presenters/timetablePresenter.test.ts` — 3단 폴백 5건(B1~B5): lunchAfterPeriod 우선, 시간 폴백, 갭 폴백, 모두 실패, 0/1-based 변환 경계.
  - `src/adapters/components/Settings/tabs/PeriodTab.test.tsx` — 9건(D1~D9): 버튼 클릭, 경계 disabled, 키보드 동등, lazy 박힘, 학급/교사 양쪽 적용 검증.
  - 수동 검증 13단계: `docs/manual-verification/lunch-position.md`.

- **Follow-ups**:
  - Phase 3 ralplan: 드래그 인터랙션(Option β) — react-dnd 또는 HTML5 DnD 도입 + 접근성 보조.
  - Phase 3 ralplan: 모바일 시간표 그리드 신규 + 점심 1급 도입(Option γ) — 시간표 화면 자체부터 설계 필요.
  - Phase 4: `lunchStart`/`lunchEnd` deprecation — `lunchAfterPeriod` + 교시 시간으로 충분히 도출 가능해질 시점에 정리.

---

## ADR-010: MultiSurvey v2 미감 정량 게이트 재정의 — sp-\* ratio ±20% 폐기 + 3종 새 게이트

- **상태**: active
- **일자**: 2026-05-30
- **컨텍스트**: MultiSurvey v2 RB 수준 리뉴얼 G004 Phase C 진입 (ultragoal `_alpha-goal-snapshot.json`, plan `docs/01-plan/features/multisurvey-v2-renewal.plan.md`, design v0.2)

- **결정**:
  - Plan §7 게이트 5+2의 "**sp-\* ratio ±20% baseline 비교**" 정량 게이트를 **공식 폐기**한다.
  - 대신 다음 **3종 새 정량 게이트**로 대체하고 Phase C C.1 검증 항목으로 채택한다:
    1. **비-fallback HEX 0건 게이트**: 신규/수정 코드(`src/adapters/components/MultiSurvey/v2/**`)에서 `#RRGGBB(AA)?` / `#RGB` 패턴은 화이트리스트 4종 외 0건.
       - **화이트리스트 ①**: `var(--<name>, #<fallback>)` CSS 변수 fallback 패턴 (DN-10 학생 페이지 정적 HTML CSS 변수 미주입 대비 안전장치).
       - **화이트리스트 ②**: `qrcode` 라이브러리 `color: { dark/light: '#...' }` 옵션 (QR 코드 흑백 강제 — 비-디자인 영역).
       - **화이트리스트 ③**: `[Ff]allback` 식별자를 가진 const/let 변수 (예: `const fallbackColor = isO ? '#...' : '#...'`) — CSS `color-mix()` 함수 등 var() fallback 표기로 표현 불가능한 case의 DN-10 보완 안전장치. 라인 내 식별자 매치 시 라인 전체 마스킹.
       - **화이트리스트 ④**: `electron/ipc/_studentPageChrome.ts` 파일 전체 — DN-10 fallback 값의 **정의 소스 위치 자체**(`injectDesignTokens` 함수 + `.sp-conn-chip` 정적 CSS). 본 파일이 sp-\* 토큰 fallback HEX의 단일 진실 원천(SSOT)이므로 검사 범위에서 제외. 다른 파일은 본 파일이 정의한 토큰을 var(--name, ...) 형태로 참조해 화이트리스트 ①을 통과해야 함.
       - 측정 도구: `scripts/check-hex-hardcoding.mjs` 신규 — 화이트리스트 4종(정규식 3종 + 파일 1종) 마스킹 후 잔여 HEX 검출 시 exit code 1.
    2. **sp-\* 토큰 채택률 게이트**: 같은 범위에서 Tailwind `sp-*` 유틸리티 + CSS 변수 `var(--sp-*)` inline 합산 sp-\*-바인딩 호출 ≥ 500. 현재 측정 582건(52 컴포넌트 평균 11.2회) — Phase B 시점 baseline.
       - 측정 도구: `scripts/check-sp-coverage.mjs` 신규 — `grep -rE "(sp-|var\(--sp-)" --include=*.tsx --include=*.ts` 카운트 ≥ 500.
    3. **frontend-design 정성 검토 S1/S2 0건 게이트**: PR 단위 frontend-design 에이전트 검토에서 Severity-1(미감 위반) + Severity-2(토큰/패턴 일탈) **모두 0건**. Phase B에서 S1 2건+S2 4건 발견·전건 수정 → Phase C 진입 시점 baseline 0건.

- **근거**:
  - **Phase B 절대 카운트 비교의 무의미함 확정**: Q4 baseline(v2.0.8 Homeroom/Survey @ 125) vs Phase B v2(582) 비교가 ±20%(100~150)를 360% 초과한다. 그러나 v1은 모놀리식 1 컴포넌트, v2는 52 컴포넌트로 분리됐기 때문에 카운트 차이는 미감 차이가 아니라 **구조 분리도 차이**를 측정한 것 — 동일 의미 지표가 아니다.
  - **컴포넌트당 비율도 분리도 영향**: v1 31.25/컴포넌트 vs v2 11.06/컴포넌트. 컴포넌트가 잘게 쪼개질수록 자연히 컴포넌트당 토큰 호출이 줄어든다(공용 wrapper 1회 + 자식 컴포넌트 0회 패턴이 이상적). 비율이 떨어진 것 = 분리가 잘 됐다는 신호일 수 있어 미감 지표로 부적합.
  - **HEX 128건은 모두 의도된 사용**: Student 14 컴포넌트의 `var(--color-bg, #0a0e17)` 등 CSS 변수 fallback (DN-10 도메인 노트 명시 안전장치) + `ShareLobbyScreen.tsx`의 qrcode 라이브러리 흑백 옵션. 비-fallback 0건이 미감 위반 0건의 정확한 지표.
  - **3종 게이트는 측정 가능 + 자동화 가능 + 의미 직접적**: HEX 하드코딩은 디자인 시스템 우회의 직접 신호, sp-\* 채택률은 채택 정착도 신호, 정성 검토는 frontend-design 에이전트가 RB 미감 기준으로 판정. 셋 다 통과 시 "RB 수준" 도달 신뢰 가능.

- **대안**:
  - **A (채택)**: 위 3종 새 게이트로 대체.
  - **B (기각)**: 컴포넌트당 sp-\* 비율(11.06 vs 31.25) 비교 — 분리도가 미감을 측정하지 않으므로 기각.
  - **C (기각)**: 모든 정량 게이트 폐기 + frontend-design 정성만 사용 — Plan Pre-mortem #2 ("RB 미감 미달 무한 반복") 위험 — 정성 게이트만으로는 객관적 게이트 통과 시점이 모호해 v2.1.0 출시 지연 가능성. 기각.

- **트레이드오프**:
  - (+) 비-fallback HEX 0건은 자동화 + 회귀 차단 가능. 신규 PR 추가 HEX 즉시 CI fail.
  - (+) sp-\* 채택률 임계값(≥500)은 Phase B baseline 기반이라 회귀 명확.
  - (+) frontend-design 정성 검토는 RB 수준의 본질 지표 — 자동화 회피 영역.
  - (−) HEX 화이트리스트 정규식이 복잡함 — `var(--<name>,\s*#[0-9A-Fa-f]+)` + `color:\s*\{\s*dark:\s*'#` 두 패턴 마스킹 필요. `scripts/check-hex-hardcoding.mjs` 구현 시 false positive/negative 1회 수동 검수 필요.
  - (−) sp-\* 채택률 절대 임계값(500)은 Phase B 시점 기준 — Phase C·D에서 컴포넌트 증가/감소 시 재조정 필요. 임계값 조정은 ADR 추가 없이 스크립트 상수만 수정해도 무방하나, 의도 표시 위해 PR description 명시 권장.
  - (−) frontend-design 정성 검토는 사람(에이전트) 의존 → 일관성 보장은 `feedback_frontend_agent_collaboration.md` 메모리 룰로 보강 (이미 운영 중).

- **검증 환경**: Phase C C.1 검증 시 `npm run check-hex-hardcoding` + `npm run check-sp-coverage` + frontend-design 에이전트 PR 검토 통과.

- **회귀 가드**:
  - `scripts/check-hex-hardcoding.mjs` 신규 — `MultiSurvey/v2/**` + `_studentPageChrome.ts` 범위, 화이트리스트 정규식 마스킹 후 잔여 HEX 0건 검증. exit code 0/1.
  - `scripts/check-sp-coverage.mjs` 신규 — 같은 범위, sp-\* 바인딩 카운트 ≥ 500 검증.
  - `package.json` scripts: `check-hex-hardcoding`, `check-sp-coverage` 추가.
  - `npm run regression-check`가 위 2건을 호출하도록 후속 PR에서 추가.

- **Plan 문서 연동**:
  - Plan §7 게이트 5+2의 "B 신설: 미감 정량 게이트 — sp-\* ratio baseline" 한 줄을 본 ADR 참조로 갱신 필요 (별도 PR — Plan 본문은 v1.0 불변 원칙, 단주석으로 처리).
  - Design v0.2 §6.1 메타테스트 표에 #5(check-hex-hardcoding) + #6(check-sp-coverage) 두 줄 추가 필요.
  - Phase C 핸드오프 C.1 첫 항목 "sp-\* ratio ±20% baseline 게이트 재정의"가 본 ADR로 해소됨 표시.

- **Follow-ups**:
  - v2.1.1 (Phase D flag 제거) 시 v1 모놀리식 코드 grep 범위에서 제외 → sp-\* 카운트 기준 자동 안정.
  - 형제 도구(단순 설문·투표·워드클라우드) 동일 게이트 채택은 v2.1.x/v2.2.0 후속 PDCA.
  - HEX 화이트리스트 ②(qrcode)는 라이브러리 옵션이라 사용자 디자인 토큰 영역이 아님 — 향후 라이브러리 교체 시 화이트리스트 갱신.

## ADR-011: 메모 교실 공유 저장소 — Supabase 폐기, 선생님 개인 Google Drive 채택

- **상태**: active
- **일자**: 2026-06-11
- **컨텍스트**: memo-classroom-share(메모 교실 공유) 신기능 — 교사가 포스트잇을 골라 고정 링크로 교실 전자칠판에 실시간 게시. 최초 설계(Design v0.1)는 설문/상담과 동일하게 Supabase(Postgres+Realtime+Storage+Edge Fn 3종+write_key)였으나, 구현 착수 직전 사용자가 "쌤핀 서버에 메모 내용이 저장되는 것"에 대한 정보 유출 우려를 제기.

- **결정**:
  - 공유 데이터(보드 JSON + 이미지)를 **선생님 개인 Google Drive**에 저장한다. 쌤핀 서버(Supabase)에는 내용이 일절 저장되지 않는다(숏링크의 URL 문자열만 예외).
  - 보드 = `board-{nanoid}.json`, 이미지 = `img-{itemId}.{ext}` — 모두 `anyone-with-link reader` 권한. 페이지 URL은 Drive fileId(33자+, 추측 불가) 기반 `ssampin.com/memo/{fileId}`.
  - 읽기 전용은 Google 권한 구조로 보장(reader) — 자체 write_key 인증 불필요. 쓰기는 교사 OAuth(`drive.file`, 기존 스코프라 재심사 불필요)만.
  - 실시간 push 대신 **5초 메타데이터 폴링**(version 필드, ~100B) + 변경 시에만 본문 fetch. 교실 페이지는 비로그인 — 브라우저용 Google API 키(Drive API 한정 + referrer 제한)만 사용.
  - 공유 중지 = `files.delete` 영구 삭제(휴지통 미경유).

- **수용한 트레이드오프** (사용자 명시 승인 2026-06-11):
  - (−) 실시간 반영 1~2초 → 5~10초 (폴링) — "괜찮아"
  - (−) 구글 로그인 필수 — "이미 쌤핀에 구글 동기화가 있어"
  - (−) 학교 워크스페이스 계정의 링크 공유 정책 차단 가능 → permissions.create 403 시 개인 계정 안내 + 생성 파일 롤백 — "개인 계정으로 안내하면 돼"
  - (−) 이미지는 Drive 파일 방식(시트 불가) — "구현만 되면 괜찮아"
  - (+) 쌤핀 서버 무저장 = 운영자/서버 침해 시에도 내용 노출 불가, 데이터 주권 완전 교사 소유
  - (+) 서버 배포물 0건(마이그레이션/Edge Fn/Storage 불필요) — 운영 비용·장애점 제거
  - (+) v1의 write_key 설계(키 테이블 분리, Realtime payload 유출 차단)가 통째로 불필요해져 보안 표면 축소

- **대안**:
  - A (기각): Supabase 평문 저장(v0.1 설계) — 실시간성 최고였으나 서버 저장 우려.
  - B (기각): Supabase + 종단간 암호화(URL fragment 키) — 실시간성 유지 + 서버는 암호문만. 구현 복잡도 중간. 사용자가 C를 선택.
  - C (채택): 개인 Google Drive.

- **검증**: 게이트 4/4 + guard PASS + Playwright 모의 E2E(반영 7초 실측). SC-4(교사 토큰 페이지 비전달)·SC-10(supabase 호출 부재) 메타테스트로 회귀 고정.

## ADR-012: 협업보드 템플릿 주입 — 보드 생성 시점 서버 Y.Doc 시딩 (Teacher ExcalidrawBinding 미부착)

- **상태**: active
- **일자**: 2026-06-12
- **컨텍스트**: collab-board-rb-parity G005(PDCA-3, 학습 활동 템플릿 4종). Plan AC-3.1 CAVEAT가 "teacher page는 initialData만 사용(ExcalidrawBinding 미부착) — 템플릿 삽입이 Y.Doc로 전파되려면 (A) teacher page에 binding 부착 / (B) Y.Doc 직접 조작 중 design 단계 결정"을 요구. Plan 작성(2026-05-22) 이후 2026-06-11 리팩토링으로 교사 캔버스 진입이 `?role=teacher` 학생 페이지(binding 이미 보유) 경로로 확정되어, plan이 전제한 "별도 teacher React 캔버스"가 존재하지 않음.

- **결정**: **옵션 B 변형 채택 — 보드 생성 시점(`collab-board:create`)에 Electron main process에서 템플릿 요소를 y-excalidraw 저장 형식으로 Y.Doc에 직접 구성해 `.ybin` 스냅샷으로 저장**한다. 세션 시작 시 기존 initialState 적용 경로(YDocBoardServer 첫 연결 시 Y.applyUpdate)가 그대로 템플릿을 모든 클라이언트에 전파한다. Teacher page ExcalidrawBinding 별도 부착은 하지 않는다.

- **근거**:
  - SP-2 스파이크(정적 분석)로 y-excalidraw 2.0.12 저장 형식 확정: `Y.Array<Y.Map{pos: fractional-index, el: 평면 요소 객체}>`. main process는 이미 yjs를 의존하므로 동일 형식 생성 가능.
  - 생성 시점 시딩은 클라이언트 레이스 0(접속 전 완결), 세션 횟수와 무관하게 1회만 실행, 신규 동기화 코드 0(기존 스냅샷 로드 경로 재사용).
  - 교사용 React 캔버스 신설(옵션 A)은 Excalidraw 렌더러 renderer 측 중복 탑재(CDN/번들·이벤트·권한 전부 이중화)로 비용 대비 효익 없음 — `?role=teacher` 경로가 이미 전체 편집 권한 캔버스를 제공.

- **트레이드오프/리스크**:
  - (−) y-excalidraw 내부 형식에 결합 — 버전은 `constants.ts` `Y_EXCALIDRAW_VERSION=2.0.12`로 핀 고정되어 있고, 시더 메타테스트가 `pos/el` round-trip을 검증해 업그레이드 시 즉시 발화.
  - (−) `pos` 키가 fractional-indexing 유효 형식이어야 클라이언트의 후속 append(`generateKeyBetween(last, null)`)가 깨지지 않음 → 클라이언트 CDN과 동일 버전 `fractional-indexing@3.2.0`(MIT, zero-dep)을 main 의존으로 추가해 호환 보장.
  - (−) 시딩 요소는 클라이언트 `restore()`를 거치지 않고 binding `updateScene`으로 직행하므로 Excalidraw 0.17.6 요소 필드를 완전한 형태로 생성해야 함 → 시더가 전 필드를 명시 생성 + 실브라우저 E2E로 렌더 검증.
  - (+) 잠금(locked=true) + 작성자 customData 미부여 조합으로 학생 선택 차단 가드(2026-06-11)와 자동 정합 — 학생은 템플릿 요소를 선택조차 불가.

- **연계 결정 (AC-3.3)**: 템플릿 잠금 해제 토글은 권한 패널(PDCA-5 예정)이 아직 없으므로 학생 페이지 toolbar에 **교사(role=teacher) 전용 버튼**으로 제공 — `customData.boardTemplate` 마킹 요소의 locked 일괄 토글 + version bump로 전파.

## ADR-013: 학생 페이지 공용 셸 — --sps-\* 네임스페이스 신설 (DN-10 토큰 불가침)

- **상태**: active
- **일자**: 2026-06-12
- **컨텍스트**: student-pages-design-refactor — 학생/보호자 접속 페이지 8종(electron 인라인 HTML 6종 + landing 2종)이 폰트 미선언, "쌤핀 파랑" 3중 정의(#3b82f6/#2563eb/#60a5fa), radius 표류(16/14/12/10px), `user-scalable=no` 줌 차단으로 사실상 8개 서비스처럼 보임(2026-06-12 디자인 감사). `_studentPageChrome.ts`의 기존 `--color-*` 토큰(getDesignTokenDefaults)을 정정하려 했으나, 이 토큰은 MultiSurvey v2 학생 컴포넌트 14개의 SSOT(DN-10, 다른 세션 진행 중)로 광범위하게 fallback 참조됨을 발견.

- **결정**:
  - 도구 6종 학생 페이지의 디자인 단일 소스로 **`--sps-*` CSS 변수 + `.sps-` 클래스 네임스페이스를 신설**한다 (`getStudentBaseCSS`/`getStatusScreenHTML`/`getStudentFeedbackJS`/`getStudentViewportMeta`/`getStudentFontLinks`).
  - 기존 `--color-*` 토큰(DN-10 SSOT)과 `sp-conn-*` 칩(REGRESSION #22)은 **한 줄도 수정하지 않는다**.
  - **D1 파랑 단일화**: 다크 화면(도구 6종) `--sps-accent: #3b82f6`(본체 sp-accent와 동일), 라이트 화면(landing 2종)은 기존 `#2563eb` 유지 — 같은 브랜드 파랑의 다크/라이트 변형. MultiSurvey v2의 `#60a5fa`와의 최종 합치는 plan D3(복합 설문 조율) 시점에 결정.
  - **D2 폰트**: CDN Pretendard(dynamic-subset) + `font-display: swap` + 시스템 폴백 스택('Pretendard Variable' → Pretendard → 'Noto Sans KR' → 시스템). CDN 실패 시 현 상태와 동일 — 악화 없음.
  - **D4 카드색**: `--sps-card: #1a2332`(본체 sp-card·design-system.md 기준), radius 카드 12px/컨트롤 8px.
  - viewport는 `user-scalable=no`/`maximum-scale` 금지(WCAG 1.4.4) + `viewport-fit=cover`.

- **대안**:
  - A (기각): getDesignTokenDefaults 값 정정(#60a5fa→#3b82f6 등) — MultiSurvey v2 학생 페이지(frontend-design 검수 S1/S2=0 통과한 팔레트)를 무단 변경, 다른 세션 충돌.
  - B (채택): --sps-\* 네임스페이스 분리 — 충돌 0, 도구 6종 단일화 즉시 달성, 파랑 이원화는 D3에서 해소.
  - C (기각): 페이지별 개별 수정 — 표류 재발 구조 그대로.

- **검증**: `_studentPageChrome.shell.test.ts` 메타테스트(토큰값·줌 허용·DN-10 비침범·접근성 마크업) + REGRESSION #47(regression-grep-check.mjs).

## ADR-012: 메모 교실 공유 수신 확인증 — "쌤핀 서버 무경유" 원칙의 메타데이터 예외

- **상태**: active
- **일자**: 2026-06-12
- **컨텍스트**: ADR-011로 보드 내용은 선생님 개인 Google Drive에만 저장된다. 그러나 교실 페이지는 Drive 읽기 전용(anyone-with-link reader)이라 "재생됐다"는 답장을 쓸 수 없어, 교사가 교무실에서 주목/낭독의 실제 재생 여부와 교실 화면 생존을 확인할 방법이 없었다(사용자 질문 2026-06-12).
- **결정**: Supabase 테이블 `memo_share_presence`(보드당 1행 upsert)를 수신 확인 채널로 추가한다. 사용자 명시 승인("이정도는 구현해도 좋을 거 같아").
  - 담는 것: board_id(Drive fileId)·last_seen_at·sound_on·last_ack_nonce·last_ack_result('played'/'sound-off'/'fallback-voice')·last_ack_at — **메모 내용·제목 등 텍스트는 일절 없음**
  - 교실 페이지: 60초 heartbeat + 재생 직후 ack upsert (fire-and-forget, 실패해도 보드 표시 무영향)
  - 쌤핀 앱: 모달 열림 동안 10초 폴링 → "교실 화면 연결됨/안 보임" 칩 + 재생 확인 토스트(35초 timeout)
  - RLS: anon insert/update/select 허용 + 길이·enum 가드. 링크를 아는 자의 spoof 가능하나 노출 정보가 "화면 켜짐/재생됨" 메타뿐이라 보드 내용(Drive) 이상 노출 없음
  - 행이 보드당 1개라 증가·정리 불필요
- **한계(고지)**: "브라우저가 재생함"까지 확인 — 전자칠판 자체 볼륨/음소거는 감지 불가
- **영향**: SC-10 메타테스트("memoShare 경로 supabase 호출은 ShortLinkClient 한정")에 MemoSharePresenceClient 허용 추가. migration 037 prod 적용 + anon upsert/select/가드 curl 검증 완료(2026-06-12)

## ADR-014: 생기부 작성 근거 자료 — 신규 RecordEvidence 엔티티 (basisObservationIds 와 역할 분리)

- **상태**: active
- **일자**: 2026-06-24
- **컨텍스트**: 교사가 여기저기 흩어진 학생 데이터(교과 관찰기록·담임 누가기록·과제·평가)를 "생기부 작성 근거"로 모아 학생별·생기부 유형별로 관리하고, MCP 연결 AI가 이를 기반으로 유형별 초안을 쓰게 하려는 요구. 기존에는 `RecordDraft.basisObservationIds`(AI가 초안에 인용한 관찰 id)만 있었고, 화면(RecordDraftView.tsx:524-590)은 이를 읽기 전용으로만 표시 — 교사가 직접 근거를 수집/유형분류/CRUD하는 수단이 없었다. 기존 엔티티(ObservationRecord/StudentRecord)는 readonly이고 "생기부 유형(area)" 분류축이 없으며, AI 쓰기 화이트리스트(OBSERVATION_FIELDS/RECORD_NOTE_FIELDS)는 동결 대상이다.
- **결정**: **신규 `RecordEvidence` 엔티티**(src/domain/entities/RecordEvidence.ts)를 도입한다. `{ id, studentRef, areas: RecordArea[], content, date?, sourceType?, sourceId?, classId?, createdAt, updatedAt }`. 저장키 `record-evidence`(기존 `record-drafts`와 별도 파일). 한 근거가 여러 영역(areas)의 근거가 될 수 있고, `manual`(직접 입력) 또는 기존 데이터 끌어오기(`observation`/`studentRecord`/`assignment`/`evaluation`, sourceId 보존)로 생성한다. RecordDraft 수직 슬라이스(entity→IRepository→JsonRepository→Zustand store→DI)를 그대로 미러. UI는 공용 `RecordDraftView` 안 초안↔근거 자료 모드 토글 + 신규 `RecordEvidenceView`(headless)로 담임·수업반 양 컨텍스트에 동시 적용.
- **근거**:
  - 요구의 "등록/수정/삭제"는 신규 데이터 생성을 함의 → readonly 기존 엔티티 태깅으로는 불가.
  - "생기부 유형(area)" 분류를 1급 필드로 보유해야 AI가 유형별로 근거를 골라 쓴다.
  - `studentRef`를 RecordDraft와 동일 체계로 두어 초안↔근거가 즉시 매칭(담임=Student.id / 수업반=tc:{classId}:{studentKey}).
- **basisObservationIds 와의 역할 분리**: RecordEvidence = 교사가 학생별로 모아 영역 분류한 "작성 재료 창고"(편집 가능, areas N개) / basisObservationIds = 초안 1건에 붙은 출처 꼬리표(읽기 전용 provenance). UI에서 "초안"·"근거 자료" 라벨로 명확히 구분.
- **트레이드오프/리스크**: 근거 개념이 두 군데(초안의 인용 vs 근거 창고)로 보일 혼란 → 라벨·안내문으로 분리. 끌어오기 import는 Phase 1에서 검증된 연결(담임=StudentRecord.studentId=Student.id / 수업반=ObservationRecord.studentId=studentKey, ClassRecordInputView.tsx:661 확인)만 우선 노출, 과제·평가는 sourceType만 열어두고 UI 후속.
- **대안**: (A)순수 신규 엔티티(끌어오기 없음) — "모아서" 약함. (B)기존 데이터 집계+area 오버레이 태깅 — readonly·화이트리스트 동결과 충돌, "등록" 부자연 → 기각. (C, 채택)신규 엔티티+선택적 출처 참조 하이브리드.
- **AI 연동(Phase 2, 완료 2026-06-24)**: 별도 저장소 `ssampin-ai-bridge`에 읽기 전용 도구 `get_record_evidence`(record-evidence.json 읽기, area 필터, allowRecordWrite 게이트·deidentify·audit) 추가 — core `recordEvidence.ts`(parseRecordEvidence)+`io.readRecordEvidence`, mcp `getRecordEvidence`+server 등록(readOnlyHint), `write_record_draft` 안내문에 "근거 자료 우선 읽기" 반영. 쓰기 계약 SSOT(aiBridgeWriteContract.def.mjs)는 읽기 도구라 불변. esbuild 번들 `electron/ai-bridge/index.mjs` 재생성(get_record_drafts 패턴 미러). 검증: 브릿지 build OK + 테스트 552 통과(신규 core/mcp 포함, PII-0 동급생 실명 마스킹 검증) + 번들 node --check OK + ssampin regression 38/38(본체 무영향). 초안에 `basisEvidenceIds` 신설(양방향 provenance)은 더 큰 크로스레포 변경이라 후속 과제로 남김.
- **검증**: 게이트 4/4 — tsc 0 / lint 0 / regression 38/38 / 전체 vitest 249파일·3164 passed·0 failed(10 skipped). 신규 단위·라운드트립 테스트 7/7(useRecordEvidenceStore.test.ts: load 가드 유실방지·CRUD·areas 정규화·getByArea, 엔티티 헬퍼 areEvidenceAreasValid). 1차 전체 실행 시 무관 PDF 테스트(FillFormFields)가 워커 비정상종료로 1건 플래키 실패했으나 단독 10/10·재실행 전체 그린으로 본 변경과 무관함 확인.

## ADR-015: 근거 자료 4대 개선 + 성적/점수 AI 미노출(길 A)

- **상태**: active
- **일자**: 2026-06-24
- **컨텍스트**: 근거 자료 사용성 4개 요청 — (1) 유형 분류를 수정 모드 없이 인라인 토글, (2) 관찰/누가기록을 학급 전체 일괄 끌어오기, (3) 과제물·교사 저장 파일·학생 제출물·수행평가·성적까지 import, (4) 초안 행에 근거 준비도(건수·최근일·작성가능·검토필요) 표시.
- **핵심 충돌 결정 — 성적/점수**: `GradeAnalysis.ts` 제1원칙("학생 점수는 로컬 전용, 네트워크 전송 0") + AI 브릿지 점수 제외 정책 vs 근거(get_record_evidence)는 AI 노출. → **길 A 채택: 원점수·배점·석차·환산점·과목평균 숫자는 근거 content 에 절대 넣지 않고 질적 정보만** — 수행평가=요소별 **수준 이름**(탁월함 등)·성취 설명·요소 메모·총평 / 성적=**성취도 등급(A~E)** + 교사 서술(evidenceNote·memo). **성취도(achievementLevel)는 점수가 아니라 NEIS 생기부 기재 항목**이라 노출 가능하며(브릿지 `gradeAnalysis.ts`가 성취도를 "생기부 기재 항목"으로 유지하고 원점수·석차만 "의도적 미포함"하는 정책과 일치), 숫자가 섞인 비정상 성취도 값은 오염으로 보고 제외(`semesterGradeToEvidence` → null). 대안 길 B(원점수까지 담는 교사 전용 필드 + 브릿지 제외)는 크로스레포·고위험이라 후속 과제.
- **구현**:
  - `src/usecases/studentRecords/evidenceImport.ts` — 순수 변환함수(submission/attachment/rubricGrading/grade/semesterGrade → evidence). **점수 미포함이 불가침**이며 `evidenceImport.test.ts`(11건)가 배점·원점수·환산점·석차 숫자 미포함 + 성취도 등급 포함을 회귀 가드.
  - `RecordEvidence.ts` sourceType 에 `attachment` 추가(앱; 브릿지 core 엔티티 parity 는 후속 — 미갱신 시 브릿지가 라벨만 normalize, 기능 무영향).
  - `useRecordEvidenceStore.addMany`(학급 일괄 1회 저장).
  - `RecordEvidenceView` 재구성: 행 area 인라인 토글(update) + '미분류' 가상 탭(영역 0개 보존) + 출처 선택 끌어오기 패널(관찰/누가/수행평가/성적/첨부/과제물) + '학급 전체' 일괄.
  - `RecordDraftView`/RecordDraftRow: 현재 영역 근거 건수·최근일·'AI 작성 가능'·'검토 필요' 배지.
- **한계(고지)**: Drive/Supabase 기반 과제수합(Submission) import 는 그 세션에 이미 불러온 in-memory 제출물에서만 매칭(오프라인·네트워크 의존) — 빈 경우 안내 후 과제 수합 탭 유도. 교사 저장 파일·학생 제출 파일은 ObservationAttachment(source teacher/student)로 커버.
- **검증**: 게이트 4/4 — tsc 0 / lint 0 errors / 전체 vitest 250파일·3177 passed·0 failed / regression 38/38. 신규 evidenceImport 11/11(원점수·배점·석차 미포함 + 성취도 등급 포함 가드). (lint 경고 1건=adapters→infrastructure uuid import, 기존 형제 스토어 공통 패턴이라 유지.)

## ADR-016: 근거 자료 엑셀 일괄 등록 — 유형은 업로드 후 분류

- **상태**: active
- **일자**: 2026-06-24
- **컨텍스트**: 쌤핀에 학생 기록을 안 해둔 교사도 관찰 기록을 한 번에 올릴 수 있어야 함(학생 개별/반 전체). 잘 만든 엑셀 양식 다운로드 → 작성 → 업로드로 근거 일괄 등록.
- **결정**: **엑셀에는 "관찰 내용"만 받고, 생기부 유형 분류는 업로드 후 앱(미분류 탭 인라인 토글, US-1)에서** 한다. 양식 = `식별키(숨김 studentRef) · 번호 · 성명 · 날짜 · 관찰 내용`, 명단 사전 채움. 한 칸 안 줄바꿈 = 줄마다 별도 근거. 업로드분은 `areas:[]`(미분류)·`sourceType:'manual'` 로 `addMany` 등록.
- **근거**:
  - 유형 컬럼을 엑셀에 두면(드롭다운/유형별 칸) 양식·검증이 복잡 → 이미 만든 미분류 분류 UI 재사용이 더 단순(사용자 결정).
  - **오매칭 방지**: 숨김 `식별키`(studentRef)를 미리 채워 정확 연결, 없으면 번호→(유일)성명 폴백, 그래도 못 찾으면 임의 배정 없이 오류로만 보고.
- **구현**:
  - `src/infrastructure/export/EvidenceExcel.ts` — `exportEvidenceTemplateToExcel`(양식+안내 시트, 숨김 식별키 열) / `parseEvidenceFromExcel`(헤더 자동감지·줄바꿈 보존). exceljs, ExcelExporter 패턴 미러.
  - `src/usecases/studentRecords/importEvidenceFromExcel.ts` — 순수 `mapExcelEvidenceRows`(식별키/번호/성명 매칭·줄바꿈 분리·부분 성공) + 테스트 6건.
  - `RecordEvidenceView` — 헤더 툴바 "양식 다운로드"(electron 저장/blob) + "엑셀 업로드"(input.xlsx→파싱→매핑→addMany) + 결과·오류 행 리포트. 업로드 후 미분류 탭으로 전환.
- **대안**: 유형별 칸/유형 드롭다운 컬럼(기각 — 양식 복잡·사용자가 "분류는 앱에서" 결정), 자유 양식(기각 — 매칭 불안정).
- **한계(고지)**: 재업로드 시 중복 등록(경고 안내, 후속 dedup). 엑셀 관찰 내용은 교사 수동 입력이라 점수 자동 차단은 없음(양식 안내로 "점수 지양", AI 노출은 브릿지 탈식별이 방어).
- **검증**: 게이트 4/4 — tsc 0 / lint 0 errors / 전체 vitest 251파일·3183 passed·0 failed / regression 38/38. 신규 `importEvidenceFromExcel` 6/6. (lint 경고 1건=adapters→infrastructure EvidenceExcel import, RosterManagementTab 등과 동일 패턴이라 유지.)

## ADR-017: 아이콘 모드 확장형 창 프로토콜 — compact 유지 + 필요 시 확장 + 클릭 통과

- **날짜**: 2026-07-02
- **상태**: 채택 (v2.2.7 후보)
- **배경**: 아이콘 창은 Electron Issue #30171(Win11 투명창 60px 미만 합성 깨짐) 회피로 64×64 고정. 이후 v2.2.3에서 말풍선(호버 요약·능동 알림)이 추가됐지만 창 크기는 그대로여서 말풍선·코치마크·우클릭 메뉴가 전부 창 밖/잘림 렌더 — 실기기에서 표시된 적 없음(2026-07-02 실화면 진단). 사용자 신고 "아이콘 주변 불투명 배경"과 함께 창 구조 재설계 필요.
- **결정**:
  1. **compact 기본 유지(64×64)** — 평상시엔 기존과 동일. 사용자가 신고한 불투명 잔상(DWM 추정)이 커지지 않도록 상시 대형 창을 기각.
  2. **필요 시 확장(340×560)** — 말풍선·팝오버·메뉴·코치마크가 필요할 때만 main 이 창을 키움. 핀의 화면 위치는 불변(확장 방향으로 창이 자람). 기하는 `electron/iconWindowGeometry.ts` 순수 함수(4방향 anchor 플립, 화면 여유 기준)로 분리해 단위 테스트.
  3. **클릭 통과** — 확장 창의 빈 영역은 `setIgnoreMouseEvents(true, {forward:true})`로 아래 창에 클릭을 통과시키고, 렌더러가 인터랙티브 요소(핀·팝오버·메뉴) hover 참조 카운트로 토글.
  4. **오버레이 자기 배치 금지** — PinBubble/CoachMark/IconContextMenu 는 위치 클래스를 갖지 않고 IconWindow 오버레이 컨테이너가 배치. `iconOverlayLayout.meta.test.ts` 가 소스 레벨로 강제.
  5. **영속 의미 불변** — icon-bounds.json 은 계속 "핀 사각형"만 저장(구버전 호환), 드래그·화면이탈 보정·리셋 전부 핀 기준.
- **대안**: ① 상시 대형 창(기각 — DWM 잔상 확대 위험·클릭 통과 상시 부담) ② 말풍선을 별도 BrowserWindow 로(기각 — 창 2개 동기화·포커스 관리 복잡, QuickAdd 패턴은 1회성이라 달랐음) ③ 64×64 유지+알림 링 복원(기각 — 텍스트 정보 전달 불가, v2.2.5에서 링 제거된 이유 재발).
- **함께 결정**: 전역 `body.ssampin-icon-popup * { background: transparent !important }` 를 구조 요소 한정으로 축소(말풍선/팝오버 카드 배경 생존). 단일 클릭 = 오늘 요약 팝오버(창 복원은 더블클릭·팝오버 버튼으로) — 아이콘 모드를 "닫기 방식"에서 "그 자리 비서"로 재정의. 핀 이름 `PIN_NAME='쌤핀이'` 단일 상수(사용자 결정 — 스플래시 마스코트와 동일 명).

## ADR-018: 모바일(src/mobile) 구조·네이밍 규칙 + 게이트 화이트리스트 승계 원칙

- **상태**: active
- **일자**: 2026-07-03
- **결정**: ① 모바일 Zustand 스토어는 전부 `src/mobile/stores/useMobileXxxStore.ts`(컴포넌트 폴더 내 store 금지, 데스크톱 스토어와 import 구분용 Mobile 접두어), 훅은 `hooks/useXxx`, 순수 유틸은 `utils/`, 표시 버전은 `version.ts` 단일 소스. ② 대형 페이지는 `pages/<페이지명 소문자>/` 폴더로 서브컴포넌트 순수 추출(예: `pages/students/`). ③ 리팩토링으로 코드가 파일 간 무변경 이사할 때, 화이트리스트 기반 게이트(eslint exhaustive-deps 래칫, `.isVacant` 메타 테스트)는 새 파일이 원 파일의 등재 지위를 승계한다 — 코드를 고쳐 게이트를 통과시키는 것은 동작 보존 원칙 위반 소지가 있어 금지.
- **근거**: 모바일 리팩토링(2026-07-03)에서 네이밍 이원화·store 위치 이탈·1,815줄 단일 파일이 탐색 비용의 주범으로 분석됨(docs/03-analysis/mobile-refactor/). 화이트리스트 승계는 "이사한 기존 부채가 error로 승격되며 순수 이동을 막는" 문제의 표준 해법.
- **트레이드오프**: 래칫 목록이 파일 이동을 따라 자라날 수 있음 — 부채 자체의 해소는 별도 작업으로 추적.

## ADR-019: 출결 동기화 기록 단위 병합 + 업로드 유예 자동 재동기화

- **상태**: active
- **일자**: 2026-07-06
- **배경**: Drive 동기화는 파일 단위 last-write-wins라, 폰(교실)과 PC(교무실)가 같은 `attendance.json`을 비슷한 시각에 고치면 한쪽 편집이 통째로 유실됐다. 또 SyncToCloud는 리모트가 더 최신이면 업로드를 조용히 스킵해, 모바일처럼 업로드만 하는 흐름에서는 내 변경분이 Drive에 오르지 못한 채 다음 다운로드에 덮여 소멸할 수 있었다(고아화).
- **결정**:
  1. **AttendanceRecord.updatedAt(optional)** — 저장 시 ManageAttendance가 "내용이 달라진 레코드에만" 스탬프하고, 내용이 같으면 기존 스탬프를 승계(`stampChangedRecords`). 키 규칙은 `attendanceRecordKey`(classId|groupId|date|period)로 domain/entities/Attendance.ts에 단일 정의.
  2. **mergeAttendance** — SyncFromCloud의 3개 분기(충돌·manifest 미등록·최초 다운로드)에서 attendance는 student-records처럼 레코드 단위 병합. 한쪽에만 있는 레코드는 무조건 보존, 같은 키는 updatedAt 최신 우선, 양쪽 부재 시 preferRemote 폴백. AI 브릿지 계약에서는 updatedAt=notMirrored(동기화 메타데이터).
  3. **deferred + pull-merge-push** — SyncToCloudResult에 `deferred`(리모트 변경으로 유예된 파일)를 추가하고, 모바일·데스크톱 스토어가 deferred 발생 시 syncFrom(병합)→syncTo를 1회 재시도(모듈 가드로 무한루프 차단).
  4. **PC 기본값 상향** — autoSyncOnSave true, autoSyncIntervalMin 5분(useSettingsStore·BackupCard·ImportSettingsFromCloud 3곳 일치). Drive 어댑터에 429/5xx 지수 백오프(최대 3회, Retry-After 존중, infrastructure/google/driveRetry.ts).
- **트레이드오프(고지)**: 툼스톤이 없어 한쪽에서 삭제한 출결 레코드가 상대쪽 동기화로 부활할 수 있음 — student-records 병합과 동일한 기존 트레이드오프로, 통째 유실보다 낫다고 판단. 삭제 전파가 필요해지면 툼스톤 배열 도입을 후속 과제로.
- **검증**: tsc 0 / lint 0 errors / vitest 3415 passed(신규 20건: mergeAttendance 12·deferred 3·driveRetry 5) / regression 38/38 / landing docs:check·build 통과 / architect APPROVED.

### ADR-019 후속 (2026-07-06 당일): 출결 삭제 전파(툼스톤) 추가

- 고지했던 트레이드오프("삭제 레코드가 상대쪽에서 부활 가능")를 같은 날 해소.
- `AttendanceTombstone { key, deletedAt }` + `AttendanceData.deleted?`(optional — 과거 파일 호환).
- 저장 측: `buildAttendanceSaveData`가 모든 저장 경로에서 사라진 키에 툼스톤을 남기고, 재등장 키의 툼스톤은 제거, TTL 90일 경과분은 GC.
- 병합 측: `mergeAttendance`가 양쪽 툼스톤을 키별 최신 deletedAt으로 합친 뒤, 레코드 updatedAt이 deletedAt보다 나중일 때만 부활(동률·스탬프 부재는 삭제 승).
- 테스트 8건 추가(생성·승계·GC·부활차단·재작성승리·툼스톤병합·legacy).

## ADR-020: macOS는 베타 지원 — Apple 개발자 프로그램 미가입 확정

- **상태**: active
- **일자**: 2026-07-08
- **배경**: macOS Tahoe(26.5.1) 사용자가 "이 버전의 macOS에서 작동하는지 확인하려면 개발자에게 문의하십시오" 오류로 실행에 실패했고, 챗봇의 구식 안내(Control+클릭 → 열기 — macOS 15부터 Apple이 제거)로도 해결하지 못해 이탈. 조사 결과 v2.2.11 macOS 빌드는 Developer ID 서명·공증 없이 ad-hoc 서명으로 배포 중(GHA 빌드 로그 확인: "skipped macOS application code signing" / "falling back to ad-hoc signature" / "skipped macOS notarization"). 이 상태에서는 ① Gatekeeper가 설치마다 차단 ② electron-updater 자동 업데이트가 구조적으로 불가(macOS는 서명 필수) ③ 칩(arm64/x64) 불일치 파일 수령 시 위 오류 발생.
- **결정**:
  1. **Apple 개발자 프로그램(연 $99)은 가입하지 않는다**(사용자 확정, 릴리즈당 mac 다운로드 ~6건으로 비용 대비 낮음).
  2. 대신 **macOS를 "베타 지원"으로 공식 표기** — 랜딩(Hero·DownloadButton·InstallGuide·FAQ), /docs(start/install-macos·troubleshooting/macos-security), 챗봇 KB, 앱 오프라인 FAQ 전부.
  3. 실행 안내 절차는 **macOS 15+ 기준으로 통일**: 경고 창 [완료] → 시스템 설정 > 개인정보 보호 및 보안 → [그래도 열기] → 암호. Control+클릭 → 열기 안내는 전면 폐기(더 이상 동작 안 함을 명시).
  4. **mac 인앱 업데이트는 수동 다운로드로 전환**: `update:available` 페이로드에 `manualOnly`(darwin), [새 버전 다운로드] 클릭 시 본체가 칩(`process.arch` + `app.runningUnderARM64Translation`)에 맞는 DMG를 브라우저로 직접 다운로드, 렌더러(UpdateNotification·AppInfoSection)는 진행바 대신 수동 설치 3단계 안내. 기존엔 mac에서 "다운로드 중 0%" 모달에 갇혔음(닫기도 차단).
  5. **universal 바이너리 통합은 보류** — 실기기(Mac) 검증이 불가한 상태에서 빌드 방식 교체는 동작 중인 arch별 DMG까지 깨뜨릴 위험. 칩 선택 안내 강화로 대응.
- **검증**: tsc 0 / lint 0에러(경고 132 기존부채) / vitest 3492 passed·1 flaky(FillFormFields 단독 재실행 10/10) / regression 38/38 / landing docs:check(문서 41·링크 8·이미지 16)·build 통과.

## ADR-021: 출결 개선 — 담임 그리드 단일 기록자 + headless 코어 공유 + 기재요령 별표 8 정합 집계

- **상태**: active
- **일자**: 2026-07-10
- **배경**: 출결 탭 헤비유저 담임교사의 건의 6건(입력 동선 3단계·글씨 작음·모바일 보기 리셋·명단 조퇴 불가·교시 자동 채움 부재·통계 분산). ralplan 합의 루프(Planner→Architect→Critic 3라운드, Critic 최종 APPROVE)로 계획 확정(docs/01-plan/features/attendance-improvement.plan.md). 설계 중 **2026 기재요령(교육부훈령 제555호 별표 8 §3) 원문 확인**(docs/03-analysis/attendance-regulation-2026.analysis.md)으로 초안의 "지각 자동 결시 토글"이 규정 충돌(같은 날 지각·조퇴·결과는 한 가지로만 처리 — 바)임을 발견, 폐기.
- **결정**:
  1. **진짜 Option D** — 공유는 도메인(`attendanceRules.ts`)과 headless 그리드 코어(`adapters/components/attendance/shared/`: AttendanceGridView·attendanceGridShared·AttendanceDetailEditor)에 한정하고, 완결형 셸은 각 기능이 소유(담임=HomeroomAttendanceGrid, 수업관리=AttendanceMatrixCore 동작 보존 리팩터링). "셸 승격+props 공유"는 확장점 붙은 A(blast radius 공유)라 배제.
  2. **담임 단일 날짜 출결 = 그리드 단일 기록자** — InputMode 상단 장착, 카드 경로의 출결 입력은 여러 날(기간/여러 날) 모드 전용으로 게이트(기존 다중날짜 출결 기능 보존). 외부 저장 발생 시 그리드는 저장본으로 재시드(스토어 승리 — 이중 기록자 데이터 손실 방지). 렌더 게이트: 번호 충돌 시 그리드 대신 정리 안내(studentKey 행 병합 오염 원천 차단). 미러는 saveDay 콜백이 bridgeHomeroomDayAttendance(students 전달=number→studentId 재매핑)를 승계.
  3. **교시 자동 채움 = 규정 정합 계약** — `computeAutoPeriods`: 결석=조회~종례, 지각=조회~등교 교시(**지각 상태로** — 결과 전환 자동화는 규정 충돌로 미제공), 조퇴=하교 교시~종례, 결과=해당 교시만. 비-present는 절대 빈 Set 금지(빈=전 교시 오해석 방지). Settings 무변경.
  4. **생기부식 통계 = 별표 8 §3 정렬** — `summarizeNeisAttendance`: '인정' 사유 **사전 필터 → 일 단위 대표 접기**(pickRepresentativeAttendance, 학교장 판단 기본값=심각도 순) 합성 순서 고정(라·바·사 동시 충족), 사유 축 질병/미인정/기타(마). ProgressMode에 집계 표+사유 드릴다운+A4 가로 인쇄 2종(요약/상세)+집계 기준 각주.
  5. **AttendanceRecord 스키마 불변** — 저장 키·툼스톤·병합(ADR-019) 무변경. 모바일 보기 영속은 localStorage(동기 스키마 무변경).
- **구현 커밋**: P1a `529faffb` → P2 `179ac00a` → P3 `5b2d16f4` → P4.1 `db62d27a` → P4.2 `3c3fc1e3` → P4.3 `9b566f87` → P4.4 `49259931` → P5 `140d6ecc` → P6 `4df843e9` (전략 1 탈위험 순서, 단계별 게이트 통과 후 커밋).
- **대안**: A(AttendanceMatrixCore 셸 통째 재사용) — 담임 4대 요구(미러·가드·자동채움·다중선택)가 조건분기로 축적돼 회귀 표면 공유, 기각. B(출결 전용 신규 모듈) — 순차 소단위 원칙 충돌, 기각(통계 신설로 흡수). C(카드에 원탭만) — 출결 UI 이원화, 기각.
- **트레이드오프/고지**: 카드 단일 날짜 출결 제거는 UX 변경 → 릴리즈 노트 고지 필요(안내 문구는 화면 내 표기). 그리드+여러 날 카드가 같은 날짜에 겹치면 스토어 승리 재시드로 그리드 미저장 편집이 초기화될 수 있음(데이터 유실 방향보다 안전). 일괄 적용은 행 전체를 덮어씀(초기값, 셀 수정 가능). 메타 회귀 가드 6종(attendanceSingleWriter.metatest)이 단일 기록자·렌더 게이트·미러·교시 단일 출처 불변식을 소스 레벨로 강제.
- **검증**: 단계별 게이트 전부 통과 — tsc 0 / lint 0에러 / regression 38/38 / 전체 vitest 3580 passed(신규 도메인 21케이스 포함; 실패 2건 FillFormFields·RenderTemplate은 단독 16/16 통과하는 기존 병렬 flaky). **실기기 실렌더(그리드 입력·자동채움·인쇄 A4·다크/라이트, 모바일 영속·스와이프)는 릴리즈 전 확인 항목으로 남음.**

## ADR-022: 출결 그리드 v2 — 팔레트 입력 모델 + 자동 저장 + 좌석 뷰 (ADR-021 대체 UX)

- **상태**: active (ADR-021의 담임 그리드 UX를 대체·확장. 도메인·저장·집계 결정은 ADR-021 유지)
- **일자**: 2026-07-11
- **배경**: ADR-021 v1 실기기 확인에서 문제 8건(열 폭 붕괴·종례 미표시·복잡한 5-상태 순환[칸당 최대 4클릭]·사유 입력 부재·페이지 짤림 등) + 나이스 일일출결관리(담임용) 매뉴얼(p28~35) 분석. 나이스 실모델("교시 칸엔 결시 '/'만, 종류·사유는 학생-하루 1건")을 차용하되 마감 절차 없이 팔레트로 더 단순화. ralplan 합의(Planner 코드검증→Architect APPROVE-WITH-CHANGES→Critic APPROVE 2026-07-11), 계획서 `docs/01-plan/features/attendance-grid-v2.plan.md` §3.10 실행 안전 계약이 실행 명세.
- **결정**:
  1. **팔레트 입력 모델** — 종류(결석/지각/조퇴/결과/지우개)+사유(질병/미인정/기타/인정)+비고를 사전 설정 후 학생 행의 교시 칸 클릭=기준 교시로 `computeAutoPeriods` 적용. **전-행 재작성**(§3.10-5): 클릭·행 사유 편집은 그 학생 하루 전체를 재작성(찍힌 교시 외 clear, 전 교시 동일 사유·비고). 레거시 교시별 이질 상태는 로드·표시까지 보존, 첫 편집 시 평탄화(규정상 행당 구분 1건이 원칙). 5-상태 순환·우클릭 팝오버·선택 모드·일괄 바 제거.
  2. **자동 저장 = dirty-gate 주 + 자기 저장 서명 보조**(§3.10-1) — 800ms 디바운스, 편집 중(dirty)이면 외부 스냅샷 변경으로 재시드하지 않음(포커스된 그리드가 이긴다 — v1 "스토어 승리"를 자동 저장 전제로 재정의). 자기 저장은 canonical 내용 다이제스트로 식별(저장측·재시드측 동일 투영). 플러시 3종(날짜 이동·언마운트·window blur). 성공 토스트 금지, 조용한 "저장됨 ✓" 상태칩. 상태(타이머·서명 set·undo 스택)는 그리드 내부 소유, **그리드 셸은 스토어 직접 import 금지 유지**(메타 가드).
  3. **출결 탭 = 유일한 출결 입력구**(§3.6·3.7) — 여러 날 출결까지 출결 탭 패널로 이관해 카드 경로 출결 완전 소멸 → 이중 기록자 방어 로직 불필요. 누가기록(InputMode)에서 출결 입력 경로 전면 제거(단일 기록자 원칙 강화, 완화 아님). 메타 가드를 "출결 입력 경로 부재 + AttendanceMode 유일"로 교체.
  4. **좌석 뷰 = 데이터 재사용·렌더 신규**(§3.10-4) — 자리 배치 도구의 렌더(SeatCard·Freestyle)는 편집 강결합이라 재사용 불가 → `useSeatingStore` 데이터만 읽어 출결 전용 읽기 전용 좌석 카드 신규 제작(편집 액션 import 0으로 구조적 격리). id↔번호 매핑 계층(좌석=studentId, 출결=번호). 1차는 grid 레이아웃 우선(모둠/자유는 후속). 좌석 데이터는 호스트(AttendanceMode)가 읽어 그리드 셸에 prop 주입(셸 스토어 미import 유지).
  5. **공유 뷰 변경 격리**(§3.10-8) — 담임 전용(출석 빈칸·구분/사유 열·하이라이트)은 opt-in prop(기본 off). 단 table-fixed/colgroup은 표 골격이라 공유 뷰 전체에 적용. **실측 결과 공유 AttendanceGridView의 유일 라이브 소비처는 담임 그리드** — 수업관리 소비처(AttendanceTab→AttendanceMatrixView)는 Phase5 UX 정리로 desktop UI에서 언마운트(ClassRecordTab 대체)되어 라이브 회귀 표면이 없음(AttendanceMatrixCore는 컴파일·정적 테스트 통과로 재장착 시 동작 보장).
  6. **저장 스키마·동기화·통계 불변** — AttendanceRecord 스키마·툼스톤·병합·`summarizeNeisAttendance` 무변경(ADR-021 승계). 팔레트는 교시별 fan-out으로 기존 형식에 저장.
- **구현 커밋**: P7.1 `8d5d1b70` → P7.2a `8cabb86d` → P7.2b `879c98fb` → P7.3 `ca7182ea` → P7.4 `8f0aaf22` → P7.5 `49679d3a` (P7.1~P7.3 릴리즈 원자성 묶음, 각 단계 게이트+실렌더 후 커밋).
- **함정/교훈**: **StrictMode 이중 호출** — mountedRef를 cleanup에서만 false로 두면 dev StrictMode에서 false로 고착돼 자동 저장 상태칩이 "저장 중"에 갇힘(마운트마다 true 복원 필요). **타입·테스트 게이트로 안 잡히고 실렌더로만 발견** — 계획 §4 P7.6이 실렌더 게이트를 둔 이유. 자동 저장 fake timer 회귀 테스트는 병렬 부하에서 간헐 실패(단독 통과) → 마이크로태스크 추가 플러시로 완화.
- **트레이드오프/고지**: 릴리즈 노트 고지 3종 — ① 카드 여러 날 출결→출결 탭 이동 ② 기록 탭 첫 진입 화면이 출결로 변경 ③ 레거시 이질 상태 행 첫 편집 시 평탄화. 좌석 뷰는 grid 배치 전용(모둠/자유 "준비 중"). 모바일 행 모델 이관은 후속 과제.
- **검증**: 단계별 tsc 0 / lint 0에러 / vitest 3604 / regression 38. 신규 테스트: parseAttendanceQuickText 계약 14 + 자동저장 fake timer 회귀 7(§3.10-2 4종) + 메타가드 7(리타깃·좌석 격리). 실렌더(Playwright): 열 균등·팔레트 전-행 적용·자동 저장 저장됨✓·undo(버튼+Ctrl+Z)·텍스트 미리보기→적용·여러 날 주말 제외·좌석 [지각+기준2교시]=조회~2교시·요약 칩 하이라이트·다크 모드 확인.
