# 대시보드 + 위젯 모드 디자인/UX Audit

- **대상**: 메인 대시보드(`/`) + 위젯 모드(별도 BrowserWindow)
- **기준**: 디자인 시스템 v3.2 (Audit 90/100), `design examples/` Google Stitch 레퍼런스, PRD FR-WIDGET-01~07
- **방법**: 레퍼런스 5종 HTML과 구현 컴포넌트 1:1 비교 + sp-* 토큰/임의 색상/z-index/라운드 정책 grep 전수
- **분석일**: 2026-05-01

---

## A. 디자인 레퍼런스 재현도

### A-1. ssampin_main_dashboard 비교

레퍼런스(`design examples/ssampin_main_dashboard/code.html`)는 **3+2 그리드 카드 구성**(시간표 / 좌석배치 / 일정 / 메모 / 할일)에 헤더가 시계 + 날씨 + 성공 배너로 분리된 단일-패널 대시보드. 현재 구현은 **유연한 위젯 그리드 시스템**(`WidgetGrid` + 32개 위젯 + DnD + 4 카테고리 필터 + 편집 모드 사이드 패널)으로 **레퍼런스보다 훨씬 확장된 형태**다. 즉 "디자인 예시 1:1 재현"이 아니라 "예시를 베이스로 한 v3.2 시스템"으로 진화한 상태.

| 디자인 요소 | 레퍼런스 | 현재 구현 | 갭 | 심각도 |
|---|---|---|---|---|
| 헤더 시계 폰트 | `text-4xl font-bold text-white font-display` | `text-4xl font-bold text-sp-text font-display` (`Clock.tsx:7`) | 일치 (sp-text로 토큰화) | OK |
| 날씨 라인 구조 | "온도 · 습도 · 미세먼지" 가로 + dot 구분자 | 동일 + condition + forecast chevron 추가 (`WeatherBar.tsx:73-103`) | 우월 | OK |
| 성공 배너 위치 | 헤더 우측 max-w-lg 카드형 (`code.html:120-128`) | `MessageBanner.tsx`로 분리 — 인라인 편집·아이콘/색상 프리셋 13종+7종 | 디자인 의도(축하 정적 배너)보다 기능 과다 | P2 |
| 카드 그리드 | 3컬럼 등분 + 하단 6/6 (`grid-cols-12`) | `grid-cols-4 grid-flow-row-dense` + colSpan 1~4 가변 (`WidgetGrid.tsx:144`) | 시스템적 우월 | OK |
| 카드 라운드 | `rounded-2xl` (16px) | `rounded-xl` (12px, `DashboardTimetable.tsx:127` 등 모든 카드) | **레퍼런스 대비 4px 작음** | P2 |
| 시간표 현재 교시 | `bg-amber-500/10 border-l-4 border-amber-500` (`code.html:157`) | `border-l-4 border-sp-highlight bg-sp-highlight/15 ring-2 ring-sp-highlight/30 shadow-md shadow-sp-highlight/15 + animate-pulse dot` (`DashboardTimetable.tsx:253`) | 우월 — sp-highlight 토큰화 + 펄스 점 추가 | OK |
| 시간표 헤더 행(교시/과목/장소) | 표 헤더 라벨 (`code.html:146-150`) | 라벨 없음, 바로 행 시작 | 정보 위계 약함 | P3 |
| 좌석 배치 카드 | 6×6 grid + "교탁" 배지 (`code.html:184-234`) | 위젯 `Seating`로만 존재, 메인 대시보드 기본 노출 X | 레퍼런스가 일등 시민이지만 위젯 기본 프리셋에서 빠질 수 있음 | P2 |
| 일정 일정 위계 | 요일 칠판 + 원형 날짜 배지 + 컬러 left-border (`code.html:246-285`) | `DashboardEvents.tsx:64`는 단순 dot + MM/DD + 제목 1줄 압축 | 레퍼런스가 더 시각적, 현재는 정보밀도형 | P2 |
| D-Day 배지 | `D-18 중간고사` 빨간 pill (`code.html:242-244`) | `text-sp-highlight` 단일 텍스트 (`DashboardEvents.tsx:79`) | 강조 약함 (배지 vs 인라인 텍스트) | P2 |
| 메모 (포스트잇) | `bg-[#fef9c3] rotate-1 hover:rotate-0` 종이질감 (`code.html:303-332`) | `bg-yellow-400/20 border-yellow-400/30` 다크 카드 톤 (`DashboardMemo.tsx:9-12`) | 다크 톤 통일 의도지만 **포스트잇 메타포 사라짐 — rotate/그림자/필기체 없음** | P1 |
| 메모 폰트 | `font-handwriting` 손글씨 | 본문 폰트 그대로 | 메타포 손실 | P2 |
| 할일 진행률 바 | `w-full bg-slate-800 rounded-full h-2` (`code.html:349`) | 진행률 바 없음, "1/3 완료" 텍스트만 (`DashboardTodo.tsx:182`) | 시각 피드백 누락 | P1 |
| 할일 카테고리 라벨 | `bg-blue-500/10 text-blue-300` 컬러 태그 (`code.html:367`) | 우선순위 dot + 마감일 텍스트만, 카테고리 라벨 없음 | 정보 분류 약함 | P2 |
| 할일 체크박스 | `material-symbols check_circle / radio_button_unchecked` (`code.html:355-364`) | 커스텀 SVG check (`DashboardTodo.tsx:332-348`) | 일치도 OK | OK |
| 폰트 패밀리 | `Lexend, Noto Sans KR` (`code.html:24`) | `Pretendard Variable, Pretendard, Noto Sans KR` (`tailwind.config.js:43`) | 자체 시스템 우선 — Pretendard는 v3.2 정식 채택 | OK |

