---
template: design
version: 1.2
feature: dual-tool-view
date: 2026-04-17
author: pblsketch
project: ssampin
version_target: v1.11.0
depends_on: docs/01-plan/features/dual-tool-view.plan.md
---

# 쌤 도구 병렬 표시(Dual Tool View) 설계서

> Plan 문서의 **MVP=분할 뷰** 범위를 구체 컴포넌트·상태 전이·타입·통합 지점으로 변환한다. Clean Architecture 4-layer 의존성 엄수.
>
> **Planning Doc**: [dual-tool-view.plan.md](../../01-plan/features/dual-tool-view.plan.md)

---

## 1. Architecture Overview

### 1.1 Design Goals

- 두 개의 쌤 도구를 동일 창 내 좌·우 슬롯으로 동시 표시
- **기존 도구 컴포넌트 무수정** — ToolLayout/개별 Tool의 기존 동작 100% 보존
- 전역 리소스(keydown, fullscreen)를 활성 슬롯에만 위임하여 충돌 차단
- 단일 모드 사용자에게 영향 0 (듀얼 경로는 신규 Container 한정)

### 1.2 Design Principles

- **개방·폐쇄**: 기존 Tool에 손대지 않고 확장 (DualToolContainer가 감싸는 구조)
- **단일 책임**: Slot은 렌더·포커스, Container는 레이아웃·세션, Picker는 선택, Divider는 리사이즈
- **명시적 활성화**: `activeSlot` 상태는 클릭으로만 전환 (포커스 자동 추적 금지 — 학생 시선 분산)
- **안전한 축소**: 1280px 미만 감지 시 **자동 단일 모드 폴백 + Toast**

### 1.3 Touchpoints

| 레이어 | 파일 | 변경 유형 |
|--------|------|-----------|
| adapters | [src/adapters/components/Tools/DualToolContainer.tsx](../../../src/adapters/components/Tools/DualToolContainer.tsx) | **신규** — 듀얼 모드 셸 |
| adapters | [src/adapters/components/Tools/DualToolSlot.tsx](../../../src/adapters/components/Tools/DualToolSlot.tsx) | **신규** — 단일 슬롯 래퍼 + 활성 전환 |
| adapters | [src/adapters/components/Tools/DualToolPicker.tsx](../../../src/adapters/components/Tools/DualToolPicker.tsx) | **신규** — 슬롯 내 인라인 도구 선택 UI |
| adapters | [src/adapters/components/Tools/ResizeDivider.tsx](../../../src/adapters/components/Tools/ResizeDivider.tsx) | **신규** — 슬롯 간 드래그 핸들 |
| adapters | [src/adapters/components/Tools/toolRegistry.ts](../../../src/adapters/components/Tools/toolRegistry.ts) | **신규** — `ToolId → ComponentType` 중앙 레지스트리 |
| adapters | [src/adapters/components/Tools/ToolLayout.tsx](../../../src/adapters/components/Tools/ToolLayout.tsx) | **수정** — `active?` prop 추가 + 헤더에 "도구 추가" 버튼 + keydown/fullscreen 게이팅 |
| adapters | [src/adapters/components/Tools/ToolsGrid.tsx](../../../src/adapters/components/Tools/ToolsGrid.tsx) | (변경 없음) |
| adapters | [src/adapters/hooks/useDualToolSession.ts](../../../src/adapters/hooks/useDualToolSession.ts) | **신규** — sessionStorage 직렬화 훅 |
| adapters | [src/App.tsx](../../../src/App.tsx) | **수정** — `dual-tool-view` PageId 분기 추가 (미니멀) |
| adapters | [src/adapters/components/Layout/Sidebar.tsx](../../../src/adapters/components/Layout/Sidebar.tsx) | (변경 없음) — 듀얼 진입은 ToolLayout 버튼에서만 |
| domain/usecases/infrastructure | — | **변경 없음** |

### 1.4 Dependency Rule 검증

```
DualToolContainer (adapters)
  ├ useDualToolSession (adapters/hooks) → sessionStorage (브라우저 API)
  ├ DualToolSlot (adapters)
  │   ├ toolRegistry.ts → 개별 Tool 컴포넌트 (adapters)
  │   └ DualToolPicker (adapters)
  └ ResizeDivider (adapters)
```

- ✅ 모든 신규 코드 `adapters/`
- ✅ domain/usecases 미접근
- ✅ infrastructure 미접근 (sessionStorage는 브라우저 표준 API로 추상화 불요)

### 1.5 Component Diagram

```
┌───────────────────────────────────────────────────────────────┐
│ App.tsx                                                       │
│  if (page === 'dual-tool-view') return <DualToolContainer .../>│
└──────────────────────┬────────────────────────────────────────┘
                       │
        ┌──────────────▼──────────────┐
        │  DualToolContainer          │ (세션 훅, 활성 슬롯 상태,
        │  ┌─────────────┬──────────┐ │  분할 비율, 폴백 감지)
        │  │   Slot L    │  Slot R  │ │
        │  │ (ToolLayout │ (Picker  │ │
        │  │  + Tool)    │  또는    │ │
        │  │             │  Tool)   │ │
        │  └─────────────┴──────────┘ │
        │         ↑ Divider ↑         │
        └─────────────────────────────┘
```

