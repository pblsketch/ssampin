---
template: plan
version: 1.2
feature: modal-migration-batch-1
date: 2026-04-25
author: pblsketch
project: ssampin
version_target: v1.11.x (디자인 부채 정리, 사용자 가시 변화 없음)
---

# 모달 마이그레이션 Batch-1 — 공통 Modal.tsx로 이전 (8개)

> **요약**: Impeccable Audit v2가 측정한 "46개 `role="dialog"` 모달 중 포커스 트랩 0건" 부채를 본격 해소하는 첫 batch. 신설된 [`common/Modal.tsx`](../../../src/adapters/components/common/Modal.tsx)로 **8개 단순 모달**을 이전한다. 외관과 동작은 동등 유지하면서 ARIA 포커스 트랩 + body scroll lock + ESC/backdrop 일관 처리 + 닫힌 후 트리거 포커스 복귀(WAI-ARIA APG)를 자동 획득.
>
> **선정 기준**: 100~165 라인 단순 구조 + 외부 store 의존 적음 + standalone/dual 모드 없음 + Drawer 아닌 중앙 모달.
>
> **Project**: ssampin (쌤핀)
> **Author**: pblsketch
> **Date**: 2026-04-25
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

[Impeccable Audit v2 (2026-04-25)](../../impeccable-audit-v2.md)가 진단한 가장 큰 a11y 부채:
- 46개 `role="dialog"` 모달 중 **포커스 트랩 0건**
- **닫힌 후 트리거 포커스 복귀 0건** (키보드 사용자가 모달을 닫으면 포커스가 `<body>`로 유실)
- body scroll lock 0건 (모달 뒤 콘텐츠가 스크롤됨)
- ESC/backdrop 닫기 동작이 모달마다 다름 (일부는 ESC 미지원, 일부는 backdrop 클릭 미동작)

이를 1차 시범 마이그레이션(2026-04-25, FeedbackModal + CalendarMappingModal)에서 검증한 [`Modal.tsx`](../../../src/adapters/components/common/Modal.tsx) 기반으로 **8개 단순 모달**부터 일괄 처리한다.

### 1.2 Background

- **선행 작업**: 같은 날 [`common/Modal.tsx`](../../../src/adapters/components/common/Modal.tsx) 신설 + `focus-trap-react@^11.0.6` + `focus-trap@^7.8.0` 의존 추가. 시범 마이그레이션 2건(FeedbackModal·CalendarMappingModal) 완료. tsc/build 그린.
- **메모리 컨텍스트**: [`project_modal_component_b_round.md`](../../../../.claude/projects/e--github-ssampin/memory/project_modal_component_b_round.md). 다음 라운드(이 작업) 우선순위 1순위로 명시.
- **이번 batch 의도**: 가장 위험 낮은 8개를 먼저 처리해 **마이그레이션 패턴을 굳힌다**. 회귀 1건 발견 시 즉시 후속 batch 일정 조정.

### 1.3 Related Documents

- 부채 진단: [`docs/impeccable-audit-v2.md`](../../impeccable-audit-v2.md)
- 1차 audit: [`docs/impeccable-audit-report.md`](../../impeccable-audit-report.md)
- Modal API: [`src/adapters/components/common/Modal.tsx`](../../../src/adapters/components/common/Modal.tsx)
- 시범 마이그레이션 레퍼런스 1: [`src/adapters/components/common/FeedbackModal.tsx`](../../../src/adapters/components/common/FeedbackModal.tsx) — 시각 헤더가 children에 따로 있는 케이스
- 시범 마이그레이션 레퍼런스 2: [`src/adapters/components/Calendar/CalendarMappingModal.tsx`](../../../src/adapters/components/Calendar/CalendarMappingModal.tsx) — `isOpen` prop + `closeOnBackdrop=false` 케이스
- 메모리: [`project_modal_component_b_round.md`](../../../../.claude/projects/e--github-ssampin/memory/project_modal_component_b_round.md)

---

## 2. Scope

### 2.1 In Scope (8 modals)

선정 원칙: 100~165 라인 + 단순 구조 + standalone 모드 없음 + Drawer 아님 + 자체 keydown 핸들러 최소.

