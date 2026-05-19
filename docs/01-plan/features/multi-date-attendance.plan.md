---
template: plan
version: 1.2
feature: multi-date-attendance
date: 2026-05-19
author: pblsketch
project: ssampin
version_target: v2.1.0 (Minor)
status: Ready for Design
---

# 여러 날짜 출결 일괄 입력 (Multi-Date Attendance) 기획서

> **요약**: 사용자 피드백 "여러 날짜를 선택하여 출결 일괄 입력"에 대응. 현재 담임 기록 탭에만 숨겨져 있는 연속 범위 등록 UX를 (1) 발견성 개선 (2) 불연속 다중 선택 캘린더 도입 (3) 수업관리 출결까지 확장의 3-Phase 로드맵으로 통합 제공한다.
>
> **Project**: ssampin (쌤핀)
> **Version**: v2.0.5 → v2.1.0
> **Author**: pblsketch
> **Date**: 2026-05-19
> **Status**: Ready for Design (v0.2, 2026-05-19 사용자 확정 완료)

---

## 1. Overview

### 1.1 Purpose

교사가 동일한 출결 사유(예: 교외체험학습·코로나 격리·인플루엔자·수학여행 인솔 결근 등)를 여러 날짜에 한 번에 등록할 수 있도록 한다. 현 UX는 다음 두 가지 문제를 가진다:

1. **숨겨진 기능**: 담임 > 기록 탭에 이미 "여러 날 한 번에 등록" 토글이 있으나, 출결 카테고리를 먼저 선택해야만 노출되어 사용자가 발견하지 못함.
2. **편파적 노출**: 수업관리 > 출결 탭 / 모바일 출결에는 다중 날짜 기능이 전무 → 교사는 "수업출결을 며칠치 미리 등록"하려면 매일 따로 입력해야 함.
3. **연속 범위만 지원**: 불연속 선택(예: "월·수·금만 결석")은 현재 불가.

### 1.2 Background

- **사용자 피드백 원문 (2026-05-19)**: "담임 업무에서 여러 날짜를 선택하여 출결 일괄 입력 기능 요청 / 일자를 연속으로 출결을 표시하려면 그것을 하루하루 따로 입력해야 하나"
- **선행 기획**: [docs/01-plan/features/attendance-period-edit.plan.md](attendance-period-edit.plan.md) (2026-04-17) — 교시 편집 분리. 본 기획은 그 후속으로 "날짜 차원"을 확장.
- **기존 자산** (전수 조사 결과):
  - [`InputMode.tsx:95-119,378-403,830-846`](../../../src/adapters/components/Homeroom/Records/InputMode.tsx) — `dateRangeMode` 토글, `createDateRange`, `batchSave` 진행률·스킵 추적이 이미 작동 중
  - [`recordUtils.ts:102`](../../../src/adapters/components/Homeroom/Records/recordUtils.ts) — `createDateRange(start, end)` 유틸
  - [`CalendarPicker.tsx`](../../../src/adapters/components/common/CalendarPicker.tsx) — Portal 단일 날짜 픽커 (`lessonDays`, `accentColor`, 한글 요일). 멀티픽 확장 베이스.
- **도메인 적합성**: `AttendanceRecord = {classId, date, period, students}` 단위 → 다중 날짜는 항상 N번 `saveDayAttendance` 호출 패턴. **도메인·스토어 변경 0**, UI 레이어 작업으로 완결 가능.

### 1.3 Related Documents

- 사용자 피드백 원문: 본 세션 (2026-05-19)
- 선행 기획: `docs/01-plan/features/attendance-period-edit.plan.md`
- 코딩 컨벤션: `docs/coding-conventions.md`
- 아키텍처 규칙: `docs/architecture-rules.md`
- 디자인 시스템: `docs/design-system.md`
- 메모리 피드백: `feedback_frontend_agent_collaboration.md` (디자인 작업 시 frontend-design 협업 필수)

---

## 2. Scope

### 2.1 In Scope

**Phase 1 — 발견성 개선 (P1, Quick Win)**

- [ ] 담임 > 기록 탭 입력 모드의 "여러 날 한 번에 등록" 토글을 **출결 카테고리 선택 시점에 즉시 노출**되도록 위치·시각 강화 (출결 유형 칩 옆 또는 날짜 입력부 직속)
- [ ] 토글 ON 상태 라벨에 현재 모드 표시 ("단일 / 범위 / 다중")
- [ ] 명령 팔레트(Ctrl+K) 검색어 매핑 추가: "여러 날 출결", "출결 일괄", "다중 날짜 출결"
- [ ] **팔레트 진입 시 동작**: 담임 > 기록 탭 입력 모드로 라우팅 + 출결 카테고리 자동 선택 + 멀티픽 토글 자동 ON
- [ ] 출결 카테고리에만 노출하는 기존 정책 **유지** (상담·생활 기록은 본 기획 대상 외 — 사용자 결정 2026-05-19)

