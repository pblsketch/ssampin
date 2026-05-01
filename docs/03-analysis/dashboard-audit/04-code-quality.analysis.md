# 04 — 대시보드/위젯 코드 품질 분석

**범위**: 메인 대시보드(`src/adapters/components/Dashboard/`) 13 files + 위젯 모드(`src/adapters/components/Widget/`) + `src/widgets/` 전체 (registry, components, items, hooks)
**기준일**: 2026-05-01
**원칙**: 진단만, 수정 금지. 모든 발견은 파일경로:줄번호 + 코드 인용.

---

## A. TypeScript 안전성

### [P0] non-null assertion `!` 7건 남용 — 런타임 충돌 위험
- **위치**: `src/widgets/items/TodayProgress.tsx:201, 203, 211, 220, 233, 238, 240`
- **카테고리**: TS
- **현재**:
  ```tsx
  {hasToday && lesson.progress!.unit && (
    📖 {lesson.progress!.unit}
  ...
  <span className="truncate">{lesson.prevProgress!.lesson}</span>
  ...
  <span className="truncate">{lesson.progress!.lesson}</span>
  ...
  {hasToday && lesson.progress!.note && (
    📝 {lesson.progress!.note}
  ```
- **문제**: `hasToday`/`hasPrev`/`hasNext`는 `lesson.progress !== null` 등을 별도 변수로 캐싱한 것이지만, TS 컨트롤플로우 분석은 별도 변수 가드를 좁혀주지 못해 결국 `!` 사용. 미래에 메모이즈된 객체 형태가 바뀌면 (예: `lesson.progress`가 `undefined`로 변경) 컴파일 통과 후 런타임에 `Cannot read properties of undefined` 가능.
- **개선안**:
  ```tsx
  // 변수 좁힘 후 사용
  const todayProgress = lesson.progress;
  ...
  {todayProgress && todayProgress.unit && (
    📖 {todayProgress.unit}
  )}
  ```
  또는 `if (!hasToday) return ...; const p = lesson.progress;` 형태로 `lesson.progress`를 `NonNullable`로 좁힌 뒤 사용.
- **참조**: TS strict, `noUncheckedIndexedAccess`

### [P1] non-null assertion `!` — Seating 위젯 학생 ID
- **위치**: `src/widgets/items/Seating.tsx:77, 81`
- **카테고리**: TS
- **현재**:
  ```tsx
  {groupStudents.map((s) => (
    <span
      key={s!.id}
      ...
    >
      {s!.name}
    </span>
  ))}
  ```
- **문제**: `groupStudents = group.studentIds.map((id) => studentMap.get(id)).filter(Boolean)`에서 `filter(Boolean)`은 TS 타입 좁힘이 안 되므로 (`Student | undefined` 그대로 유지), 이를 우회하려고 `!` 강제. 향후 `studentMap`이 비동기 갱신되면 race로 `undefined` 반환 가능.
- **개선안**: 타입 가드 사용 — `.filter((s): s is Student => s !== undefined)`
- **참조**: TS Type Predicates

### [P1] `as` 타입 단언 6건 — `WebkitAppRegion` 우회 + ImageSticker 외부 API 어설션
- **위치**:
  - `src/adapters/components/Widget/Widget.tsx:187, 192, 212, 217, 235, 254, 267, 365` (대부분 `as React.CSSProperties`)
  - `src/widgets/items/ImageStickerWidget.tsx:23-26`:
  ```tsx
  const api = (window as unknown as Record<string, unknown>).electronAPI as {
    showOpenDialog?: (opts: unknown) => Promise<{ canceled: boolean; filePaths: string[] }>;
    readFileAsDataUrl?: (path: string) => Promise<string>;
  } | undefined;
  ```
- **카테고리**: TS
- **문제**:
  1. `WebkitAppRegion`은 Electron 표준 CSSProperties에 없어 `as React.CSSProperties` 단언이 반복됨 — 8회. 타입 정의 확장으로 한 번에 해결 가능.
  2. `ImageStickerWidget`의 `electronAPI` 어설션은 `electron/preload.ts`의 contextBridge 타입을 사용하지 않고 직접 두 번째 단언(`as unknown as Record`)을 거치므로 preload 타입과 동기화가 깨질 위험. 다른 위젯(`Bookmarks.tsx:33`, `FavoriteTools.tsx:14`)은 `window.electronAPI?.openExternal`을 직접 사용 → 일관성 부재.
- **개선안**:
  1. 글로벌 타입 보강:
     ```ts
     // src/types/csstype.d.ts
     declare module 'react' {
       interface CSSProperties {
         WebkitAppRegion?: 'drag' | 'no-drag';
       }
     }
     ```
  2. `window.electronAPI`는 preload contextBridge 타입을 그대로 사용하고, 부재한 메서드만 `?.` 옵셔널로 호출.
- **참조**: TypeScript module augmentation

### [P2] `as PageId`/`as TabFilter`/`as PresetKey` 등 문자열 단언
- **위치**: `src/widgets/types.ts` 사용처 + `src/widgets/components/WidgetTabBar.tsx:8`:
  ```ts
  ...CATEGORY_ORDER.map((cat) => ({ key: cat as TabFilter, label: CATEGORY_LABELS[cat] })),
  ```
- **카테고리**: TS
- **문제**: `WidgetCategory`는 `TabFilter`의 진부분집합(`'all' | WidgetCategory`)이므로 `as` 없이도 좁힐 수 있다.
- **개선안**:
  ```ts
  ...CATEGORY_ORDER.map((cat): { key: TabFilter; label: string } => ({
    key: cat,
    label: CATEGORY_LABELS[cat],
  })),
  ```

### [P2] `JSX.Element` 명시 — 신 React 17+ 컨벤션 위배
- **위치**: `src/widgets/items/TodayProgress.tsx:276`
  ```ts
  function getStatusBadge(status: 'planned' | 'completed' | 'skipped' | null): JSX.Element {
  ```
- **카테고리**: TS / 일관성
- **문제**: 다른 컴포넌트에서는 반환 타입을 명시하지 않는데 이 함수만 `JSX.Element` 사용. React 18 권장은 `ReactElement` 또는 추론.
- **개선안**: 반환 타입 제거 또는 `import type { ReactElement } from 'react'` 후 `ReactElement`.

### [P3] `interface` vs `type` 일관성 양호하나 inline props 1건
- **위치**: `src/adapters/components/Dashboard/DashboardEvents.tsx:96-104`:
  ```tsx
  function RangePicker({
    value, onChange, onClose,
  }: {
    value: number;
    onChange: (v: number) => void;
    onClose: () => void;
  }) {
  ```
