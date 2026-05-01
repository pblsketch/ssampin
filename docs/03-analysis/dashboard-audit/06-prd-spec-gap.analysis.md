# Dashboard + Widget Mode: PRD/SPEC ↔ Implementation Gap Analysis

**Analysis Date**: 2026-05-01
**Working Dir**: `e:\github\ssampin`
**Scope**: 메인 대시보드(`/`) + 위젯 모드(별도 BrowserWindow)
**Reference**: PRD.md (FR-DASH/FR-WIDGET/FR-MSG/FR-EVT/FR-MEMO/FR-TODO/FR-TT — 48개 매치) + SPEC.md + design examples × 5 + 메모리
**Match Rate**: **약 60%** (메모리 기준 90% 미달 → pdca-iterator 발동 권고)

---

## A. 메인 대시보드 (FR-DASH-01 ~ 07) 갭

| ID | PRD 요건 | 구현 위치 | 충족도 | 갭 |
|---|---|---|:---:|---|
| **FR-DASH-01** | `M월 D일 (요일)` + `HH:MM` 초 단위 갱신 | `src/adapters/components/Dashboard/Clock.tsx:7-8` | ✅ | `useClock`이 매초 `setNow(new Date())` |
| **FR-DASH-02** | 날씨 아이콘+최저/최고기온+습도+미세먼지/초미세먼지 | `src/adapters/components/Dashboard/WeatherBar.tsx:73-104` | ⚠️ | "초미세먼지(PM2.5)"는 별도 표시 없이 `airQuality` 단일 등급으로 통합. PRD는 두 값(미세 4 / 초미세 4) 분리 명시 |
| **FR-DASH-03** | 메시지 클릭 → 인라인 편집 / Enter 저장 / Esc 취소 | `src/adapters/components/Dashboard/MessageBanner.tsx:191-240` | ✅ | 정확히 구현됨 |
| **FR-DASH-04** | **5열(월~금)×N행(교시) 격자** + 오늘 요일 강조 + 현재 교시 셀 노란색/초록색 하이라이트 | `src/adapters/components/Dashboard/DashboardTimetable.tsx:14-180` | ❌ | **메인 대시보드의 DashboardTimetable은 5×N 격자가 아니라 "한 날(viewDate)"의 교시별 리스트**. 5×N 격자는 `src/widgets/items/WeeklyTimetable.tsx`로 별도 분리 |
| **FR-DASH-05** | 학교 교육활동 계획 날짜순 + 일정 타입별 색상 + 이번 달~다음 달 범위 | `src/adapters/components/Dashboard/DashboardEvents.tsx:155-339` | ⚠️ | 날짜순 + 카테고리 컬러 도트는 ✅. 다만 "이번 달~다음 달"이 아니라 `rangeDays` 7/14/30/60/90/365 사용자 선택형 |
| **FR-DASH-06** | D-Day 카운트다운 배지 (예: "D-18 중간고사") | `src/adapters/components/Dashboard/DashboardEvents.tsx:55-61, 78-83` | ✅ | `calculateDDay`로 `D-N` 배지 표시 |
| **FR-DASH-07** | 교시 시간(1교시 8:50~9:30 등)을 시간표 하단 표시 | `DashboardTimetable.tsx:272-276, 349-353` | ⚠️ | **하단 한 곳에 모아 표시하는 게 아니라**, 각 교시 행 우측에 `pt.start~pt.end`가 인라인으로 붙음 |

**메인 대시보드 점수**: 7개 중 ✅ 3 / ⚠️ 3 / ❌ 1 → **64%**

---

## B. 위젯 모드 (FR-WIDGET-01 ~ 07) 갭 ★ 최우선