---

## 2. Data Model

### 2.1 타입 정의

**파일**: `src/adapters/components/Tools/toolRegistry.ts` (신규)

```ts
import type { PageId } from '@adapters/components/Layout/Sidebar';

/** 듀얼 모드에서 사용 가능한 도구 식별자 (외부 URL·특수 prop·브라우저 fullscreen 직접 제어 도구 제외) */
export type DualToolId = Extract<
  PageId,
  | 'tool-timer'
  | 'tool-random'
  | 'tool-traffic-light'
  | 'tool-scoreboard'
  | 'tool-roulette'
  | 'tool-dice'
  | 'tool-coin'
  | 'tool-qrcode'
  | 'tool-work-symbols'
  | 'tool-poll'
  | 'tool-survey'
  | 'tool-multi-survey'
  | 'tool-wordcloud'
  | 'tool-grouping'
  | 'tool-valueline'
  | 'tool-traffic-discussion'
  | 'tool-chalkboard'
>;
// ⚠️ MVP 제외: tool-seat-picker (ToolSeatPicker.tsx:423-428가 document.fullscreenElement를
// 직접 제어하여 창 전체를 브라우저 fullscreen으로 전환 → 다른 슬롯까지 덮음. Phase 2에서
// DualToolContext 기반으로 슬롯 로컬 최대화로 분기 구현 후 지원.

export interface ToolMeta {
  readonly id: DualToolId;
  readonly name: string;   // "타이머"
  readonly emoji: string;  // "⏱️"
  readonly component: React.ComponentType<{
    onBack: () => void;
    isFullscreen: boolean;
  }>;
  /** 좌측에 두기 권장(넓은 UI). 예: 점수판. */
  readonly prefersWide?: boolean;
}

export const TOOL_REGISTRY: Readonly<Record<DualToolId, ToolMeta>>;
export const DUAL_TOOL_LIST: readonly ToolMeta[];

/** 제외 도구: tool-assignment(추가 props), tool-supsori/pblsketch(외부 링크) */
```

**파일**: `src/adapters/components/Tools/DualToolContainer.tsx` (신규)

```ts
export type SlotId = 'left' | 'right';
export type SplitPreset = 30 | 50 | 70; // 좌측 슬롯 비율(%)

export interface DualToolContainerProps {
  /** 듀얼 모드 진입 시 초기 좌측 도구(직전 단일 모드의 도구). undefined 가능. */
  initialLeftTool?: DualToolId;
  /** 듀얼 모드 나가기 콜백 — App.tsx가 `tools` 또는 마지막 단일 도구로 복귀 */
  onExit: (remainingTool: DualToolId | null) => void;
  isFullscreen: boolean;
}
```

**파일**: `src/adapters/hooks/useDualToolSession.ts` (신규)

```ts
export interface DualToolSession {
  leftTool: DualToolId | null;
  rightTool: DualToolId | null;
  splitRatio: number; // 20 ~ 80 (percent of left slot)
}

const SESSION_KEY = 'ssampin:dual-tool-session';
const DEFAULT_SESSION: DualToolSession = {
  leftTool: null, rightTool: null, splitRatio: 50,
};

export function useDualToolSession(initial: Partial<DualToolSession>): [
  DualToolSession,
  (patch: Partial<DualToolSession>) => void,
];
```

- sessionStorage 저장·복원 (앱 재시작 시엔 리셋)
- splitRatio는 20~80% 사이로 clamp
- JSON parse 실패 시 기본값 반환 (try/catch)

### 2.2 Component Prop 계약

**DualToolSlot**:

```ts
interface DualToolSlotProps {
  slotId: SlotId;
  tool: DualToolId | null;  // null이면 Picker 표시
  isActive: boolean;         // 테두리 하이라이트 + 키보드 게이팅
  onActivate: () => void;    // onPointerDown 시 호출
  onChangeTool: (next: DualToolId) => void;
  onSwap: () => void;        // 좌우 도구 위치 전환
  onClose: () => void;       // 슬롯 닫기 (상대 슬롯이 단일 모드로 복귀)
  excludeTools: readonly DualToolId[]; // Picker 목록에서 제외할 도구(현재 반대 슬롯)
  widthPercent: number;
}
```

**DualToolPicker**:

```ts
interface DualToolPickerProps {
  exclude: readonly DualToolId[];
  onSelect: (id: DualToolId) => void;
  onCancel?: () => void;
}
```

**ResizeDivider**:

```ts
interface ResizeDividerProps {
  ratio: number;                      // 20~80 clamped
  onChange: (next: number) => void;
  disabled?: boolean;                 // 1280px 미만에서는 숨김
}
```

---

## 3. UX / UI Spec

### 3.1 진입 플로우

```
[단일 모드 도구 실행 중]
        │
        ▼  ToolLayout 헤더 "splitscreen" 아이콘 클릭
        │
   ┌────▼──────────────────────────────┐
   │ window.innerWidth 확인            │
   │   < 1280  → Toast 안내 후 중단    │
   │   ≥ 1280  → 듀얼 모드 진입        │
   └────┬──────────────────────────────┘
        │
        ▼
[DualToolContainer 마운트]
  leftTool = 직전 단일 도구
  rightTool = null → Picker 표시
  activeSlot = 'right' (사용자가 선택하도록 포커스)
  splitRatio = 50
```

