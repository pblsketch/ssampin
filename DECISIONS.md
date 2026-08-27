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

> ⚠️ **2026-08-21 — 이 보류는 [ADR-061]로 재검토됐다.** 공급자를 업스테이지 Solar로 바꾸면서 아래 보류 근거(무료 경로 없음·잔량 불가시·응답 속도·월 $83)가 대부분 해소됐다. **아래 내용은 Zen에 대한 판단으로만 유효하다.**

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

## ADR-061: 인앱 AI 공급자를 OpenCode Zen에서 업스테이지 Solar로 바꾼다 — ADR-052 보류 사유 재검토

- **상태**: 재검토 완료 · **착수 여부는 오너 판단 대기** · **일자**: 2026-08-20~21
- **발단**: ADR-052로 보류한 뒤, 오너가 **"고객지원 챗봇에 붙인 업스테이지 모델로 바꾸면 어떤가"**를 먼저 제기했다. (ADR-052의 재개 조건 1 "재원이 생겼는가"가 아니라, **조건 2 "무료로 쓸 수 있는 다른 경로가 생겼는가"**에 해당한다.)
- **측정 방법**: Zen을 쟀던 스크립트를 **그대로** 썼다. `LLM_BASE_URL`/`LLM_KEY_NAME`/`LLM_OUT_TAG` 오버라이드를 넣어 엔드포인트만 갈아끼웠고 **기본값은 그대로 Zen**이라 기존 결과가 재현된다. 같은 20문항·같은 도구 5종·같은 채점 기준. 실제 학생 데이터는 한 건도 보내지 않았다. 상세: `docs/03-analysis/opencode-zen-phase0/measure-5-upstage-solar.md`

### 실측 — Zen보다 전면 우위였다

| 항목              | Zen `gpt-5-nano` | Zen `minimax-m3`(ADR-052 권장안) | **`solar-pro3`** |
| ----------------- | ---------------- | -------------------------------- | ---------------- |
| 도구 선택 정확도  | 83% (15/18)      | 측정 실패(503)                   | **100% (18/18)** |
| 왕복 응답         | 17초             | 5초                              | **1.0~2.5초**    |
| 문항당 비용(정가) | $0.00041         | $0.00083                         | **$0.000281**    |

- **유료 정가로만 비교해도 더 정확하고·빠르고·싸다.** 무료 권한을 빼고 셈한 결과다.
- **★ADR-052를 죽인 "볼 수 없는 한도"가 정반대다.** 업스테이지는 응답 헤더로 분당 한도(100요청/250k토큰)와 잔량·리셋 시각을 **매번** 알려준다. 20건 동시 호출 실측 **20/20 성공**(Zen 무료 모델은 같은 조건에서 19/20이 429였다).

### 결정 1 — 공급자는 업스테이지 `solar-pro3`로 한다

`solar-pro2`도 도구 성능은 동등하고 거절은 오히려 낫지만(누수 1건 vs 2건), **지원 종료 대상**이고 응답이 2배 느리다(중앙값 1,200ms vs 593ms). 무료 권한이 pro3에 실제로 적용되고 있으므로 **개발과 출시가 같은 모델**이라 갈아탈 일이 없다.

### 결정 2 — 개발은 무료 권한으로, 출시 시점에 유료 전환을 판단한다

전환 지점은 계획서 §8.4 그대로 **환경변수 값 교체 수준**이다(챗봇이 이미 그 구조).

> **↳ 2026-08-21 확정**: 이 "판단"은 **결정 6**으로 정해졌다 — **무료가 원칙, 유료는 비상구**다. 따라서 출시 시점의 기본값은 무료이며, 유료 전환은 *무료 후보가 요건(§6.1)을 못 채울 때*의 착지점이다.

### 결정 3 — 어느 쪽이든 월 상한을 건다. 이것이 보류 사유의 실제 해법이다

**쌤핀은 수익화를 하지 않으므로** "이번 달 AI 예산 소진 → AI 답변만 중단, 숫자 카드는 유지"가 **허용된다.** 돈을 받는 제품은 못 하는 선택지다. 계획서 §8.1(서버 상한)·§8.2(앱 예산)·§8.3(429여도 절반은 남는다)이 이미 그 설계를 갖고 있다 — 무료 티어 소진 대비로 만든 장치가 그대로 맞는다.

**★ADR-052의 보류 사유는 금액 크기가 아니라 "끝이 안 보이는 부담"이었다.** 따라서 답은 "월 $5면 싸다"가 아니라 **"오너가 금액을 정하고 그 위로는 절대 안 올라간다"**이다.

### 결정 4 — 키를 분리한다 (비용이 아니라 계측 목적)

현재 콘솔에 비밀 키가 하나뿐이라 챗봇과 인앱 AI가 공용하게 된다. 그러면 **기능별 사용량 구분이 불가능**하다.

### 결정 5 — 유료 전환 경로(오픈라우터 포함)는 **지금 정하지 않는다**. 옵션을 열어두는 비용이 0이기 때문이다

오너 제안: _"무료로 가고, 나중에 유료 전환이 된다면 오픈라우터 방식으로 전환하면 어떨까."_
**방향은 맞으나 이득이 예상과 다른 곳에 있어**, 아래를 근거로 **지금은 결정을 유보하고 선택지만 열어 둔다.**

**Zen·업스테이지·오픈라우터가 전부 같은 OpenAI 호환 규격(`POST {base}/chat/completions`)을 쓴다.**
챗봇이 이미 `UPSTAGE_BASE_URL`/`UPSTAGE_MODEL`을 환경변수로 뺀 구조(ADR-048)이고, 이번에 측정
스크립트도 `LLM_BASE_URL` 오버라이드로 공급자 교체가 가능해졌다. **즉 지금 아무것도 정하지 않아도
세 갈래가 모두 열려 있다.** 2027-03의 가격표·모델 목록은 지금과 다를 것이므로 **그때 비교하는 편이
정확하다.** 지켜야 할 설계 규칙은 하나뿐이다 — **공급자·모델·엔드포인트를 코드에 박지 않는다.**

#### 오픈라우터 조사 결과 (2026-08-21)

| 기대했던 이득      | 실제                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 비용 절감          | **없다.** 토큰 단가가 직접과 동일($0.15 / $0.60 / 캐시 $0.015). 충전 시 **5.5% + 건당 최소 $0.80** → 우리 규모에서 월 $0.2~0.4 추가                                                         |
| 장애 대비(이중화)  | **없다.** 오픈라우터에서 `solar-pro3`를 제공하는 곳은 **업스테이지 하나뿐**이며 _"forwards every request to it directly — no routing decisions to make"_. 업스테이지가 멈추면 똑같이 멈춘다 |
| **모델 교체 자유** | **이것이 유일한 진짜 이득이다.** 키 하나로 수십 개 모델을 비교·교체할 수 있어, **모델을 바꿀 때마다 계약·결제·개인정보처리방침 수정을 반복하지 않아도 된다**                                |
| 개인정보 통제      | **유용하다.** "학습에 쓰는 제공사로 라우팅 금지" + **ZDR(데이터 무보관) 전용** 설정이 있어, 약관 독해가 아니라 **스위치로 강제**할 수 있다                                                  |

#### ★전환 시 반드시 확인할 것 3가지

1. **★★계약 상대가 바뀐다.** 유료 전환으로 사려는 물건은 **약관 제22조의 "학습에 쓰지 않는다"**인데, 그 계약의 당사자는 **'회원'**이다. 오픈라우터를 통하면 회원은 오픈라우터이고 우리가 아니다. 오픈라우터도 *"제공사에서 학습에 쓰이는지는 downstream provider 정책을 따른다"*고 명시한다. **보장이 사라지진 않으나 근거가 '우리 계약'에서 '남의 계약 + 오픈라우터 설정'으로 바뀐다.**
2. **★업스테이지 엔드포인트가 ZDR로 분류돼 있는가** — 제공사 정책 표가 동적 로딩이라 문서로 확인 불가. **ZDR이 아니면 "ZDR 전용" 스위치를 켜는 순간 `solar-pro3`가 목록에서 빠진다**(켜면 모델이 사라지고 끄면 보장이 없는 상태). **실제로 켜 보기 전에는 알 수 없다.**
3. **개인정보처리방침에 수탁자 1줄(오픈라우터, 미국)이 추가된다.** 국·영문 양쪽 수정 필요. 판단은 **법인 소재지가 아니라 재위탁 대상 기준**([[feedback_overseas_transfer_judged_by_subprocessor]] 교훈).

#### ★BYOK — 위 1번을 해소하는 절충안 (알아만 둔다)

오픈라우터는 **우리 업스테이지 키를 그대로 꽂는 BYOK**를 지원하고 **월 100만 요청까지 수수료가 없다**(우리 예상 월 약 7.7만 호출의 13배 여유). 이러면 **계약은 업스테이지와 직접 유지한 채**(제22조가 우리에게 적용) 오픈라우터를 **갈아타기 통로로만** 쓸 수 있다. 다만 3번(방침 수탁자 추가)은 그대로 남는다.

#### ★손실 항목 — 한도 가시성

직접 호출하면 응답 헤더 `x-upstage-ratelimit-*`로 **남은 한도가 매번 보인다**(ADR-052의 Zen을 폐기시킨 바로 그 차이). 오픈라우터를 거치면 응답이 표준화되면서 **이 헤더가 전달되지 않을 가능성이 높다.** 전환 시 대체 계측 수단을 먼저 확보할 것.

#### 금지

**오픈라우터의 `:free` 변형 모델(`upstage/solar-pro-3:free` 등)은 쓰지 않는다.** 한도가 빡빡하고 "프롬프트가 공개될 수 있는" 분류에 속한다 — ADR-052에서 Zen 무료 모델로 이미 겪은 함정과 같은 종류다.

#### 판단 시점

무료 권한 만료(**2027-03-31**) 전, 또는 그 이전에 유료 전환이 필요해지는 시점. 그때 **업스테이지 직접 유료 / 오픈라우터(BYOK 포함) / 다른 모델** 셋을 그 시점 가격으로 비교한다. **이 절을 다시 읽는 것으로 재조사를 대신할 수 있게** 근거를 남겨 둔다.

### 결정 6 — 비용 전략: **무료를 원칙으로, 유료를 비상구로.** 후속 공급자는 '모델'이 아니라 '요건'으로 지정한다

오너 결정(2026-08-21): _"업스테이지 모델로 먼저 가고, 나중에 이게 유료화되면 다른 무료 모델로 전환한다."_

**★이 선택의 정체를 정확히 적어 둔다 — "무료 → 무료"가 아니라 "학습 허용 → 학습 허용"이다.** 업스테이지 무료(약관 제22조 무료 조항)도, OpenCode Zen의 무료 모델도 **대가가 데이터**다. 지금 받아들이는 조건을 나중에도 받아들이는 것이므로 **전략은 일관된다.** 다만 그 귀결이 결정 7이다.

#### 6.1 후속 공급자는 이름이 아니라 요건으로 정한다

> **요건**: OpenAI 호환 `chat/completions` · 한국어 도구 선택 **≥90%** · 스키마 준수 ≥90% · 멀티턴 3턴 유지 · **데이터 정책이 문서로 확인 가능** · 잔여 한도를 확인할 수단이 있을 것(없으면 감점)

**특정 모델을 후속으로 못 박지 않는다.** 근거: 2026-08-21 하루에 **공급자 3곳·모델 4개(`gpt-5-nano`·`solar-pro3`·`solar-pro2`·`muse-spark-1.2-contributor-free`)를 같은 잣대로 전부 실측**했다. 하네스(`scripts/zen-phase0/`, 세 스크립트 모두 `LLM_BASE_URL`/`LLM_KEY_NAME` 오버라이드 지원)가 남아 있으므로 **그때 존재하는 후보를 30분이면 재서 고를 수 있다.** 지금 이름을 고정하는 것보다 강하다.

#### 6.2 유료는 버리지 않고 비상구로 둔다

무료 후보가 하나도 요건을 못 채우면 **업스테이지 유료(월 $3~11, 실측 완료)**로 착지한다. "무료가 원칙, 유료가 비상구"라 어느 쪽으로 굴러가도 제품이 멈추지 않는다.

#### 6.3 검증 시점은 만료일이 아니라 **2개월 전(2027-01)**

전환에는 개인정보처리방침 수정(국·영문)·결제 준비가 따르므로 **2027-03-31에 알면 늦다.**

#### 6.4 검토 이력 — Meta `Muse Spark 1.2` (2026-08-21, **채택하지 않음**)

오너가 "월 40달러 코딩 AI의 종말" 류 소식을 제기해 실측했다.

- **능력은 진짜다**: 도구 선택 **94%**(17/18) · 스키마 100% · 멀티턴 3/3 · 스트리밍 ✓. **Zen 유료 `gpt-5-nano`(83%)보다 낫다.**
- **★ADR-052의 "무료 몫 소진"이 재현되지 않았다** — 20건·60건 동시 호출 **전부 200**, 하루 105회 호출에 429 **0건**. `deepseek-v4-flash-free`가 19/20 실패한 것과 다르다. **과거 결론을 이 모델에 그대로 적용하면 오판이다.**
- **★★그럼에도 채택하지 않는 이유 — "contributor"는 할인 등급명이 아니라 "데이터로 결제한다"는 뜻이다.** 오픈코드 공식 문서: _"Heavily discounted token pricing **in exchange for permission to use your prompts and completions to train future Meta models**."_

| 등급                              | 가격(1M)      | 조건         |
| --------------------------------- | ------------- | ------------ |
| `muse-spark-1.2`                  | $1.25 / $4.25 | 학습에 안 씀 |
| `muse-spark-1.2-contributor`      | $0.10 / $0.20 | 학습 허용    |
| `muse-spark-1.2-contributor-free` | **$0**        | 학습 허용    |

- **무료로 쓰면 지금 업스테이지 무료와 조건이 같은데** 3~4배 느리고(단발 중앙값 1,517~2,427ms vs 593ms), **한도 헤더가 아예 없고**(`undefined`), 문서에 *"available for a limited time"*이라 **한시적**이며, 방침에 수탁자(메타·오픈코드)를 새로 추가해야 하고, 메타 Geographic Use Policy 확인이 필요하다. **바꿀 이유가 없다.**
- **학습을 거부하려면 표준 등급**이고, 우리 토큰 구성(1,454 in / 104 out)으로 문항당 **$0.00226 → 월 약 $87**이다. **ADR-052에서 보류를 부른 월 $83과 같은 수준이고, 업스테이지 유료보다 8배 비싸다.**
- **결론**: _무료면 대가가 데이터고, 데이터를 안 내주려면 업스테이지보다 8배 비싸다._ 어느 쪽이든 현 계획보다 나쁘다. **개발 도구로는 훌륭하나 제품에 넣을 이유가 없다.**
- 원자료: `docs/03-analysis/opencode-zen-phase0/measure-1-function-calling-muse-spark-free.json`