**Phase 2 — 불연속 다중 선택 캘린더 컴포넌트 (P0)**

- [ ] 신규 공용 컴포넌트 — `MultiDatePicker`(혹은 `CalendarPicker` 멀티 모드 확장)
  - 옵션: `mode: 'single' | 'range' | 'multi'`
  - `multi` 모드: 날짜 클릭 토글, 선택된 날짜 칩 리스트, "주중 전체" / "월·수·금" 같은 프리셋 버튼
  - `range` 모드: 시작·종료 두 번 클릭으로 범위 지정 + Shift+클릭으로 추가
  - 키보드 접근성 (←/→/↑/↓ 이동, Space 토글, Enter 확정), ARIA `role="grid"`
  - 30일 상한 가드 + 미선택 가드
  - sp-\* 토큰만 사용, `rounded-xl` 패널 + `rounded-lg` 셀
  - Portal 렌더링으로 모달·드로어 안에서도 클리핑 없이 표시
- [ ] frontend-design 에이전트와 공동 Design 단계 진행 (Mockup → 토큰 검토 → ARIA 점검)

**Phase 3 — 수업관리 출결 확산 (P1)**

- [ ] `AttendanceTab.tsx` 단일 교시 모드: 상단 날짜 입력을 `MultiDatePicker`로 교체 + "여러 날 적용" 모드 시 저장 버튼 라벨이 "N일 일괄 저장"으로 변경
- [ ] `AttendanceMatrixView`: 다중 날짜 선택 후 매트릭스가 "교시 × 학생" → "선택된 N일 평균 + 일자 전환 탭"으로 동작 (스코프 검증 필요)
- [ ] 모바일 `AttendanceCheckPage`: Bottom Sheet 형식의 멀티픽 도입 (기존 단일 날짜와 토글 가능)
- [ ] 저장 경로: 기존 `saveDayAttendance(classId, date, byPeriod)`를 날짜 루프로 fan-out (스토어·도메인 무변경)

### 2.2 Out of Scope

- 출결 사유의 일자별 다른 값 입력 (1일차 결석 / 2일차 지각 같은 케이스) — 전체 선택 날짜에 동일 사유 적용만 지원
- 교시별 다중 선택 (이미 Records 입력 모드에 존재) — 본 기획은 "날짜 차원" 확장에 한정
- 출결 fan-out 시 그룹 학급(`groupId`) 공유 정책 변경 — 기존 정책(`saveAttendanceRecord` 자동 `groupId` 주입) 유지
- 외부 캘린더(Google Calendar)와의 멀티 데이트 양방향 동기화
- 매트릭스 뷰에서 "선택된 N일에 대해 학생별 셀 N개" 같은 신규 시각화 (사용자 검증 후 별도 PDCA)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID    | Requirement                                                                                                                   | Priority | Status  |
| ----- | ----------------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| FR-01 | 담임 > 기록 입력 모드의 다중 날짜 토글이 출결 카테고리 사전 선택 없이도 노출된다                                              | High     | Pending |
| FR-02 | `MultiDatePicker`는 single / range / multi 3가지 모드를 한 컴포넌트로 제공한다                                                | High     | Pending |
| FR-03 | 다중(multi) 모드에서 사용자는 임의 날짜 N개를 토글 선택할 수 있다 (불연속 허용)                                               | High     | Pending |
| FR-04 | "주중 전체(월~금)", "이번 주", "다음 주", "초기화" 프리셋 버튼이 제공된다                                                     | Medium   | Pending |
| FR-05 | 30일 상한과 0일 가드가 일괄 저장 직전에 차단·안내 토스트로 표시된다                                                           | High     | Pending |
| FR-06 | 일괄 저장 시 진행률(`N/M`)과 스킵된 날짜 목록이 표시된다                                                                      | Medium   | Pending |
| FR-07 | 수업관리 > 출결 탭 단일 교시 모드에서 다중 날짜 적용이 가능하다                                                               | High     | Pending |
| FR-08 | 수업관리 > 출결 탭 전체 교시(매트릭스) 모드는 날짜 전환 토글로 제공한다                                                       | Medium   | Pending |
| FR-09 | 모바일 출결 입력에 Bottom Sheet 멀티픽이 제공된다                                                                             | Medium   | Pending |
| FR-10 | 명령 팔레트(Ctrl+K)에서 "여러 날 출결" 검색 시 담임 > 기록 입력 모드로 라우팅 + 출결 카테고리 자동 선택 + 멀티픽 토글 자동 ON | Medium   | Pending |
| FR-11 | 다중 날짜 토글은 **출결 카테고리 한정** 유지 (상담·생활 기록은 본 기획 대상 외 — 2026-05-19 사용자 확정)                      | High     | Pending |