### 3.2 헤더 구성 (듀얼 모드)

```
[← 쌤도구] │ 병렬 모드     [30:70 / 50:50 / 70:30] [F11] [Esc 종료]
```

- 좌측: "← 쌤도구" (기존), 구분선, **"병렬 모드"** 배지
- 우측: **분할 비율 프리셋 3-버튼 토글**, 전역 전체화면(F11), 듀얼 모드 종료 버튼
- 기존 단일 모드의 줌·소리·단축키 안내 버튼은 **각 슬롯 ToolLayout 내부**로 이관(이미 그렇게 구성됨)

### 3.2.1 듀얼 모드 진입 / 프리셋·드래그 상호작용 (FR-07, FR-11 상세)

- **진입 전 가드 (FR-11)**: ToolLayout의 "도구 추가" 버튼이 `window.innerWidth < 1280`이면 `disabled` + 툴팁(`화면이 좁아 병렬 모드를 지원하지 않습니다`) 표시. 클릭 시도는 Toast `폭을 1280px 이상으로 넓혀 주세요`를 띄우고 아무 동작 없음.
- **프리셋 3-버튼 ↔ 드래그**:
  - 프리셋 클릭 → `splitRatio`를 해당 값(30/50/70)으로 즉시 세팅, 프리셋 버튼에 `aria-pressed=true` 강조
  - 드래그(ResizeDivider) 중에는 프리셋 버튼의 `aria-pressed` 해제(어느 것도 정확히 일치 안 함)
  - 드래그 종료 시 값이 정확히 30/50/70 중 하나면 해당 프리셋 강조 재적용
  - 드래그가 진행 중일 때 프리셋 클릭은 무시(드래그 완료 후 처리)

### 3.3 각 슬롯 헤더 구성 (ToolLayout 내부 버튼군에 신규 3개 추가 — 듀얼 시에만 표시)

**Tool 로드 상태** (tool !== null):
기존: `[줌 -/ % /+]  [소리]  [단축키]  [전체화면]`
듀얼: `[줌 -/ % /+]  [소리]  [단축키]  [swap_horiz 교체] [swap_vert 좌우전환] [close 슬롯닫기]`

- **전체화면(F11) 버튼**은 듀얼 모드에서는 **슬롯 내부 "콘텐츠 최대화"**로 교체(슬롯만 100% 확대, 아이콘 `open_in_full`)
- 교체(swap_horiz): 이 슬롯의 도구를 다른 것으로 교체 (DualToolPicker 오버레이)
- 좌우전환(swap_vert): `leftTool ↔ rightTool` 스왑
- 닫기(close): 이 슬롯을 닫고 상대 슬롯의 도구로 단일 모드 복귀

**Picker 상태** (tool === null, FR-02):
ToolLayout을 마운트하지 않고 DualToolPicker만 렌더링. 슬롯 상단에 경량 자체 헤더:
```
🧰 도구 선택                       [swap_vert] [close]
```
- 줌·소리·단축키·교체 버튼 없음 (선택 전이므로 무의미)
- 좌우전환(swap_vert): 반대 슬롯의 Tool을 이 슬롯으로 가져오고 반대 슬롯을 Picker로 → **잘못된 스왑 방지 목적으로 상대 슬롯에 Tool이 있을 때만 활성**
- 닫기(close): Picker 취소 → 단일 모드 복귀(반대 슬롯 Tool 유지)

### 3.4 활성 슬롯 시각 표시

| 상태 | 테두리 | 배경 |
|------|--------|------|
| 활성 | `border border-sp-accent/60 ring-1 ring-sp-accent/30` | 변경 없음 |
| 비활성 | `border border-sp-border` | 변경 없음 |

- 전환 트리거: `onPointerDown`에서 `setActiveSlot(slotId)` (클릭·탭에만 반응, 마우스 호버 금지)
- `aria-selected={isActive}` 속성 병행

### 3.5 슬롯 내부 Picker UI

```
┌────────────────────────────────┐
│ 🧰 도구를 선택하세요           │
│ ─────────────────────────────  │
│ ⏱️ 타이머      🎲 랜덤 뽑기    │
│ 🚦 신호등      📊 점수판       │
│ 🎯 룰렛        🪙 동전         │
│ ...(좌측과 동일한 도구는 제외) │
└────────────────────────────────┘
```

- `grid-cols-2 md:grid-cols-3` 카드 그리드
- ToolsGrid와 동일 톤(sp-card 배경), 단 축소된 패딩
- 외부 링크 도구(`supsori`, `pblsketch`), 특수 props 도구(`tool-assignment`)는 목록에서 **원천 제외**

### 3.6 반응형 / 폴백

| 창 폭 | 동작 |
|-------|------|
| < 1280px | 듀얼 진입 버튼 비활성화 + 툴팁 "화면이 좁아 지원하지 않습니다". 이미 듀얼 진입 중 축소 시 Toast "화면이 좁아 단일 모드로 전환됩니다" + 활성 슬롯 도구만 남기고 복귀 |
| 1280 ~ 1599px | 프리셋 3종 모두 허용, 기본 50:50 |
| ≥ 1600px | 동일 |

