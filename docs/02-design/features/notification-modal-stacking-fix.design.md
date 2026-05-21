---
template: design
version: 1.1
feature: notification-modal-stacking-fix
date: 2026-05-21
author: pblsketch
project: ssampin
version_target: v2.0.7 (Phase 0~4 통합)
---

# 알림 모달 겹침·클릭 차단 — Phase 1~4 Design Document

> **Summary**: Phase 0(EventPopup 핫픽스)이 이미 main에 머지된 상태에서, Phase 1(EventPopup Modal 마이그레이션) + Phase 2(ModalCoordinator 우선순위 큐) + Phase 3(6개 모달 큐 등록 + SharePromptOverlay Modal 통합) + Phase 4(메타테스트)의 코드 시그니처·컴포넌트 구조·데이터 흐름·테스트 케이스를 단정적으로 정의한다.
>
> **핵심 결정물**: ModalCoordinator는 신규 컴포넌트가 아니라 **선언적 hook**(`useRegisterModal`)로 노출되며, 각 모달이 자기 마운트 시점에 큐에 자기 자신을 등록하고 unmount 시 빠진다. App.tsx의 6개 직접 호출은 그대로 유지(렌더는 head만, 나머지는 null 반환).
>
> **Project**: ssampin
> **Author**: pblsketch
> **Date**: 2026-05-21
> **Status**: v1.1 — 사용자 3건 확정 (2026-05-21)
> **Planning Doc**: [notification-modal-stacking-fix.plan.md](../../01-plan/features/notification-modal-stacking-fix.plan.md)
> **Phase 0 머지**: `4136527` (main)
>
> **사용자 확정 사항 v1.1 (Design 단계 2026-05-21)**:
>
> 1. EventPopup 시각: **완전 동등** — `rounded-2xl`, `shadow-2xl`, `max-h-[70vh]` 모두 `panelClassName`로 보존
> 2. SharePromptOverlay: **Modal 베이스로 통합** (자체 backdrop·wrapper 제거)
> 3. 진행 방식: **Phase 1~4 완전 자동 진행** (각 Phase 검증 게이트 통과 후 자동 main 머지·다음 Phase)

---

## 1. Overview

### 1.1 Design Goals

1. **EventPopup의 z-50 하드코딩 0건**: Phase 1에서 공용 [Modal](../../../src/adapters/components/common/Modal.tsx)로 이전, z-sp-modal 토큰만 사용
2. **focus-trap 통합 7건**: EventPopup + 큐 통과 6개 모달 모두 focus-trap-react 자동 적용 (Phase 1 + Modal 기반 모달 자체 보유)
3. **동시 노출 0건**: ModalCoordinator를 통과한 모달은 한 번에 하나만 마운트 (Phase 2 + 3)
4. **우선순위 정책 명문화**: enum 7단계로 어느 모달이 위에 와야 하는지 코드로 표현 (Phase 2)
5. **회귀 차단**: 새 모달 추가 시 큐 미등록을 메타테스트가 잡음 (Phase 4)

### 1.2 Design Principles

- **선언적 등록**: 호출처(App.tsx)는 `<UpdateNotification />` 그대로 둠. 컴포넌트 내부에서 `useRegisterModal(priority, ...)` 한 줄로 큐 참여. 마이그레이션 디프 최소화.
- **단일 정합 소스**: `useModalCoordinatorStore`의 `entries[]`가 큐의 단일 진실. head 결정은 selector(우선순위 sort + LIFO tiebreaker)로 파생.
- **render-time 마운트**: 각 모달 컴포넌트는 자신이 head일 때만 렌더, 아닐 때 null. 큐 자체는 DOM에 아무 것도 그리지 않음 (`ModalCoordinator.tsx`는 사실상 빈 컴포넌트로 시작).
- **점진적 안전망**: Phase 1 머지 → Phase 2 머지(큐는 비어있음) → Phase 3 한 모달씩 큐 등록 → Phase 4 메타테스트. 각 단계 끝에 검증 게이트 4/4.
- **하위 호환 보존**: localStorage 키·store API·prop 시그니처 변경 없음. ModalCoordinator는 순수 UI 인프라.

### 1.3 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ App.tsx (변경 거의 없음 — 호출 순서 그대로 유지)            │
│   <UpdateNotification />  ← useRegisterModal('NORMAL_UPDATE')│
│   <EventPopup />          ← useRegisterModal('EVENT_ALERT') │
│   <SharePromptOverlay />  ← useRegisterModal('SHARE_PROMPT')│
│   <FirstSyncConfirmModalContainer /> ← register('FIRST_SYNC')│
│   <OAuthModalsProvider /> ← register('OAUTH_FLOW') × 3       │
│   {driveConflicts && <DriveSyncConflictModal />} ← register  │
└──────────────────┬──────────────────────────────────────────┘
                   │ register/unregister
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ useModalCoordinatorStore (Zustand)                          │
│   entries: ModalEntry[]                                     │
│   register(entry): id                                       │
│   unregister(id): void                                      │
│   isHead(id): boolean (selector)                            │
└──────────────────┬──────────────────────────────────────────┘
                   │ isHead(id)
                   ▼
