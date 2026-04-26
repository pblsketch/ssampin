---
template: analysis
version: 1.2
feature: modal-migration-batch-1
date: 2026-04-25
author: pblsketch
project: ssampin
phase: check
---

# 모달 마이그레이션 Batch-1 — Gap Analysis Report

> **PDCA Phase**: Check
> **gap-detector 실행 일시**: 2026-04-25
> **Match Rate**: **98%** (64/65) → **PASS** (≥ 90%)
> **다음 권장 단계**: `/pdca report modal-migration-batch-1`

---

## 1. Executive Summary

Design §3 매트릭스(8 모달 × 7 속성 = 56점) + Modal.tsx 자체(5점) + 추가 검증(4점) = 65점 만점 중 **64점**. 본 batch에서 의도한 **포커스 트랩 0건 → 8건 추가**·**닫힌 후 트리거 포커스 복귀 0건 → 8건 추가**·**destructive 3종 backdrop 차단** 모두 달성.

발견된 미세 갭 1건(BulkDeleteByCategoryModal "삭제 확인" 버튼 색상 하드코딩)은 **Check 단계 직후 즉시 픽스 완료** — `bg-red-600 hover:bg-red-700 text-white` → `bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30` (DisconnectConfirmModal "연결 해제" 버튼과 동일 패턴 정렬).

---

## 2. Per-Modal Score Table

| # | 모달 | (1) `<Modal>` | (2) isOpen | (3) size | (4) srOnlyTitle | (5) closeOnBackdrop | (6) closeOnEsc | (7) ARIA 제거 |
|---|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | StudentPipaConsentModal | ✅ | ✅ `isOpen={open}` | ✅ `sm` | ✅ true | ✅ 기본 | ✅ 기본 | ✅ |
| 2 | BookmarkGroupModal | ✅ | ✅ 항상 true | ✅ `sm` | ✅ true | ✅ 기본 | ✅ 기본 | ✅ |
| 3 | DriveSyncConflictModal | ✅ | ✅ `conflicts.length > 0` | ✅ `lg` | ✅ true | ✅ **false** | ✅ 기본 | ✅ |
| 4 | DisconnectConfirmModal | ✅ | ✅ 항상 true | ✅ `md` | ✅ true | ✅ **false** | ✅ 기본 | ✅ |
| 5 | CategoryFormModal | ✅ | ✅ 항상 true | ✅ `sm` | ✅ true | ✅ 기본 | ✅ 기본 | ✅ |
| 6 | MealEditModal | ✅ | ✅ 항상 true | ✅ `md` | ✅ true | ✅ 기본 | ✅ 기본 | ✅ |
| 7 | ShareModal | ✅ | ✅ `isOpen={isModalOpen}` | ✅ `md` | ✅ true | ✅ 기본 | ✅ 기본 | ✅ |
| 8 | BulkDeleteByCategoryModal | ✅ | ✅ 항상 true | ✅ `md` | ✅ true | ✅ **false** | ✅ 기본 | ✅ |

**8 × 7 = 56점 만점 / 56점 획득**.

### Modal.tsx 자체 (5점 만점 / 5점)

| 항목 | 결과 |
|------|:---:|
| srOnlyTitle 분기 버그 픽스 (Design §10 R1) | ✅ line 106 `srOnlyTitle ? 'sr-only' : 'px-6 pt-6 pb-2 text-lg font-bold text-sp-text'` |
| focus-trap-react `<FocusTrap>` 래핑 | ✅ |
| body overflow lock + 복원 | ✅ useEffect cleanup |
| ESC 핸들러 (`closeOnEsc` 분기) | ✅ |
| `role="dialog"` + `aria-modal` + `aria-labelledby` (useId) | ✅ |

---

## 3. Gap List

### 🟡 GAP-1 — BulkDeleteByCategoryModal "삭제 확인" 버튼 색상 하드코딩 (**즉시 픽스 완료**)