- `ResizeObserver`로 Container 루트 요소 감시 (window resize event보다 정확)

### 3.7 Toast 메시지 (한국어)

| 상황 | 문구 |
|------|------|
| 듀얼 진입 불가(협소) | `화면이 좁아 병렬 모드를 지원하지 않습니다 (1280px 이상 권장)` |
| 듀얼 중 폴백 | `화면이 좁아졌습니다. 단일 모드로 돌아갑니다` |
| 슬롯 닫기 | `{도구명}(이)가 닫혔습니다 · [복원]` (5초 유예, 복원 버튼 클릭 시 직전 상태 완전 복구) |
| 세션 복원 | `이전 병렬 구성을 복원했습니다` (F5 후에만 표시, 3초) |
| 폴백(창 축소) | `화면이 좁아졌습니다 · 단일 모드로 전환 · [복원]` (5초, 복원 시 창을 1280+로 유지했다 가정하고 듀얼 재진입) |

---

## 4. State Machine

### 4.1 Container 상태 전이도

```
[idle]
  │  progressTo('enter', {initialLeftTool})
  ▼
[dual-active]  ←─────────────────────┐
  │  events                           │
  │  - pickRightTool(id)              │
  │  - changeLeftTool(id)             │
  │  - swap()                         │
  │  - setPreset(30|50|70)            │
  │  - dragRatio(n)                   │
  │  - activate(slot)                 │
  │  - closeSlot(slot) ──► remainingTool ──► [idle] (onExit)
  │  - viewportShrink(<1280) ──► remainingActive ──► [idle]
  │  - pressEsc (활성 슬롯에서만)       │
  │     └─► 활성 슬롯이 Picker면 Cancel, Tool이면 slot-close
  └───────────────────────────────────┘
```

### 4.2 Invariants (불변 조건)

- 언제나 **적어도 한 슬롯은 Tool 또는 Picker** 상태 (빈 Container 금지)
- `leftTool !== rightTool` (동일 도구 2개 금지, Picker에서 차단)
- `20 ≤ splitRatio ≤ 80`
- `activeSlot` 은 항상 `'left' | 'right'` 중 하나 (null 금지 — 키보드 대상 모호 방지)

### 4.3 Edge Case 시나리오

| 시나리오 | 동작 |
|---------|------|
| 좌측 Tool이 선택된 상태에서 좌측 "교체" 클릭 | Picker 오버레이 표시, `exclude=[rightTool, leftTool]` |
| 우측 Picker에서 도구 선택 후 바로 좌측 "교체" | 좌측 Picker 표시, `exclude=[rightTool]`. 좌측 Tool 선택 시 즉시 교체 |
| 우측 Picker 열림 상태에서 좌측 슬롯 "닫기" | 우측 Picker를 버리고 단일 모드(leftTool만)로 복귀 확인 Toast 없이 바로 |
| 전체화면(F11) 중 듀얼 진입 | F11 유지, Container가 전체 창 영역 기준 분할 |
| 위젯 모드 진입 시도 | 사이드바 위젯 버튼 비활성 + 툴팁 "병렬 모드에서는 사용할 수 없어요" |
| 세션 복원 시 잔재된 tool id가 현재 버전에 없음 | 해당 슬롯을 `null`(Picker)로 초기화 |

---

## 5. Integration Design

### 5.1 ToolLayout 수정 (기존 파일)

**핵심 변경**: keydown/fullscreen 동작을 `active` prop으로 게이팅.

```ts
// 기존 props에 추가
interface ToolLayoutProps {
  // ...기존
  active?: boolean;          // 듀얼 모드에서 활성 슬롯 여부. 미지정(단일 모드)은 true로 취급.
  dualMode?: boolean;        // 듀얼 모드 여부. 이면 전체화면 버튼 → "콘텐츠 최대화" 버튼, ESC 동작 변경
  onSlotMaximizeToggle?: () => void;    // 듀얼 시 사용
  onSlotClose?: () => void;             // 듀얼 시 사용
  onSlotSwap?: () => void;              // 듀얼 시 사용
  onRequestToolChange?: () => void;     // 듀얼 시 사용 (Picker 열기 트리거)
}
```

- `useEffect(keydown)` 내부에 **`if (!active) return;` 조기 반환** → 비활성 슬롯의 리스너는 등록되지만 본문을 실행하지 않음
  - ESC: `dualMode`면 `onSlotClose?.() ?? onBack()` 순서(슬롯 닫기 우선), 아니면 기존 `onBack()`
  - F11: `dualMode`면 `onSlotMaximizeToggle?.()` 우선, 아니면 기존 `toggleFullscreen()`
  - M(소리), 사용자 shortcuts: `active` 슬롯에서만 실행
- 헤더 우측에 `dualMode && <button title="도구 교체" onClick={onRequestToolChange}>swap_horiz</button>` 등 3개 추가
- 헤더 우측의 기존 "전체화면" 버튼은 `dualMode`면 아이콘·타이틀 교체 (`open_in_full`, "슬롯 최대화")
- **단일 모드 사용자 영향 0**: 모든 신규 prop 선택적, undefined일 때 기존 동작 동일

