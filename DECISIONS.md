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

## ADR-023: 동기화 2차 하드닝 — 파일 쓰기 직렬화(공용 락 + 의도 저장) + StudentRecord 항목 단위 병합

- **상태**: active
- **일자**: 2026-07-14
- **배경**: 2026-07-13 실사용자 데이터 유실(v2.2.13에서 병합·툼스톤·스냅샷으로 1차 대응) 후 외부 QA(Codex gpt-5.6-sol)가 남긴 구조 결함 2건 — ① 전 도메인 "읽기→변형→통째 쓰기" 동시 저장 경합(동기화 병합 쓰기가 사용자 저장을 삼킴, 실행 재현) ② StudentRecord 레코드 단위 LWW가 기기 간 서로 다른 체크 항목 편집을 통째로 덮음(HIGH). ralplan 합의 rev.3이 재차 외부 QA에서 NO-GO(BLOCKER 2: 스토어가 락 밖 in-memory 스냅샷으로 저장 페이로드 생성 / 디스크-입력 diff가 낡은 화면을 사용자 변경으로 오인) → rev.4~5 재합의로 설계 전환. 계획서 `docs/01-plan/features/sync-hardening-2.plan.md`(rev.5 CONSENSUS)가 실행 명세.
- **결정**:
  1. **P6 — 저장은 스냅샷이 아니라 변경 의도(intent)다.** 스토어는 전체 배열/레코드를 만들어 넘기지 않는다. 의도만 유스케이스에 넘기고, 유스케이스가 파일 락 안에서 fresh 상태를 읽어 적용한다. 화면(Zustand) authoritative 상태는 유스케이스 반환값(저장 결과)으로만 갱신(컴포넌트 임시 pending 피드백은 허용 — 정확성·반응성 분리).
  2. **공용 파일별 락** — `src/usecases/shared/fileWriteLock.ts`(파일명별 Promise 체인 싱글턴, 같은 파일 직렬·다른 파일 병렬·실패 격리·비재진입 규율[-Unsafe 분리]). 락 키 정본 = `syncRegistry.SYNC_FILE_KEYS`(리터럴 금지, 값=storage 키 테스트 잠금). 적용: SyncFromCloud 병합 6지점(다운로드는 락 밖)·ManageObservations/ManageAttendance 전 변이·ManageStudentRecords(락 키 DI 주입으로 전역 통일)·우회 경로(cascadeTagChange는 intent 이관, migrateStudentRecordsOnLoad 락 내부화). 범위는 record-merge 3도메인(student-records/attendance/observations) 한정 — teaching-classes/curriculum-progress 등 non-merge 도메인은 의도적 미적용(R5 잔여, 후속 PDCA).
  3. **whole-array 저장 API 봉쇄(K1)** — ManageAttendance.saveAll/saveDayBatch, ManageObservations.saveCustomTags/saveCustomCategories 공개 API 삭제. 대체 intent: upsertRecord/replaceDayForClass/upsertStudentEntries(대상 학생만 부분 갱신 — 단일 학생 편집·AI 브릿지 부분 등록이 하루 통째 교체를 재사용하면 stale 페이로드가 동시 편집된 다른 학생을 덮는다[F3])/deleteByClass·add/removeCustomTag/addCustomCategory. 재도입 금지.
  4. **electron main CAS 백스톱 불채택(A3 실측 게이트)** — 정적 전수 추적 결과 보조 창(위젯/QuickAdd/아이콘)은 record-merge 3도메인을 쓰지 않음(위젯 학생기록·진도 아이템=읽기 전용, autoSync 구독=MainApp 전용). 회귀 표면 0 원칙대로 미구현, R5 후속에서 재평가.
  5. **StudentRecord 항목 단위 병합** — `fieldUpdatedAt`(최상위 type 별칭, ENTITY_FIELD_CONTRACT notMirrored — 브릿지 무영향) 지연(lazy) 스탬프. 병합은 record-LWW 승자를 BASE로 추적 그룹(reportedToNeis/documentGroup=documents+documentSubmitted/followUpDone=followUp 3필드)만 오버레이. 항목 오버레이는 **양쪽 모두 fieldUpdatedAt 맵을 보유할 때만** 수행(키 있음=그 값, 키 없음=createdAt — 쓰기 측이 맵 신설 시 미변경 그룹을 직전 updatedAt으로 백필). **한쪽이라도 맵이 없으면 record-LWW 폴백** — mapless 쪽 updatedAt을 항목 백스톱으로 쓰면 무관 편집이 LWW 승자의 항목을 뺏어 P4가 깨진다(최종 리뷰 스윕 S2로 (b)백스톱 설계를 교체). 결과 맵은 채택 그룹 시각 materialize(H3 — 2단계 병합 수렴 테스트로 증명, 하한 클램프는 createdAt 복제 불일치 데이터에서 시각 위조라 제거), 채택 없으면 무변경 통과(대량 재업로드 방지). documentGroup 채택 시 `deriveDocumentSubmitted` 재계산(H4 — 빈 배열 [].every()===true 함정 차단).
  6. **의도 기반 스탬프** — `ManageStudentRecords.update/updateMany`가 `{before, after}`(둘 다 호출 시점 화면 기준)를 받아 화면-화면 diff로 사용자가 실제 바꾼 필드만 추출 → fresh에 절대 SET(F2, CAS 아님) → 바뀐 추적 그룹만 now 스탬프(기존 맵 미소거). 안 건드린 필드는 fresh 보존 — "동기화 직후 낡은 화면의 무관 편집이 체크를 부활"시키던 잠복 버그까지 구조적으로 해소(모바일 브릿지의 재구성 시 플래그 소실 잠복 버그도 승계 방식으로 동봉 수정).
- **구현 커밋**: A1 `f78b2df6` → A2a `d27b1c2d` → A2b `c04e92c0` → A2c `a781d934` → A3 판정 `f9659e77` → B1 `34759e86` → B2 `95a98cec`(병합+스탬프 원자 — 부분 출시 시 bridge 맵 드롭으로 record-LWW 퇴화라 한 커밋).
- **대안**: rev.3의 "유스케이스 본문 락 래핑"(스토어 락-밖 스냅샷 페이로드로 실효 없음 — QA 실증 기각)·"시그니처 불변 디스크-입력 diff"(낡은 화면을 사용자 변경으로 오인해 체크 부활 강화 — QA 실증 기각). A1 유스케이스 체인 확대(sync·우회 미커버), A2 main CAS 전면(회귀 표면 과대), B 평면 시각 필드(스키마 증가)/kind 단위(브릿지 미러 영향) 기각·보류.
- **트레이드오프/잔여**: R1(구버전이 맵 spread 보존 채 더 늦게 편집 → 낡은 항목 스탬프가 이길 수 있음 — 손실 무, 의도적 교환) · R1-c(구버전 map-drop 페어는 record-LWW 폴백 — 무관 편집이 LWW 승자면 체크 부활 가능, 오늘 동작과 정확히 동일·P4 바닥) · R2(documents 그룹 내 kind 동시 분기) · R3(시계 오차) · R4(updateAttendanceRecord의 student-records+attendance cross-file 비원자) · R5(non-merge 도메인 무직렬화 — useTeachingClassStore가 attendance만 intent 반쪽 전환된 비일관 포함, 후속 PDCA). 잔여 전부 유닛테스트로 명시(R1/R1-c).
- **검증**: 스토리별 게이트 전부 통과(tsc 0/lint 0에러/regression 38) + 신규 테스트: fileWriteLock 8·sync×유스케이스 직렬화 통합 9(intra-period 다학생 F3 포함)·mergeStudentRecords.field 15(2단계 수렴·H4 3케이스·R1/R1-c 잠금 — 이 함수는 종전 무테스트)·concurrency 5종 어댑테이션(계약 보존). 브릿지 레포 게이트 typecheck 0·579 tests(fieldUpdatedAt=notMirrored, 브릿지 무변경 확인). 전체 vitest 3742(기지 flaky 2파일 단독 통과)·출결 그리드 실렌더(F4: 연속입력 저장칩·파일 바이트 무유실)·나이스 토글 fieldUpdatedAt 스탬프 실렌더 확인. 최종 xhigh 코드리뷰(파인더 7앵글+스윕, 40여 후보→수정 20건: 브릿지 existing-스프레드 승계[위조 스탬프 차단]·no-op 무스탬프·맵 신설 백필·mapless 페어 LWW 폴백[S2]·period 충돌 병합·모바일 upsertRecord 전환·deleteByClass fresh fail-closed 판정·cascadeTagChange 스탬프 규율 단일화·TRACKED_GROUP_FIELDS 정본·mergeAndWriteLocked 헬퍼 등) 반영 후 게이트 재통과.
- **QA2 반영(2026-07-14 오후 — 구현 완료본 데이터 보존 검증, Codex gpt-5.6-sol NO-GO→수정)**: ① deleteByClass가 그룹에 남은 학급이 있어도 물리 classId 기준으로 공유 그룹 출결을 삭제+툼스톤 전파(베이스 결함 승계) → "살아남는 그룹" 집합 판정+fail-closed 전체 보존으로 교체 ② 모바일 4곳의 classId 단독 조회가 다른 과목 명의 공유 그룹 레코드를 놓쳐 1명짜리 교체(S4 주입이 연 신규 회귀) → 도메인 `findAttendanceRecordForClass`(그룹 키 우선) 신설·전환 + upsertRecord 교체 시 기존 classId 승계(키 불변=툼스톤 0) + S4 주입은 레거시 비그룹 매치 부재 시만 ③ 스토리지 어댑터 3종+electron main data:read의 읽기 오류 null 위장 → **null=부재만·오류=예외 전파**(읽기 실패 시 쓰기 0회 fail-closed). 잔여 R6(멀티탭/멀티컨텍스트 무직렬화 — 미악화, Web Locks 후속)·R7(미래 필드 roundtrip 계약) 등재. 테스트 +9(storageReadError.test.ts 신규). 상세 = 계획서 §12.5.

## ADR-024: 동기화 매니페스트 라이프사이클 — no-op 업로드 무기록 + 장부 분리 + 파일별 uploadedBy

- **상태**: active
- **일자**: 2026-07-21
- **배경**: 실사용자 신고(2026-07-21, 문혜인) — PC의 할 일·일정이 모바일에 영영 안 내려옴(폰 "업로드 변경 없음 (28)", 다운로드 무반응). 재현 테스트로 원인 확정: `SyncToCloud`가 업로드 0건(no-op)이어도 리모트/로컬 매니페스트를 무조건 재작성하며 `{...remote.files, ...local.files}` 단일 병합본을 양쪽에 저장 — ① **받은 적 없는 리모트 항목이 로컬 장부에 승계**되어 이후 SyncFromCloud가 checksum 동일 판정으로 영구 스킵(다른 기기 데이터를 영원히 못 받음) ② 낡은 로컬 항목이 리모트의 더 새 항목을 되돌려 타 기기 변경 감지 훼손 ③ 리모트 deviceId가 no-op 업로더로 찍혀 "내가 올린 데이터" 스킵 오판. 동기화 도입 시점(v2.0.4, `f0d9402c`)부터 있던 설계 결함으로, 모바일 자동 동기화가 업로드 전용(interval→syncTo만)이라 오염 업로드가 PC 업로드와 폰 다운로드 사이에 거의 확실히 끼어들었다.
- **결정**:
  1. **no-op 업로드는 매니페스트를 쓰지 않는다** — `uploaded.length > 0`일 때만 리모트/로컬 매니페스트 갱신. lastSyncedAt·deviceId 위조와 장부 오염의 공통 뿌리 차단.
  2. **리모트/로컬 장부는 서로 다른 사실의 기록이므로 병합 금지** — 리모트 장부 = 기존 리모트 항목 + 이번에 업로드한 항목(타 기기 항목 보존, 낡은 로컬 항목으로 되돌리지 않음). 로컬 장부 = 기존 로컬 항목 + 이번에 업로드한 항목(리모트 항목 승계 절대 금지). 다운로드 측(SyncFromCloud)은 종전대로 실제 받은 항목만 로컬 장부에 기록(무변경).
  3. **파일별 작성자 `uploadedBy`(optional)** — `DriveSyncFileInfo`에 추가, 업로드 시 스탬프. 다운로드의 "내가 올린 데이터" 스킵 판정은 `remoteInfo.uploadedBy ?? remoteManifest.deviceId`(구버전 항목 폴백 — 스킵은 데이터 무변경이라 안전 방향). 매니페스트 최상위 deviceId는 파일별 작성자가 아니라는 사실을 명시화.
  4. **오염 자가 치유** — 다운로드 checksum 동일 판정 시 로컬 스토리지에 실제 파일이 있는지 확인, **없으면**(장부만 "받았음"인 오염 상태) 첫-다운로드 경로로 진행해 받아온다. 로컬 파일이 없으니 다운로드로 잃을 데이터가 0인 유일하게 안전한 치유 방향. 정적·동적·바이너리 3루프 동일 적용(바이너리는 내가 올린 파일이라도 로컬 부재 시 치유 허용). **로컬 파일이 존재하면 종전대로 스킵 — 덮어쓰기 없음**(데이터 보존 불변식, 테스트 잠금).
- **명시적 비변경(데이터 보존 제약)**: 데이터 파일 쓰기 규칙(병합 3도메인·whole-file latest·conflict 정책) 일절 무변경 — 이 업데이트로 새로 생기는 데이터 이동은 "원래 받았어야 했는데 못 받던 파일의 수신"뿐. 신규 기기 첫 업로드가 리모트 whole-file 도메인을 덮는 기존 경로(deferred 미발동 — syncToCloudDeferred.test 3번이 잠근 동작)는 **의도적으로 미변경**(방향 전환 자체가 다른 쪽 데이터를 걸고 하는 트레이드오프라 별도 PDCA로 병합 확대와 함께 다룰 것). 미사용 `ResolveSyncConflict` 유즈케이스(데드 코드, local-resolution이 리모트 장부를 로컬 장부로 덮는 동종 결함 보유)도 미변경 — 재사용 시 본 ADR 정합 필수.
- **혼합 버전 공존**: 구버전 기기가 남아 있으면 그 기기의 no-op 업로드가 여전히 장부를 오염시키지만 신버전 기기의 치유 다운로드는 자기 로컬 상태만 보므로 영향 없음. 구버전이 쓴 항목(uploadedBy 부재)은 deviceId 폴백으로 종전과 동일 판정(스킵=안전 방향, 데이터 유실 경로 없음). PWA는 자동 갱신·데스크톱은 다음 릴리즈로 해소.
- **트레이드오프**: 치유 검사로 다운로드마다 checksum 동일 파일의 로컬 read가 추가됨(28회 내외, 로컬 JSON — 무시 가능). 로컬 파일이 존재하는 오염(장부 항목은 승계됐지만 기기 자체 데이터가 있던 경우)은 판별 불가라 치유 대상 아님 — 파일 내용이 바뀌면 정상 충돌 경로로 회복.
- **검증**: tsc 0 / lint 0에러(경고 132 기존) / 전체 vitest 3770 passed·10 skipped(306파일, --maxWorkers=4) / regression 38/38. 신규 테스트 7(syncManifestLifecycle.test.ts): no-op 무기록·업로드 시 리모트 항목 보존+로컬 승계 금지·되돌림 금지·신고 시나리오 치유(오염 장부+리모트 deviceId=폰 최악 케이스에서 todos 수신)·**데이터 보존(로컬 존재 시 불변)**·uploadedBy 우선 판정·구버전 폴백 스킵·no-op→다운로드 통합 흐름. 기존 동기화 테스트 131 전건 통과(deferred 3종 무변경 포함).

## ADR-025: 1회성 안내 UI는 설정 로드 완료 후에만 판정하고, 지연 저장은 저장 시점 상태를 읽는다

- **상태**: active
- **일자**: 2026-07-22
- **배경**: 실사용자 피드백 #147(smile837@naver.com) B-2 "'쌤핀이예요! 클릭, 오늘 요약~' 멘트가 계속 살아 있어 화면을 자꾸 가립니다" + B-1 "아이콘이 때때로 움직이지 않습니다". 분석(`docs/01-plan/features/icon-mode-coachmark-stuck.handoff.md`)으로 **두 신고의 원인이 하나**임을 확정. `IconWindow`의 코치마크 effect가 마운트 직후 스토어 초기값(`DEFAULT_SETTINGS.widget.icon.showCoachMark = true`)을 보고 말풍선을 켜고 5초 타이머를 무장 → 곧이어 `loadSettings()`가 끝나 저장값 `false`로 dep이 뒤집히면 cleanup이 **타이머만** 정리하고 표시 상태(`showCoachMark`)는 `true`로 남는다. 끄는 코드가 없어 영구 고착 → `wantExpanded` 상시 true → 창이 340×480 확장 유지 → 확장 창은 `setIgnoreMouseEvents(true, {forward:true})`가 기본이라 핀 위 mouseenter IPC 왕복이 늦거나 유실되면 pointerdown이 렌더러에 도달하지 못해 드래그·클릭이 "때때로" 실패(B-1). **영향 대상 = 코치마크를 한 번이라도 본 기존 사용자 전원**(신규 사용자는 저장값도 true라 dep이 안 바뀌어 정상 — 헤비 유저가 신고한 이유).
- **결정**:
  1. **`loaded` 게이트 — 설정 로드 완료 전에는 1회성 UI를 판정하지 않는다.** `useSettingsStore.loaded`를 조건이자 dep으로 사용(`if (!loaded || !enabled) return`)해 **로드 완료 후 딱 한 번** 판정한다. 스토어 기본값은 "아직 모른다"이지 "참"이 아니다 — 다른 1회성 안내(모드 투어·AV 경고 등)를 새로 만들 때도 같은 규칙을 따른다.
  2. **cleanup은 타이머와 표시 상태를 항상 함께 내린다.** 어떤 경로로 타이머가 죽든 말풍선도 반드시 사라지도록 cleanup에서 `setVisible(false)`를 복원한다(고착의 직접 원인이 "타이머만 정리"였다).
  3. **지연 저장 페이로드는 발사 시점에 최신 상태를 읽는다(데이터 보호).** 타임아웃 콜백이 effect 생성 시점의 `settings.widget`을 캡처해 통째 스프레드하면, 로드 전 `DEFAULT_SETTINGS.widget`이 5초 뒤 저장되어 **사용자의 위젯 설정(크기·투명도·데스크톱 모드·표시 섹션)이 기본값으로 덮어써진다**. `useSettingsStore.update()`가 widget을 얕은 병합(`{...current.widget, ...patch.widget}`)하므로 stale 스프레드는 전 필드를 그대로 민다. 반드시 `useSettingsStore.getState()`로 저장 시점 값을 읽어 스프레드한다. **결정 1만 고치고 3을 빠뜨리면 지금까지 타이머가 죽어서 잠복해 있던 이 유실 경로가 비로소 살아난다.**
  4. **수동 탈출구(×) 제공** — 자동 소멸이 어떤 이유로 실패해도 사용자가 직접 치울 수 있어야 한다. 말풍선 본체는 `pointer-events-none`(아래 창으로 클릭 통과) 유지, 닫기 버튼만 `pointer-events-auto` + 감싸는 요소에 `onMouseEnter/Leave={interactiveEnter/Leave}`(팝오버와 동일 패턴)로 확장 창의 마우스 통과를 꺼야 클릭이 닿는다.
  5. **로직은 `useCoachMark` 훅으로 분리** — IconWindow는 전체 앱 스토어 6종·electronAPI·analytics에 묶여 있어 컴포넌트째로는 회귀 테스트가 어렵다. 수명주기만 훅으로 떼어 실제 스토어를 통과하는 테스트를 가능하게 했다.