**총평**: 레퍼런스의 정적 5-카드 레이아웃을 **위젯 시스템으로 추상화한 것은 v3.2 진화로 적절**. 다만 **포스트잇 메타포 / 할일 진행률 바 / D-Day 배지 / 일정 시각 위계** 4가지는 레퍼런스가 의도한 "감정/생활감" 디자인 디테일이 깎여 정보 밀도형으로 단조화됨.

### A-2. ssampin_compact_desktop_widget 비교

레퍼런스(`design examples/ssampin_compact_desktop_widget/code.html`)는 **380×650 단일 컬럼 스크롤** 위젯. 핵심 특징: ① 중앙 정렬 시계(`text-5xl font-bold tracking-tighter`), ② 섹션 카드 없이 **구분선만으로 단을 나누는 미니멀 본문**, ③ `bg-[#0f172a]/80 backdrop-blur-md rounded-2xl shadow-2xl`, ④ 하단 그라디언트 페이드.

| 디자인 요소 | 레퍼런스 | 현재 구현 | 갭 | 심각도 |
|---|---|---|---|---|
| 컨테이너 | `bg-[#0f172a]/80 backdrop-blur-md` 단일 컬럼 (`code.html:48`) | `backdrop-blur-md` + `rgba(var(--sp-widget-rgb), opacity)` (`Widget.tsx:181-187`) | 토큰화 OK, 배경 투명도 동작 | OK |
| 헤더 | "쌤핀 + push_pin + open_in_full" 좌우 (`code.html:50-58`) | "날짜+시간 중앙" + 우상단 4-버튼 그룹(refresh/edit/grid_view/open_in_full) (`Widget.tsx:189-277`) | **헤더 정보 밀도 차이 큼** — 레퍼런스는 브랜드+1버튼, 현재는 시계+4버튼 | P2 |
| 시계 | `text-5xl font-bold tracking-tighter my-2` (`code.html:64`) | `text-4xl font-bold tracking-tight leading-none` (`Widget.tsx:200-202`) | **1단계 작음** (-1 size). tracking 차이도 있음 | P2 |
| 본문 카드 시스템 | 카드 없음, `<section> + <div class="border-t mx-4">` 구분선만 (`code.html:79,122,154,183`) | 모든 위젯이 `bg-sp-card rounded-xl p-4` 카드 (예: `DashboardEvents.tsx:242`) | **레퍼런스 미니멀 의도 vs 현재 카드 더미 — 위젯 모드 정체성 약화** | P1 |
| 시간표 표현 | "1교시 / 국어 / 3-2" 한 줄 폰트 모노 (`code.html:88-119`) | 동일 패턴 + 현재 교시 highlight + 도트 추가 (`DashboardTimetable.tsx:248-280`) | 우월 | OK |
| 일정 dot+날짜+제목 | 한 줄 (`code.html:131-152`) | 동일 (`DashboardEvents.tsx:64-91`) | 일치 | OK |
| 메모 | 노랑/핑크 포스트잇 2-grid `min-h-[80px]` + hover translate-y (`code.html:192-205`) | 다크 톤 메모 1~9개 ResizeObserver 동적 컬럼 (`DashboardMemo.tsx`) | 메타포 손실 동일 | P1 |
| 하단 페이드 | `bg-gradient-to-t from-[#0f172a]/90 to-transparent h-8` (`code.html:209`) | 없음 | 스크롤 끝 시각 단서 누락 | P3 |
| **배경 투명도 슬라이더** | 컨텍스트 메뉴 안에 슬라이더 0~100% (`ssampin_widget_context_menu/code.html:120-135`) | `WidgetContextMenu.tsx:191-204` **min=20 max=100 step=5 — 0~20 범위 잘림** | **PRD FR-WIDGET-04 "0~100%" 명세 위반** | P0 |

**총평**: 위젯 모드는 **카드 중첩(헤더+위젯카드+위젯그리드+위젯내부)으로 시각 노이즈가 레퍼런스보다 많음**. 레퍼런스 미니멀리즘 의도가 약해졌고, **투명도 하한이 20%로 잘려 있어 PRD 0% 명세를 정면으로 어김**.

### A-3. ssampin_widget_context_menu 비교

레퍼런스(`design examples/ssampin_widget_context_menu/code.html`)는 **acrylic-panel** 효과(`backdrop-filter: blur(20px) saturate(125%)`) + 280px 폭 + 6개 메뉴(항상위/전체화면/투명도/크기/설정/닫기).

