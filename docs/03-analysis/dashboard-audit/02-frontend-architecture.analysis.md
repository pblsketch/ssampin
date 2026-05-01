# 대시보드 & 위젯 프론트엔드 아키텍처 감사

> 분석 기준: 2026-05-01 / main 브랜치 HEAD

---

## A. 컴포넌트 분해·재사용성

### [P1] Dashboard.tsx vs Widget.tsx 진입점 구조 불일치

- **위치**: `src/adapters/components/Dashboard/Dashboard.tsx:1-49` vs `src/adapters/components/Widget/Widget.tsx:1-432`
- **현재**: Dashboard.tsx는 49줄의 얇은 래퍼로 `DashboardHeader + WidgetGrid + WidgetSettingsPanel`을 조합한다. Widget.tsx는 432줄이며 시계·날씨·메시지 배너·레이아웃 로직·리사이즈 핸들·컨텍스트 메뉴를 단일 파일에 모두 인라인으로 담고 있다.
- **문제**: 두 진입점 모두 동일한 `WidgetGrid`, `WidgetSettingsPanel`, `isEditMode` 패턴을 공유하지만, Widget.tsx는 이를 재사용하지 않고 중복으로 내부 구현한다(예: `isEditMode` 상태, `WidgetSettingsPanel` 조건 렌더링이 Dashboard와 Widget 양쪽에 별도로 존재). 헤더 영역(시계·날씨)도 Widget.tsx 내 135줄 인라인 JSX로 작성되어 있어 WidgetWeatherBar 외에 공유 추상이 없다.
- **개선안**:
  1. 헤더(시계·날씨·버튼 그룹)를 `WidgetHeader` 컴포넌트로 추출하여 Widget.tsx 본문 축소.
  2. 리사이즈 핸들 8방향 코드(Widget.tsx:350-408)를 `WidgetWindowResizeHandles` 컴포넌트로 추출.
  3. 편집 모드 토글 + WidgetSettingsPanel 조건 렌더링을 `useEditMode()` 훅으로 통일.

---

### [P2] alias 재사용 6종의 위젯 모드 적합성

- **위치**: `src/widgets/items/` — Events.tsx, Meal.tsx, Memo.tsx, StudentRecords.tsx, TodoWidget.tsx, TodayClass.tsx
- **현재**: registry.ts에서 위 6개는 대시보드 Dashboard*.tsx 컴포넌트를 그대로 alias하여 사용한다. 예를 들어 `Events`는 `DashboardEvents`의 단순 re-export다.
- **문제**: DashboardEvents(339줄)는 `createPortal`로 전체화면 팝업을 `document.body`에 마운트한다(line 301). 위젯 모드(alwaysOnTop, transparent BrowserWindow)에서 document.body가 위젯 창이므로 팝업은 의도대로 동작한다. 그러나 DashboardEvents 내부의 `container ref + ResizeObserver` 로직(line 188-199)은 위젯 카드 컨테이너와 대시보드 카드 컨테이너 양쪽에서 동일하게 실행되어 불필요한 옵저버 인스턴스가 증가한다. 또한 위젯 모드에서는 `setShowAll(true)` 팝업이 위젯 창 전체를 덮는 시각적 충돌이 발생한다.
- **개선안**: `onNavigate` prop을 각 위젯 컴포넌트에 전달하여 "더보기" 클릭 시 팝업 대신 메인 창 페이지로 이동하도록 분기 처리. 또는 위젯 전용 variant prop(`isWidget?: boolean`)을 추가해 팝업 대신 인라인 스크롤로 표시.

---

### [P2] 거대 컴포넌트 분해 우선순위

#### Widget.tsx (432줄)

- **위치**: `src/adapters/components/Widget/Widget.tsx`
- **문제**: 단일 파일에 (1) 반응형 레이아웃 폴백, (2) 투명창 hit-test 보정, (3) 5개 store load(), (4) 키보드 단축키, (5) 컨텍스트 메뉴, (6) 헤더 UI, (7) 메시지 배너 미니 뷰, (8) 위젯 그리드, (9) 리사이즈 핸들 8방향이 혼재. useEffect가 5개이고 각각 독립적인 관심사를 다룬다.
- **개선안**: 추출 단위 제안:
  - `useWidgetLayout()` — effectiveMode 계산 + 창 크기 폴백 + IPC setWidgetLayout
  - `useWidgetDataLoader()` — 5개 store load + onDataChanged IPC 구독
  - `WidgetHeader` 컴포넌트 — 시계·날씨·버튼 그룹(현재 약 90줄 JSX)
  - `WidgetWindowResizeHandles` 컴포넌트 — 8방향 포인터 이벤트 처리

#### MessageBanner.tsx (362줄)