- **명시적 비변경**: 드래그 판정·클릭/더블클릭 로직·main의 창 확장·마우스 통과 IPC 일절 무변경(`electron/`·스토어 diff 0). 핸드오프 §4-4 지침대로 "드래그 상태 main 단일 소유 이관"은 하지 않았다 — 잘 동작하는 클릭/더블클릭 판정까지 위험해진다. 코치마크 문구도 변경하지 않았다(사용자 학습된 텍스트).
- **트레이드오프**: 기존에는(고착 상태를 제외하면) 로드가 끝나기 전 말풍선이 먼저 떠서 신규 사용자에게 더 빨리 보였다. 이제 로드 완료 후에 뜨므로 표시가 수십 ms 늦어진다 — 정확성과 데이터 보호를 위해 수용.
- **검증**: tsc 0 / lint 0에러(경고 132 기존, Icon 폴더 무경고) / 전체 vitest 3773 passed·10 skipped(307파일, 실패 2건 JsonInteractiveLessonRepository는 부하 flaky로 단독 18/18 통과) / regression 38/38. 신규 테스트 5(`useCoachMark.test.tsx` — 기존 사용자 미표시·신규 사용자 5초 소멸+1회 저장·**저장 페이로드 위젯 설정 보존**·타이머 무장 후 최신값 사용·수동 닫기 후 재저장 없음). **돌연변이 검증**: `loaded` 게이트와 cleanup 복원을 제거하면 테스트 1·2가, 저장 시점 읽기를 무장 시점 캡처로 바꾸면 테스트 4가 실패함을 실제로 확인(테스트가 두 결함을 모두 잡는다). **실화면**: 브라우저 `?mode=icon` 실렌더(기존 사용자 미표시·신규 사용자 표시→5초 소멸→`showCoachMark:false` 저장 시 width 999·opacity 0.42·desktopMode native-desktop 보존·× 클릭 즉시 소멸+저장) + **Electron 실기동**(`npm run build:electron` → `electron:dev:fresh` 격리 프로필, 기존 사용자 상태에서 아이콘 모드 진입 시 창이 **66×66 compact 유지**[확장 340×480 없음, 20초 관찰]·PrintWindow 캡처로 핀만 표시 확인·settings.json의 width 999/opacity 0.42 무변경).

## ADR-026: 모바일 담임 출결의 학생 원천은 담임 명렬표이며, 명단이 비면 저장하지 않는다

- **상태**: active
- **일자**: 2026-07-22
- **배경**: 사용자 피드백 #147(2026-07-22, smile837@naver.com) B-3 — "첫화면 우리반 출결 체크를 누르면 학생 있어도 명단 안 뜸". 원인 확정: 모바일 담임 출결 화면(`AttendanceCheckPage`)이 학생을 **수업 학급 명부**(`useMobileTeachingClassStore.getClass(classId)`)에서 찾는데, 홈에서 넘어오는 `classId`는 `settings.className`("3-5" 같은 학급 이름 문자열)이고 `TeachingClass.id`는 `generateUUID()` 산출물이라 **절대 매치될 수 없다** → 항상 `undefined` → 빈 배열. 같은 진입점의 옆 탭(출결 통계)·PC 담임 출결·모바일 담임 학생 탭은 모두 담임 명렬표(`useMobileStudentStore`)를 쓰므로 **앱 전체에서 이 화면 하나만 원천이 어긋나 있었다**. 함께 발견된 미신고 데이터 유실 경로: 명단이 빈 상태로 "완료"를 누르면 `upsertRecord`가 그날 레코드를 `students: []`로 교체하고 `updatedAt`을 갱신해 **동기화 LWW로 PC의 그날 담임 출결까지 비워진다**(여러 날 적용은 최대 30일을 한 번에).
- **결정**:
  1. **원천은 화면 종류로 분기한다** — `type === 'homeroom'`은 담임 명렬표, `type === 'class'`는 종전 `getClass()` 그대로(수업 출결 회귀 0). 담임 출결의 진실 원천은 명렬표라는 것이 앱 전체의 이미 정해진 규칙이고, 이 화면만 예외였다.
  2. **매핑 규칙은 저장된 데이터와의 호환이 정한다** — `Student → TeachingClassStudent` 변환 시 `number: s.studentNumber`(저장된 `students[].number`·브릿지 역매핑이 이 값을 쓴다), **`grade`/`classNum`은 부여하지 않는다**(담임은 단일 반이라 `studentKey()`가 `String(number)`를 반환해야 기존 기록 로딩 키와 일치. 넣으면 `"3-5-1"`이 되어 저장된 출결이 화면에 안 붙는다). 활성 판정은 `isStudentActive`, 번호 없는 학생(`studentNumber == null || <= 0`)은 제외하고 화면에 사유를 안내한다(출결은 번호로 식별돼 번호 없는 학생끼리 서로 뭉개진다 — 모바일 스와이프 빠른 출결과 동일 정책).
  3. **빈 명단은 저장하지 않는다(데이터 보호)** — `doSave()` 진입부에서 `students.length === 0`이면 즉시 반환(완료 버튼·2초 디바운스 자동저장·언마운트 flush·교시 전환 flush가 전부 이 경로를 탄다). `handleMultiDateSave()`도 동일 가드. UI에서도 완료·여러 날·텍스트 버튼을 비활성화해 이중으로 막는다. **"저장할 게 없다"와 "전원을 지운다"는 다르다** — 명단을 아직 못 읽은 상태의 빈 배열이 사용자 의도로 오인되면 안 된다.
  4. **원천 로드 전에는 판정하지 않는다** — 명렬표(또는 수업 학급)와 **출결 로드가 모두 끝난 뒤에만** 학생 목록·기존 기록을 시드한다. 출결 로드 전에는 `getTodayRecord`가 null이라 "전원 출석" 기본값이 시드되고, 그 상태로 저장되면 그날 기존 출결을 덮는다. 로드 중에는 스켈레톤을 보여준다.
  5. **`classId` 자체를 UUID로 "정규화"하지 않는다** — 저장된 담임 출결 레코드가 전부 `settings.className` 키로 쌓여 있어 키를 바꾸면 **전량 고아가 된다**. 고치는 것은 원천뿐이다.
- **명시적 비변경**: `getTodayRecord(classId, selectedPeriod, teachingClass?.groupId)` 호출 인자(그룹 학급 공유 레코드 조회 계약 — ADR-023 QA2 B2에서 수정된 부분. 담임은 `groupId`가 undefined라 동작 동일)·`type === 'class'` 경로 전체·기존 저장 경로(신규 `saveRecord` 경로 0, 상태맵 경유 유지 — 메타테스트가 강제)·텍스트 빠른 입력/여러 날 적용 로직.
- **트레이드오프**: ① 로드 완료를 기다리므로 목록 표시가 수백 ms 늦어진다(스켈레톤으로 흡수) — 정확성과 데이터 보호를 위해 수용. ② 카운터를 상태맵 전체가 아니라 **현재 명단 기준**으로 세도록 바꿨다. 기록에만 남아 있고 지금 명단엔 없는 학생은 카운트에서 빠진다(명단이 비었는데 "출석 3 · 전체 0"으로 보여 저장된 것으로 오해할 여지를 없앰). ③ 번호 없는 학생은 여전히 모바일 담임 출결에 참여할 수 없다(기존 정책 유지, 안내만 추가).
- **검증**: tsc 0 / lint 0에러(경고 132 기존, 변경 파일 무경고) / 전체 vitest 3786 passed·10 skipped(308파일, `--maxWorkers=4`) / regression 38/38 / landing `docs:check` 통과. 신규 테스트 11(`AttendanceCheckPage.homeroomRoster.test.tsx` — 명렬표 렌더·비활성/번호없음 제외·원인별 빈 화면·`studentKey`=`String(studentNumber)` 기록 복원·저장 페이로드 매핑·빈 명단 3경로 미저장·수업 경로 3종 회귀 0). **돌연변이 검증**: 수정 전 소스로 되돌려 실행하면 11개 중 8개가 실패하고, 수업(`type='class'`) 3개만 통과 — 테스트가 결함을 실제로 잡고 회귀 0도 함께 증명한다. **실화면**(모바일 dev + IndexedDB 시드, `className="3-5"`·명렬표 6명): 홈 "우리 반 → 체크하기"에서 **명단 4명 렌더**(전출·번호없음 제외+안내)·상태 변경 2초 뒤 파일 바이트 확인(`{number:2,status:"absent"}`, grade/classNum 없음)·뒤로→재진입 유지·통계 탭과 학생 수 일치·**명렬표를 비운 뒤 완료를 눌러도 그날 레코드의 `updatedAt`까지 무변경**(버튼 3종 비활성)·텍스트 빠른 입력 3줄 적용·여러 날 2일 저장·수업 출결(6교시, 복합 키 grade/classNum 보존) 회귀 없음.

## ADR-027: 출결 이중 장부의 삭제는 원본 출결부를 먼저 지우고, 실패하면 사본도 남긴다(fail-closed)

- **상태**: active
- **일자**: 2026-07-22
- **배경**: 사용자 피드백 #147 B-4 — "모바일에서 지웠는데 여전히 살아있거나, PC 홈화면에서 지웠는데 담임 메뉴에서 봤을 때는 여전히 살아 있는 경우". 담임 출결은 **두 장부에 이중 기록**된다: ①원본 출결부 `attendance`(AttendanceRecord) ②기록 사본 `student-records`의 `att-<studentId>-<date>`(StudentRecord). 기록 **수정**은 양방향(`updateAttendanceRecord` → `upsertStudentAttendanceEntries`)인데 **삭제**는 사본만 지워 원본이 남았다(`deleteRecord`). 게다가 출결 그리드가 그 날짜를 다시 저장하면 `bridgeHomeroomDayAttendance`가 사본을 **재생성**해 "지웠는데 되살아난다"까지 성립했다. "PC 홈화면"의 정체는 대시보드 담임 메모장 위젯의 **확대 상태**로, `DashboardStudentRecords`가 담임 업무와 **같은 `StudentRecordsEditor`를 통째로 렌더**하고 같은 `deleteRecord`를 부른다 — 두 진입점이 한 원인이다. 모바일은 별개로 `bridgeAttendanceRecord`가 **미로드 스토어의 빈 `records`**에서 `existing`을 못 찾아 present 되돌리기의 삭제를 조용히 건너뛰고(간헐), 비-present는 같은 id를 중복 append 했다.
- **결정**:
  1. **삭제도 양방향으로 만든다 — 단, 원본이 먼저다.** `deleteRecord`가 대상이 출결 브리지 기록(`category==='attendance'` **AND** id `att-` 프리픽스)이면 원본 출결부에서 그 학생의 그날 엔트리를 먼저 제거하고, 그 다음에 사본을 지운다. 부분 갱신 API `upsertStudentAttendanceEntries` + **빈 `recordsByPeriod`** 를 쓴다(대상 학생만 그날 전 교시에서 제거, 나머지 학생은 락 안 fresh 스냅샷 보존). 하루 통째 교체(`replaceDayForClass`)는 동시 편집된 다른 학생 출결을 덮으므로(QA F3) 금지.
  2. **실패 시 정책 = fail-closed(사본을 남긴다).** `updateAttendanceRecord`는 "원본 실패해도 기록은 진행"(부분 실패 허용)이지만 **삭제는 반대로 간다.** 근거는 비대칭이다 — 사본을 먼저 지우고 원본이 남으면 사용자에게는 사라진 것처럼 보이지만 그리드 재저장 때 되살아나고(정확히 신고된 증상), 원본이 지워졌는데 사본이 남으면 화면에 그대로 보이므로 사용자가 **재시도로 수렴**한다(원본 재삭제는 멱등). 실패는 오류 토스트로 알리고 예외를 전파해 호출자가 "삭제됨" UI를 그리지 못하게 한다.
  3. **"조용한 no-op"을 실패로 승격.** `upsertStudentAttendanceEntries`는 `ensureWritable()`이 false면 예외 없이 아무 것도 안 했다 — 반환 타입을 `readonly AttendanceRecord[] | null`로 바꿔 **차단을 `null`로 표면화**하고, 삭제 경로는 null을 실패로 취급한다. 기존 호출처 2곳은 반환값을 쓰지 않아 회귀 0.
  4. **학급·번호를 특정할 수 없으면 정리를 건너뛰고 사본 삭제는 진행한다.** 담임반 미설정(`className` 없음)·명렬표에서 학생 제외(번호 미상)면 원본의 어떤 엔트리인지 알 수 없다. 여기서 삭제까지 막으면 사용자가 그 기록을 **영영 못 지운다** — 기존 동작(사본만 삭제)을 유지하고 경고 로그만 남긴다.
  5. **원천 조회는 스토어가 스스로 보장한다(호출처 8곳).** 핸드오프 권고는 "호출처가 params로 전달"이었으나 실제 `deleteRecord` 호출처는 5곳이 아니라 **8곳**(핸드오프가 `StudentRecords.tsx` 3곳 누락)이라, 하나라도 빠뜨리면 그 진입점만 조용히 옛 버그로 남는다. `className`은 `useSettingsStore`(순환 없음, 로드 보장 포함), 명렬표는 **`studentRepository`에서 fresh 읽기**로 해결한다 — `useStudentStore`는 `useStudentStore → collectExternalRefs → useStudentRecordsStore` 경로가 이미 있어 import하면 순환이 된다(핸드오프의 순환 경고는 실측으로 사실 확인).
  6. **모바일은 스토어 진입부에서 로드 보장** — `bridgeAttendanceRecord`가 `if (!get().loaded) await get().load()`. 호출처 4곳에 흩어져 있어 스토어 내부 보장이 누락에 강하다(`StudentsPage`의 출결 스토어 방어와 같은 패턴).
  7. **출결 기록 삭제에는 "되돌리기"를 제공하지 않는다.** 기존 undo는 `addRecord`로 **새 UUID 사본**을 만들 뿐이라 원본 출결부를 복원하지 못한다 — 이제 원본까지 지워지므로 undo를 남겨두면 "원본 없는 유령 사본"이 생겨 두 장부가 다시 갈라진다. 대신 전파 범위를 문장으로 알린다("담임 출결과 다른 기기에서도 지워집니다"). 비출결 기록의 되돌리기는 **그대로 유지**(회귀 0). 2장부 복원 액션 신설은 법정 장부에 새 쓰기 경로를 다는 일이라 복잡도 대비 위험이 커 채택하지 않았다.
- **명시적 비변경**: `mergeAttendance` 등 동기화 병합(정상 — 문제는 "삭제가 애초에 한쪽에만 기록되는 것") · `replaceDayForClass`/whole-array `saveAll` 미사용 · 사본 장부(student-records)에 툼스톤 신설 안 함(핸드오프 §3-3 — 3-1로 재생성이 멎는지 테스트로 확인했고 실제로 멎는다) · `InputMode`의 기존 우회 안내("출결 기록은 출결 탭에서 지워주세요")는 유지(동작하던 안내라 건드리지 않음).
- **트레이드오프**: ① 한 교시의 학생이 전부 빠지면 레코드 자체가 사라지고 **툼스톤이 전 기기로 전파**된다(되돌릴 수 없음) — 그래서 토스트로 전파를 고지한다. ② 출결 기록 삭제에서 undo가 없어진다(위 결정 7). ③ 삭제마다 명렬표 파일을 1회 더 읽는다(로컬 JSON, 무시 가능). ④ `useStudentRecordsStore`가 `useSettingsStore`·`useToastStore`에 의존하게 된다(둘 다 순환 없음 확인).
- **검증**: tsc 0 / lint 0에러(경고 132 기존) / 전체 vitest 3799 passed·10 skipped(310파일, `--maxWorkers=4`) / regression 38/38. 신규 테스트 13 — 데스크톱 10(`attendanceBridgeDelete.test.ts`: 원본 반영·**같은 날 다른 학생 보존**·다른 날짜 무영향·**그룹 공유 레코드 오삭제 없음+다른 그룹 무접촉**·비출결 회귀 0·재생성 없음·쓰기 실패/읽기 실패/`loadFailed` 3종 fail-closed·번호 미상 폴백), 모바일 3(`mobileAttendanceBridgeDelete.test.ts`: 미로드 삭제·미로드 중복 방지·로드 후 회귀 0). **돌연변이 검증**: 수정 전 소스에서 데스크톱 10건 중 8건 실패(회귀 0용 2건만 통과), 모바일은 로드 가드 제거 시 3건 중 2건 실패. **실화면**(브라우저 모드, localStorage/IndexedDB 실제 바이트 확인): 진입점 ①담임 업무→기록 조회에서 2번 학생 삭제 → 원본에서 2번만 빠지고 **3번의 상태·사유 그대로**, 출결 그리드에도 즉시 반영(`이서연 --`) · 진입점 ②대시보드 담임 메모장 위젯 **확대** → 같은 삭제 동작 + 새 토스트 문구 확인 · 상담 기록 삭제는 **출결부 바이트 무변경 + 되돌리기 토스트 유지** · 모바일 결석→출석 되돌리기 시 사본 삭제·원본 present 반영. **미실행**: 실제 Google Drive 동기화 왕복(계정 필요) — 양쪽 로컬 파일 바이트까지만 확인했고 전파는 기존 파일 단위 동기화 메커니즘을 탄다.

## ADR-028: student-records 삭제 전파 툼스톤 — ISO 문자열 축 + 저장 조립 단일화

