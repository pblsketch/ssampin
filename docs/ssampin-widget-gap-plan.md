# 쌤핀 위젯 빈 공간 해결 — 구현 계획서

## 📋 문제 정의

### 현재 상태
- 대시보드는 **CSS Grid 4열 레이아웃** (`grid-cols-4`)을 사용
- 각 위젯은 `colSpan` (1~4)으로 **가로 크기만** 조절 가능
- `grid-flow-row-dense`가 적용되어 있어 가로 빈틈은 자동으로 채워지지만, **세로 방향 빈 공간**은 처리하지 못함
- 예: 시간표(colSpan=2, 세로 큼) + 메모(colSpan=1, 세로 작음) → 메모 아래에 큰 빈 공간 발생

### 핵심 원인
```
현재 WidgetInstance 타입:
{
  widgetId: string;
  visible: boolean;
  order: number;
  colSpan: 1 | 2 | 3 | 4;   ← 가로만 조절 가능
  // rowSpan 없음!            ← 세로 조절 불가
}
```

CSS Grid는 `grid-row` 속성으로 세로 크기도 조절할 수 있지만, 현재 코드에는 `rowSpan` 개념이 없어서 모든 위젯이 자신의 콘텐츠 높이만큼만 차지합니다. 높이가 다른 위젯이 같은 행에 배치되면 짧은 위젯 아래에 빈 공간이 생기는 것.

### 스크린샷 분석
```
┌─────────────┬───────────┬───────────┐
│ 시간표       │           │ 메모       │
│ (col=2)     │           │ (col=1)   │
│ ████████    │           │ ██        │
│ ████████    │           │           │ ← 빈 공간!
│ ████████    │           │           │ ← 빈 공간!
├─────────────┤───────────┼───────────┤
│ 오늘 할 일   │ 다가오는   │ 오늘 기록  │
│ (col=1)     │ 일정(col=1)│ (col=1)   │
│ ██          │ ████████  │ ██        │
│             │ ████████  │           │ ← 빈 공간!
│ 빈 공간! ↑  │           │ 빈 공간! ↑ │
├─────────────┴───────────┴───────────┤
│ 오늘의 급식 (col=3 또는 full)        │
└─────────────────────────────────────┘
```

---

## 🎯 해결 방안 비교

### 방안 A: rowSpan 추가 (세로 크기 직접 조절) ⭐ 추천
- `WidgetInstance`에 `rowSpan` 필드 추가
- 편집 모드에서 세로 크기도 드래그로 조절 가능
- Grid의 `grid-row: span N` 활용

**장점**: 사용자가 원하는 대로 정밀 배치 가능
**단점**: 구현 복잡도 중간, 행 높이 고정 필요

### 방안 B: Masonry 레이아웃 (Pinterest 스타일)
- CSS Grid 대신 Masonry 레이아웃 적용
- 빈 공간 없이 위젯이 벽돌처럼 쌓임

**장점**: 빈 공간 자동 해결
**단점**: 기존 Grid 구조 전면 교체, DnD 호환 어려움

### 방안 C: 고정 행 높이 + rowSpan + 빈 칸 채우기 ⭐⭐ 최적 추천
- 행 높이를 고정값(예: 80px)으로 설정
- 각 위젯에 `rowSpan` 추가 (몇 행을 차지할지)
- 편집 모드에서 하단 드래그로 세로 크기 조절
- `grid-auto-rows: 80px` + `grid-row: span N`

**장점**: 정밀 배치 + 빈 공간 최소화 + 기존 DnD 호환
**단점**: 구현 복잡도 약간 높음

→ **방안 C를 추천합니다.** 기존 가로 리사이즈 로직과 동일한 패턴으로 세로도 구현 가능하고, 가장 유연합니다.

---

## 🏗️ 상세 설계 (방안 C)

### 1. 데이터 모델 확장

```typescript
// src/widgets/types.ts
export interface WidgetInstance {
  widgetId: string;
  visible: boolean;
  order: number;
  colSpan: 1 | 2 | 3 | 4;
  rowSpan: number;        // NEW: 세로 크기 (행 단위, 기본값은 위젯별 defaultSize.h)
}

export interface WidgetDefinition {
  // ... 기존 필드들 ...
  defaultSize: { w: number; h: number };  // h가 이제 실제 rowSpan 기본값으로 사용
  minSize: { w: number; h: number };      // h가 최소 rowSpan
}
```

### 2. Grid 컨테이너 변경

```typescript
// WidgetGrid.tsx — 현재
<div className="grid grid-cols-1 gap-4 md:grid-cols-4 grid-flow-row-dense items-start">

// WidgetGrid.tsx — 변경 후
<div
  className="grid grid-cols-1 gap-4 md:grid-cols-4 grid-flow-row-dense"
  style={{ gridAutoRows: '80px' }}  // 고정 행 높이
>
```

### 3. 위젯 아이템에 rowSpan 적용

