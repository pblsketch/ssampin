# 쌤핀 위젯/대시보드 기능 개선 구현 계획서

> **작성일**: 2026년 3월 4일  
> **대상 버전**: v0.1.7 → v0.2.0  
> **예상 소요**: 5~6일

---

## 📋 구현 목표

| # | 기능 | 우선순위 | 난이도 |
|---|------|---------|--------|
| W1 | 위젯 크기 조절 colSpan 실제 반영 | ⭐⭐⭐ | ⭐⭐ |
| W2 | 위젯 탭 뷰 (카테고리별 탭 전환) | ⭐⭐ | ⭐⭐⭐ |
| W3 | 위젯 내부 인터랙션 (클릭→상세) | ⭐⭐⭐ | ⭐⭐ |
| W4 | 위젯 새로고침 메커니즘 | ⭐⭐ | ⭐ |

---

## 🏗 현재 코드 분석

### 위젯 시스템 아키텍처

```
src/widgets/
├── types.ts               ← WidgetInstance, DashboardConfig 타입 정의
├── registry.ts            ← WIDGET_DEFINITIONS (9개 위젯 등록)
├── presets.ts             ← 학교급/역할별 기본 프리셋
├── useDashboardConfig.ts  ← Zustand 스토어 (CRUD + localStorage)
├── hooks/
│   └── useAutoFitLayout.ts← ResizeObserver 기반 자동 레이아웃
├── components/
│   ├── DashboardHeader.tsx← 헤더 (시계, 날씨, 편집 버튼)
│   ├── WidgetGrid.tsx     ← DnD 그리드 (편집 모드)
│   ├── WidgetCard.tsx     ← 위젯 래퍼 (PIN 보호, 편집 UI)
│   ├── SortableWidget.tsx ← DnD용 정렬 가능 위젯
│   ├── WidgetResizeHandle.tsx ← 드래그 리사이즈 핸들
│   ├── WidgetSplitContainer.tsx ← 분할 레이아웃 컨테이너
│   ├── WidgetPanel.tsx    ← 패널 내 위젯 그리드
│   ├── LayoutSelector.tsx ← 레이아웃 모드 선택 팝업
│   └── WidgetSettingsPanel.tsx ← 위젯 ON/OFF 설정 사이드패널
└── items/                 ← 각 위젯 컴포넌트 (기존 대시보드 래핑)
    ├── WeeklyTimetable.tsx← 교사 주간시간표 (실제 구현)
    ├── TodayClass.tsx     ← 오늘 수업 (실제 구현)
    ├── ClassTimetable.tsx ← 학급 시간표 (실제 구현)
    ├── Seating.tsx        ← 자리배치 (실제 구현)
    ├── Meal.tsx           ← 급식 (기존 DashboardMeal 래핑)
    ├── Events.tsx         ← 일정 (기존 DashboardEvents 래핑)
    ├── Memo.tsx           ← 메모 (기존 DashboardMemo 래핑)
    ├── StudentRecords.tsx ← 담임메모장 (실제 구현)
    ├── TodoWidget.tsx     ← 할일 (기존 DashboardTodo 래핑)
    ├── Attendance.tsx     ← 출결 (placeholder — "준비 중")
    ├── Grades.tsx         ← 성적 (placeholder — "준비 중")
    └── Tasks.tsx          ← 업무 (placeholder — "준비 중")
```

### 핵심 발견

**1. colSpan이 WidgetPanel에서 무시됨**:
- `SortableWidget.tsx`에서 `COL_SPAN_CLASS` 매핑 → colSpan CSS 적용 ✅
- 하지만 `WidgetPanel.tsx` (분할 모드용)에서는 colSpan 완전 무시 ❌
- 분할 모드에서 위젯이 항상 1칸으로 렌더링됨

**2. 편집 모드 vs 전체화면 모드 분리**:
- `WidgetGrid` = 편집 모드용 (DnD + 리사이즈)
- `WidgetSplitContainer` = 전체화면(4분할) 모드용 (읽기 전용)
- 두 컴포넌트가 colSpan을 다르게 처리하고 있음

