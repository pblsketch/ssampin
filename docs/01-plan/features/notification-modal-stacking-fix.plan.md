---
template: plan
version: 1.1
feature: notification-modal-stacking-fix
date: 2026-05-21
author: pblsketch
project: ssampin
version_target: v2.0.7 (Phase 0~4 통합 — 사용자 결정 2026-05-21)
---

# Plan — 알림 모달 겹침·클릭 차단 핫픽스 + 근본 정리

> **요약**: 사용자 신고 "처음 일정 알림이 떠 있을 때 닫기 X가 안 눌리고 창을 껐다 켜야 누를 수 있다"의 직접 원인(EventPopup이 같은 z-50 모달인 UpdateNotification을 위에서 가림)을 즉시 핫픽스(Phase 0)로 해소하고, **동시 노출되는 6개 z-50 모달 전체의 스태킹·포커스·접근성 부채를 근본 정리**(Phase 1~4)한다.
>
> **사용자 영향 한 문장**: 화면에 모달이 두 개 동시에 떠도 항상 위에 뜬 모달의 버튼이 클릭되고, 닫으면 다음 모달이 자동으로 올라오게 된다.
>
> **Project**: ssampin (쌤핀)
> **Status**: v1.1 — 사용자 5개 Open Question 확정 (2026-05-21)
> **우선순위**: 🔴 P0 (Phase 0) / 🟡 P1 (Phase 1~4)
> **트리거**: 사용자 신고 (2026-05-21)
>
> **사용자 확정 사항 (2026-05-21)**:
>
> 1. 릴리즈 묶음: **v2.0.7 단독 패치** (Phase 0+1~4 통합)
> 2. 일정: **v2.0.7에서 Phase 0~4 모두 반영**
> 3. OAuth 모달: **큐에 편입 (OAUTH_FLOW priority)** — OAuth 흐름 중 다른 알림 모두 대기 (사용자 친화적 직렬화)
> 4. frontend-design 협업: **Phase 1에서 호출**
> 5. Feature 이름: `notification-modal-stacking-fix` 확정

---

## 1. 사용자 신고 요약

### 1.1 증상

> "처음 일정 알림이 뜨는데 X도 안 눌리고 창을 껐다 켜야 X를 누를 수 있습니다."

### 1.2 재현 시나리오 (추정)

1. 앱 첫 실행 (또는 업데이트 직후 첫 실행)
2. 업데이트 안내 모달(가운데, 420px, 우상단 X 있음)이 자동으로 뜸
3. 거의 동시에 오늘 행사 알림(EventPopup, 가운데, 480px, X 없음)이 뜸
4. 사용자가 업데이트 모달의 X를 누르려 하지만 클릭이 안 됨
5. 앱을 종료 후 재실행 → 그날 EventPopup은 `isDismissedToday()` 또는 빈 알림으로 안 뜨고 → 업데이트 모달만 남아 X가 정상적으로 눌림

---

## 2. 근본 원인 분석

### 2.1 직접 원인 — 같은 z-index에서 DOM 순서로만 결정되는 스태킹