| 디자인 요소 | 레퍼런스 | 현재 구현 | 갭 | 심각도 |
|---|---|---|---|---|
| 패널 폭 | 280px (`code.html:95`) | 224px (w-56) (`WidgetContextMenu.tsx:78`) | **56px 좁음**, 슬라이더 노브가 좁아짐 | P3 |
| acrylic 효과 | `backdrop-filter: blur(20px) saturate(125%)` 명시 | `backdrop-blur-xl` + `bg-sp-card/75` | saturate 누락이지만 시각적으로는 근접 | OK |
| 메뉴 헤더 | "SsamPin Menu" uppercase tracking-wider (`code.html:97`) | 동일 (`WidgetContextMenu.tsx:84`) | 일치 | OK |
| **첫 항목** | "항상 위에 표시" 토글 (`code.html:102-109`) | **항목 없음** — 대신 4-레이아웃 라디오 (`WidgetContextMenu.tsx:99-133`) | **PRD FR-WIDGET-05 "Always on Top 기본 활성화"가 메뉴에서 토글 불가**. createWidgetWindow는 `desktopMode`로만 변경 가능 | P0 |
| 투명도 슬라이더 | `min=0 max=100 width:70%` 시각 트랙 (`code.html:127-133`) | `min=20 max=100 step=5` (`WidgetContextMenu.tsx:194-196`) | **min=20 → PRD 0% 명세 위반** | P0 |
| 임의 색상 사용 | sp 토큰화된 acrylic | `linear-gradient(to right, #3b82f6 ..., #334155 ...)` 하드코드 (`WidgetContextMenu.tsx:201`) | sp-accent / sp-border 토큰 미사용 → **테마 변경 시 하드코드 색이 새는 회귀** | P1 |
| 활성 라디오 색상 | 청색 acrylic | `bg-blue-500/15 text-blue-400`, `border-blue-400` 하드코드 (`WidgetContextMenu.tsx:113,123,125,227`) | sp-accent 미사용 — **다크 외 테마에서 시각 회귀** | P1 |

### A-4. ssampin_event_alert_popup 비교

| 디자인 요소 | 레퍼런스 | 현재 구현 | 갭 | 심각도 |
|---|---|---|---|---|
| 모달 폭 | `max-w-[480px]` | 동일 (`EventPopup.tsx:113`) | OK | OK |
| 헤더 이모지+제목 | "🔔 + 오늘 행사 알림!" (`code.html:53-55`) | 동일 (`EventPopup.tsx:117-120`) | 일치 | OK |
| 카테고리 아이콘 | `material-symbols verified_user/diversity_3/forest` 컬러별 (`code.html:71,82,99`) | 동일 mapping (`EventPopup.tsx:9-17`) | 일치 | OK |
| 카테고리 색상 | 컬러 토큰별 sp-card 배경 | `getColorsForCategory()` presenter 통과 | 우월 | OK |
| Upcoming 섹션 D-Day | `D-3 / D-7` ring-1 ring-inset 컬러 pill (`code.html:124,132`) | `DDayBadge` 컴포넌트, urgent(<=3)는 red, else orange (`EventPopup.tsx:40-53`) | 일치 + 토큰화 | OK |
| z-index | (실 PRD 없음) | `z-50` (`EventPopup.tsx:109,112`) — z-sp-modal 토큰 미사용 | **v3.2 z-sp-modal=50 토큰 우회** | P2 |

### A-5. ssampin_weekly_timetable_screen 비교

대시보드 범위가 아니라 시간표 페이지지만, 위젯 `WeeklyTimetable`이 같은 정보를 표시하므로 비교.

| 디자인 요소 | 레퍼런스 | 현재 구현 | 갭 | 심각도 |
|---|---|---|---|---|
| 과목 컬러 시스템 | `subject-blue/green/purple/...` 9종 (`code.html:24-33`) | `getCellWidgetStyle()` presenter — sp-* 외 일반 Tailwind (`timetablePresenter.ts`) | 일치도는 OK이나 토큰화 정도는 다름 | OK |
| 현재 교시 highlight | (별도 명시 없음) | `ring-2 ring-sp-highlight + shadow-sm + animate-pulse dot` (`WeeklyTimetable.tsx:171-178`) | 우월 | OK |

---

## B. 디자인 토큰 일관성

### B-1. 임의 컬러 사용 (sp-* 외)

| 종류 | 위반 횟수 | 대표 위치 5개 |
|---|---|---|
| **slate-/gray- 클래스** | Dashboard 폴더 8 files / 45건, Widget 1 files / 6건, widgets 11 files / 35건 | `MessageBanner.tsx:72,74,75,82,91,107,115,135-147,156,164,171` (라이트 모달 — 다크 위젯과 불협) · `WidgetContextMenu.tsx:113,123,125,227` (`bg-blue-500/15 text-blue-400`) · `Widget.tsx:233,251` (`bg-sp-accent/20 text-sp-accent`은 OK이나 일부 라인은 `bg-blue` 직접 사용) · `ImageStickerWidget.tsx:122,128` (`bg-white/90 text-gray-700`) · `WidgetSettingsPanel.tsx:163` (translate value인데 grep 노이즈) |
| **하드코드 hex** | Dashboard 8건 / Widget 1건 | `MessageBanner.tsx:28-34` (`#10b981`,`#3b82f6`,`#8b5cf6`,`#f59e0b`,`#f43f5e`,`#64748b`,`#14b8a6`) · `MessageBanner.tsx:59,145` (`#3b82f6` fallback) · `WidgetContextMenu.tsx:201` (`#3b82f6, #334155` 슬라이더 트랙) |
| **카테고리·우선순위 컬러** (도메인 의미) | 다수, 의도된 사용 | `DashboardStudentRecords.tsx:150-163` (출석/결석/지각/조퇴 4색), `DashboardTodo.tsx:240-249` (지남/오늘/내일 마감 컬러), `EventPopup.tsx:43-44,162` (D-Day urgency) — **이건 sp-status-* 토큰을 새로 만들어 흡수해야 회귀 안전** |

### B-2. arbitrary fontSize / 인라인 style fontSize

| 종류 | 위반 횟수 | 대표 위치 |
|---|---|---|
| `text-[Npx]` | Dashboard 0건 (이미 codemod 통과) | — |
| 인라인 `style={{fontSize}}` | Dashboard 2건 + Widget 16건 + widgets 6건 = **24건** | `MessageBanner.tsx:272,343` · `Widget.tsx:222,240,259,272,283` (헤더 4 버튼) · `WidgetContextMenu.tsx:93,148,167,182,212,247,261` (메뉴 모든 아이콘) · `LayoutSelector.tsx:148` · `WidgetWeatherBar.tsx:42,49,56` · `MiniCalendar.tsx:222` |