### 5.2 App.tsx 수정

```ts
// PageId 타입에 'dual-tool-view' 추가
// 기존 도구 분기 이후에 추가:
if (page === 'dual-tool-view') {
  return (
    <DualToolContainer
      initialLeftTool={lastSingleToolRef.current ?? 'tool-timer'}
      onExit={(remaining) => onNavigate(remaining ?? 'tools')}
      isFullscreen={isFullscreen}
    />
  );
}
```

- `lastSingleToolRef`: App.tsx에서 `useRef<DualToolId | null>` 로 직전 단일 도구를 기록 (ToolLayout이 "도구 추가" 눌렀을 때 유실 방지)
- ToolLayout "도구 추가" 버튼 → `onNavigate('dual-tool-view')` 호출

### 5.3 toolRegistry 초기화

```ts
// src/adapters/components/Tools/toolRegistry.ts
import { ToolTimer } from './ToolTimer';
import { ToolScoreboard } from './ToolScoreboard';
// ... (듀얼 지원 18종 import)

export const TOOL_REGISTRY = {
  'tool-timer':    { id: 'tool-timer',   name: '타이머',  emoji: '⏱️', component: ToolTimer },
  'tool-scoreboard':{ id: 'tool-scoreboard', name: '점수판', emoji: '📊', component: ToolScoreboard, prefersWide: true },
  // ...
} as const satisfies Record<DualToolId, ToolMeta>;

export const DUAL_TOOL_LIST = Object.values(TOOL_REGISTRY);
```

### 5.4 DualToolSlot 렌더링 로직

```ts
function DualToolSlot({ slotId, tool, isActive, onActivate, excludeTools, ... }: DualToolSlotProps) {
  const handlePointerDown = () => { if (!isActive) onActivate(); };

  if (tool === null) {
    return (
      <div onPointerDown={handlePointerDown}
           className={cn('flex-1 min-w-0 rounded-xl border p-4',
             isActive ? 'border-sp-accent/60 ring-1 ring-sp-accent/30' : 'border-sp-border')}
           aria-selected={isActive}>
        <DualToolPicker exclude={excludeTools} onSelect={onChangeTool} />
      </div>
    );
  }

  const meta = TOOL_REGISTRY[tool];
  const ToolComponent = meta.component;
  return (
    <div onPointerDown={handlePointerDown}
         className={cn('flex-1 min-w-0 rounded-xl border overflow-hidden',
           isActive ? 'border-sp-accent/60 ring-1 ring-sp-accent/30' : 'border-sp-border')}
         aria-selected={isActive}>
      {/* ToolComponent 자체가 내부에서 ToolLayout을 마운트. */}
      {/* ToolLayout에 듀얼 상태 전달은 React Context 또는 별도 prop 경로가 필요 (아래 5.5) */}
      <ToolComponent onBack={onClose} isFullscreen={false /* 듀얼 시 슬롯 로컬 최대화로 대체 */} />
    </div>
  );
}
```

### 5.5 ToolLayout에 듀얼 상태를 전달하는 경로

각 Tool(예: ToolScoreboard)은 이미 ToolLayout을 마운트한다. Tool 파일은 건드리지 않기 위해 **React Context로 듀얼 메타를 공급**한다.

```ts
// src/adapters/components/Tools/DualToolContext.tsx (신규, 경량)
interface DualToolContextValue {
  dualMode: true;
  active: boolean;
  onSlotMaximizeToggle: () => void;
  onSlotClose: () => void;
  onSlotSwap: () => void;
  onRequestToolChange: () => void;
}
export const DualToolContext = React.createContext<DualToolContextValue | null>(null);
```

- DualToolSlot이 자식을 `<DualToolContext.Provider value={...}>` 로 감싼다
- ToolLayout은 `useContext(DualToolContext)`로 읽어, 값이 있으면 듀얼 모드 헤더/키보드 게이팅 적용, 없으면 기존 단일 모드 동작
- **단일 모드 사용자 영향 0**: Context 미제공 시 `null`로 기존 경로

### 5.6 슬롯 로컬 "콘텐츠 최대화"

- `DualToolSlot` 내부 상태 `maximized: boolean`
- `true`면 `position: absolute; inset: 0; z-50` 로 Container 영역을 덮음
- F11과 달리 브라우저 API 미사용 → 다른 슬롯과 격리
- 닫기: 동일 버튼(`fullscreen_exit` 아이콘) 또는 ESC(활성 슬롯에서)

### 5.7 키보드 이벤트 격리 전략 (치명 블로커 해소)

**문제**: ToolLayout만이 `window.addEventListener('keydown')`을 사용한다는 가정은 **실측 결과 잘못됨**. 다음 8개 파일이 자체 window keydown 리스너를 등록한다:

| 파일 | 용도 |
|------|------|
| `src/adapters/components/Tools/ToolLayout.tsx` | ESC/F11/M + shortcuts dispatch |
| `src/adapters/components/Tools/ToolTimer.tsx` | Space(시작·정지), 화살표 등 |
| `src/adapters/components/Tools/Timer/PresentationMode.tsx` | 발표 모드 전용 키 |
| `src/adapters/components/Tools/Timer/StopwatchMode.tsx` | 스톱워치 제어 |
| `src/adapters/components/Tools/Timer/TimerMode.tsx` | 타이머 세부 |
| `src/adapters/components/Tools/ToolQRCode.tsx` | QR 전용 키 |
| `src/adapters/components/Tools/ToolWorkSymbols.tsx` | 활동 기호 전환 |
| `src/adapters/components/Tools/TeacherControlPanel.tsx` | 설문·투표 진행 제어 |

듀얼 모드에서 이 리스너들은 **DOM 트리 바깥(window)에서 동작**하므로 슬롯 DOM에 `inert` 속성을 부여해도 차단되지 않는다. → 반드시 리스너 진입 시점에 `activeSlot === 내 slotId` 여부를 체크해야 한다.

**해결 — 공통 훅 `useToolKeydown` 도입**:

**파일**: `src/adapters/hooks/useToolKeydown.ts` (신규)

```ts
import { useContext, useEffect } from 'react';
import { DualToolContext } from '@adapters/components/Tools/DualToolContext';

interface UseToolKeydownOptions {
  /** 활성 슬롯이 아니어도 반드시 실행 (ESC 전역 종료 등 예외 케이스) */
  allowInactive?: boolean;
  /** capture phase 등록 */
  capture?: boolean;
}

/**
 * Tool 컴포넌트가 window keydown에 반응할 때 사용하는 공통 훅.
 * 단일 모드에서는 항상 동작. 듀얼 모드에서는 active === true 일 때만 handler 실행.
 */
export function useToolKeydown(
  handler: (e: KeyboardEvent) => void,
  deps: React.DependencyList,
  options: UseToolKeydownOptions = {},
): void {
  const ctx = useContext(DualToolContext);
  useEffect(() => {
    const wrapped = (e: KeyboardEvent) => {
      if (ctx && !ctx.active && !options.allowInactive) return;
      handler(e);
    };
    window.addEventListener('keydown', wrapped, options.capture);
    return () => window.removeEventListener('keydown', wrapped, options.capture);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, ctx?.active]);
}
```

**마이그레이션 대상 8개 파일**: 위 8개 파일의 `useEffect(() => { window.addEventListener('keydown', fn); return () => ... }, [...]))` 패턴을 `useToolKeydown(fn, [...deps])` 로 치환한다. 동작 동일(단일 모드) + 듀얼 게이팅 자동 적용.

**ToolLayout 특례**: ToolLayout의 ESC 핸들러는 듀얼 모드에서도 "비활성 슬롯의 ESC는 무시"가 맞으므로 `allowInactive: false`(기본). F11은 DualToolContext 제공 시 `onSlotMaximizeToggle` 호출로 전환(§5.1 참조).

**회귀 테스트 가드**: 구현 후 ESLint 커스텀 규칙 또는 grep으로 `window.addEventListener.*keydown`이 `src/adapters/components/Tools/` 하위에서 `useToolKeydown` 외에 직접 호출되지 않는지 확인.

### 5.8 sessionStorage 스키마

```json
{
  "leftTool": "tool-scoreboard",
  "rightTool": "tool-timer",
  "splitRatio": 60
}
```

- 키: `ssampin:dual-tool-session`
- 값 변경 시 즉시 저장(debounce 500ms 선택적)
- 복원 시 유효 검증: `leftTool !== rightTool`, `splitRatio ∈ [20,80]`, 각 toolId ∈ DUAL_TOOL_IDS

---

## 6. Implementation Order

1. **toolRegistry 작성** (`toolRegistry.ts`, `DualToolId` 타입, ToolSeatPicker 제외 명시)
2. **DualToolContext 스캐폴딩** (Provider/Consumer 정의만)
3. **`useToolKeydown` 훅 작성** (§5.7) — DualToolContext 기반 active 게이팅
4. **마이그레이션**: 8개 파일의 `window.addEventListener('keydown')` → `useToolKeydown` 치환
   - `ToolLayout.tsx`, `ToolTimer.tsx`, `Timer/PresentationMode.tsx`, `Timer/StopwatchMode.tsx`, `Timer/TimerMode.tsx`, `ToolQRCode.tsx`, `ToolWorkSymbols.tsx`, `TeacherControlPanel.tsx`
   - 각 파일마다 단일 모드 스모크 테스트(스페이스·화살표·ESC·단축키) 수행