### 3.2 Non-Functional Requirements

| Category      | Criteria                                                                     | Measurement Method                               |
| ------------- | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| Performance   | 30일 일괄 저장이 < 3초 (로컬 JSON, 디스크 IO 포함)                           | DevTools Performance + 메타테스트                |
| Performance   | 다중픽 캘린더 셀 렌더 < 16ms (60fps)                                         | React Profiler                                   |
| Accessibility | WCAG 2.1 AA — 키보드 전 조작 가능, 포커스 비주얼 명시, ARIA role="grid" 적용 | axe-core 자동 검사 + 수동 NVDA 1회               |
| Compatibility | Electron + 브라우저 모드 모두에서 동일 동작                                  | `npm run dev` + `npm run electron:dev` 양쪽 검증 |
| i18n          | UI 텍스트 100% 한국어                                                        | grep 가드                                        |
| Tokenization  | 신규 컴포넌트의 모든 색·radius·shadow는 sp-\* 또는 Tailwind 기본 키만 사용   | grep `#[0-9a-fA-F]{3,6}` 검사                    |
| Regression    | 기존 단일 날짜 입력 흐름 100% 유지 (회귀 0)                                  | 기존 회귀 테스트 + 신규 메타테스트               |
| Domain Purity | `domain/` 레이어 무수정 (saveDayAttendance API 그대로 사용)                  | import 가드                                      |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01 ~ FR-11 전부 구현되고 수동 동선 시연 통과
- [ ] frontend-design 에이전트의 Design 검토 1회 완료 (Mockup·ARIA·토큰)
- [ ] `MultiDatePicker` 단위 테스트: single/range/multi 모드 전환 + 30일 가드 + 키보드 네비
- [ ] 회귀 메타테스트 추가:
  - 기존 `dateRangeMode` 사용자 시나리오 통과
  - 단일 날짜 저장 경로 회귀 0
- [ ] 검증 게이트 4단계 통과 (`tsc -b`, `npm run lint`, `npm run test`, `npm run regression-check`)
- [ ] PROGRESS.md / DECISIONS.md 갱신 (ADR: "범위 vs 다중 선택 모드 분리 이유")

### 4.2 Quality Criteria

- [ ] 신규 컴포넌트 테스트 커버리지 ≥ 80%
- [ ] ESLint 0 errors / 0 new warnings
- [ ] `npx tsc --noEmit` 0 errors
- [ ] Lighthouse Accessibility ≥ 95 (해당 페이지)
- [ ] 사용자 신고자 회신용 GIF / 짧은 영상 1개 (피드백 closure)

---

## 5. Risks and Mitigation

| Risk                                                                         | Impact | Likelihood | Mitigation                                                                                               |
| ---------------------------------------------------------------------------- | ------ | ---------- | -------------------------------------------------------------------------------------------------------- |
| `AttendanceMatrixView` 다중 날짜 통합이 현재 "한 날 전체 교시" 모델을 깨뜨림 | High   | Medium     | Phase 3 시작 시 별도 design 검토 + 옵션 A/B/C (날짜 탭 / 평균 모드 / Phase 3에서 제외)로 사용자에게 확인 |
| `CalendarPicker` 확장 vs 신규 컴포넌트 분리 결정 지연                        | Medium | Medium     | Design 단계 1일 차에 frontend-design 에이전트와 옵션 비교 → 결정 후 ADR 기록                             |
| 30일 상한이 사용자 케이스(예: 학기 단위 결석)를 만족 못함                    | Medium | Low        | Design 단계에서 사용자에게 "최대 N일이 필요한가" 추가 확인                                               |
| 다중 날짜 fan-out 시 일부 날짜 실패 → 부분 저장 상태                         | High   | Low        | 기존 `skippedDates` 패턴 재사용 + 실패 토스트 + "다시 시도" 액션                                         |
| 모바일 Bottom Sheet 멀티픽이 작은 화면에서 조작 어려움                       | Medium | Medium     | Phase 3 design 단계에 모바일 시안 별도 frontend-design 검토                                              |
| 다른 세션의 `oauth-callback-stuck` 작업과 파일 충돌                          | Low    | Low        | 본 기획은 `electron/ipc/oauth*`와 `useGoogleAccountStore` 무관 영역                                      |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level          | Characteristics                                                | Selected |
| -------------- | -------------------------------------------------------------- | :------: |
| Starter        | Simple structure                                               |    ☐     |
| Dynamic        | Feature-based modules                                          |    ☐     |
| **Enterprise** | Strict 4-layer (domain / usecases / adapters / infrastructure) |    ☑     |

