---
template: design
version: 1.2
feature: mobile-ux-improvement
date: 2026-05-12
author: pblsketch
project: ssampin
version_target: Phase 1+2 → v2.1.x · Phase 3+4+5 → v2.2.x
depends_on: docs/01-plan/features/mobile-ux-improvement.plan.md
status: Draft
---

# 쌤핀 모바일 UI/UX 개선 설계서

> Plan 문서의 요구사항(F-1 ~ F-16)을 컴포넌트·상태·흐름·검증으로 변환한다.
> **Phase 1+2(v2.1.x)는 상세 설계**, **Phase 3·4·5(v2.2.x)는 방향만 잡고 별도 design 패스에서 상세화**한다.
> 모바일은 Clean Architecture의 adapters 상응 계층(`src/mobile/`) — 도메인 규칙은 `@domain/*` 재사용, 모바일 전용 store/UI만 추가.
> UI 컴포넌트 신규/대규모 변경 시 `/pdca do` 단계에서 **`frontend-design` 스킬과 협업**(프로젝트 피드백 메모리). 아래 UI 권고는 `bkit:frontend-architect` 검토를 반영함.

---

## 0. Phase별 범위 / 릴리즈

| Phase | 내용                                                                       | 릴리즈 | 본 문서 |
| ----- | -------------------------------------------------------------------------- | ------ | ------- |
| 1     | F-1 출결 총원 실데이터 · F-2 교시 드롭다운 · F-3 일정 시간 필드            | v2.1.x | §2 상세 |
| 2     | F-4 카드 접기 · F-5 카드 숨기기 · F-6 출결 버튼 라벨 가시성                | v2.1.x | §3 상세 |
| 3     | F-7 4탭+FAB · F-8 전역 FAB · F-9 터치·safe-area                            | v2.2.x | §4 개요 |
| 4     | F-10 스와이프-투-리빌 · F-11 햅틱 · F-12 코치마크                          | v2.2.x | §5 개요 |
| 5     | F-13 교시 시간 편집 · F-14 학급 정보 편집 · F-15 설정 동기화 · F-16 온보딩 | v2.2.x | §6 개요 |

> 권장 구현 순서(저위험·고효용 우선): **F-6 → F-3 → F-1 → F-2 → F-4 → F-5** → (이후 Phase 3~5).

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

## 4. Phase 3 — 4탭 + FAB (개요, v2.2.x에서 상세화)

- `App.tsx` `MobileTab` → `'home' | 'students' | 'schedule' | 'more'`. `'today'`→`'home'` 리네이밍.
- '학생' 탭: 내부 세그먼트 컨트롤(담임 ↔ 수업) — 기존 `StudentsPage` 의 담임/수업 분기를 세그먼트로 노출. ClassDetailPage 경로 보존.
- '일정' 탭: 내부 세그먼트(일정 ↔ 할일) — 기존 SchedulePage + TodoPage를 한 탭에. URL/네비 state 에 sub-tab 보존.
- 전역 FAB: 탭바 위 우측, 탭 → 바텀시트 "출결 체크 / 메모 작성 / 할 일 추가 / 일정 추가". 화면별 컨텍스트 FAB(SchedulePage `bottom-20 right-4` 일정추가 FAB 등)는 제거하고 전역 FAB로 일원화 — 라우터 레벨에서 FAB 액션 목록을 현재 탭에 맞게 구성.
- `env(safe-area-inset-bottom)` — 탭바·FAB·바텀시트 패딩. 현행 고정 `bottom-20` 류 재검토.
- 마이그레이션 UX: 첫 진입 코치마크("담임·수업은 '학생' 탭으로, 추가는 + 버튼으로 옮겨졌어요"). 릴리즈 노트 명시.
- **결정 필요(설계 패스에서)**: '더보기' 탭에 무엇을 남길지(설정·도구·동기화 등), 세그먼트 컨트롤의 시각 형태.

## 5. Phase 4 — 스와이프 빠른 기록 (개요)

