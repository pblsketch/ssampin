# 쌤핀 위젯 분할 뷰 기능 계획서

> 작성일: 2026-03-03  
> 대상 레포: pblsketch/ssampin  
> 현재 버전 기반 분석

---

## 📋 목차

1. [현재 구조 분석](#1-현재-구조-분석)
2. [요구사항 정리](#2-요구사항-정리)
3. [설계 방향](#3-설계-방향)
4. [UI/UX 설계](#4-uiux-설계)
5. [데이터 모델 변경](#5-데이터-모델-변경)
6. [구현 계획 (단계별)](#6-구현-계획-단계별)
7. [파일 변경 목록](#7-파일-변경-목록)
8. [예상 이슈 및 대응](#8-예상-이슈-및-대응)

---

## 1. 현재 구조 분석

### 위젯 모드 진입 경로
```
App.tsx → isWidgetMode() 체크 → Widget.tsx 렌더링
  ↳ URL: ?mode=widget 또는 #widget
  ↳ Electron: createWidgetWindow() → BrowserWindow (투명, 프레임 없음)
```

### 현재 위젯 창 구조
```
┌─────────────────────────────────────┐
│ 헤더 (날짜/시간, 드래그 영역)           │
│ [전체화면 전환 버튼]                    │
├─────────────────────────────────────┤
│ 메시지 배너 (선택적)                    │
├─────────────────────────────────────┤
│ 위젯 그리드 (3열 고정)                  │
│ ┌───┬───┬───┐                       │
│ │ 1 │ 2 │ 3 │ ← grid-cols-3        │
│ ├───┴───┼───┤                       │
│ │   4   │ 5 │ ← colSpan 지원       │
│ └───────┴───┘                       │
│ (스크롤 가능)                          │
└─────────────────────────────────────┘
```

### 핵심 파일 관계
| 파일 | 역할 |
|------|------|
| `App.tsx` | 위젯 모드 분기 (isWidgetMode) |
| `Widget.tsx` | 위젯 모드 전용 렌더러 (전체 레이아웃) |
| `WidgetContextMenu.tsx` | 우클릭 메뉴 (투명도, 항상 위, 글자크기) |
| `WidgetGrid.tsx` | 대시보드용 그리드 (DnD 지원, 편집 모드) |
| `WidgetCard.tsx` | 개별 위젯 래퍼 (PIN 보호 포함) |
| `SortableWidget.tsx` | DnD + 리사이즈 래퍼 |
| `useDashboardConfig.ts` | Zustand 스토어 (위젯 순서/크기/표시 상태) |
| `types.ts` | WidgetInstance (colSpan: 1-4), DashboardConfig |
| `electron/main.ts` | widgetWindow 생성/관리, WorkerW 바탕화면 연결 |
| `Settings.ts` | WidgetSettings (width, height, opacity...) |

### 현재 제한사항
- 위젯 모드에서 **그리드 열 수 고정** (3열, `grid-cols-3`)
- **스크롤**로 모든 카드 표시 (한 화면에 안 들어갈 수 있음)
- 레이아웃 전환 기능 없음 (전체화면 ↔ 위젯만 토글)
- 위젯 모드에서 편집 불가 (대시보드에서만 가능)

---

## 2. 요구사항 정리

| # | 요구사항 | 우선순위 |
|---|---------|---------|
| R1 | 위젯 모드에서 **분할 레이아웃 선택** (전체/2분할/4분할) | 🔴 필수 |
| R2 | 2분할은 **상하 또는 좌우** 방향 선택 가능 | 🔴 필수 |
| R3 | **어떤 레이아웃이든 한 화면에 모든 카드 표시** (스크롤 없이) | 🔴 필수 |
| R4 | **위젯 모드 안에서 쉬운 레이아웃 전환** | 🔴 필수 |
| R5 | 사용자 친화적 UI/UX | 🔴 필수 |

### R3 상세: "한 화면에 모든 카드"의 의미
- 현재 카드 수: 최대 9~10개 (위젯 정의 기준)
- 활성화된 카드: 보통 6~8개 (프리셋 기준)
- → **카드 크기를 레이아웃에 맞춰 자동 축소**하여 스크롤 없이 표시
- → 분할이 많을수록 카드가 작아지는 트레이드오프 존재

---

## 3. 설계 방향

### 3.1 레이아웃 모드 정의

```typescript
type WidgetLayoutMode = 
  | 'full'         // 전체화면 (현재와 동일)
  | 'split-h'      // 2분할 좌우 (|)
  | 'split-v'      // 2분할 상하 (─)
  | 'quad';         // 4분할 (田)
```

### 3.2 분할 시 카드 배분 전략

**전체 (full)**: 현재와 동일, 3열 그리드

**2분할 좌우 (split-h)**:
```
┌─────────┬─────────┐
│ 패널 A  │ 패널 B  │
│ (위젯   │ (위젯   │
│  1~4)   │  5~8)   │
└─────────┴─────────┘
```

**2분할 상하 (split-v)**:
```
┌───────────────────┐
│     패널 A        │
│  (위젯 1~4)       │
├───────────────────┤
│     패널 B        │
│  (위젯 5~8)       │
└───────────────────┘
```

**4분할 (quad)**:
```
┌─────────┬─────────┐
│ 패널 A  │ 패널 B  │
│ (1~2)   │ (3~4)   │
├─────────┼─────────┤
│ 패널 C  │ 패널 D  │
│ (5~6)   │ (7~8)   │
└─────────┴─────────┘
```

### 3.3 자동 축소 로직 (R3 핵심)

각 레이아웃별로 패널 내부 그리드 설정을 동적으로 계산:

| 레이아웃 | 패널 수 | 패널당 열 수 | 카드당 maxHeight |
|---------|--------|------------|----------------|
| full | 1 | 3 | 화면÷행수 | 
| split-h | 2 | 2 | 화면÷행수 |
| split-v | 2 | 3 | (화면/2)÷행수 |
| quad | 4 | 2 | (화면/2)÷행수 |

**핵심 공식**:
```typescript
const totalCards = visibleWidgets.length;
const panelCount = getPanelCount(layoutMode);
const cardsPerPanel = Math.ceil(totalCards / panelCount);
const colsPerPanel = layoutMode === 'full' ? 3 
  : layoutMode === 'split-v' ? 3 
  : 2;
const rowsPerPanel = Math.ceil(cardsPerPanel / colsPerPanel);
const cardHeight = panelHeight / rowsPerPanel - gap;
```

→ 각 위젯 컴포넌트에 `maxHeight`를 CSS variable로 전달  
→ 위젯 내부에서 `overflow: hidden` + 축소 렌더링

---

## 4. UI/UX 설계

### 4.1 레이아웃 전환 UI — 헤더 토글 버튼

위젯 헤더의 전체화면 전환 버튼 옆에 **레이아웃 선택 버튼** 추가:

```
┌──────────────────────────────────────────────┐
│  3/3(월)  15:42      [⊞] [↗]               │
│                       레이아웃  전체화면       │
└──────────────────────────────────────────────┘
```

**[⊞] 클릭 시 플로팅 팝업**:
```
┌──────────────────┐
│ 레이아웃 선택     │
├──────────────────┤
│  ┌──┐  전체화면   │  ← 현재 선택 표시 (하이라이트)
│  └──┘            │
│  ┌─┬─┐  좌우 분할 │
│  └─┴─┘           │
│  ┌──┐  상하 분할  │
│  ├──┤            │
│  └──┘            │
│  ┌─┬─┐  4분할    │
│  ├─┼─┤           │
│  └─┴─┘           │
└──────────────────┘
```

### 4.2 레이아웃 전환 — 컨텍스트 메뉴 통합

기존 우클릭 메뉴(`WidgetContextMenu.tsx`)에도 레이아웃 섹션 추가:

```
┌──────────────────────┐
│ SsamPin Menu         │
├──────────────────────┤
│ 📌 항상 위에 표시     │
├──────────────────────┤
│ ⊞ 레이아웃           │
│   ◉ 전체화면          │
│   ○ 좌우 분할         │
│   ○ 상하 분할         │
│   ○ 4분할            │
├──────────────────────┤
│ ↗ 전체 화면으로 전환   │
├──────────────────────┤
│ 🔍 투명도 조절  80%   │
│ 가 글자 크기          │
│ ⚙ 설정              │
│ ✕ 닫기              │
└──────────────────────┘
```

### 4.3 키보드 단축키

| 단축키 | 동작 |
|--------|------|
| `Ctrl + 1` | 전체 화면 |
| `Ctrl + 2` | 좌우 2분할 |
| `Ctrl + 3` | 상하 2분할 |
| `Ctrl + 4` | 4분할 |
| `Ctrl + 0` | 순환 전환 (full → split-h → split-v → quad → full) |

### 4.4 전환 애니메이션

- **CSS transition**: 패널 크기 변경 시 `300ms ease-in-out`
- **카드 재배치**: `layout` 애니메이션 (Framer Motion 또는 CSS `view-transition`)
- 급격한 깜빡임 방지: 레이아웃 변경 시 카드가 기존 위치에서 새 위치로 자연스럽게 이동

### 4.5 반응형 폴백

위젯 창 크기가 너무 작을 때:
- **너비 < 640px**: 분할 무시, 강제 `full` 모드 (1열)
- **높이 < 480px**: 상하 분할 비활성화
- 크기 변경 시 자동으로 호환 가능한 레이아웃으로 폴백

---

## 5. 데이터 모델 변경

### 5.1 Settings 엔티티 확장

```typescript
// domain/entities/Settings.ts

export type WidgetLayoutMode = 'full' | 'split-h' | 'split-v' | 'quad';

export interface WidgetSettings {
  // ... 기존 필드 유지
  readonly width: number;
  readonly height: number;
  readonly transparent: boolean;
  readonly opacity: number;
  readonly cardOpacity: number;
  readonly alwaysOnTop: boolean;
  readonly closeToWidget: boolean;
  readonly visibleSections: WidgetVisibleSections;
  
  // ✅ 신규 필드
  readonly layoutMode: WidgetLayoutMode;  // 기본값: 'full'
}
```

### 5.2 DashboardConfig는 변경 없음

- 기존 `WidgetInstance.colSpan`은 `full` 모드에서만 적용
- 분할 모드에서는 colSpan 무시하고 균등 배분
- → 기존 데이터와 100% 호환

### 5.3 localStorage 마이그레이션

```typescript
// useSettingsStore.ts load() 함수에 추가
if (!settings.widget.layoutMode) {
  settings.widget.layoutMode = 'full'; // 기본값 폴백
}
```

---

## 6. 구현 계획 (단계별)

### Phase 1: 핵심 레이아웃 엔진 (2~3일)

#### Step 1.1: 타입 및 설정 확장
- `Settings.ts`: `WidgetLayoutMode` 타입 추가, `WidgetSettings.layoutMode` 필드 추가
- `useSettingsStore.ts`: 마이그레이션 로직, `layoutMode` 기본값 처리

#### Step 1.2: 분할 패널 컴포넌트 생성
**신규 파일**: `src/widgets/components/WidgetSplitContainer.tsx`

```typescript
interface WidgetSplitContainerProps {
  layoutMode: WidgetLayoutMode;
  widgets: WidgetInstance[];
}
```

- 레이아웃별 패널 분배 로직
- CSS Grid/Flexbox 기반 분할
- 각 패널에 `WidgetPanel` (내부 그리드) 렌더링

#### Step 1.3: 자동 축소 (Fit-to-Screen) 로직
**신규 파일**: `src/widgets/hooks/useAutoFitLayout.ts`

```typescript
function useAutoFitLayout(
  containerRef: RefObject<HTMLElement>,
  widgetCount: number,
  layoutMode: WidgetLayoutMode,
): {
  cols: number;        // 패널당 열 수
  cardMaxHeight: number;  // 카드 최대 높이
  panelHeight: number;
}
```

- `ResizeObserver`로 컨테이너 크기 실시간 감지
- 레이아웃 모드 + 위젯 수에 따른 최적 그리드 계산

### Phase 2: UI 컨트롤 (1~2일)

#### Step 2.1: 레이아웃 선택 팝업
**신규 파일**: `src/widgets/components/LayoutSelector.tsx`

- 4가지 레이아웃 아이콘 시각화
- 현재 선택 하이라이트
- 호버 시 프리뷰 텍스트

#### Step 2.2: 헤더 통합
**수정 파일**: `Widget.tsx`

- 레이아웃 버튼 추가 (전체화면 버튼 왼쪽)
- `WidgetSplitContainer` 렌더링으로 교체

#### Step 2.3: 컨텍스트 메뉴 확장
**수정 파일**: `WidgetContextMenu.tsx`

- 레이아웃 선택 라디오 그룹 추가
- 기존 메뉴 항목 사이에 자연스럽게 배치

### Phase 3: 키보드 단축키 & 애니메이션 (1일)

#### Step 3.1: 키보드 단축키
**수정 파일**: `Widget.tsx`

- `useEffect` + `keydown` 이벤트로 Ctrl+1~4 처리
- Electron `globalShortcut`은 불필요 (창 내부에서만 동작)

#### Step 3.2: 전환 애니메이션
**수정 파일**: `WidgetSplitContainer.tsx`

- CSS `transition` 적용 (패널 크기)
- 카드 재배치: `layout` CSS animation 또는 React key 전략

### Phase 4: 엣지 케이스 & 폴리싱 (1일)

- 위젯 창 리사이즈 시 레이아웃 자동 조정
- 최소 창 크기에서의 폴백
- 카드가 1~2개일 때 분할 레이아웃 처리
- 설정 저장/복원 확인
- WorkerW 바탕화면 모드에서 정상 동작 확인

---

## 7. 파일 변경 목록

### 신규 파일 (4개)

| 파일 | 설명 |
|------|------|
| `src/widgets/components/WidgetSplitContainer.tsx` | 분할 패널 컨테이너 |
| `src/widgets/components/LayoutSelector.tsx` | 레이아웃 선택 팝업 UI |
| `src/widgets/hooks/useAutoFitLayout.ts` | 자동 축소 계산 훅 |
| `src/widgets/components/WidgetPanel.tsx` | 개별 패널 그리드 렌더러 |

### 수정 파일 (5개)

| 파일 | 변경 내용 |
|------|----------|
| `src/domain/entities/Settings.ts` | `WidgetLayoutMode` 타입, `layoutMode` 필드 추가 |
| `src/adapters/stores/useSettingsStore.ts` | `layoutMode` 기본값 마이그레이션 |
| `src/adapters/components/Widget/Widget.tsx` | 헤더에 레이아웃 버튼 추가, `WidgetSplitContainer` 사용 |
| `src/adapters/components/Widget/WidgetContextMenu.tsx` | 레이아웃 선택 메뉴 추가 |
| `src/widgets/components/WidgetCard.tsx` | `maxHeight` prop 수용 (축소 렌더링) |

### 변경 없는 파일
- `WidgetGrid.tsx` — 대시보드 전용, 위젯 모드에서 미사용
- `useDashboardConfig.ts` — 위젯 순서/가시성 로직 그대로 사용
- `electron/main.ts` — 창 생성 로직 변경 불필요 (프론트엔드에서 처리)
- `presets.ts`, `registry.ts` — 변경 없음

---

## 8. 예상 이슈 및 대응

### 이슈 1: 카드 내용이 잘리는 문제
- **원인**: 4분할 시 카드가 매우 작아짐
- **대응**: 
  - 카드에 `compact` 모드 도입 (축소 시 헤더만 표시, 상세 숨김)
  - `fontSize` 설정과 연동 (분할 시 자동으로 한 단계 작게)
  - 최소 카드 높이 보장 (80px)

### 이슈 2: colSpan이 분할 모드와 충돌
- **원인**: `full`에서 colSpan=3인 위젯이 2열 패널에 들어갈 때
- **대응**: 분할 모드에서는 colSpan 무시, 모든 카드 1열 또는 균등 배분

### 이슈 3: WorkerW 바탕화면 모드에서의 이슈
- **원인**: 바탕화면 레이어에서 팝업(레이아웃 선택)이 잘릴 수 있음
- **대응**: 팝업을 `ReactDOM.createPortal(document.body)`로 렌더링 (현재 컨텍스트 메뉴와 동일 패턴)

### 이슈 4: 위젯 수가 적을 때 (1~3개)
- **원인**: 4분할인데 위젯이 3개면 빈 패널 발생
- **대응**: 빈 패널에 빈 상태 UI 표시 또는 자동으로 적절한 분할로 다운그레이드

### 이슈 5: 설정 동기화
- **원인**: 위젯 모드와 대시보드 모드가 별도 BrowserWindow
- **대응**: `layoutMode`는 `settings.json`(Electron 파일)에 저장 → 양쪽에서 읽기 가능 (기존 Settings 저장 패턴 활용)

---

## 📐 와이어프레임 요약

### 전체 (full) — 현재와 동일
```
┌─────────────────────────────────────┐
│  📅 3/3(월) 15:42        [⊞] [↗]  │
├─────────────────────────────────────┤
│ ┌─────┬─────┬─────┐               │
│ │ 시간 │ 급식 │ 일정 │               │
│ ├─────┼─────┼─────┤               │
│ │ 메모 │ 할일 │ 자리 │               │
│ ├─────┴─────┼─────┤               │
│ │  주간시간표  │ 담임 │               │
│ └───────────┴─────┘               │
└─────────────────────────────────────┘
```

### 좌우 2분할 (split-h)
```
┌─────────────────────────────────────┐
│  📅 3/3(월) 15:42        [⊞] [↗]  │
├────────────────┬────────────────────┤
│ ┌────┬────┐   │ ┌────┬────┐       │
│ │시간│급식│   │ │메모│할일│       │
│ ├────┼────┤   │ ├────┼────┤       │
│ │일정│자리│   │ │주간│담임│       │
│ └────┴────┘   │ └────┴────┘       │
└────────────────┴────────────────────┘
```

### 상하 2분할 (split-v)
```
┌─────────────────────────────────────┐
│  📅 3/3(월) 15:42        [⊞] [↗]  │
├─────────────────────────────────────┤
│ ┌─────┬─────┬─────┬─────┐         │
│ │시간 │급식 │일정 │자리 │         │
│ └─────┴─────┴─────┴─────┘         │
├─────────────────────────────────────┤
│ ┌─────┬─────┬─────┬─────┐         │
│ │메모 │할일 │주간 │담임 │         │
│ └─────┴─────┴─────┴─────┘         │
└─────────────────────────────────────┘
```

### 4분할 (quad)
```
┌─────────────────────────────────────┐
│  📅 3/3(월) 15:42        [⊞] [↗]  │
├────────────────┬────────────────────┤
│ ┌────┬────┐   │ ┌────┬────┐       │
│ │시간│급식│   │ │일정│자리│       │
│ └────┴────┘   │ └────┴────┘       │
├────────────────┼────────────────────┤
│ ┌────┬────┐   │ ┌────┬────┐       │
│ │메모│할일│   │ │주간│담임│       │
│ └────┴────┘   │ └────┴────┘       │
└────────────────┴────────────────────┘
```

---

## 🗓️ 예상 일정

| 단계 | 기간 | 산출물 |
|------|------|--------|
| Phase 1 | 2~3일 | 분할 레이아웃 엔진 + 자동 축소 |
| Phase 2 | 1~2일 | UI 컨트롤 (헤더, 컨텍스트 메뉴) |
| Phase 3 | 1일 | 키보드 단축키 + 애니메이션 |
| Phase 4 | 1일 | 엣지 케이스 처리 + 테스트 |
| **합계** | **5~7일** | |

---

## ✅ 체크리스트 (구현 완료 기준)

- [ ] 전체/좌우2분할/상하2분할/4분할 레이아웃 전환 가능
- [ ] 모든 레이아웃에서 카드가 한 화면에 표시됨 (스크롤 없음)
- [ ] 헤더 버튼으로 레이아웃 쉽게 전환
- [ ] 우클릭 메뉴에서도 레이아웃 전환 가능
- [ ] Ctrl+1~4 키보드 단축키 동작
- [ ] 레이아웃 설정이 저장/복원됨
- [ ] 전환 시 자연스러운 애니메이션
- [ ] 창 크기 변경 시 자동 조정
- [ ] 바탕화면(WorkerW) 모드에서 정상 동작
- [ ] 기존 위젯 설정(투명도, 크기, 글자크기)과 호환
