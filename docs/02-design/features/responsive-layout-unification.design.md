# 반응형 레이아웃 통일 설계서

> 목적: 창 너비를 줄였을 때 레이아웃이 깨지는 화면들을 전수 개선한다.
> 데스크톱(Electron) 앱이지만 사용자가 창을 자유롭게 줄여 쓰므로, 700~1024px 대역에서도
> 정보가 잘리거나 찌그러지지 않아야 한다.

## 0. 전제 (반드시 지킬 것)

- **로직/동작 변경 금지** — 레이아웃(className·구조)만 바꾼다. 핸들러·상태·데이터 흐름 불변.
- **하드코딩 HEX 금지** — `sp-*` 토큰만. 모든 UI 텍스트 한국어.
- **모든 작업은 `main`에서.** 새 브랜치/worktree 금지.
- **한 파일은 한 사람만** 수정한다(아래 7. 파일 분담 표). 분담 밖 파일 건드리지 말 것.
- 작업 후 검증 게이트: `npx tsc --noEmit` → `npm run lint` → `npm run test` → `npm run regression-check`.

## 1. 브레이크포인트 정책

Tailwind 기본값 사용(커스텀 없음): `sm=640` `md=768` `lg=1024` `xl=1280`.

- **2분할 → 세로 쌓기**: 기본 `lg`(1024) 기준. 좌우 패널은 `flex-col lg:flex-row`.
- **격자 칸 수 축소**: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-N` 형태로 단계 축소.
- **부가 텍스트 숨김**: 아이콘+라벨 버튼에서 좁을 때 라벨 숨김은 `hidden sm:inline` / `hidden lg:inline`.

## 2. 5가지 깨짐 패턴 → 수정 레시피

### A. 안 접히는 가로 버튼/탭 줄 → `ScrollRow`

`flex gap-* `로만 늘어놓아 좁아지면 찌그러지고 한글이 세로로 줄바꿈되는 줄.

- **수정**: 해당 `<div className="flex items-center gap-2 ...">`를 공용 컴포넌트
  `ScrollRow`(`@adapters/components/common/ScrollRow`)로 교체. `gap-*`와 여백 클래스는 그대로 `className`에 전달.
- `role="tablist"` 등 a11y 속성은 ScrollRow에 그대로 전달된다.
- 항목이 자연 너비를 유지(`[&>*]:shrink-0`)한 채 넘치면 가로 스크롤된다. 스크롤바는 숨김.
- 헤더 액션 줄(`PageHeader`의 rightActions)은 이미 `flex-wrap`이라 줄바꿈된다 — 줄 수가
  과하게 늘면 라벨 숨김(`hidden lg:inline`)으로 폭을 줄여 줄 수를 억제한다(ScrollRow로 바꾸지 않음).

### B. 폭이 고정된 옆 패널 → 반응형 폭 + 접기

`w-72`/`w-80`/`w-[260px]`/`style={{minWidth:…}}` 같은 고정폭 사이드 패널이 본문을 압박.

- **수정**: `w-full lg:w-72`처럼 좁을 땐 전체폭, 넓을 때만 고정폭. 그리고 부모를 `flex-col lg:flex-row`.
- 이미 접기 토글이 있는 곳([ClassManagementPage.tsx](../../../src/adapters/components/ClassManagement/ClassManagementPage.tsx) 학급 목록 `w-72`↔`w-12`)을 **모범 참조**로 삼는다.

### C. 안 쌓이는 좌우 2~3분할 → `flex-col lg:flex-row`

좁아지면 위아래로 쌓여야 하는데 분기점이 없는 분할.

- **수정**: 컨테이너 `flex flex-col lg:flex-row gap-*` + 각 패널 `min-w-0`(자식 넘침 방지). 캔버스/콘텐츠는 `flex-1 min-w-0`.
- **모범 참조**: [Schedule.tsx](../../../src/adapters/components/Schedule/Schedule.tsx) 월간 뷰 `flex flex-col lg:flex-row`(캘린더 60% + 이벤트 40%).

### D. 칸 수 고정 격자 → 반응형 prefix

`grid-cols-5`/`grid-cols-7` 등 칸 수 고정 → 좁아지면 칸이 못 보일 만큼 좁아짐.

- **수정**: `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-N` 단계 축소,
  또는 `grid-cols-[repeat(auto-fill,minmax(Xpx,1fr))]`로 자동 줄바꿈.
- 데이터성 표(요일×급식 등)는 D보다 E(가로 스크롤) 또는 세로 쌓기가 더 자연스러울 수 있음 — 화면 성격에 맞게.

### E. 가로 스크롤 없는 표/매트릭스 → 스크롤 래퍼

넓은 `<table>`/격자가 화면 밖으로 잘림.

- **수정**: `<div className="w-full overflow-x-auto">`로 감싸고 표에 `min-w-[Npx]`(필요 시) 유지.
- **모범 참조**: [TimetablePage.tsx](../../../src/adapters/components/Timetable/TimetablePage.tsx) `<div className="w-full overflow-x-auto"><table className="w-full min-w-[800px]">`.

## 3. 검증

- 주요 화면은 dev 서버(`npm run dev`)로 띄워 창을 700·900·1100px로 줄여가며 직접 확인.
- 깨짐이 사라지고 스크롤/쌓기/접기로 정보가 모두 접근 가능한지 본다.

## 4. 우선순위(요약)

- 🔴 1순위: 수업관리 탭줄, 수업기록 입력/조회, 담임 기록 조회/입력, 명렬표, 급식표, 자리배치, 할일(프로), 쌤핀 노트, 일정/시간표 헤더
- 🟡 2순위: 서명받기 표, 관찰 패널, 진도 버튼줄, 설정 탭바, 칠판 도구모음
- 🟢 3순위: 모달 내부 고정 격자(이모지·프리셋·배경)

## 5. 파일 분담 (Lane — 한 파일 한 사람, 절대 중복 금지)

| Lane | 담당 영역          | 주요 파일                                                                                                  |
| ---- | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| L1   | 수업관리 셸·탭     | ClassManagement/ClassManagementPage.tsx, ProgressTab.tsx, ObservationTab.tsx                               |
| L2   | 수업기록 입력/조회 | ClassManagement/ClassRecordInputView.tsx, ClassRecordSearchView.tsx                                        |
| L3   | 담임 기록          | Homeroom/Records/SearchMode.tsx, InputMode.tsx, RosterManagementTab.tsx                                    |
| L4   | 일정·시간표·급식   | Schedule/Schedule.tsx, Timetable/TimetablePage.tsx, Meal/MealPage.tsx                                      |
| L5   | 자리배치·할일·노트 | Seating/Seating.tsx, Todo/Todo.tsx, Note/NotePage.tsx                                                      |
| L6   | 도구·설정          | Tools/SignatureRoster/RosterTable.tsx, Tools/Chalkboard/ChalkboardToolbar.tsx, Settings/SettingsTabBar.tsx |

> 공용 자산(`common/ScrollRow.tsx`, `index.css`, `common/PageHeader/PageHeader.tsx`)은 0단계에서
> 이미 확정됐다. Lane 작업자는 공용 자산을 **수정하지 말고 import해서 사용만** 한다.