[App.tsx:1098-1099](../../../src/App.tsx#L1098-L1099)

```jsx
<UpdateNotification />   // ← 먼저 렌더 (z-sp-modal=50)
<EventPopup />           // ← 나중 렌더 (z-50) — 위에 올라감
```

[EventPopup.tsx:108-113](../../../src/adapters/components/Dashboard/EventPopup.tsx#L108-L113)

```jsx
<div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />      // 전체 화면 backdrop
<div className="fixed inset-0 z-50 flex items-center justify-center p-4"> // 전체 화면 wrapper
  <div className="w-full max-w-[480px] ...">                              // 가운데 480px 카드
```

EventPopup의 두 형제 div는 모두 `fixed inset-0`(=화면 전체)이고 `pointer-events`가 기본값 `auto`다. 즉 **카드 바깥 빈 영역까지 모든 클릭을 흡수**한다. 같은 회사 코드의 [SharePromptOverlay.tsx:38](../../../src/adapters/components/Share/SharePromptOverlay.tsx#L38)는 이미 wrapper에 `pointer-events-none` + 카드에 `pointer-events-auto`를 적용해 같은 함정을 피하고 있는데, EventPopup만 누락이다.

### 2.2 "껐다 켜야 눌린다"의 메커니즘

[useEventsStore.ts:137-138, 398-401](../../../src/adapters/stores/useEventsStore.ts#L137-L138)

```js
function isDismissedToday(): boolean {
  return localStorage.getItem(POPUP_DISMISSED_KEY) === getTodayString();
}
dismissPopup: () => {
  localStorage.setItem(POPUP_DISMISSED_KEY, getTodayString());
  set({ showPopup: false });
}
```

사용자가 첫 세션에서 EventPopup 카드 가운데 "확인"을 한 번이라도 눌렀거나, 다음 실행 시 같은 날짜로 dismissed 키가 살아있으면 EventPopup이 안 뜬다 → 업데이트 모달만 남아 X 클릭 가능.

### 2.3 구조적 부채 — z-50 단일 평면에 6개 모달이 공존

전수 grep 결과 같은 `z-50` / `z-sp-modal(=50)` + `fixed inset-0` 패턴으로 **동시 노출 가능한 모달이 6개**:

| 컴포넌트                                                                                                    | z-index    | App.tsx 렌더 순서 | Modal 베이스 사용 | pointer-events 패턴 |
| ----------------------------------------------------------------------------------------------------------- | ---------- | ----------------- | ----------------- | ------------------- |
| [UpdateNotification](../../../src/adapters/components/common/UpdateNotification.tsx) (Modal)                | z-sp-modal | 1                 | ✅                | Modal 내장          |
| **[EventPopup](../../../src/adapters/components/Dashboard/EventPopup.tsx)**                                 | **z-50**   | **2**             | **❌**            | **❌ 누락**         |
| [DriveSyncConflictModal](../../../src/adapters/components/common/DriveSyncConflictModal.tsx) (Modal)        | z-sp-modal | 5 (조건부)        | ✅                | Modal 내장          |
| [FirstSyncConfirmModal](../../../src/adapters/components/common/FirstSyncConfirmModal.tsx) (Modal)          | z-sp-modal | 6                 | ✅                | Modal 내장          |
| [SharePromptOverlay](../../../src/adapters/components/Share/SharePromptOverlay.tsx)                         | z-sp-modal | 9                 | ❌                | ✅ 적용             |
| [OAuthModalsProvider](../../../src/adapters/components/Settings/modals/OAuthModalsProvider.tsx) PKCE 등 3개 | z-50       | 12 (조건부)       | ❌                | ❌ 누락             |

**핵심 부채**: z-index 평면이 하나라서 누가 위에 뜨는지 DOM 순서로만 결정되며, 디자이너/구현자가 "내 모달이 가장 중요"라고 가정하면 충돌한다. 우선순위 큐 없이 자유 노출.

---

## 3. 솔루션 비교

### 옵션 A — 핫픽스만 (Phase 0 단독)

EventPopup의 wrapper에 `pointer-events-none` + 카드에 `pointer-events-auto` + 우상단 X 버튼 추가.

- ✅ 즉시 사용자 영향 해소 (~15줄 변경)
- ✅ 회귀 위험 거의 없음 (검증된 SharePromptOverlay 패턴 그대로 복제)
- ❌ 같은 함정이 다른 4개 모달에 잠재 — 다음 신고가 또 들어옴
- ❌ 디자인 토큰 부채(`z-50` 레거시) 미해소

### 옵션 B — Phase 0 + Phase 1 (EventPopup만 Modal 마이그레이션)

핫픽스 + EventPopup을 공용 [Modal](../../../src/adapters/components/common/Modal.tsx)로 이전.

- ✅ EventPopup이 자동으로 focus-trap + ESC + backdrop dismiss + 포커스 복귀 획득
- ✅ z-sp-modal 토큰 통일
- ❌ OAuthModalsProvider 3개 모달과 SharePromptOverlay는 여전히 큐 없음
- ❌ 동시 노출 시 첫 모달이 가려지는 문제는 그대로 (다른 컴포넌트끼리)

### 옵션 C — Phase 0 + Phase 1 + Phase 2 (모달 우선순위 큐 도입) — **선택**

핫픽스 + EventPopup 마이그레이션 + **ModalCoordinator** 신설로 동시 노출을 직렬화.

- ✅ "한 번에 한 모달"이 보장됨 — 스태킹 충돌 자체가 사라짐
- ✅ 우선순위 규칙으로 보안 업데이트 > 일정 알림 > 공유 권유 등 정책 명문화
- ✅ 새 모달 추가 시 큐에 등록만 하면 자동 직렬화
- ⚠️ 신규 컴포넌트(`useModalCoordinator` 훅 + 우선순위 enum) 작성 필요
- ⚠️ 6개 모달 호출처 수정 (호출처별 5~10줄)

### 옵션 D — 옵션 C + Phase 3 (OAuth/Share/Conflict까지 큐 등록)

Phase 3로 형제 4개 모달을 모두 큐에 편입.

- ✅ 100% 직렬화 보장
- ⚠️ Phase 3 작업량 약 +30%
- ⚠️ OAuthModalsProvider는 모달 3개가 자체 store 분기로 노출되므로 큐 어댑터 필요

### 결정 — **옵션 D 채택** (Phase 0~4 모두)

이유:

1. 사용자가 명시적으로 "근본 정리"를 요청
2. 같은 z-50 평면 부채가 [feedback_release_card_news_style](../../../.claude/projects/e--github-ssampin/memory/feedback_release_card_news_style.md) 등 디자인 부채 종결 흐름의 마지막 잔재
3. **v2.0.6은 이미 릴리즈됨(2026-05-20)**. Phase 0~4 모두 **다음 릴리즈인 v2.0.7에 통합 출시** (사용자 결정 2026-05-21)
4. 회귀 위험 격리는 머지 순서로 처리 — Phase 0를 가장 먼저 main에 머지해 핫픽스 효과를 확보한 뒤, Phase 1~4를 단계별로 추가 머지. Phase 4 메타테스트 통과 시점이 v2.0.7 릴리즈 게이트

---

## 4. Scope

### 4.1 In Scope

**모든 Phase는 v2.0.7 단일 릴리즈에 통합.** 머지 순서는 Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 로 단계별. Phase 0이 main에 들어가는 즉시 핫픽스 효과 확보, 이후 단계는 회귀 격리하며 누적.

**Phase 0 — 즉시 핫픽스 (main 머지 1순위)**

- EventPopup wrapper `pointer-events-none` + 카드 `pointer-events-auto`
- EventPopup 카드 우상단 X(close) 버튼 추가 — UpdateNotification과 동일 패턴
- EventPopup backdrop 클릭으로 dismiss 가능 (현재 카드만 클릭 가능)

**Phase 1 — EventPopup Modal 마이그레이션**

- [EventPopup.tsx](../../../src/adapters/components/Dashboard/EventPopup.tsx)를 공용 [Modal](../../../src/adapters/components/common/Modal.tsx) 컴포넌트 기반으로 재작성
- 두 형제 div 구조 제거 → Modal 한 번
- `z-50` 하드코딩 → `z-sp-modal` 토큰
- focus-trap + body scroll lock + ARIA dialog 자동 획득
- **frontend-design 에이전트 협업 의무** (사용자 정책 [feedback_frontend_agent_collaboration.md](../../../.claude/projects/e--github-ssampin/memory/feedback_frontend_agent_collaboration.md))

**Phase 2 — 모달 우선순위 큐(ModalCoordinator) 신설**

- 신규 파일: `src/adapters/components/common/ModalCoordinator.tsx` + `src/adapters/stores/useModalCoordinatorStore.ts`
- 우선순위 enum: `SECURITY_UPDATE > FIRST_SYNC > DRIVE_CONFLICT > OAUTH_FLOW > NORMAL_UPDATE > EVENT_ALERT > SHARE_PROMPT`
- 등록된 모달은 큐 head만 렌더, 닫히면 다음 head 자동 노출
- LIFO 푸시 + priority sort + dismiss 콜백

**Phase 3 — 형제 모달 6종 큐 등록**

- [FirstSyncConfirmModal](../../../src/adapters/components/common/FirstSyncConfirmModal.tsx) → `FIRST_SYNC` priority
- [DriveSyncConflictModal](../../../src/adapters/components/common/DriveSyncConflictModal.tsx) → `DRIVE_CONFLICT`
- [OAuthModalsProvider](../../../src/adapters/components/Settings/modals/OAuthModalsProvider.tsx) 3개 모달 → `OAUTH_FLOW` (**사용자 결정**: OAuth 도중 다른 알림 모두 대기)
- [UpdateNotification](../../../src/adapters/components/common/UpdateNotification.tsx) → `NORMAL_UPDATE` (보안 패치 시 `SECURITY_UPDATE`)
- [EventPopup](../../../src/adapters/components/Dashboard/EventPopup.tsx) → `EVENT_ALERT`
- [SharePromptOverlay](../../../src/adapters/components/Share/SharePromptOverlay.tsx) → `SHARE_PROMPT` (자체 backdrop 제거)

**Phase 4 — 회귀 차단 메타테스트 + 정합성 가드**

- 신규: `src/adapters/components/common/__tests__/ModalCoordinator.test.tsx` (큐 우선순위·LIFO·dismiss 콜백)
- 신규 메타테스트: "Dashboard/EventPopup이 z-sp-modal 토큰을 쓴다"
- 신규 메타테스트: "동시 노출 가능한 모달은 ModalCoordinator를 통과해야 한다" — App.tsx에서 z-sp-modal + fixed inset-0 패턴 카운트가 큐 등록 카운트와 같은지

### 4.2 Out of Scope

- 모바일 PWA(`src/mobile`)의 동일 부채 — 별도 코드베이스, 별도 PDCA
- z-index 5단계 토큰(`sp-dropdown/modal/toast/palette/tooltip`) 자체 재설계 — 이미 [tailwind.config.js:109-117](../../../tailwind.config.js#L109)에 도입됨, 본 작업은 사용만
- [Onboarding](../../../src/adapters/components/Onboarding/Onboarding.tsx)·[Toast](../../../src/adapters/components/common/Toast.tsx) — z-index 평면이 달라서 본 부채와 무관 (Toast=z-sp-toast=60)
- [CommandPalette](../../../src/adapters/components/common/CommandPalette.tsx) — z-sp-palette(70), 사용자 트리거 명시적이라 큐 불필요

### 4.3 Non-Goals

- EventPopup 시각 디자인 리뉴얼 (Phase 1은 동작 보존, 시각 동등)
- 모달 애니메이션 통일 (별도 디자인 시스템 작업)
- IconButton 컴포넌트 신설 (이미 v3.2에 신설됨, 본 작업은 사용)

---

## 5. Requirements

### 5.1 Functional Requirements

| ID    | Requirement                                                                             | Phase | Priority |
| ----- | --------------------------------------------------------------------------------------- | ----- | -------- |
| FR-01 | EventPopup 카드 우상단에 X 버튼이 있고 클릭 시 `dismissPopup()` 호출                    | 0     | High     |
| FR-02 | EventPopup wrapper의 카드 바깥 영역 클릭이 다른 모달(예: UpdateNotification)로 통과     | 0     | High     |
| FR-03 | EventPopup backdrop 클릭 시 dismiss (현재 미동작)                                       | 0     | Medium   |
| FR-04 | EventPopup이 공용 Modal 베이스를 사용하며 focus-trap + ESC + body scroll lock 자동 적용 | 1     | High     |
| FR-05 | ModalCoordinator가 동시 등록된 모달 중 우선순위 가장 높은 1개만 렌더                    | 2     | High     |
| FR-06 | 큐 head 모달 dismiss 시 다음 우선순위 모달 자동 노출                                    | 2     | High     |
| FR-07 | 보안 업데이트(`isSecurity=true`)는 다른 모달 강제 후순위로 밀고 즉시 노출               | 2     | High     |
| FR-08 | 큐 등록은 hook 한 줄 (`useRegisterModal(priority, isOpen, render)`)                     | 2     | Medium   |
| FR-09 | 6개 형제 모달이 모두 큐를 통과                                                          | 3     | High     |
| FR-10 | 메타테스트가 "큐 미등록 z-sp-modal 모달 신규 추가"를 감지                               | 4     | High     |

### 5.2 Non-Functional Requirements

| Category         | Criteria                                                                         |
| ---------------- | -------------------------------------------------------------------------------- |
| Performance      | Modal 마운트 추가 시간 < 5ms (현재 EventPopup은 자체 div 2개라 오히려 줄어듦)    |
| Accessibility    | WCAG 2.1 AA — EventPopup이 dialog ARIA 패턴 준수, Tab 순환, 포커스 복귀          |
| Compatibility    | Electron(Chromium) + 브라우저 양쪽 동작 (`npm run electron:dev` + `npm run dev`) |
| Bundle Size      | ModalCoordinator는 ~3KB 추가 (zustand store + 작은 컴포넌트)                     |
| Backwards Compat | localStorage 키(`ssampin:event-popup-dismissed`, `-snoozed`) 유지                |

---

## 6. Success Criteria

### 6.1 Phase 0 Definition of Done (v2.0.7 머지 1순위)

- [ ] EventPopup 카드 우상단 X 버튼 노출 + 클릭 시 dismiss
- [ ] EventPopup wrapper 영역 클릭이 뒤 모달로 통과 (수동 검증: UpdateNotification과 함께 띄워 X 클릭 가능)
- [ ] EventPopup backdrop 클릭 시 dismiss
- [ ] 검증 게이트 4/4 통과 (tsc 0 / lint 0 / test all pass / regression 9/9)
- [ ] main 머지 (v2.0.7 릴리즈 전 사용자가 npm run electron:dev 로 즉시 검증 가능)

### 6.2 Phase 1~4 Definition of Done (v2.0.7 릴리즈 게이트)

- [ ] EventPopup이 Modal 베이스 사용, 자체 fixed/z-50 코드 0줄
- [ ] `git grep "z-50\|fixed inset-0" src/adapters/components/Dashboard/EventPopup.tsx` 0건
- [ ] `useModalCoordinatorStore` + `ModalCoordinator` 컴포넌트 신규
- [ ] 6개 모달이 큐 등록 — App.tsx 렌더 트리에서 직접 호출 → ModalCoordinator 단일 마운트로 통합
- [ ] ModalCoordinator 단위 테스트 (큐 push/pop, 우선순위 sort, dismiss 콜백) 20+ 케이스
- [ ] 메타테스트 통과 — 신규 z-sp-modal 패턴 검출 시 큐 등록 강제
- [ ] 검증 게이트 4/4 통과
- [ ] PROGRESS.md In Progress 등록 + v2.0.7 후보 항목 추가

### 6.3 Quality Criteria

- [ ] 변경 파일 수 ≤ 12 (Phase 0=1 파일, Phase 1~4=11 파일)
- [ ] EventPopup 라인수 203 → 약 130 (-35%, focus-trap/wrapper 코드 제거분)
- [ ] 시각 회귀 0건 — 라이트/다크 모두 EventPopup 외관 동등
- [ ] 기능 회귀 0건 — 일정 알림·업데이트·드라이브 동기화·OAuth 흐름 6종 수동 검증

---

## 7. Risks and Mitigation

| Risk                                                                                             | Impact | Likelihood | Mitigation                                                                                                                                       |
| ------------------------------------------------------------------------------------------------ | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phase 0 핫픽스가 다른 z-50 모달과 새로운 stacking 충돌 유발                                      | Medium | Low        | `pointer-events-none` 패턴은 SharePromptOverlay에 이미 검증됨. 카드 자체는 같은 z-50 유지 → 시각적으로만 위치 보존                               |
| Phase 1 마이그레이션 시 EventPopup의 카테고리 아이콘·D-Day 배지·날짜 헤더가 Modal 패딩과 충돌    | Medium | Medium     | Modal `panelClassName` prop으로 패딩 오버라이드. Before/After 스크린샷 비교                                                                      |
| Phase 2 큐가 race condition으로 두 모달 동시 노출                                                | High   | Low        | Zustand store atomic update + render-time priority check. 단위 테스트 우선순위 케이스 20+                                                        |
| Phase 3 OAuthModalsProvider의 3개 모달이 같은 OAUTH_FLOW priority라 서로 큐 안에서 충돌          | Medium | Medium     | OAuth 흐름은 본질적으로 sequential (PKCE → error → fallback). 한 번에 하나만 트리거되도록 OAuthModalsProvider 내부에서 보장 (이미 코드상 그러함) |
| FirstSyncConfirmModal이 `closeOnBackdrop=false` + `closeOnEsc=false`인데 큐에서 강제 후순위 밀림 | High   | Low        | 우선순위에서 FIRST_SYNC를 SECURITY_UPDATE 다음 두 번째로 배치. 보안 업데이트만이 밀어낼 수 있음                                                  |
| 사용자가 "확인" 버튼 위치를 학습한 상태라 X 버튼 신설이 혼란                                     | Low    | Low        | "확인" 버튼은 유지, X 추가만. 디자인 시스템 가이드(Modal 헤더 X)와 일관                                                                          |
| Phase 2 도중 또 다른 신고가 들어와 Phase 0 만으로 끝내야 할 수 있음                              | Medium | Medium     | Phase 0를 v2.0.6에 즉시 묶고, Phase 1~4는 v2.1.0으로 분리해 독립 진행                                                                            |

---

## 8. Architecture Considerations

### 8.1 Project Level

Enterprise (Clean Architecture 4 layers). 본 작업은 모두 `adapters` 레이어 안에서 완결.

### 8.2 Key Architectural Decisions

| Decision                             | Selected                                                                       | Rationale                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| 큐 구현 위치                         | `adapters/stores` (Zustand) + `adapters/components/common` (renderer)          | UI 상태이므로 adapters. usecases/domain 의존 없음                          |
| 우선순위 정의                        | enum 상수 (string union)                                                       | 새 priority 추가는 1줄, 컴파일 타임 검사                                   |
| 동시 동일 priority 처리              | LIFO (나중에 등록된 것이 먼저 노출)                                            | 사용자가 가장 최근 트리거한 액션 우선이 자연스러움                         |
| 큐 외부 모달 (Toast, CommandPalette) | 큐 미적용                                                                      | z-index 평면이 다름 (z-sp-toast=60, z-sp-palette=70), 사용자 트리거 명시적 |
| EventPopup 카드 외관                 | Phase 1에서 Modal 베이스로 이관하되 카드 내부(아이콘·D-Day 배지·날짜)는 그대로 | 시각 보존                                                                  |

### 8.3 Clean Architecture Approach

- `adapters/stores/useModalCoordinatorStore.ts`: 큐 상태 (UI state)
- `adapters/components/common/ModalCoordinator.tsx`: head 모달 단일 렌더
- 각 모달은 `useRegisterModal` 훅으로 자기 자신을 큐에 등록 → coordinator가 우선순위 head만 마운트
- `domain` / `usecases` 의존 0건 (UI 상태이므로 적절)

### 8.4 호환 가드

- localStorage 키 변경 없음 (`ssampin:event-popup-dismissed`, `-snoozed`)
- `useEventsStore`의 `showPopup` / `dismissPopup` / `snoozePopup` API 변경 없음 (Phase 1에서 EventPopup 내부만 Modal로 교체)
- `UpdateNotification`의 `useUpdatePreferencesStore` API 변경 없음

---

## 9. Convention Prerequisites

### 9.1 Existing Project Conventions

- [x] [`CLAUDE.md`](../../../CLAUDE.md) Clean Architecture 4 layers
- [x] [docs/design-system.md](../../design-system.md) sp-\* 토큰 사용
- [x] [docs/coding-conventions.md](../../coding-conventions.md) TypeScript strict
- [x] 라운드 정책: 직각 금지, `rounded-xl=카드 기본`
- [x] [feedback_frontend_agent_collaboration.md](../../../.claude/projects/e--github-ssampin/memory/feedback_frontend_agent_collaboration.md) — 디자인 작업은 frontend-design 에이전트 협업 의무

### 9.2 Conventions to Verify

- Phase 1 EventPopup 디자인 변경 시 frontend-design 에이전트 검토 필수
- Modal 헤더 X 버튼은 [Modal.tsx](../../../src/adapters/components/common/Modal.tsx)의 기본 close 패턴 따름 (`aria-label="닫기"`, `type="button"`)
- ModalCoordinator 신설 시 [project_modal_component_b_round.md](../../../.claude/projects/e--github-ssampin/memory/project_modal_component_b_round.md) 라운드 정책 부합 확인

---

## 10. Implementation Order

### Phase 0 — 즉시 핫픽스 (단일 세션, ~30분)

1. `EventPopup.tsx:109` overlay에 `onClick={dismissPopup}` 추가
2. `EventPopup.tsx:112` wrapper에 `pointer-events-none` + 카드에 `pointer-events-auto` 추가
3. 카드 헤더(115줄 근방)에 우상단 X 버튼 추가 — UpdateNotification 스타일(`-mt-1 -mr-1 p-1 rounded-lg`) 복제
4. 검증 게이트 4/4 → 사용자 신고 회신 → v2.0.6 묶음 머지

### Phase 1 — EventPopup Modal 마이그레이션 (단일 세션, ~1시간)

1. EventPopup을 `<Modal isOpen={showPopup} onClose={dismissPopup} title="오늘 행사 알림" srOnlyTitle size="md">` 래핑
2. 기존 두 형제 div 제거, Modal panel 안에 카드 내용물 이식
3. 카드 헤더(🔔 아이콘 + "오늘 행사 알림!")와 X 버튼은 panel 내부 유지
4. 라이트/다크 양 테마 시각 검증 + reduced motion 검증
5. 검증 게이트 4/4

### Phase 2 — ModalCoordinator 신설 (단일 세션, ~2시간)

1. `useModalCoordinatorStore.ts` — `entries: ModalEntry[]`, `register(entry)`, `unregister(id)`, head selector
2. `ModalCoordinator.tsx` — `entries[0]?.render() ?? null` 단일 마운트
3. `useRegisterModal(priority, isOpen, renderFn)` hook
4. 단위 테스트 — priority sort, LIFO, dismiss 콜백, security 강제 head
5. `App.tsx`에 `<ModalCoordinator />` 1회 마운트 (다른 모달들 정리는 Phase 3)

### Phase 3 — 형제 모달 6종 큐 등록 (단일 세션, ~2시간)

1. EventPopup: `useRegisterModal('EVENT_ALERT', showPopup, () => <EventPopupContent />)`
2. UpdateNotification: priority는 `isSecurity ? 'SECURITY_UPDATE' : 'NORMAL_UPDATE'`
3. FirstSyncConfirmModal: `FIRST_SYNC` priority, `closeOnBackdrop=false` 유지
4. DriveSyncConflictModal: `DRIVE_CONFLICT` priority
5. SharePromptOverlay: `SHARE_PROMPT` priority + 자체 backdrop/wrapper 제거 → coordinator가 처리
6. OAuthModalsProvider 3개 모달: `OAUTH_FLOW` priority (내부적으로 sequential)
7. App.tsx에서 개별 `<XxxModal />` 호출 제거 → 큐 등록만 남김

### Phase 4 — 회귀 차단 + 메타테스트 (단일 세션, ~1시간)

1. `ModalCoordinator.test.tsx` 20+ 케이스
2. `EventPopup.tokens.test.tsx` — 메타테스트로 z-sp-modal 사용 강제
3. `ModalRegistry.test.tsx` — App tree에서 z-sp-modal + fixed inset-0 패턴 카운트 = 큐 등록 카운트 검증
4. 검증 게이트 4/4 + 수동 시나리오 6종

### 단계 간 게이트

각 Phase 끝에 `npx tsc --noEmit` 즉시 확인. 회귀 발견 시 그 즉시 멈추고 원인 분석.

---

## 11. Verification Plan

### 11.1 Automated

```bash
npx tsc --noEmit              # TypeScript 에러 0
npm run lint                  # ESLint 0 error
npm run test                  # Vitest 통과 (ModalCoordinator + 메타테스트 포함)
npm run regression-check      # 9/9 통과
```

### 11.2 Manual — Phase 0 시나리오

| #   | 시나리오                                                    | 기대                                    |
| --- | ----------------------------------------------------------- | --------------------------------------- |
| 1   | EventPopup만 단독 노출 → X 클릭                             | 즉시 dismiss                            |
| 2   | EventPopup + UpdateNotification 동시 노출 → 업데이트 X 클릭 | (현재는 안 됨) 업데이트 모달 dismiss    |
| 3   | EventPopup 카드 안 "확인" 클릭                              | dismiss + 오늘 안 뜸 (regression check) |
| 4   | EventPopup backdrop 클릭                                    | dismiss (신규 동작)                     |
| 5   | 라이트/다크 양 테마 외관                                    | 동등                                    |

### 11.3 Manual — Phase 1~4 시나리오

| #   | 시나리오                                                  | 기대                                   |
| --- | --------------------------------------------------------- | -------------------------------------- |
| 1   | 보안 업데이트 + 일정 알림 동시 트리거                     | 보안 업데이트가 head, 닫으면 일정 알림 |
| 2   | 일정 알림 head 중 OAuth 흐름 시작                         | 일정 알림 그대로, OAuth는 큐 다음 위치 |
| 3   | FirstSync(closeOnBackdrop=false) head 중 다른 모달 트리거 | FirstSync 유지, 다른 모달 큐 대기      |
| 4   | Drive 충돌 head dismiss → 일정 알림 head 자동 노출        | 자동 노출                              |
| 5   | ESC로 head 닫기 → 다음 head로 포커스 이동                 | 포커스 정상 이동                       |
| 6   | 큐 0개 상태 → ModalCoordinator는 null 반환                | DOM에 backdrop/wrapper 없음            |

### 11.4 Visual Regression

- EventPopup 라이트/다크 Before/After 스크린샷 (Phase 1)
- 6종 모달 각각 단독 노출 시 외관 동등

---

## 12. 일정

현재 릴리즈: v2.0.6 (2026-05-20 출시 완료). 다음 릴리즈: **v2.0.7 — Phase 0~4 통합**.

| 단계                                           | 예상 소요  | 머지 시점       | 비고                                 |
| ---------------------------------------------- | ---------- | --------------- | ------------------------------------ |
| 2026-05-21 — Plan v1.1 확정                    | —          | —               | 사용자 5개 결정 반영 완료            |
| Phase 0 Do + 검증                              | 30분       | main 즉시 머지  | 동일 세션                            |
| Phase 0 사용자 회신                            | 10분       | —               | 신고 접수자 회신                     |
| Phase 1 Design (frontend-design 호출)          | 1시간      | —               | 별도 세션, design 문서 생성          |
| Phase 1 Do + 검증                              | 1시간      | main 머지       | 시각 동등 확인                       |
| Phase 2 Design + Do                            | 3시간      | main 머지       | ModalCoordinator 단위 테스트 통과 후 |
| Phase 3 Do                                     | 2시간      | main 머지       | 6개 모달 큐 등록                     |
| Phase 4 Do + 검증                              | 1시간      | main 머지       | 메타테스트                           |
| 통합 gap-detector                              | 30분       | —               | Match Rate ≥ 90%                     |
| Report + PROGRESS.md 갱신                      | 30분       | —               | v2.0.7 후보 등록                     |
| **v2.0.7 릴리즈 (CLAUDE.md 8단계 워크플로우)** | **~4시간** | **release tag** | Phase 0~4 통합                       |

핫픽스 효과 분리: Phase 0 머지 직후 사용자는 `npm run electron:dev`로 신고 증상 해소 확인 가능. v2.0.7 정식 릴리즈는 Phase 4까지 완료 시점.

---

## 13. Out of Scope (재확인)

- 모바일 PWA(`src/mobile`) 동일 부채 — 별도 PDCA (모바일은 모달 패턴 자체가 달라 영향 분석부터 새로)
- z-index 5단계 토큰 자체 재설계
- Toast/CommandPalette/QuickAdd — z 평면 분리되어 본 큐와 무관
- EventPopup 시각 디자인 리뉴얼
- IconButton 컴포넌트 신설

---

## 14. Resolved Decisions (사용자 확정 — 2026-05-21)

| #   | 질문                 | 사용자 결정                                                   | Plan 반영 위치            |
| --- | -------------------- | ------------------------------------------------------------- | ------------------------- |
| 1   | Feature 이름         | `notification-modal-stacking-fix` 확정                        | frontmatter               |
| 2   | Phase 0 릴리즈       | v2.0.7 단독 패치 (v2.0.6은 이미 출시됨)                       | §4.1, §6.1, §12           |
| 3   | Phase 1~4 일정       | v2.0.7에 모두 반영 (단일 묶음)                                | §3 결정, §12              |
| 4   | OAuthModalsProvider  | **큐 편입** (OAUTH_FLOW priority) — OAuth 도중 다른 알림 대기 | §4.1 Phase 3              |
| 5   | frontend-design 협업 | Phase 1에서 호출                                              | §4.1 Phase 1, §10 Phase 1 |

---

## 15. Next Steps

1. ~~사용자 5개 Open Question 답변~~ ✅ 완료 (2026-05-21)
2. ~~Plan v1.1 갱신~~ ✅ 완료 (2026-05-21)
3. `/pdca design notification-modal-stacking-fix` — Phase 1~2 상세 Design 문서 작성 (Before/After 코드 + ModalCoordinator API 시그니처). Phase 1 디자인은 **frontend-design 에이전트 호출**.
4. `/pdca do notification-modal-stacking-fix` Phase 0 — 즉시 핫픽스 구현 + main 머지
5. Phase 0 → 1 → 2 → 3 → 4 순차 Do + 검증 게이트
6. 통합 `/pdca analyze notification-modal-stacking-fix` — gap-detector
7. `/pdca report notification-modal-stacking-fix` + PROGRESS.md 갱신
8. v2.0.7 릴리즈 (CLAUDE.md §"Release Workflow" 8단계 — 버전 6곳 수동, release-notes.json, 챗봇 KB, 노션, 커밋, 빌드 5단계 분리, GitHub Actions macOS, GitHub Release 4 URL 검증)

---

## Version History

| Version | Date       | Changes                                                                                                                                                                                               | Author               |
| ------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 0.1     | 2026-05-21 | Initial draft — 사용자 신고 "X 안 눌리는 첫 일정 알림" 원인 분석 후 핫픽스(Phase 0) + 근본 정리(Phase 1~4) 통합 계획                                                                                  | Claude (사용자 요청) |
| 1.1     | 2026-05-21 | 사용자 5개 Open Question 확정 반영. v2.0.6 → v2.0.7 (이미 v2.0.6 출시됨). Phase 0~4 통합 v2.0.7. OAuth 큐 편입, frontend-design 협업, Feature 이름 확정. 일정 섹션 v2.0.7 단일 릴리즈 흐름으로 재구성 | Claude               |