> 본 프로젝트는 이미 Enterprise 4-layer Clean Architecture를 채택. 본 기획은 adapters 레이어 UI 작업에 한정되며 domain 변경이 없다.

### 6.2 Key Architectural Decisions

| Decision           | Options                                                                            | Selected             | Rationale                                                                       |
| ------------------ | ---------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------- |
| Date picker        | `CalendarPicker` 확장 / 신규 `MultiDatePicker` / 외부 라이브러리(react-day-picker) | **Design 단계 결정** | frontend-design 에이전트와 트레이드오프 비교 후 ADR                             |
| Save fan-out       | 도메인 API 변경 / UI 레이어 루프                                                   | UI 레이어 루프       | `saveDayAttendance`는 이미 일자 단위 단일 책임. UI에서 N번 호출하면 됨          |
| State 관리         | 로컬 useState / Zustand 신규 / URL 쿼리                                            | 로컬 useState        | 다중 날짜는 페이지 휘발성 상태. 영속화 불필요                                   |
| Accessibility 패턴 | Manual ARIA / Headless UI / radix-ui                                               | Manual ARIA          | 프로젝트 무외부 헤드리스 라이브러리 정책 유지. `CalendarPicker.tsx` 패턴 재사용 |
| 30일 상한 처리     | Hard cap / Soft warning / Configurable                                             | Hard cap (UI)        | 기존 동작과 일치, 향후 사용자 요청 시 설정으로 승격                             |

### 6.3 Clean Architecture Mapping

```
adapters/components/common/
  MultiDatePicker.tsx           ← 신규 (Phase 2)
  CalendarPicker.tsx            ← 기존 (확장 vs 분리는 design 결정)

adapters/components/Homeroom/Records/
  InputMode.tsx                 ← 수정 (Phase 1+2 — 토글 노출 + MultiDatePicker 통합)
  recordUtils.ts                ← createDateRange + createDateSet 추가

adapters/components/ClassManagement/
  AttendanceTab.tsx             ← 수정 (Phase 3 — 단일 교시 모드 멀티픽)
  AttendanceMatrixView.tsx      ← 수정 (Phase 3 — 날짜 탭 전환)

mobile/pages/
  AttendanceCheckPage.tsx       ← 수정 (Phase 3 — Bottom Sheet 멀티픽)

domain/                         ← 변경 없음
usecases/                       ← 변경 없음
adapters/stores/
  useTeachingClassStore.ts      ← 변경 없음 (saveDayAttendance 그대로 사용)
```

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] `CLAUDE.md` 코딩 규칙 + 도메인 규칙 분리 (`docs/architecture-rules.md`, `docs/coding-conventions.md`, `docs/design-system.md`)
- [x] ESLint + Prettier + lint-staged + husky pre-commit 활성
- [x] TypeScript strict, `any` 금지

### 7.2 Conventions to Verify

| Category     | Status | Note                                                                |
| ------------ | :----: | ------------------------------------------------------------------- |
| Naming       |   ✅   | `MultiDatePicker`, `selectedDates: Set<string>` 등 기존 컨벤션 준수 |
| Folder       |   ✅   | 공용 컴포넌트는 `adapters/components/common/`                       |
| Import order |   ✅   | 기존 `@adapters/`, `@domain/` alias 사용                            |
| sp-\* tokens |   ✅   | 하드코딩 HEX 금지 가드 통과 필수                                    |
| Korean UI    |   ✅   | 모든 라벨·툴팁·토스트 한국어                                        |
| 직각 금지    |   ✅   | `rounded-xl` (카드) / `rounded-lg` (버튼) 적용                      |

### 7.3 Pipeline Integration

본 기획은 9-phase pipeline 신규 진입이 아닌 **단일 PDCA 사이클**로 처리. Phase 2(Convention) 산출물은 이미 갖춰져 있어 재사용.

---