| ID | PRD 요건 | 구현 위치 | 충족도 | 갭 |
|---|---|---|:---:|---|
| **FR-WIDGET-01** | 풀 앱 ↔ 위젯 모드 전환 버튼 (타이틀바 또는 트레이) | `electron/main.ts:651-662` (트레이) + `electron/main.ts:601-611` (X 버튼) + `WidgetContextMenu.tsx:55-56,67` (위젯→풀앱) | ⚠️ | **풀 앱 → 위젯 진입 버튼이 메인 대시보드/사이드바에 없음**. Sidebar/DashboardHeader에 전환 버튼 없음. 진입 경로는 (1) 트레이 더블클릭 (2) X 버튼 + `closeToWidget=true` 설정 (3) 시작 시 자동뿐. **발견 가능성 매우 낮음** |
| **FR-WIDGET-02** | 자유 리사이즈, 기본 350×500px, 최소 280×350px, 최대 무제한, 마지막 크기 기억 | `electron/main.ts:956-967`, `Widget.tsx:349-409` | ❌ | **PRD 위반 다수**:<br>1. **기본 크기 380×650** (PRD: 350×500) — `useSettingsStore.ts:38-39`<br>2. **최소 크기 640×480** (PRD: 280×350) — `electron/main.ts:961-962` `minWidth: 640, minHeight: 480`<br>3. `resizable: false` (electron/main.ts:967)이지만 JS 핸들로 우회. 표준 OS 리사이즈는 막혀있음<br>4. 위치/크기 기억은 `widget-bounds.json`에 저장 ✅ |
| **FR-WIDGET-03** | 표시 항목: 날짜/시계, 날씨, 오늘 시간표(현재 교시 강조), 다가오는 일정 2~3개 | `Widget.tsx:178-347` 그리드 + `useDashboardConfig.ts` 32개 위젯에서 사용자 선택 | ⚠️ | **PRD가 명시한 "기본 노출 4종 핵심 정보"가 강제되지 않음**. 시계+날씨는 헤더에 항상 박힘, 시간표/일정은 사용자 활성화 의존 |
| **FR-WIDGET-04** | 배경 투명도 슬라이더 0~100%, 기본 80%, 우클릭 컨텍스트 메뉴에서 조절 | `WidgetContextMenu.tsx:177-205`, `electron/main.ts:1477-1482`, `useSettingsStore.ts:41` `opacity: 0.8` | ⚠️ | 기본 80% ✅, 컨텍스트 메뉴 슬라이더 ✅, 다만 **범위가 20~100%** (`WidgetContextMenu.tsx:194-195` `min={20} max={100}`), PRD는 0~100% |
| **FR-WIDGET-05** | **Always on Top 기본 활성화** | `electron/main.ts:966` `alwaysOnTop: false`, `useSettingsStore.ts:46` `desktopMode: 'normal'`, `electron/main.ts:1000-1004` | ❌ | **PRD 명백히 위반**. `desktopMode` 기본값이 `'normal'`이고, 이때 `setAlwaysOnTop(false)`. 사용자가 설정에서 변경하지 않으면 **다른 창에 가려짐** |
| **FR-WIDGET-06** | 바탕화면 위치 기억 | `electron/main.ts:476-499`, `electron/main.ts:929-953` | ✅ | 정확히 구현, 다중 모니터 검증까지 포함 |
| **FR-WIDGET-07** | 더블클릭 시 풀 앱 모드 전환 | `Widget.tsx:152-157` `handleHeaderDoubleClick → toggleWidget`, `electron/main.ts:1359-1372` | ✅ | 헤더 영역 더블클릭 → 위젯 destroy + 메인창 복원 |

**위젯 모드 점수**: 7개 중 ✅ 2 / ⚠️ 3 / ❌ 2 → **50%**

---

## C. SPEC.md 아키텍처/데이터 요건

| 항목 | SPEC | 구현 | 충족도 |
|---|---|---|:---:|
| 데이터 저장 경로 `app.getPath('userData')/data/` JSON | SPEC.md:533-535 | `electron/main.ts` `getDataDir()` + `IStoragePort` 추상화 | ✅ |
| `Settings.widget` 인터페이스 (`size`, `minSize:{280,350}`, `position`, `resizable:true`, `alwaysOnTop`) | SPEC.md:562-571 | `src/domain/entities/Settings.ts` (`widget.width/height/opacity/desktopMode/layoutMode/visibleSections/cardOpacity/closeToWidget`) | ❌ SPEC v0.2 시점이고 코드는 훨씬 진화. SPEC 갱신 필요 |
| 두 윈도우 간 데이터 동기화 (IPC) | SPEC.md (전체) | `data:changed` IPC로 모든 store 리로드 + 양쪽 윈도우 broadcast | ✅ |
| 위젯 설정 저장 위치 | (SPEC 미명시) | localStorage `ssampin-dashboard-config` (`useDashboardConfig.ts:7`) | ⚠️ SPEC 없음, GDrive Sync 통합 필요 |
| `Settings.widget.alwaysOnTop` 필드 | SPEC.md:570 | `useSettingsStore.ts:43` 존재하나 위젯 창에 미사용 (`desktopMode`로 대체) | ❌ Dead field |

---

## D. PRD에 있는데 대시보드/위젯 표현 누락