- `StudentsPage.tsx` 명단 뷰 카드: 포인터 이벤트 기반 좌/우 스와이프(무라이브러리 우선; 어려우면 경량 lib). 임계 거리 도달 → 카드가 밀리며 뒤에 액션 버튼 노출.
  - 오른쪽 스와이프 → 초록 "칭찬 메모" 버튼 노출. 탭 → 칭찬 메모 작성 시트(기존 메모 작성 UI 재사용).
  - 왼쪽 스와이프 → 노랑 "지각" + 빨강 "결석" 버튼 노출. 탭 → 즉시 기록 + Undo 토스트(5초).
- **즉시 실행 금지** — 스와이프는 버튼 노출까지만. 다른 카드 스와이프하거나 탭 밖 클릭 시 닫힘.
- 햅틱: 임계점 도달·실행 시 `if ('vibrate' in navigator) navigator.vibrate(10)` — iOS 무시(보조 피드백, 단독 의존 금지). `ClassProgressEntryItem` 패턴 재사용.
- 시각 버튼 affordance 항상 유지(바텀시트의 기존 버튼들). 최초 1회 코치마크로 스와이프 힌트.
- 대체 경로: 스와이프 불가 사용자는 학생 탭 → 바텀시트(기존)로 동일 작업 — a11y 보장.
- **결정 필요(설계 패스에서)**: 칭찬 메모가 학생기록 어느 카테고리로 들어가는지, 결석 기록 시 교시(현재 교시? 담임 출결?), Undo 구현(낙관적 업데이트 롤백).

## 6. Phase 5 — 모바일 독립 설정 (개요)

- `SettingsPage.tsx`: 교시 시간(`periodTimes`) 편집 UI 추가 → `useMobileSettingsStore` 갱신. (F-13, 우선)
- 학교명/교사명/담임 학급 `InfoRow`(읽기 전용) → 편집 입력. (F-14, 동기화 안정성 확인 후)
- 설정 쓰기-백: 모바일 변경 → Drive 동기화로 데스크톱 반영. `syncRegistry` 단일 경로 사용. 쓰기 전 원격 `storage.read !== null` 안전망(note-cloud-sync 패턴). 충돌 시 사용자 확인 모달(first-sync-confirmation 패턴).
- `OnboardingFlow.tsx` 에 학교/교시 시간 입력 스텝(이미 일부 있으면 확장) — PC 없이 첫 설정 완결.
- **위험**: 데스크톱→모바일 단방향이던 설정을 양방향으로 여는 것 — 손상 시 영향 큼. F-13(교시 시간)만 먼저, 검증 후 F-14.
- **결정 필요(설계 패스에서)**: 충돌 해상도 UX, periodTimes 편집 폼 형태, 데스크톱 측 동시 편집 가드.

---

## 7. Test Plan (Phase 1+2)

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

## 8. Open Questions (구현 착수 전 코드 확인)

1. `useMobileStudentStore` 의 담임 반 학생 목록 셀렉터 정확한 이름/시그니처 (F-1).
2. `AttendanceCheckPage` 의 `getTodayRecord`/`saveRecord` 가 `period` 를 키의 일부로 쓰는 정확한 위치 (F-2 — `selectedPeriod` 로 일괄 치환 범위).
3. `SchoolEvent` 엔티티에 `endTime?` 필드 존재 여부 (F-3 — 없으면 1단계 `time` 만, `endTime` 은 후속).
4. `useMobileSettingsStore` persist merge 함수 존재 여부 (F-5 마이그레이션 — 없으면 추가).
5. `ClassListPage`(구 AttendanceListPage)에서 `AttendanceCheckPage` 진입 경로의 `period` 전달 방식 (F-2 — `currentPeriod` 주입 추가 필요 지점).

---

## 9. Next Steps

1. Open Questions(§8) 코드로 확인 → 본 문서 보정.
2. `/pdca do mobile-ux-improvement` — 권장 순서 **F-6 → F-3 → F-1 → F-2 → F-4 → F-5**. UI 컴포넌트(`CollapsibleCard`/`Toggle`/교시 드롭다운/출결 버튼) 작업 시 **`frontend-design` 스킬 협업**.
3. Phase 1+2 완료 → `/pdca analyze` → Gap < 90% 면 `/pdca iterate`.
4. v2.1.x 릴리즈(Release Workflow 8단계 — 모바일 버전 텍스트 3곳 포함).
5. 별도 design 패스로 Phase 3·4·5 상세화 (`mobile-ux-improvement.design.md` §4~6 확장 또는 분리 문서).