- **카테고리**: TS / 일관성
- **문제**: 다른 모든 컴포넌트는 별도 `interface FooProps {}` 분리하는데 이 1건만 인라인. CLAUDE.md `Props는 별도 interface 정의` 명시와 충돌.
- **개선안**: `interface RangePickerProps { value: number; ... }` 분리. 동일 패턴 — `MessageBanner.tsx:63-67` `MessageStyleEditor` 함수, `ImageStickerWidget.tsx:153-160` `ImageSettingsPopover`, `Bookmarks.tsx:269-277` `DroppableGroup`, `Bookmarks.tsx:321` `SortableBookmarkItem`, `Bookmarks.tsx:371-385` `BookmarkVisibilityPicker`, `FavoriteTools.tsx:90-98` `FavoriteToolPicker`.
- **참조**: CLAUDE.md "Props는 별도 interface 정의"

---

## B. 에러 처리

### [P0] Widget.tsx 5개 store load() — try-catch 없이 발사 후 망각
- **위치**: `src/adapters/components/Widget/Widget.tsx:84-92`
  ```tsx
  useEffect(() => {
    void loadSchedule();
    void useSettingsStore.getState().load();
    void loadTodos();
    void loadEvents();
    void loadMemos();
    void loadMessage();
    loadConfig();
  }, [loadSchedule, loadTodos, loadEvents, loadMemos, loadMessage, loadConfig]);
  ```
- **카테고리**: 에러
- **문제**:
  1. 5개 `void`는 비동기 실패 시 unhandled rejection. 위젯 모드 진입 시 IPC가 실패하면 빈 화면 + 콘솔에 무성한 에러가 남고 사용자에겐 토스트도 없다.
  2. `useSettingsStore.getState().load()`만 인스턴스 메서드를 우회 — 이유 불명. (다른 4개는 hook 캐시 함수)
  3. `loadConfig()`만 `void` 없음 → linter가 promise floating으로 잡지 못함 (사실 `loadConfig`는 sync — useDashboardConfig:77 `load: () => {`).
- **개선안**:
  ```tsx
  useEffect(() => {
    Promise.allSettled([
      loadSchedule(), loadTodos(), loadEvents(),
      loadMemos(), loadMessage(),
      useSettingsStore.getState().load(),
    ]).then((results) => {
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length > 0) {
        // toast: '일부 데이터를 불러오지 못했습니다 (N건)'
      }
    });
    loadConfig();
  }, [...]);
  ```
- **참조**: React 18 useEffect, Promise.allSettled

### [P1] 비동기 dispatch 사용자 에러 노출 부재 — 메시지 저장
- **위치**: `src/adapters/components/Dashboard/MessageBanner.tsx:227-230`
  ```tsx
  async function confirmEdit() {
    await setMessage(draft.trim());
    setIsEditing(false);
  }
  ```
- **카테고리**: 에러
- **문제**: `setMessage`가 IPC 저장 실패 시 throw하면 `setIsEditing(false)`가 실행되지 않고 사용자에게는 아무 피드백 없음. `setStyle({...})`(`MessageBanner.tsx:202, 355`)도 동일.
- **개선안**: try-catch + Toast.
- **참조**: React.dev "Handling Errors"

### [P1] EventPopup.checkAlerts — 에러 silently swallow
- **위치**: `src/adapters/components/Dashboard/EventPopup.tsx:98-100`
  ```tsx
  useEffect(() => {
    void checkAlerts();
  }, [checkAlerts]);
  ```
- **카테고리**: 에러
- **문제**: `checkAlerts()`가 실패하면 `alertResult`가 영원히 null이라 팝업이 안 뜸 — 알림 누락. 사용자는 "왜 D-Day 안 뜨지?" 모름.
- **개선안**: try-catch + (구체적인 에러는 콘솔 + 사용자 친화 toast).
- **참조**: React.dev "Effect cleanup"

### [P1] ConsultationWidget — 슬롯 fetch 실패 silently swallow
- **위치**: `src/widgets/items/ConsultationWidget.tsx:34-41`
  ```tsx
  for (const schedule of activeSchedules.slice(0, 3)) {
    try {
      const slots = await consultationSupabaseClient.getSlots(schedule.id);
      ...
    } catch {
      // ignore
    }
  }
  ```
- **카테고리**: 에러
- **문제**: 위젯에 "로딩 중..." 영구 표시 (102행). 사용자는 fetch 실패인지 진짜 로딩인지 모름. `isOnline=false`만 별도 처리.
- **개선안**: `slotData`에 `error` 필드 추가하거나 `loadingState: 'loading' | 'success' | 'error'`로 명시.

### [P1] DashboardMeal — 에러 상태가 `viewDate=오늘`일 때만 노출
- **위치**: `src/adapters/components/Dashboard/DashboardMeal.tsx:99-101, 53-58, 60-64`
  ```tsx
  const showLoading = isViewingToday && todayLoading;
  const showError = isViewingToday && todayError;
  ```
- **카테고리**: 에러
- **문제**: `loadMealsForDate`가 다른 날짜에서 실패해도 `todayError`에 들어가지 않으므로 사용자는 빈 캐시만 봄. 캐시 미스 + fetch 실패 구분 없음.
- **개선안**: `mealsByDateError: Record<dateStr, string>` 또는 일반 dateError state.

### [P2] DashboardEvents - try { localStorage } 빈 catch — 사용자 모름
- **위치**: `src/adapters/components/Dashboard/DashboardEvents.tsx:171-176, 181`
  ```tsx
  try {
    const saved = localStorage.getItem('ssampin:event-widget-mode');
    if (saved === 'today') return 'today';
  } catch { /* ignore */ }
  ```
- **카테고리**: 에러
- **문제**: 로컬스토리지가 막힌 환경(쿠키/저장소 차단 모드)에서는 사용자 설정이 매번 리셋되지만 알림이 없음. 동일 패턴 — `DashboardTimetable.tsx:24-30, 33-35`, `widgets/useDashboardConfig.ts:10-27`.
- **개선안**: 첫 실패 시 한 번만 toast로 안내.

### [P2] async 핸들러 unhandled rejection — `void onRefresh()`
- **위치**: `src/widgets/hooks/useWidgetRefresh.ts:25-28`
  ```tsx
  const refresh = useCallback(() => {
    lastRefreshRef.current = Date.now();
    void onRefresh();
  }, [onRefresh]);
  ```
- **카테고리**: 에러
- **문제**: 5분마다 자동 호출되는 refresh가 실패해도 fallback 없음. 위젯 데이터가 stale인지 사용자는 모름.
- **개선안**: `.catch(() => { /* show stale indicator or toast once */ })`.

---

## C. 성능 안티패턴