- **위치**: `src/adapters/components/Dashboard/MessageBanner.tsx`
- **문제**: `MessageStyleEditor`(내부 서브 컴포넌트, ~115줄)와 `MessageBanner`(메인, ~180줄)가 하나의 파일에 있다. 컬러 파생 함수 `deriveColors`, `getColors`, `THEME_COLORS` 상수도 동일 파일에 인라인. `MessageStyleEditor`는 별도 관심사(스타일 편집 폼)로 독립 컴포넌트화가 가능하다.
- **개선안**: `MessageStyleEditor.tsx`를 별도 파일로 분리, 컬러 유틸을 `messageColorUtils.ts`로 추출.

#### WidgetSettingsPanel.tsx (383줄)

- **위치**: `src/widgets/components/WidgetSettingsPanel.tsx`
- **문제**: `WidgetListTab`, `StyleTab`, `PanelFooter` 3개 서브 컴포넌트가 하나의 파일에 포함. `StyleTab` 내부에 테마 프리셋 렌더링 IIFE(즉시 실행 함수 표현식, line 214-251)가 존재하여 가독성 저하. `ColorSwatchRow`/`SliderRow` 등 공유 컨트롤은 `@adapters/components/shared/StyleControls`에서 임포트하는데, `StyleTab` 자체만으로 ~175줄이다.
- **개선안**: `StyleTab`을 별도 `WidgetStyleTab.tsx`로 분리; 테마 프리셋 렌더링을 `ThemePresetGrid` 서브 컴포넌트로 추출.

#### DDayCounter.tsx (385줄)

- **위치**: `src/widgets/items/DDayCounter.tsx`
- **문제**: `DDayForm`(인라인 폼, ~100줄), `DDayRow`(행 렌더러, ~65줄), `DDayCounter`(메인, ~105줄), 유틸 함수 3개, 상수 1개가 단일 파일. 편집 폼과 목록 뷰의 관심사가 혼재.
- **개선안**: `DDayForm.tsx`와 `DDayRow.tsx`를 별도 파일로 추출. `useDDayActions()` 커스텀 훅으로 `handleAdd/handleUpdate/handleDelete/handleDeleteAllPast` 추출.

#### DashboardTimetable.tsx (359줄)

- **위치**: `src/adapters/components/Dashboard/DashboardTimetable.tsx`
- **현재**: `ClassTimetableList`, `TeacherTimetableList`, `TabButton`, `WeekendMessage` 4개 서브 컴포넌트가 단일 파일. 메인 컴포넌트에 3개 useEffect(data load, IPC onDataChanged, setInterval 타이머)가 있다.
- **문제**: IPC `onDataChanged` 구독(line 52-70)은 위젯 모드 전용 로직인데 대시보드 메인 컴포넌트에 인라인으로 있다. 메인 대시보드에서는 IPC가 없는 환경(브라우저 dev 모드)에서 `api?.onDataChanged` null 체크로 무해하게 넘어가나, 코드 의도가 불명확하다.
- **개선안**: IPC 구독을 `useScheduleDataSync()` 훅으로 추출. `ClassTimetableList`, `TeacherTimetableList`는 현재 파일 내 서브 컴포넌트로 두되 인터페이스를 명확히 유지.

#### DashboardTodo.tsx (352줄)

- **위치**: `src/adapters/components/Dashboard/DashboardTodo.tsx`
- **문제**: 3개 store를 구독하고(useTodoStore, useScheduleStore, useEventsStore) 타임라인 통합 아이템 계산 로직(line 57-120)이 컴포넌트 내에 있다. `timelineEntries` useMemo가 6개 의존성을 가지며 복잡도가 높다. `Checkbox`, `TodoItem`, `getDueDateLabel`, `formatLocalDate` 서브 기능도 단일 파일에 혼재.
- **개선안**: 타임라인 계산을 `useTimelineEntries()` 훅으로 추출. `TodoItem`, `Checkbox`를 `src/adapters/components/Todo/` 공통 컴포넌트로 이동(이미 `/Todo/TodoPopup.tsx`가 존재하므로 같은 폴더에 위치).

---

### [P2] 위젯 4종 패턴 일관성

- **위치**: `src/widgets/registry.ts:27-383`
- **현재**: 32개 WIDGET_DEFINITIONS 중 28개는 `component` 필드에 실제 컴포넌트를 제공하고, 2개(Grades, Tasks)는 "준비 중" placeholder 패턴이다. `navigateTo`/`navigateLabel` 필드는 선택적(optional)이며 DDayCounter, ImageSticker 4종에는 없다.
- **문제**: `availableFor.schoolLevel/role` 필드가 registry에 정의되어 있으나, `WidgetSettingsPanel`의 `WidgetListTab`은 이를 읽지 않는다(grep 결과 확인). 즉 필터링이 실제로 동작하지 않아 모든 역할의 사용자에게 모든 위젯이 노출된다. `presets.ts`의 프리셋 기반 초기화만 역할 필터링 역할을 하며, 이후 수동으로 어떤 위젯이든 켤 수 있다.
- **개선안**: `WidgetListTab`에서 `settings.schoolLevel`과 `settings.roles`를 읽어 `availableFor` 조건에 맞지 않는 위젯은 회색 처리(disabled)하거나 숨기도록 구현. placeholder 위젯(Grades, Tasks)은 `isPlaceholder: true` 플래그를 정의에 추가하여 별도 섹션에 "출시 예정"으로 표시하는 패턴을 일관 적용.