**★관찰된 시장 패턴**: 최근 6개월간 무료 경로는 계속 생겼다(Zen 무료 모델 → 업스테이지 교육 프로그램 → Muse Spark). **능력 있는 무료 후보가 2027-03에도 있을 것이라는 기대는 근거가 있다.** 다만 **그 무료의 대가가 데이터라는 패턴도 세 번 모두 동일했다** — 요건 §6.1에 "데이터 정책 문서 확인"을 넣은 이유다.

### 결정 7 — 도구 등급제는 **임시가 아니라 영구**다. 「2등급 개방」 계획은 폐기한다

결정 6의 직접적 귀결이다. 계획서 §8.4는 *"유료 전환 시 '학습 안 씀'이 계약으로 보장되면 `ALLOWED_GRADES`를 `[1]` → `[1, 2]`로"*라는 구조인데, **무료를 원칙으로 삼는 한 그날이 오지 않는다.**

1. **`ALLOWED_GRADES = [1]`은 되돌릴 수 없는 경계다.** "나중에 열 수 있다"는 문장을 남겨 두면 언젠가 누군가 그 문장을 근거로 연다. 계획서 §8.4의 2등급 개방 항목을 **삭제**하고, 상수 주석에 영구 경계임을 명시한다.
2. **2등급 도구는 만들지 않는다.** 계획서가 이미 경고한 대로 _"미래를 위해 미리 만들면 죽은 코드가 되고, 죽은 코드는 언젠가 실수로 켜진다."_
3. **★옵트인 안내(§5.8)에 학습 이용 사실을 쉬운 한국어로 명시한다.** 제품이 **영구적으로** "보낸 내용이 학습에 쓰일 수 있는" 등급 위에서 돌아가므로, 이는 부담이 아니라 **이 전략을 떳떳하게 만드는 조건**이다. 실제로 나가는 것은 집계 숫자뿐이므로("3학년 2반 결석 2명") 설명도 어렵지 않다.
4. **§5.7(자유 입력창)의 위험도는 낮아지지 않는다.** 계획서는 유료 계약이 그 심각도를 근본적으로 낮춘다고 봤는데, 이 전략에서는 그 완화가 없다. ~~**3등급 차단(Q9 키워드 목록)은 선택이 아니라 필수**가 된다.~~

   > **🔄 2026-08-21 보정 — 차단은 철회하고 "경고 + 상시 가시화"로 대체한다 (오너 결정).**
   >
   > 설계: `docs/02-design/features/ssampin-ai.input-guard.design.md`
   >
   > **철회 사유 2가지**
   >
   > 1. **오탐이 기능을 죽인다.** "진단"을 막으면 "진단평가 일정 알려줘"가 막힌다.
   >    학교에서 흔한 말이라 정상 업무 질문이 계속 걸린다. **안 쓰이는 안전장치는 안전하지 않다.**
   > 2. **차단의 논거였던 "경고는 무시된다"가 이 UI에는 맞지 않는다.** 여기 경고는 일회성 팝업이
   >    아니라 **입력창 위에 상시로 떠 있는 「나갈 문장」 줄**의 상태 변화다.
   >
   > **★차단이 전부 사라진 것은 아니다** — 기계가 확실히 판정하는 것은 그대로 막는다.
   > **이름은 자동 삭제**, **연락처·주민번호는 전송 직전 관문이 차단.**
   > 사람의 맥락 판단이 필요한 것(가정사·건강·상담)만 경고로 내렸다.
   >
   > **★대가(숨기지 않는다)**: 선생님이 경고를 보고도 보내면 **실제로 나가고 회수할 수 없다.**
   > 따라서 **옵트인 안내·개인정보처리방침에 "자동으로 막습니다"라고 쓸 수 없다** —
   > "보여 드립니다"로 쓴다. 확인되지 않은 유리한 문구를 쓰지 않는다는 기존 원칙 그대로다.
   > **"경고 후 그대로 보낸 비율"을 관측**하고(내용 미저장), 높으면 문구·형태를 고친다.
   > 차단으로 되돌리는 것은 오너 재결정 사항이다.
   >
   > 부수 효과: **§14 Q9(차단 키워드 확정)가 착수 관문에서 해소됐다.** 오탐 대가가 낮아져
   > 목록을 넓게 잡아도 되고, **허용목록(예외 처리)을 만들지 않는다.**

### 남은 단 하나 — 약관 제22조

출처 `https://www.upstage.ai/terms-of-service`

- **유료**: "회사는 회원 입출력 데이터를 서비스 개선이나 인공지능 모델 학습에 **사용하지 않습니다**"
- **무료**: "…인공지능 기술 연구개발(**학습 포함**)에 활용될 수 있으며" — **옵트아웃 없음**

계획서 §8.4가 2등급 개방의 유일한 기준으로 못 박은 *"'학습에 쓰지 않는다'가 계약으로 보장되는가"*는 **유료에서만 성립한다.** 무료로 쓰는 한 계획서 §1.3의 제약이 그대로이므로 **등급 정책은 `[1]` 유지**이고 등급제 설계는 한 줄도 바뀌지 않는다.

→ **2026-08-21 결정됨(결정 6·7)**: **전자를 택했다** — _무료로 쓰며 학습 이용을 감수하고 등급제로 막는다._ 그 대가로 **등급제는 영구 경계가 되고(결정 7), 옵트인 안내에 학습 이용을 명시하며, 입력 안전장치가 필수가 된다.** ⚠️ 그 장치는 **2026-08-21 보정으로 차단이 아니라 경고 + 상시 가시화**다 (결정 7-4 보정 참조). 유료(월 $3~11)는 폐기하지 않고 **비상구로 남긴다**.

**★그러므로 이 절의 제22조 대조는 앞으로도 유효한 판단 근거다** — 무료 티어를 바꿀 때마다 그 공급자의 같은 조항을 다시 읽어야 한다(요건 §6.1의 "데이터 정책 문서 확인").

### 실제 규모로 다시 셈한 비용 (`app_analytics` 실측, 2026-08-20)

고유 기기 — 1일 **387** / 7일 607 / 30일 **763** / 90일 1,291 (방학 중 수치)

| 시나리오                           | 월 비용(정가) |
| ---------------------------------- | ------------- |
| 하루 활성 387명 전원이 매일 5건    | **$10.9**     |
| 옵트인 기본 꺼짐 → 실사용 30% 가정 | **약 $3.3**   |

**보류를 부른 숫자는 월 $83이었다.** 게다가 콘솔에 Cached 토큰이 실제로 잡히고 있어(캐시 입력은 1/10 단가), 왕복 입력 1,454토큰 중 **약 1,100이 매번 동일한 고정 내용**(시스템 지시 + 도구 정의)이므로 **월 $5 이하로 더 내려갈 여지**가 있다(구현 후 재측정 필요).

기준선: **고객지원 챗봇 전체가 유료여도 월 $0.12~0.57**(콘솔 Usage 실측).

### ★함정 — 공개 요금표로 계정 상태를 추정하지 말 것

공개 요금표는 `solar-pro3`를 $0.15/$0.60로 표시하고 무료 표시가 없다(현재 무료는 Embed 2·File Search·Studio 베타뿐, pro3 출시 기념 무료는 2026-03-02 종료). **그러나 콘솔 Usage 실물은 2026-08-15~19 전 행이 $0.00다.** 또한 2026-07-18 안내 메일은 무료 범위를 **`Solar-Pro 2`**로 적었으나 실제 무료가 적용되는 것은 **pro3**다(pro2 지원 종료로 권한이 옮겨진 것으로 보인다).

- **계정의 정본은 콘솔 Usage 화면뿐이다.** 요금표·안내 메일 어느 쪽도 아니다.
- 이 확인으로 "챗봇이 8/14부터 pro3로 돌아 과금 중일 수 있다"는 경보가 **해소**됐다(청구 0).

### 재판매 우려(ADR-052)는 약화됐다

**쌤핀은 수익화를 하지 않는다.** 누구에게도 API 접근권을 팔지 않으므로 약관 제9조(이용권 양도 금지)의 성립 근거가 약하다. **고객지원 챗봇이 2026-08-14부터 같은 중계 구조로 운영 중**이라는 전례도 있다. 다만 무료 권한의 적용 범위와 함께 **업스테이지 교육팀에 한 번 문의하면 두 의문이 동시에 해소된다** — Zen에는 문의 창구조차 없었다는 점이 결정적 차이다.

### 잔존 리스크

1. **무료 권한 만료 2027-03-31** — 계획서 미해결 질문 Q6("무료 기간이 끝나면 기능을 끄는가")이 그날 현실이 된다. 결정 2·3이 이에 대한 대비다.
2. **기관 도메인 계정 의존**(`junil1212@g.cnees.kr`) — 학교를 옮기면 권한이 사라질 수 있는 단일 장애점.
3. **2등급 탐침 누수** — `solar-pro3`가 거절해야 할 질문 2건에서 1등급 도구를 불렀다(PII 유출은 아님). **모델 판단만으로 경계가 지켜지지 않는다**는 근거이므로 계획서 §4.4 egress 4중 그물과 §4.3 "거절을 기능으로" UX는 **공급자와 무관하게 그대로 필요하다.**

### 상호 참조

- 대체 대상: **ADR-052**(보류) · 챗봇 공급자 도입: **ADR-048**
- 분석 원문: `docs/03-analysis/opencode-zen-phase0/measure-5-upstage-solar.md`
- 계획서: `docs/01-plan/features/in-app-chatbot-zen.plan.md`(§1.2·§1.3·§7·§8.4 갱신 필요) · `record-polish-in-app-ai.plan.md`

---

## ADR-062: 온라인 교무실은 "DB 잠그고 함수로만 연다" — 부서 간 격리와 관리자 토큰 분리

- **상태**: active
- **일자**: 2026-08-21
- **맥락**: 온라인 교무실(M1)은 쌤핀 최초로 **여러 학교·여러 부서가 한 데이터베이스를 나눠 쓰는**
  기능이다. 남의 부서 멤버·초대 코드가 보이면 안 된다. 그런데 쌤핀은 Supabase Auth 를 쓰지 않아
  (마이그레이션 전체에 `auth.uid()` 사용 0건) 클라이언트가 가진 신원이 없다. 앱 번들에 들어 있는
  공개 anon key 뿐이라 "행 단위 정책으로 내 부서만 보이게"가 성립하지 않는다.

- **결정**:
  1. **격리는 두 겹으로 만든다.**
     - DB 층: `staffroom_departments` / `staffroom_members` / `staffroom_invites` /
       `staffroom_admin_tokens` 네 테이블을 **service_role 전용**으로 잠근다. RLS 정책도
       service_role 만이고, anon·authenticated 는 테이블 GRANT 자체를 회수한다
       (`049_staffroom_core.sql`). PostgREST 로 직접 때려도 한 행도 나오지 않는다.
     - 함수 층: 모든 읽기·쓰기는 `staffroom-*` Edge Function 을 거친다. 함수는 요청자의
       구글 access token 을 **구글에 되물어** 이메일을 확인하고, 그 이메일이
       `staffroom_members` 에 있는지 본 뒤에만 응답한다.
  2. **신원은 서버가 확인한 지메일만 인정한다.** 클라이언트가 "나는 아무개입니다"라고
     문자열로 주장하는 경로를 만들지 않는다. 그러면 남의 지메일을 적어 넣는 것만으로
     남의 부서에 들어갈 수 있다. 초대 링크·코드는 **초대장일 뿐 열쇠가 아니다.**
  3. **초대 코드는 숫자 6자리가 아니다.** 기존 `BoardSessionCode` 의 31자 알파벳
     (혼동 문자 0/O/1/I/L 제외) 6자리를 재사용한다(31⁶ ≈ 8.9억). 알파벳을 새로 선언하지 않고
     `BoardSessionCode.ts` 를 단일 출처로 둔다. 경우의 수만으로 막지 않고
     `_shared/rateLimit.ts` 를 IP·지메일 두 축으로 함께 건다.
  4. **관리자 토큰은 `teacher_tokens` 를 재사용하지 않고 `staffroom_admin_tokens` 로 나눈다.**
     암호화 키도 `STAFFROOM_ENCRYPTION_KEY` 로 분리하되, 미설정 시 `ENCRYPTION_KEY` 로
     폴백하며 서버 로그에 경고를 남긴다.
  5. **인가 판정은 순수 함수로 뽑아 CI 에서 검증한다.**
     `supabase/functions/_shared/staffroomAccess.ts` 에 Deno 전역 없이 두고,
     `src/infrastructure/supabase/__tests__/staffroomServerAccess.test.ts` 가 상대경로로
     불러 테스트한다. `supabase/**` 아래 테스트는 vitest include 밖이라 돌지 않기 때문이다
     (기존 `_shared/sigRetention.test.ts` 가 그 상태다).

- **근거**:
  - 044 에서 배운 것 — **RLS 는 행 단위라 열을 가리지 못하고**, 클라이언트가 select 목록에서
    민감 컬럼을 빼는 것은 방어가 아니라 "안 달라고 하는 것"일 뿐이다. 그래서 GRANT 를 회수한다.
  - 관리자 토큰 분리 이유 셋: ① **피해 범위** — 같이 쓰면 암호화 키 하나가 뚫렸을 때 과제 제출
    기능까지 함께 번진다. ② **수명** — 과제 토큰은 과제가 끝나면 쓸모가 없지만, 교무실 관리자
    토큰은 계획서 §3.2.1 대로 자료를 **읽는 길**까지 떠받치므로 부서가 살아 있는 동안 계속
    필요하다. ③ **소유 단위** — `teacher_tokens` 는 교사 1명, 이쪽은 부서 1개다. 한 선생님이
    여러 부서의 관리자일 수 있고 부서마다 따로 끊길 수 있다.
  - 마지막 관리자 강등·제외를 막는 이유 — 관리자가 없어진 부서는 초대도 멤버 관리도 아무도
    못 한다. 계획서 §10.1 의 "관리자가 떠나면 부서가 멈춘다"가 실수 한 번으로 즉시 일어난다.

- **트레이드오프**:
  - 모든 요청이 구글 userinfo 를 한 번 더 왕복한다 → 응답이 조금 느려진다. 대신 강퇴·탈퇴가
    **다음 요청부터 즉시** 반영된다(세션 토큰을 따로 발급하면 만료까지 남의 부서가 열린다).
  - 테이블을 직접 못 읽으므로 클라이언트가 쓸 수 있는 조작이 Edge Function 에 선언된 것뿐이다.
    M2 이후 모듈을 붙일 때마다 함수를 늘려야 한다.
  - `STAFFROOM_ENCRYPTION_KEY` 폴백을 남겨 둔 탓에, 키를 넣지 않으면 위 ①의 이점이 사라진다.
    **공개 배포 전에 전용 키를 반드시 설정해야 한다** — 폴백은 개발 중 편의일 뿐이다.
  - 온라인 교무실 탭은 PIN 보호 대상 목록에 넣지 않았다(`NON_PROTECTABLE`).
    `ProtectedFeatureKey` 에 새 키를 더하는 것은 M1 범위 밖이라 미뤘다.

### 상호 참조