### [P0] Zustand 전체 객체 구조 분해 → 무관 변경에도 리렌더
- **위치**:
  - `src/adapters/components/Widget/Widget.tsx:34-39`:
    ```tsx
    const { load: loadSchedule } = useScheduleStore();
    const { settings, update } = useSettingsStore();
    const { load: loadTodos } = useTodoStore();
    const { load: loadEvents } = useEventsStore();
    const { load: loadMemos } = useMemoStore();
    const { message, loadMessage } = useMessageStore();
    ```
  - `src/adapters/components/Dashboard/DashboardEvents.tsx:156-157`
  - `src/adapters/components/Dashboard/DashboardTimetable.tsx:14-23`
  - `src/adapters/components/Dashboard/DashboardTodo.tsx:23-27`
  - `src/adapters/components/Dashboard/DashboardMemo.tsx:53`
  - `src/adapters/components/Dashboard/DashboardStudentRecords.tsx:37-38`
  - `src/adapters/components/Dashboard/DashboardMeal.tsx:21-27`
  - `src/adapters/components/Dashboard/EventPopup.tsx:95-96`
  - `src/widgets/items/ClassTimetable.tsx:24-25`
  - `src/widgets/items/MemoFocus.tsx:24`
  - `src/widgets/items/Seating.tsx:8-9`
  - `src/widgets/items/SurveyWidget.tsx:19-20`
  - `src/widgets/items/TodayProgress.tsx:16-18`
  - `src/widgets/items/WeeklyTimetable.tsx:27-28`
  - `src/widgets/items/DDayCounter.tsx:222`
- **카테고리**: 성능
- **현재**:
  ```tsx
  const { settings, load: loadSettings } = useSettingsStore();  // ← 전체 store 구독
  ```
- **문제**: Zustand에서 selector 없이 `useFooStore()`만 호출하면 `setState` 한 번이라도 일어나면 컴포넌트 리렌더. `useSettingsStore`만 해도 `theme`, `widget`, `weather`, `eventWidgetRangeDays`, `periodTimes`, ... 수십 개 필드를 보유 → 어느 하나만 변해도 리렌더. 큰 리스트 컴포넌트(`DDayCounter` 385줄, `TodayProgress` 304줄, `BookmarksWidget` 490줄)에서 특히 영향. 위젯 모드는 4분할 시 모든 위젯이 동시 리렌더 폭풍을 겪음.
- **개선안**:
  ```tsx
  const settings = useSettingsStore((s) => s.settings);  // 부분 selector
  const update = useSettingsStore((s) => s.update);       // 함수만 분리
  ```
  `Bookmarks.tsx:55-67`에서 이미 모범 사례를 따르고 있음 — 모든 dashboard/widget 컴포넌트가 그 패턴으로 통일되어야 함.
- **참조**: Zustand "Selecting state slices"

### [P1] DashboardEvents — `useMemo` deps 빠진 ESLint 우회
- **위치**: `src/adapters/components/Dashboard/DashboardTimetable.tsx:113-117`:
  ```tsx
  const todayClassPeriods: readonly ClassPeriod[] = useMemo(() => {
    if (!dayOfWeek) return [];
    return getEffectiveClassSchedule(viewDateStr, weekendDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayOfWeek, viewDateStr, classSchedule, overrides]);
  ```
  같은 위치 119-124, 그리고 `WeeklyTimetable.tsx:104`, `DashboardMemo.tsx:86`, `MemoFocus.tsx:82`.
- **카테고리**: 성능 / 정확성
- **문제**: `getEffectiveClassSchedule` / `weekendDays` 같은 의존성을 deps에서 제외 → 함수 ref가 변하지 않거나 weekendDays 변경 시 메모가 갱신되지 않음. `weekendDays`를 설정에서 토글할 때 시간표가 즉시 반영 안 될 수 있음 (재마운트 의존).
- **개선안**: ESLint 비활성 주석 제거 후 누락된 deps 추가. `getEffectiveTeacherSchedule`은 store 메서드라 안정적 ref라면 store 정의에서 명시 (현재 zustand는 selector 안 통과 시 매 호출 새 함수 — 그래서 비활성한 듯).
- **참조**: react-hooks/exhaustive-deps rule rationale

### [P1] DashboardTodo — `filterActive(todos)` 중복 호출
- **위치**: `src/adapters/components/Dashboard/DashboardTodo.tsx:51-54, 124`
  ```tsx
  const sorted = useMemo<readonly Todo[]>(() => {
    const active = filterActive(todos);
    return sortTodos(active);
  }, [todos]);
  ...
  const activeTodos = useMemo(() => filterActive(todos), [todos]);
  ```
- **카테고리**: 성능
- **문제**: 동일 `filterActive(todos)` 두 번 계산. 큰 todo 리스트(예: 200개)에서 매 todo 체인지마다 두 번 순회.
- **개선안**: 한 번 계산 후 재사용:
  ```tsx
  const activeTodos = useMemo(() => filterActive(todos), [todos]);
  const sorted = useMemo(() => sortTodos(activeTodos), [activeTodos]);
  ```

### [P1] SurveyWidget — render 중 `useSurveyStore.getState()` 호출
- **위치**: `src/widgets/items/SurveyWidget.tsx:57-58`
  ```tsx
  {activeSurveys.slice(0, 3).map((survey) => {
    const localData = useSurveyStore.getState().getLocalData(survey.id);
  ```
- **카테고리**: 성능 / 정확성
- **문제**: render 중 `getState()`로 store 직접 접근하면 React가 추적 못 함 — store 변경 시 `localData`만 stale 상태로 유지. 또한 `getLocalData()` 가 매 render마다 호출되어 메모이제이션이 무력화.
- **개선안**: `useSurveyStore((s) => s.localData)` 사용 + `useMemo`로 진행률 계산.
- **참조**: React.dev "External Stores"

### [P1] DashboardEvents — render 중 `parseDate()` 무거운 호출 반복
- **위치**: `src/adapters/components/Dashboard/DashboardEvents.tsx:209-234`
  ```tsx
  .filter((event) => {
    const eventMs = parseDate(event.date).getTime();   // 매 이벤트당 파싱
    const endMs = event.endDate ? parseDate(event.endDate).getTime() : eventMs;
    ...
  })
  .sort(sortWithOrder);  // sortWithOrder도 parseDate를 두 번 호출
  ```
- **카테고리**: 성능
- **문제**: 1000개 이벤트 시 `parseDate` 약 4000번 호출 (`filter`에서 2번 × `sort`에서 2번 평균). 비교 함수 안에서 `Date` 새 객체 생성.
- **개선안**: 정렬/필터 전에 한 번 `events.map((e) => ({ ...e, _ms, _endMs }))` 캐싱하거나, ms 비교는 문자열 비교(`e.date.localeCompare(b.date)`)로 대체.

### [P1] MessageBanner — 인라인 `{ ...DEFAULT_MESSAGE_STYLE, ...style }` 매 렌더 새 객체
- **위치**: `src/adapters/components/Dashboard/MessageBanner.tsx:187-188`
  ```tsx
  const s = { ...DEFAULT_MESSAGE_STYLE, ...style };
  const colors = getColors(s);
  ```
- **카테고리**: 성능
- **문제**: 매 렌더 새 객체 → `MessageStyleEditor` 자식이 `style` prop을 메모이즈해도 의미 없음. `getColors(s)`도 매번 호출.
- **개선안**:
  ```tsx
  const s = useMemo(() => ({ ...DEFAULT_MESSAGE_STYLE, ...style }), [style]);
  const colors = useMemo(() => getColors(s), [s]);
  ```