---

### [P1] App.tsx(950줄) 4가지 모드 분기

- **위치**: `src/App.tsx:348-505`
- **현재**: `App()` 함수에서 `isStickerPickerMode()`, `isQuickAddMode()`, `isWidgetMode()` 순서로 URL 파라미터를 검사한 뒤 각각 `StickerPickerApp`, `QuickAddApp`, `WidgetApp`, `MainApp`으로 분기한다. `MainApp`은 `renderPage()` 순수 함수(line 151-316, 165줄)에서 30개 이상 if-else 분기로 페이지를 선택한다.
- **문제**: `renderPage()`는 컴포넌트가 아닌 순수 함수로 작성되어 있어 React DevTools에서 추적이 어렵고, 조건이 추가될수록 선형 증가한다. `QuickAddApp`(line 369-427)은 마운트 useEffect에서 5개 store를 직접 `getState().load()` 패턴으로 초기화한다.
- **개선안**:
  1. `renderPage()`를 `<PageRouter page={page} ... />` 컴포넌트로 변환하여 React 트리에 포함.
  2. 모드 감지 로직을 `useAppMode()` 훅으로 추출. 현재 4개 `isXxxMode()` 함수가 URL을 각자 파싱하고 있어 중복이 있음.
  3. `QuickAddApp`의 store 로드를 `useQuickAddDataLoader()` 훅으로 분리.

---

## B. React 패턴·hook·상태관리

### [P1] Widget.tsx 내 useSettingsStore.getState() 직접 호출

- **위치**: `src/adapters/components/Widget/Widget.tsx:86`
- **현재**: `void useSettingsStore.getState().load()` — store 훅을 통하지 않고 store 인스턴스에 직접 접근.
- **문제**: React 렌더 사이클 밖에서 store를 직접 조작하는 패턴. 동일 컴포넌트에서 `const { settings, update } = useSettingsStore()`(line 35)로 이미 구독하고 있으므로 불일치. 패턴이 일관되지 않으면 유지보수 시 혼란을 야기한다.
- **개선안**: `load` 함수도 구조분해하여 `const { settings, update, load: loadSettings } = useSettingsStore()` 후 useEffect 의존성 배열에 포함.

---

### [P2] selector 최적화 부재

- **위치**: 다수 컴포넌트
- **현재**: `DashboardTodo.tsx:27`에서 `const { settings } = useSettingsStore()` — settings 객체 전체를 구독. `WidgetSettingsPanel/StyleTab:184`도 `const settings = useSettingsStore((s) => s.settings)` 전체를 구독.
- **문제**: settings 내 임의 필드가 변경될 때마다 해당 컴포넌트가 리렌더된다. 예를 들어 DashboardTodo는 `settings.todoShowTimetable`, `settings.todoShowEvents`, `settings.periodTimes` 3개 필드만 필요하지만 settings 전체(20여 개 필드)를 구독한다.
- **개선안**:
  ```typescript
  // DashboardTodo.tsx
  const todoShowTimetable = useSettingsStore((s) => s.settings.todoShowTimetable);
  const todoShowEvents = useSettingsStore((s) => s.settings.todoShowEvents);
  const periodTimes = useSettingsStore((s) => s.settings.periodTimes);
  ```
  가독성보다 성능이 중요한 위젯 컴포넌트에서 우선 적용.

---

### [P2] DashboardTimetable의 eslint-disable-react-hooks/exhaustive-deps 의존성 누락

- **위치**: `src/adapters/components/Dashboard/DashboardTimetable.tsx:117, 124`
- **현재**:
  ```typescript
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayOfWeek, viewDateStr, classSchedule, overrides]);
  ```
  실제로 `getEffectiveClassSchedule` 함수도 의존성이어야 하나 eslint 억제로 숨겨짐.
- **문제**: store 메서드(`getEffectiveClassSchedule`)가 의존성 누락 상태. Zustand의 경우 store 메서드 참조는 안정적이지만, 명시적 억제는 향후 리팩토링 시 버그 위험을 높인다.
- **개선안**: `getEffectiveClassSchedule`을 의존성 배열에 포함하거나, 함수를 `useCallback`으로 래핑하여 참조 안정성을 명시적으로 보장.

---

### [P2] DashboardTodo: filterActive 이중 호출

- **위치**: `src/adapters/components/Dashboard/DashboardTodo.tsx:51-54, 124`
- **현재**:
  ```typescript
  const sorted = useMemo<readonly Todo[]>(() => {
    const active = filterActive(todos);
    return sortTodos(active);
  }, [todos]);
  // ...
  const activeTodos = useMemo(() => filterActive(todos), [todos]);
  ```
  `filterActive(todos)`가 서로 다른 useMemo 내에서 두 번 호출된다.