| # | 파일 | 라인 | 비고 |
|---|------|------|------|
| 1 | [`Tools/RealtimeWall/StudentPipaConsentModal.tsx`](../../../src/adapters/components/Tools/RealtimeWall/StudentPipaConsentModal.tsx) | 63 | 가장 단순. 학생 동의 모달 |
| 2 | [`Tools/BookmarkGroupModal.tsx`](../../../src/adapters/components/Tools/BookmarkGroupModal.tsx) | 99 | 즐겨찾기 그룹 생성/편집 |
| 3 | [`Meal/MealEditModal.tsx`](../../../src/adapters/components/Meal/MealEditModal.tsx) | 138 | 급식 메뉴 입력 (frontend-architect 검토 결과 ConflictResolveModal은 dead component → 대체) |
| 4 | [`Schedule/CategoryFormModal.tsx`](../../../src/adapters/components/Schedule/CategoryFormModal.tsx) | 109 | 일정 카테고리 폼 |
| 5 | [`common/DriveSyncConflictModal.tsx`](../../../src/adapters/components/common/DriveSyncConflictModal.tsx) | 109 | Drive 동기화 충돌 |
| 6 | [`Settings/google/DisconnectConfirmModal.tsx`](../../../src/adapters/components/Settings/google/DisconnectConfirmModal.tsx) | 113 | 구글 연결 해제 confirm |
| 7 | [`Share/ShareModal.tsx`](../../../src/adapters/components/Share/ShareModal.tsx) | 150 | 일정 공유 모달 |
| 8 | [`Schedule/BulkDeleteByCategoryModal.tsx`](../../../src/adapters/components/Schedule/BulkDeleteByCategoryModal.tsx) | 161 | 카테고리 일괄 삭제 |

각 파일에서 처리할 것:
- [ ] 외곽 backdrop `<div>` + 패널 `<div>` 2층 구조 제거 → `<Modal>`로 교체
- [ ] `role="dialog"` / `aria-modal` / `aria-labelledby` / `aria-hidden` 수동 코드 제거 (Modal이 처리)
- [ ] 중복 ESC 핸들러 제거 (Modal이 `closeOnEsc`로 처리)
- [ ] backdrop 클릭 닫기 코드 제거 (Modal이 `closeOnBackdrop`로 처리)
- [ ] 시각적 헤더가 children에 따로 있으면 `srOnlyTitle` 사용
- [ ] confirm 류는 `closeOnBackdrop=false`로 실수 닫힘 방지 (사용자 명시 확인 후)

### 2.2 Out of Scope (이번 batch에서 제외, 후속 batch로 미룸)

- **Drawer 류** — `RealtimeWallApprovalSettingsDrawer`, `RealtimeWallBoardSettingsDrawer` (별도 Drawer 컴포넌트 신설 필요)
- **standalone/dual 모드** — `QuickAddModal` (Electron BrowserWindow 모드), `CommandPalette` (Ctrl+K 전역, fixed 위치 특수)
- **거대 모달** (500+ lines, 자체 wizard/탭 다단계 UI) — `ConsultationCreateModal`(1441), `TeacherControlPanel`(1077), `ImportModal`(652), `EventFormModal`(553), `SurveyCreateModal`(530), `ClassSurveyTab`(551), `ColumnEditor`(514), `CategoryManagementModal`(492), `TempChangeModal`(486), `BookmarkFormModal`(411), `ToolsGrid`(410), `AssignmentCreateModal`(438), `SeatZoneModal`(394) → 이후 batch
- **Settings/SettingsLayout, BackupCard, TasksCard** — 모달 외 다른 책임 섞여있어 분리 필요
- **자체 IME/composing 처리 모달** — 한국어 IME 조합 중 ESC 차단이 들어간 경우 별도 검증 필요

### 2.3 Non-Goals