- 계획서: `docs/01-plan/features/online-staffroom.plan.md` (§3.2 · §3.2.1 · §7 · §10.1 · §11)
- 마이그레이션: `supabase/migrations/049_staffroom_core.sql`
- 같은 패턴의 선례: **ADR-005 계열**(과제 제출의 `save-teacher-token` / `submit-assignment`)
- 열 단위 권한의 교훈: `supabase/migrations/044_revoke_secret_columns_from_anon.sql`

---

## ADR-063: 구글에서 되돌아온 일정은 로컬의 "신분증"을 바꾸지 못한다

- **상태**: active
- **일자**: 2026-08-21
- **배경**: 문혜인 선생님이 "일정에 구글 캘린더가 2개 뜨는 이유가 뭘까요?"라고 제보했다. 달력의
  같은 날에 `여름방학` 이 파란 줄·보라 줄로 두 번, 하루 상세에서는 `대체휴일` 이 NEIS 1개 +
  "내 구글 캘린더" 2개, 모두 세 줄이었다. 카테고리 관리에는 구글 계정이 하나뿐이었다.
- **원인**: `SyncFromGoogle` 은 구글에서 내려온 일정을 `googleEventId` 로 로컬 일정과 맞춘 뒤
  **통째로 덮어썼다.** 덮어쓴 값에는 카테고리(구글 캘린더)와 출처(`google`)가 들어 있고 NEIS 메타는
  없다. 그런데 쌤핀은 NEIS 학사일정을 구글로 **올려 보내는** 기능이 있어서, 올려 보낸 그 일정이
  곧바로 다시 내려온다. 즉 자기가 보낸 메아리를 남이 준 새 일정으로 착각해 학사일정의 신분증을
  지워 버렸다. 신분증을 잃은 일정은 다음 NEIS 동기화에서 "로컬에 없는 일정"으로 판정돼 하나 더
  생겼고, 그게 다시 구글로 올라가면서 사이클마다 한 줄씩 늘었다.
  `syncDirection: 'toGoogle'`(올리기 전용)은 저장만 되고 **아무 데서도 읽히지 않아** 제동장치도
  없었다.
- **결정**:
  1. 내려받기는 `syncDirection !== 'toGoogle'` 인 매핑만 대상으로 한다.
  2. 매칭된 로컬 일정이 NEIS 소유(`source === 'neis'` 또는 `neis.eventId` 보유)면 **내용을 덮어쓰지
     않고** 동기화 흔적(`etag`·`googleUpdatedAt`·`lastSyncedAt`)만 갱신한다.
  3. 그 밖의 로컬 소유 일정(`source` 가 `google` 이 아닌 것)은 **내용은 구글을 따르되
     카테고리·출처·NEIS 메타는 로컬 값을 유지**한다(`mergeKeepingIdentity`).
  4. 이미 늘어난 사본은 **자동으로 지우지 않는다.** 몇 줄이 겹쳤는지 알리고, 선생님이 눌렀을 때만
     정리한다.
  5. 정리는 **삭제가 아니라 숨김**(`isHidden`)이다.
- **근거**:
  - "내용 vs 정체성"을 나누는 것이 핵심이다. 구글은 제목·시간이 바뀌었다는 사실은 알려 줄 수 있지만
    이 일정이 **어느 카테고리 소속이고 누가 만들었는지**는 로컬만 안다. 이 경계를 지키지 않으면
    양방향 동기화는 반드시 소유권을 잃는다.
  - 자동 삭제를 하지 않는 이유 — 겹친 것이 전부 사본이라는 보장이 없다. 선생님이 같은 이름으로
    두 개를 일부러 만들었을 수도 있다. 그래서 선생님이 직접 만든 일정은 **접기 대상에서 아예 제외**하고,
    나머지도 목록을 보여 준 뒤 확인을 받는다.
  - 숨김을 고른 이유 — 사본은 자동으로 들어오는 것이라 **지워도 다음 동기화에 되살아난다.** 반대로
    `isHidden` 은 `SyncFromGoogle`·`SyncNeisSchedule` 양쪽이 이미 존중하므로 다시 나타나지 않고,
    자료가 남아 있어 되돌리기도 안전하다. 되살아나는 삭제보다 남아 있는 숨김이 낫다.
- **영향**:
  - `src/usecases/calendar/SyncFromGoogle.ts` — 소유권 가드 신설
  - `src/domain/rules/eventDuplicateRules.ts` — 중복 묶음 판정 규칙 신설
  - `src/usecases/events/ManageEvents.ts` · `useEventsStore` — `hideMany` / `hideManyEvents`
  - `src/adapters/components/Schedule/DuplicateCleanupModal.tsx` · `Schedule.tsx` — 안내 배너와 정리 화면
- **한계**: 구글 캘린더 **쪽에 쌓인** 사본은 그대로 남는다. 그건 설정 → Google 연동의
  "NEIS 연결 끊기(구글에서도 삭제)" 가 이미 담당한다.

### 상호 참조

- 제보: 2026-08-21 문혜인 선생님 (일정 화면 스크린샷 3장)
- 같은 계열의 교훈: **ADR-046**(학기 표시 정본 분리) — "누가 정본인가"를 정하지 않으면 두 소스가 서로를 덮어쓴다

---

## ADR-064: 연락처는 새 저장소를 만들지 않는다 — 교직원만 신설, 학생·보호자는 명렬표가 정본

**날짜**: 2026-08-21
**상태**: 채택

### 배경

"교직원·학생·보호자 연락처를 쌤핀에 넣자"는 요청이 들어왔다. 그런데 확인해 보니 학생 본인
연락처와 보호자 연락처 2개(호칭 포함)는 **이미 `Student` 엔티티에 있었다.** 담임 › 명렬 관리에서
입력하고, 엑셀 명렬표를 불러올 때도 함께 들어오며, 모바일 학생 상세에는 전화 걸기까지 있었다.

없던 것은 **교직원 연락처**와, 셋을 한 화면에서 찾는 **통합 조회 화면**뿐이었다.

### 결정

1. **교직원 연락처만 새 저장소(`staff-contacts.json`)를 만든다.**
2. **학생·보호자 연락처는 복사해 오지 않는다.** 연락처 화면은 `Student`를 읽어 그 자리에서
   목록으로 바꿔 보여 줄 뿐이고, 입력·수정은 계속 명렬 관리에서만 한다.
3. **모바일 연락처는 읽기 전용이다.** 등록·수정은 PC에서만 한다.

### 왜

연락처를 따로 저장하면 같은 사람의 번호가 명렬표와 연락처 두 곳에 생긴다. 한쪽만 고치는 일은
반드시 벌어지고, 그때 어느 쪽이 맞는지 알 방법이 없다. ADR-046(학기 표시 정본 분리)에서 이미
같은 실수를 했다 — **정본을 정하지 않으면 두 소스가 서로를 덮어쓴다.**

같은 이유로 모바일에도 쓰기를 열지 않았다. 명부를 두 기기에서 고칠 수 있게 하면 동기화가
마지막에 저장한 쪽을 남기는데(LWW), 그건 "누가 맞는가"에 대한 답이 아니다.

### 함께 정한 것 (엑셀 일괄 등록)

- **같은 사람 판정은 `이름 + 휴대폰`이다.** 이름만으로 묶으면 동명이인이 합쳐진다.
  이름이 같아도 번호가 다르면 다른 사람으로 남긴다.
- **덮어쓸 때 `id`·`createdAt`·즐겨찾기는 지킨다.** id가 바뀌면 즐겨찾기 같은 표시가 끊긴다.
- **양식의 예시 줄은 `(예시)`로 시작시키고, 읽을 때 건너뛴다.** 예시를 안 지우고 올리는 일은
  반드시 생기고, 그러면 있지도 않은 교직원이 명부에 남는다.
- **숫자로 저장돼 앞 0이 날아간 번호(1012345678)는 되살린다.** 엑셀이 010을 숫자로 보면
  0을 지운다. 9~10자리 정수만 되살리고, 8자리 이하는 내선·시내번호와 구분이 안 되므로 두지 않는다.

### 상호 참조

- **ADR-046** — 정본을 정하지 않으면 두 소스가 서로를 덮어쓴다 (같은 교훈)
- 규칙 위치: `src/domain/rules/contactRules.ts`, `src/domain/rules/staffContactImportRules.ts`
- 엑셀 입출력: `src/infrastructure/export/StaffContactExcel.ts`

### 후속 (2026-08-21) — 숨김을 되돌리는 화면

결정 5번("정리는 삭제가 아니라 숨김")에는 **구멍이 있었다.** 숨기는 길은 둘인데(학사일정 "삭제",
중복 정리) 다시 꺼내는 길이 없어서, 자료가 남아 있어도 선생님 입장에선 지워진 것과 같았다.
그래서 안내 문구에서 "되돌릴 수 있다"는 말을 한 번 걷어내야 했다(`eb5d7c82`).

- 일정 화면 도구바에 `숨긴 일정 N` 버튼과 `HiddenEventsModal` 을 붙였다.
- `SchoolEvent` 에 `hiddenReason`(`manual` | `duplicate`)·`hiddenAt` 을 선택 항목으로 추가했다.
  **왜 이유를 남기나** — 되돌리기 화면에서 "선생님이 직접 치운 학사일정"과 "중복이라 접힌 구글
  사본"은 되돌렸을 때 결과가 다르다(후자는 달력이 다시 두 줄이 된다). 이유가 없으면 그 차이를
  알려 줄 수 없어 선생님이 모르고 누르게 된다. 옛 데이터에는 없으므로 `unknown` 을 허용한다.
- **되돌리기를 막지 않는다.** 중복 사본을 되돌려 다시 두 줄로 보게 하는 것도 선생님의 선택이다.
  앱이 하는 일은 결과를 미리 알려 주는 것까지다.
- 되돌릴 때 `hiddenReason`·`hiddenAt` 도 함께 지운다 — 다음에 다시 숨길 때 낡은 이유가 붙으면 안 된다.
- 외부 구독 캘린더(`ext:`)는 목록에서 뺀다. 쌤핀이 그 일정을 고쳐 저장할 수 없어 버튼이 있어도
  아무 일이 일어나지 않는다. **못 하는 걸 보여 주지 않는다.**

---

## ADR-065: 자료실 파일은 쌤핀 서버를 지나지 않는다 — 서버는 업로드 세션 주소만 내준다

- **상태**: 확정 · **일자**: 2026-08-21 · **관련**: 온라인 교무실 M3, ADR-062
- **발단**: 계획서 두 조항이 서로 부딪혔다.
  - **§3.2** — 자료는 서버가 **관리자 권한으로 대신 올린다**(과제 제출 기능과 같은 방식).
    `drive.file` 권한이 계정마다 따로 걸리므로, 파일 주인이 관리자가 되어야 멤버 모두가 볼 수 있다.
  - **§3.4** — 서버는 **바이트를 나르면 안 된다.** 무료 등급의 월 전송량 5GB 를 챗봇·상담·과제·
    서명·실시간 게시판이 이미 나눠 쓰고 있어서, 200MB 파일 25번이면 한 달치가 끝난다.

  §3.4-나 는 **내려받기**만 풀어놨다("권한만 주고 빠진다"). **올리기는 계획서에 답이 없었다.**
  §3.4-다 표는 "파일도 미리보기 글자도 안 지나감"이라 적었지만 근거가 되는 건 (나)뿐이었다.

### 결정 — §3.4 의 원칙을 올리기에도 그대로 적용한다

**서버는 바이트가 아니라 권한을 준다.** 올리기에서 그 "권한"은 구글의 **재개 가능 업로드
세션 주소**다.

1. 서버가 관리자 토큰으로 세션을 열고 **부서 폴더 안에만** 쓰이도록 못박은 뒤 주소만 건네준다.
2. 멤버의 쌤핀이 그 주소로 **구글에 곧장** 올린다. 쌤핀 서버를 지나지 않는다.
3. 다 올리면 서버가 **드라이브에 되물어** 이름·크기·부모 폴더를 표(ticket)와 대조하고 등록한다.

세션 주소로 올라간 파일의 주인은 **관리자**가 되므로 §3.2 의 `drive.file` 조건이 그대로 지켜진다.
**새 구글 권한을 요청하지 않는다 — OAuth 재심사가 없다.**

### ★ 3번(대조)을 빼면 관리자 개인 파일이 새어 나간다

멤버가 "다 올렸습니다" 하며 보내는 드라이브 파일 id 를 그대로 믿으면, **관리자 선생님 개인
드라이브의 아무 파일 id** 나 보낼 수 있다. 그 파일이 자료실에 등록되는 순간 §3.4-나 가
부서 멤버 전원에게 읽기 권한을 준다. 그래서 커밋마다 세 가지를 확인한다 —
부서 폴더 안에 있는가 · 이름이 같은가 · 크기가 같은가. 표는 한 번만 쓰이고 하루 뒤 만료된다.
(`staffroomAccess.matchesTicket` · `isTicketUsable`, 테스트 25건)

### 예외 하나 — 미리보기 글자는 서버가 읽어 준다

`drive.file` 은 **앱이 만든 파일만** 열 수 있다. 권한을 받아도 남의 앱이 만든 파일은 API 로
못 읽는다(브라우저로 열리는 것과 다르다). 그래서 검색에 쓸 글자는 서버가 읽어서 내려줄 수밖에 없다.

**§3.4-가 가 금지한 것은 "글자를 서버에 쌓는 것"이고 그건 지켰다** — 글자는 드라이브에 있고
DB 에는 파일 id 만 있다(§3.5 의 366MB 가 사라진 근거 그대로). 지나가는 양도 작다: 부서 하나가
연 300개 파일이어도 글자는 다 합쳐 1.5MB 남짓이고, 각 선생님 PC 가 받아 두고 바뀐 것만 다시 받는다.
**원본 파일은 절대 이 길로 보내지 않는다.**

### 계획서 §11 과 달라진 곳 — 이메일 권한 부여를 클라이언트가 아니라 서버에 뒀다

계획서는 `src/infrastructure/google/GoogleDriveClient.ts` 에 "이메일 지정 권한 부여·회수"를
더하라고 했다. 실제로는 **서버**(`supabase/functions/_shared/staffroomDrive.ts`)에 넣었다.
권한을 줄 수 있는 것은 관리자 토큰을 쥔 쪽뿐인데, 멤버는 관리자가 퇴근한 뒤에도 자료를
내려받는다(§3.3 이 관리자 PC 를 서버로 쓰는 길을 이미 막아 뒀다). 클라이언트에 두면
**부를 수 있는 자리가 없는 죽은 코드**가 된다.

### 딸려 오는 결정 둘

- **멤버를 내보낼 때 내준 권한을 함께 거둔다.** 명단만 지우면 이미 열어본 파일은 계속 열려
  내보낸 것이 아니게 된다. 그래서 `staffroom_file_grants` 에 무엇을 줬는지 남긴다(§10.6).
  올린 파일을 함께 지울지는 관리자가 고르고 **기본값은 남기기** — 부서 자료는 보통 개인 것이
  아니라 업무 산출물이다.
- **새 판을 올려도 이전 판 드라이브 파일을 지우지 않는다**(§8-C). 용량을 먹지만, 업무 문서에서
  "잘못 덮었는데 되돌릴 길이 없다"가 훨씬 비싸다. 용량 표시는 이전 판까지 합쳐서 센다 —
  빼고 세면 화면 숫자와 관리자가 드라이브에서 보는 숫자가 어긋나 "쌤핀이 거짓말한다"가 된다.

