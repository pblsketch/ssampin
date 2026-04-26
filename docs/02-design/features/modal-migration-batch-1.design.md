---
template: design
version: 1.2
feature: modal-migration-batch-1
date: 2026-04-25
author: pblsketch
project: ssampin
version_target: v1.11.x
---

# 모달 마이그레이션 Batch-1 Design Document

> **Summary**: 8개 단순 모달을 [`common/Modal.tsx`](../../../src/adapters/components/common/Modal.tsx)로 이전. 각 모달 prop 시그니처·store 의존·destructive 여부·시각 헤더 위치·`closeOnBackdrop`/`closeOnEsc` 매트릭스를 단정적으로 정의하고, 단순(StudentPipaConsentModal)·복잡(BulkDeleteByCategoryModal) 양 끝의 Before/After 스니펫으로 패턴 굳힘.
>
> **Project**: ssampin
> **Author**: pblsketch
> **Date**: 2026-04-25
> **Status**: Draft
> **Planning Doc**: [modal-migration-batch-1.plan.md](../../01-plan/features/modal-migration-batch-1.plan.md)

---

## 1. Overview

### 1.1 Design Goals

1. **포커스 트랩 0건 → 8건**: 8개 모달이 키보드 사용자에게도 모달 안에서만 Tab 사이클링하도록 보장
2. **닫힌 후 트리거 포커스 복귀 0건 → 8건**: WAI-ARIA APG 모달 패턴 준수
3. **외관 동등 유지**: 기존 `rounded-2xl` 4건은 사용자 정책(`rounded-xl=카드 기본`)에 맞춰 자연스럽게 정렬
4. **destructive 모달의 backdrop 실수 닫힘 차단**: 3개 destructive 모달에 `closeOnBackdrop={false}`
5. **변경 라인 최소화**: 각 모달에서 외곽 div 2층 + role/aria 수동 코드만 제거. 내부 콘텐츠는 동등 유지

### 1.2 Design Principles

- **Adapter 책임 일치**: Modal은 ARIA·focus·body lock·motion-reduce를 책임. 컨텐츠 모달은 자기 form/store/state만 책임. 기존 모달의 비즈니스 로직(`useShareStore`, `useCalendarSyncStore`)은 그대로 유지.
- **caller 변경 최소화**: 외부 prop 시그니처(`onClose`/`onCancel`/`onConfirm` 등)는 유지. 내부 구현만 Modal로 감쌈.
- **점진적 위험 노출**: 가장 단순한 모달 → 패턴 확립 → 복잡 모달. 회귀 1건 발견 시 즉시 멈춤.
- **사용자 정책 준수**: `rounded-xl`/`rounded-2xl` 혼재를 Modal 기본 `rounded-xl`로 정렬. `rounded-sp-*` 사용 금지(2026-04-24 명시).

---

## 2. Architecture

### 2.1 Component Diagram

```
┌────────────────────────────────────────────────────────┐
│ Caller (parent component)                              │
│   - state: isOpen / store.isOpen                       │
│   - handlers: onClose / onConfirm / onCancel           │
└──────────────────┬─────────────────────────────────────┘
                   │ props
                   ▼
┌────────────────────────────────────────────────────────┐
│ <Modal isOpen onClose title srOnlyTitle size           │
│        closeOnBackdrop closeOnEsc>                     │
│                                                        │
│   ▼ FocusTrap wrapper                                  │
│     ▼ backdrop div (onMouseDown)                       │
│       ▼ panel div (role=dialog, aria-modal,            │
│         aria-labelledby={useId})                       │
│         ▼ children (모달 본문, 기존 코드 그대로)        │
└────────────────────────────────────────────────────────┘
```

### 2.2 Migration Pattern (단정)

**Before** (모든 8개 공통 패턴):
```tsx
return (
  <>
    {/* overlay (또는 panel과 합쳐진 1-div) */}
    <div className="fixed inset-0 z-50 bg-black/X" onClick={onClose} aria-hidden="true" />
    {/* panel (또는 overlay와 같은 div) */}
    <div className="fixed ... pointer-events-none">
      <div role="dialog" aria-modal="true" aria-labelledby="modal-title-X"
           className="bg-sp-card rounded-2xl ring-1 ring-sp-border ...">
        <h2 id="modal-title-X">제목</h2>
        {/* 본문 */}
      </div>
    </div>
  </>
);
```