| 영역 | PRD | 대시보드/위젯 표현 | 갭 |
|---|---|---|---|
| **시간표 학급/교사 모드 전환 (FR-TT-01)** | 탭으로 전환 | `DashboardTimetable.tsx:131-148` 탭 ✅ | OK |
| **시간표 5열×N행 + 행사주별 표시 (FR-TT-02/04)** | 격자 + 현재 교시 셀 하이라이트 | DashboardTimetable은 1일치 리스트, WeeklyTimetable 위젯이 격자 | ⚠️ 메인 대시보드 기본 화면이 격자가 아님 |
| **행사 팝업 알림 D-Day/D-1/D-3 (FR-ALERT-01~05)** | 앱 시작 시 모달 | `EventPopup.tsx:94-203` + `App.tsx:935` `<EventPopup />` ✅ | 다만 PRD FR-ALERT-04 "같은 날 재실행 시 재표시 안 함" — `dismissPopup`/`snoozePopup` + 1시간 후 재알림은 PRD에 없는 추가 기능 |
| **담임 메모장 대시보드 위젯 "오늘 기록 N건" (FR-STMEMO-09)** | 미리보기 위젯 | `DashboardStudentRecords.tsx`(269) + `student-records` 등록 ✅ | OK |
| **포스트잇 메모 4가지 색상 (FR-MEMO-01)** | 노랑/분홍/연두/하늘 | `DashboardMemo.tsx:8-27` 4색 매핑 ✅ | OK |
| **투두리스트 진행률 바 (FR-TODO-04)** | 완료수/전체수 시각화 | `DashboardTodo.tsx`(전체 352) — 진행률 표시 확인 필요 | ⚠️ Todo 위젯 내 진행률 바 명시적 검증 미완 |
| **투두리스트 "오늘 할일" 위젯 최대 5개 (FR-TODO-07)** | 5개 제한 | `DashboardTodo.tsx:12` `MAX_VISIBLE = 20` | ❌ PRD 위반 |
| **오늘의 메시지 빈 상태 플레이스홀더 (FR-MSG-03)** | "클릭하여 메시지를 입력하세요..." | `MessageBanner.tsx:305` 정확히 같은 문구 ✅ | OK |
| **오늘의 메시지 자동 메시지 v2.0 (FR-MSG-05)** | 모든 수업 끝나면 자동 메시지 | 코드에 자동 메시지 로직 미발견 | ⚠️ v2.0.0 릴리즈됐는데 미구현 |

---

## E. 구현됐는데 PRD/SPEC에 없거나 차이나는 것 (덧붙여진 기능)

| 영역 | 구현 위치 | PRD 누락 |
|---|---|---|
| **위젯 4종 레이아웃 모드** (full/split-h/split-v/quad) | `Widget.tsx:29 LAYOUT_CYCLE` + `electron/main.ts:1387-1451` | PRD 없음 |
| **WidgetContextMenu의 폰트 크기 조절 4단계** | `WidgetContextMenu.tsx:207-235` | PRD 없음 |
| **MessageBanner 스타일 에디터** (아이콘 13종/색상 7종+커스텀/부제목/테마 연동) | `MessageBanner.tsx:11-176` | PRD FR-MSG-04는 "이모지 지원"만 — 매우 풍부하게 확장됨 |
| **MessageBanner 접기/펼치기** | `MessageBanner.tsx:189, 200-207` | PRD 없음 |
| **WidgetSettingsPanel 편집 모드** | `WidgetSettingsPanel.tsx:97, 156, 205` (383) | PRD 없음 |
| **위젯 카테고리 탭바** | `Widget.tsx:163-171, WidgetTabBar` | PRD 없음 |
| **DashboardPinGuard PIN 보호** | `DashboardPinGuard.tsx` + `WidgetCard.tsx:6-16` | PRD 없음. 9개 feature 잠금 가능 |
| **위젯 32개 정의 — PRD 외 22개** | `src/widgets/registry.ts:27-373` | PRD 명시: 시계/날씨/시간표/일정/메시지/메모/투두 외 BookmarksWidget, DDayCounter, MiniCalendar, MemoFocus, FavoriteTools, ConsultationWidget, SurveyWidget, ImageSticker×4, TodayProgress, ClassTimetable 등 |
| **WidgetWeatherBar (위젯 전용)** | `WidgetWeatherBar.tsx` | SPEC 컴포넌트 트리에 없음 |
| **위젯 → 메인 페이지 IPC 네비게이션** | `electron/preload.ts:118-119` + `electron/main.ts:1374-1385` | SPEC 없음 |
| **카드 투명도 별도 (cardOpacity)** | `useSettingsStore.ts:42` | PRD 없음 |
| **재실행 시 위젯 모드 자동 시작** (`startInWidgetMode`) | `electron/main.ts:3050-3054` | PRD 없음 |
| **데스크톱 모드 (`normal`/`topmost`)** | `useSettingsStore.ts:46` | PRD는 binary `alwaysOnTop`만 명시 |
| **메모리 절약 모드** | `electron/main.ts:828-846, 1370` | PRD 없음 |
| **Win+D 복원 폴링** | `electron/main.ts:724~` | PRD 없음 |

