보고서는 파일로 저장하지 않았습니다(읽기 전용 분석이므로). 아래에 전문을 그대로 반환합니다.

---

# 쌤핀 모바일 앱 UI 가시성·수정 빈도 분석 보고서

분석 대상: `e:\github\ssampin\src\mobile\` (총 ~11,900줄, 41개 커밋, 2026-05-07 ~ 2026-07-03)
읽기 전용 분석 — 코드 변경 없음. 파일 저장 없음(본문은 이 메시지가 전문).

---

## 1. 수정 빈도 상위 파일 (커밋 횟수 기준)

| 순위 | 파일                                                                                                                                                                                                                                                                   | 커밋 | 성격            | 비고                                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------- | -------------------------------------------------------------------------------------- |
| 1    | `pages/SettingsPage.tsx`                                                                                                                                                                                                                                               | 21   | **셸**          | ⚠️ 대부분 릴리스 버전 문자열 bump (`SettingsPage.tsx:251` `v2.2.7`). 실제 UI 변경 아님 |
| 2    | `pages/MorePage.tsx`                                                                                                                                                                                                                                                   | 20   | **셸**          | ⚠️ 동일 — `MorePage.tsx:107` 하드코딩 버전 bump가 커밋 대부분                          |
| 3    | `pages/StudentsPage.tsx`                                                                                                                                                                                                                                               | 9    | **콘텐츠**      | 진짜 기능 churn (자리배치·명단·기록 통일)                                              |
| 4    | `App.tsx`                                                                                                                                                                                                                                                              | 6    | **셸**          | 네비 4탭 재편, OAuth, 테마                                                             |
| 5    | `pages/AttendanceCheckPage.tsx`                                                                                                                                                                                                                                        | 5    | **콘텐츠**      | 여러 날짜 출결 등                                                                      |
| 6    | `pages/ClassDetailPage.tsx`                                                                                                                                                                                                                                            | 4    | 셸(탭 컨테이너) |                                                                                        |
| 7    | `components/Today/CurrentClassCard.tsx`                                                                                                                                                                                                                                | 4    | **콘텐츠**      | 오늘 허브 핵심 카드                                                                    |
| 8    | `styles/mobile.css`                                                                                                                                                                                                                                                    | 3    | 셸              |                                                                                        |
| 9    | `stores/useMobileStudentRecordsStore.ts`                                                                                                                                                                                                                               | 3    | 스토어          | 기록 시스템 통일                                                                       |
| 10   | `pages/TodoPage.tsx`                                                                                                                                                                                                                                                   | 3    | **콘텐츠**      |                                                                                        |
| 11   | `pages/SchedulePage.tsx`                                                                                                                                                                                                                                               | 3    | **콘텐츠**      |                                                                                        |
| 12   | `main.tsx`                                                                                                                                                                                                                                                             | 3    | 셸(부트스트랩)  |                                                                                        |
| 13   | `components/Today/MobileProgressLogModal.tsx`                                                                                                                                                                                                                          | 3    | **콘텐츠**      |                                                                                        |
| 14   | `components/Today/MealCard.tsx`                                                                                                                                                                                                                                        | 3    | **콘텐츠**      |                                                                                        |
| 15   | `components/Today/HomeroomAttendanceCard.tsx`                                                                                                                                                                                                                          | 3    | **콘텐츠**      |                                                                                        |
| 16   | `components/Today/ClassAttendanceCard.tsx`                                                                                                                                                                                                                             | 3    | **콘텐츠**      |                                                                                        |
| 17   | `components/Onboarding/OnboardingFlow.tsx`                                                                                                                                                                                                                             | 3    | 셸              |                                                                                        |
| 18   | `components/Class/ClassProgressTab.tsx`                                                                                                                                                                                                                                | 3    | **콘텐츠**      |                                                                                        |
| 19~  | (2회) SurveyToolStore, SettingsStore, DriveSyncStore, ToolSurveyPage, MemoPage, useGoogleAuth, container, SegmentedControl, WeatherCard, TodayHub, SyncStatusBanner, PraiseMemoSheet, MobileShareModal, PeriodTimesEditor, QuickAddFab, SyncStatus, ClassAttendanceTab | 2    | 혼합            |                                                                                        |

**해석**: 릴리스마다 버전 문자열이 하드코딩된 2개 셸 파일이 빈도 1·2위를 차지해 통계를 왜곡한다. 이를 제외하면 실제 UI churn은 **오늘 허브 카드류(Today/\*)와 StudentsPage·출결·일정** 즉 "콘텐츠 영역"에 집중된다.

---

## 2. 셸 vs 콘텐츠 분류표 + 배치 제안

### 고정 셸/프레임 (거의 안 바뀜, 안정)

| 영역              | 파일:라인                                                                                                  | 역할                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 앱 부트스트랩     | `main.tsx`                                                                                                 | 진입점                          |
| 앱 프레임         | `App.tsx:329-501`                                                                                          | 헤더·`<main>`·FAB·탭바 레이아웃 |
| 하단 네비         | `App.tsx:84-89`, `469-499`                                                                                 | 4탭 정의·탭바                   |
| 세그먼트 서브네비 | `App.tsx:374-403` (학생/일정 SegmentedControl)                                                             |                                 |
| 에러 바운더리     | `components/ErrorBoundary.tsx`                                                                             |                                 |
| 온보딩/PWA        | `Onboarding/OnboardingFlow.tsx`, `InstallGuide.tsx`, `NavMigrationCoachmark.tsx`, `InAppBrowserBanner.tsx` | 첫 실행·설치 안내               |
| 탭 컨테이너       | `ClassDetailPage.tsx:29-88` (3서브탭 셸)                                                                   |                                 |
| 설정 프레임       | `SettingsPage.tsx` (버전 문자열만 제외하면 안정)                                                           |                                 |

### 자주 바뀌는 콘텐츠 영역 (churn 집중)

| 영역                 | 파일:라인                                               | 비고                  |
| -------------------- | ------------------------------------------------------- | --------------------- |
| 오늘 허브 카드 배치  | `Today/TodayHub.tsx:108-201` (Bento Grid)               | 카드 추가/재배치 잦음 |
| 현재 교시 카드       | `Today/CurrentClassCard.tsx`                            | 상태별 4분기 본문     |
| 담임/수업 출결 카드  | `HomeroomAttendanceCard.tsx`, `ClassAttendanceCard.tsx` |                       |
| 급식/날씨            | `MealCard.tsx`, `WeatherCard.tsx`                       |                       |
| 학생 리스트/자리배치 | `StudentsPage.tsx` 전체                                 | 최대 churn            |
| 출결 체크            | `AttendanceCheckPage.tsx`                               |                       |
| 수업 탭(진도·관찰)   | `ClassProgressTab.tsx`, `ClassObservationTab.tsx`       |                       |
| 일정/할일            | `SchedulePage.tsx`, `TodoPage.tsx`                      |                       |

### "자주 수정되는 부분이 먼저 눈에 띄는" 배치 제안

1. **버전 문자열 단일화**: 지금 `MorePage.tsx:107`·`SettingsPage.tsx:251`에 `v2.2.7`이 두 곳 하드코딩되어, 릴리스마다 셸 파일 diff가 발생하고 "가장 자주 수정된 파일" 오탐을 만든다. → 한 곳(예: `package.json`/상수)에서 주입해 셸을 diff에서 제외하면, git 통계가 실제 콘텐츠 churn을 정직하게 반영한다.
2. **오늘 허브를 "편집 가능 영역"으로 명시**: 이미 `useMobileHomeLayoutStore`로 카드 show/hide가 있으나(`SettingsPage.tsx:205-231`), 카드 **순서**는 `TodayHub.tsx:126-199`에 하드코딩. 자주 바뀌는 것이 카드 배치이므로, 순서까지 스토어 기반 config 배열로 끌어올리면 코드 수정 없이 배치 변경이 가능하다.
3. **콘텐츠 디렉터리 응집**: churn이 `components/Today/*`와 `pages/Students·Schedule·Todo`에 몰려 있으므로, 셸(`App.tsx`, `Onboarding/*`)과 물리적으로 분리된 현재 구조는 양호. 단 `StudentsPage.tsx` 단일 파일 비대는 3절 참고.

---

## 3. 대형 파일(500줄+) 분해 후보 — 순수 추출만

이미 각 파일 내부에 **응집된 서브컴포넌트가 함수 단위로 분리**되어 있어, 파일만 쪼개는 순수 추출(동작 보존)이 안전하다.

### `StudentsPage.tsx` (1815줄) — 최우선

내부 경계(모두 파일 분리 가능):

- `StudentsPage` 메인 컨테이너 `:68-522`
- `SeatingView` `:536-698`
- `TeachingSeatingView` `:710-890`
- `HomeroomListView` `:911-1051`
- `TeachingListView` `:1065-1224`
- `StudentQuickActionSheet` `:1250-1344`
- `AttendanceSubTab` `:1345-1549`
- `RecordsSubTab` `:1564-1748`
- `ContactSubTab` `:1749-끝`
- 상수 `STATUS_CONFIG:33`, `CATEGORY_COLORS:1550` → 공용 상수 파일로

→ `pages/Students/` 하위로 8개 컴포넌트 + 상수 분리 시 메인 파일이 ~500줄로 축소. props가 이미 명시적이라 추출 리스크 낮음.

### `AttendanceCheckPage.tsx` (652줄)

- `STATUS_CONFIG:39`, `todayString:70` 유틸/상수 추출 정도. 단일 컴포넌트라 분해 여지는 StudentsPage보다 작음.

### `App.tsx` (502줄)

- `App.tsx:404-456`의 **14분기 `moreSub` 삼항 체인**(도구 라우팅)을 `{ key: Component }` 레지스트리 + `<Suspense>` 래퍼로 치환하면 ~50줄 → ~10줄. 순수 추출(라우팅 테이블화) 가능.
- `ToolLoadingFallback:61`, tabs/segments 상수는 그대로 유지 가능.

### 500줄 근접 (선제 관리 대상)

- `ClassObservationTab.tsx` (486): `ObservationRecordCard:239`, `ObservationSheet:282`, `ActionSheet:402`, `ConfirmDeleteDialog:452` 분리 가능.
- `ToolSurveyPage.tsx` (455): `TeacherCheckRow:26`, `SurveyDetail:124` 분리 가능.
- `SchedulePage.tsx` (448), `MobileProgressLogModal.tsx` (412), `TodoPage.tsx` (405, `AddTodoModal:43`·`TodoItem:156` 분리 가능), `ClassProgressTab.tsx` (378).

**참고**: `ActionSheet`/`ConfirmDeleteDialog`/`todayString`가 `ClassObservationTab`·`ClassProgressTab`·여러 페이지에 **중복 정의**되어 있음 → 공용 컴포넌트/유틸로 통합하면 순수 추출이면서 중복 제거.

---

## 4. 최적화 권장사항 메모 (수행 금지 — 기록용)

### 리렌더 / 마운트

- **탭 전환 시 페이지 완전 언마운트**: `App.tsx:372-457`이 `activeTab === … &&` 조건부 렌더라, 탭을 벗어나면 페이지가 언마운트되어 스크롤 위치·로컬 상태가 소실되고 재진입 시 load 이펙트가 매번 재실행. → keep-alive(`display:none` 유지) 검토.
- **TodayHub 매 진입 재로딩**: `TodayHub.tsx:67-74` 단일 이펙트에서 6개 store load(`loadSettings/Schedule/Attendance/TeachingClasses/Progress/Students`)를 홈 재진입마다 무조건 호출. store의 `loaded` 플래그로 가드 가능.
- **급식 이중 로드**: `TodayHub.tsx:76-87` 마운트 시 1회 + 동기화 완료 후 1회 → 조건 중첩으로 중복 fetch 소지.
- **CurrentClassCard 초당 리렌더**: `useCurrentPeriod`가 `remainingMinutes/progress`를 틱마다 갱신(`CurrentClassCard.tsx:110-120`) → 매 틱 `DayScheduleOverview`(`:26-108`)까지 재렌더. `DayScheduleOverview`를 `React.memo`로 감싸면 진도바만 갱신.

### 반복 fetch / 캐싱

- **WeatherCard 스토어 부재**: `WeatherCard.tsx:19-42`가 컴포넌트 내부에서 직접 `settingsRepository.getSettings()` + `fetchWeather()` 호출, 30분 인터벌. store 캐싱이 없어 홈 재진입(언마운트/리마운트)마다 재fetch. → `MealCard`처럼 store로 승격해 캐시.

### 무거운 연산

- **출결 조회 O(n²) 소지**: `StudentsPage.tsx:108-116` `getRecordForDate`가 `records.find(...)`를 학생 리스트 `.map` 내부에서 호출(`:955`, `:1120` 등) → 학생 수 × 기록 수. `date|classId|period` 키로 인덱싱한 Map을 `useMemo`로 만들면 O(1) 조회.

### 유지보수 / 정합성

- **버전 문자열 이중 하드코딩**: `MorePage.tsx:107`, `SettingsPage.tsx:251` (`v2.2.7`) — 단일 소스화 필요(오탐·불일치 위험).
- **중복 유틸**: `todayString()`이 `AttendanceCheckPage:70`, `ClassObservationTab:30`, `ClassProgressTab`, `TodoPage:15`, `StudentsPage:1559` 등 5+곳 재정의 → 공용 util로.
- **도구 라우팅 삼항 지옥**: `App.tsx:404-456` — 레지스트리화(가독성·확장성).

### 접근성 / 현장 교사 UX

- 탭바·SegmentedControl에는 `aria-label`/`aria-current`가 잘 적용됨(`App.tsx:469-499`). 그러나 헤더 계정/계정전환 등 **아이콘 전용 버튼**이 다수(`App.tsx:342-357`) — swap 버튼은 `title`만 있고 `aria-label` 없음.
- **오늘 허브 = 1교시 시작 전 첫 화면**: 현장 교사는 등교 직후 "우리 반 출결"에 즉시 접근하고 싶음. 현재 담임 출결 카드가 Bento Grid 2열 반너비(`TodayHub.tsx:135-158`)라 급식/날씨와 시각적 우선순위가 비슷. → 수업 시작 시간대엔 출결 카드를 풀너비·상단 고정하는 시간대 적응형 배치 아이디어.
- **날씨 설정 미완료 시 에러 텍스트 노출**(`WeatherCard.tsx:23-26` "날씨 지역이 설정되지 않았습니다") — 첫 사용자에겐 에러처럼 보임. 설정 유도 CTA로 완화 여지.
- **담임 학급 변경 경고**(`SettingsPage.tsx:58-64`)는 데이터 매핑 파괴를 `window.confirm`으로만 방어 — 현장에서 실수 시 복구 어려움. 안전장치 강화 여지(메모용).

---

### 핵심 요약

- 수정 빈도 1·2위(Settings/More)는 **버전 문자열 bump 오탐**. 실제 churn은 오늘 허브 카드·StudentsPage·출결/일정에 집중.
- 최대 분해 후보는 **`StudentsPage.tsx`(1815줄)** — 내부 9개 서브컴포넌트가 이미 함수 경계로 나뉘어 순수 추출 안전.
- 최우선 최적화 여지: **탭 언마운트 재로딩 · WeatherCard store 부재 · 출결 O(n²) 조회 · 버전 문자열/유틸 중복**.

(참고: 본 보고서는 파일로 저장하지 않았습니다 — 읽기 전용 분석이므로 이 메시지 본문이 전문입니다.)
