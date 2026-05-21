---
template: report
version: 1.0
feature: notification-modal-stacking-fix
date: 2026-05-21
author: pblsketch (with Claude)
project: ssampin
version_target: v2.0.7 (Phase 0~4 통합)
match_rate: 97%
status: PASS — Iterate 불필요
---

# notification-modal-stacking-fix — Completion Report

> **사용자 신고 한 문장**: "처음 일정 알림이 뜨는데 X도 안 눌리고 창을 껐다 켜야 X를 누를 수 있습니다."
>
> **결과**: 핫픽스(Phase 0)로 즉시 해소 + 근본 정리(Phase 1~4)로 같은 부채 재발 구조적 차단. 5개 커밋, 17개 회귀 가드, 1503 테스트(46건 신규) 통과.

---

## 1. 신고-해결 매핑

### 1.1 사용자 신고 증상

앱 첫 실행 시 업데이트 안내 모달과 일정 알림이 동시에 뜨면서 X 버튼 클릭이 불가능. 앱을 종료/재실행해야 X 누를 수 있었음.

### 1.2 근본 원인

- **직접 원인**: `EventPopup`이 같은 `z-50` + `fixed inset-0` 평면에서 `UpdateNotification`보다 DOM 순서 늦게 렌더되어 위에 올라가며, wrapper에 `pointer-events: auto` 기본값으로 카드 바깥까지 클릭을 흡수 → 업데이트 모달의 X 가림.
- **"껐다 켜면 눌림" 메커니즘**: 앱 재시작 시 EventPopup이 `isDismissedToday()` 또는 빈 알림으로 안 뜨고 업데이트 모달만 남음 → X 정상 클릭.
- **구조적 부채**: z-index 평면 1개에 6개 모달(7개 호출처 포함 OAuth 3종)이 공존하며 DOM 순서로만 스태킹 결정. 우선순위 큐 없이 자유 노출.

### 1.3 해결 매핑

| 신고 측면                    | 해결 Phase                                                     | 커밋      |
| ---------------------------- | -------------------------------------------------------------- | --------- |
| X 안 눌림 (즉시)             | Phase 0 핫픽스 — backdrop dismiss, pointer-events, X 버튼 추가 | `4136527` |
| 시각 보존 + 접근성 자동 획득 | Phase 1 — EventPopup → Modal 베이스                            | `396b5b4` |
| 같은 부채 재발 방지 (인프라) | Phase 2 — ModalCoordinator 우선순위 큐                         | `3a9b3a9` |
| 6개 모달 직렬화              | Phase 3 — 모달 큐 등록 + SharePromptOverlay Modal 통합         | `50f6c6b` |
| 향후 신규 모달 회귀 차단     | Phase 4 — 메타테스트 + REGRESSION 9→17                         | `003eb1a` |

---

## 2. 작업 산출물

### 2.1 신규 파일 (4)

- [src/adapters/stores/useModalCoordinatorStore.ts](../../../src/adapters/stores/useModalCoordinatorStore.ts) — Zustand store, `ModalPriority` enum 7종, `selectHead` 순수 함수
- [src/adapters/hooks/useRegisterModal.ts](../../../src/adapters/hooks/useRegisterModal.ts) — 선언적 hook
- [src/adapters/components/common/ModalCoordinator.tsx](../../../src/adapters/components/common/ModalCoordinator.tsx) — 빈 마운트 시그널 컴포넌트
- [src/adapters/components/common/**tests**/ModalRegistry.test.ts](../../../src/adapters/components/common/__tests__/ModalRegistry.test.ts) — 18 정합성 메타테스트
- [src/adapters/stores/**tests**/useModalCoordinatorStore.test.ts](../../../src/adapters/stores/__tests__/useModalCoordinatorStore.test.ts) — 28 단위 테스트

### 2.2 수정 파일 (7)

| 파일                                                              | 변경                                |
| ----------------------------------------------------------------- | ----------------------------------- |
| `src/App.tsx`                                                     | `<ModalCoordinator />` 마운트       |
| `src/adapters/components/Dashboard/EventPopup.tsx`                | Modal 베이스 마이그레이션 + 큐 등록 |
| `src/adapters/components/common/UpdateNotification.tsx`           | 두 priority XOR 큐 등록             |
| `src/adapters/components/common/FirstSyncConfirmModal.tsx`        | FIRST_SYNC 큐 등록                  |
| `src/adapters/components/common/DriveSyncConflictModal.tsx`       | DRIVE_CONFLICT 큐 등록              |
| `src/adapters/components/Settings/modals/OAuthModalsProvider.tsx` | 3 sub-modal OAUTH_FLOW 등록         |
| `src/adapters/components/Share/SharePromptOverlay.tsx`            | Modal 통합 + SHARE_PROMPT 큐 등록   |
| `scripts/regression-grep-check.mjs`                               | REGRESSION #10~#17 추가             |