- 모달 내부 스타일 리뉴얼 (이번 batch는 동작 보존, 시각 동등 유지)
- IconButton/Card 컴포넌트 신설 (별도 PR — Modal과 묶지 말 것)
- z-index 토큰화 (별도 PR)
- text-white 468건 codemod (별도 라운드)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 8개 모달 모두 `<Modal>` 컴포넌트로 감싸서 외곽 div 2층 구조 제거 | High | Pending |
| FR-02 | 각 모달의 시각 외관(여백·크기·색·헤더 위치)이 마이그레이션 전후 동등 | High | Pending |
| FR-03 | confirm/destructive 액션 모달(DisconnectConfirm, BulkDelete, DriveSyncConflict)은 `closeOnBackdrop=false`로 backdrop 실수 닫힘 차단 | High | Pending |
| FR-04 | `closeOnEsc=false` 적용은 사용자가 모달 안에서 의식적 선택을 해야만 하는 경우(없음 — 이번 batch에서는 모두 ESC 닫기 허용) | Medium | Pending |
| FR-05 | 모달 마운트 시 첫 번째 포커스 가능한 요소에 자동 포커스, 닫힌 후 트리거 버튼에 포커스 복귀 | High | Pending |
| FR-06 | 모달 안에서 Tab 사이클링이 모달 내부 요소에서만 순환 (모달 밖 요소로 포커스 유출 없음) | High | Pending |
| FR-07 | 라이트/다크 양 테마 모두 시각 동등 | High | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement |
|----------|----------|-------------|
| Performance | 모달 마운트 추가 시간 < 5ms (focus-trap 라이브러리 7KB) | 체감 측정 |
| Accessibility | WCAG 2.1 AA — 키보드 접근성, 포커스 가시성, dialog ARIA 패턴 준수 | NVDA/VoiceOver 수동 테스트 |
| Compatibility | Electron(Chromium) + 브라우저 양쪽 동작 | `npm run dev` 브라우저 + `npm run electron:dev` |
| Bundle Size | focus-trap-react+focus-trap 합산 ≤ 10KB gzip 추가 | `npx vite build` 출력 비교 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] 8개 모달 모두 `<Modal>`로 마이그레이션 완료
- [ ] `npx tsc --noEmit` 에러 0
- [ ] `npx vite build` 성공
- [ ] 8개 모달 각각 수동 검증 통과 (Tab 사이클·ESC·backdrop·포커스 복귀·라이트/다크)
- [ ] `git grep 'role="dialog"' src/adapters/components --include='*.tsx' | wc -l` 카운트 46→38 감소 (Modal.tsx 1건은 토대 제공자라 유지)

### 4.2 Quality Criteria

- [ ] 변경 파일 수 ≤ 8 (Modal.tsx + 8개 모달 컴포넌트)
- [ ] 각 모달 변경 후 라인수 평균 5~15% 감소 (외곽 div + role/aria 코드 정리분)
- [ ] 시각 회귀 0건
- [ ] 기능 회귀 0건

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 한국어 IME 조합 중 ESC가 모달을 닫음 | Medium | Low | Modal에서 `e.isComposing` 체크 추가 (필요 시 이번 batch 중 Modal.tsx 보강) |
| destructive confirm 모달이 backdrop 실수 클릭으로 닫힘 | High | Medium | FR-03대로 `closeOnBackdrop=false` 적용 강제 |
| 시각 회귀 (radius/shadow/border 미세 차이) | Medium | Low | Modal 기본 패널은 `bg-sp-card border border-sp-border rounded-xl shadow-sp-lg ring-1 ring-white/5`. 기존 `rounded-2xl` 모달은 외관 살짝 변경되지만 사용자 정책(rounded-xl 카드 기본)에 더 부합 |
| 모달 안 form submit 시 IconButton 닫기 버튼이 form 트리거 | Medium | Low | 닫기 버튼에 `type="button"` 명시 (각 마이그레이션 시 확인) |
| focus-trap이 contenteditable 안에서 Tab 차단 | Low | Low | 이번 batch 8개는 contenteditable 사용 없음 |
| Modal.tsx의 `animate-scale-in`이 일부 모달의 기존 애니메이션과 충돌 | Low | Low | 기존 모달들이 자체 애니메이션을 거의 안 씀 (FeedbackModal·CalendarMapping 시범 검증 통과) |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

Enterprise (Clean Architecture 4 layers).

### 6.2 Key Architectural Decisions

이미 v2 라운드에서 결정·구현됨. 본 batch는 그 결과를 적용:

| Decision | Selected | Rationale |
|----------|----------|-----------|
| Focus trap 라이브러리 | `focus-trap-react@^11.0.6` (+ `focus-trap@^7.8.0`) | 직접 구현 시 46개 모달이 통과해야 할 엣지케이스(Tab wrap, dynamic content, contenteditable, autofocus) 처리 비용 > 7KB |
| ARIA labelledby 생성 | `useId()` | 동시 다중 모달 충돌 없음 |
| backdrop 클릭 패턴 | `onMouseDown` + `e.target === e.currentTarget` | 카드 안 드래그 후 backdrop에서 떼는 사고 방지 |
| Reduced motion | `motion-reduce:` 변형 + 글로벌 `@media (prefers-reduced-motion: reduce)` 이중 안전망 | backdrop-blur·scale-in까지 잡음 |