- **문제**: todos가 변경될 때 filterActive가 두 번 실행. 불필요한 중복 계산.
- **개선안**: `activeTodos` 하나를 먼저 memo화하고 `sorted`는 `activeTodos`를 의존성으로 사용:
  ```typescript
  const activeTodos = useMemo(() => filterActive(todos), [todos]);
  const sorted = useMemo(() => sortTodos(activeTodos), [activeTodos]);
  ```

---

### [P2] Widget.tsx: track 함수 의존성 누락

- **위치**: `src/adapters/components/Widget/Widget.tsx:95-98`
- **현재**:
  ```typescript
  useEffect(() => {
    track('widget_open', { trigger: 'close_button' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  ```
- **문제**: eslint 억제로 `track` 의존성을 누락. `track`이 참조 안정성을 보장한다면(`useCallback`으로 감싸진 경우) 마운트 once 패턴은 허용되나, 현재 eslint 억제 이유가 코드에 명시되지 않아 의도 불명확.
- **개선안**: 주석에 "마운트 시 1회 추적 의도" 명시하거나, `track`이 stable ref임을 확인 후 의존성 배열에 추가.

---

### [P3] DashboardEvents: displayMode localStorage 직접 접근

- **위치**: `src/adapters/components/Dashboard/DashboardEvents.tsx:170-181`
- **현재**: 탭 상태를 `localStorage.getItem('ssampin:event-widget-mode')` / `localStorage.setItem()`으로 직접 관리.
- **문제**: DashboardTimetable.tsx도 동일하게 `localStorage.getItem('ssampin:timetable-tab')`를 사용(line 25-30). 이 패턴이 컴포넌트별로 흩어져 있으면 키 이름 충돌 및 직렬화 에러 처리가 개별적으로 필요하다.
- **개선안**: 경량 `usePersistentState<T>(key, defaultValue)` 훅을 공통 hooks에 추가하여 중앙화.

---

## C. 접근성 (WCAG 2.1 AA)

### [P0] WidgetContextMenu: role="menu" 누락, 화살표 키 네비게이션 없음

- **위치**: `src/adapters/components/Widget/WidgetContextMenu.tsx:76-269`
- **현재**: 컨텍스트 메뉴 전체 div에 `role`, `aria-*` 속성이 전혀 없다. ESC 닫기는 구현됨(line 44-51), 외부 클릭 닫기도 구현됨. 그러나 화살표 키 네비게이션, `role="menu"`, `role="menuitem"` 마킹이 없다.
- **문제**: WCAG 2.1 SC 1.3.1 (정보와 관계), SC 4.1.2 (이름·역할·값). 스크린 리더가 메뉴 항목을 인식하지 못한다.
- **개선안**:
  ```tsx
  <div role="menu" aria-label="위젯 메뉴" ref={menuRef} ...>
    <button role="menuitem" ...>전체 화면으로 전환</button>
    <button role="menuitem" ...>닫기</button>
    // ...
  </div>
  ```
  `onKeyDown`에서 ArrowUp/ArrowDown 포커스 이동, Home/End 처리 추가.

---

### [P0] EventPopup: focus trap 없음, aria-modal 없음

- **위치**: `src/adapters/components/Dashboard/EventPopup.tsx:107-202`
- **현재**: `focus-trap-react`가 프로젝트에 도입되어 있으나(`Modal.tsx`에서 사용), EventPopup은 이를 적용하지 않았다. 오버레이 클릭으로 닫는 기능도 없고, 모달 내 포커스가 뒤에 있는 콘텐츠로 탈출할 수 있다.
- **문제**: WCAG 2.1 SC 2.1.2 (키보드 트랩), SC 4.1.2. 모달이 열린 상태에서 Tab 키로 배경 콘텐츠에 접근 가능.
- **개선안**: 기존 `Modal.tsx` 공통 컴포넌트를 사용하여 래핑:
  ```tsx
  <Modal isOpen={showPopup} onClose={dismissPopup} title="오늘 행사 알림">
    {/* 기존 내용 */}
  </Modal>
  ```

---

### [P0] SortableWidget 드래그 핸들: aria-label 없음

- **위치**: `src/widgets/components/SortableWidget.tsx:66-77`
- **현재**: dnd-kit의 `useSortable`이 `KeyboardSensor`를 포함하여 키보드 드래깅을 지원하나(WidgetGrid.tsx:51), 드래그 핸들 버튼에 `aria-label`이 없다. `title="드래그하여 순서 변경"`은 있으나 이는 시각적 툴팁이며 접근성 레이블로 충분하지 않다.
- **문제**: WCAG 2.1 SC 2.5.5 (목표 크기), SC 4.1.2. 스크린 리더 사용자에게 드래그 핸들 목적이 전달되지 않는다.
- **개선안**:
  ```tsx
  <button
    {...attributes}
    {...listeners}
    aria-label={`${definition.name} 위젯 순서 변경, 드래그하거나 화살표 키를 사용하세요`}
    aria-roledescription="드래그 가능한 항목"
    ...
  >
  ```