---

## F. v2.0.0 신규 기능의 대시보드/위젯 통합도 (메모리 참조)

| v2.0.0 기능 | 대시보드/위젯 노출 | 통합도 |
|---|---|:---:|
| **실시간 담벼락 (RealtimeWall)** | 위젯 레지스트리에 RealtimeWall 위젯 **없음** | ❌ Tools 페이지에서만 접근 |
| **Quick Add (Ctrl+Alt+T/E/M/N/B)** | 대시보드 헤더에 진입 버튼 **없음**. 단축키만 동작 | ⚠️ |
| **CommandPalette (Ctrl+K)** | 글로벌 단축키만. 대시보드 UI 진입점 없음 | ⚠️ |
| **즐겨찾기 강화 (BookmarksWidget)** | `registry.ts:298-314` `bookmarks` 위젯 등록 | ✅ |
| **칠판 도형 14종** | 대시보드 진입점 없음 | ❌ Tools 페이지에서만 |
| **일정 Cal.com 스타일** | DashboardEvents는 리스트+카테고리 도트, MiniCalendar 위젯이 별도 | ⚠️ 기본 일정 위젯에는 미반영 |
| **PageHeader 통일 / 디자인 시스템 v3.2** | DashboardHeader는 PageHeader 미사용 | ⚠️ |
| **GDrive Sync 인프라** | 위젯 설정(localStorage)은 GDrive Sync 대상 아님 가능성 | ⚠️ 검증 필요 |

---

## G. design examples ↔ 코드 1:1 갭

### G.1 ssampin_main_dashboard
- **레퍼런스 라인 110**: `<h2 class="text-4xl font-bold text-white font-display mb-2">2월 27일 (금) 16:35</h2>` — 시계가 한 라인에 큰 폰트
- **코드 `Clock.tsx:7-8`**: `text-4xl font-bold text-sp-text font-display mb-2` ✅ 정확히 일치
- **레퍼런스 라인 111-117**: 날씨 4요소 아이콘+gap-4 dot separator → `WeatherBar.tsx:73-104` ✅ 일치
- **레퍼런스 라인 119+**: 메시지 배너 emerald 반투명 → `MessageBanner.tsx`는 테마/사용자 색상 7종 + 커스텀, 디자인보다 풍부 ⚠️

### G.2 ssampin_compact_desktop_widget ★
- **레퍼런스 라인 48**: `w-[380px] h-[650px]` ✅ `useSettingsStore.ts:38-39 width:380, height:650` 일치
- **레퍼런스 라인 50-58**: 헤더는 좌측 push_pin "쌤핀" + 우측 open_in_full 단일 버튼
- **코드 `Widget.tsx:189-277`**: 헤더가 중앙 날짜+시간 + 우측에 4개 버튼(refresh/edit/grid/expand). **레퍼런스보다 훨씬 복잡** ⚠️
- **레퍼런스 라인 64-71**: 시계+날씨가 둥근 알약 모양 박스. **코드는 알약 박스 아니라 평평한 헤더** ⚠️
- **레퍼런스 라인 80-120**: 시간표가 세로 리스트 + 현재 교시(2교시) `bg-amber-500/10 border border-amber-500/20` 강조
- **코드 `DashboardTimetable.tsx:248-280`**: 동일한 세로 리스트 + `border-l-4 border-sp-highlight bg-sp-highlight/15` ✅ 매우 유사
- **레퍼런스 라인 124-153**: 일정이 colored dot + MM/DD + 제목 + (D-Day는 push_pin 빨강 + D-N) → `DashboardEvents.tsx:64-91` 거의 일치 ✅
- **레퍼런스 라인 184-205**: 메모가 yellow/pink **2-column grid** → `DashboardMemo.tsx`는 동적 LayoutMode ⚠️ 더 복잡

