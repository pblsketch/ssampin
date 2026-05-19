---
template: plan
version: 1.2
feature: notice-phase2-migration
date: 2026-05-20
author: pblsketch
project: ssampin
version_target: v2.0.6 묶음 릴리즈 후보 (사용자 가시 변화 — 라이트 테마 가독성 회복)
---

# Notice Phase 2 마이그레이션 + 라이트 테마 chip 가독성 토큰화

> **요약**: PR #55에서 도입한 `<Notice>` 공용 안내 컴포넌트 + amber-on-amber 가독성 ratchet 가드를 두 갈래로 확장한다. **Phase 2A**는 화이트리스트에 남아 있던 large 안내 박스 8건 + PR #60이 임시 패치한 3건(총 11건)을 `<Notice>`로 일괄 마이그레이션. **Phase 2B**는 라이트 테마에서 `text-amber-200/300` 등 절대 색상이 옅은 그레이 배경(#e0e2e6) 위에 거의 보이지 않는 가독성 회귀(사용자 신고 2026-05-20)를 chip/badge 패턴에 대해 토큰화하거나 light-theme override로 해소.
>
> **트리거**: (1) PR #55 메모 `Phase 2 마이그레이션 예정`. (2) 사용자 신고 2026-05-20 — "다크 테마에서는 노란 텍스트가 잘 보이는데 라이트 테마에서는 잘 안 보여" (스크린샷: `PeriodChipGroup` 조회·교시 chip 라이트 모드에서 흰 배경에 노란 글씨 회귀).
>
> **Project**: ssampin (쌤핀)
> **Version**: 2.0.5
> **Author**: pblsketch
> **Date**: 2026-05-20
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

다크 모드(`.theme-dark`, `--sp-bg: #0f172a`)와 라이트 모드(`.theme-light`, `--sp-bg: #e0e2e6`) 양쪽에서 동시에 가독성 ≥ WCAG AA를 보장하면서, amber 같은 강조 색상의 시각 의도(주의·경고)는 유지하도록 안내·상태 표시 패턴을 정리한다.

현재 두 종류의 가독성 회귀가 동시에 존재한다:

**A. amber-on-amber 동화 (다크 모드)** — PR #55 v1에서 해소. `bg-amber-500/10` + `text-amber-100~300` 패턴이 sp-bg(#0a0e17~#0f172a) 위에서 베이지 위 노랑 효과로 콘트라스트 부족. `<Notice>`로 large 안내 박스 11건을 마이그레이션해 ratchet 가드와 동행시킨다.

**B. amber 글자 라이트 모드 회귀** — 본 Plan에서 신규 진단. `text-amber-200/300` 같은 절대 색상은 라이트 테마 override가 없어 `.theme-light` 옅은 그레이 배경 위에서도 동일한 옅은 노랑으로 렌더링 → 콘트라스트 거의 0. chip/badge 패턴(PeriodChipGroup, RealtimeWallCard 등)이 이 회귀에 노출.

`index.css`는 이미 `text-white` 등 절대 색상에 light-theme override를 두고 있다(line 209~211). amber/red/orange/purple 계열에는 동일 가드가 누락된 상태.

### 1.2 Background

- **선행**: PR #55 [`feat(design-system): Notice 공용 컴포넌트 + amber-on-amber 가독성 가드`](https://github.com/pblsketch/ssampin/pull/55) (commit `2558042`, 2026-05-20 머지). `<Notice>` 4 variant(info/warning/danger/success) + sm/md size + `Notice.metatest.test.ts` ratchet 가드. `RealtimeResponseToggle.tsx:127` 1건 시범 마이그레이션으로 패턴 검증.
- **메모리**: [`feedback_dark_mode_color_assimilation.md`](../../../../.claude/projects/e--github-ssampin/memory/feedback_dark_mode_color_assimilation.md) — "다크 모드 색상 동화는 명도 상승이 아니라 반전 패치 또는 Notice 컴포넌트로 해결". [`feedback_frontend_agent_collaboration.md`](../../../../.claude/projects/e--github-ssampin/memory/feedback_frontend_agent_collaboration.md) — 디자인·UI·UX 단독 작업 금지, frontend-design 또는 bkit:frontend-architect 협업 필수.
- **PR #60 임시 패치**: `multi-date-attendance` 작업 중 발견한 amber-on-amber 가독성 4 파일에 대해 ad-hoc 색상 조정으로 우선 대응(`text-amber-200 → text-amber-100`, `PeriodChipGroup` 반전 패치). 본 Phase 2A가 정식 흡수.
- **사용자 신고 2026-05-20**: 라이트 테마에서 PeriodChipGroup `text-amber-200` chip 가독성 거의 0(첨부 스크린샷 2장). 이미 PR #60 반전 패치(`bg-amber-400 text-amber-950`)가 일부 분기에 적용되었으나 `periodActive`(2번째 스크린샷)는 여전히 옅은 amber 절대 색상.