**After**:
```tsx
return (
  <Modal isOpen onClose={onClose} title="제목" srOnlyTitle size="md|lg" closeOnBackdrop={destructive ? false : true}>
    <h3>제목</h3> {/* 시각 헤더는 그대로 노출, h2가 Modal 안 sr-only로 별도 존재 */}
    {/* 본문 그대로 */}
  </Modal>
);
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| 8개 모달 | `common/Modal.tsx` | ARIA·focus·body lock 위임 |
| `common/Modal.tsx` | `focus-trap-react@^11.0.6` | Tab cycling, focus return |

호출처 변경 없음. 기존 caller가 `<TargetModal onClose={...} />` 형태로 호출하는 코드는 그대로.

---

## 3. Migration Matrix (8 모달 단정 매핑)

| # | 모달 | prop 시그니처 (변경 전) | isOpen 결정 | size | srOnlyTitle | closeOnBackdrop | closeOnEsc | destructive |
|---|------|-------------------------|-------------|------|:-----------:|:---------------:|:----------:|:-----------:|
| 1 | `StudentPipaConsentModal` | `{open, onClose, onConfirm}` | `open` (외부) → `isOpen={open}` | `sm` | true (h3 헤더 children) | true | true | ❌ |
| 2 | `BookmarkGroupModal` | `{group, onSave, onClose}` | parent unmount → `isOpen` 항상 true | `sm` | true | true | true | ❌ |
| 3 | `MealEditModal` | `{date, existingMeals, onSave, onClose}` | parent unmount → `isOpen` 항상 true | `md` | true | true | true | ❌ |
| 4 | `CategoryFormModal` | `{onSubmit, onClose}` | parent unmount → `isOpen` 항상 true | `sm` | true | true | true | ❌ |
| 5 | `DriveSyncConflictModal` | `{conflicts, onResolve, onClose}` | `conflicts.length === 0` → `isOpen={conflicts.length > 0}` | `lg` | true | **false** | true | ✅ |
| 6 | `DisconnectConfirmModal` | `{email, onConfirm, onCancel}` | parent unmount → `isOpen` 항상 true | `md` | true | **false** | true | ✅ |
| 7 | `ShareModal` | (no props, useShareStore) | `useShareStore().isModalOpen` → `isOpen={isModalOpen}` | `md` | true | true | true | ❌ |
| 8 | `BulkDeleteByCategoryModal` | `{categories, events, onDelete, onClose}` | parent unmount → `isOpen` 항상 true | `md` | true | **false** | true | ✅ |

**규칙**:
- destructive(취소불가 작업) = `closeOnBackdrop={false}`. ESC는 사용자 멘탈모델상 "취소 의도"라 ON 유지.
- store-driven (ConflictResolveModal/ShareModal/DriveSyncConflictModal): 모달 내부에서 store를 읽고 `isOpen`을 계산. caller는 무조건 마운트.
- parent unmount 패턴 (BookmarkGroupModal/CategoryFormModal/DisconnectConfirmModal/BulkDeleteByCategoryModal): caller가 conditional render. Modal에 `isOpen` 항상 `true` 전달 (Modal이 마운트되어있으면 열린 상태).
- StudentPipaConsentModal의 `open` prop은 단일 호출처 → `<Modal isOpen={open} ...>`로 매핑. caller 변경 불필요(prop 이름 그대로).

---

## 4. Code Snippets — 단순/복잡 양 끝

### 4.1 가장 단순: StudentPipaConsentModal (63 → ~50 lines)

**Before** ([파일](../../../src/adapters/components/Tools/RealtimeWall/StudentPipaConsentModal.tsx)):

```tsx
export function StudentPipaConsentModal({ open, onClose, onConfirm }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pipa-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-xl border border-sp-border bg-sp-card p-5 shadow-2xl">
        <h2 id="pipa-title" className="text-base font-bold text-sp-text mb-2">사진을 올리기 전에 잠깐!</h2>
        {/* ... */}
      </div>
    </div>
  );
}
```

**After**:

```tsx
import { Modal } from '@adapters/components/common/Modal';