### [P1] WeatherForecastPopup — 인라인 객체 prop
- **위치**: `src/adapters/components/Dashboard/WeatherForecastPopup.tsx:48`
  ```tsx
  <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${forecast.length}, minmax(0, 1fr))` }}>
  ```
- **카테고리**: 성능 (경미)
- **문제**: 인라인 style 객체가 매 렌더 새로 생성. 모달이라 영향은 작지만 일관성 차원.
- **개선안**: `useMemo`.

### [P1] Widget.tsx — 8 `WebkitAppRegion` 인라인 객체
- **위치**: `src/adapters/components/Widget/Widget.tsx:192, 212, 217, 235, 254, 267, 363-365`
  ```tsx
  style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
  ```
- **카테고리**: 성능 (경미)
- **문제**: 매 렌더 7-8개 객체 생성. CSS 클래스로 추출 가능.
- **개선안**: `.region-drag { -webkit-app-region: drag } .region-no-drag { -webkit-app-region: no-drag }` CSS 클래스화.

### [P1] Widget.tsx — 8개 리사이즈 핸들 매 렌더 재생성 + 8개 인라인 핸들러
- **위치**: `src/adapters/components/Widget/Widget.tsx:350-409`
  ```tsx
  {['top', 'bottom', 'left', 'right', ...].map((edge) => (
    <div
      ...
      onPointerDown={(e) => {
        e.preventDefault(); e.stopPropagation();
        let lastX = e.screenX; let lastY = e.screenY;
        ...
      }}
    />
  ))}
  ```
- **카테고리**: 성능 / 코드 스멜
- **문제**: 매 렌더 새 핸들러 8개 + 매 렌더 새 style 객체 8개. 핸들러 내부에서 `requestAnimationFrame` + `addEventListener` 정리는 잘 되어 있으나, JSX 자체가 기능 함수로 분리되어야 마땅.
- **개선안**: `<WidgetResizeEdge edge={edge} />` 컴포넌트로 분리 + `onPointerDown` `useCallback` + 컴포넌트 자체 `React.memo`.

### [P1] DashboardEvents/DashboardTodo/Seating/TodayProgress/DashboardMemo — ResizeObserver 5개 인스턴스 + 인라인 콜백
- **위치**:
  - `DashboardEvents.tsx:188-200`
  - `DashboardTodo.tsx:32-42`
  - `widgets/items/Seating.tsx:16-24`
  - `widgets/items/TodayProgress.tsx:128-136`
  - `DashboardMemo.tsx:63-74`
- **카테고리**: 성능
- **문제**: 동일 위젯 카드에서 위젯마다 ResizeObserver를 따로 만들어 콜백 호출. 위젯이 16개면 16개 옵저버 → reflow 시 16번 콜백. 각 콜백이 `setState` 호출하므로 리렌더 폭풍.
- **개선안**: `widgets/components/WidgetCard.tsx`에서 ResizeObserver 단 한 번 + Context로 자식에게 width/height 전달. 또는 `useAutoFitLayout`처럼 부모 레벨에서 처리.

### [P1] BookmarksWidget — 매 렌더 `groupedBookmarks`에서 중첩 sort + filter
- **위치**: `src/widgets/items/Bookmarks.tsx:116-125`
  ```tsx
  const groupedBookmarks = useMemo(() => {
    const activeGroups = groups.filter((g) => !g.archived);
    const visibleGroups = filterVisibleGroups(activeGroups, hiddenGroups);
    const visibleBookmarks = filterVisibleBookmarks(bookmarks, hiddenBookmarks);
    const sortedGroups = sortGroupsByOrder(visibleGroups);
    return sortedGroups.map((group) => ({
      group,
      items: getBookmarksByGroup(visibleBookmarks, group.id),  // group마다 전체 순회
    }));
  }, [groups, bookmarks, hiddenGroups, hiddenBookmarks]);
  ```
- **카테고리**: 성능
- **문제**: `getBookmarksByGroup` 가 group마다 전체 bookmarks 순회 → O(N×M). 1000 북마크 + 50 그룹 = 50,000번 비교.
- **개선안**: 한 번 `Map<groupId, Bookmark[]>` 빌드 후 lookup. (`buildBookmarkMap` 같은 헬퍼)

### [P2] DashboardEvents — `showAll` Modal `filtered.map(...)` 풀 리스트 매 렌더
- **위치**: `src/adapters/components/Dashboard/DashboardEvents.tsx:328-330`
  ```tsx
  {filtered.map((event) => (
    <EventItem key={event.id} event={event} today={today} categories={categories} ...
  ```
- **카테고리**: 성능
- **문제**: 모달 안에서 1000개 일정을 비가상화로 렌더. 위 본문(284줄)은 `visible.map` (기본 6개)이지만 모달은 무제한.
- **개선안**: react-window/react-virtualized 또는 페이지네이션.

### [P2] 자동 갱신 위젯 — 1분 setInterval × 위젯당 1개 → 다중 타이머
- **위치**:
  - `DashboardTimetable.tsx:74` (60_000ms)
  - `WeeklyTimetable.tsx:58` (60_000ms)
  - `TodayProgress.tsx:42` (60_000ms)
  - `DashboardPinGuard.tsx:30` (30_000ms × 위젯 수)
  - `useClock.ts:36` (1_000ms — 시계는 1초)
  - `WeatherBar.tsx:32`, `WidgetWeatherBar.tsx:30` (30분)
- **카테고리**: 성능 / 일관성
- **문제**: 같은 1분 주기를 컴포넌트마다 별도 타이머로 운영. 16개 위젯이면 16개 setInterval. 또 `DashboardPinGuard`는 매 위젯에 30초 타이머 → 위젯 수 × 30초 호출.
- **개선안**: 전역 "now" Zustand store를 1분 간격으로 갱신, 모든 위젯이 selector 구독. PinGuard는 useClock에 통합.

### [P2] DashboardMeal — `useDashboardConfig((s) => s.config)` selector 미사용으로 `widgets` 배열 변동에도 리렌더
- **위치**: `src/adapters/components/Dashboard/DashboardMeal.tsx:44-46`
  ```tsx
  const config = useDashboardConfig((s) => s.config);
  const myColSpan = config?.widgets.find((w) => w.widgetId === 'meal')?.colSpan ?? 1;
  const isWide = myColSpan >= 3;
  ```
- **카테고리**: 성능
- **문제**: 다른 위젯이 사이즈 변경할 때마다 (config 객체 swap) DashboardMeal이 리렌더.
- **개선안**: `useDashboardConfig((s) => s.config?.widgets.find((w) => w.widgetId === 'meal')?.colSpan ?? 1)`.

### [P2] DashboardMemo — `selectedMemo` deps `selectedMemo?.id`로 ESLint 비활성
- **위치**: `src/adapters/components/Dashboard/DashboardMemo.tsx:77-87, 102-122`
  ```tsx
  useEffect(() => {
    if (selectedMemo) {
      const updated = memos.find((m) => m.id === selectedMemo.id);
      ...
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memos, selectedMemo?.id]);
  ```
- **카테고리**: 성능 / 정확성
- **문제**: `selectedMemo` 객체 자체를 deps에 넣지 않음 → 객체 참조가 바뀌어도 effect 안 도는 케이스 가능.
- **개선안**: 명시적으로 ID-only 비교를 의도한다면 ESLint 룰 disable 사유 주석 추가. 안전 차선은 `selectedMemo` 객체 자체 deps.

### [P3] DashboardMeal에 `useCallback` 없음 — `setViewDate` 직접 prop
- **위치**: `src/adapters/components/Dashboard/DashboardMeal.tsx:81`
  ```tsx
  <DateNavigator date={viewDate} onDateChange={setViewDate} />
  ```
- **카테고리**: 성능 (경미)
- **문제**: `setViewDate`는 React가 stable ref 보장하므로 OK. 하지만 다른 컴포넌트(`DashboardTimetable.tsx:41-43`)는 `useCallback`을 거쳐 일관성 부재.

---

## D. 메모리 누수·생명주기

### [P1] Widget.tsx pointer 리사이즈 — `pointermove` 글로벌 리스너 unmount 시점 미정
- **위치**: `src/adapters/components/Widget/Widget.tsx:366-407`
  ```tsx
  onPointerDown={(e) => {
    ...
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }}
  ```
- **카테고리**: 메모리 / 생명주기
- **문제**: `onUp`에서 정리하지만 사용자가 버튼을 누른 채 컴포넌트가 unmount되면 핸들러가 영구 추가됨 (실제로는 거의 없는 시나리오지만 위젯 윈도우 닫기 vs unmount race).
- **개선안**: `useEffect` cleanup에서 `'pointermove'`/`'pointerup'`을 명시적 제거. (또는 `pointercancel` 이벤트도 처리.)

### [P1] DashboardPinGuard — 30초 setInterval × 위젯당 1개 (보호 위젯이 6~9개면 동시 6~9개 타이머)
- **위치**: `src/adapters/components/Dashboard/DashboardPinGuard.tsx:28-32`
- **카테고리**: 메모리 / 성능
- **문제**: WidgetCard.tsx `PIN_FEATURE_MAP`에 9개 키 → 모두 보호되면 9개 타이머 동시 가동 + 매 30초 9번 `checkAutoLock` 호출. cleanup 자체는 OK.
- **개선안**: 단일 전역 인터벌 + 모든 PinGuard가 그 결과를 구독.

### [P2] DashboardTodo `loadEvents` `loadSchedule` `load` 3개 effect — 복잡한 deps
- **위치**: `src/adapters/components/Dashboard/DashboardTodo.tsx:44-48`
  ```tsx
  useEffect(() => {
    void load(); void loadSchedule(); void loadEvents();
  }, [load, loadSchedule, loadEvents]);
  ```
- **카테고리**: 생명주기
- **문제**: 3 store 함수 ref가 zustand 특성상 매 렌더 새 함수일 가능성 (selector 미사용). 그러면 effect가 매 렌더 실행 → 무한 데이터 fetch 위험.
- **확인 필요**: `useTodoStore` selector 미사용이므로 — 이미 P0 "Zustand 전체 구독"에 포함.

### [P3] useClock setInterval 1초 — 정상 cleanup
- **위치**: `src/adapters/hooks/useClock.ts:32-43`
- **카테고리**: 메모리
- **확인**: cleanup 정상. 단, 이 hook이 사용되지 않는 위젯에서도 `Widget.tsx:33` `const clock = useClock()`로 호출되므로 위젯 모드는 항상 1초 리렌더.
- **개선안**: `clock.time`만 minute resolution이면 1분 인터벌로 충분.

### [P3] dnd-kit sensors — `useSortable`/`useDroppable`/`PointerSensor` cleanup 자체 라이브러리 책임
- **위치**: `Bookmarks.tsx:72-76, 235-262, 296-308, 321-330`, `WidgetGrid.tsx:48-51`, `SortableWidget.tsx:28-35`
- **카테고리**: 메모리
- **확인**: `@dnd-kit`은 자체적으로 `useEffect` cleanup을 처리. 명시적 destroy 호출 불필요.

---

## E. 보안·입력 검증

### [P1] BookmarksWidget — URL 검증 없이 `openExternal(bookmark.url)` 호출
- **위치**: `src/widgets/items/Bookmarks.tsx:30-43`
  ```tsx
  function openBookmark(bookmark: Bookmark) {
    const type = bookmark.type ?? 'url';
    if (type === 'folder') {
      if (window.electronAPI?.openPath) {
        void window.electronAPI.openPath(bookmark.url);
      }
    } else {
      if (window.electronAPI?.openExternal) {
        void window.electronAPI.openExternal(bookmark.url);
      } else {
        window.open(bookmark.url, '_blank', 'noopener,noreferrer');
      }
    }
  }
  ```
- **카테고리**: 보안
- **문제**: `bookmark.url`이 `javascript:`, `file://`, `data:` 등 위험 스키마여도 검증 없이 OS shell에 전달. Electron `shell.openExternal`은 기본적으로 `javascript:`/`file:` 방어가 있지만 `data:`/`vbscript:`는 통과 가능. 사용자가 (혹은 손상된 sync 파일이) 악성 URL을 추가했을 때 무방비.
- **개선안**: `URL` 객체로 파싱 후 `protocol`이 `http:`/`https:`/`mailto:`만 허용 (folder 타입은 `openPath`로 분리되어 OK). 침입 시그니처: `domain/rules/bookmarkRules.ts`에 `isSafeUrl(url)` 추가.
- **참조**: OWASP Top 10 — A3 Injection (URL handling)

### [P1] BookmarksWidget — `<img src={bookmark.iconValue} />` 외부 favicon 검증 없음
- **위치**: `src/widgets/items/Bookmarks.tsx:200, 354, 456`
  ```tsx
  {bm.iconType === 'favicon' ? (
    <img src={bm.iconValue} alt="" className="w-4 h-4 rounded" />
  ) : ...}
  ```
- **카테고리**: 보안
- **문제**: 사용자/sync 파일이 `iconValue`에 임의 URL 주입 가능. tracking pixel/image-based timing 공격 가능. CSP가 막더라도 사용자 IP가 외부에 누출.
- **개선안**: `iconValue`가 `https://www.google.com/s2/favicons?...` 같은 화이트리스트만 허용하거나 `referrerPolicy="no-referrer"` 추가.

### [P1] WeatherBar / WeatherForecastPopup — 외부 이미지 src에 `referrerPolicy` 없음
- **위치**:
  - `src/adapters/components/Dashboard/WeatherBar.tsx:95`: `<img src={iconUrl} alt="" />`
  - `src/adapters/components/Dashboard/WeatherForecastPopup.tsx:67`: `<img src={day.conditionIcon} alt={day.condition} />`
- **카테고리**: 보안 (경미)
- **문제**: WeatherAPI.com이 IP 추적 가능 (브라우저 referrer 헤더). 또한 `iconUrl`이 `https:`로 시작하지 않으면 `https:${conditionIcon}` 강제 prefix하지만 검증 부족.
- **개선안**: `referrerPolicy="no-referrer"` + `iconUrl` 화이트리스트 (`weatherapi.com` 도메인만).

### [P1] ImageStickerWidget — 사용자 이미지 file:// 노출
- **위치**: `src/widgets/items/ImageStickerWidget.tsx:46-47`
  ```tsx
  } else {
    void setImage(widgetId, `file://${filePath}`, fileName);
  }
  ```
- **카테고리**: 보안
- **문제**: `readFileAsDataUrl`이 없는 fallback 경로에서 `file://` URL을 그대로 저장 → settings 동기화 시 다른 PC에는 깨진 경로. 또한 백엔드 sync에 절대 파일경로가 노출 (사용자 홈 디렉터리 정보 누출).
- **개선안**: `readFileAsDataUrl`을 필수로 강제 (fallback 제거). 또는 base64 변환만 허용.

### [P1] ImageStickerWidget — `<img src={dataUrl}>` 사용자 입력 검증 없음
- **위치**: `src/widgets/items/ImageStickerWidget.tsx:101-107`
  ```tsx
  <img
    src={widgetData.imageUrl}
    alt={widgetData.caption ?? widgetData.fileName ?? '이미지'}
    ...
  />
  ```
- **카테고리**: 보안 (경미)
- **문제**: `imageUrl`이 sync 파일에서 `<svg onload="...">` 같은 SVG가 들어오면 XSS 가능 (img 태그 자체는 SVG 스크립트 실행 차단하므로 영향 작음). 그러나 caption이 `'/></div><script>...`처럼 들어오면 문제 (현재 `alt`라 안전).
- **개선안**: caption이 input으로 들어가는 자리에서 길이/특수문자 검증.

### [P1] DashboardEvents — `localStorage.getItem('ssampin:event-widget-mode')` 검증
- **위치**: `src/adapters/components/Dashboard/DashboardEvents.tsx:170-176`
  ```tsx
  try {
    const saved = localStorage.getItem('ssampin:event-widget-mode');
    if (saved === 'today') return 'today';
  } catch { /* ignore */ }
  return 'upcoming';
  ```
- **카테고리**: 보안 (정확성에 가까움)
- **문제**: 검증은 OK (`'today'` 정확 일치). 그러나 `DashboardTimetable.tsx:24-30`은 `'class'`/`'teacher'`만 체크. 나머지 `useDashboardConfig` 등에서는 신뢰 없이 `JSON.parse` → 형식 검증 미흡.
- **개선안**: zod/runtypes로 schema 검증.

### [P2] useDashboardConfig — JSON.parse 검증 없이 신뢰
- **위치**: `src/widgets/useDashboardConfig.ts:11-16`
  ```tsx
  function loadFromStorage(): DashboardConfig | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as DashboardConfig;  // 검증 없음
    } catch {
      return null;
    }
  }
  ```
- **카테고리**: 보안 / 안정성
- **문제**: 사용자 손상된 JSON / 다른 버전 data → `widgets`가 string이거나 visible이 number → `widget.visible` 접근 시 런타임 에러. 마이그레이션 코드(`load` 80-108)는 일부 처리하지만 타입 불일치는 미커버.
- **개선안**: 런타임 schema 검증 (예: `if (!Array.isArray(parsed.widgets)) return null`).

### [P3] MessageBanner — color picker `customColor`
- **위치**: `src/adapters/components/Dashboard/MessageBanner.tsx:144-149`
  ```tsx
  <input type="color" ... onChange={(e) => onUpdate({ colorPreset: 'custom', customColor: e.target.value })} />
  ```
- **카테고리**: 보안 (경미)
- **문제**: native color picker는 `#RRGGBB` 강제 → XSS 위험 없음. 그러나 `customColor`를 `style.background = colors.bg` 같이 인라인 적용 — 만약 sync 파일에서 임의 문자열 주입되면 CSS injection 가능.
- **개선안**: deriveColors 입력 검증 (`/^#[0-9a-f]{6}$/i.test(hex)`).

---

## F. 코드 스멜

### [P1] Top 10 거대 컴포넌트 + 함수
| 파일 | 줄 수 | 문제 함수 | 줄 |
|------|-----|-----------|---|
| `widgets/items/Bookmarks.tsx` | 491 | `BookmarkVisibilityPicker` | 371-490 (120줄) |
| `widgets/items/DDayCounter.tsx` | 385 | (전체) | — |
| `widgets/components/WidgetSettingsPanel.tsx` | 384 | `StyleTab` | 183-358 (175줄) |
| `widgets/registry.ts` | 384 | (구성 데이터) | — |
| `Dashboard/MessageBanner.tsx` | 363 | `MessageStyleEditor` | 63-177 (115줄) |
| `Dashboard/DashboardTimetable.tsx` | 360 | (전체) | — |
| `Dashboard/DashboardTodo.tsx` | 353 | `DashboardTodo` 본체 | 22-223 (200줄) |
| `widgets/items/TodayProgress.tsx` | 305 | `todayLessons` useMemo | 61-118 (58줄) |
| `widgets/items/MiniCalendar.tsx` | 261 | `calendarDays` useMemo | 26-105 (80줄) |
| `widgets/components/SortableWidget.tsx` | 127 | (작은 편) | — |
| `Widget/WidgetContextMenu.tsx` | 274 | (전체) | — |

- **카테고리**: 스멜
- **문제**: CLAUDE.md 가이드라인은 명시 없으나 일반적으로 컴포넌트 300줄 / 함수 80줄을 권장. `BookmarkVisibilityPicker`(120줄), `MessageStyleEditor`(115줄), `DashboardTodo` body(200줄)는 분해 후보.
- **개선안**: 위 셋부터 우선 분리.

### [P1] DashboardEvents 안에 `EventItem`/`RangePicker` + DashboardTodo 안에 `TodoItem`/`Checkbox` + DashboardStudentRecords의 `getTagClass` — inline private 컴포넌트
- **위치**:
  - `DashboardEvents.tsx:36-92` `EventItem`, `96-153` `RangePicker`
  - `DashboardTodo.tsx:225-352` 6 헬퍼/sub
  - `DashboardStudentRecords.tsx:18-21` `getTagClass`
  - `EventPopup.tsx:36-92` `DDayBadge`+`EventItem`(중복)
- **카테고리**: 스멜 / 중복
- **문제**: `EventItem`이 `DashboardEvents.tsx:44-92`와 `EventPopup.tsx:55-92` 두 곳에서 재구현 (서로 다른 prop shape). 렌더 결과는 비슷하지만 한쪽은 dot/날짜 단축, 다른 쪽은 아이콘/시간/위치 — 적절히 다르지만 Category lookup 로직은 동일.
- **개선안**: `Dashboard/EventItem.tsx`로 추출, prop으로 variant 분기.

### [P1] 매직 넘버 — 인터벌/임계치/사이즈 하드코딩
- **위치**:
  - `DashboardTimetable.tsx:74` `60_000`, `WeeklyTimetable.tsx:58, TodayProgress.tsx:42` `60_000` (각각 동일)
  - `DashboardPinGuard.tsx:30` `30_000`
  - `useClock.ts:36` `1000`
  - `WeatherBar.tsx:32, WidgetWeatherBar.tsx:30` `30 * 60 * 1000`
  - `useWidgetRefresh.ts:22` `5 * 60 * 1000`, `:43` `60_000`
  - `DashboardEvents.tsx:193` `36` (item height), `:194` `70` (header)
  - `DashboardMemo.tsx:30-50` width/height threshold 600/500/400/350/300/250
  - `widgets/items/Seating.tsx:18` width 300/500
  - `widgets/items/TodayProgress.tsx:132` height 300
  - `widgets/items/DDayCounter.tsx:15` 8 colors
  - `widgets/components/WidgetGrid.tsx:145` `(ws.gridRowHeight ?? 80)`
  - `widgets/items/Bookmarks.tsx:74` `distance: 5`, `useDashboardConfig.ts:192` `Math.min(12, rowSpan)`
  - `widgets/components/WidgetResizeHandle.tsx:50` `gap = 16`
- **카테고리**: 스멜
- **문제**: `60_000`, `300_000`, `1_800_000`, `30_000` 같은 인터벌이 14개 파일에 흩어짐. 변경 시 추적 어려움.
- **개선안**: `src/widgets/constants.ts` 또는 `src/shared/constants/intervals.ts`에 모음:
  ```ts
  export const INTERVALS = {
    CLOCK: 1_000,
    PERIOD_REFRESH: 60_000,
    AUTO_LOCK_CHECK: 30_000,
    WEATHER_REFRESH: 30 * 60_000,
    WIDGET_REFRESH: 5 * 60_000,
  } as const;
  ```

### [P1] 죽은/플레이스홀더 코드
- **위치**:
  - `src/widgets/items/Grades.tsx` (16줄, "TODO: 실제 성적 데이터 연동 시 구현")
  - `src/widgets/items/Tasks.tsx` (16줄, "TODO: 실제 업무 데이터 연동 시 구현")
- **카테고리**: 스멜
- **문제**: `registry.ts`에서 import도 안 됨 (`Grades`/`Tasks`가 등록되지 않음). 사용처 0건. 파일만 있고 죽어있음.
- **개선안**: 삭제 또는 주석에 "WIP — 미사용" 명시. 사용자가 "준비 중입니다" 카드를 보지 않으니 사이드 이펙트는 없으나 파일 정리 필요.

### [P1] alias 위젯 6종 — 진짜 alias인지 검증 결과 ✅ alias 정상
- **위치**: `src/widgets/items/{TodayClass,Events,TodoWidget,Memo,Meal,StudentRecords}.tsx`
- **카테고리**: 스멜 (negative finding)
- **확인 결과**: 6 파일 모두 1-line `export { Foo as Bar }` 형태. 진짜 별칭 — 중복 구현 없음.

### [P2] DashboardPinGuard 사용 여부
- **위치**: `DashboardPinGuard.tsx:81`, `widgets/components/WidgetCard.tsx:34, 82-87`
- **카테고리**: 스멜 (negative finding)
- **확인 결과**: WidgetCard에서 `PIN_FEATURE_MAP` 매칭된 9개 위젯에서 사용 중. CLAUDE.md memory 에 있는 "미사용 의심"은 부정 — 실사용.

### [P2] Architecture 의존성 위반 — adapters/widgets에서 infrastructure 직접 import
- **위치**:
  - `src/widgets/items/DDayCounter.tsx:10`: `import { generateUUID } from '@infrastructure/utils/uuid';`
  - `src/widgets/items/ConsultationWidget.tsx:3-4`:
    ```ts
    import { consultationSupabaseClient } from '@adapters/di/container';
    import type { SlotPublic } from '@infrastructure/supabase/ConsultationSupabaseClient';
    ```
- **카테고리**: 일관성 / 아키텍처
- **문제**: CLAUDE.md "유일한 예외: `adapters/di/container.ts`는 infrastructure/를 import하여 의존성을 조립한다"고 명시. `widgets/items/`는 adapters/components의 일종이므로 infrastructure 직접 import 금지. `SlotPublic` 타입 import는 그래도 가벼움이지만 `generateUUID`는 도메인 utility 후보.
- **개선안**: `generateUUID`를 `@shared/utils` 또는 `@domain/utils`로 이동. `SlotPublic`은 `domain/entities/Consultation.ts`로 이동.
- **참조**: CLAUDE.md "의존성 규칙"

### [P2] inline arrow 함수 props 다수 — 메모이제이션 무력화
- **위치**:
  - `src/adapters/components/Widget/Widget.tsx:218, 236, 255, 268` (각 버튼 onClick)
  - `src/adapters/components/Dashboard/MessageBanner.tsx:75, 87, 111, 132, 138, 162, 169` 등
  - `Bookmarks.tsx:138-145, 165, 182-184, 194, 220, 391-405, 428-431, 451`
- **카테고리**: 성능 (스멜에 가까움)
- **문제**: `onClick={(e) => { ... }}`이 매 렌더 새 함수 → 자식이 React.memo여도 prop 비교에서 fail. 단, 자식이 `<button>` 같은 native 엘리먼트면 무관. 실제 영향이 큰 곳은 `<DDayRow>` (`DDayCounter.tsx:328-335` `onTogglePin/onDelete/onEdit` 모두 인라인) 같은 list item.

### [P3] 콘솔 로그 — 0건 (good)
- **확인**: dashboard/widget 범위에 `console.log/error/warn` 0건. 일반 print debugging은 정리 완료 상태.

### [P3] Comments / TODO
- **위치**: `Grades.tsx:3`, `Tasks.tsx:3` 만 TODO. 다른 곳은 한국어 인라인 설명만.
- **카테고리**: 스멜 (경미)
- **확인**: 잘 정리되어 있음.

---

## G. 일관성

### [P1] Date 포맷 헬퍼 중복 — 5곳에서 동일 로직 재구현
- **위치**:
  - `Dashboard/DashboardEvents.tsx:14-21, 23-28` (`parseDate`, `formatMMDD`)
  - `Dashboard/DashboardTodo.tsx:261-266` (`formatLocalDate`)
  - `Dashboard/DashboardStudentRecords.tsx:6-9, 11-14` (`todayString`, `formatDateKR`)
  - `Dashboard/DashboardMeal.tsx:13-18` (`toMealDateString` — YYYYMMDD)
  - `widgets/items/MiniCalendar.tsx:32` (`todayStr`)
  - `widgets/items/DDayCounter.tsx:24-30` (`formatDateKR` — 다른 형식)
  - `widgets/items/TodayProgress.tsx` 등은 `toLocalDateString` import (`@shared/utils/localDate`) 사용
- **카테고리**: 일관성 / 중복
- **문제**: `@shared/utils/localDate`의 `toLocalDateString`을 사용하는 위젯도 있고 인라인 직접 구현하는 위젯도 있음. CLAUDE.md "date-fns 사용" 명시지만 직접 구현이 다수.
- **개선안**: `@shared/utils/localDate`로 통일. 모든 컴포넌트가 이것을 import.

### [P1] 1분 갱신 패턴 중복 + Timer 경합
- **위치**: `DashboardTimetable.tsx:74`, `WeeklyTimetable.tsx:58`, `TodayProgress.tsx:42` (3개 별도 1분 setInterval). 동일 코드 패턴 (`const timer = setInterval(() => setNow(new Date()), 60_000)`).
- **카테고리**: 일관성 / 성능
- **개선안**: 전역 시계 store 또는 단일 hook (`useNow(intervalMs)`).

### [P2] import 순서 — Dashboard와 widgets 사이 일관 부재
- **위치**: 일부 파일은 react import 후 빈 줄 → adapter → domain. 다른 파일은 무질서.
  - `DashboardEvents.tsx:1-11` 올바른 순서
  - `Bookmarks.tsx:1-29` react → adapter → domain → 외부 lib (dnd-kit) — 외부 lib가 마지막
  - `DDayCounter.tsx:1-11` react → adapter → domain → infrastructure (위반)
- **카테고리**: 일관성
- **개선안**: ESLint `import/order` rule 적용 (1. react, 2. external, 3. @domain, 4. @usecases, 5. @adapters, 6. @infrastructure, 7. relative).

### [P2] 시간 표기 한글 unicode 직접 vs 문자열
- **위치**: `DashboardStudentRecords.tsx:243` `'📌'` (📌 surrogate pair 코드)
- **카테고리**: 일관성
- **문제**: 모든 다른 파일은 `📌` 직접 사용 (예: `DDayCounter.tsx:171, 198`). 이 한 곳만 escape — 의도가 불명.
- **개선안**: 직접 이모지로 통일.

### [P2] 한국어 텍스트 inline (i18n 미적용)
- **확인**: 100% 한국어 inline. CLAUDE.md "모든 UI 텍스트는 한국어"와 일치 → 의도된 설계. 단 i18n 향후 도입 시 추출 비용 큼.

### [P3] 테스트 파일 0건
- **확인**: `src/adapters/components/Dashboard/**/*.test.{ts,tsx}` 0개, `src/widgets/**/*.test.tsx` 0개, `src/adapters/components/Widget/**/*.test.tsx` 0개.
- **카테고리**: 일관성
- **문제**: dashboard/widget 코드에 unit test 전무. 도메인 룰(`@domain/rules/*`)은 테스트되지만 통합 시점 회귀 위험.
- **개선안**: 핵심 컴포넌트(Widget.tsx layout switching, DashboardEvents filtered/visible 계산)부터 RTL 테스트.

---

## 정량 요약

| 카테고리 | P0 | P1 | P2 | P3 | 합계 |
|---|---|---|---|---|---|
| TS 안전성 | 1 | 2 | 1 | 1 | 5 |
| 에러 처리 | 1 | 4 | 2 | 0 | 7 |
| 성능 | 1 | 8 | 4 | 1 | 14 |
| 메모리 | 0 | 2 | 1 | 1 | 4 |
| 보안 | 0 | 5 | 1 | 1 | 7 |
| 스멜 | 0 | 4 | 3 | 2 | 9 |
| 일관성 | 0 | 2 | 3 | 1 | 6 |
| **합계** | **3** | **27** | **15** | **7** | **52** |

---

## Top 10 우선순위 픽스

1. **[P0 / 성능] Zustand 전체 store 구조 분해 → selector화** — 16개 위젯 동시 가동 시 리렌더 폭풍의 근본 원인. 영향 파일 15개 이상. (`Widget.tsx:34-39`, 모든 Dashboard*.tsx). 영향 범위가 가장 크고 수정 비용도 낮은 단순 패턴 변경 — 가장 먼저 처리.

2. **[P0 / TS] `TodayProgress.tsx` 7개 non-null assertion 제거** — `lesson.progress!.unit` 등을 `const todayProgress = lesson.progress;` 좁힘 변수로 대체. 실제 런타임 에러 가능 시나리오.

3. **[P0 / 에러] `Widget.tsx` 5개 store load 에러 처리** — `Promise.allSettled` + 토스트. 위젯 모드 진입이 무성공/무실패 상태로 빠지는 UX 결함 차단.

4. **[P1 / 보안] BookmarksWidget URL 스키마 화이트리스트** — `openExternal(bookmark.url)` 호출 전 `protocol in {http,https,mailto}` 검증. `domain/rules/bookmarkRules.ts`에 `isSafeUrl` 추가.

5. **[P1 / 성능] 1분 setInterval 3중 중복 → 전역 시계 store** — `DashboardTimetable`, `WeeklyTimetable`, `TodayProgress` 별도 60_000ms 타이머를 단일 zustand store로 통합. 위젯 16개 × 30초/1분 타이머 폭주 해소.

6. **[P1 / 보안] BookmarksWidget `<img>` favicon `referrerPolicy="no-referrer"`** — 사용자 IP 누출 차단. `WeatherBar`/`WeatherForecastPopup` 외부 이미지에도 동일 적용.

7. **[P1 / 아키텍처] DDayCounter / ConsultationWidget의 `@infrastructure` import 제거** — `generateUUID`는 `@shared/utils`로, `SlotPublic`은 `@domain/entities/Consultation`으로 이동.

8. **[P1 / 성능] ResizeObserver 5개 → WidgetCard 단일화 + Context 전파** — 위젯마다 별도 ResizeObserver 만들지 않도록.

9. **[P1 / 스멜] 매직 넘버 → `INTERVALS` 상수 모음** — 14곳 인터벌 단일 출처. CLAUDE.md "TypeScript strict + any 금지" 정신과 부합.

10. **[P1 / 에러] `EventPopup.checkAlerts`/`MessageBanner.setMessage` try-catch + Toast** — 사일런트 실패가 가장 직접적인 사용자 영향이 큰 두 핸들러부터 처리.

---

## Negative findings (확인됨, 문제 없음)

- ✅ `console.log/error/warn` 0건 (production-clean).
- ✅ `dangerouslySetInnerHTML` 0건 (RealtimeWall 외 본 범위).
- ✅ alias 위젯 6종 (`TodayClass`/`Events`/`TodoWidget`/`Memo`/`Meal`/`StudentRecords`) 진짜 1-line 별칭 — 중복 구현 없음.
- ✅ `DashboardPinGuard` 실사용 (memory note "미사용 의심" 부정).
- ✅ outside-click 리스너 cleanup 5곳 모두 정상 (`MessageBanner`, `EventPopup`, `WeatherForecastPopup`, `WidgetContextMenu`, `LayoutSelector`, `DashboardEvents.RangePicker`).
- ✅ setInterval cleanup 모두 정상.
- ✅ dnd-kit 자체 cleanup 처리됨.
- ✅ CLAUDE.md 한국어 텍스트 inline 정책 준수.