### 1.3 Related Documents

- 부모 PR: [PR #55 (commit `2558042`)](https://github.com/pblsketch/ssampin/pull/55) — Notice 컴포넌트 + ratchet 가드 도입
- 임시 패치 머지본: [PR #60 (commit `6799160`)](https://github.com/pblsketch/ssampin/pull/60) — multi-date-attendance + amber 콘트라스트 fix 1차
- Notice 컴포넌트: [`src/adapters/components/common/Notice.tsx`](../../../src/adapters/components/common/Notice.tsx)
- Ratchet 가드: [`src/adapters/components/common/Notice.metatest.test.ts`](../../../src/adapters/components/common/Notice.metatest.test.ts)
- 테마 토큰: [`src/index.css`](../../../src/index.css#L17-L211) (`.theme-light` line 141~154, `.theme-dark` line 156~184, light override line 188~211)
- 디자인 시스템 규칙: [`docs/design-system.md`](../../design-system.md)
- 사용자 신고 메모리: 본 Plan 작성 후 `feedback_light_theme_amber_legibility.md` 신설 예정

---

## 2. Scope

### 2.1 Phase 2A — Notice 마이그레이션 (11건)

기존 ratchet 가드 `ALLOWED_FILES` 화이트리스트 중 **large 안내 박스**(p-3/p-4/px-3 py-2 padding) 카테고리 8건 + PR #60 임시 패치 3건. 작은 chip/badge 화이트리스트(상태 라벨)는 Phase 2A 밖.

| #   | 파일                                                                                                                                              | 라인     | 분류             | 비고                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------- | ------------------------------------------------------------------------ |
| 1   | [`common/DriveSyncIndicator.tsx`](../../../src/adapters/components/common/DriveSyncIndicator.tsx)                                                 | 58~66    | PR #60 임시 패치 | `bg-amber-500/10 ... text-amber-200/400` 2 패턴 (충돌 안내·offline 표시) |
| 2   | [`Meal/MealPage.tsx`](../../../src/adapters/components/Meal/MealPage.tsx)                                                                         | 270      | PR #60 임시 패치 | 식단 없음 안내 카드                                                      |
| 3   | [`Homeroom/Records/InputMode.tsx`](../../../src/adapters/components/Homeroom/Records/InputMode.tsx)                                               | 879      | PR #60 임시 패치 | skippedDates 배너 (여러 날 출결 일괄 입력 시)                            |
| 4   | [`Calendar/CalendarMappingModal.tsx`](../../../src/adapters/components/Calendar/CalendarMappingModal.tsx)                                         | 134      | 화이트리스트     | 캘린더 매핑 안내 박스                                                    |
| 5   | [`ClassManagement/AddClassModal/AddSubjectsToGroup.tsx`](../../../src/adapters/components/ClassManagement/AddClassModal/AddSubjectsToGroup.tsx)   | 359      | 화이트리스트     | 그룹 추가 안내 박스                                                      |
| 6   | [`ClassManagement/AddClassModal/StepSubjectSelect.tsx`](../../../src/adapters/components/ClassManagement/AddClassModal/StepSubjectSelect.tsx)     | 370      | 화이트리스트     | 과목 선택 안내 박스                                                      |
| 7   | [`Tools/InteractiveSlides/Lobby/LessonLobby.tsx`](../../../src/adapters/components/Tools/InteractiveSlides/Lobby/LessonLobby.tsx)                 | 516      | 화이트리스트     | 라이브 시작 안내 박스                                                    |
| 8   | [`Tools/InteractiveSlides/Presenter/LessonPresenter.tsx`](../../../src/adapters/components/Tools/InteractiveSlides/Presenter/LessonPresenter.tsx) | 211, 327 | 화이트리스트     | top 안내 배너 + 버튼(line 327은 chip 성격 — 별도 평가)                   |
| 9   | [`slides-student/pages/LobbyPage.tsx`](../../../src/slides-student/pages/LobbyPage.tsx)                                                           | 23       | 화이트리스트     | 학생 로비 대기 안내                                                      |
| 10  | [`slides-student/pages/SlidePage.tsx`](../../../src/slides-student/pages/SlidePage.tsx)                                                           | 75       | 화이트리스트     | 학생 슬라이드 top 배너                                                   |
| 11  | [`student/StudentSubmitForm.tsx`](../../../src/student/StudentSubmitForm.tsx)                                                                     | 577      | 화이트리스트     | 학생 제출 폼 안내 박스                                                   |

각 파일에서 처리할 것:

- [ ] 외곽 `<div>` + amber bg + 옅은 amber text + padding 패턴을 `<Notice variant="warning" size="sm|md">`로 교체
- [ ] 시각 헤더/제목이 별도 라인이면 `title` prop 사용
- [ ] 본문은 sp-text 자동 적용 — 별도 텍스트 색 클래스 제거
- [ ] `Notice.metatest.test.ts`의 `ALLOWED_FILES`에서 해당 항목 **제거**(ratchet 축소)
- [ ] 변환 후 다크/라이트 양 테마에서 시각 동등 검증

### 2.2 Phase 2B — 라이트 테마 chip 가독성 토큰화

PeriodChipGroup의 `ACCENT_CLASSES`(amber/red/orange/purple)가 절대 색상 `text-amber-200/300` 등을 라이트 테마에서 그대로 노출. 동일 패턴이 RealtimeWallCard, RealtimeWallCardDetailModal, RosterManagementTab(status chip), Tools/Assignment, Homeroom Survey 등 다수 위치에서 chip/badge로 사용 중. 총 122 occurrences (`text-(amber|red|orange|purple)-(100|200|300)` 전체 grep, 2026-05-20).

본 Phase는 **CSS 토큰 + light-theme override** 2-track으로 해소:

#### Track 1: CSS light-theme override (전역 가드)

`src/index.css`의 `.theme-light` 블록 뒤에 amber/red/orange/purple 옅은 텍스트 변형에 대한 라이트 모드 override를 추가. 기존 `.theme-light .text-white` 패턴 답습.

```css
/* 라이트 테마에서 옅은 강조 색상 텍스트는 어두운 강조 색상으로 강제
   — chip/badge 가독성 회복용. Notice는 sp-text를 쓰므로 영향 없음. */
.theme-light .text-amber-100,
.theme-light .text-amber-200,
.theme-light .text-amber-300 {
  color: #b45309; /* amber-700 */
}
.theme-light .text-red-100,
.theme-light .text-red-200,
.theme-light .text-red-300 {
  color: #b91c1c; /* red-700 */
}
/* orange/purple 동일 패턴 */
```

이 가드는 122 occurrences 모두에 자동 효과. 메타테스트도 light 회귀 가드 1건 추가(다음 항).

#### Track 2: 메타테스트 light 회귀 가드 (ratchet)

`light-theme-chip-legibility.metatest.test.ts` 신규: `src/` 내 `.tsx`/`.ts` 파일에서 `text-(amber|red|orange|purple)-(100|200|300)`을 사용하는 라인이 light override가 위 `index.css`에 정의된 색상 집합 안에 들어가는지 정적 검증. (override 누락 시 fail)

#### Track 3: PeriodChipGroup ACCENT_CLASSES 토큰화 (선택)

근본 해결은 `ACCENT_CLASSES`가 라이트/다크 자동 분기되는 sp-\* 토큰을 사용하는 것. 단 4 accent × 6 클래스 × 2 테마 = 48 토큰 추가가 부담. 본 Phase에서는 Track 1+2(override + 가드)로 일단 닫고, Track 3은 후속 PDCA로 미룬다.

### 2.3 Out of Scope

- 작은 status chip/badge 화이트리스트 35건 (Notice 대상 아님, Phase 2B Track 1 override만 자동 효과)
- `PeriodChipGroup.tsx` `ACCENT_CLASSES` 자체의 sp-\* 토큰화 (별도 PDCA `chip-accent-tokens` 권장)
- yellow/green/blue/teal 등 amber 외 색상의 light 회귀 (현재 사용 없거나 자체 토큰 사용 — 회귀 미관측 시 본 Plan 밖)
- Tailwind 기본 색상 → sp-\* 토큰 전면 codemod (별도 라운드)
- 라이트 테마 자체 UX 개선 (대비 조정, 컴포넌트 그림자 등)

### 2.4 Non-Goals

- 새 디자인 시스템 신규 도입 (Notice 외)
- 라이트 테마를 기본 테마로 전환 (다크가 기본)
- 모달/Drawer 마이그레이션 (B-round에서 종결)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID    | Requirement                                                                                                                                                                 | Priority | Phase |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| FR-01 | Phase 2A 11개 파일 모두 `<Notice variant="warning">` (또는 적절한 variant)로 마이그레이션                                                                                   | High     | 2A    |
| FR-02 | `Notice.metatest.test.ts` `ALLOWED_FILES`에서 마이그레이션 완료 8개 항목 제거(ratchet 축소). PR #60 패치 3건은 아예 들어가지 않은 상태이므로 그대로 유지                    | High     | 2A    |
| FR-03 | 변환 전후 다크 테마 시각 동등(여백·아이콘·헤더 위치는 Notice 기본 사양 따름, 사용자 메시지 텍스트는 동등)                                                                   | High     | 2A    |
| FR-04 | 변환 후 라이트 테마에서 가독성 ≥ WCAG AA (자동 검증 도구 또는 수동 콘트라스트 측정 ≥ 4.5:1)                                                                                 | High     | 2A    |
| FR-05 | `src/index.css`에 amber/red/orange/purple 옅은 텍스트 변형(100/200/300)에 대한 `.theme-light` override 추가                                                                 | High     | 2B    |
| FR-06 | `light-theme-chip-legibility.metatest.test.ts` 신규 — `src/` 내 `text-(amber\|red\|orange\|purple)-(100\|200\|300)` 사용처가 모두 override 적용 대상에 포함되는지 정적 검증 | High     | 2B    |
| FR-07 | 사용자 신고 PeriodChipGroup chip(amber accent, periodActive)이 라이트 테마에서 가독성 OK                                                                                    | High     | 2B    |
| FR-08 | PR #60 반전 패치(`bg-amber-400 text-amber-950 font-semibold`)는 라이트/다크 양쪽 콘트라스트 OK이므로 본 Phase에서 건드리지 않음                                             | Medium   | 2B    |

### 3.2 Non-Functional Requirements

| Category          | Criteria                                                                | Measurement                                    |
| ----------------- | ----------------------------------------------------------------------- | ---------------------------------------------- |
| Visual Regression | 다크 테마: 11개 변환 박스의 의미 전달·여백·아이콘 사용 동등             | 수동 비교 (변환 전/후 스크린샷)                |
| Accessibility     | WCAG 2.1 AA — 콘트라스트 ≥ 4.5:1 (텍스트), ≥ 3:1 (UI 컴포넌트)          | Chromium DevTools Contrast Ratio 또는 axe-core |
| Performance       | Notice 컴포넌트 11개 추가 마운트 비용 ≤ 0.5ms/총합 (이미 시범 1건 통과) | React DevTools Profiler                        |
| Bundle Size       | CSS override 추가 ≤ 500 bytes gzip                                      | `npx vite build` 출력 diff                     |
| Test              | 기존 1327 tests 통과 + 신규 메타테스트 1건 추가                         | `npm run test`                                 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] Phase 2A: 11개 파일 `<Notice>` 마이그레이션 완료
- [ ] Phase 2A: `Notice.metatest.test.ts` `ALLOWED_FILES` 8건 항목 제거(화이트리스트 축소 검증)
- [ ] Phase 2B: `index.css`에 amber/red/orange/purple 옅은 텍스트 light override 추가
- [ ] Phase 2B: `light-theme-chip-legibility.metatest.test.ts` 신규 통과
- [ ] `npx tsc --noEmit` 에러 0
- [ ] `npm run lint` 0 errors (warnings 기존 부채 120건 변화 없음)
- [ ] `npm run test` 1327 + 신규 = ≥1328 통과
- [ ] `npm run regression-check` 9/9 통과
- [ ] 사용자 신고 PeriodChipGroup 라이트 테마 가독성 수동 검증 통과
- [ ] Gap Analysis Match Rate ≥ 90%

### 4.2 Quality Criteria

- [ ] Phase 2A 11 파일 변경 평균 라인수 변화 -3 ~ +1 (단순 wrapper 교체)
- [ ] 시각 회귀(다크 테마): 0건
- [ ] 시각 회귀(라이트 테마): 가독성 회복 + 다른 영역 회귀 0건
- [ ] frontend-design 또는 bkit:frontend-architect 에이전트와 협업 (메모리 정책)

---

## 5. Risks and Mitigation

| Risk                                                                                                 | Impact | Likelihood | Mitigation                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------- | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Notice 마이그레이션 후 일부 박스의 시각 사양(아이콘·헤더)이 원본과 미세 차이                         | Medium | Medium     | Design 단계에서 11건 각각 Before/After 스니펫 작성. 시각 동등이 어려운 케이스는 `variant`·`size`·`title`·`icon` 조합으로 흡수. 어색하면 해당 케이스만 Notice 미적용 + ALLOWED_FILES 유지 |
| Phase 2B CSS override가 amber/red/orange/purple chip의 다크 테마 외관도 변경                         | High   | Low        | `.theme-light` 셀렉터 한정이라 다크 영향 없음. 메타테스트는 다크 검증 케이스 별도 추가                                                                                                   |
| light override가 의도된 amber 텍스트(예: PR #60 반전 패치 `text-amber-950`)와 충돌                   | Medium | Low        | override 셀렉터는 `text-amber-100/200/300`만 — 950은 미적용                                                                                                                              |
| Phase 2B Track 1 override가 너무 강해 일부 chip의 의도된 옅은 amber도 짙어짐                         | Low    | Medium     | 사용자 신고가 이미 "안 보임"이므로 짙어지는 게 정답. 단 다크 모드에서 옅게 보이는 게 의도였다면 라이트 모드만 영향 받아 OK                                                               |
| 메타테스트가 false positive를 자주 잡아 PR 작업 마찰                                                 | Low    | Medium     | 정규식·화이트리스트 정밀화. `Notice.metatest.test.ts` 패턴 답습                                                                                                                          |
| 작업 중 다른 세션이 동일 파일 수정 (Phase 2A 11 파일 중 InputMode·MealPage 등은 다른 세션 활성 가능) | Medium | Medium     | `git status` + worktree 격리(`ssampin-notice2`). 메인 워킹 트리 브랜치 변경 금지                                                                                                         |
| 사용자 신고 외에도 라이트 테마 다른 가독성 회귀 잠재                                                 | High   | High       | Phase 2B Track 2 메타테스트가 카탈로그화 — 미처 인지 못한 회귀도 자동 잡힘. 발견 시 별도 PDCA                                                                                            |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

Enterprise (Clean Architecture 4 layers). 본 Plan은 `adapters` 레이어(`Notice.tsx`, 11 마이그레이션 대상)와 글로벌 CSS만 다룸. 도메인 무수정.

### 6.2 Key Architectural Decisions

| Decision                                    | Options                                                           | Selected                           | Rationale                                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| Phase 2B 해법                               | (A) CSS override / (B) 컴포넌트 토큰화 / (C) Tailwind config 확장 | **A (override) + 메타테스트 가드** | (B)는 122 occurrence chip 모두 컴포넌트화 부담 큼. (C)는 변수 명시 비용. (A)는 5분 패치 + 자동 가드 |
| 메타테스트 위치                             | (A) `Notice.metatest.test.ts` 안 / (B) 별도 파일                  | **B 별도 파일**                    | 다른 ratchet(amber-on-amber)과 책임 분리. 향후 Notice 이관 시 가독성 메타테스트는 별도 라이프사이클 |
| 라이트 텍스트 색상 매핑 (amber)             | 700/800/900                                                       | **700 (`#b45309`)**                | amber-700이 amber-200(#fcd34d) 대비 콘트라스트 보존하면서 베이지(#e0e2e6) 위 콘트라스트 ≥ 6:1       |
| 라이트 텍스트 색상 매핑 (red/orange/purple) | 700/800 일관                                                      | **700**                            | amber와 일관                                                                                        |
| Phase 분할                                  | 1 PR vs 2 PR                                                      | **1 PR (Phase 2A+2B 묶음)**        | "라이트 가독성 회복"이 공통 부채. 묶어 검증 한 번에. iter 발생 시 분리 고려                         |

### 6.3 Clean Architecture Approach

- `<Notice>`: `adapters/components/common/` — UI 컴포넌트. domain 무관.
- `index.css`: 글로벌 스타일. 어느 레이어도 import 안 함.
- 11 마이그레이션 대상: 모두 `adapters/components/...` 또는 `student/`, `slides-student/` 진입점. layer 위반 없음.
- 메타테스트: `src/adapters/components/common/light-theme-chip-legibility.metatest.test.ts` — vitest run-time에 src 디렉토리 정적 스캔.

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] [`docs/architecture-rules.md`](../../architecture-rules.md) — Clean Architecture 4 layers, import 규칙
- [x] [`docs/design-system.md`](../../design-system.md) — sp-\* 토큰, design examples 참조
- [x] [`docs/coding-conventions.md`](../../coding-conventions.md) — TypeScript strict, React, 스타일 규칙
- [x] `CLAUDE.md` 검증 게이트: tsc → lint → test → regression-check
- [x] 메모리 정책: 디자인·UI·UX 단독 금지 (frontend-design 또는 bkit:frontend-architect 협업)
- [x] 메모리 정책: 다중 세션 git 프로토콜 (worktree 격리, 메인 main 브랜치 변경 금지)

### 7.2 Conventions to Verify

- Notice variant 매핑: 안내(`info`) / 경고(`warning`) / 위험(`danger`) / 성공(`success`). 11건 중 대부분 `warning`, 일부는 `info` 검토 (예: LessonLobby 대기 안내 → info 가능성)
- light override 셀렉터는 `!important` 사용? — `index.css` line 188~211 기존 패턴이 `!important` 사용 → 일관 적용
- 한국어 본문 유지: 이모지 사용 — Notice 기본 아이콘 + 본문은 절제된 한국어

### 7.3 Environment Variables Needed

해당 없음. 본 작업은 클라이언트 측 UI/CSS 전용.

---

## 8. Implementation Order

Phase 2A → 2B 순서로 진행. 각 단계 끝에 검증 게이트 즉시 확인.

### 8.1 Phase 2A — Notice 마이그레이션 (단순한 것부터)

1. **`common/DriveSyncIndicator.tsx`** — 2 패턴 (PR #60 임시 패치). 단순 wrapper 교체 패턴 확립
2. **`Meal/MealPage.tsx`** — 1 패턴 (PR #60 임시 패치)
3. **`Homeroom/Records/InputMode.tsx:879`** — skippedDates 배너 (PR #60 임시 패치). `Set<string>` 등 표시 데이터 그대로 children에
4. **`Calendar/CalendarMappingModal.tsx:134`** — 화이트리스트
5. **`ClassManagement/AddClassModal/AddSubjectsToGroup.tsx`** + `StepSubjectSelect.tsx` — 화이트리스트, 동일 패턴 2건
6. **`Tools/InteractiveSlides/Lobby/LessonLobby.tsx:516`** — 화이트리스트
7. **`Tools/InteractiveSlides/Presenter/LessonPresenter.tsx:211`** — top 안내 배너. line 327(buttont chip)은 Phase 2A 밖, Phase 2B Track 1 override가 자동 처리
8. **`slides-student/pages/LobbyPage.tsx:23`** + **`SlidePage.tsx:75`** — 화이트리스트, 동일 패턴 2건
9. **`student/StudentSubmitForm.tsx:577`** — 화이트리스트, 학생 entry라 회귀 위험 확인 필수
10. **`Notice.metatest.test.ts` `ALLOWED_FILES` 8건 제거** — ratchet 축소 검증

각 단계 끝 즉시 `npx tsc --noEmit`. 회귀 발생 시 즉시 멈춤.

### 8.2 Phase 2B — 라이트 테마 chip 가독성

11. **`src/index.css`** — `.theme-light` 블록 뒤에 amber/red/orange/purple 옅은 텍스트 변형(100/200/300) light override 추가 (4 색상 × 3 변형 = 12 셀렉터)
12. **`src/adapters/components/common/light-theme-chip-legibility.metatest.test.ts`** 신규 — 정적 분석 가드
13. **수동 검증**: 라이트 테마 켠 상태로 PeriodChipGroup·RealtimeWallCard·status chip 핵심 화면 5종 가독성 측정

### 8.3 검증 게이트 (각 Phase 후)

- `npx tsc --noEmit` — 0 errors
- `npm run lint` — 0 errors (warnings 부채는 본 PR 밖)
- `npm run test` — 1327 + 1 ≥ 1328
- `npm run regression-check` — 9/9
- 다크 + 라이트 양 테마 수동 비교

---

## 9. Verification Plan

### 9.1 Automated

- TypeScript: `npx tsc --noEmit` — 0 errors
- Lint: `npm run lint` — 0 errors
- Tests:
  - 기존 1327 tests + Phase 2A 메타테스트 화이트리스트 축소 검증(기존 가드 그대로 통과) + Phase 2B 신규 light 메타테스트 1건 = ≥1328
- Regression grep: 9/9 통과

### 9.2 Manual (5 핵심 화면 × 2 테마 = 10 점검)

라이트(`html` class `theme-light`) + 다크(`theme-dark`) 양쪽에서 다음 화면 가독성 측정:

1. **담임/Records/InputMode** — PeriodChipGroup amber accent (사용자 신고 직접 화면) + skippedDates 배너
2. **Drive 동기화 상태** — DriveSyncIndicator 충돌·offline 안내
3. **수업관리/AddClassModal** — AddSubjectsToGroup + StepSubjectSelect 안내 박스
4. **InteractiveSlides** — LessonPresenter top 배너 + LessonLobby 대기 안내
5. **학생 entry** — slides-student/LobbyPage·SlidePage + student/StudentSubmitForm

체크 항목:

- [ ] 안내 박스 텍스트 가독성(WCAG AA 콘트라스트 ≥ 4.5:1, Chromium DevTools 자동 측정)
- [ ] amber variant 시각 의도 유지(warning 인상 — 노란 stripe + 아이콘이 식별 가능)
- [ ] 아이콘 위치·여백·라운드 시각 동등

### 9.3 Theme Toggle Smoke

설정 → 디스플레이 탭에서 라이트↔다크 토글 시 11개 안내 박스 + 122 chip 사용처 모두 즉시 재렌더 확인 (CSS 변수 기반이라 새로고침 없이 적용).

### 9.4 Cross-Platform

- Electron(Chromium) `npm run electron:dev`
- 브라우저 `npm run dev` (Vite dev server)
- 모바일 미리보기(`m.ssampin.com` 시뮬레이션) — 학생 페이지 가독성 확인

---

## 10. Next Steps

1. [ ] Design 문서 작성 (`/pdca design notice-phase2-migration`) — 11건 각 Before/After 스니펫 + Phase 2B override 색상 매핑 표 + 메타테스트 정규식 명세
2. [ ] frontend-design 또는 bkit:frontend-architect 에이전트와 협업해 시각 동등 검증(메모리 정책)
3. [ ] Do 단계 — Phase 2A 11건 마이그레이션 + Phase 2B CSS override + 메타테스트 추가
4. [ ] Check 단계 — gap-detector 호출, Match Rate ≥ 90% 확인
5. [ ] Act 단계 (필요 시) — pdca-iterator로 Gap 보완
6. [ ] Report 단계 — 완료 보고서 + v2.0.6 묶음 릴리즈 후보 마킹

---

## Version History

| Version | Date       | Changes                                                                                        | Author    |
| ------- | ---------- | ---------------------------------------------------------------------------------------------- | --------- |
| 0.1     | 2026-05-20 | Initial draft (PR #55 머지 후 잔여 부채 정리 + 사용자 신고 2026-05-20 라이트 테마 가독성 통합) | pblsketch |