- **상태**: active
- **일자**: 2026-07-23
- **배경**: v2.2.14 릴리즈 전 QA 잔여 HIGH 1건 — "학생 기록을 지웠는데 다른 기기에서 다시 생겨요." 같은 저장소의 출결(attendance)·관찰기록(observations)에는 삭제 표식(툼스톤)이 있는데 **학생 기록(student-records)만 없어**, A기기에서 지운 기록이 B기기에 남은 사본과의 병합(`mergeStudentRecords`)에서 "리모트에만 있는 새 기록"으로 취급돼 부활했다. ADR-027로 출결 삭제 경로가 정리되면서 이 비대칭이 표면화됐다(핸드오프 `docs/01-plan/features/student-records-delete-tombstone.handoff.md`).
- **결정**:
  1. **툼스톤 시각 축은 ISO 문자열이다(숫자 금지).** `StudentRecordTombstone.deletedAt: string` — `StudentRecord.updatedAt`(string·optional)과 같은 축에서 문자열 사전순 비교한다. 관찰기록 툼스톤(`deletedAt: number`/ms)을 그대로 복사하면 숫자 vs 문자열 비교가 되어 부활 규칙이 **타입 에러 없이 항상 오판**한다(핸드오프 §4-① — 이 작업 최대 함정). `toISOString()`은 고정 폭 UTC 포맷이라 사전순 = 시간순이며, TTL 컷오프 비교도 같은 축에서 수행한다.
  2. **저장 조립은 `buildStudentRecordsSaveData` 단일 경유.** `buildObservationSaveData` 패턴 — 사라진 id는 툼스톤 추가, 재등장 id는 툼스톤 제거(재작성이 삭제를 이김), TTL(90일 = `STUDENT_RECORD_TOMBSTONE_TTL_MS`, 관찰기록과 동일) 경과분 GC. `ManageStudentRecords`의 저장 6경로(add/update/updateMany/delete/카테고리 저장/cascadeTagChange) 전부가 이 함수를 거친다 — 기존처럼 각 경로가 `{records, categories}` 봉투를 재조립하면 **삭제와 무관한 저장 한 번에 툼스톤이 통째로 소실**된다(파일 자체 검수로 확인한 실제 위험). 데스크톱·모바일 스토어의 삭제가 모두 `ManageStudentRecords.delete()` 하나로 모이므로 스토어 코드는 무변경.
  3. **병합 부활 규칙: `(rec.updatedAt ?? '') > deletedAt`일 때만 생존, 동률·미만·스탬프 부재는 삭제 유지.** `updatedAt` 없는 구 기록은 ''(최고참) 취급으로 항상 삭제가 이긴다 — 지운 걸 되살리는 것보다 안전한 **의도된 기본값**이며 테스트로 못박았다(핸드오프 §4-②). 양쪽 툼스톤은 id별 최신 `deletedAt`으로 합집합 병합(mergeObservations 동일 정책).
  4. **`deleted`는 optional + 비었으면 직렬화하지 않는다** — 과거 파일(키 없음)이 그대로 열리고, 삭제한 적 없는 파일에 키가 생기지 않는다(하위 호환, §4-⑥).
  5. **AI 브릿지 계약 샘플에 넣지 않는다** — 동기화 메타데이터는 `notMirrored` 분류(updatedAt 선례). `contracts/entity-samples/studentRecord.json` 무변경이며, 계약 메타테스트는 명시 등재된 인터페이스만 검사하므로 신규 `StudentRecordTombstone`은 안전(관찰기록 `ObservationTombstone`도 미등재 선례).
- **명시적 비변경**: 출결·관찰기록 툼스톤(이미 정상 — 리팩터링 금지) · `MigrateStudentRecordsSubcatToTags`(봉투 통째 스프레드 저장이라 `deleted` 자동 보존 — 조립 함수 미경유 유지) · `reorderClasses` 통째 저장(별도 과제) · 동기화 잔여 하드닝 R6·R7(별도 PDCA).
- **불변식(승계)**: 모든 학생 기록 write 경로는 저장 전 `updatedAt`(ISO)을 세팅해야 한다(2026-07-13 유실 재발 방지책). 안 찍으면 결정 3에 의해 그 기록은 삭제 후 재작성해도 영원히 부활하지 못한다 — 조립 함수 주석에 명문화.
- **검증**: tsc 0 / lint 0에러(경고 132 기존) / 전체 vitest **3828 passed**·10 skipped(314파일, `--maxWorkers=4`) / regression 38/38 / prettier 통과. 신규 테스트 17 — 병합 9(`mergeStudentRecords.tombstone.test.ts`: 삭제 전파 양방향·정당한 부활·스탬프 부재/동률=삭제 승·하위 호환 무키·신규 기기 null 로컬·툼스톤 합집합 최신 채택·병합 승자 기준 부활) + 저장 조립 8(`ManageStudentRecords.tombstone.test.ts`: 삭제→툼스톤·재등장→걷힘·TTL 경계 GC·무관 저장 승계+categories 보존·무키 유지·첫 저장·delete() 통합·delete 후 update 승계).

## ADR-029 ~ ADR-037: 학년도·학기 전환 + 보관함 (일괄 등재)

- **상태**: active · **일자**: 2026-08-06
- **정본**: `docs/01-plan/features/school-year-archive.plan.md` §7 (ralplan 3자 합의: Planner v3 · Architect r2 · Critic r2 APPROVE + 오너 결정 v4). 각 ADR의 Drivers/Alternatives/Consequences 전문은 계획서에 있다 — 여기는 결정 요지만 등재한다.
- **ADR-029**: 시간 축 최소 단위는 **학기**, 라벨 `'YYYY-S'`(예 '2026-1'), 계산 정본 `src/domain/rules/academicCalendar.ts`. 경계: 3~8월=1학기, 9~12월=2학기, **1~2월=직전 학년도 2학기**.
- **ADR-030**: 아카이브는 엔티티 필드가 아니라 **파일 스냅샷**(`data/archives/{term}/` + 매니페스트 SHA-256). 전 엔티티 `schoolYear` 필드 추가는 기각(300+ 호출처 — 이 숫자는 이 대안에만 적용).
- **ADR-031**: 보관함 뷰어 MVP는 5도메인(명렬·누가기록·관찰+첨부·출결 통계·진도). 나머지는 **저장은 하되 뷰어는 후속** — 뷰어에 없는 도메인도 "보관되어 있어요"를 명시한다.
- **ADR-032**: 마법사 v1은 **전부 보관 고정**(파기 옵션 없음). 영구 삭제는 보관함에서만, 확인 문구 타이핑 2단계 게이트 + 백업 내보내기 선제안.
- **ADR-033**: teaching-classes 레코드 병합 도입은 **NO 종결**(승자 판정은 Drive modifiedTime 출처 + 업로드 DEFER가 이미 방어 — "낡은 기기가 열기만 해도 승자"는 불성립). 성립 조건: **보관/복원 직후 업로드 트리거**(S1.2 요구사항, 자동 동기화는 사용자 설정·비활성 가능).
- **ADR-034**: epoch는 파일 루트가 아니라 **레코드 단위 term 스탬프**(봉투 재조립 9지점이 루트 키를 벗김 — fail-open 금지). term은 **`date`(사건 발생일) 파생 고정**(createdAt 금지 — 학기 경계 오판), 파생 불가=미부착(추측 금지). 선결 검증 4건 전부 실측 PASS 후 구현. 옛 **학년도** 리모트 레코드만 병합 스킵(같은 학년도 타 학기는 병합 — 담임 축 연속), fail-open 3중(term/currentTerm 부재=현행 병합).
- **ADR-035**: `TeachingClass.archived/archivedAt/archivedTerm`은 **notMirrored**(AI 브릿지 미노출). 브릿지의 보관 반 새 진도 쓰기는 `applyLiveSyncWrite`의 가드가 사용자 언어 오류로 거부.
- **ADR-036**: 아카이브 Drive 동기화는 P4 — 구현 완료(2026-08-06). **불변 3중 계약**: 리모트 존재=업로드 스킵 · 로컬 존재=다운로드 스킵 · `archive:import` 기존 학기 바이트 무변경. S2.1b(수동 백업 archives 섹션)와 짝 결정. **알려진 제약**: 삭제한 보관함이 Drive 사본에서 재다운로드될 수 있음(후속 결정: /docs 고지 / 포트 확장 / 툼스톤).
- **ADR-037**: 시즌 배너는 만들지 않는다(오너 결정 — 학교마다 개학일이 달라 단일 구간 정의 불가). 발견성은 kebab "보관" + 보관 섹션 + 릴리즈 노트 + /docs 4경로. `academicCalendar`에 시즌 구간 판정 함수 금지(모듈 표면 계약 테스트로 고정).

## ADR-038: 의존성 취약점은 "배포되는 코드" 기준으로 다루고, override는 정확 버전으로 핀하지 않는다

- **상태**: active · **일자**: 2026-08-07
- **배경**: Dependabot 알림 39건이 쌓여 방치 상태였다. 추적해 보니 세 갈래였다 — ①우리가 만든 override 핀이 낡아 **취약 버전을 붙잡고** 있었다 ②앱이 실행조차 하지 않는 코드(kordoc의 MCP 서버 계열·OCR 계열·sharp)가 설치파일에 담겨 알림을 만들었다 ③운영 스크립트 전용 패키지(`@google/genai`)가 `dependencies`에 있어 배포본까지 따라갔다.
- **결정 1 — 정확 핀 금지**: `overrides`는 반드시 캐럿(`^`) 범위로 적는다. `"shell-quote": "1.8.4"` 처럼 정확 버전으로 고정하면 그 버전에 새 권고가 붙는 순간 override 자체가 취약점을 고정하고, npm/Dependabot이 스스로 올리지 못한다. 실제로 shell-quote 1.8.4 · brace-expansion 1.1.17/2.1.3 핀이 정확히 이 상태였다(고치자마자 4건 소멸).
- **결정 2 — 위험의 기준은 배포본**: 판단은 `npm audit`(개발 도구 포함) 총계가 아니라 `npm audit --omit=dev` + electron-builder `files` 제외 목록을 통과한 **실제 설치파일 트리** 기준으로 한다. 배포되지 않는 코드의 취약점은 선생님 PC에 도달하지 않는다.
- **결정 3 — 미사용 서브트리는 설치파일에서 제외하고 테스트로 고정**: kordoc은 `kordoc-mcp` 별도 실행파일에서만 `@modelcontextprotocol/sdk`(→express·hono)를 쓰고, 앱이 import하는 `dist/index.cjs`는 xmldom·jszip·markdown-it만 필요하다. sharp(+@img 20MB)는 앱 런타임 미사용(이미지 처리는 Electron `nativeImage`). 이 제외 목록은 `builderFiles.meta.test.ts`의 `REQUIRED_NODE_MODULES_EXCLUSIONS`가 지킨다 — **되돌리려면 런타임 require 여부를 grep으로 먼저 증명**해야 한다.
- **결정 4 — 앱이 안 쓰는 패키지는 devDependencies**: `dependencies`는 electron-builder가 그대로 설치파일에 담는다. 스크립트·빌드 전용은 예외 없이 `devDependencies`.
- **결정 5 — nut-js 제거, Ctrl+V는 koffi로 직접 보낸다** (2026-08-07 후속 완료): `@nut-tree-fork/nut-js`는 낡은 jimp(0.22)에 고정되어 jimp → @jimp/core → file-type 알림 7건을 **상류 패치 없이** 영구히 달고 다녔다. 실제 사용처는 스티커 자동 붙여넣기 Ctrl+V 한 곳뿐이므로, 이미 쓰고 있는 koffi로 user32.dll `SendInput`을 직접 호출하도록 대체했다(`electron/platform/win32SendKeys.ts`). 의존 113개 제거 → moderate 7건 전부 소멸. macOS는 원래부터 osascript 경로라 무관. 재도입은 **REGRESSION #51**이 막는다. INPUT 구조체 크기는 상수가 아니라 `koffi.sizeof`로 실측해 넘긴다(아키텍처 변화에 안전), SendInput이 실패하면 keybd_event로 1회 재시도하고 그래도 실패하면 예외를 던져 "직접 Ctrl+V" 안내로 떨어진다(조용한 실패 금지).
- **결정 6 — Electron 43 상향** (2026-08-07 후속 완료): 40.10.6에 남은 권고(GHSA-9f4c-93c8-jc8g)는 42+ 를 요구했다. 43.3.0(Node 24.18.1 / Chromium 150)으로 올렸다. **선결 검증**: koffi가 Node-API 기반(플랫폼당 바이너리 1개, Node 버전별 아님)임을 확인한 뒤 새 런타임에서 proto·struct by-value·`koffi.register` 콜백·WH_MOUSE_LL 훅 설치/해제까지 실제 호출로 통과시켰고, 프로덕션 빌드를 격리 데이터 폴더로 띄워 앱 자체 FFI self-check 통과와 무크래시 부팅을 확인했다. **후속 주의**: Electron 메이저 상향은 OS 최소 요구 버전을 함께 올릴 수 있다(Electron 43 지원 범위는 Windows 10 이상 / macOS 12 이상 — 현재 `minimumSystemVersion: 12.0.0` 과 정합). 구형 PC 실기기 확인 필요.
- **알려진 잔여(의도적)**: `esbuild` 0.28 업그레이드 **금지** — vite 6 빌드가 깨진다(기존 결정 유지). low 등급이고 개발 서버 전용이라 수용한다. 이 1건 외에 **설치파일에 담기는 취약점은 0건**이며, 나머지 감사 항목은 모두 위 제외 목록에 걸려 배포되지 않는다.

## ADR-039: "장부와 실제 내용이 다름"은 충돌이 아니다 — 미업로드 로컬 변경과 빈 봉투 유실을 가른다

- **상태**: active · **일자**: 2026-08-10
- **배경**: v2.3.1 핫픽스(`81b58ab5`, 모바일 Drive 복구 유실 방지)가 `SyncFromCloud`에 새 판정을 넣었다 — "로컬 장부 체크섬 == 리모트 장부 체크섬인데 실제 로컬 파일 내용이 다르면 충돌". 의도는 PWA 재설치로 **빈 봉투만 남은** 파일이 "변경 없음"으로 영구 스킵되는 것을 막는 것이었다. 그런데 이 판정은 **아직 업로드되지 않은 정상적인 로컬 변경**까지 같은 그물로 잡았다.
- **폭발한 지점**: `useDriveSyncStore`는 동기화가 끝난 뒤 `settings.sync.lastSyncedAt`을 다시 쓴다(업로드 후 `:126-129`, 다운로드 후 `:260-263`). 이 쓰기는 **장부 체크섬이 확정된 이후**라, 매 동기화가 끝날 때마다 settings 파일이 장부와 어긋난 채로 남는다 → 다음 다운로드가 **매번** settings 충돌 창을 띄웠다. 충돌을 해결해도 그 동기화가 또 시각을 덧써 **무한 반복**. 앱은 부팅·주기·창 포커스마다 동기화하므로(`App.tsx:950/978/1066`) 체감상 계속 떴다. 화면의 `Invalid Date`는 이 판정이 시각 자리에 넣는 문자열 `'content-mismatch'`가 그대로 렌더된 것이다. 게다가 이 분기는 `conflictPolicy`를 검사하지 않아, 기본값 `latest`(자동 처리) 사용자에게도 창이 떴다.
- **결정**: 같은 상태에 성격이 정반대인 둘이 겹쳐 있으므로 **갈라서** 처리한다.
  - **(a) 미업로드 로컬 변경 → 스킵**. 이 분기의 전제가 "리모트 체크섬 == 내 장부 체크섬"이므로 **Drive에 새로 받을 내용이 없음이 증명된다**. 변경분은 곧바로 이어지는 업로드 경로가 올린다(다운로드 → 업로드 순서는 3개 트리거 전부 동일). 따라서 스킵은 데이터 보존 관점에서 안전하다.
  - **(b) 빈 봉투 + 리모트가 더 큼 → 충돌 유지**. v2.3.1이 지키려던 유실 회수 지점은 그대로 둔다.
- **판정식**: `!hasSubstantiveContent(local) && remoteInfo.size > localSize`. **크기 비교를 함께 보는 이유**가 핵심이다 — `hasSubstantiveContent`는 배열 우선 규칙이라 settings처럼 배열이 부수적인 설정 객체는 배열이 모두 비면 "빈 봉투"로 오판한다. 장부에 이미 기록돼 있는 `size`를 함께 보면 "로컬이 리모트보다 실제로 비었다"만 잡힌다(신고 사례의 실측: 28B vs 743B).
- **함께 제거**: settings 전용 이스케이프 해치(수신본을 매번 내려받아 `preserveNewerTermGuard` 결과와 대조하던 블록). (a) 규칙이 상위에서 같은 결론을 내므로 도달 불가가 되고, **매 동기화마다 settings.json을 1회 더 내려받던 낭비**도 사라진다. 학기 가드 보존 자체는 `writeReplacedFile`이 그대로 담당한다(무변경).
- **하지 말 것**: 이 판정을 "장부와 다르면 충돌"로 되돌리지 말 것. 되돌리는 순간 **동기화가 스스로 만든 흔적이 곧 충돌**이 되는 자가당착이 재발한다. 회귀는 `contentMismatchPendingLocalChange.test.ts`가 양방향으로 잠근다(가짜 충돌 0건 + 빈 봉투 충돌 유지).
- **남은 구조적 빚(비차단)**: `sync.lastSyncedAt`은 기기별 정보인데 동기화 대상인 `settings` 안에 산다. 그래서 settings는 **매 동기화 주기마다 무조건 업로드**되고(체크섬이 항상 달라짐) 기기 간 설정 LWW 핑퐁을 만든다. 이번 판정 수정으로 사용자 피해(충돌 창)는 사라지지만 업로드 낭비는 남는다 — 시각을 기기 전용 저장소로 분리하는 별도 작업 단위 필요.

## ADR-040: "마지막 동기화 시각"은 동기화 대상에서 빼내 기기 전용 저장소에 둔다

- **상태**: active · **일자**: 2026-08-10 (v2.3.5)
- **배경**: `sync.lastSyncedAt`은 기기마다 다른 값인데 **동기화 대상 파일인 settings 안**에 살았다. 동기화가 끝날 때마다 이 값을 갱신했으므로 동기화 대상 파일이 매번 바뀌었고, 표시 문구 하나 때문에 파이프라인 전체가 흔들렸다.
- **드러난 피해 3종**: ①settings가 **매 동기화 주기마다 무조건 업로드**(내용이 늘 달라짐 — 체크섬 스킵이 영원히 안 걸림) ②기기 A·B가 서로의 시각으로 settings를 덮는 **LWW 핑퐁** ③그 쓰기가 **장부 확정 이후**라 다음 다운로드가 이를 "충돌"로 오해 → 사용자에게 무한 반복 충돌 창(ADR-039 신고 본체).
- **결정**: 시각을 기기 전용 키 `drive-sync-device-state`로 분리한다. **SYNC_FILES에 절대 등재하지 않는다**(선례: `YEAR_TRANSITION_REMOVED_KEY`). 동기화 완료 경로(업로드·다운로드) 양쪽이 이 키에만 기록한다.
- **로컬 Drive 장부의 `lastSyncedAt`을 재사용하지 않은 이유**: 그쪽은 실제 업로드/다운로드가 있었을 때만 갱신된다(no-op 장부 오염 방지 규칙). 화면의 "n분 전 동기화"는 **변경 없는 동기화도** 반영해야 하므로 축이 다르다.
- **표시·마이그레이션**: 읽는 곳 3군데(사이드바 `DriveSyncIndicator`·설정 `BackupCard`·`AccountSection`)는 **스토어 값 우선 + `settings.sync.lastSyncedAt` 레거시 폴백**. 앱 시작 시 `hydrateLastSyncedAt()`이 기기 저장소에서 복구하고, 없으면 레거시 값을 1회 승계해 기록한다 — 업데이트 직후에도 표시가 끊기지 않는다. `Settings.sync.lastSyncedAt`은 타입에 남기되 `@deprecated` 읽기 전용(구버전 기기가 올린 값을 파싱할 수 있어야 하므로 제거하지 않는다).
- **하지 말 것**: settings(또는 다른 동기화 대상 파일)에 **동기화 자신이 만들어내는 값**을 쓰지 말 것. 진행률·마지막 시각·기기 상태처럼 "동기화의 부산물"은 전부 기기 전용이다. 회귀는 `driveSyncLastSyncedAtLocation.meta.test.ts`가 소스 단에서 막는다(패턴 부활 금지 + 기기 저장 호출 존재 강제 + SYNC_FILES 미등재 확인).
- **일반 규칙**: 새 필드를 settings에 넣기 전에 "이 값이 **다른 기기에도 같아야 하는가**"를 먼저 물을 것. 아니라면 settings가 아니다.

