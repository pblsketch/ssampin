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