24건 모두 `material-symbols-outlined` 아이콘 크기 — `text-icon`/`text-icon-md`/`text-icon-lg` 토큰이 있는데도 인라인. v3.2 codemod 사각지대.

### B-3. z-index 위반

| 클래스 | 횟수 | 위치 |
|---|---|---|
| `z-50` | 4건 | `MessageBanner.tsx:72`(스타일 편집 드롭다운), `DashboardEvents.tsx:303` (전체보기 모달), `EventPopup.tsx:109,112` (오버레이+모달) |
| `z-50` (sortable drag) | 1건 | `SortableWidget.tsx:50` (드래그 중) |
| `z-[9999]` | 2건 | `WidgetContextMenu.tsx:78`, `LayoutSelector.tsx:97` |

총 7건. v3.2 토큰 정의(modal:50/toast:60/palette:70/dropdown:40/tooltip:80) 기준 **z-50→z-sp-modal**, **z-[9999]→z-sp-palette 또는 새로운 z-sp-context-menu** 정의 필요. 9999는 토큰 시스템 외부.

### B-4. 라운드 정책

- `rounded-sp-*` 사용: 0건 (정책 준수 OK)
- `rounded-[Npx]`: 0건
- `rounded-none`: 0건
- 모든 카드가 `rounded-xl`(12px) — **레퍼런스의 `rounded-2xl`(16px) 카드 의도와 4px 차이**. 현재 `--sp-card-radius` CSS 변수로 사용자 커스텀 가능(`SortableWidget.tsx:41,56`)이라 정책 자체는 위반 없음.

### B-5. focus-visible / 키보드 포커스링

- Dashboard 폴더 focus-visible 사용 2건만 (`DashboardEvents.tsx`, `MessageBanner.tsx`)
- Widget 폴더 0건
- widgets/ 폴더 1건 (`DDayCounter.tsx`)
- 대부분 버튼이 `focus:outline-none` 없이 브라우저 기본 outline 또는 hover 색상에만 의존 → **WCAG 2.4.7 키보드 포커스 가시성 미달**

---

## C. 시각 위계와 정보 구조

### [P1] 메시지 배너의 스타일 편집 드롭다운이 라이트 톤 — 다크 시스템과 불협

- **위치**: `src/adapters/components/Dashboard/MessageBanner.tsx:72-176`
- **현재**: 드롭다운 자체가 `bg-white border border-gray-200 ... text-gray-800 bg-gray-50 ... text-gray-500`로 구성. 12개 라인이 gray-50/100/200/300/400/500/600/700/800/900을 직접 사용.
- **문제**: 본 대시보드는 다크 디폴트(`--sp-bg: #0a0e17`)이므로, 흰색 카드가 갑자기 떠오르는 시각 단절. 라이트 테마에서는 정상이나 다크에서는 **테마 일관성 파괴**(v3.2 핵심 원칙 위반).
- **개선안**: 모든 색을 sp-* 토큰화 — `bg-sp-card`, `border-sp-border`, `text-sp-text`, `text-sp-muted`, hover는 `hover:bg-sp-text/5`. 현재 동일 컴포넌트의 메인 배너는 이미 토큰을 쓰고 있어 일관성 손실이 더 두드러짐.
- **레퍼런스**: `src/index.css:16-26` sp-* 정의

### [P1] 메모 위젯이 포스트잇 메타포를 잃음

- **위치**: `src/adapters/components/Dashboard/DashboardMemo.tsx:8-27`
- **현재**: `bg-yellow-400/20 border-yellow-400/30` 다크 카드. 회전·필기체·종이 그림자 없음.
- **문제**: 레퍼런스(`ssampin_main_dashboard/code.html:303-332`)는 `bg-[#fef9c3] rotate-1 hover:rotate-0 transition-transform font-handwriting shadow-sm`로 손맛+종이 메타포가 핵심 차별점. 현재는 일반 컬러 카드와 구분 안 됨.
- **개선안**: 다크에서도 메타포를 살리려면:
  ```tsx
  // 라이트 노트 톤 + 미세 회전 + 종이 그림자
  yellow: 'bg-yellow-100 text-yellow-900 shadow-sm rotate-[-1deg] hover:rotate-0',
  pink:   'bg-pink-100   text-pink-900   shadow-sm rotate-[1deg]  hover:rotate-0',
  // ...
  ```
  레퍼런스의 `dark:bg-yellow-200/90 text-yellow-900`도 한 방법.
- **레퍼런스**: `design examples/ssampin_main_dashboard/code.html:303` / `ssampin_compact_desktop_widget/code.html:193`

### [P1] 할일 위젯에 진행률 시각 피드백 없음

- **위치**: `src/adapters/components/Dashboard/DashboardTodo.tsx:175-187`
- **현재**: `{completedCount}/{totalCount} 완료` 텍스트만.
- **문제**: 레퍼런스(`code.html:349-351`)는 width % 진행률 바를 `mb-6` 위치에 배치 — "진척도가 한눈에" 가 핵심 가치 명제.
- **개선안**:
  ```tsx
  {totalCount > 0 && (
    <div className="w-full bg-sp-surface rounded-full h-1.5 mb-3">
      <div
        className="bg-sp-accent h-1.5 rounded-full transition-all duration-sp-base"
        style={{ width: `${(completedCount / totalCount) * 100}%` }}
      />
    </div>
  )}
  ```

