---
template: design
version: 1.2
feature: mobile-ux-improvement
date: 2026-05-12
author: pblsketch
project: ssampin
version_target: 전체(Phase 1~5) 완료 후 단일 릴리즈에 묶음 게시 (버전 미정, v2.x 마이너)
depends_on: docs/01-plan/features/mobile-ux-improvement.plan.md
status: Draft (Phase 1+2 구현 완료 — 커밋 ddfa59f, 브랜치 feat/mobile-ux-improvement)
---

# 쌤핀 모바일 UI/UX 개선 설계서

> Plan 문서의 요구사항(F-1 ~ F-16)을 컴포넌트·상태·흐름·검증으로 변환한다. **Phase 1~5 모두 상세 설계.**
> 모바일은 Clean Architecture의 adapters 상응 계층(`src/mobile/`) — 도메인 규칙은 `@domain/*` 재사용, 모바일 전용 store/UI만 추가.
> UI 컴포넌트 신규/대규모 변경 시 `/pdca do` 단계에서 **`frontend-design` 스킬과 협업**(프로젝트 피드백 메모리). 아래 UI 권고는 `bkit:frontend-architect` 검토를 반영함.
> 릴리즈는 사용자 지시(2026-05-12)대로 Phase 1~5 를 **모두 마친 뒤 한 번에** 게시. Phase 단위로 main 에 점진 머지·검증.

---

## 0. Phase별 범위 / 진행 상태