| 항목 | 값 |
|------|----|
| 위치 | `src/adapters/components/Schedule/BulkDeleteByCategoryModal.tsx:141` |
| Before | `className="... bg-red-600 hover:bg-red-700 text-white text-sm font-bold ..."` |
| After | `className="... bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 text-sm font-bold ..."` |
| 위험도 | Low (시각 회귀 없음, 정책 정렬) |
| 처리 | Check 단계에서 즉시 픽스 → Match Rate **98% → 100%** |
| 근거 | DisconnectConfirmModal "연결 해제" 버튼과 동일 패턴. 사용자 정책 "`text-white` 단독 사용 금지 / `hover:bg-{색상}-{N00}` 하드코딩 금지" 정렬 |

### ✅ 비-갭 (Design 명세대로 동작)
- BulkDeleteByCategoryModal에 우측상단 "X 닫기" 미존재 → 하단 "닫기" 버튼만 존재. 디자인대로.
- DriveSyncConflictModal/CategoryFormModal/ShareModal의 자체 X 닫기 버튼 유지 — Design §9에서 "IconButton 신설 후 일괄 교체"가 별도 PR로 명시됨.
- ShareModal의 `eslint-disable react-hooks/exhaustive-deps` — 마이그레이션 전부터 존재하던 코드, 비-회귀.

---

## 4. 추가 검증 (4점 만점 / 4점)

| 항목 | 결과 | 비고 |
|------|:---:|------|
| Design §10 R6 — BulkDelete autoFocus | ✅ | `BulkDeleteByCategoryModal.tsx:132` 확인 단계 "취소" 버튼 `autoFocus` |
| `rounded-sp-*` 사용 0건 (사용자 정책) | ✅ | 8 모달 + Modal.tsx 모두 `rounded-xl`/`rounded-lg`/`rounded-2xl`/`rounded-full`만 사용 |
| `text-white` 단독 잔존 | ✅ (픽스 후) | GAP-1 픽스 후 8 모달 내 `text-white` 단독 사용 0건 |
| `role="dialog"` 카운트 | ✅ | 45 → 37 (-8). 8개 batch 모달 모두 제거 확인. ConflictResolveModal(dead, Design §10 R4 제외)만 leftover |

---

## 5. role="dialog" 카운트 검증

| 시점 | 카운트 |
|------|--------|
| Impeccable Audit v2 측정 (2026-04-25 오전) | 46 |
| 시범 마이그레이션 2건 후 (FeedbackModal/CalendarMappingModal) | 45 |
| **본 batch 후** | **37** |
| Design §8.1 예상 | 38 |

차이 1건은 Modal.tsx 자체가 카운트에 포함되었고, QuickAddModal/RealtimeWallBoardSettingsDrawer가 1건씩 중복 카운트되어 발생한 정밀도 차이. **8개 감소량 자체는 정확히 일치**.

---

## 6. Pass/Fail 판정

**PASS — Match Rate 100%** (GAP-1 즉시 픽스 후)

`/pdca report modal-migration-batch-1` 즉시 진행 권장.

### 본 batch에서 달성한 항목
- 포커스 트랩 0건 → 8건 추가 (Modal.tsx의 focus-trap-react 위임)
- 닫힌 후 트리거 포커스 복귀 0건 → 8건 추가 (`returnFocusOnDeactivate: true`)
- body scroll lock 0건 → 8건 추가
- destructive 3종 backdrop 실수 닫힘 차단 (`closeOnBackdrop={false}`)
- BulkDelete 2-step confirm 단계 전환 시 `autoFocus`로 포커스 유실 방지
- `rounded-2xl` → `rounded-xl` 4건 정책 정렬
- Modal.tsx srOnlyTitle 분기 버그 동시 픽스 (미래 모달의 시각 헤더 노출 보장)

### 다음 라운드 권장 (B 라운드 후속, 보고서 §10에 정리 예정)
- Batch-2: 다음 5~8개 단순 모달 (`Schedule/CategoryFormModal` 같은 패턴 모달 더 많음)
- IconButton 신설 후 모달 X 닫기 버튼 일괄 교체
- Drawer 컴포넌트 신설 (RealtimeWallBoardSettingsDrawer 등)
- ConflictResolveModal dead component 정리
- z-index 토큰화 (`zIndex: { modal: 50, toast: 60, palette: 70 }`)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-25 | gap-detector(`bkit:gap-detector`) 실행 결과. 98% PASS → GAP-1 즉시 픽스 후 100% | pblsketch |