### [P2] 일정 D-Day 강조가 텍스트 한 줄로 약함

- **위치**: `src/adapters/components/Dashboard/DashboardEvents.tsx:78-82`
- **현재**: `<span className="text-xs font-semibold text-sp-highlight">D-3</span>`
- **문제**: 레퍼런스(`code.html:242-244`)는 `bg-red-500/20 border border-red-500/30 text-red-400 px-3 py-1 rounded-full font-bold` pill — 시각 무게가 5배 차이. EventPopup.tsx의 `DDayBadge`가 더 나음(`EventPopup.tsx:40-53`)이므로 **EventPopup의 DDayBadge를 추출해 위젯에서도 재사용**.
- **개선안**: `common/DDayBadge.tsx`로 분리 → 위젯·팝업 양쪽에서 import.

### [P2] 시간표 헤더 행 라벨 누락

- **위치**: `src/adapters/components/Dashboard/DashboardTimetable.tsx:128-153`
- **현재**: 탭 + DateNavigator만, 표 헤더(교시/과목/장소) 없음.
- **문제**: 레퍼런스(`code.html:146-150`)는 `border-b border-slate-700/50` 헤더 행. 정보 그리드 의미를 첫 행이 잡아주는 게 표준.
- **개선안**: DateNavigator 아래에 한 줄 추가:
  ```tsx
  <div className="flex items-center px-3 py-1 text-detail text-sp-muted border-b border-sp-border/30">
    <span className="w-12">교시</span>
    <span className="flex-1">과목</span>
    <span className="text-right">장소</span>
  </div>
  ```

### [P2] 위젯 모드 카드 중첩 — 시각 노이즈

- **위치**: `src/adapters/components/Widget/Widget.tsx:181, 282`, 모든 widgets/items의 `rounded-xl bg-sp-card p-4`
- **현재**: ① 위젯 컨테이너(`backdrop-blur-md ... rounded-2xl border`) → ② 메시지 배너 카드(`bg-sp-accent/10 rounded-xl`) → ③ 위젯 그리드 → ④ 각 위젯이 다시 `rounded-xl bg-sp-card p-4` 카드. **카드 안의 카드 안의 카드**.
- **문제**: 레퍼런스(`ssampin_compact_desktop_widget/code.html`)는 본문이 카드 없이 **구분선만으로 섹션 분할**. 현재 구조는 시각 노이즈가 누적되어 미니멀 의도가 사라짐.
- **개선안**: 위젯 모드 한정 카드 스타일을 `border-0 bg-transparent`로 (또는 `widget-mode` 부모 selector로 위젯 카드의 bg/border 제거) — 메인 대시보드는 그대로 두고 **위젯 모드일 때만 카드를 평탄화**. 현재 `WidgetGrid.tsx:175-180`의 `border: var(--sp-card-border, ...)`는 CSS 변수라 위젯 모드에서 `--sp-card-border: none`만 덮어쓰면 한 줄로 가능.

### [P3] 빈 상태(empty state) 일관성 미흡

- 일정 비음: "등록된 일정이 없습니다" plain 텍스트 (`DashboardEvents.tsx:280`)
- 메모 비음: "메모가 없습니다" plain 텍스트 (`DashboardMemo.tsx:137`)
- 시간표 비음: "시간표가 등록되지 않았습니다" + 주말 메시지는 🎉 + "주말입니다" (`DashboardTimetable.tsx:206-213`)
- 할일 비음: "클릭하여 할 일을 추가하세요" + 클릭 가능 카드 (`DashboardTodo.tsx:191-196`)
- 위젯 빈 상태: 📌 + "표시할 위젯이 없습니다" + 가이드 문구 (`Widget.tsx:295-299`)

→ 일관 패턴 부재. **공통 EmptyState 컴포넌트** 신설 권장(아이콘 + 1차 메시지 + 2차 액션 가이드).

---

## D. 인터랙션·접근성

### [P1] MessageBanner — 클릭=편집 어포던스가 약함

- **위치**: `src/adapters/components/Dashboard/MessageBanner.tsx:243-348`
- **현재**: `cursor-pointer` + role/aria-label만. 시각 단서(연필 아이콘·hover edit hint·테두리 강조) 없음. 메시지가 비어있을 때만 `클릭하여 메시지를 입력하세요...` placeholder 표시.
- **문제**: 메시지 작성 후 다시 보면 클릭=편집임을 알기 어려움. 우상단 팔레트(`palette` 아이콘)는 색상 편집인데 메시지 편집 단서로 오인 가능.
- **개선안**: hover 시 우측에 `edit` 아이콘 등장:
  ```tsx
  <span className="material-symbols-outlined opacity-0 group-hover:opacity-60 transition-opacity text-icon">edit</span>
  ```
  + container에 `group` 추가 + `aria-label`을 "메시지 편집 — 클릭하세요"로 명료화.

### [P1] 위젯 컨텍스트 메뉴 발견 가능성 0

- **위치**: `src/adapters/components/Widget/Widget.tsx:142-145`, `WidgetContextMenu.tsx`
- **현재**: 우클릭으로만 진입. 헤더 4 버튼(refresh/edit/grid/expand) 어디에도 "메뉴" 또는 "more_vert" 진입점 없음. 레퍼런스(`ssampin_widget_context_menu/code.html`)는 컨텍스트 메뉴가 핵심 UX.
- **문제**: 신규 사용자는 우클릭이 가능한지 모름 → 투명도/항상 위에/닫기를 발견하기까지 시행착오 필요. WCAG 2.5.5(추가 버튼 제공)도 위반.
- **개선안**: 우상단 버튼 그룹에 `more_vert` 추가 → WidgetContextMenu를 오픈. 우클릭은 그대로 유지.