### 2.3 문서 (3)

- [docs/01-plan/features/notification-modal-stacking-fix.plan.md](../../01-plan/features/notification-modal-stacking-fix.plan.md) v1.1
- [docs/02-design/features/notification-modal-stacking-fix.design.md](../../02-design/features/notification-modal-stacking-fix.design.md) v1.1
- 본 Report

---

## 3. 우선순위 정책 (Phase 2 도입)

`useModalCoordinatorStore`의 `PRIORITY_ORDER`:

```
SECURITY_UPDATE  (0)  ← 보안 패치 강제, 모든 모달 후순위 밀어냄
FIRST_SYNC       (1)  ← 신규 기기 첫 동기화, 데이터 안전 우선
DRIVE_CONFLICT   (2)  ← 클라우드 충돌, resolve 전 다른 모달 차단
OAUTH_FLOW       (3)  ← 사용자 결정 2026-05-21: OAuth 도중 알림 대기
NORMAL_UPDATE    (4)
EVENT_ALERT      (5)  ← 일반 일정 알림
SHARE_PROMPT     (6)  ← 충성 사용자 공유 권유, 가장 후순위
```

동률 시 LIFO (`registeredAt` 큰 쪽 head).

---

## 4. 검증 게이트 (최종)

| 게이트                     | 결과                       | 비교                      |
| -------------------------- | -------------------------- | ------------------------- |
| `npx tsc --noEmit`         | ✅ 0 errors                | 동일                      |
| `npm run lint`             | ✅ 0 errors / 121 warnings | 기존 부채만               |
| `npx vitest run`           | ✅ **1503/1503**           | baseline 1457 + 신규 46   |
| `npm run regression-check` | ✅ **17/17**               | 기존 9 + 신규 8 (#10~#17) |

---

## 5. gap-detector 결과 — Match Rate **97% PASS**

### 5.1 카테고리별

| Category             |    Score     |
| -------------------- | :----------: |
| Plan FR-01~FR-10     | 10/10 (100%) |
| Design Goals (§1.1)  |  5/5 (100%)  |
| Design §4.1 매트릭스 |  6/6 (100%)  |
| 사용자 결정 사항     |  7/7 (100%)  |
| DoD Gates (§6.2)     | 7/8 (87.5%)  |

### 5.2 갭 항목 (Iterate 불필요)

**MEDIUM (1건)**

- `useRegisterModal` 자체 단독 테스트 파일 없음. Design §5.2에서 별도 명시했으나 store 테스트 28건 + 메타테스트 18건으로 hook 동작이 간접 검증되므로 기능 위험 낮음.

**LOW (2건)**

- OAuth 3개 sub-modal은 큐 등록은 하지만 자체 `fixed inset-0 z-50` 마크업 유지 (Modal 베이스 미사용). Plan/Design 범위 내(EventPopup + SharePromptOverlay만 Modal 통합 명시). focus-trap·ESC·body-lock 미획득은 후속 작업 가능.
- `useRegisterModal('OAUTH_FLOW', true)` 항상 `true` 패스. OAuth sub-modal은 부모 조건부 렌더로 마운트되므로 작동에 문제 없으나, Design §3.4 hook 시맨틱과 미세 차이.

**HIGH**: 없음.

---

## 6. 사용자 영향 (Before vs After)

### Before

- 첫 실행 시 업데이트 모달 + 일정 알림 동시 노출 → 업데이트 X 클릭 불가
- 앱 재시작 워크어라운드 필요
- z-50 평면에 6개 모달 자유 노출 — 향후 신규 모달 추가 시 같은 부채 잠재

### After

- 한 번에 한 모달만 화면에 노출 (큐 head)
- 우선순위 따라 자동 직렬화: 보안 업데이트 > 데이터 안전 > OAuth > 일반 알림
- EventPopup·SharePromptOverlay는 공용 Modal 베이스 사용 → focus-trap, ESC, backdrop dismiss, body scroll lock, ARIA dialog 자동 획득
- 메타테스트 + 회귀 grep 이중 안전망으로 신규 모달 큐 누락 차단

---

## 7. 사용자 확인 가이드

릴리즈 전 `npm run electron:dev` 로 다음 시나리오 확인:

1. **EventPopup 단독 노출**: 일정 알림이 떴을 때 X·확인·다시알림 모두 클릭 가능, ESC 키로 닫힘, backdrop 클릭으로 닫힘
2. **UpdateNotification + EventPopup 순차**: 둘 다 떴어도 업데이트 모달만 먼저 보이고, 닫으면 일정 알림 자동 노출
3. **SharePromptOverlay 통합**: 외관이 기존과 동등 (인지 가능한 차이 있으면 알려주세요)
4. **OAuth 흐름 도중 알림 대기**: 구글 연결 중에는 일정 알림이 끼어들지 않음

---

## 8. v2.0.7 릴리즈 워크플로우 (CLAUDE.md 8단계)

본 PDCA가 v2.0.7 단일 패치의 핵심 변경. 릴리즈 진행 시:

| 단계                               | 비고                                                                                                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. 버전 번호 6곳 갱신              | package.json, landing/src/config.ts, landing/src/app/layout.tsx, src/adapters/components/Layout/Sidebar.tsx, src/mobile/pages/SettingsPage.tsx, src/mobile/pages/MorePage.tsx |
| 2. public/release-notes.json       | highlights + changes 추가 (Plan §1.1 사용자 신고 인용 권장)                                                                                                                   |
| 3. 챗봇 KB                         | 변경 사항 거의 내부 인프라라 KB 갱신 항목 적음. "동시 알림 정렬" 정도 1건만.                                                                                                  |
| 4. 노션 사용자 가이드              | "알림이 한 번에 하나씩 뜹니다" 정도 짧은 안내                                                                                                                                 |
| 5. 커밋 + 푸시 (release: v2.0.7)   | 이미 5개 커밋 main 머지됨 — release 커밋만 추가                                                                                                                               |
| 6. Windows 빌드 (5단계 분리)       | EXIT 127 회피 패턴 — CLAUDE.md 참조                                                                                                                                           |
| 7. macOS 빌드 (GitHub Actions)     | `gh workflow run "Build macOS" --ref main`                                                                                                                                    |
| 8. GitHub Release + 4 URL 302 검증 | Win + macOS arm64/x64 모두 첨부                                                                                                                                               |

---

## 9. 커밋 히스토리

| 커밋      | Phase                                   | 라인 변경                          |
| --------- | --------------------------------------- | ---------------------------------- |
| `4136527` | Phase 0 핫픽스                          | +518 / -24 (3 files, 이전 세션)    |
| `396b5b4` | Phase 1 — EventPopup Modal 마이그레이션 | +873 / -100 (2 files, Design 포함) |
| `3a9b3a9` | Phase 2 — ModalCoordinator 인프라       | +454 (4 files 신규 + App.tsx)      |
| `50f6c6b` | Phase 3 — 6개 모달 큐 등록              | +302 / -185 (6 files)              |
| `003eb1a` | Phase 4 — 메타테스트 + REGRESSION       | +162 / -1 (2 files)                |
| **합계**  | 5 commits                               | **~2,300 라인 변경**               |

---

## 10. Out of Scope (의도적 미포함)

- 모바일 PWA(`src/mobile`) 동일 부채 — 별도 PDCA 필요
- OAuth 3 sub-modal의 Modal 베이스 마이그레이션 — 시각 영향 검증 부담, 큐 등록만으로 동시 노출 해결 충분
- Toast(z-sp-toast=60)·CommandPalette(z-sp-palette=70)·QuickAdd(별도 윈도우) — z 평면 분리, 큐 외부 유지
- Onboarding 모달 — 첫 실행 1회 흐름이 특수, 큐 외부 유지

---

## 11. 후속 추천 항목 (별도 PDCA)

1. **OAuth 모달 Modal 베이스 마이그레이션** — focus-trap·ESC·body-lock 자동 획득. 시각 영향 적음.
2. **모바일 PWA(src/mobile) 동일 부채 점검** — 동시 노출 모달이 있는지 grep + 큐 도입 여부 결정.
3. **`useRegisterModal` 단독 테스트** — 현재 store + 메타테스트로 간접 커버. 정식 hook 테스트 추가 (Design §5.2 후속).
4. **dev tools 패널** — ModalCoordinator entries 시각화로 큐 상태 디버깅 (Design §3.5 future-proofing).

---

## 12. 메모리 갱신

- [project_notification_modal_stacking_fix.md](../../../.claude/projects/e--github-ssampin/memory/project_notification_modal_stacking_fix.md) — Phase 0~4 완료 + Match Rate 97% PASS 추가
- [MEMORY.md](../../../.claude/projects/e--github-ssampin/memory/MEMORY.md) — Active Hotfix → Recently Completed 이동

---

## Version History

| Version | Date       | Changes                                                              | Author |
| ------- | ---------- | -------------------------------------------------------------------- | ------ |
| 1.0     | 2026-05-21 | Initial completion report — Phase 0~4 모두 완료, Match Rate 97% PASS | Claude |