5. **ToolLayout 추가 수정** — `active`/`dualMode` prop + DualToolContext 소비 + 조건부 헤더 버튼 + F11 → 슬롯 최대화 전환
6. **useDualToolSession 훅**
7. **DualToolPicker** (Picker 상태 슬롯 헤더 포함)
8. **ResizeDivider** (프리셋 ↔ 드래그 상호작용 §3.2.1)
9. **DualToolSlot** (Context Provider 포함, 활성 전환 로직)
10. **DualToolContainer** — 상태·ResizeObserver 폴백·프리셋·Toast undo 훅 연결
11. **App.tsx** `dual-tool-view` 분기 + `lastSingleToolRef` 추적 (없으면 `tools`로 복귀)
12. **ToolLayout "도구 추가" 버튼** — 1280px 가드 포함 → `onNavigate('dual-tool-view')`
13. **Toast 통합** (기존 Toast 컴포넌트 재사용, `[복원]` 액션 5초 유예)
14. **AI 챗봇 지식 베이스 업데이트** (Plan FR-14):
    - `scripts/ingest-chatbot-qa.mjs`에서 **제거/수정할 기존 허위 Q** 식별 및 삭제:
      - "점수판에 점수를 저장하고 타이머를 동시에 사용할 수 있나요?" — 기존 "위젯으로 보기" 안내 제거
      - "위젯 항상 위에 고정" — "📌 압정 아이콘" 안내 제거
    - **추가할 신규 Q&A**:
      - Q: "두 개의 쌤 도구를 동시에 사용할 수 있나요?" → A: "네, v1.11.0부터 병렬 모드를 지원합니다. 도구 헤더의 분할화면(splitscreen) 아이콘을 누르시면..."
      - Q: "화면이 좁은데 병렬 모드가 안 돼요" → A: "1280px 이상에서 지원됩니다..."
    - 재임베딩 명령: `SUPABASE_URL=https://ddbkyaxvnpaxkbqbpijg.supabase.co EMBED_AUTH_TOKEN=ssampin-admin-2024-secure node scripts/ingest-chatbot-qa.mjs`
    - 릴리즈 직전 실행 + 로그로 재임베딩 성공(69+ 문서) 확인
15. **회귀 테스트** — 모든 기존 도구 단일 모드 스모크 + §7 듀얼 이벤트 격리 테스트

---

## 7. Testing Strategy

### 7.1 수동 검증 체크리스트

**기본 동작**
- [ ] 단일 모드로 점수판 → 헤더 "도구 추가" 클릭 → 타이머 선택 → 좌: 점수판, 우: 타이머 렌더링
- [ ] 점수판 점수 변경 → 우측 슬롯 닫기 → 점수판 단일 모드로 복귀, 점수 유지
- [ ] 프리셋 70:30 전환 → 레이아웃 즉시 반영, 사운드/줌 상태 각 슬롯 독립 유지
- [ ] 드래그 리사이즈 → 20%/80% 한계 clamp 확인, 드래그 후 프리셋 `aria-pressed` 자동 갱신

**키보드 이벤트 격리 (블로커 해소 확인 — FR-10)**
- [ ] 좌: 타이머, 우: 점수판 상태에서 좌측 슬롯 클릭 → 스페이스 → **좌측 타이머만** 시작, 점수판 변화 없음
- [ ] 우측 슬롯 클릭 → 활성 전환 후 스페이스 → **우측 점수판만** 영향(혹은 해당 Tool 반응), 좌측 타이머 상태 불변
- [ ] ESC: 비활성 슬롯에 포커스 없이 ESC 눌러도 활성 슬롯의 슬롯 닫기만 동작
- [ ] 좌: ToolWorkSymbols, 우: ToolQRCode 조합에서 각자 전용 단축키 격리 확인
- [ ] `useToolKeydown` 미마이그레이션 리스너 잔존 여부: `grep "window.addEventListener.*keydown" src/adapters/components/Tools/` 결과가 `useToolKeydown` 내부 1개만이어야 함

**제외 도구 (ToolSeatPicker)**
- [ ] DualToolPicker 목록에 "자리 뽑기"가 노출되지 않음

**폴백 / 세션**
- [ ] 창을 1200px로 축소 → Toast `[복원]` 표시, 활성 슬롯만 단일 모드 복귀
- [ ] 복원 Toast 5초 내 클릭 → 직전 듀얼 구성 복원 (창을 다시 1280+로 넓힌 상태에서)
- [ ] F5 새로고침 → 세션 복원 Toast + 동일 구성 복원
- [ ] 앱 재시작 → 세션 리셋 확인 (sessionStorage 특성)
- [ ] 1280px 미만 상태로 단일 모드에서 "도구 추가" 버튼 → disabled + 툴팁

**슬롯 최대화 / Picker**
- [ ] 슬롯 콘텐츠 최대화 → 해당 슬롯만 100% 확대, 상대 슬롯 상태 불변
- [ ] Picker 상태 슬롯 헤더는 줌/소리/단축키 버튼 없음, swap_vert·close만
- [ ] 반대 슬롯이 Picker일 때는 이 슬롯의 swap_vert 비활성

**호환성 / 위젯**
- [ ] 위젯 모드 버튼 호버 → "병렬 모드에서는 사용할 수 없어요" 툴팁
- [ ] 동일 도구 선택 UI 미노출 확인 (Picker에서 상대 슬롯 도구 숨김)
- [ ] 외부 링크 도구(`supsori`, `pblsketch`)·`tool-assignment`는 Picker에 없음

### 7.2 TypeScript 검증

- [ ] `npx tsc --noEmit` 에러 0
- [ ] `as const satisfies Record<DualToolId, ToolMeta>` 로 레지스트리 타입 안전성 보장
- [ ] `DualToolId` 누락 시 컴파일 실패로 감지

### 7.3 빌드 검증

- [ ] `npm run build` 성공
- [ ] `npm run electron:dev` 에서 동작 확인
- [ ] Electron 빌드 후 Windows 실행 확인