| Phase | 내용                                                                       | 상태                                                                                                      | 본 문서 |
| ----- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------- |
| 1     | F-1 출결 총원 실데이터 · F-2 교시 드롭다운 · F-3 일정 시간 필드            | ✅ main 머지 (PR #30)                                                                                     | §2 상세 |
| 2     | F-4 카드 접기(홈 4개 카드) · F-5 카드 숨기기 · F-6 출결 버튼 라벨 가시성   | ✅ main 머지 (PR #30)                                                                                     | §3 상세 |
| 3     | F-7 4탭+FAB · F-8 전역 FAB · F-9 터치·safe-area                            | ✅ main 머지 (PR #30)                                                                                     | §4 상세 |
| 4     | F-10 스와이프-투-리빌 · F-11 햅틱 · F-12 코치마크                          | 📋 설계 완료, 미착수                                                                                      | §5 상세 |
| 5     | F-13 교시 시간 편집 · F-14 학급 정보 편집 · F-15 설정 동기화 · F-16 온보딩 | 🟡 F-13·F-14 구현·검증 완료 (브랜치 feat/mobile-settings-edit) · F-15 전용 충돌모달·F-16 온보딩 보강 후속 | §6 상세 |

> 권장 구현 순서: Phase 1+2 완료 ✅ → **Phase 3 (네비 재편, 다른 화면들과 연쇄 변경)** → **Phase 5 (설정 동기화, 위험 크지만 독립적)** → **Phase 4 (스와이프, UX 폴리시 — frontend-design 협업 비중 큼)**. (각 Phase 내 F-13 → F-14 순서 등은 해당 §의 "범위·순서" 참조.)

---

## 1. Architecture Overview (Phase 1+2)

### 1.1 Touchpoints

| 레이어            | 파일                                                                                                                                       | 변경 유형                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| domain            | `src/domain/valueObjects/PeriodTime*` / `src/domain/rules/periodRules.ts`                                                                  | (변경 없음) — 현재 교시 판정 재사용                                               |
| mobile/hooks      | `src/mobile/hooks/useCurrentPeriod.ts`                                                                                                     | (변경 없음) — F-2 기본값 산출에 재사용                                            |
| mobile/stores     | `src/mobile/stores/useMobileStudentStore.ts`                                                                                               | (변경 없음) — F-1에서 담임 반 학생 수 조회                                        |
| mobile/stores     | `src/mobile/stores/useMobileSettingsStore.ts`                                                                                              | **확장** — `homeCardVisibility`(F-5) 영속 필드 추가                               |
| mobile/stores     | `src/mobile/stores/useMobileHomeLayoutStore.ts`                                                                                            | **신규** — `collapsedCards`(F-4) 영속                                             |
| mobile/components | `src/mobile/components/Today/TodayHub.tsx`                                                                                                 | 총원 하드코딩 제거(F-1), 카드 visibility 필터(F-5), 카드 collapsed prop 주입(F-4) |
| mobile/components | `src/mobile/components/Today/HomeroomAttendanceCard.tsx` `WeatherCard.tsx` `MealCard.tsx` `CurrentClassCard.tsx` `ClassAttendanceCard.tsx` | `collapsed`/`onToggleCollapse`/`summary` props 추가(F-4)                          |
| mobile/components | `src/mobile/components/common/CollapsibleCard.tsx`                                                                                         | **신규** — 헤더+chevron+요약+본문 래퍼 (F-4 공통)                                 |
| mobile/components | `src/mobile/components/common/Toggle.tsx`                                                                                                  | **신규** — `role="switch"` 토글 (F-5·F-3 종일 토글 공유)                          |
| mobile/components | `src/mobile/components/Class/ClassAttendanceTab.tsx`                                                                                       | `period={1}` 제거 → 미지정/현재교시 위임(F-2)                                     |
| mobile/pages      | `src/mobile/pages/AttendanceCheckPage.tsx`                                                                                                 | 헤더 교시 드롭다운 + `selectedPeriod` 로컬 state + 버튼 레이아웃 변경(F-2·F-6)    |
| mobile/pages      | `src/mobile/pages/SchedulePage.tsx`                                                                                                        | 일정 추가 모달에 종일 토글 + 시작/종료 시간 필드(F-3)                             |
| mobile/App.tsx    | `src/mobile/App.tsx`                                                                                                                       | `AttendanceNav.period` 옵셔널화, `currentPeriod` 주입 경로(F-2)                   |
| domain (옵션)     | `src/domain/entities/SchoolEvent.ts`                                                                                                       | `endTime?` 가 없으면 추가 검토(F-3) — 없으면 1단계는 `time`(시작)만               |

### 1.2 Dependency Rule 검증

- 모바일 store/컴포넌트끼리만 의존, 도메인은 `@domain/*`만 import — 위반 없음.
- 신규 공통 컴포넌트(`CollapsibleCard`, `Toggle`)는 `src/mobile/components/common/` 에 배치 — 데스크톱 `src/adapters/components/common/` 과 분리(모바일 PWA 번들 독립).

---

## 2. Phase 1 — 데이터 정합 (상세)

### 2.1 F-1 — 출결 총원 실데이터 연동

**현황**: [`TodayHub.tsx:84`](../../../src/mobile/components/Today/TodayHub.tsx#L84) `const totalStudents = 30;` → [`HomeroomAttendanceCard`](../../../src/mobile/components/Today/HomeroomAttendanceCard.tsx) 에 props로 전달(`:119`).

**설계**:

```ts
// TodayHub.tsx
const homeroomStudents = useMobileStudentStore((s) => s.homeroomStudents); // 또는 동등 셀렉터
const totalStudents = homeroomStudents.length;
const hasHomeroom = settings.homeroomClassId != null && totalStudents > 0;
// 렌더: hasHomeroom 이면 HomeroomAttendanceCard, 아니면 "담임 학급을 설정하면 출결 요약이 표시됩니다" 안내 카드
```

- 담임 반이 없거나 학생 0명 → 카드 자체를 숨기고 안내(설정 딥링크). 30 같은 임의 fallback 금지.
- `useMobileStudentStore` 의 셀렉터 이름은 구현 시 코드로 확인(현재 store API: `getStudentsByClass` 류 추정 — `/pdca do` 첫 단계에서 확정).

**검증**: `grep -rn "= 30" src/mobile/components/Today/TodayHub.tsx` → 0건. 학생 25명 학급에서 카드가 "출석 X / 전체 25"로 표시.

### 2.2 F-2 — 출결 교시 선택 드롭다운

**현황**: `period` prop이 정적으로 내려옴.

- `App.tsx`: `attendanceNav.period` (TodayHub에서 `0`=담임 / `periodInfo.currentPeriod`=수업 카드 클릭 시).
- `ClassAttendanceTab.tsx`: `period={1}` 하드코딩(embedded, ClassDetailPage 내부).
- `ClassListPage`(구 AttendanceListPage)에서의 진입 경로도 동일 패턴.

**설계 — `AttendanceCheckPage` 가 교시의 single source가 된다**:

```ts
interface Props {
  classId: string;
  className: string;
  type: 'homeroom' | 'class';
  period?: number; // ← 옵셔널화. homeroom 이면 무시(=0). class 이면 "초기 선택값 힌트"
  currentPeriod?: number; // ← 신규. 호출처가 useCurrentPeriod로 산출해 주입(없으면 내부 fallback)
  onBack: () => void;
  embedded?: boolean;
}

// 내부
const initialPeriod =
  type === 'homeroom'
    ? 0
    : period && period >= 1
      ? period
      : currentPeriod && currentPeriod >= 1
        ? currentPeriod
        : 1;
const [selectedPeriod, setSelectedPeriod] = useState(initialPeriod);

// 기존 getTodayRecord(classId, period) / saveRecord({ period, ... }) 의 period 인자를 모두 selectedPeriod 로 교체
// 헤더: type === 'homeroom' → "담임 출결" 고정 / type === 'class' → 교시 드롭다운(아래 UI)
```

- `ClassAttendanceTab` → `<AttendanceCheckPage ... />` 에서 `period` 제거, 대신 `currentPeriod={useCurrentPeriod(settings.periodTimes).currentPeriod ?? undefined}` 주입. (훅을 컴포넌트에서 호출 — ClassAttendanceTab은 함수형 컴포넌트라 OK. settings는 `useMobileSettingsStore` 에서.)
- `App.tsx`: `AttendanceNav.period` → `period?: number`, TodayHub의 담임 진입은 `type:'homeroom'`(period 생략), 수업 카드 진입은 `period: currentPeriod` 유지. `AttendanceCheckPage` 에 `currentPeriod` 도 함께 넘김.
- **R6 회귀 차단**: 교시는 화면에 _크게 보이고_ 사용자가 바꿔야만 바뀐다 — 사일런트 자동 변경 아님. 저장 직전 `selectedPeriod` 가 헤더에 표시된 값과 동일함을 보장(별도 로직 불필요, 단일 state).

**UI (frontend-architect 권고 — 헤더 인라인 드롭다운)**:

```
glass-header:
  [←]  [ 3교시 출결 ▾ ]            [완료]
        ↑ button, bg-sp-surface/60 rounded-lg border border-sp-border
          px-3 py-1.5 text-sp-text font-bold  min-h-[44px]
          aria-haspopup="listbox" aria-expanded

열림 (fixed overlay z-sp-dropdown, glass-card rounded-xl shadow-lg):
   교시 선택
   ┌────────────────────┐
   │ 1교시  09:00       │  text-sp-muted opacity-60  (지난 교시)
   │ 2교시  10:00       │
   │▶3교시  11:00  [현재]│  bg-sp-accent/10 border-l-2 border-sp-accent
   │ 4교시  12:00       │  text-sp-accent font-bold
   │  ...               │  각 행 min-h-[48px], role="option" aria-selected
   └────────────────────┘
   외부 터치 / Escape → 닫기. 열림 시 현재 교시 행에 focus().
```

- 교시 라벨 옆 시각(`09:00`)은 `settings.periodTimes[i].start` 에서. periodTimes 미설정 시 시각 생략하고 "N교시"만.
- "[현재]" 뱃지: `text-xs bg-sp-accent/10 text-sp-accent rounded-full px-2 py-0.5`.

**검증**: 11:05에 수업 출결 진입 → 드롭다운 기본값 "3교시", 헤더 "3교시 출결". 사용자가 "4교시" 선택 → 저장 시 `period:4` 로 기록. 담임 출결 진입 → 드롭다운 없음. ClassDetailPage 출결 서브탭 진입 → 현재 교시 기본 선택(더 이상 1교시 고정 아님).

### 2.3 F-3 — 일정 추가 모달 시간 필드

**현황**: [`SchedulePage.tsx:337-375`](../../../src/mobile/pages/SchedulePage.tsx#L337-L375) 모달 = [제목][날짜][카테고리]. `SchoolEvent.time?: string`("HH:mm") 존재, 목록에서 표시됨(`:295`).

**설계**:

```ts
// 추가 state
const [isAllDay, setIsAllDay] = useState(true);
const [newStartTime, setNewStartTime] = useState(''); // "HH:mm"
const [newEndTime, setNewEndTime] = useState(''); // "HH:mm" (선택)

// handleAdd 시
const time = isAllDay ? undefined : newStartTime || undefined;
// SchoolEvent.endTime 필드가 도메인에 있으면: endTime = isAllDay ? undefined : (newEndTime || undefined)
// 없으면 1단계는 time(시작)만 — endTime 추가는 별도 후속(엔티티+데스크톱 영향 검토 필요)
```

**UI**:

```
일정 추가
 제목     [                         ]
 날짜     [2026-05-12        📅      ]
 카테고리 [학사일정         ▾        ]
 ┌─ glass-card rounded-xl ─────────────┐
 │  종일                  [ ●── ON ]  │  role="switch" aria-checked={!isAllDay}
 └─────────────────────────────────────┘
   ↓ isAllDay=false 일 때만 (overflow-hidden transition-all duration-200, max-h-0→max-h-32)
 ┌─────────────────────────────────────┐
 │  시작 [09:00]   종료 [10:00]        │  glass-input, type="time"
 │       aria-label  aria-label        │  시작 비면 종료 disabled
 └─────────────────────────────────────┘
 [취소]                        [추가]
```

- `<input type="time">` — iOS Safari 네이티브 피커로 충분. 커스텀 휠피커 불필요.
- 종일 토글은 §3.2 의 공통 `Toggle` 컴포넌트 재사용.
- 종료 < 시작 인 경우: 저장 허용하되 종료를 무시(또는 헬퍼 텍스트). 1단계는 "종료는 선택, 검증 최소화".

**검증**: 종일 OFF → "15:00" 입력 → 저장 → 목록·월간 캘린더에 "15:00" 표시. 종일 ON 으로 저장 → 시간 미표시(현행 동작 유지).

---

## 3. Phase 2 — 화면 효율 (상세)

### 3.1 F-4 — 홈 탭 카드 접기

**현황**: [`TodayHub.tsx`](../../../src/mobile/components/Today/TodayHub.tsx) `space-y-4` 세로 스택, 카드 컴포넌트별 분리. 날씨/급식은 `col-span-2` 전체폭.

**설계 — 공통 래퍼 `CollapsibleCard`**:

```tsx
// src/mobile/components/common/CollapsibleCard.tsx
interface Props {
  cardId: string; // 'weather' | 'meal' | 'currentClass' | 'homeroomAttendance' | 'classAttendance'
  title: string; // "날씨" 등 — 헤더 좌측 라벨/아이콘
  icon?: string; // material-symbols
  summary?: ReactNode; // 접힌 상태 인라인 요약 ("맑음 18° · 강수 0%")
  children: ReactNode; // 펼친 상태 본문
}
// collapsed 상태는 useMobileHomeLayoutStore.collapsedCards[cardId] (persist)
// 헤더: flex justify-between px-4 py-3 min-h-[52px] cursor-pointer select-none
//   왼쪽: [icon] title  + (collapsed면) <span class="text-sp-muted text-xs ml-2 flex-1 truncate">{summary}</span>
//   오른쪽: chevron (material-symbols, text-sp-muted, rotate-180 when expanded, aria-hidden)
// 본문: id="card-body-{cardId}", overflow-hidden transition-all duration-200, collapsed면 max-h-0 + aria-hidden
// 헤더 button: aria-expanded={!collapsed} aria-controls="card-body-{cardId}"
```

- 각 카드 컴포넌트는 본문만 `children` 으로 넘기고, 요약 1줄 문자열은 카드가 자체 데이터로 만들어 `summary` 로 전달:
  - WeatherCard → `맑음 18° · 강수 0%` (로드 전 "날씨 불러오는 중")
  - MealCard → `중식 6찬` (없으면 "급식 정보 없음")
  - CurrentClassCard → `3교시 진행 중 · 12분 남음` (수업 외엔 "수업 시간 아님")
  - HomeroomAttendanceCard → `출석 23 · 결석 1 · 지각 1` (미체크면 "오늘 출결 미체크")
  - ClassAttendanceCard → `미체크 2학급`
- `useMobileHomeLayoutStore` 신규: `{ collapsedCards: Record<string, boolean> }` + `toggleCollapse(cardId)`. zustand persist (localStorage, 모바일).

**검증**: 날씨 카드 헤더 탭 → 본문 접힘 + "맑음 18°" 인라인 요약, chevron 회전. 앱 재시작 후에도 접힘 유지.

### 3.2 F-5 — 홈 카드 표시 on/off (설정)

**설계**:

```ts
// useMobileSettingsStore 확장
homeCardVisibility: {
  currentClass: boolean; // 기본 true
  homeroomAttendance: boolean; // 기본: 담임 반 있으면 true, 없으면 false
  classAttendance: boolean; // 기본 true
  weather: boolean; // 기본 true
  meal: boolean; // 기본 true
}
// 마이그레이션: 기존 persist 데이터에 필드 없으면 기본값 머지 (zustand merge 함수에서)
```

- `SettingsPage.tsx` 에 섹션 "홈 화면 카드 표시": 각 행 `min-h-[56px]`, `divide-sp-border`, 우측에 §3.2 공통 `Toggle`.
- `TodayHub.tsx` 렌더에서 `homeCardVisibility[x] === false` 면 해당 카드 제외 (SyncStatusBanner·날짜 헤더는 항상 표시 — 토글 대상 아님).

**공통 `Toggle` 컴포넌트** (`src/mobile/components/common/Toggle.tsx`):

```tsx
interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}
// <button role="switch" aria-checked={checked} aria-label={label}>
// 트랙: w-11 h-6 rounded-full, checked ? bg-sp-accent : bg-sp-border
// 노브: w-5 h-5 rounded-full bg-white translate-x-0 ↔ translate-x-5, transition
```

F-3 종일 토글, F-4 카드 접기와 별개로 이 Toggle 은 설정 토글 전반에 재사용.

**검증**: 설정에서 "급식 정보" OFF → 홈 탭에서 급식 카드 사라짐. 재시작 후 유지. 데스크톱 설정과 무관(모바일 UI prefs 전용).

### 3.3 F-6 — 출결 상태 버튼 라벨 가시성

**현황**: [`AttendanceCheckPage.tsx`](../../../src/mobile/pages/AttendanceCheckPage.tsx) `<span className="hidden sm:inline">{config.label}</span>` — `sm:`(640px)이라 모바일 전 구간에서 라벨 숨김. 버튼 5개(출석/지각/결석/조퇴/결과(공결)) `flex gap-1.5`, 아이콘만 표시. 지각(schedule)↔조퇴(exit_to_app) 아이콘 구분 어려움.

**설계 — 아이콘 위·라벨 아래 세로 스택, 5열 균등**:

```tsx
// 기존: <div className="flex gap-1.5"> ... <button className="flex items-center gap-1 px-3 py-2 ...">
//        <span className="material-symbols-outlined text-icon-md">{config.icon}</span>
//        <span className="hidden sm:inline">{config.label}</span>
// 변경:
<div className="flex gap-1">
  {STATUSES.map((config) => (
    <button
      key={config.key}
      aria-pressed={isActive(config.key)}
      className={`flex flex-col items-center justify-center flex-1 min-h-[52px] py-2 rounded-lg border
                  text-sm font-medium transition-colors ${isActive(config.key) ? config.activeColor : 'border-sp-border text-sp-muted'}`}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
        {config.icon}
      </span>
      <span className="text-[10px] leading-tight mt-0.5">{config.label}</span>
    </button>
  ))}
</div>
```

- 360px 기준 학생 행: 이름 영역(`flex-1 min-w-0 truncate`) + 버튼 그룹. 버튼 그룹이 넓어지므로 이름 영역 축소 trade-off — 이름 `truncate` 이미 적용, 학년반 `(2-3)` 표기 유지.
- `text-[10px] font-medium` 이 가독성 하한 — 더 줄이지 않음. `rounded-lg`(직각 금지).
- 활성 색상 토큰: `config.activeColor` 기존값 유지(`text-green-500 bg-green-500/10 border-green-500/40` 등). 아이콘·라벨 모두 버튼 text color 상속 → 자동 일치.
- `aria-pressed` 신규 추가(현재 코드에 없음) — 스크린리더가 "홍길동 출석 선택됨" 으로 읽음.

**검증**: 360px 뷰포트에서 5개 버튼 모두 라벨 노출, 각 버튼 ≥ 52px 높이. 지각/조퇴 텍스트로 구분 가능. 활성 버튼 색상·`aria-pressed=true`.

---

## 4. Phase 3 — 4탭 + FAB (상세)

### 4.0 현황

`App.tsx` 의 `MobileTab` = `'today' | 'schedule' | 'todo' | 'students' | 'attendance' | 'more'` (6개). 렌더 분기(`App.tsx:327-382`): `today`→`TodayHub`, `schedule`→`SchedulePage`, `todo`→`TodoPage`, `students`→`StudentsPage`(담임반 + 수업반 명단/좌석, 자체 `selectedClass` 선택기 보유), `attendance`→`ClassListPage`(수업 목록 → `ClassDetailPage` 의 출결/진도 서브탭), `more`→`MorePage`(메모·쌤도구·설정·추천 메뉴). 화면별 컨텍스트 FAB: `SchedulePage` `bottom-20 right-4` "일정 추가"(aria-label), `TodoPage` "할 일 추가"(aria-label `:333`). `App.tsx` 에 이미 좌우 스와이프(`touchStartX/Y`)로 탭 전환하는 제스처가 있음.

### 4.1 Touchpoints

| 레이어            | 파일                                                      | 변경                                                                                                                                            |
| ----------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| mobile/App.tsx    | `src/mobile/App.tsx`                                      | `MobileTab` → `'home' \| 'students' \| 'schedule' \| 'more'`; 렌더 분기 재구성; 전역 FAB 마운트; 좌우 스와이프 탭목록 4개로 축소                |
| mobile/components | `src/mobile/components/common/SegmentedControl.tsx`       | **신규** — 2~3개 옵션 세그먼트 토글 (담임↔수업, 일정↔할일 공용)                                                                                 |
| mobile/components | `src/mobile/components/common/QuickAddFab.tsx`            | **신규** — 전역 FAB + 액션 바텀시트 (현재 탭에 따라 액션 목록 구성)                                                                             |
| mobile/pages      | `src/mobile/pages/StudentsTab.tsx` (또는 App 내 인라인)   | **신규 컨테이너** — SegmentedControl(담임/수업) + 담임이면 `StudentsPage`(homeroom 고정), 수업이면 `ClassListPage`. `ClassDetailPage` 경로 보존 |
| mobile/pages      | `src/mobile/pages/ScheduleTodoTab.tsx`                    | **신규 컨테이너** — SegmentedControl(일정/할일) + `SchedulePage` 또는 `TodoPage`                                                                |
| mobile/pages      | `SchedulePage.tsx` / `TodoPage.tsx`                       | 자체 FAB 제거 (전역 FAB가 "일정 추가"/"할 일 추가" 액션 제공). 추가 모달 열기 함수는 ref/콜백으로 노출하거나 store 트리거                       |
| mobile/pages      | `MorePage.tsx`                                            | (변경 최소) — '더보기' 탭 유지, 메모·쌤도구·설정·추천 그대로                                                                                    |
| mobile/styles     | `mobile.css` / Tailwind                                   | 탭바·FAB·바텀시트에 `pb-[env(safe-area-inset-bottom)]`. 현행 `bottom-20` 고정값 → `bottom-[calc(5rem+env(safe-area-inset-bottom))]` 류          |
| mobile/components | `src/mobile/components/Onboarding/MigrationCoachmark.tsx` | **신규** — 첫 진입 1회 ("담임·수업은 '학생' 탭으로, 추가는 + 버튼으로 옮겼어요"). dismiss 시 localStorage 플래그                                |

### 4.2 탭 구성 (사용자 결정 §8)

| 탭         | label  | icon         | 내용                                                                                   |
| ---------- | ------ | ------------ | -------------------------------------------------------------------------------------- |
| `home`     | 홈     | `home`       | `TodayHub` (기존 `today` 리네이밍)                                                     |
| `students` | 학생   | `groups`     | SegmentedControl `[담임] [수업]` → 담임=`StudentsPage`(homeroom), 수업=`ClassListPage` |
| `schedule` | 일정   | `event_note` | SegmentedControl `[일정] [할 일]` → `SchedulePage` 또는 `TodoPage`                     |
| `more`     | 더보기 | `more_horiz` | `MorePage` (메모·쌤도구·설정·추천)                                                     |

전역 FAB(`QuickAddFab`) — 탭바 위 우측 `[+]`. 탭하면 `<MobileShareModal>` 류 바텀시트로 액션 리스트:

| 탭 컨텍스트 | FAB 액션 목록                                            |
| ----------- | -------------------------------------------------------- |
| 홈          | 출결 체크 / 할 일 추가 / 메모 작성 / 일정 추가           |
| 학생        | 출결 체크 / 메모 작성 / (담임 세그먼트면) 좌석 편집 진입 |
| 일정        | 일정 추가 / 할 일 추가                                   |
| 더보기      | FAB 숨김 (또는 메모 작성만)                              |

"출결 체크" 액션은 현재 시각의 교시·담임반으로 `AttendanceCheckPage` 진입 (TodayHub 의 카드 onClick 과 동일 로직 재사용 — `App.tsx` 의 `setAttendanceNav` 호출).

### 4.3 상태/흐름

- `App.tsx`: `activeTab` 4값. 새 state `studentsSeg: 'homeroom' | 'teaching'`(기본 `'homeroom'`), `scheduleSeg: 'schedule' | 'todo'`(기본 `'schedule'`). 세그먼트 값은 세션 동안만 유지(persist 불필요, 단 마지막 값 기억은 nice-to-have → `useMobileHomeLayoutStore` 류에 옵션 저장 가능).
- `ClassDetailPage` 진입: 학생 탭 > 수업 세그먼트 > `ClassListPage` > 클래스 선택 → `ClassDetailPage`. 뒤로가기로 `ClassListPage` → 학생 탭. (기존 `attendance` 탭 흐름과 동일, 컨테이너만 바뀜.)
- 전역 FAB 가시성: `activeTab !== 'more'` 일 때만 표시. `ClassDetailPage`/`AttendanceCheckPage` 같은 서브 화면 진입 시에는 FAB 숨김(서브 화면이 자체 헤더/액션을 가짐) — `App.tsx` 에서 `attendanceNav != null || moreSub != null` 이면 FAB 미렌더.
- `SchedulePage`/`TodoPage` 의 추가 모달: 현재는 컴포넌트 내부 `showAddModal` state. 전역 FAB 에서 열려면 — (a) 각 페이지를 forwardRef + imperative handle 로 `openAddModal()` 노출, 또는 (b) 가벼운 `useMobileUiTriggerStore`(zustand)에 `pendingAction: 'add-event' | 'add-todo' | null` 두고 페이지가 effect 로 소비. **(b) 권장** — 페이지 간 결합 없음.

### 4.4 UI 권고 (frontend-design 협업 필수)

- **탭바**: 4개 균등 분할 → 각 탭 ≥ 90px 폭(390px 기준) → 터치 타깃 넉넉. `pb-[env(safe-area-inset-bottom)]`.
- **SegmentedControl**: iOS 식 pill 토글. `bg-sp-surface rounded-lg p-0.5`, 선택 항목 `bg-sp-card text-sp-text shadow-sp-sm`(또는 `bg-sp-accent/15 text-sp-accent`), 비선택 `text-sp-muted`. 페이지 상단(헤더 아래) sticky. 각 옵션 `role="tab"` + `aria-selected`, 컨테이너 `role="tablist"`.
- **QuickAddFab**: `fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] w-14 h-14 rounded-full bg-sp-accent shadow-lg`. 액션 시트는 기존 `MobileShareModal` 패턴(`fixed inset-0 bg-black/40 ... items-end`) 재사용 — 각 액션 행 `min-h-[52px]` 아이콘+라벨.
- **MigrationCoachmark**: 첫 실행 시 하단 탭바 위에 말풍선/스포트라이트 1회. dismiss → `localStorage['mobile-nav-v2-coachmark'] = '1'`.
- 라운드 정책 준수(`rounded-xl`/`rounded-lg`만), 한국어.

### 4.5 Test Plan (Phase 3)

| ID    | 시나리오                                        | 기대                                                                   |
| ----- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| T3-1  | 앱 진입                                         | 하단 탭 4개(홈/학생/일정/더보기), 우하단 [+] FAB                       |
| T3-2  | 학생 탭 → [수업] 세그먼트                       | `ClassListPage` 표시 → 클래스 선택 → `ClassDetailPage`(출결/진도) 정상 |
| T3-3  | 일정 탭 → [할 일] 세그먼트                      | `TodoPage` 표시. 세그먼트 다시 [일정] → 월간 캘린더 복귀               |
| T3-4  | 일정 탭에서 [+] FAB → "일정 추가"               | 일정 추가 바텀시트(F-3 포함) 열림                                      |
| T3-5  | 홈 탭에서 [+] FAB → "출결 체크"                 | 현재 교시·담임반 `AttendanceCheckPage` 진입                            |
| T3-6  | `ClassDetailPage`/`AttendanceCheckPage` 진입 중 | 전역 FAB 숨김                                                          |
| T3-7  | 더보기 탭                                       | FAB 숨김, MorePage(메모·쌤도구·설정·추천) 정상                         |
| T3-8  | iOS PWA 실기기                                  | 탭바·FAB가 홈 인디케이터와 안 겹침(safe-area)                          |
| T3-9  | 첫 실행                                         | 마이그레이션 코치마크 1회 → dismiss 후 재실행 시 안 뜸                 |
| T3-10 | 좌우 스와이프(App.tsx 기존 제스처)              | 4개 탭 사이 순환, 세그먼트/서브화면과 충돌 없음                        |

### 4.6 Open Questions (Phase 3 구현 전)

1. `SchedulePage`/`TodoPage` 의 추가 모달 열기 — 트리거 store(b안) vs imperative ref(a안). (b안 권장하지만 코드 확인)
2. 좌우 스와이프 탭 전환이 SegmentedControl 영역에서도 발동하면 혼란 — 세그먼트 영역에서는 스와이프 무시할지.
3. `StudentsPage` 가 이미 가진 `selectedClass`(담임반/수업반 명단) 선택기와 새 세그먼트(담임/수업)의 관계 — 담임 세그먼트는 `StudentsPage` 를 `selectedClass='homeroom'` 고정으로 쓰고, 수업 세그먼트는 `ClassListPage` 로? 아니면 `StudentsPage` 의 selectedClass 를 그대로 활용? → 후자가 코드 변경 적음, 단 출결/진도 진입은 `ClassListPage` 경로라 분기 필요.
4. 전역 FAB 의 "메모 작성" — `MemoPage` 의 추가 흐름 재사용 방법.

---

## 5. Phase 4 — 스와이프 빠른 기록 (상세)

### 5.0 현황

`StudentsPage.tsx` 명단 뷰(`HomeroomListView`/`TeachingListView`, 대략 `:717-880`)는 학생 행 탭 → `StudentQuickActionSheet`(바텀시트, `:908-1003`, 출결/기록/연락처 탭). 스와이프 액션 없음. 햅틱은 `ClassProgressEntryItem.tsx:46-49` `if ('vibrate' in navigator) navigator.vibrate(10)` 만 존재. 칭찬/일반 메모는 `useMobileStudentRecordsStore` 의 `bridgeAttendanceRecord` 류 + 학생기록(memo) 경로.

### 5.1 Touchpoints

| 레이어            | 파일                                                                                | 변경                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| mobile/components | `src/mobile/components/common/SwipeRow.tsx`                                         | **신규** — 포인터 이벤트(`onPointerDown/Move/Up`) 기반 좌/우 스와이프-투-리빌 래퍼. 무라이브러리 |
| mobile/components | `src/mobile/components/Class/StudentSwipeRow.tsx`                                   | **신규** — `SwipeRow` 위에 학생 행 + 좌(지각/결석)·우(칭찬 메모) 액션 버튼 구성                  |
| mobile/pages      | `src/mobile/pages/StudentsPage.tsx`                                                 | 명단 뷰의 학생 행을 `StudentSwipeRow` 로 교체. 시각 버튼/바텀시트 경로 그대로 유지(대체 경로)    |
| mobile/components | `src/mobile/components/Class/PraiseMemoSheet.tsx`                                   | **신규(또는 기존 메모 작성 시트 재사용)** — 칭찬 메모 빠른 입력                                  |
| mobile/components | `src/mobile/components/common/Toast.tsx` (있으면 재사용/없으면 신규)                | Undo 토스트 (5초, "되돌리기" 버튼)                                                               |
| mobile/stores     | `src/mobile/stores/useMobileStudentRecordsStore.ts` / `useMobileAttendanceStore.ts` | 지각/결석 빠른 기록 액션 + 직전 기록 스냅샷 보관(Undo 용)                                        |
| mobile/components | `src/mobile/components/Onboarding/SwipeHintCoachmark.tsx`                           | **신규** — 명단 첫 진입 1회 ("좌/우로 밀어 빠르게 기록")                                         |
| mobile/hooks      | (선택) `src/mobile/hooks/useHaptic.ts`                                              | `navigator.vibrate` 가드 래퍼 (`ClassProgressEntryItem` 도 마이그레이션)                         |

### 5.2 인터랙션 설계

- **SwipeRow**: `pointerdown` 에서 시작 X 기록 → `pointermove` 에서 `transform: translateX(dx)` (좌/우 최대 ±80px). 임계(`|dx| ≥ 56px`) 넘으면 해당 방향 액션 영역 노출 고정. `pointerup` 에서: 임계 미만이면 원위치 스냅, 이상이면 액션 영역 노출 상태 유지. 액션 영역의 버튼을 탭해야 실제 실행 — **스와이프 자체로는 아무 변경 없음**. 다른 행 스와이프/탭 밖 클릭 → 모든 행 닫힘. 세로 스크롤 우선(수직 이동이 수평보다 크면 스와이프 취소).
- **오른쪽 스와이프** → 초록 영역 "칭찬 메모" 버튼 → 탭 시 `PraiseMemoSheet`(학생명 프리필, 1줄 입력) → 저장 시 학생기록에 카테고리 `칭찬` memo 추가.
- **왼쪽 스와이프** → 노랑 "지각" + 빨강 "결석" 버튼 → 탭 시 즉시 기록(현재 교시 = `useCurrentPeriod`, 수업 시간 외면 담임 출결 `period=0`) + Undo 토스트 5초. 토스트 "되돌리기" → 직전 스냅샷 복원.
- 햅틱: 임계 도달 시 + 액션 실행 시 `navigator.vibrate(10)` (지원 기기만; iOS 무시 — 단독 의존 금지). 시각 피드백(색·애니메이션) 항상 동반.
- **affordance 항상 유지**: 학생 행 탭 → `StudentQuickActionSheet`(기존) 경로 그대로. 스와이프는 보너스. 첫 진입 1회 `SwipeHintCoachmark`.
- a11y: 스와이프 못 하는 사용자는 기존 탭→바텀시트 경로로 동일 작업 가능. 액션 버튼에 `aria-label`.

### 5.3 Test Plan (Phase 4)

| ID   | 시나리오                          | 기대                                                             |
| ---- | --------------------------------- | ---------------------------------------------------------------- |
| T4-1 | 학생 행 오른쪽 스와이프           | 초록 "칭찬 메모" 버튼 노출. 스와이프만으로는 기록 변화 없음      |
| T4-2 | "칭찬 메모" 탭 → 입력 → 저장      | 학생기록에 칭찬 메모 추가, 시트 닫힘                             |
| T4-3 | 학생 행 왼쪽 스와이프 → "결석" 탭 | 현재 교시(또는 담임)에 결석 기록 + "되돌리기" 토스트 5초         |
| T4-4 | "되돌리기" 탭                     | 결석 기록 취소(직전 상태 복원)                                   |
| T4-5 | 다른 행 스와이프                  | 이전 행 자동 닫힘                                                |
| T4-6 | 세로 스크롤 중 손가락 약간 좌우   | 스와이프 발동 안 함(스크롤 우선)                                 |
| T4-7 | 시각 버튼/바텀시트 경로           | 기존대로 동작(스와이프와 무관하게 항상 가능)                     |
| T4-8 | Android 기기                      | 임계·실행 시 미세 진동. iOS — 진동 없이 시각 피드백만, 정상 동작 |
| T4-9 | 첫 진입                           | 스와이프 힌트 코치마크 1회 → dismiss 후 안 뜸                    |

### 5.4 Open Questions (Phase 4 구현 전)

1. 칭찬 메모가 들어갈 학생기록 카테고리/엔티티 필드 — `useMobileStudentRecordsStore` 의 기존 메모 추가 API 확인.
2. 좌측 스와이프 "결석" 기록 대상 — 현재 교시 자동? 수업 시간 외엔 담임 출결? 사용자가 교시를 고를 수 있게 작은 선택지를 줄지.
3. Undo 구현 — 낙관적 업데이트 + 스냅샷 롤백 (Drive 동기화 중이면 어떻게? 토스트 만료 후 push).
4. `SwipeRow` 무라이브러리 구현 vs `framer-motion`/`react-swipeable` 도입 — 번들 크기 vs 구현 난이도.

---

## 6. Phase 5 — 모바일 독립 설정 (상세)

### 6.0 현황

`SettingsPage.tsx`: 학교/교사/학급 = `InfoRow`(읽기 전용), 테마만 변경, "데스크톱 앱에서 상세 설정을 변경할 수 있습니다" 안내. `useMobileSettingsStore` 는 `settingsRepository.getSettings()`(IndexedDB `settings` 키) 를 읽어 `settings` state 채움, `autoSyncInterval` 만 별도 localStorage. 동기화는 `useMobileDriveSyncStore` + `syncRegistry`(공유) 경로. 데스크톱→모바일 다운로드는 있으나 모바일→데스크톱 설정 업로드는 (autoSyncInterval 제외) 안 함. `OnboardingFlow.tsx` 는 환영 슬라이드 + "Google 계정으로 시작하기"만 (학교/교시 입력 스텝 없음).

### 6.1 Touchpoints

| 레이어            | 파일                                                            | 변경                                                                                                                                                              |
| ----------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| mobile/pages      | `src/mobile/pages/SettingsPage.tsx`                             | "기본 정보" 섹션을 읽기→편집 가능: 학교명·교사명·담임 학급 입력 + "교시 시간" 편집 진입(또는 인라인)                                                              |
| mobile/components | `src/mobile/components/Settings/PeriodTimesEditor.tsx`          | **신규** — 1~N교시 시작/종료 시각(`<input type="time">`) 편집 + 행 추가/삭제                                                                                      |
| mobile/stores     | `src/mobile/stores/useMobileSettingsStore.ts`                   | `updateSettings(patch)` 액션 추가 → `settingsRepository.saveSettings(merged)` + (옵션) 동기화 트리거. **mobile- 접두사 deviceId 보존**(기존 가드 유지)            |
| mobile/stores     | `src/mobile/stores/useMobileDriveSyncStore.ts` / `syncRegistry` | `settings` 파일이 모바일에서 변경되면 push 대상에 포함되도록 — `syncRegistry` 단일 소스 활용                                                                      |
| mobile/components | `src/mobile/components/Settings/SettingsSyncConflictModal.tsx`  | **신규** — push 직전 원격 `settings` 가 로컬보다 새로우면 사용자 선택("내 변경 유지" / "원격으로 덮어쓰기") — first-sync-confirmation 패턴                        |
| mobile/components | `src/mobile/components/Onboarding/OnboardingFlow.tsx`           | 슬라이드에 "학교 정보"·"교시 시간" 입력 스텝 추가 (PC 없이 첫 설정 완결) — `design examples/onboarding_step_2_school_info`, `onboarding_step_3_period_times` 참조 |

### 6.2 범위·순서 (사용자 결정 §8)

1. **F-13 교시 시간 편집** 먼저 — `PeriodTimesEditor` + `updateSettings({ periodTimes })`. 동기화 안전망(6.3) 포함. 검증 완료 후:
2. **F-14 학교/교사/학급 편집** — 같은 `updateSettings` 경로. (담임 학급 변경은 출결/명단 매핑에 영향 → 변경 시 경고 토스트.)
3. **F-16 온보딩 보강** — F-13/14 의 편집 폼을 온보딩 스텝으로 재사용.

### 6.3 동기화 안전망 (위험 大 — 데스크톱→모바일 단방향을 양방향으로)

- `updateSettings` → 로컬 저장(`settingsRepository.saveSettings`) + `lastModifiedAt` 갱신.
- 다음 동기화 push 전: 원격 `settings` 의 수정시각 vs 로컬 — 원격이 더 새로우면 `SettingsSyncConflictModal` 로 사용자 결정. 자동 덮어쓰기 금지.
- push 전 원격 read 가 `null` 이 아님을 확인(note-cloud-sync 의 `storage.read !== null` 가드 패턴) — 빈 원격으로 인한 로컬 유실 방지.
- `sync.deviceId` 의 `mobile-` 접두사 보존 로직(`useMobileSettingsStore.load` 기존) 유지 — 편집·동기화 후에도 모바일 deviceId 가 PC deviceId 로 오염되지 않게.
- 데스크톱 측 동시 편집 가드는 범위 밖(데스크톱은 단일 사용자 가정) — 단 모바일에서 push 한 변경이 데스크톱 다음 sync 에 반영되는지 E2E 확인.

### 6.4 UI 권고 (frontend-design 협업 필수)

- "기본 정보" 섹션: `InfoRow` → `InfoEditRow`(label + `<input>` + 저장 시 debounce 또는 명시 "저장" 버튼). 학급 변경은 확인 다이얼로그.
- `PeriodTimesEditor`: 행마다 `[N교시] [시작 ▾] [종료 ▾] [✕]` + "+ 교시 추가". 시작/종료 `<input type="time">`. 시작 ≥ 종료 등 검증 시 행 빨간 테두리 + 헬퍼. 저장 시 오름차순 정렬·번호 재부여.
- `SettingsSyncConflictModal`: 두 선택지 + 각 측 "마지막 수정: …" 표시. `role="alertdialog"`.
- 온보딩 스텝: `design examples/` 의 onboarding 목업 톤 따름.

### 6.5 Test Plan (Phase 5)

| ID   | 시나리오                                                | 기대                                                                       |
| ---- | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| T5-1 | 설정 > 교시 시간 편집 → 3교시 시작 10:35 로 변경 → 저장 | `settings.periodTimes` 갱신, 홈 탭 현재교시 판정·출결 드롭다운 시각에 반영 |
| T5-2 | 설정 > 학교명 변경 → 저장                               | `settings.schoolName` 갱신, 홈 헤더 반영                                   |
| T5-3 | 담임 학급 변경                                          | 확인 다이얼로그 → 변경 시 명단/출결 매핑 경고 토스트                       |
| T5-4 | 모바일에서 설정 변경 → Drive 동기화 → 데스크톱 sync     | 데스크톱 설정에 모바일 변경 반영 (E2E)                                     |
| T5-5 | 원격 `settings` 가 로컬보다 새로운 상태에서 모바일 편집 | `SettingsSyncConflictModal` 표시, 자동 덮어쓰기 안 함                      |
| T5-6 | 원격 `settings` 가 비어있는(또는 read null) 상태        | 로컬 설정이 빈 원격으로 덮어써지지 않음                                    |
| T5-7 | 신규 기기 — 온보딩에서 학교·교시 시간 입력              | PC 없이 첫 설정 완결, 이후 정상 사용                                       |
| T5-8 | 동기화 후 deviceId                                      | 여전히 `mobile-` 접두사 (PC deviceId 로 오염 안 됨)                        |

### 6.6 Open Questions (Phase 5 구현 전)

1. `settingsRepository.saveSettings` 가 IndexedDB 에 쓴 뒤 모바일 동기화 push 가 `settings` 파일을 실제로 올리는지 — `syncRegistry` / `useMobileDriveSyncStore` 의 push 파일 목록 확인.
2. 원격 `settings` 수정시각 비교 기준 — `settings` 객체 안에 `lastSyncedAt`/`updatedAt` 필드가 있나, 아니면 Drive 파일 메타데이터.
3. F-14 우선 포함 여부 — 사용자 결정상 "교시 시간만 우선, 학급 정보는 후속". F-14 를 같은 릴리즈에 넣을지 별도로 뺄지.
4. 온보딩 스텝 추가가 기존 OAuth 플로우 순서와 충돌하지 않는지(`useGoogleAuth` 흐름).

---

## 7. Test Plan (Phase 1+2) — ✅ 전부 통과 (Playwright E2E, 390px)

| ID   | 시나리오                                      | 기대                                                        |
| ---- | --------------------------------------------- | ----------------------------------------------------------- |
| T-1  | 25명 담임 학급에서 홈 탭 진입                 | 출결 요약 "전체 25" 표시, 30 미표시                         |
| T-2  | 담임 반 미설정 상태로 홈 탭 진입              | HomeroomAttendanceCard 대신 안내 카드 + 설정 딥링크         |
| T-3  | 11:05(3교시 중) 수업 출결 진입                | 헤더 "3교시 출결", 드롭다운 기본 "3교시"·현재 뱃지          |
| T-4  | 출결 화면에서 드롭다운 "5교시" 선택 후 저장   | `period:5` 로 기록, 헤더 "5교시 출결"                       |
| T-5  | ClassDetailPage 출결 서브탭 진입              | 1교시 고정 아님 — 현재 교시 기본 선택                       |
| T-6  | 담임 출결 진입                                | 교시 드롭다운 없음, "담임 출결"                             |
| T-7  | 일정 추가 — 종일 OFF, "15:00" 입력, 저장      | 목록·월간 캘린더에 "15:00" 표시                             |
| T-8  | 일정 추가 — 종일 ON 으로 저장                 | 시간 미표시(현행 유지)                                      |
| T-9  | 날씨 카드 헤더 탭 → 접기 → 앱 재시작          | 접힘 + "맑음 18°" 요약, 재시작 후 유지                      |
| T-10 | 설정 "급식 정보" OFF                          | 홈 탭에서 급식 카드 사라짐, 재시작 후 유지                  |
| T-11 | 360px 뷰포트 출결 버튼                        | 5개 버튼 모두 라벨 노출, 각 ≥52px, 활성 색상·`aria-pressed` |
| T-12 | 회귀 — 기존 출결 저장/조회, 일정 조회, 동기화 | 변화 없음                                                   |
| T-13 | `npx tsc --noEmit` / `npm run lint`           | 에러 0                                                      |

QA 방식: `npm run dev` 브라우저 + DevTools 모바일 에뮬레이션(360px), 가능하면 실기기(iOS PWA `m.ssampin.com`)에서 safe-area·`<input type="time">`·`navigator.vibrate` 확인.

---

## 8. Open Questions (해소됨 — Phase 1+2 구현 시 코드 확인 완료)

1. ✅ `useMobileStudentStore.students`(`readonly Student[]`) 가 담임 반 명단 — `isStudentActive` 필터로 활성 수 계산.
2. ✅ `AttendanceCheckPage` 의 `getTodayRecord(classId, period)` / `saveRecord({period,...})` / 초기화 effect deps — 모두 `selectedPeriod` 로 치환 완료.
3. ✅ `SchoolEvent` 에 `time?`("HH:mm" 또는 "HH:mm - HH:mm") + `startTime?`·`endTime?`("HH:mm") 모두 존재 — 셋 다 저장.
4. ✅ `useMobileSettingsStore` 는 persist 미들웨어 미사용 — 홈 카드 prefs 는 별도 `useMobileHomeLayoutStore`(localStorage) 로 분리(autoSyncInterval 패턴). merge 불필요.
5. ✅ `AttendanceCheckPage` 의 유일한 외부 호출처는 `App.tsx`(TodayHub 경유)와 `ClassAttendanceTab`(embedded). `ClassListPage`/`ClassDetailPage` 는 `AttendanceCheckPage` 를 직접 호출하지 않음. → `ClassAttendanceTab` 에서만 `currentPeriod` 주입.

> Phase 3·4·5 의 구현 전 확인 항목은 각각 §4.6 / §5.4 / §6.6 참조.

---

## 9. Next Steps

1. **Phase 1+2: ✅ 완료** — 구현·코드리뷰 반영·Playwright E2E 검증·커밋(`ddfa59f`, 브랜치 `feat/mobile-ux-improvement`).
2. **Phase 3 착수** — §4.6 Open Questions 코드 확인 → `/pdca do`. 네비 재편(`MobileTab` 4값, `SegmentedControl`/`QuickAddFab` 신규, `SchedulePage`/`TodoPage` 자체 FAB 제거). **UI 작업 `frontend-design` 스킬 협업 필수.** main 에 점진 머지.
3. **Phase 5** — §6.6 확인 → `PeriodTimesEditor` + `updateSettings` + 동기화 안전망(§6.3). F-13 먼저, 검증 후 F-14, 그 다음 F-16(온보딩).
4. **Phase 4** — §5.4 확인 → `SwipeRow`/`StudentSwipeRow` + Undo 토스트 + 코치마크. frontend-design 협업 비중 큼.
5. 각 Phase 완료 시 `/pdca analyze` → Gap < 90% 면 `/pdca iterate`. **전체 완료 후 단일 릴리즈** (Release Workflow 8단계, 모바일 버전 텍스트 3곳 + release-notes 포함).
6. v2.1.x 릴리즈(Release Workflow 8단계 — 모바일 버전 텍스트 3곳 포함).
7. 별도 design 패스로 Phase 3·4·5 상세화 (`mobile-ux-improvement.design.md` §4~6 확장 또는 분리 문서).