---

### [P1] MessageBanner 인라인 편집: 외부 컨테이너의 role/tabIndex 혼용

- **위치**: `src/adapters/components/Dashboard/MessageBanner.tsx:244-263`
- **현재**:
  ```tsx
  <div
    role={!isEditing ? 'button' : undefined}
    tabIndex={!isEditing ? 0 : undefined}
    aria-label={!isEditing ? (isCollapsed ? '오늘의 메시지 펼치기' : '메시지 편집') : undefined}
    aria-expanded={!isCollapsed}
  ```
  편집 모드가 아닐 때 div가 `role="button"`으로 동작하고, 편집 모드에서는 내부 `<input>`이 포커스를 받는 방식.
- **문제**: `role="button"` div에서 Enter/Space 키 핸들러(line 252-254)는 구현됨. 그러나 편집 완료 후 포커스가 div로 돌아오지 않아 키보드 사용자가 흐름을 잃는다. `aria-pressed`가 없어 상태(편집 중/펼침/접힘)를 스크린 리더가 구분하지 못한다.
- **개선안**: `confirmEdit()` 이후 `divRef.current?.focus()` 포커스 복귀 추가. 스타일 편집 버튼에 `aria-expanded={showStyleEditor}` 추가.

---

### [P1] 위젯 헤더 버튼들: IconButton 컴포넌트 미사용

- **위치**: `src/adapters/components/Widget/Widget.tsx:214-276`
- **현재**: 헤더의 새로고침·편집·레이아웃·전체화면 버튼이 모두 원시 `<button>` 태그에 인라인 Tailwind로 구현. 메모리 기록에 따르면 `IconButton` 컴포넌트가 WCAG 2.5.5(최소 44×44px 목표 크기)를 강제하도록 신설되었으나, 위젯 헤더에서는 미적용.
- **문제**: 실제 터치 타깃 크기: `p-1.5` = 패딩 6px × 2 + 아이콘 16px = 약 28px. WCAG 2.5.5 권장 44px 미달. 키보드 포커스 시 시각적 포커스 링도 없음(`focus-visible` 클래스 누락).
- **개선안**: `IconButton` 컴포넌트로 교체:
  ```tsx
  <IconButton
    icon="refresh"
    aria-label="모든 위젯 새로고침"
    onClick={() => triggerRefreshAll()}
  />
  ```

---

### [P1] WidgetSettingsPanel 토글 버튼: role="switch" 적용되었으나 aria-label 없음

- **위치**: `src/widgets/components/WidgetSettingsPanel.tsx:153-165`
- **현재**: `role="switch" aria-checked={isVisible}`는 올바르게 적용됨. 그러나 토글 버튼에 `aria-label`이 없어 스크린 리더가 위젯 이름을 읽기 위해 부모 label 요소에 의존한다.
- **문제**: `<label>` 내 `<button role="switch">`는 HTML 명세상 유효하지 않다. button 자체에 레이블이 필요하다.
- **개선안**: `aria-label={`${def.name} 위젯 ${isVisible ? '숨기기' : '표시'}`}` 추가.

---

### [P1] MiniCalendar: 표 시맨틱 없음, aria-current 없음

- **위치**: `src/widgets/items/MiniCalendar.tsx:149-207`
- **현재**: 요일 헤더와 날짜 그리드가 `div.grid grid-cols-7`로 구현. 날짜 버튼에 `aria-current`, `aria-label`, 이벤트 유무 표시 없음.
- **문제**: WCAG 2.1 SC 1.3.1. 스크린 리더가 달력 구조를 인식하지 못한다. 오늘 날짜를 `bg-sp-accent`로만 구별하여 색맹 사용자에게도 불충분.
- **개선안**:
  ```tsx
  <div role="grid" aria-label={`${year}년 ${month + 1}월 달력`}>
    <div role="row">
      {['일', '월', ...].map(d => <div role="columnheader" key={d}>{d}</div>)}
    </div>
    // 날짜 행
    <button
      role="gridcell"
      aria-current={day.isToday ? 'date' : undefined}
      aria-label={`${year}년 ${month + 1}월 ${day.date}일${day.isToday ? ', 오늘' : ''}${day.eventColors.length > 0 ? `, 일정 ${day.eventColors.length}개` : ''}`}
    >
  ```

---

### [P2] 위젯 모드 키보드 진입·이탈

- **위치**: `src/adapters/components/Widget/Widget.tsx:108-139`
- **현재**: Ctrl+1~4, Ctrl+0 단축키가 구현됨. ESC로 창 닫기는 없다. `document.addEventListener('keydown', handleKeyDown)`이 등록되나 `alwaysOnTop` 위젯 창에서 ESC 키를 눌러도 아무 동작이 없다.
- **문제**: alwaysOnTop transparent 창에서 마우스 없이 키보드만으로 위젯을 닫거나 전체 화면으로 전환하는 방법이 없다.
- **개선안**: keydown 핸들러에 `Escape` 케이스 추가:
  ```typescript
  case 'Escape':
    e.preventDefault();
    window.electronAPI?.toggleWidget();
    break;
  ```