### [P0] 투명도 슬라이더 0~20% 영역 조작 불가능 (PRD 위반)

- **위치**: `src/adapters/components/Widget/WidgetContextMenu.tsx:194-196`
- **현재**: `<input type="range" min={20} max={100} step={5}>`
- **문제**: PRD FR-WIDGET-04 명시 "0~100%". electron main이 0% 까지 안전하게 처리(`main.ts:1480` `Math.max(0, Math.min(1, value))`)하므로 코드 차원 안전. 하한 20을 둔 의도(완전 투명 시 클릭 불가능 우려)는 이해되지만, 그 경우 **`min={0}` + 20% 미만에서는 시각 경고 + 마우스 hit-test용 미세 alpha 0.01 보강**이 정답(이미 `Widget.tsx:74-81`에서 hit-test 보강은 구현돼 있음).
- **개선안**:
  ```tsx
  <input type="range" min={0} max={100} step={5} ... />
  {/* opacity < 20일 때 경고 노출 */}
  {opacity < 0.2 && <p className="text-detail text-sp-highlight">너무 투명하면 위젯이 안 보일 수 있어요</p>}
  ```

### [P0] Always on Top 토글이 컨텍스트 메뉴에 없음 (PRD 위반)

- **위치**: `src/adapters/components/Widget/WidgetContextMenu.tsx:99-133`
- **현재**: 첫 항목이 4-레이아웃 라디오(`full / split-h / split-v / quad`). PRD FR-WIDGET-05 "Always on Top 기본 활성화"가 메뉴에서 토글 불가능.
- **electron 측**: `main.ts:966 alwaysOnTop: false` (창 생성 시), `main.ts:992-1006` `desktopMode === 'topmost'`일 때만 `setAlwaysOnTop(true)`. **PRD "기본 활성화"에 정면 위배**(현재 기본 normal).
- **문제**: 레퍼런스(`ssampin_widget_context_menu/code.html:102-109`)는 첫 메뉴가 "항상 위에 표시" 토글 + 활성 시 체크. PRD와 디자인 모두 일치하는데 구현만 빠짐.
- **개선안**: 컨텍스트 메뉴 첫 항목으로 push_pin 토글 추가:
  ```tsx
  <button
    onClick={() => {
      const newMode = (settings.widget.desktopMode === 'topmost') ? 'normal' : 'topmost';
      void update({ widget: { ...settings.widget, desktopMode: newMode } });
      window.electronAPI?.applyWidgetSettings({ opacity: settings.widget.opacity, desktopMode: newMode });
      onClose();
    }}
    className="..."
  >
    <span className="material-symbols-outlined">push_pin</span>
    <span>항상 위에 표시</span>
    {settings.widget.desktopMode === 'topmost' && (
      <span className="material-symbols-outlined text-sp-accent ml-auto">check</span>
    )}
  </button>
  ```
  추가로 `electron/main.ts:1083` 기본값 `'normal'` → `'topmost'`로 변경 (또는 settings 첫 부팅에서 마이그레이션).

### [P1] Always on Top 기본값 — PRD vs 구현 불일치

- **위치**: `electron/main.ts:1076-1088`
- **현재**: `readSettingsWidgetOptions()`이 `settings.widget?.desktopMode ?? 'normal'`로 기본 normal. 즉 **첫 부팅 위젯은 항상 위 비활성**.
- **문제**: PRD FR-WIDGET-05 "Always on Top 기본 활성화" 정면 위반. 사용자가 메뉴에서 토글하기 전까지 위젯은 다른 창에 가려짐.
- **개선안**: 기본값 `'topmost'`로 변경. 기존 사용자 settings 마이그레이션은 불필요(이미 normal로 저장된 사용자는 의도적 선택).

### [P2] 대비비 검증 (sp-muted on sp-card)

라이트 테마 기본값(`--sp-muted: #787774`, `--sp-card: #f5f5f3`):
- 컨트라스트 비 약 4.55:1 — WCAG AA 4.5:1 통과 (boundary). small text OK, large text 충분.

다크 테마(`--sp-muted: #94a3b8`, `--sp-card: #1a2332`):
- 약 6.62:1 — AA 통과.

→ 대비비 OK. 단, **`text-sp-muted/40` `text-sp-muted/50` 사용처(예: `WeeklyTimetable.tsx:181` `text-sp-muted/40`)는 Alpha 적용 후 측정 필요** — `text-sp-muted/40`은 `#94a3b8` 40% opacity → 다크 카드 위에서 약 2.7:1, **AA 미달**. 의도(공강 약체 표시)는 이해되나 접근성 위반 가능.

### [P3] LayoutSelector 4종 전환 UI

- **위치**: `src/widgets/components/LayoutSelector.tsx:106-155`
- **현재**: 미니 SVG 아이콘 + 레이블 + 단축키. 활성 시 sp-accent 색상. 양호.
- **개선**: 일관된 키보드 단축키 가시성 — `<kbd>` 컴포넌트 사용 권장. 현재는 `<span class="text-[11px]">` (arbitrary)라 v3.2 위반.

---

## E. 위젯 모드 고유 UX (PRD FR-WIDGET-01~07)