### G.3 ssampin_widget_context_menu ★
- **레퍼런스 라인 95**: `acrylic-panel rounded-xl text-slate-200` width 280px
- **코드 `WidgetContextMenu.tsx:78-80`**: `w-56 bg-sp-card/75 backdrop-blur-xl rounded-xl border border-sp-border/50 shadow-2xl` width 224px **vs 레퍼런스 280px** ⚠️
- **레퍼런스 라인 102-109**: 첫 메뉴 항목 "**항상 위에 표시**" + checkmark 토글
- **코드 `WidgetContextMenu.tsx:99-133`**: 첫 항목이 "**레이아웃**" 4종 라디오. **PRD FR-WIDGET-05의 always-on-top 토글이 컨텍스트 메뉴에 없음** ❌
- **레퍼런스 라인 112-116**: "전체 화면으로 전환" → `WidgetContextMenu.tsx:160-172` ✅
- **레퍼런스 라인 119+**: 투명도 슬라이더 → `WidgetContextMenu.tsx:177-205` ✅ 거의 일치

### G.4 ssampin_event_alert_popup
- 레퍼런스: D-Day 배지 + 확인 버튼 단일
- **코드 `EventPopup.tsx:94-203`**: 확인 + "다시 알림 (1시간 후)" 두 버튼. 1시간 snooze는 PRD/디자인 모두 없는 추가 기능 ⚠️

### G.5 ssampin_weekly_timetable_screen
- 5×N 격자 시간표
- **코드 `WeeklyTimetable.tsx:117-180`**: 5×N 격자 + 현재 교시/요일 강조 ✅ — 다만 메인 대시보드(`/`)가 아니라 위젯으로만 노출

---

## Top 10 갭 우선순위

| # | 갭 | 우선순위 | 영향도 |
|---|---|:---:|:---:|
| 1 | FR-WIDGET-05 Always on Top 기본 비활성화 — `desktopMode: 'normal'` | P0 | High (위젯 본질 침해) |
| 2 | FR-WIDGET-02 최소 크기 640×480 (PRD: 280×350) | P0 | High (소형 위젯 불가) |
| 3 | FR-WIDGET-01 풀 앱 → 위젯 진입 버튼 부재 (사이드바/헤더에 없음) | P0 | High (발견성) |
| 4 | FR-DASH-04 메인 대시보드 5×N 격자 누락 (1일 리스트로 대체) | P0 | High (PRD 핵심 시각화 변경) |
| 5 | 위젯 컨텍스트 메뉴에 Always on Top 토글 없음 (디자인 레퍼런스 위반) | P1 | Medium |
| 6 | FR-WIDGET-04 투명도 0~100% (코드 20~100%) | P1 | Low (UX 결정으로 합리적) |
| 7 | FR-TODO-07 "오늘 할일 최대 5개" → 코드 20개 | P1 | Low |
| 8 | v2.0.0 RealtimeWall 위젯 통합 없음 | P2 | Medium |
| 9 | SPEC.md `Settings.widget` 인터페이스 코드와 큰 차이 | P2 | Medium (문서 부채) |
| 10 | DashboardHeader에 Quick Add / CommandPalette 진입점 없음 | P2 | Low |

---

## Match Rate 산정

**PRD 핵심 요건 (FR-DASH-01~07 + FR-WIDGET-01~07 = 14개)**:
- ✅ 완전: 5개 (FR-DASH-01, 03, 06; FR-WIDGET-06, 07)
- ⚠️ 부분: 6개 (FR-DASH-02, 05, 07; FR-WIDGET-01, 03, 04)
- ❌ 누락: 3개 (FR-DASH-04; FR-WIDGET-02, 05)

**Match Rate (가중치 ⚠️=0.5)**:
(5 × 1.0 + 6 × 0.5 + 3 × 0.0) / 14 = **8.0 / 14 = 57.1%**

**부수 요건 포함 종합**: **약 60%**

> 메모리 기준 90% 이상 합격선 → **미달, pdca-iterator 발동 추천**

---

## 권고 액션

**즉시 수정 (P0)**:
1. `useSettingsStore.ts:46` `desktopMode: 'normal'` → `'topmost'` 변경 (또는 PRD 갱신)
2. `electron/main.ts:961-962` `minWidth/minHeight` 280×350 또는 PRD 갱신
3. `DashboardHeader.tsx`에 위젯 모드 전환 버튼 추가
4. WeeklyTimetable을 기본 노출 또는 PRD에 "1일 리스트" 명시

**문서 갱신 (PDCA Update)**:
- PRD.md FR-WIDGET-04 0~100% → 20~100%
- PRD.md FR-TODO-07 5개 → 20개
- PRD.md FR-DASH-02 미세/초미세 분리 → 단일 등급
- SPEC.md `Settings.widget` 인터페이스 v2.0 코드 반영
- SPEC.md 컴포넌트 트리에 Widget/, WidgetTabBar, WidgetSettingsPanel, MiniCalendar, DashboardPinGuard 추가
- v2.0.0 신규 기능 (RealtimeWall, Quick Add, CommandPalette) 대시보드 진입점 PRD에 추가