---

### [P2] focus-visible 포커스 링 미적용 (대시보드·위젯 전반)

- **위치**: `src/adapters/components/Dashboard/`, `src/adapters/components/Widget/`, `src/widgets/`
- **현재**: grep 결과, Dashboard 및 Widget 폴더의 tsx 파일에서 `focus-visible` 클래스 사용 없음. DDayCounter.tsx의 input 2곳에만 `focus:outline-none`(포커스 링 제거)이 적용됨.
- **문제**: WCAG 2.1 SC 2.4.7 (포커스 보임). 메모리 기록에 "Memo focus-visible 2건 픽스" 이력이 있으나, 대시보드/위젯 영역은 동일 픽스가 적용되지 않음.
- **개선안**: Tailwind 기본 전역 규칙에 `*:focus-visible { outline: 2px solid var(--sp-accent); outline-offset: 2px; }` 추가 또는 버튼 공통 클래스에 `focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:ring-offset-2` 적용.

---

## D. TypeScript strict 준수

### [P2] App.tsx: window 타입 확장에 `as any` 사용

- **위치**: `src/App.tsx:562`
- **현재**: `(window as any).__ssampin_current_page = currentPage;`
- **문제**: CLAUDE.md에서 `any` 사용 금지 명시. window 전역 타입 확장이 필요한 경우 타입 선언이 올바른 방법.
- **개선안**: `src/types/window.d.ts` 또는 `electron/global.d.ts`에 추가:
  ```typescript
  interface Window {
    __ssampin_current_page?: string;
  }
  ```

---

### [P3] ImageStickerWidget.tsx: electronAPI 인라인 캐스트

- **위치**: `src/widgets/items/ImageStickerWidget.tsx:23-26`
- **현재**:
  ```typescript
  const api = (window as unknown as Record<string, unknown>).electronAPI as {
    showOpenDialog?: ...;
    readFileAsDataUrl?: ...;
  } | undefined;
  ```
- **문제**: `window.electronAPI`의 타입이 `electron/preload.ts`에 이미 선언되어 있을 것임에도, 인라인에서 `as unknown as Record`를 거쳐 재캐스트하는 이중 캐스트가 사용됨. `window as unknown as Record<string, unknown>` 패턴은 타입 안전성을 완전히 우회한다.
- **개선안**: `window.electronAPI` 타입 선언에 `showOpenDialog`, `readFileAsDataUrl`을 추가하거나, preload 타입과 컴포넌트 타입의 불일치 원인을 해소.

---

### [P3] DashboardEvents: `CategoryItem` import 인라인 타입 참조

- **위치**: `src/adapters/components/Dashboard/DashboardEvents.tsx:39`
- **현재**:
  ```typescript
  categories: readonly import('@domain/entities/SchoolEvent').CategoryItem[];
  ```
- **문제**: props interface 내에서 dynamic import 타입 참조. 별도 import 구문 없이 인라인으로 처리하는 것은 가독성을 저하시킨다. EventPopup.tsx도 동일 패턴 사용(line 57).
- **개선안**: 파일 상단에 `import type { CategoryItem } from '@domain/entities/SchoolEvent';` 추가.

---

## E. 책임 분리 (Single Responsibility)

### [P1] DashboardTimetable: UI 컴포넌트가 IPC 구독 직접 처리

- **위치**: `src/adapters/components/Dashboard/DashboardTimetable.tsx:52-70`
- **현재**: `window.electronAPI?.onDataChanged` IPC 이벤트를 UI 컴포넌트가 직접 구독하고, `useScheduleStore.setState({ loaded: false })`로 store 상태를 직접 변경한다.
- **문제**: store 내부 상태(`loaded`)를 UI 레이어에서 직접 조작하는 것은 캡슐화 위반. useScheduleStore가 자체적으로 IPC 구독을 관리하거나(infrastructure 계층에서), 전용 훅이 담당해야 한다.
- **개선안**: `useScheduleDataSync()` 훅 신설:
  ```typescript
  export function useScheduleDataSync() {
    const { load: loadSchedule } = useScheduleStore();
    const { load: loadSettings } = useSettingsStore();
    useEffect(() => {
      const api = window.electronAPI;
      if (!api?.onDataChanged) return;
      return api.onDataChanged((filename) => {
        if (filename === 'teacher-schedule' || filename === 'class-schedule') {
          useScheduleStore.setState({ loaded: false });
          void loadSchedule();
        }
        if (filename === 'settings') {
          useSettingsStore.setState({ loaded: false });
          void loadSettings();
        }
      });
    }, [loadSchedule, loadSettings]);
  }
  ```

---

### [P2] presenter 계층 활용도