**3. 미등록 위젯 3개**:
- `Attendance`, `Grades`, `Tasks`는 registry.ts에 미등록 → UI에 안 나옴
- placeholder 상태 ("준비 중")

**4. WidgetInstance 타입**:
```typescript
interface WidgetInstance {
  widgetId: string;
  visible: boolean;
  order: number;
  colSpan: 1 | 2 | 3 | 4;
}
```
colSpan은 저장되지만 분할 모드에서 활용 안 됨.

---

## 📐 상세 설계

---

### W1. 위젯 크기 조절 colSpan 실제 반영

#### 1-1. 문제 분석

**SortableWidget (편집 모드)** — colSpan 반영 O:
```typescript
const COL_SPAN_CLASS: Record<number, string> = {
  1: 'col-span-1',
  2: 'col-span-1 md:col-span-2',
  3: 'col-span-1 md:col-span-3',
  4: 'col-span-1 md:col-span-3', // 4칸 = 3칸으로 매핑 (3열 그리드)
};
```

**WidgetPanel (전체화면/분할 모드)** — colSpan 반영 X:
```typescript
// 현재: 모든 위젯이 동일 크기
{widgets.map((instance) => {
  return (
    <div key={instance.widgetId}>   {/* ← colSpan 없음! */}
      <WidgetCard definition={definition} scaleFactor={scaleFactor} />
    </div>
  );
})}
```

#### 1-2. 수정 방안

**WidgetPanel.tsx** 수정:

```typescript
// 수정 후: colSpan 반영
export function WidgetPanel({ widgets, cols, layoutMode }: WidgetPanelProps) {
  const scaleFactor = getScaleFactor(layoutMode);

  return (
    <div className="h-full w-full overflow-y-auto min-h-0" style={{ scrollbarWidth: 'thin' }}>
      <div
        className="grid gap-3 w-full content-start"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        }}
      >
        {widgets.map((instance) => {
          const definition = getWidgetById(instance.widgetId);
          if (!definition) return null;

          // colSpan을 cols 이하로 클램핑
          const effectiveSpan = Math.min(instance.colSpan, cols);

          return (
            <div
              key={instance.widgetId}
              style={{ gridColumn: `span ${effectiveSpan}` }}
            >
              <WidgetCard definition={definition} scaleFactor={scaleFactor} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

#### 1-3. SortableWidget colSpan 4→3 매핑 수정

현재 colSpan 4가 3으로 매핑되는데, 실제 그리드가 3열이므로 맞음.
하지만 향후 4열 대응을 위해 동적 매핑으로 변경:

```typescript
// SortableWidget.tsx — 동적 span 클래스 생성
function getSpanClass(colSpan: number, maxCols: number): string {
  const effective = Math.min(colSpan, maxCols);
  if (effective <= 1) return 'col-span-1';
  return `col-span-1 md:col-span-${effective}`;
}
```

#### 1-4. 수정 대상 파일

| 파일 | 변경 내용 |
|------|----------|
| `widgets/components/WidgetPanel.tsx` | ✏️ colSpan 반영 (gridColumn: span N) |
| `widgets/components/SortableWidget.tsx` | ✏️ 동적 span 클래스 |

---

### W2. 위젯 탭 뷰 (카테고리별 탭 전환)

현재 대시보드는 모든 위젯을 한 화면에 나열합니다. FGI에서 교사들은 "시간표만 크게 보고 싶을 때가 있다"는 피드백을 주었습니다.

#### 2-1. 탭 모드 개요

위젯 상단에 카테고리 탭을 추가하여, 탭 전환 시 해당 카테고리만 표시합니다:

```
┌──────────────────────────────────────────────────────┐
│  [전체]  [시간표]  [학급]  [정보]  [관리]             │
├──────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│  │ 주간시간표│ │ 오늘수업  │ │ 학급시간표│             │
│  │          │ │          │ │          │             │
│  └──────────┘ └──────────┘ └──────────┘             │
└──────────────────────────────────────────────────────┘
```

#### 2-2. 구현 전략

**기존 WidgetGrid에 탭 필터 추가** (새 컴포넌트 X, 기존 컴포넌트 확장):

```typescript
// WidgetGrid.tsx — 탭 기능 추가