## ADR-041: Drive 조건부 갱신은 ETag 헤더에 의존하지 않는다 — 브라우저는 그 헤더를 읽을 수 없다

- **상태**: active · **일자**: 2026-08-11 (v2.3.6)
- **증상**: "클라우드 settings 파일이 동기화 중 변경되었습니다. 다시 동기화해 주세요."가 **동기화를 반복해도 사라지지 않음**(2026-08-11 신고).
- **원인**: `getFilePrecondition`이 `res.headers.get('ETag')`를 읽어 없으면 `null`을 반환했고, 그 위에 선 `uploadSyncFileIfUnchanged`/`updateSyncManifestIfUnchanged`가 전부 실패했다. 그런데 **Google API 응답은 CORS `Access-Control-Expose-Headers`에 `etag`를 포함하지 않는다.** 직접 측정(2026-08-11):
  ```
  200 응답: Access-Control-Expose-Headers: content-encoding,date,server,content-length,vary
  401 응답: www-authenticate,content-encoding,date,server,content-length,vary
  ```
  브라우저·Electron 렌더러(webSecurity 기본 on, CORS 우회 없음)에서 `headers.get('ETag')`는 **항상 null**이다. 즉 조건이 아니라 **상수 실패**였다.
- **영향 범위**: `getFilePrecondition` 도입은 v2.3.1. → **v2.3.1~v2.3.3**: 충돌 화면의 "이 기기 유지"가 항상 실패(사용자가 충돌을 해결할 수 없었던 진짜 이유). → **v2.3.4~v2.3.5**: 일반 업로드 경로까지 CAS를 타면서 **클라우드에 이미 있는 어떤 파일도 갱신 불가**. 데스크톱·모바일 공통.
- **왜 테스트가 못 잡았나**: `DriveSyncAdapterConditional.test.ts`가 모의 응답에 **ETag를 직접 넣어줬다**. 실제 Google이 주지 않는 값을 테스트가 공급해, 현실과 다른 세상을 검증하고 있었다. **교훈: 외부 API의 "응답 헤더를 읽는" 코드는 모의값을 넣는 순간 검증력이 0이 된다 — 헤더 부재 케이스를 반드시 같이 둘 것.**
- **결정**: 판정 기준은 **응답 본문으로 읽을 수 있는 값**(`modifiedTime`)으로 한다. ETag는 읽히는 환경에서만 `If-Match`로 덤으로 얹고, **부재를 실패로 취급하지 않는다**. 헤더 부재 시 `If-Match`를 빈 값으로 보내지 않는다(412 유발).
- **수용한 한계**: 마지막 확인과 PATCH 사이의 짧은 경합 창은 If-Match 없이 닫을 수 없다. 다만 확인은 2회(목록 + 신선한 GET) 하며, v2.3.1 이전에는 **확인 자체가 없었으므로** 그때보다 엄격하다. Drive v3에 서버측 CAS가 없는 이상 이게 상한이다.
- **하지 말 것**: 외부 API 응답 **헤더**를 신뢰 경로의 필수 입력으로 삼지 말 것. CORS로 가려지면 조용히 100% 실패한다. 회귀는 `DriveSyncAdapterConditional.test.ts`의 "ADR-041 — ETag를 읽을 수 없어도 조건부 갱신이 동작한다" 3건이 막는다(수정 전 코드에서 2건 실패함을 실측 확인).

## ADR-042: 모드 적용 실패의 정정은 main이 settings.json에 직접 쓴다 — renderer 단독 정정 금지

- **상태**: active · **일자**: 2026-08-11 (v2.3.7)
- **증상**: "바탕화면 아이콘 아래"를 눌러도 아무 변화가 없고, 오류 안내도 없으며, 설정에는 계속 선택된 것으로 보인다(2026-08-11 신고, 특정 사용자 환경).
- **원인**: 붙이기 실패 시 main은 fallback 모드를 적용하고 `desktopMode:fallback` IPC만 쏘았다. `settings.json` 정정은 **renderer의 `useDesktopModeFallback` 훅 한 곳에만** 있었다. 그 신호를 놓치거나(창이 아직 구독 전/닫힘/메모리 절약 모드로 해제) 다른 창의 설정 사본이 나중에 통째로 덮어쓰면, **저장값 `native-desktop` / 실제 적용 `normal`** 의 불일치가 굳는다.
- **왜 치명적인가**: 그 상태에서 재시도 경로가 **전부** "값이 같으면 무시"로 막혀 있었다 — 라디오는 이미 선택돼 change 이벤트가 안 나고, 설정 저장은 `desktopMode` 변경분이 없으면 IPC를 안 보내고, 헤더 칩·실패 안내창의 "다시 시도"는 `from === next` 조기 반환으로 죽은 버튼이었다. **사용자가 UI로 빠져나올 방법이 0개**였다.
- **결정**: 실제 적용 결과를 아는 **main이 파일의 단일 진실 원천을 직접 맞춘다**(`persistDesktopModeFallback`). IPC 브로드캐스트는 화면 표시 동기화용으로 유지한다(둘 중 하나만으로는 부족 — 파일만 고치면 열려 있는 창의 표시가 틀리고, IPC만 쏘면 유실 시 파일이 틀린다).
- **하지 말 것**: "실제 상태를 아는 쪽"과 "그 상태를 저장하는 쪽"을 다른 프로세스로 분리하지 말 것. 저장이 renderer 단독이면 창 생명주기(메모리 절약 모드로 메인 창 해제 등)에 정합성이 종속된다.
- **동반 규칙**: 사용자 의도를 되돌리는 자동 정정에는 **반드시 되살릴 손잡이**를 함께 둔다. 값 동일성만으로 재시도를 막지 말 것(force 경로 필수). 회귀는 `WidgetTab.test.tsx` 2건이 막는다.

## ADR-043: 사용자에게 도달해야 하는 알림은 "메인 창 전용 UI"로 만들지 않는다

- **상태**: active · **일자**: 2026-08-11 (v2.3.7)
- **증상**: 릴리즈를 내도 자동 업데이트가 잘 퍼지지 않는다는 오너 관찰(2026-08-11).
- **측정**: 업데이트 피드 자체는 정상이었다 — `releases/latest/download/latest.yml`이 올바른 버전·해시·크기를 반환하고 자산 URL도 302. 막힌 곳은 **앱 안**이었다. ① `autoUpdater.autoDownload = false`라 사용자가 눌러야 내려받기가 시작되는데 ② 그 버튼이 있는 `UpdateNotification`은 **MainApp에서만** 렌더되고 ③ 위젯의 배너는 `downloaded` 상태에서만 떠서 **도달 불가능한 상태**였으며 ④ 아이콘 모드엔 업데이트 UI가 아예 없고 ⑤ 메모리 절약 모드(기본 ON)는 위젯 전환 시 메인 창을 해제한다. 즉 **이 앱의 주 사용 형태(위젯 상주)에서 업데이트 경로가 완전히 닫혀 있었다.**
- **결정**: 도달이 목적인 알림(업데이트·보안 공지 등)은 **모든 창 모드에 표시 경로를 둔다**. 위젯은 하단 배너, 아이콘 모드는 핀 말풍선(버전당 1회) + 팝오버 내 실행 버튼. 상태 구독·트리거는 `useUpdateBanner` 훅으로 단일화해 모드별 UI가 갈라지지 않게 한다.
- **유지한 것**: 자동 내려받기는 계속 끈다(설치 파일 290MB — 학교 회선에서 동의 없이 받지 않는다). macOS는 `manualOnly`로 브라우저 DMG 안내 유지.
- **하지 말 것**: "다운로드 완료"처럼 **선행 단계가 없으면 도달할 수 없는 상태**를 표시 조건으로 삼지 말 것. 표시 조건은 그 화면에서 실제로 도달 가능한 상태여야 한다. 회귀는 `useUpdateBanner.test.ts` 6건이 막는다(특히 "완료 후 같은 버전 재통지가 상태를 되돌리지 않는다").

## ADR-044: 진도를 다른 반에 옮길 때 교시는 복사하지 않는다 — 대상 반 시간표가 정한다

- **상태**: active · **일자**: 2026-08-11
- **증상**: "진도 추가할 때 다른 반에서 복사하기 기능이 있으면 좋겠다"는 요청(2026-08-11 피드백). 그런데 **기능은 이미 있었다** — 진도 탭의 "다른 반에서 불러오기". 있는데도 요청이 들어왔다는 것은 쓸모가 없었다는 뜻이다.
- **원인**: 불러오기가 `entry.period`를 **그대로 복사**했다(구 `ProgressTab.tsx:294`). 반마다 시간표가 다르므로 2반이 3교시면 3반은 5교시인 게 보통이고, 날짜도 수업 요일이 달라 어긋난다. 조정 수단은 "일괄 며칠 밀기"와 항목별 달력뿐이라 **복사한 뒤 거의 전부 손으로 고쳐야 했다**. 게다가 방향이 pull(받을 반에 들어가서 가져오기)이라 담당 반 수만큼 반복해야 했고, 중복 검사가 없어 두 번 누르면 그대로 두 배가 됐다.
- **결정**: 진도를 다른 반에 넣을 때 **날짜·교시는 복사 대상이 아니라 대상 반 시간표에서 다시 계산할 값**으로 본다. 순서는 같은 날 같은 교시 → 같은 날 다른 교시 → 가장 가까운 다음 수업(최대 3주). 시간표 매칭이 전혀 없을 때만 원본 자리를 그대로 쓴다. 이 계산은 `domain/rules/progressFanout.ts`의 순수 함수(`resolveFanoutPlacement`)이고 시간표 조회·중복 판정은 호출자가 콜백으로 주입한다 — 그래서 데스크톱·모바일이 같은 규칙을 공유한다.
- **중복 처리**: 이미 진도가 있는 자리는 **덮어쓰지 않고 건너뛴 뒤 다음 후보를 찾는다**. 단순히 "중복이면 실패"로 두면 한 반에 두 건을 연달아 넣을 때 두 번째가 매번 버려진다. 후보를 이어 찾게 하면 그게 자연스럽게 "다음 수업"이 된다.
- **복사본 상태는 항상 '예정'**: 다른 반은 아직 그 수업 전일 수 있다. 완료 여부까지 복사하면 진도율이 사실과 다르게 부풀고, 되돌리려면 반마다 손을 대야 한다. 목록에서 한 번 눌러 완료로 바꾸는 비용이 훨씬 싸다.
- **하지 말 것**: 시간표에 의존하는 배정을 붙이면서 **시간표 로딩을 보장하지 않는 화면**에 그대로 얹지 말 것. 모바일 진도 입력창은 교사 시간표를 로드하지 않아, 오늘 화면에서 열면 매칭이 0건이 되어 조용히 "원본 그대로 복사"로 떨어졌다(같은 커밋에서 수정). 매칭 실패가 곧 잘못된 배정이 되는 구조라 실패가 눈에 띄지 않는다.
- **유지한 것**: 기존 "다른 반에서 불러오기"는 그대로 둔다 — 이미 짜둔 계획을 통째로 옮기는 용도로는 여전히 쓸모가 있다. 회귀는 `progressFanout.test.ts` 17건이 막는다.

## ADR-045: 외부 서버 조회는 "사용자가 직접 누른 경로"에만 얹는다 — 자동 새로고침에 태우지 않는다

- **상태**: active · **일자**: 2026-08-12
- **요청**: "시간표 화면 새로고침처럼 위젯 새로고침에서도 컴시간 변동을 확인하고 싶다"(2026-08-11 피드백, 챗봇 에스컬레이션). 사실 확인: 위젯 새로고침(`triggerRefreshAll`)은 저장 파일을 다시 읽을 뿐이고 서버 조회가 **0회**였다 — 챗봇 답변이 맞았다.
- **결정**: 변동 확인은 위젯 헤더의 기존 새로고침 버튼 `onClick` 에만 얹고, `useWidgetRefresh` 와는 **다른 이벤트**(`ssampin:widget-check-timetable`)로 분리한다. 컴시간·압핀 중 켜져 있는 것만, 켜져 있지 않으면 조회도 안내도 하지 않는다(침묵).
- **왜 분리가 핵심인가**: `useWidgetRefresh` 는 버튼뿐 아니라 **5분 타이머와 창 활성화**에도 같은 콜백을 부른다. 여기에 얹었다면 위젯으로 상주하는 사용자 전원이 comci.net·sgpap.com 을 종일 폴링했을 것이다(하루 1회 원칙 위반·차단 위험). 이벤트가 갈라져 있다는 사실 자체를 소스 계약 테스트로 고정했다(`useWidgetRefresh.ts` 에 comcigan/appin 언급 금지).
- **표현과 판정의 분리**: 위젯 창에는 `ToastContainer` 가 없어(App.tsx `WidgetApp`) 확인 함수의 토스트가 **한 줄도 보이지 않는다**. 그래서 `checkComciganTimetableChange`/`checkAppinTimetableChange` 가 판정 결과를 반환하고(`silent` 옵션), 안내는 창이 직접 그린다 — 메인은 토스트, 위젯은 하단 배너(ADR-043과 같은 계열의 함정).
- **창을 넘길 땐 상태가 아니라 의도를 넘긴다**: 감지 결과(검토 대기)는 창별 메모리인데다, `window:navigateToPage` 는 메인 창을 띄우며 **위젯 창을 닫고** 메모리 절약 모드면 메인 창을 새로 만든다. 그래서 결과를 직렬화해 보내는 대신 `timetable#sync-review` 라는 **의도**만 넘기고, 도착한 시간표 화면이 (대기 중 검토가 있으면 그것을 열고, 없으면 한 번 더 확인해서) 마무리한다. fragment 해석 규칙은 `parseNavigationTarget` 한 곳에만 둔다 — IPC 경로와 앱 내 이벤트 경로가 갈라지지 않도록.
- **하지 말 것 ①**: 비교 기준(현재 시간표)이 로딩되기 전에 확인을 돌리지 말 것. 위젯 창의 스토어는 시간표 위젯 카드가 있을 때만 채워지고, 메모리 절약 모드의 메인 창은 방금 만들어졌을 수 있다. 빈 시간표를 기준으로 비교하면 **아무것도 안 바뀌었는데 "전부 바뀌었다"** 가 된다 → 두 경로 모두 `load()` 선행을 강제한다.
- **하지 말 것 ②**: 재진입 가드를 첫 `await` 뒤에 세우지 말 것. `if (inFlight) return` 과 `inFlight = true` 사이에 await 가 있으면 연타 두 번이 모두 통과해 서버를 두 번 두드린다.
- **회귀**: `useWidgetTimetableCheck.test.ts` 13건(자동 경로 무조회·침묵·쿨다운·연타·로드 선행 순서·폴링 금지 계약) + `navigationTarget.test.ts` 5건.

## ADR-046: 학기는 달력이 아니라 학교가 정한다 — 개학일을 받되 앱이 날짜를 지어내지 않는다

- **상태**: active · **일자**: 2026-08-12
- **증상**: 2학기를 이미 시작한 학교인데 쌤핀 곳곳이 1학기로 표시됐다. 원인은 학기 판정이 두 갈래뿐이었기 때문이다 — ①`settings.currentTerm`(학년도 마무리를 **실행해야만** 생김) ②없으면 `academicTerm()` 달력 파생(3~8월=1학기). 그래서 8월 중순 개학 학교는 **9월 1일까지** 앱 전체가 1학기였다.
- **더 큰 문제**: 표시를 2학기로 바꾸는 유일한 방법이 **마무리 마법사**(기록을 보관함으로 옮기고 라이브를 비움)였다. "표시만 맞추고 싶다"에 데이터 이동을 요구한 셈 — **표시 축과 마감 축이 한 필드에 묶여 있었다.**
- **결정 1 — 축 분리**: 새 필드 `settings.termStartDates`(학기 라벨 → 개학일)를 **표시 축의 정본**으로 둔다. `currentTerm`은 마감·동기화 병합 가드 전용으로 그대로 두고 **건드리지 않는다**(ADR-029 계열 가드가 어긋나면 부활 계열 버그가 재발한다). 둘을 합치는 판정은 `resolveCurrentTerm` 한 곳에만 있다.
- **결정 2 — 날짜를 지어내지 않는다**: "8월 16일부터 2학기" 같은 구간을 새로 박지 않는다(ADR-037 유지). 3월 개학 학교가 정반대로 틀린다. 개학일은 **학교가 알려준 값**일 때만 달력을 대신한다.
- **판정 규칙(`domain/rules/schoolTermStart.ts`)**: 달력 파생을 기본값으로 두고, 개학일 파생이 **같은 학년도**면 그쪽이 이긴다. 학년도가 다르면 등록이 낡은 것이므로 달력을 따른다 — 이 조건이 없으면 작년 개학일 하나 때문에 새 학년도가 영원히 안 넘어간다. 마지막으로 `currentTerm`이 더 뒤면 그것이 이긴다(마감한 학기로 되돌아가지 않는다). 이 세 줄이 8월 개학(8/18부터 2학기)과 9월 초 개학(9/1~9/4는 아직 1학기)을 **동시에** 만족시킨다.
- **결정 3 — 자동 감지는 두 신호를 함께 쓴다. 단, 확인 없이 적용하지 않는다**:
  - **학사일정(넓다·정확하다)**: 학교가 올린 학사일정에 '개학식'이 그대로 있다(실제 사례 `2026-08-11`). 날짜 자체를 주므로 정확하고, 나이스에 **시간표를 올리지 않은 학교**(예: 경기북과학고)도 커버한다. 설정 화면이 이 후보를 개학일 칸에 채우고 **출처 행사명을 함께 보여준다** — 출처를 안 밝히면 앱이 날짜를 지어낸 것처럼 보인다.
  - **시간표 조회(좁다·하한선)**: `fetchNeisTimetableWithSemesterFallback`의 **반대 학기 재시도가 성공했다는 사실**이 "달력은 1학기인데 학교 데이터는 2학기"라는 학교의 증언이다. 첫 조회가 그냥 성공한 경우는 증언이 아니다(6월에 9월 주간을 미리 조회하면 축이 처음부터 2학기라 성공한다 — `usedFallbackSemester`를 반드시 요구하는 이유).
  - 두 신호 모두 **제안까지만** 한다. 행사명은 학교마다 제각각이고("등교개시일") 앱이 학사 구간을 단정하지 않는다는 원칙은 그대로다.