```typescript
// SortableWidget.tsx
const spanClass = getSpanClass(instance.colSpan);
const rowClass = `row-span-${instance.rowSpan}`;  // NEW

return (
  <div
    ref={setNodeRef}
    style={style}
    className={`${spanClass} ${rowClass} ...`}
  >
```

### 4. 세로 리사이즈 핸들 추가

기존 `WidgetResizeHandle`은 **우측 드래그 = 가로** 조절.
새로운 **하단 드래그 = 세로** 조절 핸들 추가.

```
┌──────────────────────┐
│  위젯 콘텐츠          │
│                      │
│                      │
│                      │
├──────────────────────┤ ← 하단 드래그 핸들 (세로 리사이즈)
└──────────────────────┘ ↕ 위/아래로 드래그
```

### 5. 행 높이 (ROW_HEIGHT) 결정

```
ROW_HEIGHT = 80px (기본값)

예시 매핑:
- 메모 카드: rowSpan=3 → 240px
- 시간표: rowSpan=5 → 400px
- 급식: rowSpan=3 → 240px
- 오늘 할 일: rowSpan=3 → 240px

사용자가 편집 모드에서 하단을 드래그하면 80px 단위로 늘이거나 줄임
```

### 6. 기존 위젯 기본 rowSpan 값

| 위젯 | 현재 defaultSize.h | 권장 기본 rowSpan |
|------|-------------------|------------------|
| 교사 주간시간표 | 1 | 5 |
| 오늘 수업 | 1 | 4 |
| 학급 시간표 | 1 | 5 |
| 자리배치 | 1 | 4 |
| 담임 메모장 | 1 | 4 |
| 급식 메뉴 | 1 | 3 |
| 다가오는 일정 | 1 | 3 |
| 메모 | 1 | 5 |
| 할 일 | 1 | 3 |

### 7. Zustand 스토어 확장

```typescript
// useDashboardConfig.ts
resizeWidgetHeight: (widgetId: string, rowSpan: number) => void;
```

---

## 📐 구현 단계

### Phase 1: 데이터 모델 + 그리드 기반 (1일)
- [ ] `WidgetInstance`에 `rowSpan` 필드 추가
- [ ] 기존 config 마이그레이션 (rowSpan 없으면 defaultSize.h 적용)
- [ ] Grid 컨테이너에 `gridAutoRows: '80px'` 적용
- [ ] `getRowSpanClass()` 유틸 함수 생성
- [ ] `SortableWidget`에 rowSpan CSS 클래스 적용

### Phase 2: 세로 리사이즈 핸들 (1~2일)
- [ ] `WidgetVerticalResizeHandle` 컴포넌트 생성
  - 하단 가장자리 드래그로 rowSpan 조절
  - 행 높이(80px) 단위로 스냅
  - 드래그 중 프리뷰 오버레이 표시 ("N행" 라벨)
- [ ] Zustand에 `resizeWidgetHeight` 액션 추가
- [ ] `SortableWidget`에 세로 리사이즈 핸들 배치

### Phase 3: 위젯 콘텐츠 높이 적응 (1일)
- [ ] 각 위젯 아이템이 부모 높이에 맞게 확장/축소
- [ ] `overflow-auto` 또는 `overflow-hidden`으로 넘치는 콘텐츠 처리
- [ ] 시간표: rowSpan이 작으면 스크롤 가능하게
- [ ] 급식/일정: rowSpan이 크면 여백으로 균일하게

### Phase 4: 마무리 + UX (0.5일)
- [ ] 위젯 설정 패널에서 기본 rowSpan 리셋 버튼
- [ ] 프리셋 업데이트 (프리셋별 권장 rowSpan 포함)
- [ ] 위젯 모드(미니 창)에서도 rowSpan 동작 확인
- [ ] Tailwind safelist에 `row-span-*` 클래스 추가

**총 예상 기간: 2.5~3.5일**

---

## ⚠️ 고려사항

### Tailwind CSS row-span 동적 클래스
Tailwind은 동적 클래스를 트리셰이킹할 수 있으므로, `safelist`에 추가하거나 인라인 스타일 사용:
```typescript
// 안전한 방법: 인라인 스타일 사용
style={{ gridRow: `span ${rowSpan} / span ${rowSpan}` }}

// 또는 tailwind.config.js safelist 추가
safelist: ['row-span-1', 'row-span-2', ..., 'row-span-8']
```

### DnD 호환성
- `@dnd-kit/sortable`의 `rectSortingStrategy`는 다양한 크기의 아이템을 지원
- rowSpan이 추가되어도 DnD 드래그 동작에 큰 영향 없음
- 다만 드래그 오버레이 크기가 실제 위젯 크기와 맞아야 자연스러움

### 위젯 모드 (미니 창)
- 미니 창에서는 `useAutoFitLayout` 훅이 별도로 동작
- rowSpan 적용 시 `cardMaxHeight` 계산에 rowSpan 반영 필요

### 기존 데이터 마이그레이션
- `rowSpan` 필드가 없는 기존 config는 `defaultSize.h` 기반으로 자동 계산
- `useDashboardConfig.load()`의 마이그레이션 로직에 추가