- **위치**: `src/adapters/presenters/`
- **현재**: `timetablePresenter`는 DashboardTimetable.tsx에서 `getSubjectTextColor`, `getSubjectDotColor`, `getCellStyle`, `getCellDotColor`를 임포트해 사용함(line 8). `categoryPresenter`는 DashboardEvents.tsx, EventPopup.tsx, MiniCalendar.tsx에서 사용됨. presenter 계층이 실제로 활용되고 있다.
- **문제(미사용 패턴)**: DashboardTodo.tsx의 타임라인 계산(line 57-120), getDueDateLabel(line 227-258) 로직은 presenter나 domain rule 없이 컴포넌트 내 순수 함수로 구현됨. 이 로직은 재사용성이 있으며 presenter 또는 todoRules로 이동할 수 있다.
- **개선안**: `getDueDateLabel` → `src/adapters/presenters/todoPresenter.ts`, 타임라인 통합 계산 → `useTimelineEntries()` 훅 + 내부에서 presenter 호출.

---

### [P2] domain rule 직접 호출 일관성

- **위치**: 다수
- **현재**: DashboardTimetable.tsx가 `@domain/rules/periodRules`에서 `getDayOfWeek`, `getCurrentPeriod`를 직접 임포트(adapters → domain 직접 호출 허용, CLAUDE.md 구조 규칙상 OK). DashboardEvents.tsx가 `@domain/rules/ddayRules`에서 `calculateDDay` 직접 호출. DashboardTodo.tsx가 `@domain/rules/todoRules`에서 `filterActive`, `sortTodos` 직접 호출.
- **평가**: CLAUDE.md 아키텍처 규칙상 `adapters → domain` 방향 import는 허용됨. 규칙 위반 없음. use case 경유 없이 domain rule을 직접 호출하는 것은 위젯/대시보드 read-only 표시 컴포넌트에서는 실용적으로 허용 가능한 패턴.

---

## F. 위젯 시스템 확장성

### [P1] availableFor 필터링이 실제 동작하지 않음

- **위치**: `src/widgets/registry.ts:37-43` (정의), `src/widgets/components/WidgetSettingsPanel.tsx:95-177` (WidgetListTab)
- **현재**: registry에 `availableFor.schoolLevel`, `availableFor.role` 필드가 22개 정의에 존재하나, WidgetListTab은 이 필드를 참조하지 않고 모든 WIDGET_DEFINITIONS를 카테고리별로 나열한다. 사용자 역할에 상관없이 모든 위젯을 ON/OFF 할 수 있다.
- **문제**: 예를 들어 `class-timetable` 위젯은 `role: ['homeroom']`으로만 정의되어 있으나, subject 교사도 이 위젯을 켤 수 있다. 설계 의도와 실제 동작 불일치.
- **개선안**: WidgetListTab에서 settings 기반 필터 적용:
  ```typescript
  const settings = useSettingsStore((s) => s.settings);
  // ...
  const isAvailable = (def: WidgetDefinition) => {
    const { availableFor } = def;
    if (!availableFor) return true;
    const levelMatch = availableFor.schoolLevel.includes(settings.schoolLevel);
    const roleMatch = availableFor.role.some((r) => settings.roles?.includes(r) ?? true);
    return levelMatch && roleMatch;
  };
  ```

---

### [P2] 새 위젯 추가 비용 분석

- **현재**: `registry.ts`에 `WidgetDefinition` 항목 추가 + 컴포넌트 파일 생성만으로 위젯 추가 가능. `WidgetGrid`, `WidgetSettingsPanel`, `WidgetCard`는 registry를 동적으로 읽어 자동 처리. presets.ts에도 적용 가능한 프리셋에 id 추가 필요.
- **평가**: 확장성 구조는 양호. 그러나 새 위젯이 별도 store 초기화가 필요한 경우(예: DDayCounter → useDDayStore), Widget.tsx의 useEffect data loader에 수동으로 추가해야 한다. 자동화되지 않은 부분.
- **개선안**: WidgetDefinition에 선택적 `loadData?: () => void` 필드를 추가하거나, 각 위젯 컴포넌트가 자체적으로 useEffect load를 담당(현재 대부분 위젯이 이미 그렇게 함 — DDayCounter.tsx:224 등).

---

### [P3] placeholder 위젯 처리 패턴 일관성

- **위치**: `src/widgets/items/Grades.tsx`, `src/widgets/items/Tasks.tsx`
- **현재**: "준비 중입니다" 텍스트만 표시하는 16줄짜리 컴포넌트 2개. registry에 등록되어 사용자가 켤 수 있으나, 실제로는 아무 기능도 없다.
- **문제**: 사용자가 "성적 현황", "업무 목록" 위젯을 대시보드에 추가했다가 빈 카드를 보게 될 수 있다. registry에도 `isPlaceholder` 구분 없음.
- **개선안**: `WidgetDefinition`에 `status?: 'stable' | 'beta' | 'coming-soon'` 필드 추가. WidgetListTab에서 `coming-soon` 위젯은 별도 섹션에 회색 처리. 또는 registry에서 제거하고 출시 시 추가.