- **결정 4 — "이번 학기" 필터는 명목일이 아니라 실제 개학일부터**: 같은 계산이 **6벌** 복제돼 있었고(데스크톱 5·모바일 1) 그중 내보내기 2곳은 규칙까지 달라 **1~2월에 시작일이 그 해 3월 1일(미래)** 이 되어 결과가 늘 0건이었다. 전부 `resolveTermStartDate` 하나로 합쳤다.
- **하지 말 것**: `academicCalendar.ts`에 이 판정을 넣지 말 것 — 그 모듈은 export 목록이 계약 테스트로 잠겨 있다(ADR-037). 개학일 기반 판정은 "앱의 단정"이 아니라 "학교가 준 사실"이라 취지에 어긋나지 않지만, 잠긴 표면은 그대로 두고 별도 모듈로 분리했다.
- **하지 말 것 2**: 화면에서 월을 직접 세지 말 것. 그렇게 만든 사본이 일정 학기뷰·기간 필터 6곳·학기초 토스트에 흩어져 있었고, 하필 답이 갈리면 안 되는 경계(8월·9월 초 개학, 1~2월)에서만 어긋났다. 창구는 `useCurrentTerm`(데스크톱)·`useMobileCurrentTerm`(모바일) 둘뿐이며 판정 규칙은 도메인 한 곳을 공유한다.
- **회귀**: `schoolTermStart.test.ts` 35건 · `termSignalFromTimetable.test.ts` 11건 · `termStartFromSchedule.test.ts` 14건.

## ADR-047: 교시 이름은 만들어지는 문자열이 아니라 저장되는 값이다 — 표시 정본 하나 + 이름 보존 계약

- **상태**: active · **일자**: 2026-08-13
- **발단**: 고객지원 챗봇 문의 "교시 이름을 어떻게 바꿔?". 확인 결과 기능이 실제로 없었다. `PeriodTime`은 `{ period, start, end }` 3필드뿐이고, 화면의 "1교시"는 **저장된 값이 아니라 그릴 때마다 번호 뒤에 '교시'를 붙여 만들어내는 문자열**이었다 — 바꿀 자리 자체가 없었다.
- **문제의 크기**: 그 문자열을 만드는 코드가 `src/` 안에 **50곳 넘게** 흩어져 있었다. 부분적으로 모아둔 함수가 3.5개 있었지만(`Attendance.formatPeriodLabel`, `formatPeriodShort`, `periodPresenter.periodToLabel`, `mixedRecordExcelMapper`의 **중복 사본**) 대부분의 화면은 셋 중 아무것도 쓰지 않았다.
- **결정 1 — 필드 추가**: `PeriodTime.label?: string`. 선택 필드라 기존 저장 파일과 호환된다. 입력은 `normalizePeriodLabel`(trim → 빈 값이면 `undefined` → 6자 절단)을 반드시 통과시킨다. **빈 문자열을 저장하면 이후 모든 표시 판정이 갈리므로 `undefined` 하나로 모은다.**
- **결정 2 — 표시 정본은 `domain/rules/periodLabel.ts` 하나**: `resolvePeriodLabel` / `resolvePeriodShortLabel` / `periodTimeLabel`. 기존 특례 함수들은 **특례를 유지한 채 여기에 위임**한다 — 조회(0)·종례(9)는 `Attendance`가, 방과후·종일·범위(N~M교시)는 `periodPresenter`가 계속 소유한다. `mixedRecordExcelMapper`의 중복 사본은 삭제했다(사본을 두면 이름이 엑셀에서만 빠진다).
- **결정 3 — 조회·종례는 이름 대상이 아니다**: `PERIOD_MORNING(0)`/`PERIOD_CLOSING(9)`는 `periodTimes` 배열 **밖**의 담임 전용 가상 칸이다. 0/9번에 label을 억지로 넣어도 '조회'/'종례'가 이기도록 테스트로 못박았다.
- **결정 4 — 이름 보존 계약(가장 중요)**: 교시 배열이 갈아끼워질 때 `mergePeriodLabels(prev, next)`로 **번호 기준 승계**한다. 삭제 후 재번호는 `renumberPeriodsKeepingLabels`로 **번호가 아니라 남은 행**을 따라가게 한다(3교시를 지우면 옛 4교시의 "창체"가 3교시로 내려와야지, 새 3교시가 옛 3교시 이름을 물려받으면 안 된다).
- **★함정 — "통째로 교체"만 막으면 부족하다**: 계획서는 배열 전체 교체 경로 7개만 위험으로 봤는데, 실제로 더 흔한 소실 경로는 **배열은 그대로 두고 한 행만 다시 만드는 코드**였다. `arr[i] = { period, start, end }`로 새 객체를 만들면 label이 그냥 빠진다. 재현: **이름을 붙인 교시의 시작 시각을 1분만 고쳐도 이름이 사라졌고, 점심 위치를 한 칸 옮기면 점심 뒤 교시 이름이 전부 사라졌다.** 8곳(periodRules.shiftPeriodsFrom · PeriodTab 3곳 · Step3Profile 3곳 · Onboarding 3곳)을 전부 **스프레드(`{ ...pt, start, end }`)**로 바꿨다 — 필드가 늘어나도 자동으로 따라오게. 리뷰 단계에서야 발견했다.
- **결정 5 — 재발 방지 그물**: `periodLabelHardcoding.metatest`가 `src/` 전체에서 `${...}교시` / JSX `{...}교시` 패턴을 찾아 허용 목록 밖이면 실패시킨다. 허용 목록 8건은 전부 **사유를 함께 적는다**(개수·위치 문구, 정본 파일, 보관함). 그물이 실제로 빨간불을 내는지 **버그를 되살려 실증**했다.
- **하지 말 것 — 보관함(ArchiveViewer)에는 현재 교시 이름을 입히지 않는다**: 지난 학년도 기록에 올해 붙인 이름을 씌우면 과거 데이터를 잘못 설명한다. 그래서 허용 목록에 사유와 함께 넣었다.
- **하지 말 것 2 — 출결 그리드에서 스토어를 직접 읽지 않는다**: `HomeroomAttendanceGrid`·`SeatAttendanceView`는 `attendanceSingleWriter.metatest`가 `from '@adapters/stores/`를 막는다(ADR-022 단일 기록자). 편의상 `useSettingsStore`를 넣었다가 되돌리고 **호스트(AttendanceMode) prop 주입**으로 바꿨다. 같은 원칙을 서브트리(`AttendanceGridView`·`SeatPeriodPopover`)에도 적용했다 — 가드 대상 파일은 아니지만 같은 이유가 성립한다.
- **범위 밖(사용자 확정 2026-08-13)**: ①0교시(1교시 앞 행 추가) ②조회·종례 이름 변경 ③요일별 다른 이름. 셋 다 이름 변경이 아니라 **구조 변경**이라 별건이다. FAQ 답변에 ①②를 미지원으로 명시해 재문의를 막았다.
- **편집 위치**: 설정 → 교시 시간 표 + **시간표 편집 화면** 양쪽. `/docs`가 이미 "시간표에서 바로 교시 시간 조정"을 안내하고 있어 한쪽만 지원하면 같은 문의가 반복된다.
- **회귀**: `periodLabel.test.ts` 12건 · `periodLabelPreservation.test.ts` 11건 · `periodPresenter.test.ts` 10건 · `periodLabelHardcoding.metatest` 2건.

## ADR-048: 고객지원 챗봇의 '답변 생성'만 업스테이지 Solar로 옮긴다 — 임베딩은 DB 차원에 묶여 Gemini 유지