## ADR-066: 알림 예약은 출처별로 나누고, 울리기 직전에 정본을 다시 본다 — 할 일 시각 알람

- **상태**: 확정 · **일자**: 2026-08-22 · **계획서**: `docs/01-plan/features/todo-check-alarm-board-mention.plan.md`
- **발단**: 할 일에 시각 알람을 붙이려는데, 알림을 쏘는 자리(`electron/ipc/reminder.ts`)에
  **예약 목록이 배열 하나뿐**이었다. 학생 관찰 기록 알림이 그 배열을 통째로 덮어쓰는 구조라,
  두 번째 생산자가 생기는 순간 서로를 조용히 지운다.

### 결정 1 — 예약 칸을 출처별로 나눈다

`ReminderBuckets = { record, todo }`. `applySchedule(buckets, source, items)` 는 **해당 칸만**
갈아 끼우고, `applyClear(buckets, source?)` 는 출처를 주면 그 칸만 비운다.

- **왜 배열 하나로는 안 되는가**: 실측된 구멍이 이미 있었다. 기록 알림 훅이 스누즈·일시정지 때
  인자 없는 `clearReminderSchedule()` 을 부르는데, 할 일 알람이 붙는 순간 그 한 줄이
  **할 일 알람까지 전멸시킨다.** 자료구조로 막지 않으면 앞으로도 같은 실수가 반복된다.
- **구버전 호환**: 배열이 오면 `record` 로 본다. 예전 렌더러가 출처 없이 배열만 보냈고,
  그때 쓰던 유일한 생산자가 학생 관찰 기록이었기 때문이다.
- **인자 없는 전체 삭제는 남겨 뒀다.** 지우면 구버전 렌더러가 깨진다. 대신 회귀 검사 #59 가
  **새 훅에서** 그 형태를 금지한다.

### 결정 2 — 유예 창·만료·발화 이력의 소유권은 울리는 쪽(main)에 둔다

항목에 `expiresAt` 을 실어 보내고, 지난 것은 발화하지 않는다. 발화 이력은
`userData/notify-state.json`(**`syncRegistry` 미등록**)에 남겨 재시작 후 재발화를 막는다.

- **화면(렌더러)에 두면 안 되는 이유**: 절전 복귀·재시작 중복·콜드 부팅 0건을 **하나도** 못 막는다.
  울리는 주체가 main 인데 판단 근거를 다른 곳에 두면, 그 다른 곳이 없을 때 판단이 사라진다.
- 저장 대상은 **`todo` 칸 스냅샷과 `todo` 발화 이력뿐**이다. `record` 칸은 오늘과 똑같이
  렌더러가 매번 다시 보낸다 — 출시된 동작을 바꾸지 않기 위해서다.

### 결정 3 — `expiresAt` 만으로는 부족하다. 울리기 직전에 정본을 다시 본다

발화 대상이 있을 때만 `todos.json` 을 읽어 _"그 할 일이 아직 있고, 아직 안 끝났는가"_ 를
확인한다. 확인에 실패하면 **울리지 않는다**(안전 쪽으로 넘어진다).

- **막으려는 경로**: 일요일 저녁 휴대폰에서 할 일 완료 → 데스크톱은 꺼져 있음 → 월요일 아침
  아이콘 모습 + 메모리 절약으로 콜드 부팅 → 화면이 파괴돼 있어 스토어를 못 읽음 → main 이
  **금요일 스냅샷으로 발화한다.** `expiresAt` 은 아직 안 지났으므로 통과한다.
- **`expiresAt` 은 시간 축만 막고 상태 축을 못 막는다.** 사용자에게는 "끝낸 일이 다시 울리는 앱"이고,
  이건 "알림이 잦아서 통째로 껐다"로 가는 지름길이다.

### 결정 4 — 알림 창에는 기본적으로 할 일 내용을 넣지 않는다 (오너 결정 2)

`title` 은 `'할 일 알림'` 고정. `body` 는 `alarmTextExposure: 'countOnly' | 'full'` 이 정하고
**기본값은 `'countOnly'`**(= "확인할 일이 1건 있습니다").

- 윈도우 알림은 화면 오른쪽 아래에 그대로 뜬다 — **PIN 잠금과 무관하고**, 바탕화면 위젯 모드나
  교무실 큰 모니터에서도 읽힌다. 그런데 교사는 할 일에 학생 이름을 쓴다("김OO 학부모 상담 회신").
- 선례가 이미 있었다 — 학생 관찰 기록 알림에는 이름 노출 수준 설정(`maskName`)이 있다.
  **이 저장소는 토스트 본문을 개인정보 표면으로 이미 인정했다.**

### 결정 5 — 알람 켬/끔 스위치만 기기 전용으로 뺀다 (오너 결정 1 = ㉰ 절반씩)

`alarmEnabled` 는 `TodoSettings` 가 아니라 `todo-alarm-device-state` 키(**`syncRegistry` 미등록**)에
둔다. 나머지 값(미리 알림 분·하루 상한·기본 시각·문구 노출·예약 지평)은 `settings.json` 안에
그대로 두어 기기 간에 공유한다.

- **왜 켬/끔만인가**: "껐는데 되살아난다"가 위험한 이유는 **되돌리기 1순위 수단이 무력화**되기
  때문이다. 알림에 문제가 생기면 제일 먼저 하는 일이 "설정에서 끄기"인데, 그게 확실히 안 꺼지면
  안전장치가 아니다. 그 위험은 켬/끔에만 해당하고, 미리 알림 분 같은 값은 공유가 오히려 편하다.
- 같은 실패를 이 저장소가 이미 겪었다 — 기기별 값을 동기화 대상 안에 두어 LWW 핑퐁이 났다(ADR-039/040).
  그때 만든 `driveSyncDeviceState.ts` 와 같은 모양을 쓴다. **메타 테스트가 미등재를 강제한다.**

### 결정 6 — "출처당 생산자는 정확히 하나"를 소스 구간 계약 테스트로 지킨다

할 일 알람 훅은 `src/App.tsx` 의 **`MainApp()` 안에만** 둔다.

- **왜 진입점 의존 그래프로는 안 되는가**: 위젯·아이콘·빠른 입력·스티커·멀티설문 공유 창이
  **전부 `index.html` 을 로드하고 같은 번들을 공유**한다. 즉 "무엇을 import 하는가"로는
  이 창들을 **원리적으로 구분할 수 없다.** 그래서 `sidePinEntry.contract.test.ts` 가 쓰는
  **소스 텍스트 구간 단언**을 쓴다 — 함수 구간을 잘라 그 안만 본다.
- **실제로 걸렸다.** 이번 구현 중 훅이 `WidgetApp()` 에 잘못 들어갔다. 그대로 뒀으면 최대 6개
  창이 같은 `'todo'` 칸에 써서 서로를 덮어쓰고, **아무 에러도 안 났을** 것이다.
- 2중 방어로 main 에도 소유 렌더러 교체 경고 로그를 남긴다. **거부하지는 않는다** — 창이
  파괴됐다 다시 생기면 id 가 정상적으로 바뀌므로 거부가 곧 오탐이다.

### 결정 7 — 관측 수단의 정본은 화면이 아니라 로그 파일이다

`userData/notify-diag.log` 에 예약·발화·건너뜀을 남긴다. 설정의 "알림 진단" 패널은 보조 수단이다.

- 패키징된 앱에서 main 의 `console.log` 는 stderr 로 가서 사용자가 볼 수 없다
  (`nativeDesktopDiag.ts` 머리 주석이 같은 사실을 적어 놓았다).
- **★ 진단 패널로는 콜드 부팅을 판정할 수 없다.** 이 패널은 메인 창에서만 보이는데, 메인 창을
  여는 순간 화면이 `'todo'` 칸을 자기 계산으로 덮어쓴다 — **확인하는 행위가 증거를 지운다.**
  그래서 `restoredFromSnapshotAt`·`snapshotItemCount`(렌더러 push 로 덮이지 않는 값)를 따로 두고,
  정본 판정은 로그 파일로 한다.

### 결정 8 — `studentDedupKey` 는 개명하지 않는다

이름이 학생 전용처럼 보이지만 실제로는 출처별 중복 방지 열쇠다. 그래도 그대로 둔다.

- 이 이름이 core·main·preload·렌더러 훅 **4개 층**에 걸쳐 있어 개명이 곧 4층 동시 수정이다.
- 실제 키 형식(담임반 `{sid}:{date}` · 수업반 `subject:{clsId}:{today}`)에 출처 접두가 없어
  **이름만 바꾸면 잘못된 안전감을 준다.** 출처는 별도 인자로 넘긴다.

### 함께 정한 것 — 모바일은 보기만 한다

"다시 확인할 날"과 관련인은 모바일에서 **표시만** 하고 편집 UI를 두지 않는다. 연락처 화면이
이미 같은 이유로 읽기 전용이다 — 같은 명부를 두 곳에서 고치면 어느 쪽이 맞는지 알 수 없게 된다.
다만 모바일의 완료 체크·삭제·보관은 할 일 파일을 **통째로 다시 쓰므로**, 데스크톱 전용 항목이
그 과정에서 사라지지 않는지를 테스트로 잠갔다(`useMobileTodoStore.localFields.test.ts`).

### Consequences

- **되돌리기**: 1순위는 설정에서 알람 끄기 → `clearReminderSchedule('todo')` 로 todo 칸만 비고
  record 칸은 그대로다. **켬/끔이 기기 전용이라 다른 기기가 되살리지 못한다**(결정 5의 목적).
  2순위는 M4-(b) 커밋만 revert — 기록 알림이 병합 이전 상태로 완전 복구되고, 남은 (a)는
  동작이 같으므로 어중간한 상태가 아니다. **electron main 변경이라 재시작이 필요하다.**
- **남는 파일**: `userData/notify-state.json`·`notify-diag.log`. 구 코드가 읽지 않으므로 무해하다.
  이미 발화한 토스트는 되돌릴 수 없다.
- **게이트의 한계**: `npm run lint` 의 글롭이 `src/**` 뿐이라 **이 결정이 만든 electron 파일 4개는
  lint 를 통과하지 않는다 — 검사되지 않기 때문이다.** `npx tsc --noEmit` 도 `include: ["src"]`
  라서 electron 을 보지 않는다. 게이트 4종 중 electron 코드를 **실제로 실행하는 것은
  `npm run test` 뿐**이고, 타입은 `node scripts/build-electron.mjs` 로 따로 확인해야 한다.
- **자동 검사가 없는 판정**: 콜드 부팅(시작 모습 3종 × 메모리 절약 ON)과 실제 토스트 확인.
  실기기와 로그 파일 육안 확인이 유일한 수단이다.
- **보증 범위**: 콜드 부팅 보증은 **할 일 알람에만, 그리고 메모리 절약이 켜졌을 때만** 의미가 있다.
  꺼져 있으면 메인 창이 `hide()` 만 되어 화면이 숨은 채 살아 있다.
  **기록 알림은 오늘과 동일하게 렌더러 의존이다** — 이번 결정의 대상이 아니다.

## ADR-067: 쌤핀 AI는 직전 대화를 함께 싣는다 — §8.2(단발 질문) 뒤집음

- **상태**: 확정 · **일자**: 2026-08-23 · **발단**: 오너 실사용 신고
- "오늘 할 일 있나" → "8개" → "어떤 일인지 알려줘"에 모델이 **앱 소개**로 답했다.
  §8.2 는 질문 하나만 보내는 설계였는데, 화면은 대화가 쌓이는 모양이라
  **화면이 약속한 것(이어지는 대화)과 실제 동작(매번 초면)이 어긋났다.**

### 결정 1 — 직전 대화(질문 + 답변)를 함께 보낸다

`buildHistoryTurns()` 가 완료된 턴만 골라 [질문, 답변, …, 현재 질문] 으로 싣는다.
서버 한도(턴 12 · 턴당 2,000자 · 전체 8,000자)는 앱이 거울값(`ASSIST_SEND_LIMITS`)으로
먼저 자르고, 넘치면 **오래된 대화부터** 떨어뜨린다. 거울값이 서버 `LIMITS` 와 어긋나면
테스트('서버 한도와 같은 값이다')가 잡는다.