---

### [P3] ImageStickerWidget 4슬롯의 widgetId 하드코딩

- **위치**: `src/widgets/items/ImageStickerWidget.tsx:247-250`
- **현재**:
  ```typescript
  export function ImageSticker1() { return <ImageStickerContent widgetId="image-sticker-1" />; }
  export function ImageSticker2() { return <ImageStickerContent widgetId="image-sticker-2" />; }
  // ...
  ```
  widgetId가 컴포넌트 정의에 하드코딩되어 있고, registry.ts에서도 id가 `"image-sticker-1"` ~ `"image-sticker-4"`로 매칭되어야 한다.
- **문제**: WidgetCard가 widgetId를 컴포넌트에 전달하지 않는 구조(registry의 `component: ImageSticker1`은 props 없이 호출됨). 5번째 이미지 슬롯을 추가하려면 컴포넌트, registry, store 키 3곳을 모두 수정해야 한다.
- **개선안**: registry의 `component` 타입을 `React.ComponentType<{ widgetId: string }>`로 변경하고 WidgetCard에서 widgetId를 prop으로 전달하면 하드코딩 없이 동적 대응 가능. 단, 기존 모든 위젯 컴포넌트 인터페이스 변경이 필요해 공수가 크므로, 현재 4슬롯으로 충분하다면 P3 보류.

---

## 종합 점수 / Top 10 우선순위 픽스

### 컴포넌트 품질 점수

| 영역 | 배점 | 현재 점수 | 주요 감점 요인 |
|------|------|-----------|----------------|
| 컴포넌트 분해·재사용성 | 20 | 12 | Widget.tsx 432줄 monolith, alias 위젯 팝업 충돌 |
| React 패턴·hook·상태관리 | 20 | 14 | getState() 직접 호출, selector 전체 구독, filterActive 이중 계산 |
| 접근성 (WCAG 2.1 AA) | 25 | 8 | ContextMenu 미마킹, EventPopup focus trap 없음, focus-visible 전반 없음 |
| TypeScript strict | 15 | 13 | `as any` 1건, 인라인 import 타입 |
| 책임 분리 | 10 | 6 | UI에서 IPC 직접 구독, store 내부 상태 직접 조작 |
| 위젯 확장성 | 10 | 7 | availableFor 필터 미동작, placeholder 미구분 |
| **합계** | **100** | **60** | |

접근성이 가장 큰 감점 요인. 대시보드/위젯 전반에서 `focus-visible`, `role`, `aria-*` 속성이 거의 없다.

---

### Top 10 우선순위 픽스 (P0 → P3 순)

| 순위 | 우선도 | 항목 | 위치 | 예상 공수 |
|------|--------|------|------|-----------|
| 1 | P0 | WidgetContextMenu `role="menu"` + 화살표 키 네비게이션 | `WidgetContextMenu.tsx` | 1~2h |
| 2 | P0 | EventPopup focus trap (`Modal.tsx` 적용) + `aria-modal` | `EventPopup.tsx` | 1h |
| 3 | P0 | SortableWidget 드래그 핸들 `aria-label` + `aria-roledescription` | `SortableWidget.tsx` | 30m |
| 4 | P1 | 전 컴포넌트 `focus-visible:ring-2 ring-sp-accent` 전역 적용 | `tailwind.config.js` 전역 | 1h |
| 5 | P1 | Widget.tsx ESC 키 → `toggleWidget()` 추가 | `Widget.tsx` | 15m |
| 6 | P1 | Widget.tsx 432줄 → WidgetHeader + useWidgetLayout 추출 | `Widget.tsx` | 3h |
| 7 | P1 | App.tsx `(window as any)` 제거 → `Window` 인터페이스 선언 | `App.tsx`, `*.d.ts` | 30m |
| 8 | P1 | DashboardTimetable IPC 구독 → `useScheduleDataSync()` 훅 분리 | `DashboardTimetable.tsx` | 1h |
| 9 | P1 | WidgetSettingsPanel `availableFor` 필터 실제 동작 구현 | `WidgetSettingsPanel.tsx` | 2h |
| 10 | P2 | DashboardTodo filterActive 이중 계산 제거 + selector 최적화 | `DashboardTodo.tsx` | 30m |

---

> 분석 기반: 직접 Read/Grep한 파일 목록 — `Dashboard.tsx`, `Widget.tsx`, `MessageBanner.tsx`, `DashboardEvents.tsx`, `DashboardTimetable.tsx`, `DashboardTodo.tsx`, `DashboardPinGuard.tsx`, `EventPopup.tsx`, `WidgetContextMenu.tsx`, `WidgetGrid.tsx`, `SortableWidget.tsx`, `WidgetSettingsPanel.tsx`, `DDayCounter.tsx`, `ImageStickerWidget.tsx`, `MiniCalendar.tsx`, `Grades.tsx`, `Tasks.tsx`, `registry.ts`, `presets.ts`, `useDashboardConfig.ts`, `App.tsx` (구조 확인)