| FR | 명세 | 구현 | 상태 |
|---|---|---|---|
| 01 | 풀↔위젯 전환 버튼 (타이틀바/트레이) | 트레이 메뉴 (`main.ts:653`) + 메인 X 버튼 (`main.ts:602`) + 위젯 더블클릭 (`Widget.tsx:152`) + 우상단 expand 버튼 (`Widget.tsx:264-275`) | OK |
| 02 | 350×500 기본, 280×350 최소, 위치 기억 | 구현. `main.ts:961` minWidth=640, minHeight=480 | **PRD 명세 280×350과 다름** — minWidth=640으로 PRD보다 360px 큼. 해상도 1280에서 절반을 점유 |
| 03 | 시계/날씨/시간표/일정 표시 | 32개 위젯 자유 구성, 기본 프리셋 | OK |
| 04 | 투명도 0~100% 기본 80% | min=20 max=100 (`WidgetContextMenu.tsx:195`) | **P0 위반** |
| 05 | Always on Top **기본 활성화** | 기본 `normal` (`main.ts:1083`) + 메뉴 토글 없음 (`WidgetContextMenu.tsx`) | **P0 이중 위반** |
| 06 | 위치 기억 | `readWidgetBounds()` (`main.ts:929`) + 디스플레이 검증 (`main.ts:933-948`) | 우월 (다중 모니터 검증까지) |
| 07 | 더블클릭 → 풀 앱 | `Widget.tsx:152-157` 헤더 더블클릭 (버튼 제외 보호) | OK |

### [P0] FR-WIDGET-02 minWidth=640 — PRD 280과 360px 차이

- **위치**: `electron/main.ts:961`
- **현재**: `minWidth: 640, minHeight: 480`
- **문제**: PRD "최소 280×350px (핵심 정보 가독성 확보)" 위반. 1080p 화면에서 위젯이 **화면 폭의 50%**를 점유 → "컴팩트 데스크톱 위젯" 정체성 상실.
- **개선안**: 320×400 정도(PRD 280 + 약간 여유) — 또는 PRD를 현실에 맞춰 갱신. 현재 화면 디자인(`ssampin_compact_desktop_widget/code.html:48` 380×650)도 380이지 640 아님.

### [P2] 위젯 추가/제거/리사이즈 일관성 — 32개 위젯 카드 무게 차이

`src/widgets/registry.ts` 384줄에 32개 위젯 정의. 각 위젯이 자체 `rounded-xl bg-sp-card p-4` 컨테이너를 가짐 → **중복 32회**. 공통 추상 `<WidgetShell title icon>` 미존재.

- **개선안**: `WidgetShell` 추상 컴포넌트:
  ```tsx
  export function WidgetShell({ title, icon, headerExtra, children }: ...) {
    return (
      <div className="rounded-xl bg-sp-card p-4 h-full flex flex-col">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-sp-text flex items-center gap-1.5">
            <span>{icon}</span>{title}
          </h3>
          {headerExtra}
        </div>
        <div className="flex-1 min-h-0 overflow-auto">{children}</div>
      </div>
    );
  }
  ```
  32 → 1개 단일 진실. 위젯 모드 평탄화(`P2 C-카드 중첩`)도 한 곳에서 처리 가능.

---

## F. 메인 ↔ 위젯 모드 차별화

### F-1. 정보 밀도

- 메인: `WidgetGrid` `grid-cols-4 grid-flow-row-dense` `gridAutoRows: 80px` (`WidgetGrid.tsx:144-146`)
- 위젯: `grid-cols-4 gap-3 grid-flow-row-dense` `gridAutoRows: 80px` (`Widget.tsx:319-322`) — **레이아웃 동일**
- 위젯에서 split/quad 모드일 때 `transform: scale(0.7~0.85)` (`Widget.tsx:313-317`)

→ **메인과 위젯이 본질적으로 같은 그리드를 scale로만 압축**. "위젯 모드 = 공간 효율형 미니멀"이라는 차별화가 거의 없음. 레퍼런스(`ssampin_compact_desktop_widget`)의 "단일 컬럼 스크롤 + 카드 없는 미니멀"과 큰 거리.

### F-2. 위젯 전용 vs 메인 노출

- 위젯 전용(레지스트리 기준): `MemoFocus`(245), `MiniCalendar`(260), `DDayCounter`(385), `BookmarksWidget`(490), `ImageStickerWidget`(250), `ConsultationWidget`(120), `SurveyWidget`(98), `FavoriteTools`(150) — 메인 대시보드 prefab에서도 토글로 켤 수 있음 (registry는 availableFor 기준만 분리).
- alias 6종(Events/Meal/Memo/StudentRecords/TodoWidget/TodayClass): 메인 컴포넌트(`Dashboard*.tsx`)를 그대로 위젯에서 재사용. **위젯 모드용 압축 변형 없음.**

→ **alias 6종이 메인의 정보량 그대로 위젯에 등장** → 위젯 폭(640~)이 PRD 280 대비 큰 이유 중 하나. 작은 위젯에서도 메인용 컴포넌트가 들어가니 ResizeObserver로 동적 대응(`DashboardMemo.tsx:31-50`, `DashboardTodo.tsx:32-42`)하는 패턴은 부분적으로만 작동.

### [P2] 위젯 모드 레이아웃을 "단일 컬럼 미니멀"로 분리할 옵션 부재

- **현재**: 4-레이아웃 모드 모두 그리드 시스템(`Widget.tsx:312-338`).
- **레퍼런스 의도**: 단일 컬럼 + 구분선 (`ssampin_compact_desktop_widget/code.html`).
- **개선안**: 5번째 레이아웃 `compact-list` 추가 — 위젯들을 1열 세로로 쌓고 카드 평탄화. PRD에 명시 안 돼 있지만 사용자 가치 높음.