- **개인정보가 늘지 않는 근거**: 질문은 보낼 때 이미 나갔던 원문이고, 답변은 별칭이
  살아 있는 수신 원문(`outboundAnswer`)만 싣는다. **화면용 답변(`answer`)은 별칭을
  실명으로 되돌린 것이라 절대 싣지 않는다** — 테스트로 고정("이력으로 다시 나가는
  답변도 별칭 그대로다").
- 막힌 턴(blocked)은 이력에서 뺀다 — 서버가 같은 검사를 다시 하므로 또 거절된다.

### 결정 2 — 카드 없는 후속 질문에는 직전 턴의 (가려진) 카드를 다시 싣는다

"어떤 일인지 알려줘"는 의도 규칙에 안 걸려 카드가 없다. 직전 답의 근거 숫자를
모델이 다시 봐야 하므로 직전 턴의 `outboundCards` 를 재전송한다. 이미 한 번 나간
가려진 자료라 새 노출은 없다.

### 함께 고친 것 (같은 신고 묶음)

- 목록형 카드(할 일)가 백지였다 → 카드가 목록(`items`)도 그린다. `undone`(미완료 건수)
  집계를 추가해 AI 의 "N개"를 카드로 대조할 수 있게 했다.
- 모델이 지난 기한(8/19)을 "남아 있다"고 답했다 → 서버 지시문에 **오늘 날짜(Asia/Seoul)**
  를 넣고(`buildAssistSystemPrompt`), 앱이 `overdue` 를 계산해 사실로 보낸다.
  날짜 판단을 모델 추측에 맡기지 않는다.
- 입력칸 예시가 되지 않는 것("3학년 2반 출결")을 권했다 → "우리 반 출결"로 교체.
  출결 기록 자체가 담임 반 단위라 다른 반 출결은 보여줄 데이터가 없다.
  예시가 의도 규칙에 걸리는지 테스트가 지킨다.
- 진행 중 재전송 가드(이력이 반쪽으로 실림 방지), 새 대화 버튼(주제 전환 시 이력 리셋),
  자동 스크롤, "나갈 문장" 빈 문구 교정.

---

## ADR-068: 교무실 글쓰기 편집기는 Lexical — 계획서의 TipTap 추천을 뒤집는다

**결정일**: 2026-08-23 · **관련**: `docs/01-plan/features/online-staffroom.plan.md` §5.2

### 무엇을 정했나

온라인 교무실 게시판의 글쓰기 편집기로 **Lexical**(MIT, Meta)을 쓴다.
계획서 §5.2 는 TipTap 을 권했으나 **이 항목만 뒤집는다.**

### 왜 — 한글 입력

계획서는 라이선스·확장·붙이는 기간으로 TipTap 을 골랐고, **한국어 입력을 확인하지
않았다.** 쌤핀 사용자는 전원 한글로 글을 쓴다.

GitHub 이슈 제목 검색으로 세어 본 한글·CJK 결함 처리 현황(2026-08-23 조회):

| 편집기     | 미해결 | 해결됨 |
| ---------- | ------ | ------ |
| Lexical    | 2      | 24     |
| Quill      | 4      | 10     |
| **TipTap** | **5**  | 2      |

TipTap 의 미해결 건에 **"한글 입력 중 엔터를 치면 마지막 글자가 사라진다"**
(`ueberdosis/tiptap#4108`, 2023-06 신고 · 3년째 열림, 같은 증상 재신고 `#5605`)가
있다. 뿌리인 ProseMirror 쪽 같은 건(`ProseMirror/prosemirror#1484`)은 2024-08 에
닫혔지만 TipTap 쪽은 남아 있다. 반면 Lexical 은 2026-05~06 에도 한글 IME 결함을
연달아 닫았다(`#8679`·`#8596`·`#8475`).

선생님이 글을 쓰다 글자를 잃는 것은 기능 하나가 덜 예쁜 것과 급이 다르다.

### 감수하는 것

Lexical 은 **공식 이미지 확장이 없다**(`@lexical/image` 는 존재하지 않는 이름이다).
플레이그라운드의 `ImageNode` 를 우리 저장소로 복사해 쓰는 것이 현재의 표준 방식이다.
TipTap 은 `@tiptap/extension-image` 를 공식 제공하므로 이 항목만은 TipTap 이 낫다.

그럼에도 Lexical 을 고르는 이유: 교무실에서 이미지의 어려운 절반은 **구글 드라이브에
올리고 남이 열게 해주는 부분**이고 그건 편집기 밖(자료실 `staffroom-library`)에 이미
있다. 편집기가 할 일은 "이 주소의 그림을 보여줘"까지라 복사해 온 노드로 충분하다.

또한 Lexical 은 0.x 라 판올림 때 쓰는 법이 바뀔 수 있다. 편집기를 화면 여러 곳에
흩지 말고 컴포넌트 하나 뒤에 가둬 갈아끼울 여지를 남긴다.

### 덧붙임 (2026-08-23) — 실측으로 확인, 그리고 함정 하나

도입 후 Chrome 의 실제 입력기 경로(CDP `Input.imeSetComposition`)로 자모 단계까지
조합해 확인했다. TipTap 이 깨지는 자리(조합 중 엔터·조합 중 백스페이스·여러 줄·
서식 섞기·실행취소) 7종 전부 정상. **판단이 실측으로 뒷받침됐다.**

다만 **기존 메모 편집기(MemoRichEditor)의 툴바 방식을 그대로 베끼면 안 된다.**
메모는 브라우저 기본 기능(`document.execCommand`)이라 `onMouseDown` 에서 명령을
보내야 맞지만, Lexical 은 선택 영역을 자기가 들고 있어 그러면 엉뚱한 글자에 걸린다.
반대로 `onMouseDown` 을 안 막으면 단추가 초점을 뺏어 첫 누름이 무시된다.
**초점 뺏기만 막고(onMouseDown), 명령은 onClick 에서** 보내야 한다.
두 실패 모두 브라우저에서만 드러나므로 `StaffRoomRichEditor.render.test.tsx` 로
구조를 못박아 뒀다.

### 하지 않는 것

- 파일 첨부를 편집기 기능으로 기대하지 않는다 — 어느 편집기도 해주지 않는다.
  "올리기 → 주소 받기 → 글에 붙이기"의 조합이고 앞의 둘은 이미 있다.
- `@lexical/file` 을 첨부용으로 오해하지 않는다 — 편집기 내용을 파일로
  내보내기/불러오기용이다.
- TipTap 유료 확장(AI·협업)은 애초에 쓰지 않으므로 비용 판단에 넣지 않았다.

---

## ADR-069: 교무실 본문은 형식 칸을 따로 둔다 — 편집기 구조로 저장하고, html·markdown 은 쓰지 않는다

**결정일**: 2026-08-23 · **마이그레이션**: `053_staffroom_body_format.sql`

### 무엇을 정했나

`staffroom_posts`·`staffroom_comments`·`staffroom_drafts` 에 `body_format` 칸을
두고 값을 **`plain` | `lexical`** 로 제한한다. 기본값은 `plain`.

- `plain` — 맨글. 이 칸이 생기기 전 글과, 편집기가 붙기 전 글이 전부 여기다.
- `lexical` — 편집기가 만든 구조를 그대로 담는다.

### 왜 지금 — 편집기보다 먼저

본문이 글자 덩어리 하나뿐이면 화면이 "이 글을 어떻게 읽어야 하는지" 판단할 근거가
없다. 서식 편집기를 붙이는 순간 `**굵게**` 가 기호째 보이거나, 반대로 옛 글에 우연히
든 `*` 가 갑자기 서식으로 해석된다.

칸을 나중에 넣으면 쌓인 글을 전부 훑어 고쳐야 한다. **아직 아무도 쓰지 않는 지금이
값싸게 넣을 수 있는 유일한 시점이라, 편집기 도입과 분리해 먼저 박았다.**

### 왜 markdown 이 아닌가 (2026-08-23 오너 결정으로 뒤집음)

처음에는 마크다운으로 정했다. 그런데 오너가 원한 화면에 **글자색과 글자크기**가
있고, **마크다운에는 그 둘을 적을 방법이 아예 없다.** 굵게·기울임·취소선까지는
되지만 색과 크기에서 막힌다.

선택지는 둘이었다 — (가) 마크다운을 쓰고 색·크기를 포기한다, (나) 편집기 구조를
그대로 저장한다. **오너가 (나)를 골랐다.** 053 이 아직 배포 전이라 새 마이그레이션을
더하지 않고 그 자리를 고쳤다.

감수하는 것: 저장된 글이 편집기 형식에 묶인다. 편집기를 갈아끼우면 변환이 필요하다.
그래서 편집기는 `StaffRoomRichEditor` 하나 뒤에 가두고, **읽는 쪽은 도메인 순수
함수**(`staffRoomRichText.ts`)로 빼서 편집기 없이도 글을 읽을 수 있게 했다.

### 왜 html 이 아닌가

교무실은 **남이 쓴 글이 내 화면 안에서 펼쳐지는 쌤핀 최초의 기능**이다. 옆핀 메모는
내가 쓰고 나만 보므로 위험이 나에게 갇히지만, 교무실은 그렇지 않다.

html 을 저장하면 소독 도구가 필요한데 앱에 없다(`DOMPurify` 미도입). 대신 이미 검증된
경로가 있다 — `RealtimeWallCardMarkdown.tsx` 의 react-markdown 화이트리스트 렌더.
학생이 쓴 글을 교사 화면에 안전하게 띄우려고 만든 것으로 상황이 같고, 공격 문자열
퍼즈 테스트와 회귀 #7(`dangerouslySetInnerHTML` 부재) 가드가 붙어 있다.
옆핀 메모(`memoRules.ts`)도 마크다운으로 저장하므로 앱 안에 길이 하나로 모인다.

053 의 CHECK 제약이 `html` 을 아예 저장할 수 없게 막고, 메타 테스트가 그 사실을
못 박는다(`staffroomBodyFormat.meta.test.ts`).

### 세 표 모두에 넣은 이유

본문을 저장했다 다시 펼치는 자리는 글·댓글·임시저장 셋이다. 임시저장은 글 본문 그
자체라 형식이 왕복하지 않으면 이어 쓸 때 서식이 풀린다. 댓글은 서식 계획이 없지만
칸 하나 값이 한 줄인 데 비해 나중에 마이그레이션을 또 만드는 값이 훨씬 크다.

### 서버가 클라이언트를 믿지 않는다

`normalizeBodyFormat()` 이 아는 값이 아니면 조용히 `plain` 으로 떨어뜨린다.
모르는 값을 그대로 넣으면 DB CHECK 에 걸려 저장이 실패하고, 사용자에게는
"글이 안 올라간다"로 돌아온다. 덜 꾸며지는 편이 글을 잃는 것보다 낫다.

## ADR-070: 새 대형 기능은 "실험실 기능"으로 내보낸다 — 쌤핀 AI·온라인 교무실·쿨메신저

**결정일**: 2026-08-24 (오너 지시) · **적용**: v2.4.4 릴리즈 전

### 무엇을 정했나

v2.4.4 의 세 대형 신기능(쌤핀 AI, 온라인 교무실, 쿨메신저 가져오기)은 설정의
새 탭 **"실험실 기능"(`labs`)** 에서 사용자가 직접 켜야만 진입점이 나타나고
동작한다. 기본은 전부 꺼짐.

### 어떻게 잠갔나 — 스위치는 기존 것을 재사용

- **쌤핀 AI**: 기존 `useAssistStore.enabled`(persist) 그대로. 카드만
  `ai-bridge` 탭 → `labs` 탭으로 이동. 켜기 전 개인정보 고지 흐름 불변.
- **쿨메신저**: 기존 `settings.coolMessengerImportEnabled` 그대로. 섹션만
  `calendar` 탭 → `labs` 탭으로 이동.
- **온라인 교무실**: 게이트가 없었으므로 `settings.staffRoomEnabled?`(optional,
  기본 꺼짐)를 신설. 잠근 자리 4곳 — ① 사이드바 메뉴, ② `staffroom` 라우트
  (직접 진입 시 안내 화면 + "실험실 기능 열기" 단추), ③ 설정>사이드바의
  표시/숨김 목록, ④ 일정·할 일의 부서 겹쳐 보기 훅(`useStaffRoomPlanOverlay`) —
  꺼져 있으면 **서버 요청 자체를 보내지 않는다**.

### 왜 스위치를 새로 통일하지 않았나

쌤핀 AI 의 켜짐은 "개인정보 고지를 확인한 순간"과 한 동작이어야 해서 즉시 적용
(zustand persist)이고, 나머지 둘은 다른 설정과 같은 초안(draft)+[저장] 방식이다.
셋을 한 저장소로 합치면 고지 흐름이 깨지거나 저장 의미가 갈라진다. 탭 하나로
모으되 저장 방식의 차이는 `LabsTab.tsx` 머리 주석에 명시했다.

### 계약 갱신

설정 탭 id 스냅샷(`settingsTabIds.test.ts`)에 `labs` 추가(20개). 기존 탭 id 는
불변이라 딥링크·/docs·챗봇 KB 는 깨지지 않는다. /docs 사용자 가이드의
쌤핀 AI·온라인 교무실 경로 안내를 "설정 > 실험실 기능"으로 같은 작업 단위에서 갱신.

## ADR-071: 임시저장은 말머리·태그·첨부를 배열 칸으로 함께 보관한다 — 자동 저장은 검증 실패로 끊지 않는다

**결정일**: 2026-08-24 · **마이그레이션**: `056_staffroom_draft_taxonomy.sql` · **발단**: v2.4.4 UltraQA P1

### 무엇을 정했나

교무실 임시저장(`staffroom_drafts`)이 제목·본문에 더해 **말머리(`category_id`)·
해시태그(`tags`)·첨부(`file_ids`)** 를 함께 보관하고 왕복시킨다. 이로써
"쓰시던 글을 불러왔어요" 배너가 사실이 된다 — 임시 조치였던
"말머리·태그·첨부는 다시 골라주세요" 문구는 걷어냈다.

### 결정 1 — 별도 표가 아니라 배열 칸이다

글은 태그·첨부를 별도 표(054·055)에 둔다 — 태그로 찾기, 부서 단위 정리,
"지워진 파일" 표시가 있어서다. 임시저장에는 그 일이 하나도 없다. 사람×게시판마다
한 행뿐이고 검색·집계 없이 글쓰기 화면과 왕복만 하므로, 표를 나누면 자동 저장
한 번이 표 세 개짜리 트랜잭션이 될 뿐 얻는 게 없다. `tags TEXT[]`·`file_ids UUID[]`.
배열 원소에는 FK 를 걸 수 없지만, 지워진 파일은 복원 화면이 알리고 게시 시점에
`staffroom-posts` 의 부서 자료실 대조가 걸러낸다. 말머리만 FK(ON DELETE SET NULL,
054 와 같은 이유 — 말머리를 지웠다고 쓰다 만 글이 사라지면 사고다).

### 결정 2 — 자동 저장은 말머리 검증에 실패해도 끊지 않는다 (게시와 다르다)

서버는 여전히 앱을 믿지 않는다 — 말머리는 `categoryBelongsTo` 로 이 부서 것인지
확인하고, 첨부 id 는 UUID 모양만 통과시킨다(`staffroom-posts` 와 같은 규칙).
다만 게시(`staffroom-posts`)는 남의 부서 말머리에 **403 으로 끊는** 반면, 자동
저장은 **말머리만 떼고 저장한다.** 글 쓰는 중 관리자가 말머리를 지우는 일은
정상 흐름인데, 그때 자동 저장이 통째로 실패하면 제목·본문까지 잃는다 — 그게
이 기능이 막으려는 바로 그 사고다. 화면에 오류를 보여줄 수 없는 배경 동작은
안전한 쪽(부분 저장)으로 넘어진다.

### 결정 3 — updateDraft/discardDraft 는 게시판 id 를 인자로 받는다 (이원화 해소)

전에는 `loadPosts` 가 채워 두는 전역 `context.moduleId` 를 읽었다. 그러면 자동
저장의 목적지가 "누가 먼저 목록을 열었는가"에 묶인다 — 목록을 연 적 없이
글쓰기부터 하면 기본 게시판으로 흘러갔다. 글쓰기 화면은 자기 게시판 id 를 알고
있으므로 직접 넘긴다. 스토어 테스트가 "목록을 연 적 없어도 인자로 받은 게시판에
저장한다"를 못박는다(`useStaffRoomBoardStore.draft.test.ts`).

### 함께 고친 것 — 복원은 "불러오기 완료 직후 딱 한 번"이다

복원 effect 가 스토어의 draft 값들을 지켜보고 있었는데, 그 값들은 `updateDraft` 가
**타자마다** 갱신한다 — 글자를 칠 때마다 편집기가 다시 만들어져 커서가 맨 앞으로
튀고, 안 불러온 것도 "불러왔어요" 배너가 뜰 수 있는 구조였다. 편집기 seed 설명의
의도("내용이 통째로 바뀌는 순간에만")대로, 복원 시점을 `loadDraft` 완료에 못박았다.

### 서버·DB 왕복 계약

- get/save 응답에 `categoryId`·`tags`·`fileIds` 가 실린다. 제목·본문이 모두 비면
  임시저장을 지우는 규칙은 그대로다 — 태그·첨부만 골라 둔 상태는 잃어도 싼 것들이다.
- 메타 테스트 `staffroomDraftTaxonomy.meta.test.ts` 가 056 의 SET NULL(CASCADE 금지)·
  NOT NULL 기본 빈 배열·멱등·격리 불변(GRANT 없음)을 못박는다.

---

## ADR-072: 생기부 초안을 쌤핀 AI로 옮긴다 — 막는 자리는 프롬프트가 아니라 입력이다

**결정일**: 2026-08-24 (오너 결정) · **상태**: active · **실측 근거**: `docs/03-analysis/record-draft-solar-quality.analysis.md`

### 발단

생기부 초안을 쓸 수 있는 경로가 **AI 브릿지(MCP)뿐**이라 진입 장벽이 높다(외부 AI 앱
설치 + MCP 설정 + 고위험 토글). 오너가 (1) 근거는 교사 관찰·학생 과제물과 교사 평가·
학생 자기평가서 **세 가지가 유기적으로 결합**해야 한다는 요구와 (2) 쌤핀 AI(`solar-pro3`)로
품질이 나오는지 먼저 재 보자는 판단을 함께 제기했다.

### 결정 1 — 시스템 프롬프트는 저장소 밖으로 뺀다

쌤핀 기본 프롬프트는 지금 엣지 함수 소스(`supabase/functions/_shared/assistRequest.ts`
`buildAssistSystemPrompt`)에 있고, **`pblsketch/ssampin` 저장소는 PUBLIC 이다.**
"서버에서 실행된다"와 "노출되지 않는다"는 다르다 — 소스는 누구나 읽을 수 있다.

→ 프롬프트 본문을 서버 환경변수 또는 DB 로 옮기고 **코드에는 불러오는 부분만** 남긴다.
저장소 비공개 전환은 하지 않는다(과거 `repo-privatization` 취소 이력).

**부수 규칙**: 생기부 프롬프트가 담긴 문서·측정 하네스는 저장소 안에 두지 않는다.

**한계(2026-08-24 구현 시 확인)**: 이 조치는 **앞으로의 노출만** 줄인다. 옛 프롬프트 본문은
git 히스토리에 그대로 남아 있어 과거 커밋을 열면 읽힌다. 되돌리려면 히스토리 재작성이
필요한데 공개 저장소에서 이미 배포된 이력이라 실익이 없다고 판단했다.

### 결정 2 — 생기부 초안을 쌤핀 AI(인앱)로 쓸 수 있게 한다

지금은 `ALLOWED_GRADES = [1]` 이 막고 있고 생기부 도구는 **의도적으로 미등록**이다
(`assistToolRegistry.ts:26`). 이걸 연다.

⚠️ **이는 ADR-061 결정 7이 "영구 경계"로 못 박은 것을 뒤집는 것이다.** 구현 시:

- `assistToolRegistry.contract.test.ts` · `assistServerRequest.test.ts` 두 계약 테스트가
  빨간불이 된다. **끄지 말고**, 무엇이 새로 열리는지 드러낸 뒤 갱신한다(그게 이 테스트의 목적).
- ADR-061 결정 7을 대체하는 별도 ADR 을 그때 남긴다.
- 무료 티어는 보낸 내용이 학습에 활용되고 옵트아웃이 없다(업스테이지 약관 제22조).
  **이 사실을 쉬운 한국어로 교사에게 고지**하는 것은 유지한다.

### 결정 3 — 프롬프트는 2층이다 (쌤핀 기본 + 교사 커스텀)

1층=쌤핀 기본(안전·규정·사실기반, 서버가 붙임, 교사가 못 바꿈),
2층=교사 커스텀(문체·관점·서술 구조, 앱에서 입력·수정).

구현 시 서버 요청 계약(`assistRequest.ts` `ALLOWED_REQUEST_KEYS` 5개 고정)에
커스텀 프롬프트용 키를 여는 작업이 필요하다. **모르는 키는 400** 이므로 조용히 안 통한다.

### 결정 4 — 교사 커스텀은 자유 입력이되, 위험 지시를 저장 시점에 차단한다

실측 E 사례에서 **교사 지시 두 줄이 안전 규칙을 이겼다** — 1층에 "교사 지시보다 우선한다"를
명시했는데도 한도의 4배(7,156B)를 창작으로 채웠다. 자유 입력창을 그냥 열면 안전장치가
무력화된다.

세 갈래(자유+출력검사 / 선택지 조합 / 자유+지시 사전차단) 중 **자유 + 사전차단**을 택했다.
선택지 조합은 정교한 지시를 못 담아 커스텀의 가치를 버리고, 출력 검사는 C 사례에서
이미 뚫리는 것이 확인됐다.

차단 대상은 실측에서 실제로 사고를 낸 두 종류다 — **분량 강제**("반드시 채워라"),
**근거 무시**("근거 없어도 써라"). 여기에 **학생 실명 유입 차단**을 더한다(자유 입력창이라
교사가 무심코 적을 수 있다 — 앱의 이름 자동 삭제 장치 재사용).

### 결정 5 — 막는 자리는 출력이 아니라 입력이다 ★

실측 C 사례가 **2/2 → 보강 후에도 2/2 실패**했다. 근거에 섞인 수상·어학 점수·학원명·
모의고사 등급·부모 직업을 시스템 프롬프트에 전부 열거하고 사용자 턴 끝에 다시 강조해도
세특 본문에 그대로 옮겨 적었다. **프롬프트로는 안 막힌다.**

→ 금지 항목이 **모델까지 가지 않게** 한다. 근거 창고(`RecordEvidence`) 단계에서 자동
탐지해 "AI 전송 제외"로 표시하고, 교사가 켜고 끌 수 있게 한다(오탐이 기능을 죽이지 않도록).
브릿지의 고위험 어휘 사전(`packages/core/src/grounding.ts`)을 재사용한다.
**바이트 한도도 코드에서 자른다**(`resolveAreaLimit` 기존).

**부수 발견**: 근거 인용 지시는 **사용자 턴 끝**에 두면 지켜진다(B 사례 0/2 → 2/2).
시스템 프롬프트에만 적으면 묻힌다.

### 결정 5-b — 최종 관문은 **초안 저장 시점**이고, 막지 않고 경고만 한다 (2026-08-25 보정)

구현 중 드러난 것: 제외 표시는 근거 창고(RecordEvidence)에만 붙는데, 근거 대부분은 관찰기록에서
끌어온 **사본**이라 원본이 `get_observations` 로 그대로 나간다. 같은 문장이 다른 문으로 샌다.

**오너 결정**: 관찰기록이 AI 에 가는 것은 괜찮다(개인식별정보는 `deidentify` 가 이미 마스킹한다 —
실명·전화·주민번호·생년월일·학번·이메일). **거르는 자리는 "최종 생기부 초안을 만드는 단계"면 된다.**
→ 관찰기록 축에는 제외 표시를 만들지 않는다(재론 금지).

**★단, 그 검사는 코드여야 한다.** "초안 쓸 때 금지 항목은 빼라"는 프롬프트 지시는 실측에서
2/2 실패했다. 그래서 초안이 **저장되는 순간** 코드가 본다 — 본체 `useRecordDraftsStore.upsert`
(교사 입력·브릿지 live-sync 공통 관문)와 브릿지 `validateRecordDraft`(앱 닫힘 직접쓰기) 양쪽.

**★기존 `checkGrounding` 은 이걸 못 잡는다.** 그건 "근거에 없는 말을 지어냈나"를 보는 검사라,
관찰기록에 "최우수상"이 실제로 있으면 **근거가 확실하다며 통과**시킨다. 정확히 반대로 동작한다.
그래서 근거 유무와 무관한 별도 검사(`hasProhibitedRecordItem`)를 뒀다.

**★막지 않고 `prohibited_item` flag 만 단다**(오너 결정). 모든 초안은 교사 최종 검토가 강제되고
(`requiresTeacherReview`), 자동 판정은 오탐이 난다. 막으면 "체육대회 참여" 같은 정상 서술까지
못 쓰게 된다. 화면에는 가장 높은 등급(빨강)으로 띄우고 **무엇이 걸렸는지 갈래까지** 적어 준다.

**릴리즈 노트 문구 주의**: "금지 항목을 걸러 준다"가 아니라 **"금지 항목이 있으면 눈에 띄게
알려 준다"** 가 사실이다. 최종 책임은 교사 검토에 있다.

### 결정 6 — 관찰 슬롯은 "쌓는 순간"에 붙인다. 학기말 정리 작업은 만들지 않는다

오너 요구는 **"평소에 꾸준히 기록을 누적하는 것"** 이다. 초안 설계였던 "관찰은 자유서술로
빠르게 쌓고 학기말에 창고에서 슬롯 분류" 는 **폐기한다** — 큰 배치 작업을 만들면 교사가
피하고, 그러면 기록이 안 쌓여 AI 도 소용없다.

- 슬롯(질문 / 시도·선택 / 시행착오 / 산출물 / 교사와의 주고받음 / 다른 교과 연결)은
  **관찰기록의 태그 축을 넓히는 것으로 구현한다.** 새 필드·저장 구조 변경·브릿지 계약
  변경이 없다 — 태그는 이미 자유 문자열이고 `get_observations` 가 탈식별해 노출한다.
- **기록 하나 = 순간 하나 = 슬롯 하나.** 늘어나는 동작은 칩 한 번 탭이고, 학기가 지나면
  슬롯이 저절로 찬다.
- **메워야 할 구멍**: `RecordEvidence` 에는 태그 자리가 없어 창고로 끌어올 때 슬롯이
  사라진다. AI 가 초안을 쓸 때 읽는 것은 창고 쪽(`get_record_evidence`)이므로 필드를 더한다.
- 관찰기록 알림을 슬롯 인지형으로 바꾼다("질문 5건인데 시행착오 0건"). 누적을 실제로
  끌고 가는 장치가 된다. 프리셋(가볍게·보통·꼼꼼히)은 그대로 둔다.

⚠️ 태그 칩이 4개 → 11개로 늘어나는 입력 화면 변경은 **프론트엔드 디자인과 함께 정한다**
(단독 결정 금지).

### 결정 7 — 세 번째 근거(학생 자기평가서)는 학생 웹앱을 재사용한다

세 근거 중 **학생 자기평가서만 없다**(엔티티 검색 0건). 설문(`Survey`·`MultiSurvey`)은
학급 단위 응답 수집이라 "학생 개인 → 생기부 근거" 로 이어지지 않는다.

기존 학생용 웹앱(`student.html` → `src/student/`, 참여 링크·본인 확인·PIN·제출 폼)과
과제의 `shareUrl`/`shortUrl` 방식을 그대로 쓴다. 제출분은 `RecordEvidence` 에
`sourceType: 'selfAssessment'` 로 자동 적재하고 **같은 슬롯 축**을 쓴다 — 교사가 본 질문 /
학생이 쓴 질문 / 과제에 드러난 질문이 한자리에 모이는 것이 "유기적 결합"의 실제 모습이다.

### 남은 한계 (이번 결정에 포함되지 않음)

- 과제물 **본문 텍스트**가 앱에 안 들어온다(드라이브에만 있음). 기존 한계 그대로.
- `record-evidence.json` 이 **동기화 대상 34개에 없다**(`syncRegistry.ts`). 보관함에는
  있다(`archiveScope.ts:35`). 초안은 기기 간에 넘어가는데 재료는 안 넘어간다.
- `RecordDraft` 에 학년도·학기 칸이 없어 학년이 바뀌면 덮어쓴다.
- 성취기준 데이터가 없다(진도에 `unit`·`lesson` 만 있음).

---

## ADR-073: Drive 동기화는 3방향 판정과 v2 네임스페이스로 간다 — 장부만 보고 충돌을 만들지 않는다

**결정일**: 2026-08-24 · **상태**: active · **근거**: 34개 동기화 항목 전수점검(재현 테스트 포함)

### 발단

"PC에서만 진도를 고쳤는데 휴대폰이 충돌을 띄운다"는 신고에서 시작해 34개 동기화 항목
(정적 30·동적 4)을 전수 점검했다. 진도만의 문제가 아니었다 — 기존 테스트 327개가 모두
통과하는 상태에서 **일반 파일 26종이 같은 오판**을 하고 있었고, 학생 사진은 새 기기에서
아예 내려오지 않았다.

### 결정 1 — 충돌 판정은 기준점·로컬·원격 3방향으로 통일한다

기존 코드는 **로컬 장부 체크섬(B)과 원격 체크섬(R)만** 비교했다. B는 "마지막으로 맞춘
기준점"이므로 원격만 바뀌어도 B≠R 이 되고, 그걸 충돌로 올렸다. 실제 로컬 파일의 체크섬(L)을
함께 봐야 한다.

| 상태                         | 의미                   | 동작                              |
| ---------------------------- | ---------------------- | --------------------------------- |
| `L == B`, `R != B`           | 원격만 변경            | 정책과 무관하게 자동 수신         |
| `L == R`, `B != R`           | 이미 수렴, 장부만 낡음 | 장부만 전진                       |
| `L != B`, `L != R`, `R != B` | 실제 양쪽 변경         | 충돌(사용자 선택)                 |
| `L != B`, `R == B`           | 로컬만 변경            | 다운로드 생략, 다음 업로드에 실림 |

판정은 `syncThreeWay.ts` 한 곳에 두고 진리표 테스트로 고정한다. **파일별 예외를 다시
만들지 않기 위해서다** — 진도만 고쳤던 것이 이번 사고의 원인이었다.

⚠️ PC 기본값인 "최신본 사용"도 **실제 동시 변경에서는 자동으로 덮지 않는다.** 기존
비교 대상이 로컬의 실제 수정 시각이 아니라 장부 시각이어서, 새로 입력한 내용이 조용히
사라질 수 있었다.

### 결정 2 — 마지막 저장 직전에 한 번 더 확인한다 (CAS + 단일 작업 잠금)

다운로드 중에 교사가 같은 화면을 고치면 받은 내용이 새 입력을 덮는다. 저장소 포트에
"읽은 값 그대로일 때만 교체"(`replaceIfUnchanged`·`replaceBinaryIfUnchanged`)를 추가하고,
충돌 해결·사진 저장·학년도 전환을 `dataOperationMutex` 로 직렬화한다.

### 결정 3 — 삭제·복원은 시각이 아니라 세대 식별자로 판정한다

기기 시계는 어긋난다. 학생 사진의 삭제 표식과 복원 표식에 **어느 삭제 세대를 취소하는지**를
식별자로 기록한다(`replacesDeletionId`). 같은 세대만 복원이 이기고, 다른 기기의 새 삭제
세대는 오래된 복원을 항상 폐기한다.

### 결정 4 — Drive 파일·장부 이름을 `v2--` 로 분리한다

구버전 앱은 같은 폴더 ID를 계속 잡고 있으므로, 새 규약을 이해하지 못한 채 파일을 덮어쓸 수
있다. 물리 이름을 `v2--` 로 나눠 **구버전이 새 파일을 알지도 만지지도 못하게** 한다.

이전(migration)은 v1 원본을 **지우지 않고 복사만** 하고, 대상 파일이 이미 있으면
**덮어쓰지 않고 그 본문을 채택**한다. 두 기기가 동시에 이전해도 서로의 결과를 PATCH 로
지우지 않는다. 동시 생성된 장부는 양쪽이 **같은 승자(id 순 첫 번째)** 를 고르고 자기 것만
정리한다 — 각자 상대를 지우면 장부가 통째로 사라진다.

⚠️ **트레이드오프(사용자 영향)**: 업데이트하지 않은 기기는 v1 자료를 계속 보므로 기기 간
내용이 갈라진다. 자료가 사라지지는 않지만 **모든 기기를 업데이트해야 한다.**
`/docs` 사용자 가이드(Google Drive 동기화 → "기기마다 쌤핀 버전을 맞춰 주세요")에 안내를 넣었다.

### 결정 5 — 부분 실패는 되돌린다

사진 여러 장 저장이 중간에 끊기면 이미 쓴 파일을 저장 직전 상태로 되돌린다(없던 파일은
삭제, 덮어쓴 파일은 이전 바이트 복구). 되돌리지 않으면 메타에 없는 얼굴 사진이 남아
**개인정보 파기 실패**가 되고, 장부와 실제 데이터가 어긋난다.

### 결정 6 — 삭제 표식도 3방향으로 판정한다 (UltraQA 재현으로 추가)

다른 기기의 삭제 표식을 받으면 그대로 로컬 파일을 지우고 있었다. 그러면 **표식을 아직 받지
못한 사이에 이 기기가 새로 넣은 파일**(사진 다시 넣기, 첨부 다시 올리기, 노트 본문 다시 쓰기)이
다음 동기화에서 조용히 사라진다. 재현 테스트로 확인했다.

- 로컬 파일이 마지막 동기화 기준점과 **같으면** → 예정대로 지운다(파기는 계속 전파돼야 한다).
- 로컬 파일이 기준점과 **다르면** → 삭제 대상이던 그 파일이 아니라 이 기기의 새 내용이므로,
  지우지 않고 **복원(restoration)** 으로 돌려 다음 업로드에서 살려 올린다.

기존 복원 프로토콜(`replacesDeletionId`)을 그대로 재사용하므로 새 상태가 늘지 않는다.

⚠️ **예외(파기 우선)**: 이미 복원을 시도한 키에 다른 기기가 **그 뒤 새 삭제 세대**를 올리면
삭제가 이긴다(결정 3의 규칙 유지). 그렇지 않으면 지운 얼굴 사진이 복원으로 계속 되살아난다.

### 남은 한계

- 동기화 폴더가 중복된 계정은 이제 **오류로 멈춘다**(임의로 하나를 고르지 않는다).
  실제로 겪는 사용자가 나오면 폴더 병합 안내가 필요하다.
- 브라우저·Electron 렌더러에서는 Drive ETag 가 노출되지 않아, 일반 파일의 조건부 삭제는
  보수적으로 보류한다(불변 세대명을 쓰는 학생 사진만 허용).

---

## ADR-074: 학생에게 닿는 쓰기 3종(출결·관찰·채점)을 연다 — 등급 경계는 그대로 두고, 이름을 별칭으로 가린 채

**결정일**: 2026-08-25 · **상태**: active · **대체**: [ADR-061] 결정 7의 "쓰기 도구는 학생
데이터에 닿지 않는다" 부분 · **유지**: ADR-061 결정 7의 등급 경계(`ALLOWED_GRADES = [1]`)

### 발단

쌤핀 AI 는 쓰기 도구 22종을 갖고 있었지만, 그 목록에서 **학생에게 닿는 것만 빠져 있었다**
— 출결 입력·관찰 추가·루브릭 채점. 등록을 잊은 것이 아니라 계약 테스트가 정규식으로
막고 있었다(존재하지 않는 것이 계약이었다).

빠진 이유는 정당했다. 학생 데이터에 닿는 쓰기는 대상을 고르려면 명단이 필요하고,
명단을 모델에게 주면 학생 이름이 통째로 밖으로 나간다.

2026-08-25 에 그 전제가 바뀌었다. 가림막(`redactOutbound`)이 **담임 학급 + 교과 수업반**
명단을 모두 별칭으로 치환하게 됐고(⓪-a), 모델이 별칭으로 가리켜 온 대상을 앱이 실제
학생으로 되돌리는 배선이 생겼다(①). 즉 **모델에게 명단을 주지 않고도** 선생님이 말한
한 명을 특정할 수 있게 됐다.

### 결정 1 — 세 도구를 연다. 다만 조건을 함께 건다

`set_attendance` · `add_observation` · `set_rubric_mark` 를 등록한다. 조건은 넷이다.

1. **명단 조회 도구는 만들지 않는다.** `list_students` 류는 계속 존재하지 않는다.
   모델은 누가 있는지 모르는 채로, 선생님이 말한 번호나 별칭으로만 한 명을 가리킨다.
2. **등급 경계는 건드리지 않는다.** 세 도구 모두 `grade: 1` 이고 `outbound: 'args'` 이며
   `resultFields: []` 다 — 모델에게 돌려주는 것이 없다. 서버 관문의
   `ALLOWED_GRADES = [1]` 은 그대로다.
3. **저장은 여전히 [실행] 버튼이다.** 모델은 제안까지만 만들고, 미리보기 카드에 실제
   학생 이름과 처리 내용이 뜬 뒤 선생님이 눌러야 저장된다.
4. **새 저장 경로를 만들지 않는다.** 화면에서 저장할 때 지나는 스토어 함수를 그대로
   부른다(출결 `upsertStudentAttendanceEntries` + `bridgeHomeroomDayAttendance`,
   관찰 `useObservationStore.addRecord`, 채점 `useRubricStore.toggleMark`).

### 결정 2 — 이 개방은 ADR-072(생기부)와 **성격이 다르다**. 생기부는 계속 닫는다

둘을 같은 것으로 보면 안 된다.

|                  | 이번 3종                                  | 생기부(ADR-072) |
| ---------------- | ----------------------------------------- | --------------- |
| 밖으로 나가는 것 | 번호·집계·선생님이 말한 문장(이름은 별칭) | **서술 자체**   |
| 모델이 짓는 것   | 없음 — 인자를 옮길 뿐                     | 문장을 짓는다   |
| 열림 여부        | 연다                                      | **계속 닫는다** |

관찰 기록의 내용도 **선생님이 말한 문장을 그대로 옮길 뿐**이다. 모델에게 관찰문을
짓게 하지 않는다. 생기부 도구 3종(`record_draft`·`evidence`·`guidelines`)은 여전히
미등록이며, 계약 테스트가 그 부재를 이름으로 지킨다.

### 결정 3 — 몰라도 짐작하지 않는다. 되묻는다

학생 데이터 쓰기는 다른 곳보다 자주 거절한다. 잘못 적힌 결석은 나이스를 거쳐
생활기록부까지 따라가고, 선생님이 알아채는 것은 한참 뒤다.

- 번호로 가리켰는데 그 번호가 명단에 없으면 **이름으로 다시 찾지 않는다** — 번호는
  선생님이 확신을 갖고 말한 값이라, 못 찾았다는 사실 자체가 알려야 할 정보다.
- 교과 수업반 출결에서 교시를 안 밝히면 되묻는다. 시간표를 보지 않으므로 짐작해서
  1교시부터 채우면 들지도 않은 시간의 결석이 남는다(담임 학급만 하루 전체로 본다).
- 루브릭은 스토어 함수가 **토글**이다. 제안을 만든 뒤 선생님이 화면에서 같은 칸을
  눌렀으면 그대로 뒤집을 때 체크가 **풀린다**. 실행 직전에 현재 상태를 다시 보고,
  이미 원하는 결과면 부르지 않는다(`complete_todo` 선례). 결시 학생이면 스토어가
  조용히 무시하므로, 그 침묵을 성공 문구로 말하지 않는다.
- 출결 저장이 막히면(`upsertStudentAttendanceEntries` 가 `null`) "적었어요"라고
  말하지 않는다.

### 남은 한계 — 적어 두지 않으면 다음 사람이 안전하다고 믿는다

1. **명단에 없는 이름은 못 가린다.** 가림막은 담임 학급·교과 수업반 명렬표와 대조해
   가린다. 학부모 이름, 전학 간 학생, 다른 학교 학생은 대조할 것이 없어 그대로 나간다.
2. **재식별 가능성은 남는다.** 별칭(`［이름1］`)과 번호·날짜·교시가 함께 나가므로,
   같은 대화 안에서는 "누구에 대한 이야기인지"가 구조적으로 드러날 수 있다.
   이름 글자가 안 나갈 뿐, 익명화가 아니다.
3. **무료 티어는 보낸 내용을 학습에 쓴다**(업스테이지 약관 제22조, 옵트아웃 없음).
   ADR-061 결정 6·7 의 전제 그대로다. 교사 고지는 유지한다.
4. **관찰은 교과 수업반 전용이다.** 담임 학급 누가기록은 저장 자리가 아예 다르다
   (`useStudentRecordsStore`). 한 도구로 둘을 받으면 "어디에 적혔는지"가 말할 때마다
   달라져 선생님이 나중에 기록을 못 찾는다. 담임 누가기록 쓰기는 이번 범위 밖이다.
5. ~~출결 덮어쓰기 경고가 없다.~~ **2026-08-25 같은 날 해결.** 미리보기에 「지금」 줄이
   붙어 "지금 = 결석 (질병) / 처리 = 지각"이 함께 보인다. 적혀 있는 것이 없으면 그 줄은
   뜨지 않는다 — 빈 칸에 적는 흔한 경우에는 줄이 늘지 않는다. 값·사유·메모가 **전부
   같으면** 아예 쓰지 않는다(같은 값을 다시 저장하면 결과는 같지만 저장 시각이 갱신되며
   기기 간 동기화가 헛돌고 선생님은 무언가 바뀐 줄 안다). 교시마다 다르거나 일부 교시만
   적혀 있으면 **그 사실을 그대로 말한다** — "교시마다 달라요 (결석, 지각)" ·
   "일부 교시만 결석 (질병)". 하나로 뭉뚱그리면 그게 다시 거짓말이 된다.

6. **경고 표시(`<mark>`)가 걸린 단어를 듣는 사람에게서 빼앗고 있었다.** `aria-label` 은
   요소의 내용을 **대체**하므로 "이혼"이 안 읽히고 "주의: 가정 형편 이야기"만 들렸다 —
   눈으로 보는 사람은 단어에 밑줄이 그어진 것을 보는데 듣는 사람만 단어를 잃었다.
   2026-08-25 에 `title` + 덧붙이는 `sr-only` 로 바꿨다(이번 변경 이전부터 있던 결함).

## ADR-075: 옆핀이 고른 모니터를 시스템이 덮어쓰지 않는다 — AC-18을 뒤집는다

**날짜**: 2026-08-27
**상태**: 채택
**맥락**: 챗봇 미해결 피드백 "옆핀을 듀얼모니터 중에서 다른 모니터 화면으로 보내고 싶어요"

### 무엇을 뒤집는가

`side-pin.plan.md` AC-18은 "저장된 모니터가 사라지면 **device state 교정까지** 완료한다"였고,
`sidePinService.ts`가 실제로 저장값을 대체 모니터로 덮어썼다. 그 규칙을 없앤다.

### 왜 그때는 옳았고 지금은 틀렸는가

옆핀 첫 구현에는 **모니터를 고르는 수단이 아예 없었다.** `displayId`를 채우는 코드가
대체 로직 자신뿐이라, 그 값은 "사용자의 선택"이 아니라 "마지막으로 쓴 화면"이었다.
없어진 번호를 붙들고 있어 봐야 켤 때마다 같은 대체가 반복될 뿐이므로 고치는 것이 맞았다.

사용자가 고를 수 있게 되는 순간 같은 코드가 데이터 손실이 된다. 노트북에 외장 모니터를
꽂아 쓰는 교사가 외장 모니터를 골라 두고 **퇴근하며 케이블을 뽑으면 선택이 지워진다.**
다음 날 다시 꽂아도 안 돌아오고, 매일 다시 골라야 한다.

교훈은 일반적이다 — **"시스템이 값을 고쳐 준다"는 편의는 그 값의 주인이 시스템일 때만 옳다.**
주인이 사용자로 바뀌면 같은 코드가 남의 결정을 지우는 코드가 된다.

### 결정

1. **대체는 이번 실행에만 적용하고 저장값은 건드리지 않는다.** 고른 모니터가 안 보이면
   주 모니터에 그리되 `displayId`는 그대로 둔다. 다시 꽂으면 알아서 돌아온다.
2. **단서(`displayHint`)를 함께 저장한다.** Windows에서 `Display.id`는 재부팅·재연결로
   바뀔 수 있다. 이름·크기·자리를 같이 남겨, 번호가 달라져도 같은 모니터를 찾는다.
3. **번호만 달라진 경우에는 번호를 갱신한다.** 가리키는 대상이 같으므로 선택을 잃지 않는다.
   이것은 예외가 아니라 1번과 다른 사건이다 — 코드에서도 `usedFallbackDisplay`와
   `rematchedDisplayId`로 구분한다.
4. **구별할 수 없으면 포기한다.** 같은 모델 두 대처럼 이름도 크기도 같은 후보가 둘 이상이면
   아무것도 고르지 않고 주 모니터로 물러난다. 조용히 틀린 화면에 띄우는 것보다 낫다.

### 함께 정한 것

- **어느 모니터를 고르든 그 모니터의 오른쪽 끝에 붙인다.** 왼쪽 모니터를 고르면 손잡이가
  두 화면 경계에 놓여 조준이 필요해지는데(경계에서는 커서가 안 멈춘다), **감수한다.**
  왼쪽 가장자리 붙이기는 만들지 않는다 — 손잡이 모서리·펼침 방향·마우스 판정을 전부
  좌우 대칭으로 다시 만드는 일이고 얻는 것은 조준 한 번뿐이다. (오너 결정)
- **메모를 쓰는 중이면 화면 이동을 미룬다.** 배율이 다른 모니터로 옮기면 창 크기가 달라져
  패널 창을 다시 만들게 되고 그때 쓰던 글이 사라진다. 저장은 즉시 하고, 편집이 끝나면 옮긴다.
- **진입점은 트레이 메뉴.** 옆핀이 접혀 있어도, 아직 한 번도 안 켰어도 닿는다.
  옆핀 패널 안에는 두지 않는다 — 고르는 순간 패널이 다른 모니터에서 재생성되고 커서는
  옛 모니터에 남아 즉시 접혀, 사용자에게는 "옆핀이 사라졌다"로 보인다.
- **동기화하지 않는다.** 학교 PC와 집 노트북은 모니터 구성이 다르다. 설정 저장소가 아니라
  기기 전용 `side-pin-device-state.json`에 남긴다(스키마 2판).

### 대안과 기각 이유

- **저장값을 계속 덮어쓰되 "원래 고른 것"을 따로 기억** — 칸이 둘로 늘 뿐 결국 같은 구조다.
  덮어쓰는 칸을 아예 없애는 편이 규칙이 하나 줄어든다.
- **번호 대신 이름만으로 저장** — 이름이 비는 환경(Windows에서 흔하다)에서 아무것도 못 찾는다.
- **못 찾으면 옆핀을 아예 안 띄운다** — 손잡이가 사라지면 사용자는 되살릴 길을 모른다.
  기존 `protectedReason` 설계가 같은 이유로 "숨기기만 하지 않는다"를 택했다.

### 남은 한계

1. **같은 모델 두 대를 자리까지 똑같이 둔 경우는 못 가린다.** 이때는 주 모니터로 물러난다.
   실제로 그런 배치는 화면이 겹친다는 뜻이라 드물다.
2. **왼쪽 모니터의 손잡이는 잡기 불편하다.** 위 "함께 정한 것"의 감수 항목 그대로다.
3. **설정 화면 진입점은 아직 없다.** 트레이에서만 고를 수 있다(M5 미구현).

---

## ADR-076: 상담 예약의 수업 시간 제외는 날짜마다 따로 계산한다 — 첫 날짜 하나로 나머지를 짐작하지 않는다

**결정일**: 2026-08-27 · **상태**: active · **관련**: [ADR-060] (교사가 막은 슬롯은 자동
재계산이 건드리지 않는다)

### 발단

학부모 상담 일정을 만들 때 "수업 시간 제외"를 켜면 앱이 시간표를 보고 수업 중인 교시를
빼 준다. 그런데 그 판별이 **첫 번째 상담 날짜 하나의 요일 시간표만** 보고 있었고, 결과를
나머지 날짜에 그대로 복사했다(`ConsultationCreateModal.tsx` 의 `freePeriodSet`,
주석까지 `Use first parent date to determine free periods` 라고 영어로 남아 있었다).

상담은 대개 여러 날에 걸쳐 연다. 월·화를 함께 열고 월요일 시간표로 계산하면:

- 화요일에 **수업이 있는 교시가 열려** 학부모 예약이 들어온다
- 화요일에 **비어 있는 교시가 막혀** 쓸 수 있는 시간을 잃는다

앞쪽이 진짜 문제다. 선생님이 수업하고 있는 시간에 학부모가 찾아오고, 예약이 잡힌 뒤에는
되돌리는 데 학부모 연락이 필요하다.

기능이 처음 들어온 v2.0.4 시점부터 그대로였다. 새로 생긴 회귀가 아니라 **처음부터
미완성이던 부분**이고, 화면에 "어느 날 기준인지" 표시가 없어 아무도 눈치채지 못했다.

### 결정 1 — 날짜마다 그 날의 요일 시간표를 본다

제외 목록의 키를 교시 id 하나(`period-3`)에서 **`날짜|교시`**(`2026-03-02|period-3`)로
바꾼다. 같은 화면의 **학생 상담이 이미 쓰고 있는 형식**이라 새로 발명한 것이 아니다
(`selectedPresets`, `presetKey`/`parsePresetKey`).

저장 형식(`ConsultationSchedule.dates`)은 **바꾸지 않는다.** 원래 `{date, startTime,
endTime}` 의 배열이고 같은 날짜가 여러 줄 들어가도 되며, 지금도 제외를 켜면 하루가 여러
조각으로 쪼개져 저장된다. 서버·학부모 예약 화면·이미 만들어진 상담 일정은 손대지 않는다.

### 결정 2 — 시간표가 없는 날은 막을 근거도 없다

"공강 교시 집합"에 **`null`(시간표 없음)과 빈 집합(시간표는 있는데 공강이 0교시)을
구별한다.** 둘을 같게 다루면 토요일처럼 시간표가 없는 날에 **모든 교시가 수업으로 분류되어
전부 막히고 그 날 슬롯이 0개**가 된다.

이건 이번에 새로 생긴 문제가 아니라 원래 있던 것이다. 첫 날짜가 평일이면 가려져 있었을
뿐이고, 날짜별로 고치는 순간 주말마다 그대로 드러난다. 그래서 같은 작업에서 막는다.

`null` 이면 아무것도 제외하지 않는다 — 시간표가 없다는 것은 "언제 수업인지 모른다"는
뜻이지 "하루 종일 수업"이라는 뜻이 아니다. (ADR-060 이 종일 일정을 busy 로 잡지 않기로
한 것과 같은 판단이다.)

### 결정 3 — 자동 채움은 "아직 안 채운 날짜"만 채운다

기본값을 채우는 자리가 **날짜 목록뿐 아니라 시작·종료 시간까지** 보고 있어서, 시간을 한
글자만 고쳐도 손으로 맞춰 둔 제외가 통째로 되돌아갔다.

두 가지로 막는다.

1. 공강표를 **날짜 문자열만 이어 붙인 값**에 반응하게 한다. 시간만 고치면 그 값이 그대로라
   다시 계산되지 않는다.
2. **"기본값을 이미 채운 날짜"를 따로 기억한다.** 이게 없으면 _"제외를 전부 해제한 날짜"_
   와 _"아직 안 채운 날짜"_ 를 구별할 수 없어, 날짜를 하나 추가할 때마다 해제한 항목이
   되살아난다.

### 결정 4 — 계산은 domain 으로 뺀다

`src/domain/rules/consultationTimetableRules.ts` 신설. 화면 파일 안에 섞여 있어서 자동
테스트로 고정할 수가 없었고, 그래서 이 결함이 몇 달 동안 살아 있었다. **조용히 틀리는
계산은 테스트가 없으면 또 난다.**

`computeBreakPresets` 는 옮기지 않는다 — 날짜와 무관하게 잘 동작하고, 새 함수들이
구조적 타입으로 받으면 되기 때문이다(`isSlotBlockedByTimetable` 의 선례).

### 하지 않은 것 — 적어 두지 않으면 다음 사람이 안전하다고 믿는다

1. ~~편집 모달에는 시간표 연동이 없다.~~ **2026-08-27 같은 날 해결.** 아래 결정 5 참조.
2. ~~만든 뒤의 자동 재계산은 정규 시간표를 여전히 안 본다.~~ **2026-08-27 같은 날 해결.**
   아래 결정 6 참조. 단 **자동으로 막지는 않는다.**
3. **학생 상담 흐름은 손대지 않았다.** 원래 날짜별로 맞게 동작한다.

### 결정 5 — 편집 화면의 "수업 빼기"는 상태가 아니라 **한 번의 동작**이다

생성 화면처럼 "수업 시간 제외" 토글을 두지 않았다. 상담 일정에는 **무엇을 뺐는지 저장하는
칸이 없다**(`ConsultationDate` 는 날짜·시작·끝뿐). 토글로 보이게 하면 앱이 기억하고 있는
것처럼 읽히지만 실제로는 화면을 닫는 순간 사라진다.

그래서 시간대 행마다 **[수업 빼기] 버튼**을 둔다. 누르면 그 행의 날짜가 무슨 요일인지 보고
그 날 수업 중인 교시만 빼서 한 행을 여러 행으로 쪼갠다. 되돌리려면 시간을 다시 입력한다.
행마다 요일`(월)`을 함께 적어 어느 시간표를 보는지 드러낸다.

예약이 들어온 슬롯이 사라지면 기존 2단계 확인(`ScheduleUpdateImpactWarning`)이 그대로
잡는다 — 여기서 따로 막지 않는다.

### 결정 6 — 만든 뒤에 발견한 겹침은 **알리기만 한다. 자동으로 막지 않는다**

`recomputeSlotAvailability` 에 정규 시간표를 넣지 **않았다.** 대신 읽기 전용 점검
(`findClassTimeConflicts`)을 따로 만들어 상담 상세 화면에 안내를 띄운다.

**왜 자동으로 막지 않나** — "수업 시간에 슬롯이 열려 있다"가 실수인지 의도인지 앱은 구분할
수 없다. 상담 주간이라 수업을 단축했거나 보결을 구해 둔 선생님은 일부러 열어 둔 것이고,
그걸 조용히 닫으면 학부모 예약 페이지에서 자리가 사라진다. 게다가 이 재계산은 **기존 상담
일정 전부에 소급 적용**된다(시간표·일정이 바뀔 때마다 활성 일정을 전부 훑는다).

ADR-060 이 기록한 사고가 정확히 이 판단을 반대 방향으로 했던 것이다 — 앱이 "잘못 막힌 것
같다"며 교사의 수동 차단을 풀었고, 그 시간에 학부모 예약이 들어왔다. **같은 실수를 방향만
바꿔 되풀이하지 않는다.**

안내에는 두 숫자를 나눠 적는다. **예약 없는 것**은 [한 번에 막기]로 처리할 수 있고(막으면
`blockedBy: 'teacher'` 라 자동 재계산이 다시 풀지 않는다), **이미 예약이 들어온 것**은 막을
수 없으므로 건수만 알린다. 안내는 닫을 수 있고, 닫아도 데이터는 아무것도 바뀌지 않는다.

**남은 한계** — 선생님이 상담 상세 화면을 열지 않으면 안내를 못 본다. 자동 차단을 안 하기로
한 대가이고, 이 교환은 의도한 것이다.

---

## ADR-077: 유리에서 "떠 있는 면"은 표시(`data-sp-floating`)를 달고, 그 계약을 회귀 검사가 지킨다

**결정일**: 2026-08-28 · **상태**: active · **관련**: 규칙 ①-예외(`src/index.css`),
REGRESSION #64(`scripts/regression-grep-check.mjs`)

### 무슨 일이 있었나

준일님 신고: 설정 > 학교 정보에서 학교를 검색하면 결과 목록이 뒤의 "학년/반"·"담당 과목"
글자와 겹쳐 읽혔다.

**신고와 실제 원인이 달랐다.** 화면만 보면 "목록이 반투명해서 뒤가 비친다"로 읽히지만,
실제로 재보니 배경색이 `rgba(0, 0, 0, 0)` — **반투명이 아니라 배경이 아예 없었다.**

걸린 규칙은 모달용(⑥)이 아니라 **①번 "카드 안 카드는 배경을 지운다"** 였다. 위젯은
`bg-sp-card` 가 두 겹으로 겹쳐 있어서 안쪽까지 칠하면 42% × 42% 로 다시 불투명해진다.
그래서 안쪽 배경을 지우는데, **설정 카드 안에 들어 있는 드롭다운도 "겹친 면"으로 오인**됐다.

이 유형은 이번이 세 번째다. 2026-08-23 에 할 일 수정 창의 달력 팝오버가 같은 이유로
사라졌고, 그때 처방으로 `data-sp-floating` 표시를 만들었다. 그런데 **붙인 곳이 3개
파일뿐이라 나머지 드롭다운이 전부 빠져 있었다.** 유리를 켜고 훑어보니 날씨 지역 검색,
대시보드 일정 필터도 같은 상태였다.

### 결정 — 표시를 계속 쓰되, 기억이 아니라 검사로 지킨다

세 가지를 놓고 비교했다.

**(가) 공용 Popover/Dropdown 컴포넌트를 만들어 표시를 자동으로 붙인다** — 채택하지 않았다.
57곳을 옮기는 비용이 크고, 이 저장소는 이미 반대 방향으로 결론을 낸 적이 있다.
`index.css` 주석에 "컴포넌트 100여 곳을 하나씩 고치지 않고 규칙으로 처리하는 이유는,
위젯이 계속 늘어나기 때문이다"라고 적혀 있다. 게다가 떠 있는 면들은 생김새가 제각각이라
(툴팁·서랍·로딩 덮개·드래그 손잡이) 하나의 컴포넌트로 묶으면 억지가 된다.

**(나) CSS 선택자를 넓혀 떠 있는 면을 자동으로 잡는다** — 채택하지 않았다. **CSS 로는
불가능하다.** `position: absolute` 인 요소를 선택자로 고를 방법이 없다. Tailwind 클래스명
(`[class*='absolute']`)으로 흉내 낼 수는 있지만, `absolute` 는 로딩 덮개·장식 띠처럼
비쳐도 되는 면에도 쓰이므로 의도적으로 투명한 것까지 칠하게 된다.

**(다) 각 자리에 표시를 붙인다 + 빠지면 회귀 검사가 잡는다** — **채택.**

(다)의 알려진 약점은 "다음 사람이 또 잊는다"이고, 실제로 그래서 이 사고가 세 번 났다.
회귀 검사가 정확히 그 약점을 메운다. 표시 없이 떠 있는 면을 만들면 `npm run regression-check`
가 빨간불을 켠다 — 사람의 기억에 기대지 않는다.

### 표시 두 개의 역할을 갈라 두었다

같은 "불투명하게 되돌린다"를 하는 표시가 둘이라, 섞어 쓰면 어느 계약인지 알 수 없어진다.

- `data-sp-floating` — 다른 내용 **위에 잠깐 뜨는 면**(드롭다운·팝오버·툴팁·토스트·덮개).
  공용 컴포넌트가 없어 각자 직접 단다. 이번에 57곳이 됐다.
- `data-sp-overlay-surface` — 검은 막 위에 서는 **모달·알림 창**. 공용 `Modal` 이 자동으로
  달아 주므로 새 모달은 가만히 두면 된다. `role="dialog"` 도 같은 규칙이 받는다.

### 검사가 보는 것과 보지 않는 것

검사(REGRESSION #64)는 JSX 여는 태그 하나를 단위로 본다. 태그 안에 `bg-sp-card` 와 위치
클래스(`absolute`/`fixed`)가 같이 쓰였는데 위 표시가 하나도 없으면 실패한다. 통과 조건은
`index.css` 에서 **직접 파싱**하므로, CSS 쪽에서 규칙을 지우면 검사도 같이 빨간불이 된다.

대상은 유리가 켜지는 **데스크톱 메인 창**뿐이다. `useGlassSurface()` 를 부르는 곳은
`src/App.tsx` 한 곳이라 `src/mobile`·`src/student` 에는 `sp-glass-on` 이 붙지 않는다.

**보지 않는 것 — `bg-sp-card/80` 같은 투명도 수식.** 이번에 훑다가 74곳을 발견했는데,
실측해 보니 `rgba(0, 0, 0, 0)` 로 **배경색이 아예 칠해지지 않는다**(sp-\* 토큰은 Tailwind
알파 수식을 지원하지 않는다). 유리와 무관한 별개 결함이고, 각 자리마다 "원래 얼마나 진해야
하는가"라는 디자인 판단이 필요해 이 검사로는 강제할 수 없다. 준일님 결정으로 **이번 범위에서
제외**하고 별도 작업으로 남긴다.

### 검사를 만들 때 실제로 겪은 함정 (다음 사람 주의)

검사를 처음 넣었을 때 **"52건 전부 통과"가 나왔는데 거짓이었다.** 표시를 일부러 하나 빼고
다시 돌려 보니 그래도 통과했다. 원인은 셸 히어독이 역슬래시를 한 겹 삼켜
`'(^|[\\s"\'`])'`가`'(^|[\s"\'`])'`로 줄어든 것이었다 — 정규식이 공백 대신 글자`s` 를
찾게 되어 아무것도 매치하지 않았다.

그래서 지금 코드는 **정규식을 문자열로 조립하지 않는다.** 클래스 토큰을 직접 쪼개 집합으로
비교한다(`classTokens`). 이스케이프가 끼어들 자리를 없앤 것이다.

★ 교훈: **새 회귀 검사는 "통과"만 보고 믿지 말 것.** 반드시 일부러 위반을 만들어
빨간불이 켜지는지 확인한다. 이 검사는 그 음성 대조로 3곳(`AttendanceMatrixCore`,
`ImportSourceMenu`, `RealtimeWallTeacherContextMenu`)을 추가로 찾아냈다 — 인라인
`style={{ position: 'fixed' }}` 를 쓰는 메뉴들이라 처음 grep 으로는 안 보였다.