---

## 8. Risks & Mitigations

| 리스크 | 영향 | 완화 |
|------|------|------|
| ToolLayout 수정이 기존 18개 도구에 회귀 유발 | High | `active`·`dualMode` prop을 선택적(`?`)으로 + Context 기본 `null` → 기존 호출부 0 수정. 전체 도구 스모크 테스트 필수 |
| **개별 Tool의 `window` keydown 리스너 8개 파일이 비활성 슬롯에서도 발화** | **High** | **§5.7 `useToolKeydown` 훅으로 전면 마이그레이션 필수.** 미마이그레이션 시 FR-10 미충족 |
| `ToolSeatPicker`가 `document.fullscreenElement`를 직접 제어 → 슬롯 로컬 최대화 파괴 | High | **MVP에서 `DualToolId`에서 제외**. Phase 2에서 DualToolContext 기반 분기 후 지원 (§2.1 주석 참조) |
| React Context 남용으로 리렌더 과다 | Low | Context 값은 `useMemo`로 고정, 슬롯 단위에서만 제공 |
| sessionStorage 오염 시 앱 크래시 | Medium | `try/catch` + 유효성 검증, 실패 시 기본값 |
| Picker 오버레이 z-index 충돌 | Low | 슬롯 내부 `absolute inset-0 z-10` 로 슬롯 스코프에 한정 |
| 신규 Tool 추가 시 `toolRegistry` 등록 누락 | Medium | CI/PR 체크리스트에 "듀얼 지원 도구 추가 시 `DualToolId` 유니온·`TOOL_REGISTRY` 동시 수정" 명시. TypeScript `satisfies Record<DualToolId, ToolMeta>` 로 누락 컴파일 실패 유도 |
| "슬롯 닫기" 실수로 작업 내용 즉시 유실 체감 | Medium | Toast 5초 `[복원]` 액션(§3.7) + 닫힌 슬롯의 도구 state는 Toast 유예 동안 언마운트 지연 |

---

## 9. Open Questions (Design 단계 결정 필요)

| # | 질문 | 제안 | 상태 |
|---|------|------|------|
| Q1 | 듀얼 진입은 ToolLayout 버튼만? 사이드바에도 "병렬 모드" 진입점을 둘까? | 초기엔 ToolLayout 버튼만(컨텍스트 명확). 사이드바 진입은 1차 피드백 후 결정 | Open |
| Q2 | "슬롯 닫기" 시 확인 대화상자 필요? | 불필요(작업 유지됨). Toast 5초 `[복원]` 액션으로 실수 방지 (§3.7) | **Resolved** |
| Q3 | 드래그 리사이즈 최소·최대 폭 재고? | 20/80 유지. 10/90은 한쪽 도구 가시성 붕괴 | **Resolved** |
| Q4 | 분할 기본 비율 | 50:50 기본. `prefersWide` 도구가 포함되면 그 쪽을 60%로 초기화 (Phase 2) | **Resolved** |
| Q5 | 세션 복원 Toast를 언제까지 노출 | 3초 자동 닫힘 | **Resolved** |
| Q6 | 비활성 슬롯의 개별 Tool `window` keydown 리스너 격리 방법 | `useToolKeydown` 훅 도입(§5.7) + 8개 파일 마이그레이션 | **Resolved (구현 blocker → 해결)** |
| Q7 | `tool-seat-picker` 듀얼 지원 | MVP 제외 → Phase 2에서 fullscreen 분기 후 지원 (§2.1 주석) | **Resolved** |
| Q8 | 챗봇 KB 업데이트 타이밍 | 릴리즈 직전 실행 (§6 Implementation Order 14번, CLAUDE.md Release Workflow 3단계 준수) | **Resolved** |

---

## 10. Done Definition (Design)

- [x] 모든 FR(14개)과 NFR에 대한 구현 경로 명시
- [x] 컴포넌트 prop 인터페이스 TypeScript로 정의
- [x] 상태 전이도 및 invariants 명시
- [x] 기존 파일 수정 최소화 — ToolLayout·App.tsx 2곳만
- [x] Clean Architecture 의존성 검증 완료
- [x] 수동 테스트 체크리스트 12항목
- [ ] (다음) design-validator 검증
- [ ] (다음) 구현 진입 `/pdca do dual-tool-view`

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-17 | 초기 설계 — 분할 뷰 MVP, Context 기반 ToolLayout 듀얼 통합, toolRegistry 중앙화, sessionStorage 세션 훅 | pblsketch |
| 0.2 | 2026-04-17 | design-validator 검증 결과 반영: (1) `useToolKeydown` 훅 도입 + 8개 파일 마이그레이션 계획 (§5.7, 구현 블로커 해소), (2) ToolSeatPicker MVP 제외 (§2.1), (3) Picker 상태 슬롯 헤더 정의 (§3.3), (4) 프리셋 ↔ 드래그 상호작용 규칙 (§3.2.1), (5) Toast `[복원]` 액션 (§3.7), (6) 챗봇 KB 구체 액션 (§6 #14), (7) 키보드 이벤트 격리 테스트 추가 (§7.1) | pblsketch |