## 8. Phase Breakdown & Timeline

| Phase            | 범위                                                               | 예상 작업일 | 산출물                               | 협업                              |
| ---------------- | ------------------------------------------------------------------ | :---------: | ------------------------------------ | --------------------------------- |
| **Plan**         | 본 문서                                                            |    0.5d     | `multi-date-attendance.plan.md`      | —                                 |
| **Design**       | Phase 1+2+3 통합 설계서, 와이어프레임, 모드 결정 ADR               |     2d      | `multi-date-attendance.design.md`    | **frontend-design 에이전트 필수** |
| **Do — Phase 1** | 발견성 개선 + 명령 팔레트 매핑                                     |    0.5d     | InputMode 패치, commandRegistry 확장 | 단독 가능                         |
| **Do — Phase 2** | `MultiDatePicker` 구현 + 단위 테스트                               |     2d      | 신규 컴포넌트 + 테스트               | **frontend-design 검토 1회**      |
| **Do — Phase 3** | 수업관리·매트릭스·모바일 통합                                      |     2d      | 3개 파일 수정 + 회귀 메타테스트      | frontend-design 모바일 시안 검토  |
| **Check**        | Gap 분석 (target ≥ 95%)                                            |    0.5d     | `multi-date-attendance.analysis.md`  | gap-detector 에이전트             |
| **(Act)**        | Match Rate < 90% 시 자동 반복                                      |    0~1d     | iteration 보고                       | pdca-iterator 에이전트            |
| **Report**       | 완료 보고서 + GIF + KB Q&A 5건 추가                                |    0.5d     | `multi-date-attendance.report.md`    | report-generator 에이전트         |
| **Release**      | v2.1.0 릴리즈 8단계 (`release-notes.json`, KB, 노션, Win/Mac 빌드) |     1d      | v2.1.0 태그                          | —                                 |

**총 예상**: 7~9일 (1.5~2주). v2.1.0 Minor 릴리즈 타깃.

---

## 9. Collaboration Plan — frontend-design 에이전트

`feedback_frontend_agent_collaboration.md` 의무에 따라 다음 시점에 협업:

1. **Design 단계 진입 직후** — Mockup 옵션 3종 비교 (단일 컴포넌트 확장 vs 분리 vs 외부 라이브러리)
2. **MultiDatePicker 1차 구현 직후** — 시각·접근성·motion·hover 상태 일괄 검토
3. **모바일 Bottom Sheet 시안** — 모바일 전용 검토 별도
4. **최종 시연** — 회귀 위험 영역 (모달 안에서 사용, 다크/라이트 테마, 키보드 only) 점검

---

## 10. Resolved Questions (2026-05-19 사용자 확정)

| #   | 질문                                        | 결정                                                                                                                        |
| --- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Q1  | 30일 상한 충분한가?                         | ✅ **30일 유지** — 교외체험학습·단기결석 범위 커버. 향후 사용자 요청 시 설정 승격 가능.                                     |
| Q2  | `AttendanceMatrixView` 다중 날짜 모드 형태? | 🔁 **Design 단계에서 frontend-design 에이전트와 결정** — A(날짜 탭) / B(평균 통계) / C(매트릭스 제외) 옵션 비교 후 ADR 기록 |
| Q3  | 명령 팔레트(Ctrl+K) 진입 시 라우팅?         | ✅ **담임 > 기록 탭 입력 모드 직행 + 멀티픽 토글 자동 ON**                                                                  |
| Q4  | 출결 외 카테고리(상담·생활)도 멀티픽 노출?  | ✅ **출결 카테고리에만 노출 (기존 동작 유지)** — 본 기획 범위 외                                                            |

---

## 11. Next Steps

1. [x] Plan 문서 작성
2. [x] 사용자 확인 (4건 결정 반영)
3. [ ] `/pdca design multi-date-attendance` 실행 → frontend-design 에이전트 호출
4. [ ] Design 검토 후 Do Phase 1 착수

---

## Version History

| Version | Date       | Changes                                                                                  | Author    |
| ------- | ---------- | ---------------------------------------------------------------------------------------- | --------- |
| 0.1     | 2026-05-19 | 초안 — 3-Phase 구조 + frontend-design 협업 계획                                          | pblsketch |
| 0.2     | 2026-05-19 | 사용자 확정 반영 — 30일 유지, 매트릭스는 Design 결정, 팔레트 라우팅 확정, 출결 한정 정책 | pblsketch |
| 1.0     | 2026-05-19 | Status: Draft → **Ready for Design**                                                     | pblsketch |
