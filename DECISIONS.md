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