### 6.3 Clean Architecture Approach

- `common/Modal.tsx`는 `adapters` layer (UI). `domain`/`usecases` 의존 없음.
- 각 마이그레이션 대상 모달도 `adapters/components/...`. 본 batch는 layer 위반 없음.

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] `CLAUDE.md` 존재 (Clean Architecture 4 layers, 디자인 토큰)
- [x] `tsconfig.json` strict mode
- [x] 사용자 정책: 직각 금지, `rounded-sp-*` 사용 금지, Tailwind 기본(`rounded-xl=카드 기본`)
- [x] 시각 톤: 친근/존댓말/절제된 이모지

### 7.2 Conventions to Verify

- 닫기 버튼은 `IconButton` 신설 전까지는 기존 inline 패턴 유지 (이번 batch 외 작업)
- 모달 내부 form submit은 명시적 button + onClick (form 자동 submit 회피)
- 이모지 사용: 본문 정보 명확화에만 (제목 X, 본문 ✓)

---

## 8. Implementation Order (8 modals, 위험도 순)

가장 단순한 것부터 → 패턴 확립 → 점진적 복잡도 증가.

1. **StudentPipaConsentModal.tsx** (63 lines) — 가장 단순, 1차 패턴 확립
2. **BookmarkGroupModal.tsx** (99 lines) — form 패턴 첫 적용
3. **DriveSyncConflictModal.tsx** (109 lines) — `closeOnBackdrop=false` 첫 적용 (destructive)
4. **DisconnectConfirmModal.tsx** (113 lines) — `closeOnBackdrop=false` 동일 패턴
5. **CategoryFormModal.tsx** (109 lines) — Schedule form 패턴
6. **MealEditModal.tsx** (138 lines) — 급식 form 패턴 (ConflictResolveModal 대체 — dead component)
7. **ShareModal.tsx** (150 lines) — 공유 패턴 (URL/QR 등, store-driven)
8. **BulkDeleteByCategoryModal.tsx** (161 lines) — `closeOnBackdrop=false` 큰 destructive + 2-step confirm

**제외된 후보 — ConflictResolveModal**: frontend-architect 백그라운드 검토(2026-04-25)에서 import처 0건 확인 → 렌더 트리에 올라가지 않는 **dead component**. 별도 PR로 정리(삭제 또는 SyncStatusBar 연동)할 것.

각 단계 끝에 `npx tsc --noEmit` 즉시 확인. 회귀 발생 시 그 즉시 멈추고 원인 분석.

---

## 9. Verification Plan

### 9.1 Automated

- `npx tsc --noEmit` — 에러 0
- `npx vite build` — 성공
- `git grep 'role="dialog"' src/adapters/components --include='*.tsx' | wc -l` — 46 → 38

### 9.2 Manual (각 모달별 5점 체크)

1. **마운트 자동 포커스** — 모달 진입 시 첫 input/button에 포커스
2. **Tab 사이클링** — 모달 안 모든 포커스 가능 요소를 wrap (Shift+Tab도)
3. **ESC 닫기** — 일반 모달 ESC ON, destructive(confirm) 모달은 ESC도 차단 가능
4. **backdrop 클릭** — 일반 모달 ON, destructive 모달은 차단
5. **포커스 복귀** — 닫힌 후 트리거 버튼으로 포커스 자동 복귀

### 9.3 Theme Visual

- 라이트 테마 (`theme-light` body class) — 8개 모달 외관 동등
- 다크 테마 (기본) — 8개 모달 외관 동등

### 9.4 Reduced Motion

- Windows 설정 → 접근성 → 시각 효과 → 애니메이션 OFF
- 8개 모달의 backdrop-blur, scale-in 애니메이션이 비활성화되는지 확인

---

## 10. Next Steps

1. [ ] Design 문서 작성 (`/pdca design modal-migration-batch-1`) — 8개 각각의 Before/After 코드 스니펫 포함
2. [ ] Do 단계 — 위 implementation order대로 8개 마이그레이션
3. [ ] Check 단계 — gap-detector 호출
4. [ ] Report 단계 — `git grep` 카운트 46→38 검증 + 후속 batch 권장

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-25 | Initial draft (frontend-architect + designer-high 협업 결과 반영) | pblsketch |