┌─────────────────────────────────────────────────────────────┐
│ 각 모달 컴포넌트 내부:                                       │
│   const head = useIsModalHead(id);                          │
│   if (!head) return null;  // 큐가 자기 차례라 판단할 때만 렌더 │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Phase 1 — EventPopup Modal 마이그레이션

### 2.1 Before (현재, Phase 0 핫픽스 반영 상태)

[EventPopup.tsx:106-203](../../../src/adapters/components/Dashboard/EventPopup.tsx)

```tsx
return (
  <>
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
         onClick={dismissPopup} aria-hidden="true" />
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
      <div className="w-full max-w-[480px] bg-sp-card rounded-2xl border border-sp-border
                      shadow-2xl overflow-hidden flex flex-col pointer-events-auto">
        <div className="p-6 pb-2">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-3xl shrink-0">🔔</span>
              <h2 className="text-2xl font-bold tracking-tight text-sp-text truncate">
                오늘 행사 알림!
              </h2>
            </div>
            <button type="button" onClick={dismissPopup} aria-label="닫기" ...>
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
        </div>
        {/* 본문 + 하단 버튼 */}
      </div>
    </div>
  </>
);
```

### 2.2 After

```tsx
import { Modal } from '@adapters/components/common/Modal';

export function EventPopup() {
  const { alertResult, showPopup, categories, checkAlerts, dismissPopup, snoozePopup } =
    useEventsStore();

  useEffect(() => { void checkAlerts(); }, [checkAlerts]);

  // Phase 3: 큐 등록 (Phase 1 머지 시점엔 아직 useRegisterModal 없음 — 직접 isOpen 평가)
  // Phase 3 머지 시 아래 한 줄로 교체:
  //   const head = useRegisterModal('EVENT_ALERT', showPopup && !!alertResult);
  //   if (!head) return null;

  if (!showPopup || !alertResult) return null;

  const today = new Date();

  return (
    <Modal
      isOpen
      onClose={dismissPopup}
      title="오늘 행사 알림"
      srOnlyTitle
      size="md"
      panelClassName="rounded-2xl"  /* 기존 시각 보존 */
    >
      <div className="p-6 pb-2">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-3xl shrink-0">🔔</span>
            <h2 className="text-2xl font-bold tracking-tight text-sp-text truncate">
              오늘 행사 알림!
            </h2>
          </div>
          <button type="button" onClick={dismissPopup} aria-label="닫기" ...>
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
      </div>

      {/* 본문 (스크롤 컨테이너) — Modal panel의 flex-1 컨텍스트 상속 */}
      <div className="px-6 py-2 overflow-y-auto flex-1 min-h-0">
        {/* 날짜 헤더 + 오늘 행사 + 다가오는 행사 (기존 코드 그대로 이식) */}
      </div>

      {/* 하단 버튼 */}
      <div className="p-6 pt-4 flex gap-3 shrink-0">
        <button type="button" onClick={snoozePopup} ...>다시 알림 (1시간 후)</button>
        <button type="button" onClick={dismissPopup} ...>확인</button>
      </div>
    </Modal>
  );
}
```

### 2.3 자동 획득되는 동작