type TabFilter = 'all' | WidgetCategory;

export function WidgetGrid({ isEditMode }: WidgetGridProps) {
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  
  // ... 기존 코드 ...
  
  const filteredWidgets = useMemo(() => {
    if (activeTab === 'all') return visibleWidgets;
    return visibleWidgets.filter((w) => {
      const def = getWidgetById(w.widgetId);
      return def?.category === activeTab;
    });
  }, [visibleWidgets, activeTab]);
  
  return (
    <div>
      {/* 탭 바 — 편집 모드가 아닐 때만 표시 */}
      {!isEditMode && visibleWidgets.length > 4 && (
        <WidgetTabBar activeTab={activeTab} onTabChange={setActiveTab} />
      )}
      
      {/* 그리드 — filteredWidgets 사용 */}
      <DndContext ...>
        <SortableContext items={filteredIds} ...>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 ...">
            {filteredWidgets.map(...)}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
```

#### 2-3. WidgetTabBar 컴포넌트

```typescript
// widgets/components/WidgetTabBar.tsx (신규)

const TAB_ITEMS: { key: TabFilter; label: string; icon: string }[] = [
  { key: 'all', label: '전체', icon: '📌' },
  { key: 'timetable', label: '시간표', icon: '📅' },
  { key: 'class', label: '학급', icon: '🏫' },
  { key: 'info', label: '정보', icon: '📋' },
  { key: 'admin', label: '관리', icon: '⚙️' },
];

interface WidgetTabBarProps {
  activeTab: TabFilter;
  onTabChange: (tab: TabFilter) => void;
}

export function WidgetTabBar({ activeTab, onTabChange }: WidgetTabBarProps) {
  return (
    <div className="flex gap-1 mb-4 overflow-x-auto scrollbar-none">
      {TAB_ITEMS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
            whitespace-nowrap transition-colors
            ${activeTab === tab.key
              ? 'bg-sp-accent text-white'
              : 'text-sp-muted hover:text-sp-text hover:bg-sp-card/50'
            }
          `}
        >
          <span className="text-xs">{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
```

#### 2-4. 분할 모드(WidgetSplitContainer)에도 적용

분할 모드에서는 탭이 아닌 **패널별 카테고리 자동 배정** 전략 사용:

```
전체: 모든 위젯 한 패널
좌우분할: 좌=시간표+학급, 우=정보+관리
상하분할: 상=시간표, 하=나머지
4분할: 시간표|학급|정보|관리
```

이는 기존 `splitWidgets` 함수를 카테고리 기반으로 개선:

```typescript
function splitWidgetsByCategory(
  widgets: WidgetInstance[],
  layoutMode: WidgetLayoutMode,
): WidgetInstance[][] {
  if (layoutMode === 'full') return [widgets];
  
  const categorize = (w: WidgetInstance) => getWidgetById(w.widgetId)?.category;
  
  const groups: Record<WidgetCategory, WidgetInstance[]> = {
    timetable: [], class: [], info: [], admin: [],
  };
  
  for (const w of widgets) {
    const cat = categorize(w);
    if (cat) groups[cat].push(w);
  }
  
  switch (layoutMode) {
    case 'split-h':
      return [
        [...groups.timetable, ...groups.class],
        [...groups.info, ...groups.admin],
      ];
    case 'split-v':
      return [
        [...groups.timetable],
        [...groups.class, ...groups.info, ...groups.admin],
      ];
    case 'quad':
      return [
        groups.timetable,
        groups.class,
        groups.info,
        groups.admin,
      ];
  }
}
```

#### 2-5. 수정 대상 파일

| 파일 | 변경 내용 |
|------|----------|
| `widgets/components/WidgetTabBar.tsx` | 🆕 탭 바 컴포넌트 |
| `widgets/components/WidgetGrid.tsx` | ✏️ 탭 필터 + WidgetTabBar 통합 |
| `widgets/components/WidgetSplitContainer.tsx` | ✏️ 카테고리 기반 분배 로직 |

---

### W3. 위젯 내부 인터랙션 (클릭→상세)

현재 위젯은 정보 표시만 하고, 클릭 시 아무 일도 안 합니다. "일정 위젯 클릭→일정 상세", "할일 위젯 클릭→할일 페이지"로 연결해야 합니다.

#### 3-1. WidgetDefinition에 네비게이션 정보 추가

```typescript
// types.ts 수정

export interface WidgetDefinition {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly description: string;
  readonly category: WidgetCategory;
  readonly defaultSize: { w: number; h: number };
  readonly minSize: { w: number; h: number };
  readonly availableFor: { ... };
  readonly component: ComponentType;
  
  // ✅ 신규: 클릭 시 이동할 경로
  readonly navigateTo?: string;        // 예: '/schedule', '/todo'
  readonly navigateLabel?: string;     // 예: '일정 전체 보기'
}
```

#### 3-2. registry.ts — 네비게이션 경로 추가

```typescript
// registry.ts 수정
{
  id: 'events',
  name: '다가오는 일정',
  icon: '📆',
  navigateTo: '/schedule',        // ✅ 추가
  navigateLabel: '일정 전체 보기', // ✅ 추가
  // ...
},
{
  id: 'todo',
  name: '할 일',
  icon: '✅',
  navigateTo: '/todo',
  navigateLabel: '할 일 전체 보기',
  // ...
},
{
  id: 'meal',
  name: '급식 메뉴',
  icon: '🍱',
  navigateTo: '/meal',
  navigateLabel: '급식 전체 보기',
  // ...
},
{
  id: 'memo',
  name: '메모',
  icon: '📝',
  navigateTo: '/memo',
  navigateLabel: '메모 전체 보기',
  // ...
},
```

#### 3-3. WidgetCard에 클릭 핸들러 + "더 보기" 링크

```typescript
// WidgetCard.tsx 수정

import { useNavigate } from 'react-router-dom'; // 또는 앱 내 라우팅 시스템

export function WidgetCard({ definition, isEditMode, onHide, maxHeight, scaleFactor }: WidgetCardProps) {
  const navigate = useNavigate();
  
  const handleClick = () => {
    if (isEditMode || !definition.navigateTo) return;
    navigate(definition.navigateTo);
  };
  
  const isClickable = !isEditMode && !!definition.navigateTo;
  
  return (
    <div
      className={`relative ${isClickable ? 'cursor-pointer group/clickable' : ''}`}
      onClick={handleClick}
    >
      {/* 기존 콘텐츠 */}
      {content}
      
      {/* "더 보기" 오버레이 (hover 시 표시) */}
      {isClickable && (
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-sp-card/90 to-transparent
          flex items-end justify-center pb-2
          opacity-0 group-hover/clickable:opacity-100 transition-opacity">
          <span className="text-xs text-sp-accent font-medium flex items-center gap-1">
            {definition.navigateLabel ?? '더 보기'}
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </span>
        </div>
      )}
    </div>
  );
}
```

#### 3-4. 위젯 내부 직접 인터랙션

일부 위젯은 외부 이동 없이 위젯 내에서 바로 조작할 수 있어야 합니다:

**TodoWidget** — 체크박스 토글:
```
┌─ ✅ 할 일 ────────────────────────┐
│  ☑ 학생부 기록 정리         완료  │
│  ☐ 환경교육 자료 검토       미완  │
│  ☐ PBL 스케치 업데이트      미완  │
│  ───────────────────────────────  │
│  📋 할 일 전체 보기 →            │
└───────────────────────────────────┘
```

현재 `DashboardTodo`가 이미 체크박스 토글을 지원하므로, 래핑만 유지하면 됩니다.

**Events** — 일정 클릭 시 팝업:
```
┌─ 📆 다가오는 일정 ───────────────┐
│  D-3  교직원 회의          3/7  │  ← 클릭 시 EventPopup
│  D-7  환경교육의 날        3/11 │
│  D-14 중간고사 시작        3/18 │
│  ───────────────────────────────  │
│  📅 일정 전체 보기 →            │
└───────────────────────────────────┘
```

기존 `EventPopup`을 위젯 내에서도 사용:

```typescript
// Events 위젯에서 이벤트 클릭 핸들러 추가
function handleEventClick(event: SchoolEvent) {
  // EventPopup을 portal로 표시
  setSelectedEvent(event);
}
```

#### 3-5. 수정 대상 파일

| 파일 | 변경 내용 |
|------|----------|
| `widgets/types.ts` | ✏️ `navigateTo`, `navigateLabel` 추가 |
| `widgets/registry.ts` | ✏️ 각 위젯에 네비게이션 경로 설정 |
| `widgets/components/WidgetCard.tsx` | ✏️ 클릭 핸들러 + "더 보기" 오버레이 |
| `widgets/items/Events.tsx` | ✏️ 이벤트 클릭→EventPopup 연동 |

---

### W4. 위젯 새로고침 메커니즘

현재 위젯은 마운트 시 데이터를 로드하고 이후 업데이트하지 않습니다. 교사가 대시보드를 켜둔 채로 오래 두면 데이터가 stale해집니다.

#### 4-1. 전략: Interval + Visibility API

```typescript
// widgets/hooks/useWidgetRefresh.ts (신규)

import { useEffect, useCallback, useRef } from 'react';

interface UseWidgetRefreshOptions {
  intervalMs?: number;        // 자동 새로고침 간격 (기본 5분)
  refreshOnVisible?: boolean; // 탭 활성화 시 새로고침
}

/**
 * 위젯 자동 새로고침 훅
 * - 일정 간격마다 자동 새로고침
 * - 탭이 비활성→활성으로 전환될 때 새로고침
 */
export function useWidgetRefresh(
  onRefresh: () => void | Promise<void>,
  options: UseWidgetRefreshOptions = {},
): { refresh: () => void; lastRefreshAt: number } {
  const { intervalMs = 5 * 60 * 1000, refreshOnVisible = true } = options;
  const lastRefreshRef = useRef(Date.now());
  
  const refresh = useCallback(() => {
    lastRefreshRef.current = Date.now();
    void onRefresh();
  }, [onRefresh]);
  
  // 주기적 새로고침
  useEffect(() => {
    const timer = setInterval(refresh, intervalMs);
    return () => clearInterval(timer);
  }, [refresh, intervalMs]);
  
  // 탭 활성화 시 새로고침
  useEffect(() => {
    if (!refreshOnVisible) return;
    
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastRefreshRef.current;
        // 마지막 새로고침 후 1분 이상 지났으면 갱신
        if (elapsed > 60_000) {
          refresh();
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [refresh, refreshOnVisible]);
  
  return { refresh, lastRefreshAt: lastRefreshRef.current };
}
```

#### 4-2. 위젯별 새로고침 적용

**급식 위젯 (Meal)** — 하루에 1번만 새로고침:
```typescript
useWidgetRefresh(loadMeal, { intervalMs: 30 * 60 * 1000 }); // 30분
```

**일정 위젯 (Events)** — 5분마다:
```typescript
useWidgetRefresh(loadEvents, { intervalMs: 5 * 60 * 1000 });
```

**할일 위젯 (Todo)** — Zustand 스토어로 이미 실시간, 새로고침 불필요.

**시간표 위젯 (WeeklyTimetable)** — 날짜 변경 시만:
```typescript
useWidgetRefresh(loadSchedule, { intervalMs: 60 * 60 * 1000 }); // 1시간
```

#### 4-3. 헤더에 수동 새로고침 버튼

```typescript
// DashboardHeader.tsx — 새로고침 버튼 추가

<button
  onClick={refreshAll}
  className="p-2 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-card transition-colors"
  title="모든 위젯 새로고침"
>
  <span className="material-symbols-outlined">refresh</span>
</button>
```

`refreshAll`은 전역 이벤트로 구현:

```typescript
// widgets/hooks/useWidgetRefresh.ts에 전역 리프레시 이벤트 추가

const REFRESH_ALL_EVENT = 'ssampin:refresh-all-widgets';

export function triggerRefreshAll(): void {
  window.dispatchEvent(new CustomEvent(REFRESH_ALL_EVENT));
}

// useWidgetRefresh 내부에서:
useEffect(() => {
  const handler = () => refresh();
  window.addEventListener(REFRESH_ALL_EVENT, handler);
  return () => window.removeEventListener(REFRESH_ALL_EVENT, handler);
}, [refresh]);
```

#### 4-4. 수정 대상 파일

| 파일 | 변경 내용 |
|------|----------|
| `widgets/hooks/useWidgetRefresh.ts` | 🆕 자동 새로고침 훅 |
| `widgets/components/DashboardHeader.tsx` | ✏️ 새로고침 버튼 추가 |
| `widgets/items/Meal.tsx` | ✏️ useWidgetRefresh 적용 |
| `widgets/items/Events.tsx` | ✏️ useWidgetRefresh 적용 |
| `widgets/items/WeeklyTimetable.tsx` | ✏️ useWidgetRefresh 적용 |

---

## 📊 전체 수정 파일 매트릭스

| 파일 | W1 colSpan | W2 탭뷰 | W3 클릭 | W4 새로고침 |
|------|:---------:|:-------:|:-------:|:----------:|
| `widgets/types.ts` | | | ✏️ | |
| `widgets/registry.ts` | | | ✏️ | |
| `widgets/components/WidgetPanel.tsx` | ✏️ | | | |
| `widgets/components/SortableWidget.tsx` | ✏️ | | | |
| `widgets/components/WidgetTabBar.tsx` | | 🆕 | | |
| `widgets/components/WidgetGrid.tsx` | | ✏️ | | |
| `widgets/components/WidgetSplitContainer.tsx` | | ✏️ | | |
| `widgets/components/WidgetCard.tsx` | | | ✏️ | |
| `widgets/components/DashboardHeader.tsx` | | | | ✏️ |
| `widgets/hooks/useWidgetRefresh.ts` | | | | 🆕 |
| `widgets/items/Events.tsx` | | | ✏️ | ✏️ |
| `widgets/items/Meal.tsx` | | | | ✏️ |
| `widgets/items/WeeklyTimetable.tsx` | | | | ✏️ |

✏️ = 수정, 🆕 = 신규 생성

---

## 🗓 구현 일정 (5~6일)

### Day 1: W1 colSpan 실제 반영 (빠른 수정)

- [ ] WidgetPanel.tsx에 `gridColumn: span N` 적용
- [ ] SortableWidget.tsx의 COL_SPAN_CLASS를 동적 함수로 리팩토링
- [ ] 전체/분할/4분할 모드에서 colSpan 동작 검증
- [ ] colSpan이 패널 열 수 초과 시 클램핑 확인

### Day 2-3: W2 위젯 탭 뷰

- [ ] WidgetTabBar 컴포넌트 생성
- [ ] WidgetGrid에 activeTab 상태 + 필터 로직 추가
- [ ] 편집 모드에서는 탭 숨기기 (전체 위젯 보여야 함)
- [ ] 위젯 4개 이하 시 탭 자동 숨김
- [ ] WidgetSplitContainer 카테고리 기반 분배 로직 개선
- [ ] 탭 전환 시 부드러운 애니메이션 (CSS transition)

### Day 3-4: W3 위젯 내부 인터랙션

- [ ] WidgetDefinition에 `navigateTo`, `navigateLabel` 추가
- [ ] registry.ts에 각 위젯별 네비게이션 경로 설정
- [ ] WidgetCard에 클릭 핸들러 + "더 보기" 호버 오버레이
- [ ] Events 위젯에서 이벤트 클릭 → EventPopup 표시
- [ ] 편집 모드에서는 클릭 네비게이션 비활성화
- [ ] PIN 보호 위젯은 인증 후 네비게이션

### Day 5: W4 위젯 새로고침

- [ ] useWidgetRefresh 훅 구현
- [ ] triggerRefreshAll 전역 이벤트 시스템
- [ ] DashboardHeader에 새로고침 버튼 추가
- [ ] 급식/일정/시간표 위젯에 자동 새로고침 적용
- [ ] Visibility API로 탭 전환 시 스마트 새로고침

### Day 6: QA & 마무리

- [ ] 모든 레이아웃 모드에서 colSpan 동작 검증
- [ ] 탭 전환 + DnD 편집 동시 동작 확인
- [ ] 위젯 클릭 네비게이션 정상 동작 확인
- [ ] 새로고침이 과도하지 않은지 확인 (메모리/네트워크)
- [ ] 전체화면 + 분할 모드에서 모든 기능 테스트

---

## ⚠️ 기술적 고려사항

### colSpan과 grid-flow-dense

현재 WidgetGrid는 `grid-flow-row-dense` 사용 중. 이는 colSpan이 큰 위젯 때문에 빈 칸이 생기면 작은 위젯으로 채우는 동작입니다. colSpan 반영 후 위젯 순서가 시각적으로 달라질 수 있으므로 주의 필요.

### 탭 뷰 + DnD 충돌

- DnD는 편집 모드에서만 동작
- 탭은 일반 모드에서만 표시
- 두 기능은 서로 배타적이므로 충돌 없음

### 위젯 새로고침과 Zustand

대부분의 위젯이 Zustand 스토어(`useEventsStore`, `useScheduleStore` 등)를 통해 데이터를 관리하므로, `useWidgetRefresh`의 `onRefresh`는 스토어의 `load()` 메서드를 호출하면 됩니다. 스토어가 이미 캐싱 로직을 가지고 있으면 중복 API 호출이 방지됩니다.

### 네비게이션과 Electron

쌤핀은 Electron 앱으로 실행되므로, `useNavigate()`는 React Router의 in-app 네비게이션입니다. 외부 URL로 이동하는 경우는 없으므로 별도 처리 불필요.

### PIN 보호 위젯의 클릭

`DashboardPinGuard`로 래핑된 위젯은 PIN 미인증 시 블러 처리됩니다. 이 상태에서 클릭하면 PIN 입력 모달이 표시되어야 하며, 네비게이션으로 바로 이동하면 안 됩니다. `WidgetCard`에서 pinFeature가 있고 미인증 시 `handleClick`을 차단해야 합니다.

---

## 🎯 기대 효과

| 기능 | Before | After |
|------|--------|-------|
| colSpan | 편집 모드에서만 적용 | 모든 모드에서 반영 |
| 카테고리 | 모든 위젯 한 화면에 나열 | 탭으로 시간표/학급/정보/관리 전환 |
| 인터랙션 | 위젯은 읽기만 가능 | 클릭→상세 이동, 이벤트 팝업 |
| 새로고침 | 마운트 시 1회만 로드 | 자동/수동 새로고침 |

### 교사 실사용 시나리오

**시나리오 1: 아침 출근 시 대시보드**
> 아침에 PC를 켜면 대시보드가 자동 표시됨.
> "시간표" 탭을 클릭하면 주간시간표 + 오늘수업만 크게 표시.
> 1교시 수업 확인 후 "정보" 탭으로 전환하여 급식 메뉴 확인.

**시나리오 2: 일정 빠른 확인**
> 일정 위젯에서 "D-3 교직원 회의" 클릭 → 팝업으로 시간/장소 확인.
> "일정 전체 보기" 클릭 → 캘린더 페이지로 이동.

**시나리오 3: 위젯 크기 커스터마이징**
> 주간시간표를 2칸으로 넓히면 분할 모드에서도 2칸으로 표시.
> 메모 위젯은 1칸으로 줄여서 공간 절약.

**시나리오 4: 하루 종일 켜두기**
> 대시보드를 켜둔 채 수업.
> 급식 데이터가 30분마다 자동 갱신.
> 다음날 아침에 탭을 클릭하면 자동으로 최신 데이터 로드.

---

*이 문서는 Claude Code(듀이)가 쌤핀 v0.1.7 위젯 시스템 코드 분석을 기반으로 작성했습니다.*