export function StudentPipaConsentModal({ open, onClose, onConfirm }) {
  return (
    <Modal isOpen={open} onClose={onClose} title="사진을 올리기 전에 잠깐!" srOnlyTitle size="sm">
      <div className="p-5">
        <h3 className="text-base font-bold text-sp-text mb-2">사진을 올리기 전에 잠깐!</h3>
        {/* ... 나머지는 동일 */}
      </div>
    </Modal>
  );
}
```

**삭제된 라인**: 외곽 div + role/aria/onClick. **라인수**: 63 → ~50 (-20%).

### 4.2 가장 복잡: BulkDeleteByCategoryModal (161 → ~150 lines, destructive)

**Before** (요약, [파일](../../../src/adapters/components/Schedule/BulkDeleteByCategoryModal.tsx) 47-160):

```tsx
return (
  <div className="fixed inset-0 bg-black/60 ... z-50 p-4" onClick={onClose} aria-hidden="true">
    <div
      className="bg-sp-card border border-sp-border rounded-2xl w-full max-w-md shadow-2xl"
      onClick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title-bulk-delete-category"
    >
      <div className="px-6 py-5 border-b border-sp-border">
        <h3 id="modal-title-bulk-delete-category" className="text-lg font-bold text-sp-text">
          카테고리별 일정 삭제
        </h3>
        {/* ... 본문, isConfirming 단계 토글 ... */}
      </div>
    </div>
  </div>
);
```

**After**:

```tsx
import { Modal } from '@adapters/components/common/Modal';