| 기능                                                                          | 출처                                                                         |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| z-sp-modal 토큰 사용                                                          | [Modal.tsx:85](../../../src/adapters/components/common/Modal.tsx#L85)        |
| focus-trap (Tab 사이클·escapeDeactivates=false·clickOutsideDeactivates=false) | [Modal.tsx:77-82](../../../src/adapters/components/common/Modal.tsx#L77-L82) |
| ESC 닫기 (default true)                                                       | [Modal.tsx:56-66](../../../src/adapters/components/common/Modal.tsx#L56-L66) |
| backdrop 클릭 닫기 (default true, e.target===e.currentTarget 체크)            | [Modal.tsx:86-88](../../../src/adapters/components/common/Modal.tsx#L86-L88) |
| body overflow lock + 복원                                                     | [Modal.tsx:53-67](../../../src/adapters/components/common/Modal.tsx#L53)     |
| ARIA dialog + aria-modal + aria-labelledby + useId                            | [Modal.tsx:91-94](../../../src/adapters/components/common/Modal.tsx#L91)     |
| 닫힌 후 트리거 포커스 복귀                                                    | focus-trap `returnFocusOnDeactivate: true`                                   |

### 2.4 시각 유지 가드 (사용자 결정 v1.1: 완전 동등)

`panelClassName="rounded-2xl shadow-2xl"` 적용 + 본문 스크롤 컨테이너에 `max-h-[70vh]` 명시.

```tsx
<Modal
  isOpen
  onClose={dismissPopup}
  title="오늘 행사 알림"
  srOnlyTitle
  size="md"
  panelClassName="rounded-2xl shadow-2xl"
>
  {/* ... 헤더 ... */}
  <div className="px-6 py-2 overflow-y-auto max-h-[70vh] flex-1 min-h-0">{/* 본문 */}</div>
  {/* ... 하단 버튼 ... */}
</Modal>
```

- `rounded-2xl` — 기본 Modal `rounded-xl` 오버라이드
- `shadow-2xl` — 기본 Modal `shadow-sp-lg`보다 강한 그림자, 기존 EventPopup 시각 유지
- `max-h-[70vh]` — Modal 기본 `max-h-[calc(100vh-48px)]`보다 작음, 기존 동작 보존
- 본문 컨테이너 `flex-1 min-h-0` 추가 (modal-scroll-overflow-fix Phase 1 패턴 — Modal panel의 flex 컨텍스트 상속)

frontend-design 에이전트는 Do 단계에서 위 클래스 조합이 라이트/다크 양 테마에서 Before와 시각 동등한지 확인하고, 미세 조정이 필요하면 `panelClassName` 추가.

### 2.5 frontend-design 협업 사양 (Phase 1 Do 시점)

frontend-design 에이전트에게 의뢰할 항목:

1. Modal 기본 외관 vs 기존 EventPopup 외관 Before/After 스크린샷 비교
2. `panelClassName` 추가 여부 결정 (`rounded-2xl`, `shadow-2xl` 보존 필요시)
3. 라이트/다크 테마 양쪽 시각 동등 확인
4. 헤더 X 버튼 위치가 Modal panel 패딩과 충돌 없는지 확인
5. 본문 max-height 정책 — Modal 기본 vs `max-h-[70vh]` 중 어느 게 사용자 친화적인지 판단

---

## 3. Phase 2 — ModalCoordinator (우선순위 큐) 신설

### 3.1 우선순위 enum

```ts
// src/adapters/stores/useModalCoordinatorStore.ts
export type ModalPriority =
  | 'SECURITY_UPDATE' // 보안 패치 강제 노출
  | 'FIRST_SYNC' // 신규 기기 첫 동기화 (closeOnBackdrop=false, 안전 우선)
  | 'DRIVE_CONFLICT' // 클라우드 충돌 — 사용자 결정 전까지 다른 모달 금지
  | 'OAUTH_FLOW' // OAuth 흐름 — 사용자 결정 (2026-05-21): 도중 다른 알림 모두 대기
  | 'NORMAL_UPDATE' // 일반 업데이트 안내
  | 'EVENT_ALERT' // 오늘 행사 알림
  | 'SHARE_PROMPT'; // 충성 사용자 공유 권유 (가장 후순위, 마케팅 성격)

const PRIORITY_ORDER: Record<ModalPriority, number> = {
  SECURITY_UPDATE: 0,
  FIRST_SYNC: 1,
  DRIVE_CONFLICT: 2,
  OAUTH_FLOW: 3,
  NORMAL_UPDATE: 4,
  EVENT_ALERT: 5,
  SHARE_PROMPT: 6,
};
```

### 3.2 데이터 모델

```ts
export interface ModalEntry {
  /** stable id — 컴포넌트 마운트 시 uuid 생성, unmount 시 unregister */
  id: string;
  priority: ModalPriority;
  /** 컴포넌트가 자기 자신이 "표시 가능 상태"라고 판단할 때 true */
  isOpen: boolean;
  /** 마운트 시각 (ms) — 같은 priority 안에서 LIFO tiebreaker */
  registeredAt: number;
}

interface ModalCoordinatorState {
  entries: ModalEntry[];
  register: (priority: ModalPriority, isOpen: boolean) => string; // returns id
  unregister: (id: string) => void;
  /** isOpen 상태 갱신 (컴포넌트의 showPopup/status 등 변화 반영) */
  updateIsOpen: (id: string, isOpen: boolean) => void;
  /** head id — open=true 중 우선순위 가장 높고, 동률이면 LIFO */
  getHeadId: () => string | null;
}
```

### 3.3 head 결정 알고리즘

```ts
function selectHead(entries: ModalEntry[]): string | null {
  const open = entries.filter((e) => e.isOpen);
  if (open.length === 0) return null;
  open.sort((a, b) => {
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p !== 0) return p;
    return b.registeredAt - a.registeredAt; // LIFO
  });
  return open[0].id;
}
```

### 3.4 hook API

```ts
// src/adapters/hooks/useRegisterModal.ts
export function useRegisterModal(priority: ModalPriority, isOpen: boolean): boolean {
  const idRef = useRef<string | null>(null);
  const { register, unregister, updateIsOpen, getHeadId } = useModalCoordinatorStore();

  // 마운트 시 1회 등록
  useEffect(() => {
    const id = register(priority, isOpen);
    idRef.current = id;
    return () => {
      if (idRef.current) unregister(idRef.current);
    };
  }, []); // priority는 컴포넌트 라이프타임 내 불변 가정

  // isOpen 변화 동기화
  useEffect(() => {
    if (idRef.current) updateIsOpen(idRef.current, isOpen);
  }, [isOpen]);

  // 자신이 head인지 판정 — selector 재계산은 entries 변화 시
  const headId = useModalCoordinatorStore((s) => selectHead(s.entries));
  return idRef.current !== null && headId === idRef.current;
}
```

### 3.5 ModalCoordinator 컴포넌트

```tsx
// src/adapters/components/common/ModalCoordinator.tsx
export function ModalCoordinator() {
  // 의도: 실제 렌더는 각 모달이 자기 hook으로 처리. coordinator는 future-proofing 마운트 포인트.
  // Phase 4 메타테스트에서 "coordinator가 App tree에 존재한다"를 검증해 누락 방지.
  return null;
}
```

> 설계 의도: 모든 모달 컴포넌트가 자신을 그리도록 두되, head가 아닐 때 null 반환하는 방식. coordinator는 큐 인프라가 마운트됐다는 신호 역할만. 추후 큐 상태 디버깅 패널·dev tools 연결점 확보용.

### 3.6 Zustand store 구현 (단정)

```ts
import { create } from 'zustand';
import { generateUUID } from '@infrastructure/utils/uuid';

export const useModalCoordinatorStore = create<ModalCoordinatorState>((set, get) => ({
  entries: [],
  register: (priority, isOpen) => {
    const id = generateUUID();
    const now = performance.now();
    set((s) => ({
      entries: [...s.entries, { id, priority, isOpen, registeredAt: now }],
    }));
    return id;
  },
  unregister: (id) => {
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
  },
  updateIsOpen: (id, isOpen) => {
    set((s) => ({
      entries: s.entries.map((e) => (e.id === id ? { ...e, isOpen } : e)),
    }));
  },
  getHeadId: () => selectHead(get().entries),
}));
```

---

## 4. Phase 3 — 6개 모달 큐 등록

### 4.1 매트릭스

| #   | 컴포넌트                                                                                                                | priority                                           | isOpen 표현식                           | 마이그레이션 디프 (예상 라인) |
| --- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------- | ----------------------------- |
| 1   | [UpdateNotification](../../../src/adapters/components/common/UpdateNotification.tsx)                                    | `isSecurity ? 'SECURITY_UPDATE' : 'NORMAL_UPDATE'` | `status !== 'idle'`                     | 5                             |
| 2   | [EventPopup](../../../src/adapters/components/Dashboard/EventPopup.tsx)                                                 | `'EVENT_ALERT'`                                    | `showPopup && !!alertResult`            | 4                             |
| 3   | [FirstSyncConfirmModal](../../../src/adapters/components/common/FirstSyncConfirmModal.tsx)                              | `'FIRST_SYNC'`                                     | `open` (prop)                           | 4                             |
| 4   | [DriveSyncConflictModal](../../../src/adapters/components/common/DriveSyncConflictModal.tsx)                            | `'DRIVE_CONFLICT'`                                 | `conflicts.length > 0` (App.tsx 조건부) | 6                             |
| 5   | [SharePromptOverlay](../../../src/adapters/components/Share/SharePromptOverlay.tsx)                                     | `'SHARE_PROMPT'`                                   | `isPromptVisible`                       | 4                             |
| 6   | [OAuthModalsProvider](../../../src/adapters/components/Settings/modals/OAuthModalsProvider.tsx) PKCE·Error·Fallback 3개 | `'OAUTH_FLOW'` (3건 모두)                          | 각자의 store flag                       | 12 (3 × 4)                    |

### 4.2 등록 패턴 (단정)

각 모달의 본문 시작부에 한 줄 추가, 가드 분기 한 줄 수정.

**EventPopup** (Phase 1 머지 직후 상태에서):

```diff
 export function EventPopup() {
   const { alertResult, showPopup, ..., dismissPopup, snoozePopup } = useEventsStore();
   useEffect(() => { void checkAlerts(); }, [checkAlerts]);

-  if (!showPopup || !alertResult) return null;
+  const isHead = useRegisterModal('EVENT_ALERT', showPopup && !!alertResult);
+  if (!isHead) return null;
```

**UpdateNotification**:

```diff
   if (status === 'idle') return null;
+  const isHead = useRegisterModal(
+    isSecurity ? 'SECURITY_UPDATE' : 'NORMAL_UPDATE',
+    status !== 'idle'
+  );
+  if (!isHead) return null;
```

> 단, hooks 순서는 conditional이면 안 됨. 실제 구현 시 hook 호출을 가드 위로 올리고 `isOpen` 인자로 `status !== 'idle'`을 넘겨 처리.

**최종 형태**:

```tsx
export function UpdateNotification() {
  const { track } = useAnalytics();
  const [status, setStatus] = useState<UpdateStatus>('idle');
  // ... existing state hooks ...
  const isHead = useRegisterModal(
    isSecurity ? 'SECURITY_UPDATE' : 'NORMAL_UPDATE',
    status !== 'idle',
  );

  // ... existing effect hooks ...

  if (status === 'idle' || !isHead) return null;
  // ... render ...
}
```

**OAuthModalsProvider 3개 모달**:

```tsx
// 각 sub-modal (PKCE fallback, OAuth error, PKCE option modal)에 동일 패턴
function OAuthErrorModal({ ...props }) {
  const isHead = useRegisterModal('OAUTH_FLOW', /* error 상태 */);
  if (!isHead) return null;
  return (/* 기존 modal */);
}
```

OAuth 3개는 같은 priority이므로 LIFO로 처리 (가장 최근 등록된 것이 위). 다만 OAuth 흐름 자체가 sequential(에러 → fallback)이라 동시 노출은 사실상 없음. 안전망 차원의 단일 큐 처리.

**SharePromptOverlay** (Phase 3 시 자체 backdrop/wrapper 제거 후 Modal 베이스로 통합 권장):

```tsx
export function SharePromptOverlay() {
  const { isPromptVisible, ... } = useShareStore();
  const isHead = useRegisterModal('SHARE_PROMPT', isPromptVisible);

  useEffect(() => {
    const timer = setTimeout(() => { if (checkPromptEligibility()) showPrompt(); }, 5000);
    return () => clearTimeout(timer);
  }, []);

  if (!isPromptVisible || !isHead) return null;

  // 자체 backdrop 제거 → Modal로 감쌈 (시각 동등 panelClassName 적용)
  return (
    <Modal isOpen onClose={() => dismissPrompt(false)} title="공유 권유" srOnlyTitle size="sm">
      {/* 기존 카드 내용 */}
    </Modal>
  );
}
```

### 4.3 App.tsx 변경

거의 없음. 단 `<ModalCoordinator />`를 명시적으로 마운트.

```diff
 <main className="...">{renderPage(...)}</main>
+<ModalCoordinator />
 <UpdateNotification />
 <EventPopup />
 ...
```

ModalCoordinator는 null을 반환하지만 큐 인프라 마운트 시그널 역할.

### 4.4 동작 시나리오 (수동 검증)

| #   | 상황                                           | 기대 head                          | 다음 head                                     |
| --- | ---------------------------------------------- | ---------------------------------- | --------------------------------------------- |
| 1   | 첫 실행: 업데이트 + 일정 알림 + 공유 권유 동시 | NORMAL_UPDATE                      | (dismiss 시) EVENT_ALERT → SHARE_PROMPT       |
| 2   | 보안 업데이트 도중 일정 알림 트리거            | SECURITY_UPDATE                    | (dismiss 시) EVENT_ALERT                      |
| 3   | OAuth 흐름 도중 SharePrompt 5초 타이머 발화    | OAUTH_FLOW                         | (OAuth 종료 시) SHARE_PROMPT                  |
| 4   | FirstSync 다이얼로그 표시 중 OAuth 에러 발생   | FIRST_SYNC (closeOnBackdrop=false) | (FirstSync 결정 시) OAUTH_FLOW                |
| 5   | Drive 충돌 + 일정 알림 동시                    | DRIVE_CONFLICT                     | (resolve 시) EVENT_ALERT                      |
| 6   | 모든 큐 비어있음                               | null                               | (각 모달 컴포넌트는 isHead=false로 null 반환) |

---

## 5. Phase 4 — 메타테스트 + 회귀 차단

### 5.1 ModalCoordinator 단위 테스트

`src/adapters/stores/__tests__/useModalCoordinatorStore.test.ts`

```ts
describe('useModalCoordinatorStore', () => {
  beforeEach(() => useModalCoordinatorStore.setState({ entries: [] }));

  describe('우선순위 sort', () => {
    it('SECURITY_UPDATE가 SHARE_PROMPT보다 위', () => {
      const a = store.register('SHARE_PROMPT', true);
      const b = store.register('SECURITY_UPDATE', true);
      expect(store.getHeadId()).toBe(b);
    });
    it('OAUTH_FLOW > NORMAL_UPDATE > EVENT_ALERT', () => {
      /* ... */
    });
    it('isOpen=false 항목은 head 후보에서 제외', () => {
      /* ... */
    });
  });

  describe('LIFO tiebreaker', () => {
    it('같은 priority 2개일 때 나중에 등록된 것이 head', () => {
      /* ... */
    });
  });

  describe('등록/해제', () => {
    it('register → unregister 사이클 후 entries 비어있음', () => {
      /* ... */
    });
    it('updateIsOpen으로 isOpen 토글 시 head 재계산', () => {
      /* ... */
    });
  });

  describe('회귀 가드', () => {
    it('priority enum 7종 모두 PRIORITY_ORDER에 정의되어 있다', () => {
      const all: ModalPriority[] = [
        'SECURITY_UPDATE',
        'FIRST_SYNC',
        'DRIVE_CONFLICT',
        'OAUTH_FLOW',
        'NORMAL_UPDATE',
        'EVENT_ALERT',
        'SHARE_PROMPT',
      ];
      all.forEach((p) => expect(PRIORITY_ORDER[p]).toBeTypeOf('number'));
    });
  });
});
```

목표 20+ 케이스.

### 5.2 useRegisterModal hook 테스트

`src/adapters/hooks/__tests__/useRegisterModal.test.tsx`

```tsx
describe('useRegisterModal', () => {
  it('마운트 시 entries에 1건 추가, unmount 시 제거', () => {
    /* ... */
  });
  it('isHead가 head인 경우 true, 아닌 경우 false', () => {
    /* ... */
  });
  it('isOpen 변화 시 store updateIsOpen 호출', () => {
    /* ... */
  });
  it('priority 다른 두 hook 동시 마운트 — 높은 priority가 head', () => {
    /* ... */
  });
});
```

### 5.3 정합성 메타테스트 (회귀 차단)

`src/adapters/components/__tests__/ModalRegistry.test.tsx`

```ts
describe('Modal Registry 정합성', () => {
  it('App.tsx에 ModalCoordinator가 마운트되어 있다', async () => {
    const source = await fs.readFile('src/App.tsx', 'utf8');
    expect(source).toMatch(/<ModalCoordinator\s*\/>/);
  });

  it('z-sp-modal 또는 fixed inset-0 z-50 패턴을 가진 컴포넌트는 useRegisterModal을 사용한다', async () => {
    const candidates = await glob('src/adapters/components/**/*.tsx');
    const violations: string[] = [];
    for (const file of candidates) {
      const src = await fs.readFile(file, 'utf8');
      const hasModalPattern = /fixed inset-0.*z-(50|sp-modal)/.test(src);
      const hasRegister = /useRegisterModal\(/.test(src);
      const isCoordinator = file.endsWith('/ModalCoordinator.tsx') || file.endsWith('/Modal.tsx');
      if (hasModalPattern && !hasRegister && !isCoordinator) {
        violations.push(file);
      }
    }
    expect(violations).toEqual([]); // 빈 배열 = 모든 z-sp-modal 컴포넌트가 큐 등록됨
  });

  it('EventPopup은 자체 z-50 코드 0줄', async () => {
    const src = await fs.readFile('src/adapters/components/Dashboard/EventPopup.tsx', 'utf8');
    expect(src).not.toMatch(/fixed inset-0 z-50/);
    expect(src).toMatch(/useRegisterModal\(['"]EVENT_ALERT['"]/);
  });

  it('우선순위 enum 7종이 PRIORITY_ORDER와 일치', () => {
    /* ... */
  });
});
```

### 5.4 회귀 차단 grep 패턴

`scripts/regression-grep-check.mjs`에 추가:

```js
// REGRESSION #10: 큐 미등록 z-sp-modal 모달 방지
{
  id: 10,
  description: '신규 z-sp-modal 모달은 useRegisterModal 필수',
  files: globSync('src/adapters/components/**/*.tsx'),
  check: (content, file) => {
    if (/fixed inset-0.*z-(50|sp-modal)/.test(content) &&
        !/useRegisterModal\(/.test(content) &&
        !/Modal\.tsx|ModalCoordinator\.tsx/.test(file)) {
      return `${file} uses z-sp-modal but missing useRegisterModal`;
    }
    return null;
  },
},
```

목표: regression check 9 → 10건.

---

## 6. 데이터 흐름 (시퀀스)

### 6.1 일정 알림 + 업데이트 동시 노출

```
사용자: 앱 첫 실행
  ↓
UpdateNotification.useEffect → onUpdateAvailable → setStatus('available')
  ↓
UpdateNotification.useRegisterModal('NORMAL_UPDATE', true)
  → store.register → entries=[{id:A, priority:NORMAL_UPDATE, isOpen:true}]
  → selectHead → A
  → useRegisterModal returns true → UpdateNotification renders <Modal>

(거의 동시)
EventPopup.useEffect → checkAlerts → setShowPopup(true)
  ↓
EventPopup.useRegisterModal('EVENT_ALERT', true)
  → store.register → entries=[A, B={id:B, priority:EVENT_ALERT, isOpen:true}]
  → selectHead → A (NORMAL_UPDATE < EVENT_ALERT)
  → useRegisterModal returns false → EventPopup returns null

사용자: UpdateNotification의 X 클릭 → handleDismiss → setStatus('idle')
  ↓
UpdateNotification.useEffect → updateIsOpen(A, false)
  → entries=[{A, isOpen:false}, {B, isOpen:true}]
  → selectHead → B
  ↓
EventPopup.useRegisterModal returns true → EventPopup renders <Modal>

사용자: EventPopup의 X 클릭 → dismissPopup → setShowPopup(false)
  ↓
EventPopup.useEffect → updateIsOpen(B, false)
  → entries=[{A, false}, {B, false}]
  → selectHead → null
  → 모든 모달 null 반환, 화면 클리어
```

### 6.2 보안 업데이트 강제 head

```
EventPopup head 중 보안 업데이트 fetch 완료
  ↓
UpdateNotification.useRegisterModal('SECURITY_UPDATE', true)  // isSecurity 변화
  → entries 갱신
  → selectHead → SECURITY_UPDATE id (priority 0 최우선)
  ↓
EventPopup.useRegisterModal returns false → unmount
UpdateNotification renders SECURITY_UPDATE 모달
  → 사용자가 닫지 못함 (LaterDropdown만 스누즈 가능, "건너뛰기" 메뉴 숨김)
```

---

## 7. 위험과 완화

| Risk                                                               | Impact | 완화                                                                                                |
| ------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------- |
| `useRegisterModal`이 마운트마다 새 uuid 생성 — entries 누수        | High   | useEffect cleanup으로 unregister. memo로 hook 호출 없도록 React strict mode 더블 마운트 시도 테스트 |
| Zustand store가 selector 매번 재계산 → 성능 저하                   | Low    | entries 짧음(~7개) + sort O(n log n). React Profiler로 측정, 필요 시 useShallow                     |
| OAuth 3개 모달이 OAUTH_FLOW priority 동률에서 LIFO 외 충돌         | Medium | OAuth는 store 분기로 한 번에 하나만 mount 보장. 테스트 시뮬레이션 케이스 추가                       |
| Phase 1 마이그레이션 시 EventPopup 시각 미세 변화                  | Medium | frontend-design 호출, Before/After 스크린샷 가드                                                    |
| SharePromptOverlay 자체 backdrop 제거 시 외관 변화                 | Low    | Modal 기본 backdrop과 동등 (bg-black/40~60 + backdrop-blur)                                         |
| FirstSync `closeOnBackdrop=false`가 큐 강제 후순위로 무시될 가능성 | High   | FIRST_SYNC priority를 SECURITY_UPDATE 다음으로 배치 → 보안 업데이트만이 밀어낼 수 있음              |
| 메타테스트 정규식이 false positive                                 | Medium | exception list 명시 (Modal.tsx, ModalCoordinator.tsx, SharePromptOverlay 마이그레이션 후)           |

---

## 8. 검증 계획

### 8.1 자동

```bash
npx tsc --noEmit              # 각 Phase 끝 + 통합
npm run lint                  # 0 errors
npm run test                  # 1457 + ModalCoordinator 단위(20+) + 메타(4+) ≈ 1480+
npm run regression-check      # 9 → 10건 (REGRESSION #10 신규)
```

### 8.2 수동 — Phase 1

| #   | 시나리오                     | 기대                                                    |
| --- | ---------------------------- | ------------------------------------------------------- |
| 1   | EventPopup 라이트 테마 외관  | Before와 동등 (frontend-design 확인)                    |
| 2   | EventPopup 다크 테마 외관    | 동등                                                    |
| 3   | Tab 키로 모든 버튼 순환      | 모달 안에서만 순환                                      |
| 4   | ESC 키로 닫힘                | dismiss 호출                                            |
| 5   | backdrop 클릭으로 닫힘       | dismiss (이미 Phase 0에 추가됨, Modal 기본 동작과 일치) |
| 6   | 닫힌 후 포커스 트리거로 복귀 | 자동                                                    |

### 8.3 수동 — Phase 2~3

| #   | 시나리오                                      | 기대                      |
| --- | --------------------------------------------- | ------------------------- |
| 1   | 첫 실행 업데이트+일정 동시 → 업데이트만 보임  | 한 번에 1개               |
| 2   | 업데이트 dismiss → 일정 자동 노출             | 자동                      |
| 3   | OAuth 흐름 중 일정 알림 트리거 → OAuth만 보임 | OAUTH_FLOW 우선           |
| 4   | OAuth 종료 → 대기 중인 일정 노출              | 자동                      |
| 5   | 보안 업데이트 발생 시 다른 모달 강제 후순위   | SECURITY_UPDATE 즉시 head |
| 6   | 모든 모달 dismiss 후 DOM에 backdrop 0개       | DevTools 확인             |

### 8.4 수동 — Phase 4

- 새 z-sp-modal 컴포넌트 생성 시도 (useRegisterModal 없이) → 테스트 fail
- 회귀 grep #10 신규 패턴 검증

---

## 9. Out of Scope (재확인)

- 모바일 PWA(`src/mobile`) 동일 부채
- z-index 5단계 토큰 자체 재설계
- Toast (z-sp-toast=60), CommandPalette (z-sp-palette=70), QuickAdd (별도 윈도우) — z 평면 분리
- Onboarding 모달 (z 평면 다름, 첫 실행 1회 흐름이 특수)
- EventPopup 시각 디자인 리뉴얼 (Phase 1은 동작 보존, 시각 동등)
- IconButton 컴포넌트 신설

---

## 10. Resolved Decisions (사용자 확정 — Design v1.1)

| #   | 질문                                     | 사용자 결정                                                              | Plan/Design 반영 위치         |
| --- | ---------------------------------------- | ------------------------------------------------------------------------ | ----------------------------- |
| 1   | EventPopup 시각 보존 수준                | **완전 동등** (rounded-2xl + shadow-2xl + max-h-70vh 모두 보존)          | §2.4 시각 유지 가드           |
| 2   | SharePromptOverlay Modal 통합 여부       | **통합** (자체 backdrop/wrapper 제거)                                    | §4.1 매트릭스, §4.2 등록 패턴 |
| 3   | 진행 방식                                | **Phase 1~4 완전 자동 진행** (각 Phase 검증 통과 후 자동 머지·다음 진행) | §11 Next Steps                |
| 4   | ModalCoordinator 빈 컴포넌트 vs Provider | 빈 컴포넌트 (zustand 글로벌 + 마운트 시그널 역할)                        | §3.5                          |
| 5   | OAuth 3개 동일 priority LIFO 충분성      | 충분 (store 분기로 한 번에 하나 보장)                                    | §7 위험표                     |

---

## 11. Next Steps

1. **사용자 Design 재검토** (현 단계)
2. `/pdca do notification-modal-stacking-fix` Phase 1 — frontend-design 에이전트 호출 후 EventPopup Modal 마이그레이션
3. Phase 1 검증 게이트 4/4 → main 머지
4. `/pdca do notification-modal-stacking-fix` Phase 2 — ModalCoordinator store + hook + 컴포넌트 + 단위 테스트 20+
5. Phase 2 검증 게이트 → main 머지
6. `/pdca do notification-modal-stacking-fix` Phase 3 — 6개 모달 큐 등록
7. Phase 3 검증 게이트 → main 머지
8. `/pdca do notification-modal-stacking-fix` Phase 4 — 메타테스트 + regression #10
9. Phase 4 검증 게이트 → main 머지
10. 통합 `/pdca analyze notification-modal-stacking-fix` — gap-detector Match Rate ≥ 90%
11. `/pdca report notification-modal-stacking-fix`
12. v2.0.7 릴리즈 (CLAUDE.md Release Workflow 8단계)

---

## Version History

| Version | Date       | Changes                                                                                                                                                              | Author |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1.0     | 2026-05-21 | Initial Design — Phase 1~4 통합. ModalCoordinator 우선순위 큐 + useRegisterModal hook + 6개 모달 매트릭스 + 메타테스트 케이스. Phase 0은 이미 main(`4136527`) 머지됨 | Claude |
| 1.1     | 2026-05-21 | 사용자 3건 확정: EventPopup 시각 완전 동등(rounded-2xl+shadow-2xl+max-h-70vh), SharePromptOverlay Modal 통합, Phase 1~4 완전 자동 진행                               | Claude |