- **상태**: active · **일자**: 2026-08-14
- **발단**: 업스테이지 x AWS AI initiative 프로그램으로 **2027-03-31까지 Solar-Pro 무료 사용** 권한을 받았다. 챗봇의 Gemini 키를 Solar Pro 3으로 교체하기로 했다.
- **핵심 발견 — 챗봇의 Gemini는 한 덩어리가 아니라 두 역할이다**: ①답변 생성(HyDE 가상답변·문서 재정렬·최종 답변 3곳, `gemini-3.1-flash-lite-preview`) ②임베딩(`gemini-embedding-001`, 768차원). **Solar Pro 3은 대화 모델이라 ①만 대체할 수 있다.**
- **결정 1 — ①만 교체한다**: ②까지 옮기려면 업스테이지 임베딩(`embedding-query`/`-passage`)이 **4096차원**이라 `ssampin_docs.embedding vector(768)`(001_ssampin_chat.sql) 컬럼 교체 + **전체 지식문서 재적재**가 필요하고, pgvector의 ivfflat/hnsw 인덱스는 **2000차원까지만** 지원해 검색 인덱스를 떼야 한다. 게다가 계정 무료 범위가 "Solar-Pro / Document-Parse"로만 적혀 있어 **임베딩 모델의 무료 여부가 불확실**하다. 검색 품질·비용 재검증을 감수할 이유가 없다.
- **결정 2 — 호출을 `_shared/chatLlm.ts` 한 곳으로 모은다**: 업스테이지는 OpenAI 호환 `chat/completions`라 요청 형태가 Gemini와 전혀 다르다(시스템 지시 위치·역할 이름 `assistant`↔`model`·`max_tokens`↔`maxOutputTokens`·`reasoning_effort`↔`thinkingConfig`). 호출부마다 분기하면 같은 fetch가 세 벌 생긴다.
- **결정 3 — Gemini 자동 폴백을 남긴다**: 업스테이지 호출이 실패하면 Gemini로 넘어간다. 챗봇은 과거 **외부 키 단일 장애점**으로 장애를 낸 전력이 있고(2026-06-03), 무료 기간이 2027-03-31에 끝난다. `GOOGLE_API_KEY`는 임베딩 때문에 어차피 남아 있어 폴백 비용이 0이다.
- **결정 4 — 모델·주소·공급자는 전부 환경변수**: `UPSTAGE_MODEL`(기본 `solar-pro3`)·`UPSTAGE_BASE_URL`·`GEMINI_MODEL`. `solar-pro4`로 올리거나 되돌리는 데 코드 변경이 필요 없다. **`UPSTAGE_API_KEY`를 지우면 그대로 예전 Gemini 단독 동작으로 복귀**한다 — 이것이 롤백 경로다.
- **★함정 1 — 추론 모델의 `max_tokens`는 '생각'까지 포함한다**: Solar Pro 3은 추론 모델이라 답변 예산 2048을 그대로 넘기면 생각하다 예산이 떨어져 **빈 답변**이 나올 수 있다. `reasoning_effort`를 보낼 때만 헤드룸 1024를 더한다.
- **★함정 2 — 폴백이 설정 실수를 삼킨다**: 모델을 비추론 계열로 잘못 끼워 `reasoning_effort` 400이 나면 조용히 Gemini로 넘어가 "잘 되는 줄" 알게 된다. 그래서 **400은 옵션 없이 한 번 재시도**해 업스테이지로 정상 응답시키고, 폴백 발동은 항상 `console.error`로 남긴다.
- **★함정 3 — `npx tsc --noEmit`은 `supabase/functions/`를 검사하지 않는다**(tsconfig `include: ["src"]`, `npm run lint`도 `src/**` 한정). 이 변경의 타입 검증은 **`deno check`가 유일한 그물**이다. 변경 전 파일과 오류 개수·내용을 대조해 기존 supabase-js 제네릭 경고 8건 외에 새 오류가 없음을 확인했다.
- **검증 도구**: `node scripts/test-upstage.mjs` — 챗봇이 실제로 보내는 것과 **같은 요청**(모델 목록·`reasoning_effort` 포함/미포함·`minimal`)을 쏴서 계정에서 유효한지 확인한다. 모델을 바꿀 때마다 먼저 돌린다. API 키는 출력하지 않는다.
- **★실측 — pro4 를 쓰면 안 되는 이유(2026-08-14)**: 같은 한 줄 질문에 **solar-pro3 은 0.7초·reasoning_tokens 0**, **solar-pro4 는 16.5초·reasoning_tokens 990**. pro4 는 추론이 실제로 작동해 지원 챗봇에 쓸 속도가 아니다(가격도 출력 $1.20 vs $0.60/1M). 계정 무료 범위가 pro4 를 포함하는지는 콘솔 Usage 로만 확인 가능하지만, **속도 때문에 어차피 부적합**이라 판단이 필요 없다. 단 pro4 로 올릴 가능성에 대비해 `REASONING_TOKEN_HEADROOM` 을 1024→4096 으로 올렸다(안 쓴 예산은 과금되지 않는다).
- **★품질 비교 — 기준선 없이 점수만 보면 안 된다**: Solar 로 `scripts/test-chatbot.ts` 를 돌려 19/27(70%)이 나왔지만 **Gemini 때 몇 점이었는지 모르면 의미가 없다.** 시크릿을 unset→재배포해 Gemini 기준선을 실측했다(**18/27, 67%, 평균 8,432ms**) → Solar **19/27, 70%, 평균 6,588ms**. **10초 초과가 5건 → 1건**으로 줄었다. 이 과정이 롤백 경로(`secrets unset` + 재배포)가 실제로 동작하는지도 함께 실증했다.
- **★비교로만 드러난 것 — 에스컬레이션 미발동은 Solar 탓이 아니다**: #16(버그)·#17(기능요청)·#18(크래시)이 개발자 전달로 안 넘어가고 직접 답변됐는데, **Gemini 기준선에서도 정확히 같은 3건이 같은 방식으로 실패**했다. 원인은 모델이 아니라 SYSTEM_PROMPT 의 "에스컬레이션은 최후의 수단" 지시(또는 낡은 테스트 기대값)다. 기준선을 안 재고 배포했으면 **Solar 의 회귀로 오진**했을 것이다. 별건으로 다룬다.
- **실패 8건의 성격**: 5건은 내용이 맞는데 `mustInclude` 단어를 안 쓴 판정(예: #25 는 "알약 실시간 감시를 끄세요"라고 정확히 안내했지만 "백신"이라는 단어가 없어 실패). 3건은 위의 에스컬레이션(Gemini 공통).
- **개인정보처리방침 반영(2026-08-14)**: 제11조(처리위탁)에 'AI 도우미' 항목과 수탁자 3사(Supabase·업스테이지·Google)를 추가했다(국·영문 양쪽). 전송 범위도 명시했다: 질문 텍스트·직전 대화·현재 화면 이름만 가고, 앱에 저장된 학생·출결·관찰 기록은 가지 않는다.
- **★법인 소재지로 국외이전을 판단하지 말 것 (정정, `9d10cc2f`)**: 처음에 "업스테이지는 국내 법인이니 국외이전이 아니라 처리위탁"으로 적었는데 **틀렸다**. 업스테이지 자사 개인정보처리방침(2026-06-01)의 **국외 이전 표**에 Amazon Web Services·Microsoft Azure·Google(모두 미국)이 "입력된 대화 및 업로드한 파일"의 **시스템 운영·데이터 보관** 수탁자로 명시돼 있다. **법인 소재지가 국내라도 처리 인프라가 국외면 국외이전이다.** 판단 근거는 회사 국적이 아니라 **그 회사의 방침에 적힌 재위탁 대상**이어야 한다. 제13조에 업스테이지 항목(재위탁 사실·국가 포함)을 넣고 도입 문장에 AI 도우미를 추가했다.
- **한계**: 업스테이지 방침의 API 보관 기간 조항은 **Asynchronous API 기준**("추론 요청 데이터: 추론 완료 시까지 임시 저장", "결과: 30일")이라 우리가 쓰는 동기 `chat/completions` 에 그대로 적용되는지 확인되지 않았다. **확인 안 된 유리한 문구는 방침에 넣지 않았다**(학운위 건의 교훈 — 규제 서류에 홍보 문구를 옮기지 말 것).

## ADR-049: 챗봇의 '개발자 전달'은 답변을 대신하지 않는다 — 그리고 모델 판단에만 맡기지 않는다

- **상태**: active · **일자**: 2026-08-14
- **발단**: 27문항 QA에서 버그 신고(#16 자리배치표 좌우 반전)·기능 요청(#17)·크래시(#18)가 개발자 전달로 넘어가지 않고 직접 답변만 됐다. **Gemini·Solar 양쪽에서 동일**하게 실패했으므로 모델 문제가 아니었다(ADR-048).
- **원인 — 프롬프트 자기모순이 두 군데**: ①"버그면 반드시 에스컬레이션" 바로 아래에 "⚠️ 에스컬레이션은 최후의 수단, 답변이 가능하면 먼저 답변하라" ②문제 해결 원칙 9 "재시작 → 최신 버전 → 재설치를 먼저 안내한 후, **그래도 안 되면** 에스컬레이션". **★①만 고쳤을 때 #16만 고쳐지고 #17·#18은 그대로였다 — 모순은 하나만 지우면 소용이 없다.**
- **결정 1 — 답변과 전달은 배타가 아니다**: 답변 본문 뒤에 JSON 한 줄을 덧붙이는 형식으로 바꾸고, 서버가 그 줄을 떼어내 `답변 + 전달 안내`를 한 메시지로 조립한다. **두 클라이언트(앱 `useHelpChat`·랜딩 `useChatbot`)가 이미 escalation 응답의 `message` 를 그대로 렌더한 뒤 신고 폼을 띄우므로 화면 코드 변경이 0이다.** 예전에는 전달이 곧 답변 소실이었다.
- **결정 2 — 규칙 안전망 `detectReportIntent`**: 예시 응답까지 프롬프트에 넣었는데도 **Solar 는 그 예시 문장을 그대로 따라 쓰면서 마지막 JSON 줄만 빠뜨렸다.** 버그 신고가 개발자에게 닿는 일을 모델 기분에 맡길 수 없고, 공급자를 환경변수로 갈아끼우는 설계(ADR-048)라 더더욱 그렇다. 질문 자체를 정규식으로 판정해 LLM 태그가 없을 때 얹는다.
- **★과탐지 경계선**: "안 돼요"·"실패해요"처럼 환경 문제(백신 차단·네트워크)일 가능성이 큰 표현은 **일부러 제외**했다. 그런 질문까지 신고로 올리면 신고함이 노이즈로 덮여 진짜 결함이 묻힌다. 넣은 것은 명백한 결함 신호뿐이다(크래시·강제종료·먹통·반대로 나옴·사라짐 등).
- **★파서 함정**: 기존 `\{[\s\S]*"escalation"...[\s\S]*\}` 는 탐욕적이라 **본문 뒤에 JSON 이 붙는 새 구조에서 본문에 중괄호가 하나만 섞여도 첫 `{` 부터 마지막 `}` 까지 삼켜 답변이 통째로 사라진다.** 중괄호를 품지 않는 `[^{}]*` 로 좁혔다.
- **★검증 도구 자체의 신뢰도를 먼저 재라**: 같은 코드로 27문항을 두 번 돌려 **17/27 과 21/27** 이 나왔다(실패의 절반이 응답 시간 초과, 같은 문항이 10초↔21초로 출렁임). **한 번 돌린 점수로 회귀를 판정하면 안 된다.** 두 실행 모두에 걸린 4건만 실제 실패로 취급했고, 목표 3건(#16·#17·#18)은 두 실행 모두 통과했다.
- **테스트 기대값 변경 1건(#24 "업데이트 후에 데이터가 다 사라졌어요")**: `answer` → `escalation`. 데이터 소실은 개발자가 반드시 알아야 하는 신고다. 사용자는 복구 안내를 그대로 받으면서(답변이 message 에 포함) 신고까지 접수된다 — 안내를 잃는 변경이 아니다. 사유를 테스트 파일에 주석으로 남겼다.
- **부작용(수용)**: 전달 판정이 민감해져 일부 트러블슈팅 질문(#8 급식 미표시, #20 API 키)에서도 신고 폼이 뜬다. 답변은 그대로 보이므로 사용자 손해는 없고, 폼은 무시할 수 있다. 두 건 다 실행마다 갈려 고정 회귀는 아니다.

## ADR-050: 챗봇 지식베이스는 '쌓는 곳'이 아니라 '교체하는 곳'이다 — 그리고 자동 검사는 위젯 화면을 못 본다

- **상태**: active · **일자**: 2026-08-14
- **발단**: ADR-047(교시 이름) 마무리로 챗봇 지식베이스에 Q&A를 추가하려다, 재수집 스크립트가 전체를 다시 넣는 구조임을 확인하고 DB 를 조회했다. **12,191행인데 서로 다른 문서는 478건**이었다(같은 문서가 최대 26벌).
- **원인**: `ssampin-embed` 의 `upsert` 액션이 **이름과 달리 실제로는 `insert`** 다(`supabase.from('ssampin_docs').insert(rows)`). 릴리즈마다 `ingest-chatbot-qa.mjs` 를 돌릴 때마다 전량이 복사돼 쌓였다. 기존 메모에 "upsert 는 멱등이라 다시 돌려도 된다"고 적혀 있었는데 **코드와 맞지 않는 서술**이었다.
- **왜 품질 문제인가**: 검색이 상위 10건을 뽑는데 그 자리가 **같은 문서의 복사본으로 채워지면** 다른 근거 문서가 밀려난다. 실제로 정리 후 27문항 점수가 19/27(70%) → **22/27(81%)** 로 올랐고 평균 응답도 6,588ms → 5,791ms 로 줄었다(Gemini 기준선 18/27·8,432ms).
- **★전부 지우고 다시 채우면 안 된다**: `ssampin_docs` 에는 스크립트가 만든 두 출처(`system-qa`·`feature-summary`) 말고도 **문서 파일에서 만들어진 76건**(`docs/user-guide.md` 40 · `troubleshoot-guide.md` 21 · `FAQ.tsx` 8 · `README.md` 7, `scripts/embed-docs.ts` 소관)이 섞여 있다. 통째로 비우고 Q&A 스크립트만 다시 돌렸다면 **이 76건이 조용히 사라졌을 것**이다.
- **결정 1 — 정리는 '중복만 삭제'로**: 내용 해시(출처+제목+본문)로 완전히 같은 행만 묶어 가장 최근 것만 남겼다(11,713행 삭제). 이어서 릴리즈마다 문구가 바뀌어 남은 **옛 버전 28행**을 제목 기준으로 정리했다(스크립트 소유 출처에 한정 — 문서 파일 청크는 제목이 겹치는 게 정상이라 제외). 12,191 → **450행**.
- **결정 2 — 재수집은 '지우고 다시 넣기'**: `ingest-chatbot-qa.mjs` 의 `main()` 이 소유 출처 2개를 먼저 삭제한 뒤 넣는다. 소유하지 않은 출처는 건드리지 않는다.
- **★삭제 작업의 안전장치(다음에도 이대로)**: ①삭제 전 전량을 로컬에 백업 ②**모의 실행(--apply 없이)으로 무엇이 남고 지워지는지 먼저 출력** ③출처가 하나라도 통째로 사라지면 중단하는 가드 ④보존 수 == 고유 문서 수 일치 확인 ⑤옛 버전 정리는 보존/삭제 본문을 눈으로 대조(쌤도구 "17가지+" 보존 / "14가지+" 삭제).
- **★자동 검사는 위젯 화면을 보지 못한다**: 같은 날 실화면 확인에서 **위젯 3곳(WeeklyTimetable·ClassTimetable·TodayProgress)이 교시 이름을 무시하고 번호만 그리고 있었다.** `src/widgets/` 폴더가 ADR-047 작업에서 통째로 빠졌는데 **게이트 4종이 전부 초록이었다.** 재발 방지 메타테스트조차 통과했다 — 가드 정규식이 `/\$\{...\}교시|\}교시/` 라 **"교시"라는 글자가 붙은 경우만** 잡고, 번호만 그리는 화면은 그냥 지나갔다. JSX 본문에 교시 번호를 그대로 그리는 패턴을 검사하는 규칙을 추가하고 **버그를 되살린 임시 파일로 빨간불을 실증한 뒤 지웠다.**
- **함께 고친 것**: 6글자 이름이 과목명과 붙어 읽히던 문제(`min-w-[3rem]` 만으로는 짧은 "2교시"에만 틈이 생긴다) → `mr-2` 명시. TodayProgress 의 교시 배지는 `w-7` 고정이라 6글자가 뚫고 나가므로 `min-w-7 + px-1.5 + max-w-24` 로 바꿔 번호일 땐 정사각, 이름일 땐 알약이 되게 했다.

## ADR-051: 위젯 드래그 및 모드 전환 시 화면 경계 제한(Clamping) 및 가시성 자동 보장

- **상태**: active · **일자**: 2026-08-17
- **발단**: 사용자 진단 로그(`native-desktop-diag.log`)에서 바탕화면 모드 위젯을 드래그하여 화면 맨 밑(`Y=1063`, 1080p 해상도 기준)으로 밀어내 위젯 상단 헤더가 화면 밖으로 완전히 벗어나는 현상 확인.
- **원인**: `desktopWidgetManager.ts`의 헤더 드래그 핸들러에서 마우스 델타 이동량에 대한 화면 경계(WorkArea) 검사 없이 `moveWidget`(`SetWindowPos`)을 호출하여 발생. 또한 위젯 모드 전환 시 저장된 좌표가 화면 밖이라도 그대로 띄워 사용자가 위젯을 찾지 못함.
- **결정 1 — 순수 도메인 서비스 기반 경계 Clamping**: `src/domain/services/screenBoundsClamp.ts`와 `electron/desktopWidgetBounds.ts`(미러 동기화)를 작성하여, 위젯 상단 헤더(최소 40px) 및 가로 최소폭(100px)이 화면 내에 반드시 남도록 마우스 이동 좌표를 실시간으로 가둔다.
- **결정 2 — 위젯 모드 전환 시 자동 가시성 복구**: `ensureWidgetBoundsWithinDisplays`를 도입하여 위젯 창 생성(`createWidgetWindow`), 모드 전환(`executeWindowTransition`), 화면 해상도 변경 시 화면 밖 위젯을 가장 적절한 모니터 안쪽으로 자동 당겨온다.
- **결정 3 — 모달 ESC 단축키 루프 방어**: `WidgetModal.tsx`의 `saveAndClose` 의존성을 `useRef`로 안정화하여 1초 주기 단축키 깜빡임 렌더링 루프를 차단했다.
- **결정 4 (재QA 반영) — 작업 영역 DIP→physical 변환은 반드시 `screen.dipToScreenRect`**: 초판 구현은 `workArea.x * scaleFactor` 곱셈을 썼고, per-monitor DPI 환경(primary 100% + 보조 200%)에서 보조 모니터 원점이 960px 어긋나 **clamp가 바탕화면 우측 끝 너머까지 위젯을 허용했다 — 즉 이 ADR이 막으려던 이탈이 그대로 재현됐다.** `computePhysicalWorkAreas(displays, convert)`로 분리하고 호출부가 `screen.dipToScreenRect(null, rect)`를 주입한다(`null`이면 Electron이 rect에 가장 가까운 디스플레이 기준으로 환산). 변환 실패 시 해당 모니터만 곱셈 폴백.
  - **★교훈: 이 저장소는 같은 실수를 2026-05-06에 이미 고쳤고, 그 금지 주석이 같은 파일 762번 줄에 있었다.** 좌표 변환 코드를 새로 쓸 때는 파일 안의 기존 변환 패턴을 먼저 찾을 것.
  - **★교훈: 순수 함수 테스트는 "입력 사각형이 올바르다"를 전제한다.** 39건이 초록불이었는데도 그 사각형을 만드는 변환이 틀려 기능이 무력화됐다. 계산 로직뿐 아니라 **입력을 생성하는 경계 변환**에도 그물을 칠 것 — `electron/desktopWidgetWorkAreas.test.ts`(곱셈 복원 시 3건 RED 실증).
- **결정 5 (재QA 반영) — 최소 가시량 기준 단위는 DIP로 통일**: 드래그 경로는 `minVisibleHeaderHeight=40`을 physical px로, 모드 전환 경로(`main.ts`)는 DIP로 해석해 150% 배율에서 남는 헤더가 약 27 DIP에 그쳤다. **헤더 높이 자체가 CSS(DIP)로 정의되므로 기준도 DIP여야 배율과 무관하게 헤더 전체가 잡힌다**(physical 고정은 고배율 사용자에게만 불리해지는 방향). `computePhysicalWorkAreas`가 모니터별 배율로 환산한 최소 가시량을 작업 영역 rect에 함께 실어 반환하고, 핫패스는 선택된 모니터의 값을 그대로 쓴다.
  - 최소값을 별도 배열이 아니라 rect에 얹은 이유: 모니터마다 환산값이 다른데 "어느 작업 영역인가"와 "몇 physical px인가"가 분리되면 핫패스에서 인덱스가 어긋나기 쉽다. `findBestWorkAreaForBounds`를 제네릭(`<T extends ScreenRect>`)으로 바꿔 선택된 객체가 자기 최소값을 들고 나오게 했다 — **런타임 동작 변화 0, 미러 패리티 유지.**
- **결정 6 (재QA 반영) — "화면보다 큰 위젯 축소" 복원**: 구현 교체 중 구 `ensureWidgetOnScreen`의 크기 축소가 사라졌다. 신고 증상(위치)과 무관한 누락이라 판단해 복원했다.
  - **★없으면 "크기를 되돌릴 수 없는 상태"로 고착된다**: 크기 조절 손잡이는 위젯 우측·하단 모서리에 있는데 위젯이 화면보다 크면 둘 다 화면 밖이고, clamp가 `y >= workArea.y`를 강제해 손잡이를 화면 안으로 끌어올 수 없다. 큰 모니터에서 키운 뒤 해상도 하향/모니터 분리 시 실제 도달 가능.
  - `fitWidgetSizeToWorkArea(bounds, workArea, minSize)`를 도메인·미러 양쪽에 추가. **크기 검증은 가시성 판정과 분리해 항상 수행한다**(가시성 통과 시 early return하면 축소를 건너뛰므로). 창 최소 크기(`getMinimumSize()`) 아래로는 줄이지 않는다.

## ADR-052: 인앱 AI(OpenCode Zen)는 보류한다 — 무료 경로가 없고 비용이 쌤핀에 남는다

- **상태**: 보류(on hold) · **일자**: 2026-08-18
- **발단**: AI 금지 원칙이 "선생님이 AI 비용을 내지 않을 것"을 조건으로 조건부 허용으로 바뀌면서([[feedback_no_ai_features]]), OpenCode Zen 의 무료 모델로 인앱 챗봇·생기부 윤문을 붙이는 계획서 4건을 작성했다. 착수 관문은 Phase 0 실측 3종이었다.
- **실측 결과 — 능력은 증명됐다**: 유료 키 기준 REST 에서 도구 선택 83%(기준 80%), 스키마 준수 100%(기준 90%), 멀티턴 3/3 + 맥락 승계 2/2, 없는 도구 지어냄 0건, SSE 스트리밍 tool_calls 델타 확인. **기술적으로는 된다.**
- **실측 결과 — 그러나 무료 경로가 없다**:
  - 익명 REST 는 429 `FreeUsageLimitError`. $20 충전 후에도 무료 모델은 연속 20건 중 1건만 통과하고 나머지 429. **무료 몫은 잔액과 별개 주머니라 충전으로 풀리지 않는다.**
  - 1시간 뒤 재시도 6/6 전부 429. 워크스페이스에 **잔여량 표시가 없어** 언제 멈출지 예측할 수 없다.
  - **측정자 1명이 하루치를 소진했다.** 교사 다수가 동시에 쓰는 구조에서 성립하지 않는다.
  - 대안 `OpenCode Go`(월 $5부터, `/zen/go/v1`, 26종)는 그 자체에 한도가 있고("Go limit reached"), 개발자 1인 구독이라 서버가 다수 사용자를 대신 호출하면 재판매 간주 위험에 정면으로 걸린다.
- **비용 실측**: 종량제 `minimax-m3` 기준 질문 1건 $0.00083·응답 5초. 교사 1,000명이 하루 5건씩 월 20일 → **월 $83**. `gpt-5-nano` 는 절반 값이지만 응답 17초라 챗봇에 부적합.
- **결정**: **보류한다.** 방침의 조건("선생님이 비용을 내지 않을 것")은 지켜지지만, **그 비용이 쌤핀(오너 개인)에게 남는다.** 금액의 크기가 아니라 *지속적인 개인 부담이 생긴다*는 점이 보류 사유다. 오너 판단.
- **재개 조건(다시 볼 때 이것부터 확인)**:
  1. 비용을 감당할 재원이 생겼는가(수익 모델·후원·기관 지원 등).
  2. 무료로 쓸 수 있는 다른 경로가 생겼는가. **단, 과거에 기각된 것을 되살리지 말 것** — Google Gemini 무료 티어(하루 500~1,500건, 키 하나 중계에서 무의미), BYOK(비용 조건 위반), NVIDIA 무료 엔드포인트(약관상 상용 불가).
  3. 재개 시 **Phase 0 를 다시 돌릴 필요는 없다.** 실측 도구와 원자료가 `scripts/zen-phase0/`·`docs/03-analysis/opencode-zen-phase0/` 에 남아 있다. 단가표는 다시 확인할 것.
- **남는 것**: $20 충전분(약 24,000건치)은 소멸하지 않는다. 다만 **자동 재충전을 끄지 않으면 잔액 $5 미만에서 $20 이 자동 결제된다** — 보류 상태에서는 특히 위험하므로 반드시 끌 것.

## ADR-053: 배율이 다른 모니터로 위젯을 옮기면, 드래그가 끝난 뒤에 크기를 다시 잡는다

- **상태**: active · **일자**: 2026-08-18
- **발단**: 듀얼 모니터 사용자 신고 — "위젯 우측 상단을 잡고 주모니터로 끌었더니 좌측 상단을 잡은 것처럼 되고, 주모니터에 절반만 뜬다."
- **확정 방법**: 신고자에게 회신할 수 없는 상황이었으나 **오너 PC가 같은 환경**(주 2880×1800@175% / 보조 1920×1080@100%, 배율비 1.75)이라 직접 실측했다. 진단 로그가 "어디로 옮겨달라 요청했는지"만 남기고 "실제로 어디에 놓였는지"는 안 남겨 판독이 불가능했으므로, **계측을 먼저 보강한 뒤** 재현했다.
- **원인 — 모드마다 달랐다. 하나의 버그가 아니었다**:
  - **일반 위젯 모드**: 경계를 넘는 순간 Windows가 `WM_DPICHANGED`로 창을 새 배율 기준으로 다시 재고(실제 크기 유지 — 올바름), **15ms 뒤 Electron이 DIP 크기를 되돌리면서 실제 크기가 배율비만큼 폭발한다.** 보조를 꽉 채우던 1920×1032 위젯이 3362×1808이 되어 주모니터(2880×1800)보다 커졌다. 실측상 주모니터 43% / 보조 57%로 걸쳐 — **"절반만 뜬다"의 정체는 위치가 아니라 크기였다.**
  - **바탕화면 모드**: WorkerW 자식 창이라 창 크기는 그대로인데, **Chromium은 배율 변화를 알아채면서(devicePixelRatio 1.75→1) 화면 배치를 다시 하지 않는다.** 1232px 창에 705px만 칠해지고 투명 창이라 나머지는 빈 공간 = 역시 "절반만 보인다"(705/1232 = 57%).
- **결정 1 — 개입은 드래그가 끝난 뒤에만**: 드래그 중에 크기를 보정하면 드래그와 보정이 서로 창을 밀어낸다. 일반 모드는 이동이 멎고 400ms 뒤(`moved` 이벤트는 플랫폼별 지원이 갈려 의존하지 않음), 바탕화면 모드는 훅의 `LBUTTONUP`에서 처리한다.
- **결정 2 — 목적지 모니터는 "겹침 면적"이 아니라 "드래그 중 커서가 있던 곳"**: 커진 위젯은 출발 모니터와 더 많이 겹치므로(실측 57%), 겹침으로 고르면 **사용자가 끌어온 반대 방향으로 되돌아간다.**
- **결정 3 — DIP 크기 유지 + 안 들어갈 때만 축소**: 바탕화면 모드에도 일반 모드(=Windows 표준)와 같은 DIP 크기 보존을 적용하고, 그 결과가 도착 모니터를 넘치면 화면에 맞게 줄인다. 배율 높은 모니터에서 실제 크기가 커지는 것 자체는 정상이므로 **들어가면 손대지 않는다.** 판정은 `resolveDragEndBounds()` 순수 함수로 분리했다.
- **결정 4 — 넘치지 않고 배율도 그대로면 아무것도 하지 않는다**: 매 드래그마다 `setBounds`를 부르면 소수 배율에서 DIP→물리→DIP 반올림이 한 방향으로 쌓여 위젯이 조금씩 커진다(래칫).
- **★교훈 1 — 축소한 뒤의 위치에 `clampWidgetBoundsToWorkArea`(ADR-051)를 쓰면 안 된다**: 그 함수의 정책은 "최소 가시량(헤더 40·가로 100)만 남으면 통과"라, **화면 크기로 줄인 창이 300px 걸친 채 통과했다**(테스트에서 실측으로 잡음). 축소까지 한 상황은 "이 화면에 겨우 들어가는 크기"이므로 전부 보이게 놓아야 한다. **같은 이름의 "경계 보정"이라도 상황에 따라 옳은 정책이 다르다.**
- **★교훈 2 — 진단 로그에 "요청값"만 남기면 재현해도 판독이 안 된다**: 기존 `[7-C] drag` 로그는 `newPos`(요청)만 남겨, 실측을 해도 원인을 가릴 수 없었다. **실제 적용값(`GetWindowRect`)·커서 이동량 대비 위젯 이동량(ratio)·그 순간 모니터 배율**을 함께 남기도록 보강했다. 다음 신고는 로그 한 줄로 판정된다.
- **★교훈 3 — 내가 처음 지목한 원인은 틀렸다**: "드래그 중 출발 모니터 크기를 매 프레임 강제해 Windows와 다툰다"고 판단했으나, 실측에서 `sizeErr`이 전 구간 0이었다. **자식 창이라 DPI 변경 통지를 받지 않아 다툴 상대가 애초에 없었다.** 코드를 읽어 세운 가설이 그럴듯해도 실측 전에는 원인이 아니다.
- **남은 것**: 소수 배율(175%)에서 창을 옮길 때마다 1~2px씩 커지는 래칫은 **별개 결함**이며 이번 범위 밖이다. 실기기 로그에서 폭이 839→845로 자라는 것이 관측됐다. 또한 그 로그에서 작업 영역 높이를 981로 찍으면서 보정 결과가 984로 나오는 **미해명 불일치**가 있다 — 추적 필요.
- **분석 원문**: `docs/03-analysis/widget-dual-monitor-drag/widget-dual-monitor-drag.analysis.md`

## ADR-054: 위젯 크기는 "숫자"가 아니라 "무엇으로 정해졌는가"로 기억한다

- **상태**: active · **일자**: 2026-08-18 · **커밋**: `8a91aa1f`
- **발단**: ADR-053 을 실기기로 확인하는 과정에서 증상이 연달아 나왔다. 세 번의 신고가 전부 같은 뿌리였다 — **"위젯 크기를 무엇으로 기억할 것인가"**.
  1. 주(1645×981)에서 Ctrl+1(전체)을 누른 뒤 보조(1920×1032)로 옮기면 안 꽉 찬다.
  2. 보조를 꽉 채운 뒤 주로 갔다가 돌아오면 처음보다 작아져 있다.
  3. 소수 배율에서 위젯을 옮길 때마다 1~2px씩 커진다.
- **결정 1 — 레이아웃은 크기가 아니라 화면과의 관계다**: `full`은 1645×981이 아니라 **그 모니터의 작업 영역 전체**이고, `split-h`는 822가 아니라 **그 모니터의 오른쪽 절반**이다. 활성 레이아웃을 기억했다가 모니터가 바뀌면 새 작업 영역 기준으로 **다시 계산**한다(`electron/widgetLayout.ts`). 일반 모드와 바탕화면 모드가 같은 모듈을 공유하므로 모드를 오가도 이어진다.
- **결정 2 — 축소는 그 화면에서만 유효한 임시 조치다**: 좁은 화면에 맞춰 줄인 크기를 영구 변경으로 두면 넓은 화면으로 돌아와도 작은 채로 남는다. 줄이기 전 크기를 기억했다가 들어가는 화면에서 되살린다(`electron/widgetPreferredSize.ts`). **이미 기억이 있으면 덮어쓰지 않는다** — 덮어쓰면 왕복할수록 되살릴 크기가 작아져 원본을 영영 잃는다.
- **결정 3 — 사용자가 직접 정한 크기가 최우선이다**: 레이아웃 단축키·가장자리 드래그로 크기를 정하면 반대쪽 기억을 버린다(레이아웃 적용 시 크기 기억 폐기, 수동 리사이즈 시 레이아웃 해제). 안 그러면 방금 정한 크기가 모니터를 옮길 때 옛 값으로 되돌아간다.
- **결정 4 — 초과량이 반올림 잡음보다 클 때만 개입한다**(`WIDGET_OVERFLOW_TOLERANCE = 2`): 175%에서 `setBounds(839×985)`는 실제로 **840×986**이 된다. 그 1px에 보정이 반응하면 다음 `setBounds`가 또 1px을 만들어 창이 계속 커진다(실기기 로그에서 폭 839→845 관측). ADR-053 이 "남은 것"으로 미뤄둔 래칫이 사실 **우리 보정이 가속하고 있었다.**
- **★★교훈 1 — `resizable: false` 창에서 `getMinimumSize` 는 "현재 크기"를 돌려준다**: 실측 — 생성 직후 `903×703`(지정한 640×480이 아님), `setBounds 839×985` 뒤 `839×985`. `resizable: true` 대조군은 `640×480`. 그래서 `fitWidgetSizeToWorkArea(bounds, workArea, getMinimumSize())`는 `max(현재, min(현재, 화면))` = **항상 현재 크기**가 되어, **"화면보다 크면 줄인다"가 한 번도 동작한 적이 없었다.**
  - **ADR-051 결정 6 으로 넣은 보호 장치가 출시 후에도 무력 상태였다.** 그 보호의 목적은 "위젯이 화면보다 커지면 크기 조절 손잡이가 전부 화면 밖에 놓여 되돌릴 수 없게 되는 것"을 막는 것이었는데, 그 방어가 작동하지 않는 채로 배포돼 있었다.
  - **자동 검사 39건이 전부 초록불이었다.** 계산은 옳고 **입력이 틀린** 유형이라 단위 테스트가 잡을 수 없었다 — ADR-051 결정 4에서 이미 겪은 것과 같은 함정이 다른 얼굴로 돌아왔다.
  - 재발 방지: 하한은 상수(`WIDGET_ABSOLUTE_MIN_SIZE`)를 쓰고, `getMinimumSize` 를 크기 보정에 쓰면 **REGRESSION #53** 이 실패한다(주석에 함수 이름만 적어도 걸릴 만큼 엄격하게 뒀다). 되살려 빨간불을 확인한 뒤 커밋했다.
- **★교훈 2 — 같은 이름의 "경계 보정"이라도 상황에 따라 옳은 정책이 다르다**: 축소한 뒤의 위치에 `clampWidgetBoundsToWorkArea`(ADR-051)를 쓰면 안 된다. 그 정책은 "최소 가시량(헤더 40·가로 100)만 남으면 통과"라, **화면 크기로 줄인 창이 300px 걸친 채 통과했다**(테스트에서 실측으로 잡았다). 화면에 맞춘 창은 전부 보이게 놓아야 한다.
- **★교훈 3 — 실기기 확인은 한 번으로 끝나지 않는다**: 1차 확인에서 "정상 작동"을 받았지만, 그 로그를 읽어 보니 1px 보정이 반복되며 폭이 자라고 있었다. **사용자가 괜찮다고 한 뒤에도 로그의 숫자를 끝까지 읽을 것.** 이번 세 증상 중 둘은 그렇게 나왔다.
- **검증**: tsc 0 · lint 0 error · vitest electron 45파일 636건 · regression 41/41 · build-electron 성공 · 실기기 확인(바탕화면/일반 모드 각각 전체·절반 레이아웃으로 모니터 왕복).

## ADR-055: 자료 저장 위치는 "쌤핀 폴더 전체"가 아니라 "선생님 자료"만 옮긴다

- **상태**: active · **일자**: 2026-08-19
- **발단**: "데이터 저장 경로를 바꾸고 싶다"는 요청. 처음에는 용량 부족이 이유일 것으로 보고 조사했지만, 오너 확인 결과 **"학교 관련 자료를 모아 둔 드라이브에 쌤핀 자료도 함께 두고 싶다"는 정리 목적**이 함께 있었다.
- **★★결정의 근거가 된 실측 — 용량의 85%는 선생님 자료가 아니다**: `%APPDATA%\ssampin` 을 폴더별로 재보니 총 740MB 중 `Cache` 336MB + `Code Cache` 294MB 등 **크로뮴 부산물이 633MB(85%)**, `bin/cloudflared.exe` 62.8MB, 그리고 **선생님 실데이터(`data/`)는 12.4MB**였다. 이 숫자가 설계를 두 번 뒤집었다.
  1. **용량 목적이었다면 `data/` 만 옮기는 기능은 무의미하다**(12MB 확보). 그래서 "임시 파일 정리"를 별도 기능으로 함께 만들었다 — 코드 전체를 뒤져 보니 캐시를 비우는 수단이 **아예 없었다**(쌓이기만 함).
  2. **정리 목적이라면 오히려 작게 옮기는 것이 정답이다.** 부산물까지 따라가면 학교 드라이브가 수백 MB 캐시로 지저분해진다.
- **결정 1 — 옮기는 것은 자료 4종뿐이다**(`CONTENT_DIRS` = `data`·`forms`·`obs-attachments`·`miniapps`): `data/` 안에 학기 보관함(`archives`)이 들어 있고 관찰 첨부는 `data/` **밖**에 있다(archiveManager 함정 ③와 같은 지점). 캐시·로그·`bin`·옆핀 기기 상태는 기본 위치에 남긴다.
- **★결정 2 — 로그인 세션을 남기는 것이 이 설계의 실질적 이득이다**: 구글 로그인 상태는 `Local Storage`·`Network`·`Partitions`(크로뮴 소관)에 있다. 이들을 기본 위치에 두면 **폴더를 옮겨도 재로그인이 필요 없다.** `app.setPath('userData')` 로 통째 이동했다면 재로그인이 발생했을 뿐 아니라 **app ready 이전에 호출해야 하는 타이밍 제약**까지 떠안았을 것이다. 자료만 옮기니 그 제약이 사라졌다.
- **★결정 3 — "어디로 옮겼는지"를 적은 쪽지는 옮기는 폴더 밖에 둔다**(`data-location.json` @ 기본 userData 루트): 설정값의 자연스러운 자리인 `settings.json` 은 **옮김 대상인 `data/` 안**에 있다. 거기에 적으면 그것을 읽기 위해 이미 위치를 알아야 하는 닭-달걀이 된다.
- **결정 4 — 이사는 "복사 → 대조 → 전환 → 원본 보존" 순서다**: 파일 수·바이트가 원본과 정확히 같을 때만 채택하고, 어긋나면 대상의 부분 복사본을 지운 뒤 포인터를 건드리지 않는다. 성공해도 **원본은 지우지 않고 `data.moved-<ts>` 로 개명해 남긴다** — 사용자가 새 위치를 눈으로 확인한 뒤 직접 지운다.
- **★결정 5 — 지정한 폴더가 없으면 앱을 못 켜게 하는 대신 조용히 폴백한다**: 외장·네트워크 드라이브를 안 꽂고 켤 수 있다. 이때 기본 위치로 이번 실행만 돌아가고 화면에 사유를 띄우되 **포인터는 지우지 않는다** — 지우면 드라이브를 다시 꽂아도 원래 위치로 돌아오지 못한다.
- **거부 규칙**: 현재 위치와 동일 · 기본 userData 안쪽(앱 삭제 시 함께 지워짐) · 현재 자료 폴더의 하위(복사가 자기 자신을 무한히 삼킴) · 이미 쌤핀 자료가 있는 폴더(덮어쓰기 사고). 각각 한국어 사유를 돌려준다.
- **★교훈 — 요청의 문구가 아니라 이유를 물어야 설계가 정해진다**: "저장 경로 변경"이라는 같은 문장이 용량 목적이면 "전체 이동", 정리 목적이면 "자료만 이동"으로 **정반대 답**을 요구했다. 실측(740MB vs 12.4MB) 없이 문구만 보고 구현했다면 요청자가 기대한 효과가 안 나왔을 것이다.
- **함정 — `npx tsc --noEmit` 도 `npm run build:electron` 도 electron 타입을 검사하지 않는다**: 전자는 `include: ["src"]`(기존 기록), **후자는 esbuild 번들만 수행한다**. 이번에 실제로 잡힌 것은 `npx tsc -p tsconfig.electron.json --noEmit` 뿐이었다(미사용 import 3건). 다만 이 설정은 `rootDir` 때문에 기존 TS6059 노이즈가 많아 **변경한 파일로 필터해서 읽어야** 한다.
- **함정 — 파이썬으로 파일을 고치면 줄바꿈이 섞인다**(기존 기록의 재발): 게이트 4종이 전부 통과한 상태에서 `git diff --stat` 만 3,027줄로 부풀어 있었다(실제 변경 398줄). `--ignore-cr-at-eol` 로 확인해 LF로 정규화했다. **완료 선언 전에 diff 크기를 눈으로 볼 것.**
- **검증**: tsc 0 · lint 0 error · vitest 428파일 5,152건(신규 `electron/dataRoot.test.ts` 18건 포함) · regression 41/41 · build:electron 성공 · landing `docs:check` + `build` 성공 · 실기기 확인 완료.

## ADR-056: 이미 합쳐진 기능의 출시를 미룰 때는 되돌리지 말고 입구를 막는다

- **상태**: active · **일자**: 2026-08-19 · **관련**: `docs/01-plan/features/photo-name-learning.plan.md` O7·§12
- **발단**: v2.4.2 릴리즈 준비 중, 출시 보류로 정해진 사진 이름학습 기능이 **이미 `main` 에 커밋돼 있다는 것**을 발견했다. 커밋 10개·약 10,700줄이고, 홈페이지 `/docs`·개인정보처리방침·FAQ 에도 설명이 올라가 **이미 라이브**였다. **보류 결정이 문서에만 있고 산출물에는 반영되지 않은 상태**였다.
- **★핵심 교훈 — "릴리즈 보류"는 결정만으로 이행되지 않는다**: 계획서에 O7 로 적고 커밋까지 남겼지만, 그 사이 코드는 계속 `main` 에 들어갔다. **보류를 정한 순간 "그럼 지금 빌드하면 나가는가"를 반드시 확인**해야 한다. 이번에는 릴리즈 담당 세션이 커밋 목록을 훑다가 우연히 발견했다.
- **결정 — revert 하지 않고 기능 스위치로 입구만 막는다**(`FEATURE_FLAGS.studentPhotos`, 기본 꺼짐). 근거:
  1. **되돌리기 비용이 실익보다 컸다.** 사진 작업이 `SyncToCloud.ts`(287줄)·`DriveSyncAdapter.ts` 같은 **공용 동기화 배관**을 크게 고쳤고, 그 뒤에 위젯 크래시 수정이 얹혀 있다. 10개 커밋을 revert 하면 충돌과 회귀 위험을 릴리즈 직전에 떠안는다.
  2. **QA 를 마친 코드를 보존한다.** 수업반 사진 지원이 끝나면 값 하나만 켜면 되고, revert 후 재적용에서 생길 유실이 없다.
  3. **되돌릴 지점이 한 곳으로 좁혀진다.** 입구가 4군데뿐이라 무엇을 되살려야 하는지가 명확하다.
- **★결정 — 막을 때는 "안내만 남는 버튼"을 만들지 않는다**: "이름 쓰기" 모드는 사진 유무로 잠기게 돼 있어서, 항목만 남기면 **영영 눌리지 않는 버튼 옆에 "학생 사진이 있어야 써요" 안내**만 뜬다. 사진을 넣는 입구도 함께 막혀 있으므로 사용자는 안내대로 해 볼 방법이 없다. **막을 때는 "왜 안 되는지"까지 같이 지워야 한다** — 부분적으로 막으면 막지 않은 것보다 나쁘다.
- **결정 — 그물은 "출시되는 상태"를 검사한다**: 새 가드(`NameLearningMode.test.tsx`)는 스위치를 조작하지 않고 **꺼진 그대로** 검사한다. 나중에 기능을 열면 이 테스트가 빨간불이 되면서 "여기도 되돌려라"라고 알려 준다(스위치를 실제로 켜서 빨간불을 확인했다). 반대로 기능의 QA 가드(`NameLearningMode.write.test.tsx`)는 `vi.mock` 으로 **켠 상태**를 검사한다 — 안 그러면 항목이 화면에 없어 가드가 통째로 죽는다.
- **★결정 — 공개 문서도 같은 작업 단위에서 함께 내린다**: 앱에 없는 버튼을 안내하는 문서는 그냥 낡은 게 아니라 **거짓말**이다. `/docs` 좌석배치 문서는 출시된 3개 모드만 남기고, 개인정보처리방침은 v2.4.1 상태로 완전히 되돌렸으며, FAQ 의 사진 문장도 지웠다. 되살릴 때 **다시 쓰지 말고 `git show 9c9240f2 -- landing/` 의 검증된 원문을 가져오도록** 계획서에 위치를 적어 뒀다 — 개인정보 문구를 새로 쓰면 사실과 어긋나기 쉽다(2026-08-14 국외이전 오판 전례).
- **적용 범위**: 이 패턴은 "구현·QA 는 끝났으나 출시 조건이 아직 안 맞는" 경우에만 쓴다. 미완성 코드를 `main` 에 넣는 핑계로 쓰지 않는다.
- **검증**: tsc 0 · lint 0 error · vitest 448파일 5,358건 · regression 41/41 · landing `docs:check` + `build` 성공.

## ADR-057: 학기 차시는 "세어서 알려주되, 어떻게 셌는지도 함께 연다"

- **상태**: active · **일자**: 2026-08-20 · **관련**: `docs/01-plan/features/lesson-count-and-progress-assist.plan.md` (v1.2)
- **발단**: 교사 시간표와 나이스 학사일정이 이미 앱 안에 있으니 "이번 학기 이 반 수업이 몇 차시인지"를 셀 수 있다. 그런데 그 숫자는 **정확할 수 없다** — 시험기간엔 시간표를 따로 돌리는 학교가 많고, 체육대회는 학사일정에서 '공휴일'로 오지 않으며, 미래 구간엔 결·보강이 아직 없다.
- **결정 — 계산 결과는 저장하지 않는다. 저장하는 것은 사용자가 준 사실 둘뿐이다**(학기 종료일 `settings.termEndDates`, 수업일 정정 `curriculum-progress.lessonDayAdjustments`). 계산을 저장하면 무효화 지점이 다섯(시간표·변동·학사일정·종료일·정정)으로 늘고, 동기화되면 기기마다 시간표가 달라 "예상"이 흔들린다.
- **결정 — 학기의 끝도 앱이 정하지 않는다**(ADR-037 연장). 학사일정에서 방학식·종업식을 찾아 **후보로 제시하고 사용자가 확정**한다. 확정 전에는 차시를 **아예 표시하지 않는다** — 임의의 날짜를 채워 넣고 그 위에서 숫자를 만들지 않는다.
- **★결정 — 자동으로 빼는 것은 공휴일과 방학만.** 시험·행사는 표시만 하고 빼지 않는다. 자동 제외는 정의상 **과소 추정**이고, "예상보다 수업이 적었다"는 선생님이 학기 중에 알아채지만 **앱이 조용히 빼 버린 날은 알아챌 방법이 없다.** 게다가 분류 정규식 `/시험|평가|고사/`가 '수행평가 주간'·'진단평가'처럼 정상 수업일에 붙는 이름까지 잡는다.
- **★결정 — 뺀 날뿐 아니라 "넣은 날"과 그 근거도 화면에 연다**: 이 계산은 `getMatchingPeriods`에 기대는데 그 함수는 교실 이름 부분 일치까지 허용한다(`'3-1'`이 `'3-10'`에 걸림). 하루씩 볼 때는 눈앞에서 바로 알아채던 오차가 **학기 100일을 한 숫자로 접으면 보이지 않는다.** 그래서 매칭 단계(1 교실+과목 / 2 교실명만 / 3 담임반 폴백)를 날짜마다 노출하고 2·3단계를 점선으로 구분한다. 색을 쓰지 않은 이유는 3개 테마 대비 보장이 어렵고 **빨간색은 오류처럼 읽히기** 때문이다 — 이 날들은 틀린 게 아니라 덜 확실한 날이다.
- **★결정 — 차시 번호는 앱이 세지 않고 "직전 기록의 표기를 이어받는다"**: 앱이 셀 수 있는 건 "학기 시작부터 몇 번째"뿐인데, 선생님들은 대단원·소단원 단위로 차시를 세기도 한다. 앱이 세면 그 부류에게는 틀린 값이다. 그래서 그 반의 직전 기록에서 표기 패턴을 읽어 한 칸 더하고, **읽을 수 없으면 빈칸으로 둔다**(추측해서 틀린 숫자를 넣지 않는다). 단위 글자('차시'·'교시')는 앱이 붙이지 않는다 — 붙이는 순간 앱이 차시를 정의하는 셈이 된다.
- **★결정 — "못 세는 상태"를 0으로 위장하지 않는다**: 빈 결과의 원인은 넷(시간표 미등록·보관된 반·학기 날짜 오류·반 없음)이고 사용자가 할 행동이 각각 다르다. 하나로 뭉치면 **보관한 반을 열었을 뿐인 선생님이 "시간표를 먼저 등록해 주세요"라는 엉뚱한 안내**를 받는다. 상태를 5종으로 나눴다.
- **결정 — 기존 진도율을 바꾸지 않는다**: '입력 기준'(적어 둔 것 중 완료)은 계산을 옮기지 않고 그대로 두고, '학기 기준(예상)'을 옆에 나란히 붙였다. 이 화면이 생겼다고 어제까지 보던 숫자가 달라지면 선생님은 고장으로 읽는다.
- **결과 — 선결 부채 하나를 먼저 갚아야 했다**: 진도 저장이 `{ entries }`만 새로 만들어 저장해 **파일 루트의 형제 필드를 지우고 있었다.** 정정을 저장하려면 이걸 먼저 고쳐야 해서 단독 커밋(`194deeab`)으로 분리했다. `saveAll(force)`가 기존 파일을 아예 읽지 않던 것도 함께 고쳤다.
- **결과 — 기존 개학일 팝업을 모달 큐에 등록하는 일이 범위에 들어왔다**: 코디네이터는 **등록된 것끼리만** 줄을 세운다. 새 종료일 팝업만 등록하면 개학일 팝업은 큐 밖에서 그대로 뜨고, 8월 신규 사용자는 두 조건이 동시에 참이라 focus trap이 겹친다(2026-08 온보딩 먹통 사고의 경로).
- **후속**: 모바일 진도 화면 · `TeachingClass.grade` 도입 후 학년별 행사 필터 · 시험기간 전용 시간표 · `/docs` 사용자 가이드(출시 시점에)
- **검증**: tsc 0 · lint 0 error · vitest 459파일 5,575건 · regression 43/43. 그물 실증 2건(형제 필드 보존, 팝업 큐 등록) — 되돌리면 실제로 빨간불이 나는 것을 확인했다.

---

## ADR-058: 앱 시작 모습은 켬/끔 토글이 아니라 "어떤 모습으로 열지" 한 번의 선택이다

- **상태**: active · **일자**: 2026-08-20 · **관련**: ADR-056 이후 옆핀 마감 작업
- **발단**: "윈도우 시작할 때 옆핀 모드로 열리게" 요청. 기존에는 `widget.transparent` 라는 **켬/끔 토글 하나**가 "시작 시 위젯 모드"를 담당했다. 여기에 옆핀을 더하려면 토글이 하나 더 생기고, 둘 다 켜면 무엇이 이기는지 코드만 아는 상태가 된다.
- **결정 — 배타적인 선택지는 배타적인 UI 로 낸다.** 토글 2개 대신 `widget.startupMode: 'main' | 'widget' | 'sidePin'` 라디오 하나로 바꿨다. 바로 위에 있는 '창 닫기 동작' 라디오와 같은 모양이라, 두 설정이 "접었을 때 / 열 때" 한 쌍으로 읽힌다.
- **★결정 — 이름이 잘못된 legacy 값을 지우지 않고 함께 맞춰 쓴다.** `transparent` 는 이름과 달리 창 투명도가 아니라 시작 모드 토글이었다. 지우면 예전 버전으로 되돌아간 선생님의 설정이 초기화된다. 그래서 ① 읽을 때는 `startupMode` 가 없으면 `transparent` 로 승계하고 ② 쓸 때는 `transparent` 도 함께 맞춰 둔다. 판정 규칙은 도메인의 `resolveStartupMode` 한 벌만 두고 화면·electron 이 같은 답을 쓰게 했다.
- **★결정(정정 2026-08-20) — 아이콘 모드도 시작 모습에 넣는다.** 처음에는 뺐다: "아이콘은 잠깐 치워 두는 자리라 앱을 켜는 순간의 모습이 될 수 없다"고 봤다. **오너가 뒤집었다** — 접어 두는 세 모습(위젯·옆핀·아이콘) 중 하나만 시작 모습에서 빠지는 것이 더 이상한 규칙이었다. 넷 다 고를 수 있게 했다. 다만 `WindowStartupMode` 와 `WindowMode` 는 값이 같아도 타입은 계속 분리한다 — 전환은 앱이 살아 있는 동안의 상태고, 시작 모습은 파일에 적혀 저장되는 사용자의 선택이다.
- **★결정 — 허용 목록은 손으로 나열하지 않는다.** `resolveStartupMode` 가 값을 하나씩 비교하고 있었는데, 아이콘을 더하면서 그 자리를 빠뜨릴 뻔했다(같은 사고가 `closeAction` 에서 이미 났다). `WINDOW_STARTUP_MODES` 에서 뽑도록 바꿔 목록을 늘리면 자동으로 따라오게 했다.
- **★결정 — 아이콘 모드 "승격 카드"(NEW 배지 포함)를 없앤다.** v2.2.7 에 아이콘 모드가 '창 닫기 동작' 안에만 숨어 있어서 둔 소개 자리다. 이제 '창 닫기 동작'과 '앱 시작 시 모습' 양쪽에 정식 항목으로 들어가 소개할 자리가 필요 없다. **몇 번의 업데이트를 지난 기능에 NEW 가 계속 붙어 있으면 배지가 "새것"이 아니라 "장식"이 된다.** 기능인 '지금 아이콘 모드로 접기' 버튼만 평범한 바로가기로 남겼다.
- **★결과 — 같은 사고가 이미 한 번 나 있었다**: `closeAction` 의 `'sidePin'` 이 **설정을 읽는 화면(스토어)의 허용 목록에서 빠져 있었다.** 저장은 되는데 다음 실행에 조용히 '위젯' 으로 되돌아가고, 그 상태로 다시 저장되면 선택이 사라진다. 기존 미러 테스트는 도메인↔electron 두 곳만 봤고 **스토어라는 세 번째 사본을 몰랐다.** 함께 고치고 미러 테스트에 스토어를 추가했다.
- **★결과 — 미러 테스트가 로직을 "재현"하면 같이 틀린다**: `useSettingsStore.iconMode.test.ts` 는 마이그레이션 로직을 복사해 검증하는데, 그 복사본에도 `'sidePin'` 이 없어서 **버그가 있는 채로 초록불**이었다. 새로 넣은 그물은 재현하지 않고 **소스를 읽어 목록을 비교**한다.
- **결과 — 시작 모습이 메인이 아니면 메인 창의 첫 표시를 건너뛴다**: 메인 창은 `show:false` 로 만들어졌다가 준비되면 뜨는데, 시작 모드 전환은 그 **전에** 끝나 버려 "숨길 것이 없다"고 판단한다. 그대로 두면 뒤늦게 뜬 메인이 옆핀 위를 덮는다.
- **후속**: 실기기 확인(옆핀 시작 시 메인 창이 한 번도 비치지 않는지 · 메모리 절약 모드에서 복귀) · 이후 릴리즈 노트에 반영
- **검증**: tsc 0(src) · lint 0 error · vitest 462파일 5,591건 · regression 43/43 · docs:check 통과. 그물 실증 — 두 고침을 되돌리자 3건 빨간불을 확인했다.

## ADR-059: 하루 출결은 "한 종류만"이 아니라 "교시별 사실 그대로" 담고, 접기는 통계에서만 한다

- **날짜**: 2026-08-20
- **상태**: 채택

### 배경

담임 출결 그리드에서 3·4·5교시에 결과를 찍어도 **마지막 한 칸만 남았다**. "1교시 지각 → 3교시 결과 → 6교시 조퇴"처럼 한 날에 종류가 다른 예외를 넣는 것도 원리적으로 불가능했다.

원인은 팔레트 칸 클릭이 그 학생의 하루를 **통째로 다시 쓰던** 계약(§3.10-5 '전-행 재작성')이었다. 칸을 찍을 때마다 `computeAutoPeriods` 가 고른 교시 밖을 전부 지워서, 직전에 찍어 둔 예외가 조용히 사라졌다. 저장 형식(교시별 `AttendanceRecord`)과 기록 카드(`attendancePeriods`)는 원래 여러 건을 담을 수 있었으므로 **입력 화면 한 곳만의 제약**이었다.

### 결정

**입력은 사실을 그대로 담고, 규정에 따른 접기는 집계에서만 한다.**

1. 팔레트 적용을 **덧쓰기**로 바꾼다(`mergeAttendanceFill`) — `computeAutoPeriods` 가 고른 교시만 덮고 나머지 교시의 기존 기록은 보존한다. 담임 그리드(칸 클릭·좌석 팝오버·텍스트 빠른 입력)와 여러 날 패널이 같은 규칙을 쓴다.
2. 나이스 집계(`summarizeNeisAttendance`)는 **그대로 둔다** — 같은 날 지각·조퇴·결과는 대표 1건으로 접고(별표 8 §3 바), 같은 날 결과가 여러 교시여도 1회다(규칙 사).
3. 여러 날 패널에만 "그날 기존 출결을 지우고 새로 넣기" 체크박스(기본 꺼짐)를 둔다.

### 근거

- 학교생활기록부 기재요령의 "한 가지로만"은 **집계 규칙**이지 사실 기록 금지가 아니다. 3교시에 결과를 했다는 사실은 상담·증빙·학부모 안내에 필요한데, 입력 단계에서 지워 버리면 되살릴 수 없다.
- 이미 두 층이 분리돼 있었다 — 기록 카드는 교시별 상세를 그리고, 통계는 `pickRepresentativeAttendance` 로 접는다. 입력만 접기를 앞당겨 하고 있었다.
- **결석은 특례가 필요 없다**: `computeAutoPeriods('absent')` 가 조회~종례 전 교시를 채우므로 덧쓰기여도 하루를 전부 덮는다. '전일 결석'의 의미가 그대로 유지된다.

### 결과

- **★원인이 저장 구조가 아니라 입력 화면의 한 줄이었다** — `AttendanceRecord` 는 (반, 날짜, 교시) 단위라 원래 3·4·5교시 결과를 담을 수 있었고, 기록 카드도 교시별로 여러 줄을 그리고 있었다. 스키마·동기화·집계는 손대지 않았다.
- **★수업 관리는 원래 정상이었다** — 그쪽 매트릭스는 칸 단위 순환이라 여러 교시가 공존한다. 실제 클릭 → 저장 페이로드까지 확인하는 그물을 새로 깔아 같은 회귀가 옮겨붙지 않게 못을 박았다.
- **★정정 동선이 한 단계 늘었다** — 예전에는 잘못 찍은 하루가 다음 클릭 한 번으로 통째 교체됐다. 이제는 되돌리기(Ctrl+Z)나 지우개(칸/이름)를 써야 한다. 그리드에는 둘 다 있지만 **여러 날 패널에는 되돌리기가 없어** 체크박스를 남겼다.
- **★그물이 버그를 되살렸을 때 실제로 빨간불이 나는지 확인했다** — 예전 '전-행 재작성' 을 되돌려 넣자 새 테스트 5건 중 3건이 실패했다.
- **후속**: 실기기 확인(같은 날 지각+결과+조퇴를 넣고 통계가 규정대로 1건으로 접히는지) · 릴리즈 노트 반영
- **검증**: tsc 0 · lint 0 error(변경 파일 0 warning) · vitest 467파일 5,658건 통과 · regression 43/43 · `docs:check` + landing 빌드 통과

---

## ADR-060: 상담 슬롯은 "누가 막았는지"를 기록하고, 차단 사유 문구는 저장하지 않는다

- **날짜**: 2026-08-20
- **상태**: 채택

### 배경

사용자 신고: **"상담 슬롯이 차단된 슬롯이라고 되어 있는데 왜 그런가요? 예약되어 있지 않은데"**

원인이 두 개였다.

1. **종일 일정이 하루를 통째로 막았다.** `resolveEventTimeRange` 가 `period === 'allDay'` 를 `00:00~23:59` 로 해석해, 캘린더에 "학부모 상담 주간" 같은 종일 일정을 하나 적어 두면 **바로 그 상담의 모든 슬롯이 차단**됐다. 여러 날 걸친 종일 일정이면 그 날들이 전부 막혔다.
2. **교사가 손으로 막아 둔 슬롯을 앱이 몰래 되돌렸다.** `consultation_slots` 에는 `status` 만 있고 차단 주체가 없어서, 일정표 동기화(`recomputeSlotAvailability`)가 교사의 수동 차단과 자동 차단을 구분하지 못했다. 겹치는 일정이 없으면 "잘못 막힌 것"으로 보고 `available` 로 풀었다(실측: `availableRestored=1`).

2번은 교사가 "이 시간은 안 됩니다" 하고 막아 둔 시간에 **학부모 예약이 들어올 수 있는** 상태였다. 그리고 1번을 고치면 2번이 더 자주 드러난다 — 예전에는 그날 종일 일정이 있으면 "겹치니 막힌 게 맞다"며 수동 차단이 **우연히** 살아남았기 때문이다. 그래서 둘을 같이 낸다.

### 결정

1. **종일 일정은 busy 로 잡지 않는다.** `resolveEventTimeRange` 가 `'allDay'` 에 `null` 을 돌려준다. 단 `startTime`/`endTime` 이 따로 있으면 그 시각을 그대로 쓴다(구글 캘린더 유입분 보호).
2. **슬롯에 차단 주체를 남긴다.** `consultation_slots.blocked_by` = `'teacher' | 'auto'`(마이그레이션 048). 재계산은 `blockedBy === 'teacher'` 인 슬롯을 **건드리지 않는다**.
3. **차단 사유 문구는 저장하지 않는다.** 저장 값은 열거형 둘뿐이고, 사람이 읽을 사유는 필요하면 교사 PC 에서 로컬 계산한다.
4. **상세 화면에 차단/해제 버튼을 둔다**(`slot-*-toggle-block`). 수동 차단이 영구히 굳는 만큼 되돌릴 길이 반드시 있어야 한다.

### 근거

- **"종일"은 시각이 아니다.** 실제 쓰임은 "하루 내내 자리에 없다"가 아니라 "시각이 안 정해진 하루짜리 일정"(상담 주간·체육대회·시험기간)이다. 이걸 바쁨으로 읽으면 상담 주간을 적어 둔 것만으로 상담이 막히는 자기모순이 생긴다.
- **사유 문구를 저장하면 개인정보가 샌다.** `consultation_slots` 는 `FOR SELECT USING (TRUE)` 공개 읽기다(마이그레이션 009). "○○ 회의와 겹침"을 넣으면 **교사 캘린더 일정 제목이 외부로 노출된다.** 이 저장소는 같은 사고를 이미 겪었다 — 044(anon 키로 `admin_key` 186행 열람). 열거형만 저장하는 것이 이 위험을 원천 차단한다.
- **그래서 이 컬럼은 anon 에서 막지 않는다.** 교사 데스크톱 앱도 같은 anon 키를 쓰므로 막으면 기능이 죽는다. "값이 열거형뿐이라 공개돼도 안전하다"가 전제이고, 자유 문구 금지는 그 전제를 지키는 조건이다.
- **기존 차단 행은 `'auto'` 로 채운다.** 과거 데이터는 주체를 알 수 없다. `'teacher'` 로 채우면 종일 일정 때문에 잘못 막힌 슬롯이 **영구히 굳는다** — 바로 그 신고 내용이다. `'auto'` 면 같은 릴리즈에서 자연히 풀린다.

### 결과

- **★★신고 문장을 그대로 믿으면 절반만 고쳤을 것이다.** 신고는 "왜 차단이냐"였고 그 답은 1번이지만, 조사 중 정반대 방향의 2번(막은 게 풀린다)이 나왔다. 그리고 1번 수정이 2번을 악화시키므로 **따로 낼 수 없었다.**
- **★★공개 읽기 테이블에 "설명"을 넣고 싶은 충동이 설계를 가른다.** 차단 이유를 저장하면 화면이 쉬워지지만 교사 일정 제목이 공개된다. 열거형 + 로컬 계산으로 나눈 이유가 이것이다. 앞으로 `consultation_slots`·`surveys` 같은 공개 읽기 표에 컬럼을 더할 때 같은 질문을 먼저 할 것.
- **★수동 차단을 영구화하면 되돌릴 길이 함께 필요하다.** 이 앱에는 일정 **생성** 화면 말고는 슬롯 차단을 조작할 진입점이 없었다. 버튼 없이 2번만 고쳤으면 "실수로 막으면 영영 못 푼다"는 새 함정이 생겼을 것이다. 메타 가드로 버튼 제거를 막아 뒀다.
- **★`replaceSlots` 의 빈틈은 알면서 남겼다.** 이미 있는 슬롯의 status 는 바꾸지 않으므로(신규 INSERT 만 차단 반영) 일정 편집 화면에서 기존 칸을 막는 건 여전히 안 된다. 상세 화면 버튼이 그 역할을 대신한다.