return (
  <Modal isOpen onClose={onClose} title="카테고리별 일정 삭제" srOnlyTitle size="md" closeOnBackdrop={false}>
    <div className="px-6 py-5 border-b border-sp-border">
      <h3 className="text-lg font-bold text-sp-text">카테고리별 일정 삭제</h3>
      <p className="text-sm text-sp-muted mt-1">선택한 카테고리의 모든 일정을 삭제합니다.</p>
    </div>
    {/* ... isConfirming 단계 토글 그대로. focus-trap-react는 dynamic content를 자동으로 다시 측정 ... */}
  </Modal>
);
```

**핵심 결정**:
- `closeOnBackdrop={false}` — destructive(취소불가) 작업. 카테고리 일괄 삭제는 외부 동기화까지 영향.
- `closeOnEsc={true}` (기본) — ESC는 사용자 의도된 취소.
- `isConfirming` 2단계 UI는 children 안에 그대로. focus-trap-react는 mutation observer로 dynamic content를 추적하므로 추가 처리 불필요.

### 4.3 store-driven: ShareModal

**Before** (71-148):
```tsx
if (!isModalOpen) return null;
return (
  <>
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={closeModal} aria-hidden="true" />
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
      <div className="bg-sp-card rounded-2xl ring-1 ring-sp-border shadow-2xl w-full max-w-md pointer-events-auto animate-scale-in"
           role="dialog" aria-modal="true" aria-labelledby="modal-title-share">
        {/* ... */}
      </div>
    </div>
  </>
);
```

**After**:
```tsx
return (
  <Modal isOpen={isModalOpen} onClose={closeModal} title="동료 선생님께 추천" srOnlyTitle size="md">
    {/* 헤더 + 본문 그대로 */}
  </Modal>
);
```

**삭제**: `if (!isModalOpen) return null` 제거(Modal 내부에서 처리), 외곽 div 2층 제거. caller(`SharePromptOrchestrator` 등) 변경 불필요.

---

## 5. Visual Regression Analysis

### 5.1 rounded-2xl → rounded-xl 전환 (4건)

| 모달 | 기존 radius | After (Modal 기본) | 시각 영향 |
|------|------------|---------------------|----------|
| BookmarkGroupModal | `rounded-2xl` (16px) | `rounded-xl` (12px) | 4px 차이. 사용자 정책상 정렬됨 |
| ShareModal | `rounded-2xl` | `rounded-xl` | 동일 |
| CategoryFormModal | `rounded-2xl` | `rounded-xl` | 동일 |
| BulkDeleteByCategoryModal | `rounded-2xl` | `rounded-xl` | 동일 |

이 4건은 v1 audit 후 추가된 것으로 추정. 사용자 2026-04-24 정책 "rounded-xl=카드 기본"에 정렬되는 방향이라 회귀가 아님 — **개선**으로 분류.

### 5.2 backdrop opacity & blur

| 모달 | 기존 backdrop | After (Modal 기본) |
|------|---------------|---------------------|
| StudentPipaConsentModal | `bg-black/60` | `bg-black/60 backdrop-blur-sm` |
| BookmarkGroupModal | `bg-black/50` | `bg-black/60 backdrop-blur-sm` |
| ConflictResolveModal | `bg-black/50` | `bg-black/60 backdrop-blur-sm` |
| 기타 | 다양 | `bg-black/60 backdrop-blur-sm` |

backdrop-blur가 일관 적용. `prefers-reduced-motion` 시 `motion-reduce:backdrop-blur-none`로 해제(Modal에 이미 구현). 시각 일관성 ↑, 성능 영향 미미.

### 5.3 shadow

기존 `shadow-2xl` → Modal 기본 `shadow-sp-lg + ring-1 ring-white/5`. shadow-sp-lg는 v1.11.x Phase 1+2의 sp-shadow-lg 토큰(다크 테마는 Linear 5-layer). 다크 테마에서 더 정교, 라이트 테마에서 동등.

---

## 6. ARIA & Keyboard Spec

### 6.1 Per-modal a11y matrix

| 모달 | 마운트 자동 포커스 대상 | Tab cycle wrap | Esc 닫기 | backdrop 닫기 | 닫힌 후 포커스 복귀 |
|------|------------------------|:-------------:|:-------:|:-------------:|:-------------------:|
| StudentPipaConsent | "취소" 버튼 | ✅ | ✅ | ✅ | ✅ (이미지 첨부 트리거 |
| BookmarkGroup | 그룹명 input (autoFocus 유지) | ✅ | ✅ | ✅ | ✅ |
| MealEdit | 첫 식사유형 토글(중식 기본) | ✅ | ✅ | ✅ | ✅ |
| CategoryForm | 카테고리명 input (autoFocus) | ✅ | ✅ | ✅ | ✅ |
| **DriveSyncConflict** | 첫 "이 기기 유지" 버튼 | ✅ | ✅ | **❌(차단)** | ✅ |
| **DisconnectConfirm** | "취소" 버튼 (안전 기본값) | ✅ | ✅ | **❌(차단)** | ✅ |
| Share | "링크 복사" 버튼 | ✅ | ✅ | ✅ | ✅ |
| **BulkDeleteByCategory** | 첫 카테고리 버튼 | ✅ | ✅ | **❌(차단)** | ✅ |

**Note**: Modal의 `initialFocusRef` prop을 안 쓰는 경우 focus-trap이 자동으로 첫 포커스 가능 요소에 포커스. autoFocus가 있는 input(BookmarkGroup, CategoryForm)은 그대로 동작.

### 6.2 한국어 IME 처리

본 batch 8개 모두 input/textarea 안에서 ESC를 눌러 모달을 닫을 때 IME 조합 중이면 의도와 다르게 닫힐 수 있음. 다만:
- focus-trap-react는 IME 이벤트와 무관 (Tab만 처리)
- ESC 처리는 Modal.tsx의 `handleKeyDown`에서 함

**결정**: 이번 batch에서는 보강하지 않음. v2 시범 마이그레이션(Calendar/Feedback)에서 문제 보고 없었음. 후속 라운드에서 IME 사용 빈도 높은 form 모달(BookmarkFormModal 411 lines, EventFormModal 553 lines) 마이그레이션 시 Modal.tsx에 `e.isComposing` 체크 추가 검토.

---

## 7. Implementation Order (위험도 ↑)

Plan §8 그대로:

1. StudentPipaConsentModal (63) — 패턴 확립
2. BookmarkGroupModal (99) — form/autoFocus 패턴
3. DriveSyncConflictModal (109) — `closeOnBackdrop=false` 첫 적용
4. DisconnectConfirmModal (113) — destructive 패턴 굳힘
5. CategoryFormModal (109) — Schedule form
6. MealEditModal (138) — Meal form (ConflictResolveModal 대체)
7. ShareModal (150) — store-driven + analytics
8. BulkDeleteByCategoryModal (161) — destructive + 2-step confirm + 단계 전환 시 `autoFocus` 추가 필수

각 단계 사이 `npx tsc --noEmit` 즉시 확인.

---

## 8. Verification

### 8.1 Automated

```bash
npx tsc --noEmit                                                  # 0 errors
npx vite build                                                    # 성공
git grep 'role="dialog"' src/adapters/components --include='*.tsx' | wc -l   # 46 → 38 (-8)
```

### 8.2 Manual (8 모달 × 5점 체크 = 40점)

각 모달에 대해:
- [ ] 마운트 시 첫 포커스 대상에 포커스 (위 §6.1)
- [ ] Tab/Shift+Tab 모달 안 wrap
- [ ] ESC: 일반은 닫힘, destructive 3종도 ESC는 닫힘 허용 (멘탈모델)
- [ ] backdrop 클릭: 일반 닫힘, destructive 3종(DriveSyncConflict/DisconnectConfirm/BulkDeleteByCategory) 차단
- [ ] 닫힌 후 트리거 버튼에 포커스 복귀

### 8.3 Visual

- 라이트(`theme-light` body) + 다크 양 테마 8 × 2 = 16 스크린샷 확인
- backdrop-blur가 라이트 테마에서 너무 어둡게 보이지 않는지(기본 `bg-black/60` 적정)

### 8.4 Reduced Motion

- Windows 설정 → 접근성 → 시각 효과 OFF → 8 모달 모두 backdrop-blur·scale-in 제거 확인

---

## 9. Out-of-scope Risks (다음 batch에서 처리)

- focus-trap이 contenteditable 내부 포커스를 어떻게 다루는지 검증 — 본 batch에 contenteditable 모달 없음
- 한국어 IME composing 중 ESC 차단 — Modal.tsx 보강 후 BookmarkFormModal 등에서 검증
- z-index 토큰화 (`tailwind.config.zIndex: { modal: 50, toast: 60, palette: 70 }`) — 별도 PR
- IconButton 신설 후 모달 닫기 X 버튼 일괄 교체 — 별도 PR
- ConflictResolveModal — dead component(import처 0건). 본 batch에서 제외, 별도 PR로 삭제 또는 SyncStatusBar 등에 실 연동
- BookmarkGroupModal caller(`BookmarkSidebar` 등)를 conditional render → `isOpen` prop 패턴으로 전환 권장 (focus-trap의 `returnFocusOnDeactivate` 신뢰도 ↑) — 본 batch는 caller 변경 없이 진행, 권장 사항으로만 명시

---

## 10. Background Review Findings 반영 (2026-04-25, frontend-architect)

| # | 검토 항목 | 결정 |
|---|----------|------|
| R1 | **Modal.tsx `srOnlyTitle` 분기 버그** — 양쪽 분기 모두 `'sr-only'` 반환 | 즉시 수정 완료. `srOnlyTitle=false` 시 `px-6 pt-6 pb-2 text-lg font-bold text-sp-text` 적용 |
| R2 | StudentPipaConsentModal `open` prop 유지 + 내부 `<Modal isOpen={open}>` 패스스루 | 채택. caller 변경 없음 |
| R3 | StudentPipaConsentModal z-[60] vs Modal z-50 | StudentSubmitForm 자체에 z-50 위 레이어 없음 → z-50 충분, panelClassName 불필요 |
| R4 | ConflictResolveModal **import처 0건 (dead component)** | batch-1에서 제외, MealEditModal로 대체 |
| R5 | ShareModal store 내부 접근 패턴 | 채택. App.tsx:867는 prop 없이 `<ShareModal />`이라 인터페이스 변경 불필요. SurveyStudentDetail의 `<ShareModal>`은 다른 컴포넌트(미관계) |
| R6 | BulkDeleteByCategoryModal isConfirming 단계 전환 시 `autoFocus` 추가 | 채택. focus-trap-react는 새로 마운트된 `autoFocus` 요소로 자동 이동 |
| R7 | BookmarkGroupModal parent unmount → isOpen prop 전환 권장 | **본 batch는 caller 변경 없이 진행** (위험 격리). 권장 사항으로 §9에 명시. focus 복귀 누락 시 후속 PR에서 처리 |

---

## 10. Next Steps

1. [x] Plan 문서 작성
2. [x] Design 문서 작성 (이 문서)
3. [ ] `/pdca do modal-migration-batch-1` — 위 §7 순서로 8개 마이그레이션 실행
4. [ ] `/pdca analyze modal-migration-batch-1` — gap-detector로 Match Rate 측정
5. [ ] `/pdca report modal-migration-batch-1` — 완료 보고서

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-25 | Initial design (8 모달 매트릭스 + Before/After 양 끝 + a11y 매트릭스). frontend-architect 백그라운드 검토 동시 진행 | pblsketch |