---

## 종합 점수

### 디자인 시스템 v3.2 기준 점수 (대시보드 + 위젯 한정)

전사 90/100을 기준으로 본 영역 점수:

| 항목 | 가중 | 만점 | 평가 | 점수 |
|---|---:|---:|---|---:|
| sp-* 토큰 일관성 | 20 | 20 | dashboard 다크 디폴트는 양호하나 MessageBanner 라이트 드롭다운(15건)과 WidgetContextMenu blue-* 직사용(4건)에서 회귀 | 14/20 |
| 라운드 정책 준수 | 5 | 5 | rounded-sp-* / arbitrary 0건. rounded-xl 통일 | 5/5 |
| arbitrary fontSize | 10 | 10 | text-[Npx] 0건이지만 인라인 style fontSize 24건 (Material icons 전수) | 5/10 |
| z-index 토큰화 | 10 | 10 | z-50 4건 + z-[9999] 2건 + sortable z-50 1건 = 7건 위반 | 6/10 |
| 디자인 레퍼런스 재현 | 20 | 20 | 메인 대시보드 70%, 위젯 모드 60%, 컨텍스트 메뉴 70%, 이벤트 팝업 95% | 12/20 |
| PRD FR-WIDGET 명세 준수 | 15 | 15 | FR-04(min=20), FR-05(기본 비활성+토글 누락), FR-02(minWidth=640) 3건 위반 | 6/15 |
| 인터랙션 어포던스 | 10 | 10 | MessageBanner 클릭 단서, 컨텍스트 메뉴 진입점, 포커스링 부재 | 5/10 |
| 빈/로딩/오류 상태 일관 | 5 | 5 | 패턴 4종 혼재 | 3/5 |
| WCAG 접근성 | 5 | 5 | sp-muted/40 다크 카드 미달 + focus-visible 부족 | 3/5 |
| **합계** | **100** | **100** | | **59/100** |

> **전사 v3.2 90/100 대비 대시보드+위젯 영역은 59/100** — 평균 이하. 주된 감점은 PRD FR-WIDGET 명세 위반(P0 3건), 디자인 레퍼런스 재현 손실(메모 메타포·할일 진행률·D-Day 배지), Material icon 인라인 fontSize 24건.

---

## Top 10 우선순위 픽스

| # | 우선 | 발견 | 위치 | 예상 비용 |
|--:|:--:|---|---|:--:|
| 1 | **P0** | 투명도 슬라이더 min=20 → PRD 0% 위반 | `WidgetContextMenu.tsx:194-196` | XS |
| 2 | **P0** | Always on Top 기본 비활성 + 토글 누락 (PRD FR-05 이중 위반) | `electron/main.ts:1083`, `WidgetContextMenu.tsx:99~` | S |
| 3 | **P0** | 위젯 minWidth=640 — PRD 280/350 위반 | `electron/main.ts:961-962` | XS |
| 4 | **P1** | MessageBanner 라이트 드롭다운 — sp-* 토큰화 | `MessageBanner.tsx:72-176` (15+ 라인) | S |
| 5 | **P1** | WidgetContextMenu의 `bg-blue-500/15 text-blue-400` `#3b82f6` 직사용 → sp-accent 토큰화 | `WidgetContextMenu.tsx:113,123,125,201,227` | XS |
| 6 | **P1** | 메모 위젯 포스트잇 메타포 복원 (rotate + 라이트 톤 + shadow) | `DashboardMemo.tsx:8-27` | S |
| 7 | **P1** | 할일 진행률 바 추가 (sp-accent 채움) | `DashboardTodo.tsx:175-187` | XS |
| 8 | **P1** | 위젯 컨텍스트 메뉴 진입 버튼 (more_vert) — 발견 가능성 | `Widget.tsx:210-276` | XS |
| 9 | **P1** | DDayBadge 공통 컴포넌트 추출 후 일정 위젯에 적용 | `EventPopup.tsx:40-53` → `common/DDayBadge.tsx` | S |
| 10 | **P1** | 위젯 모드 카드 평탄화 (`--sp-card-border: none` + bg 투명) | `Widget.tsx:181-187` 컨테이너 + WidgetShell 신설 | M |

### 추가 권장 (P2 클러스터)

- 시간표 헤더 행 라벨 추가
- WidgetShell 추상 컴포넌트로 32개 위젯 통합
- 인라인 `style={{fontSize}}` 24건 → `text-icon-*` 토큰 codemod
- z-50 / z-[9999] 7건 → z-sp-* 토큰화
- focus-visible 일관 정책(공통 `.focus-ring` 적용)
- 5번째 위젯 레이아웃 `compact-list` (단일 컬럼 + 카드 평탄화) — 레퍼런스 의도 복원
- 공통 EmptyState 컴포넌트 (📌 + 1차 메시지 + 액션 가이드)
- 메시지 배너 hover 시 edit 아이콘 어포던스
- WeatherForecastPopup `text-blue-400` `text-sky-400` (`WeatherForecastPopup.tsx:16-18`) → sp-* 또는 의미 토큰

### 회귀 안전망

P0 1·2번 수정 시 settings 마이그레이션 주의:
- 기존 사용자 `widget.opacity = 0.8 (default)` → 그대로 유지, UI만 0%까지 표시.
- `widget.desktopMode === undefined`인 사용자 → 첫 로드 시 자동 `'topmost'` 마이그레이션. 명시적으로 `'normal'` 저장된 경우는 사용자 의도 유지.
