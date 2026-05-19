---
template: design
version: 1.2
feature: multi-date-attendance
date: 2026-05-19
author: pblsketch
project: ssampin
version_target: v2.1.0
---

# 여러 날짜 출결 일괄 입력 Design Document

> **Summary**: 신규 공용 `MultiDatePicker`(single/range/multi 3-mode) 분리 신설, 공용 유틸 `calendarUtils.ts` 추출로 기존 `CalendarPicker` 회귀 0 보장. 담임 기록 입력 모드는 발견성 개선 + 신 컴포넌트로 교체, 수업관리 출결 탭 단일 교시 모드에는 신규 적용, 매트릭스 뷰는 본 Phase에서 제외. 모바일은 Bottom Sheet 형식. 도메인·스토어 무수정, UI 레이어 fan-out 패턴 유지.
>
> **Project**: ssampin
> **Version Target**: v2.0.5 → v2.1.0
> **Author**: pblsketch
> **Date**: 2026-05-19
> **Status**: Draft v0.1
> **Planning Doc**: [multi-date-attendance.plan.md](../../01-plan/features/multi-date-attendance.plan.md) (v0.2 Ready for Design)
> **Design Partner**: `bkit:frontend-architect` agent (2026-05-19 협업 1회 완료, 산출물 본 문서에 반영)

### Pipeline References

| Phase                | Document                                                                         | Status |
| -------------------- | -------------------------------------------------------------------------------- | :----: |
| Phase 1 (Schema)     | 도메인 무변경 — `AttendanceRecord` 기존 entity 그대로                            |   ✅   |
| Phase 2 (Convention) | 코딩 컨벤션 `docs/coding-conventions.md` + 디자인 시스템 `docs/design-system.md` |   ✅   |
| Phase 3 (Mockup)     | 본 문서 §6 와이어프레임                                                          |   ✅   |
| Phase 4 (API)        | 본 문서 §4 — 도메인 API 무변경, 새 컴포넌트 API만                                |   ✅   |

---

## 1. Overview

### 1.1 Design Goals

1. **신규 `MultiDatePicker` 신설** — 기존 `CalendarPicker` 회귀 0을 보장하며 single/range/multi 3-mode 통합 제공
2. **3-Phase 통합 적용** — 담임 기록 입력(Phase 1) → MultiDatePicker(Phase 2) → 수업관리 단일 교시 출결(Phase 3)
3. **도메인 무수정** — `saveDayAttendance(classId, date, byPeriod)` API 그대로, UI 레이어에서 N번 fan-out
4. **WCAG 2.1 AA 준수** — `role="grid"` + 화살표 키 네비게이션 + `aria-selected` 상태 + focus-visible
5. **Plan FR-01~FR-11 전체 충족** — 11개 기능 요구사항 단정적으로 구현

### 1.2 Design Principles

- **분리 원칙 (Single Responsibility)** — `CalendarPicker`(단일) / `MultiDatePicker`(다중) 책임 분리. `calendarUtils.ts` 공유 유틸로 실질 중복 < 10줄
- **명시적 prop > 함수 분기** — `mode: 'single' | 'range' | 'multi'` 필수 prop. 잘못된 prop 조합 (예: `mode='single'` + `multiValues`)은 TS 오버로드 시그니처로 컴파일 타임 차단
- **fan-out at UI layer** — 다중 날짜 저장은 항상 UI 컴포넌트에서 `for (date of dates) saveDayAttendance(...)` 루프. 도메인·스토어·유스케이스는 단일 책임 유지
- **회귀 게이트 메타테스트** — `CalendarPicker` 사용처 4~6곳에 회귀 0 메타테스트 추가 + `dateRangeMode` 기존 시나리오 유지 메타테스트 추가
- **무외부 헤드리스 정책 유지** — react-day-picker 등 외부 라이브러리 미도입. focus-trap-react 예외 정책 그대로

---

## 2. Architecture

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ adapters/components/common/                                         │
│                                                                     │
│   calendarUtils.ts (신규 — 공유 유틸 추출)                          │
│     ├─ getCalendarDays(year, month): Date[]                         │
│     ├─ formatDateStr(d): string  // "YYYY-MM-DD"                    │
│     ├─ parseDateStr(s): Date                                        │
│     ├─ isSameDay(a, b): boolean                                     │
│     ├─ DAY_LABELS: readonly string[]                                │
│     ├─ enumerateRange(start, end): string[]    (신규)               │
│     └─ getThisWeekDates(today, weekdaysOnly?): string[]    (신규)   │
│                                                                     │
│   CalendarPicker.tsx (기존 — 회귀 0, 유틸만 calendarUtils로 위임)   │
│                                                                     │
│   MultiDatePicker.tsx (신규 — single | range | multi)               │
│     ├─ <Trigger>                                                    │
│     ├─ <Panel>                                                      │
│     │   ├─ <Header>      월 네비 + 모드 토글(optional)              │
│     │   ├─ <WeekdayRow>  요일 헤더                                  │
│     │   ├─ <DateGrid>    role="grid" 42 cells                       │
│     │   ├─ <PresetRow>   이번주 / 이번주평일 / 다음주 / 초기화     │
│     │   ├─ <ChipList>    선택 칩 (multi 모드)                       │
│     │   └─ <Footer>      오늘 / 카운터 / 확정                       │
│     └─ Portal 렌더링 옵션 (z-[9999])                                │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ Phase 1+ Phase 2 사용처                                             │
│                                                                     │
│   Homeroom/Records/InputMode.tsx (수정)                             │
│     ├─ dateRangeMode → MultiDatePicker (mode='range' or 'multi')   │
│     ├─ 토글 노출 위치 강화 (출결 카테고리 선택 시 즉시 부각)        │
│     └─ batchSave: 기존 createDateRange 루프 유지                    │
│                                                                     │
│   common/CommandPalette/commandRegistry.ts (수정)                   │
│     └─ "여러 날 출결" → 담임 기록 라우팅 + 토글 자동 ON             │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ Phase 3 사용처                                                      │
│                                                                     │
│   ClassManagement/AttendanceTab.tsx (단일 교시 모드만)              │
│     └─ 상단 <input type="date"> → MultiDatePicker                   │
│        ├─ 단일 모드: 기존 동작                                      │
│        └─ 다중 모드: handleSave가 dates.forEach(saveOne) fan-out   │
│                                                                     │
│   ClassManagement/AttendanceMatrixView.tsx (본 Phase 제외)          │
│     └─ 현행 유지. 안내 문구만 추가                                  │
│                                                                     │
│   mobile/pages/AttendanceCheckPage.tsx                              │
│     └─ Bottom Sheet 멀티픽 (mobileSheet=true)                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

```
[사용자]
  ↓ 1. 날짜 선택 (단일/범위/다중)
[MultiDatePicker]
  ↓ 2. onChange 콜백 → Set<string> 혹은 [string]
[InputMode / AttendanceTab / AttendanceCheckPage]
  ↓ 3. 저장 트리거 (사용자 "저장" 클릭)
[로컬 fan-out 루프]
  for (const date of dates) {
    await saveDayAttendance(classId, date, byPeriod);
    progress++;
  }
  ↓ 4. 진행률 / 스킵 추적
[useTeachingClassStore] (기존, 무수정)
  ↓ 5. ManageAttendance 유스케이스
[infrastructure/storage] (로컬 JSON)
```

### 2.3 Dependencies

| Component                                | Depends On                                                           | Purpose            |
| ---------------------------------------- | -------------------------------------------------------------------- | ------------------ |
| `calendarUtils.ts`                       | (없음 - 순수 함수)                                                   | 공유 유틸리티      |
| `MultiDatePicker.tsx`                    | `calendarUtils.ts`, `react`                                          | 다중 날짜 픽커     |
| `CalendarPicker.tsx` (기존)              | `calendarUtils.ts` (re-route)                                        | 기존 사용처 회귀 0 |
| `InputMode.tsx` (수정)                   | `MultiDatePicker`, `useTeachingClassStore`, `useStudentRecordsStore` | 담임 기록 입력     |
| `AttendanceTab.tsx` (수정)               | `MultiDatePicker`, `useTeachingClassStore`                           | 수업관리 단일 교시 |
| `AttendanceCheckPage.tsx` (수정, 모바일) | `MultiDatePicker` (mobileSheet 모드)                                 | 모바일 출결        |
| `commandRegistry.ts` (수정)              | `MultiDatePicker` 모드 토글 라우팅                                   | Ctrl+K 진입        |

---

## 3. Data Model

본 기획은 **도메인 엔티티 변경 없음**. 기존 `AttendanceRecord = {classId, date, period, students}` 단위를 그대로 사용하며, "여러 날짜" 차원은 UI에서 N번 호출하는 패턴으로 처리한다.

### 3.1 신규 컴포넌트 타입

```typescript
// src/adapters/components/common/MultiDatePicker.tsx

export type DatePickerMode = 'single' | 'range' | 'multi';

export interface MultiDatePickerProps {
  /** 선택 모드 */
  mode: DatePickerMode;

  // ----- single 모드 -----
  /** single 모드 현재 값 "YYYY-MM-DD" */
  singleValue?: string;
  onSingleChange?: (date: string) => void;

  // ----- range 모드 -----
  /** range 모드 시작 날짜 */
  rangeStart?: string;
  /** range 모드 종료 날짜 */
  rangeEnd?: string;
  onRangeChange?: (start: string, end: string) => void;

  // ----- multi 모드 -----
  /** multi 모드 선택된 날짜 Set<"YYYY-MM-DD"> */
  multiValues?: ReadonlySet<string>;
  onMultiChange?: (dates: ReadonlySet<string>) => void;

  // ----- 공통 옵션 -----
  /** 수업이 있는 요일 강조 (JS getDay: 0=일, 1=월, ..., 6=토) */
  lessonDays?: readonly number[];
  /** 선택 상한 (기본 30) */
  maxCount?: number;
  /** 커스텀 강조 색상 (과목 색상 등). 미지정 시 기본 sp-accent */
  accentColor?: {
    text: string; // e.g. 'text-yellow-300'
    bg: string; // e.g. 'bg-yellow-500/20'
    bgSolid: string; // e.g. 'bg-yellow-400'
  };
  /** Portal 모드 — 모달·드로어 안에서 클리핑 방지 */
  portal?: boolean;
  /** 컴팩트 트리거 (좁은 공간) */
  compact?: boolean;
  /** 외부 클래스 추가 */
  className?: string;
  /** 모바일 Bottom Sheet 전용 레이아웃 */
  mobileSheet?: boolean;
  /** 달력 직접 노출 (트리거 없이 인라인 임베드) */
  inline?: boolean;
}
```

### 3.2 calendarUtils 시그니처

```typescript
// src/adapters/components/common/calendarUtils.ts

/** 6주 × 7일 = 42 cells (앞·뒤 월 spillover 포함) */
export function getCalendarDays(year: number, month: number): Date[];

/** Date → "YYYY-MM-DD" */
export function formatDateStr(d: Date): string;

/** "YYYY-MM-DD" → Date (T00:00:00 로컬) */
export function parseDateStr(s: string): Date;

/** 두 Date가 같은 날인지 (year+month+day 일치) */
export function isSameDay(a: Date, b: Date): boolean;

/** ["일", "월", "화", "수", "목", "금", "토"] */
export const DAY_LABELS: readonly string[];

/** 두 ISO 날짜 사이의 모든 날짜 enumeration (inclusive) */
export function enumerateRange(start: string, end: string): string[];

/** 오늘이 속한 주의 7일 (혹은 평일 5일) */
export function getThisWeekDates(today?: Date, weekdaysOnly?: boolean): string[];

/** 다음 주의 7일 */
export function getNextWeekDates(today?: Date, weekdaysOnly?: boolean): string[];
```

기존 `recordUtils.ts:102`의 `createDateRange`는 `enumerateRange`와 동일 동작이므로 `recordUtils`는 `enumerateRange`를 re-export 형태로 위임하여 기존 호출처 무수정.

---

## 4. API Specification

### 4.1 도메인/스토어 API 변경 없음

기존 `useTeachingClassStore`의 `saveDayAttendance(classId, date, byPeriod)` API를 그대로 사용. 다중 날짜는 호출자(UI 컴포넌트)가 N번 루프.

### 4.2 컴포넌트 사용 예시

**단일 모드** (Phase 3 수업관리 — 기본 상태):

```tsx
<MultiDatePicker mode="single" singleValue={date} onSingleChange={setDate} />
```

**범위 모드** (Phase 1 담임 기록 — `dateRangeMode` ON 시):

```tsx
<MultiDatePicker
  mode="range"
  rangeStart={selectedDate}
  rangeEnd={endDate}
  onRangeChange={(s, e) => {
    setSelectedDate(s);
    setEndDate(e);
  }}
  maxCount={30}
/>
```

**다중 모드** (Phase 1 담임 기록 — "월·수·금만" 케이스):

```tsx
<MultiDatePicker
  mode="multi"
  multiValues={selectedDateSet}
  onMultiChange={setSelectedDateSet}
  maxCount={30}
/>
```

**모바일 Bottom Sheet**:

```tsx
<MultiDatePicker
  mode="multi"
  multiValues={selectedDateSet}
  onMultiChange={setSelectedDateSet}
  mobileSheet
  inline
/>
```

### 4.3 Fan-out 저장 패턴 (호출자 측)

```typescript
// InputMode.tsx — 기존 handleBatchSave 구조 재사용
async function handleBatchSave() {
  const dates =
    mode === 'multi' ? Array.from(selectedDateSet).sort() : enumerateRange(selectedDate, endDate);

  if (dates.length === 0 || dates.length > 30) {
    showToast('1일 이상 30일 이하 선택', 'info');
    return;
  }

  setBatchProgress({ current: 0, total: dates.length });
  const skipped: string[] = [];

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i]!;
    const created = await saveForDate(date);
    if (created === 0) skipped.push(date);
    setBatchProgress({ current: i + 1, total: dates.length });
  }

  setSkippedDates(skipped);
  setBatchProgress(null);
}
```

---

## 5. Error Handling

| 케이스                | 조건                            | UX                                                                                         |
| --------------------- | ------------------------------- | ------------------------------------------------------------------------------------------ |
| 0일 선택 후 저장 시도 | `multiValues.size === 0`        | 토스트 "선택된 날짜가 없습니다", 저장 차단                                                 |
| 30일 초과 선택 시도   | 31번째 셀 클릭                  | 토스트 "최대 30일까지 선택 가능", 셀 토글 무시. 카운터 빨강                                |
| range 시작>종료       | `rangeEnd < rangeStart`         | 칩 라벨 "종료일이 시작일보다 빠릅니다", 저장 버튼 disabled                                 |
| fan-out 중 일부 실패  | `await saveForDate(date)` throw | skippedDates 배열에 누적, 종료 후 토스트 "N일 중 M일 저장됨 / X일 실패" + "다시 시도" 액션 |
| Portal Z-stack 충돌   | 모달 z=50, 픽커 z=9999          | 기존 CalendarPicker 패턴 그대로 `z-[9999]`                                                 |

---

## 6. UI/UX Design

### 6.1 데스크톱 — 모드 토글 + 그리드 (multi 모드)

```
┌────────────────────────────────────────────────────────────────┐
│  MultiDatePicker (데스크톱, mode="multi", 280px 패널)           │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  [트리거 버튼]  3일 선택됨  ▼  calendar_today                   │
│                                                                │
│ ╔══════════════════════════════════════════════════════════╗   │
│ ║  ◀   2026년  5월  ▶    [단일]  [범위]  [다중]            ║   │
│ ╟──────────────────────────────────────────────────────────╢   │
│ ║   일    월    화    수    목    금    토                  ║   │
│ ║   •           •          •                               ║   │  ← lessonDays 도트
│ ╟──────────────────────────────────────────────────────────╢   │
│ ║   26   27   28   29   30    1     2                      ║   │
│ ║    3    4  [ 5]   6    7    8     9                      ║   │  ← [5]=선택됨
│ ║   10   11   12   13   14  [15]   16                      ║   │
│ ║   17   18   19  [20]  21   22    23                      ║   │
│ ║   24   25   26   27   28   29    30                      ║   │
│ ║   31    1    2    3    4    5     6                      ║   │
│ ╟──────────────────────────────────────────────────────────╢   │
│ ║  [이번 주]  [이번 주 평일]  [다음 주]  [초기화]           ║   │
│ ╟──────────────────────────────────────────────────────────╢   │
│ ║  선택: 5/5 ●  5/15 ●  5/20 ●  ← → (가로 스크롤 칩)       ║   │
│ ╟──────────────────────────────────────────────────────────╢   │
│ ║  오늘          3일 선택됨               [확정]           ║   │
│ ╚══════════════════════════════════════════════════════════╝   │
└────────────────────────────────────────────────────────────────┘
```

### 6.2 데스크톱 — range 모드 시각화

```
║   10  [11 → 12 → 13 → 14]  15                                  ║
            ↑ range-in (bg-sp-accent/15, rounded-none)
       ↑ range-start (bg-sp-accent, rounded-l-lg)
                          ↑ range-end (bg-sp-accent, rounded-r-lg)
```

- 시작일과 종료일이 같으면 `rounded-lg` 유지 (단일 셀처럼 보임)
- range 중간 셀은 `rounded-none` + `text-sp-accent` + 배경 `bg-sp-accent/15`
- 호버 중인 셀이 잠정 종료(potentialEnd)이면 점선 테두리 `border-dashed border-sp-accent`로 미리보기 (선택사항, Phase 2 후반)

### 6.3 모바일 Bottom Sheet (mobileSheet=true, inline=true)

```
┌──────────────────────────────────────────────┐
│                  ────  (드래그 핸들)          │
│  여러 날짜 선택               [완료 (3)]      │  ← sticky top 0
├──────────────────────────────────────────────┤
│  [이번 주] [이번 주 평일] [다음 주] [초기화] │  ← 프리셋 가로 스크롤
├──────────────────────────────────────────────┤
│  5/5 ●  5/15 ●  5/20 ●  → →                  │  ← 칩 가로 스크롤, h-10
├──────────────────────────────────────────────┤
│    ◀     2026년 5월     ▶                     │
│   일    월   화   수   목   금   토            │
├──────────────────────────────────────────────┤
│   26   27   28   29   30   [1]   2            │
│    3    4  [5]   6    7    8    9             │  ← 셀 40×40, gap-1
│   10   11   12   13   14  [15]  16            │
│   17   18   19  [20]  21   22   23            │
│   24   25   26   27   28   29   30            │
│   31    1    2    3    4    5    6            │
├──────────────────────────────────────────────┤
│  ※ 최대 30일까지 선택할 수 있습니다           │  ← 30일 도달 시 노출
└──────────────────────────────────────────────┘
```

- Bottom Sheet: `min-h-[60vh] max-h-[90vh]`, 드래그 핸들 표시
- 그리드 너비: `(40px × 7) + (4px × 6) = 304px` — 360px 폰에서 좌우 여백 28px
- "완료" 버튼은 상단 우측 sticky — 한 손 엄지 reach 위해 의도적 상단 배치
- 칩 리스트 h-10 한 줄 고정, 선택 0개면 영역 자체 숨김

### 6.4 Phase 1 — 담임 기록 입력 모드 토글 위치 강화

**Before (현재)**:

```
출결 유형: [결석] [지각] [조퇴] [결과]
사유:      [질병] [인정] [미인정] [기타]
─────────────────────────────────────────
☐ 여러 날 한 번에 등록 (교외체험학습 등)
    ← 출결 카테고리 선택 후에야 이 영역 노출
```

**After (Phase 1)**:

```
출결 유형: [결석] [지각] [조퇴] [결과]
사유:      [질병] [인정] [미인정] [기타]
─────────────────────────────────────────
📅 날짜 모드: [● 단일]  [○ 범위]  [○ 다중]    ← Pill 그룹, 항상 노출
   (현재 단일 / 범위 / 다중 표시)
   → 범위·다중 선택 시 MultiDatePicker inline 노출
```

토글이 출결 카테고리 선택 시 즉시 부각되도록 다음 시각 처리:

1. 출결 카테고리 선택 직후 `<MultiDatePicker>` 라벨에 `animate-pulse` 1.5초 (한 번만)
2. "다중 모드" 진입 시 picker가 자동 확장 (`open=true`)
3. 칩 카운터를 헤더 상단에 sticky로 노출

### 6.5 Phase 3 — 수업관리 출결 탭 단일 교시 모드

```
┌─ 수업관리 > 영어B반 > 출결 탭 (단일 교시) ───────────────────┐
│                                                              │
│  [단일 교시]  [전체 교시 매트릭스]                            │  ← 뷰 모드 토글
│                                                              │
│  날짜: ┌──────────────────┐  교시: [조회][1][2][3]...[종례]   │
│        │ 📅 5/5  3일 선택됨▼│                                  │  ← MultiDatePicker
│        └──────────────────┘                                  │
│                                                              │
│  3일 일괄 저장 모드 — 5월 5일·15일·20일에 동일하게 적용됨    │  ← 안내 배너 (다중 모드만)
│                                                              │
│  [학생 목록 ─ 현재 5월 5일 표시 중]                          │
│  1번 김민수  [출석] [결석] [지각] [조퇴] [결과]              │
│  2번 박지영  [출석] ...                                      │
│  ...                                                         │
│                                                              │
│                       [3일 일괄 저장 (5/5, 5/15, 5/20)]      │  ← 라벨 동적 변경
└──────────────────────────────────────────────────────────────┘
```

매트릭스 뷰는 본 Phase 제외. 매트릭스 진입 시 상단에 안내:

```
※ 전체 교시 매트릭스 모드는 한 번에 한 날짜만 편집할 수 있습니다.
  여러 날짜를 일괄 등록하려면 [단일 교시] 모드를 사용해주세요.
```

### 6.6 ARIA / 키보드 사양

| 요소              | role / aria                                                                     | 규칙                                    |
| ----------------- | ------------------------------------------------------------------------------- | --------------------------------------- |
| 달력 컨테이너     | `role="grid"` `aria-label="날짜 선택"` `aria-multiselectable={mode!=='single'}` | —                                       |
| 요일 헤더 행      | `role="row"`                                                                    | —                                       |
| 요일 셀           | `role="columnheader"` `abbr="월요일"` `scope="col"`                             | —                                       |
| 날짜 행           | `role="row"`                                                                    | 6개 행                                  |
| 날짜 셀 버튼      | `role="gridcell"` `aria-label="2026년 5월 5일 화요일"`                          | 선택 시 `aria-selected="true"`          |
| range 중간 셀     | `aria-selected="true"` `data-range-inner="true"`                                | —                                       |
| 비현재월 셀       | `aria-disabled="true"` `tabIndex={-1}`                                          | —                                       |
| 30일 초과 (multi) | `aria-disabled="true"` `tabIndex={-1}`                                          | 클릭 시 토스트 1회                      |
| 모드 토글 그룹    | `role="radiogroup"` `aria-label="선택 모드"`                                    | 각 버튼 `role="radio"` `aria-checked`   |
| 프리셋 버튼       | 일반 button                                                                     | `aria-label="이번 주 평일 선택"`        |
| 선택 칩           | `role="listitem"`                                                               | ✕ 버튼 `aria-label="5월 5일 선택 해제"` |
| Bottom Sheet      | `role="dialog"` `aria-modal="true"` `aria-labelledby="..."`                     | focus-trap 포함                         |

**키보드 포커스 이동:**

| 키                  | 동작                                              |
| ------------------- | ------------------------------------------------- |
| ← →                 | 같은 행 내 이전/다음 날짜                         |
| ↑ ↓                 | 7일 전/후 (월 경계 자동 이동)                     |
| Home                | 현재 행의 일요일                                  |
| End                 | 현재 행의 토요일                                  |
| Page Up / Page Down | 이전/다음 월                                      |
| Space               | multi/range 모드 토글 선택                        |
| Enter               | single 확정 + 닫기 / range 시작-종료 두 번째 결정 |
| Escape              | 드롭다운 닫기 + 트리거에 포커스 복귀              |
| Tab                 | 그리드 → 프리셋 행 → 칩 리스트 → 푸터 순          |

포커스 링: `focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:ring-offset-1 focus-visible:ring-offset-sp-card`

### 6.7 sp-\* 토큰 매핑

| 상태                   | 배경              | 텍스트                       | 기타                                      |
| ---------------------- | ----------------- | ---------------------------- | ----------------------------------------- |
| 기본 셀 (현재 월)      | —                 | `text-sp-text`               | —                                         |
| 기본 셀 (비현재 월)    | —                 | `text-sp-muted opacity-30`   | `aria-disabled`                           |
| 호버                   | `bg-sp-text/10`   | `text-sp-text`               | —                                         |
| 선택됨 (single/multi)  | `bg-sp-accent`    | `text-white font-bold`       | —                                         |
| 오늘 (미선택)          | `bg-sp-accent/20` | `text-sp-accent font-medium` | —                                         |
| range 시작/종료        | `bg-sp-accent`    | `text-white`                 | `rounded-l-lg` / `rounded-r-lg`           |
| range 중간 in          | `bg-sp-accent/15` | `text-sp-accent`             | `rounded-none`                            |
| 30일 초과 (multi)      | —                 | `text-sp-muted opacity-40`   | `cursor-not-allowed`                      |
| 패널 배경              | `bg-sp-card`      | —                            | `border-sp-border rounded-xl shadow-xl`   |
| 프리셋 버튼            | `bg-sp-text/8`    | `text-sp-muted`              | `hover:bg-sp-text/15 rounded-lg`          |
| 선택 칩                | `bg-sp-accent/20` | `text-sp-accent`             | `rounded-lg`                              |
| 카운터 30일 도달       | `bg-amber-500/15` | `text-sp-highlight`          | `font-medium`                             |
| 일요일 텍스트 (미선택) | —                 | `text-red-400`               | —                                         |
| 토요일 텍스트 (미선택) | —                 | `text-blue-400`              | —                                         |
| 수업일 도트            | —                 | —                            | `bg-sp-accent` 또는 `accentColor.bgSolid` |
| 푸터 구분선            | —                 | —                            | `border-sp-border`                        |

---

## 7. Security Considerations

본 기획은 **클라이언트 UI 작업**으로 신규 보안 표면이 없다. 단:

- [ ] 30일 상한은 UI 가드일 뿐 — 호출자가 직접 `saveDayAttendance` 호출 시 우회 가능. 도메인 레벨 가드는 본 Phase 범위 외 (향후 PDCA 별도)
- [ ] fan-out 루프 중 abort/언마운트 → 부분 저장 상태 유지. AbortController 도입은 본 Phase 제외 (사용자가 "다시 시도" 통해 복구)
- [ ] 로컬 저장 IO 실패 처리는 기존 `useTeachingClassStore.saveAttendanceRecord` 가드(`loadFailed`)에 위임

---

## 8. Test Plan

### 8.1 Test Scope

| Type        | Target                                           | Tool                            |
| ----------- | ------------------------------------------------ | ------------------------------- |
| Unit        | `calendarUtils.ts` (8개 함수)                    | Vitest                          |
| Unit        | `MultiDatePicker.tsx` 3-mode 전환                | Vitest + @testing-library/react |
| Meta        | 기존 `CalendarPicker` 회귀 0 (4~6 사용처)        | Vitest grep 검사                |
| Meta        | `recordUtils.createDateRange` 동등성 (re-export) | Vitest                          |
| Integration | `InputMode` 기존 dateRangeMode 시나리오 회귀     | RTL                             |
| Integration | `AttendanceTab` 단일 모드/다중 모드 fan-out      | RTL                             |
| E2E (수동)  | 담임 / 수업관리 / 모바일 3개 동선 시연 GIF       | Manual                          |
| A11y        | 키보드 only 조작 + NVDA 1회                      | axe-core + manual               |

### 8.2 Test Cases (Key)

- [ ] **Happy path (single)**: `mode='single'` + 셀 클릭 → `onSingleChange` 1회 호출, 패널 닫힘
- [ ] **Happy path (range)**: `mode='range'` + 시작 클릭 → 종료 클릭 → `onRangeChange(s, e)` 1회, in 셀 시각 표시
- [ ] **Happy path (multi)**: `mode='multi'` + 3개 셀 토글 → `multiValues.size === 3`, 칩 3개
- [ ] **Edge (30일)**: multi 30셀 선택 후 31번째 클릭 → 무반응 + 토스트, 카운터 빨강
- [ ] **Edge (range 역순)**: 종료가 시작보다 빠른 날짜 클릭 → 자동 swap 또는 경고
- [ ] **Edge (월 경계)**: ↓ 화살표로 다음 월로 이동, 비현재월 셀 회색
- [ ] **Edge (0개 선택 저장)**: multi에서 0개 → 저장 disabled + 토스트
- [ ] **Regression (CalendarPicker)**: 기존 4~6 사용처에서 import 경로 변경 없이 동작
- [ ] **Regression (dateRangeMode)**: 담임 InputMode 30일 일괄 저장 기존 시나리오 통과
- [ ] **Regression (createDateRange)**: `recordUtils.createDateRange` 호출처에서 결과 동일
- [ ] **A11y (Tab)**: 그리드 → 프리셋 → 칩 → 푸터 순 Tab 이동
- [ ] **A11y (화살표)**: ←/→/↑/↓ 그리드 내 정상 이동
- [ ] **A11y (Esc)**: 드롭다운 닫힘 + 트리거 포커스 복귀
- [ ] **Portal**: 모달 내부에서 `portal=true`로 사용 시 z-stack 정상

### 8.3 Performance Test

- [ ] 30일 fan-out 저장 < 3초 (Electron 로컬 JSON)
- [ ] 그리드 렌더 < 16ms (React Profiler)
- [ ] 모바일 Bottom Sheet 열기 애니메이션 < 250ms

---

## 9. Clean Architecture

### 9.1 Layer Structure (쌤핀 4-layer)

| Layer                       | Responsibility           | 본 기능 위치                                                                                                                      |
| --------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **Presentation (adapters)** | UI 컴포넌트·hooks·stores | `src/adapters/components/common/MultiDatePicker.tsx` (신규), `InputMode.tsx`·`AttendanceTab.tsx`·`AttendanceCheckPage.tsx` (수정) |
| **Application (usecases)**  | 유스케이스               | 변경 없음 — 기존 `ManageAttendance` 그대로                                                                                        |
| **Domain**                  | Entity·Rules             | 변경 없음 — `AttendanceRecord` 그대로                                                                                             |
| **Infrastructure**          | Storage·외부 IO          | 변경 없음                                                                                                                         |

### 9.2 Dependency Rules

```
┌───────────────────────────────────────────────────────────┐
│ MultiDatePicker (presentation/common)                     │
│  ├─ depends on: calendarUtils (순수 함수)                 │
│  └─ does NOT depend on: domain, usecases, infrastructure  │
│                                                           │
│ InputMode / AttendanceTab / AttendanceCheckPage           │
│  ├─ depends on: MultiDatePicker, stores                   │
│  └─ stores depend on: usecases → domain → infrastructure  │
└───────────────────────────────────────────────────────────┘
```

도메인 import 가드: `domain/` 폴더 무수정 (검증 게이트의 `npm run lint` import 가드로 회귀 차단)

### 9.3 File Import Rules

| From                   | Can Import                                                                | Cannot Import              |
| ---------------------- | ------------------------------------------------------------------------- | -------------------------- |
| `MultiDatePicker.tsx`  | `react`, `react-dom`, `calendarUtils.ts`                                  | stores, usecases, domain   |
| `InputMode.tsx` (수정) | `MultiDatePicker`, `@adapters/stores/*`, `@domain/entities/*` (type only) | infrastructure 직접        |
| `calendarUtils.ts`     | (없음)                                                                    | 모든 외부 모듈 (순수 유틸) |

---

## 10. Coding Convention Reference

### 10.1 Naming

| Target       | Rule             | 본 기능 예시                                      |
| ------------ | ---------------- | ------------------------------------------------- |
| Component    | PascalCase       | `MultiDatePicker`                                 |
| Utility file | camelCase.ts     | `calendarUtils.ts`                                |
| Hook         | use\* camelCase  | (Phase 2에서 별도 hook 추출 시 `useCalendarGrid`) |
| Type alias   | PascalCase       | `DatePickerMode`, `MultiDatePickerProps`          |
| Constant     | UPPER_SNAKE_CASE | `DAY_LABELS`, `DEFAULT_MAX_COUNT = 30`            |

### 10.2 Import Order (쌤핀 컨벤션)

```typescript
// 1. External
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// 2. Internal absolute
import {
  getCalendarDays,
  formatDateStr,
  parseDateStr,
  isSameDay,
  DAY_LABELS,
} from './calendarUtils';

// 3. Type imports (separate)
import type { ReactNode } from 'react';
```

### 10.3 이 기능의 컨벤션

| 항목          | 적용                                                               |
| ------------- | ------------------------------------------------------------------ |
| 컴포넌트 명명 | `MultiDatePicker` (PascalCase)                                     |
| 파일 구조     | 공용 컴포넌트는 `adapters/components/common/`                      |
| 상태 관리     | 로컬 useState (페이지 휘발성)                                      |
| 에러 처리     | 토스트 + `skippedDates` 배열 추적                                  |
| 스타일        | sp-\* 토큰 + Tailwind 기본 키, `rounded-xl` 패널 / `rounded-lg` 셀 |
| TypeScript    | strict, `any` 금지, `ReadonlySet` 활용                             |
| 텍스트        | 100% 한국어                                                        |

---

## 11. Implementation Guide

### 11.1 File Structure

```
src/adapters/components/common/
├── calendarUtils.ts                  (신규)
├── calendarUtils.test.ts             (신규)
├── MultiDatePicker.tsx               (신규)
├── MultiDatePicker.test.tsx          (신규)
└── CalendarPicker.tsx                (수정 — 내장 유틸을 calendarUtils로 위임, 외부 API 무변경)

src/adapters/components/Homeroom/Records/
├── InputMode.tsx                     (수정 — Phase 1: 토글 위치 강화 + MultiDatePicker 교체)
└── recordUtils.ts                    (수정 — createDateRange를 enumerateRange로 위임)

src/adapters/components/ClassManagement/
├── AttendanceTab.tsx                 (수정 — Phase 3: 단일 교시 모드에 MultiDatePicker 적용)
└── AttendanceMatrixView.tsx          (수정 — 안내 문구만 추가, 본 Phase 제외)

src/adapters/components/common/CommandPalette/
└── commandRegistry.ts                (수정 — Phase 1: "여러 날 출결" 명령 추가)

src/mobile/pages/
└── AttendanceCheckPage.tsx           (수정 — Phase 3: Bottom Sheet 멀티픽)
```

### 11.2 Implementation Order

**Phase 2 (선행 — `MultiDatePicker` 신설, 1.5~2일):**

1. [ ] `calendarUtils.ts` 신규 + 단위 테스트 (8 함수 × 3 케이스 = 24+ test)
2. [ ] `CalendarPicker.tsx` 내장 유틸을 `calendarUtils.ts` import 로 교체 (외부 API 무변경, 회귀 0)
3. [ ] `MultiDatePicker.tsx` 신규 — single 모드 먼저
4. [ ] `MultiDatePicker.tsx` range 모드 추가
5. [ ] `MultiDatePicker.tsx` multi 모드 추가
6. [ ] 프리셋 버튼·칩 리스트·30일 가드
7. [ ] ARIA / 키보드 / focus-visible 작업
8. [ ] Portal·mobileSheet 레이아웃
9. [ ] 단위 테스트 + 회귀 메타테스트

**Phase 1 (담임 발견성 + 컴포넌트 교체, 0.5~1일):**

10. [ ] `InputMode.tsx` 출결 카테고리 선택 시 토글 즉시 부각 (animate-pulse 1회)
11. [ ] `InputMode.tsx` `<input type="date">` + 종료일 input → `MultiDatePicker` 교체
12. [ ] `commandRegistry.ts` "여러 날 출결" 항목 추가 + 라우팅 핸들러
13. [ ] `recordUtils.ts` `createDateRange` → `enumerateRange` 위임

**Phase 3 (수업관리 단일 교시 + 모바일, 1.5~2일):**

14. [ ] `AttendanceTab.tsx` 단일 교시 모드 `<input type="date">` → `MultiDatePicker`
15. [ ] `AttendanceTab.tsx` 다중 모드 활성 시 저장 버튼 라벨 동적 변경 + fan-out 루프 추가
16. [ ] `AttendanceMatrixView.tsx` 안내 배너 추가
17. [ ] `AttendanceCheckPage.tsx` Bottom Sheet `MultiDatePicker` 적용 + 단일 모드 토글
18. [ ] Phase 3 회귀 메타테스트 (단일 모드 회귀 0)

### 11.3 Implementation Risks & Watchpoints

| Risk                                                               | 완화                                                                              |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `CalendarPicker.tsx` 유틸 위임 시 export 누락으로 빌드 깨짐        | `calendarUtils.ts`에서 동일 시그니처로 re-export 보장 + `tsc -b` 즉시 검증        |
| range 시작·종료 시각 표시 (rounded-none) Tailwind 동적 클래스 누락 | `safelist`에 `rounded-l-lg`, `rounded-r-lg`, `rounded-none` 명시                  |
| 모바일 Bottom Sheet body scroll lock 충돌                          | `body.overflow-hidden` 토글 + 모바일 안전영역(`env(safe-area-inset-bottom)`) 적용 |
| 30일 가드를 UI에서만 — 도메인 검증 부재                            | 위험 인지. 향후 PDCA 별도. 본 Phase에서는 UI 가드 + 토스트                        |
| Phase 3 매트릭스 안내 누락으로 사용자 혼란                         | 매트릭스 진입 첫 회에만 dismissable info 배너 (`localStorage` flag)               |

---

## 12. Open Questions Resolution

Plan v0.2에서 Design으로 이연된 3건이 본 문서에서 확정됨:

| #   | 질문                                                | 결정                                                          | 근거                                                                                                                            |
| --- | --------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | CalendarPicker 확장 vs 신규 분리 vs 외부 라이브러리 | **B — 신규 `MultiDatePicker` + `calendarUtils` 추출**         | 무외부 헤드리스 정책 + 기존 회귀 0 보장 + 실질 중복 < 10줄 (frontend-architect 권장)                                            |
| Q2  | `AttendanceMatrixView` 다중 날짜 모드               | **C — Phase 3에서 매트릭스 제외 (단일 교시만)**               | 매트릭스는 "한 날 × N명 × 10교시" 셀 모델 재설계 필요. 사용자 학습 부담 최소화. 안내 배너로 동선 명시 (frontend-architect 권장) |
| Q3  | 모바일 Bottom Sheet 시안                            | **셀 40×40px, gap 4px, 칩 리스트 상단, 완료 버튼 sticky top** | 360px 폰 좌우 여백 28px 확보 + 엄지 reach 영역 회피 (frontend-architect 권장)                                                   |

---

## 13. Next Steps

1. [x] Design 문서 작성 (본 문서)
2. [ ] 사용자 확인 (Design v0.1 승인)
3. [ ] `/pdca do multi-date-attendance` 진입 → Phase 2부터 구현 시작
4. [ ] Phase 2 1차 구현 후 frontend-architect 에이전트 재검토 (협업 시점 2번째)
5. [ ] Phase 3 모바일 시안 frontend-architect 검토 (협업 시점 3번째)
6. [ ] Phase 3 완료 후 `/pdca analyze` → gap-detector 호출

---

## Version History

| Version | Date       | Changes                                                                                                               | Author    |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------- | --------- |
| 0.1     | 2026-05-19 | 초안 — frontend-architect 협업 1회 산출물 합성 (Q1·Q2·Q3 확정, MultiDatePicker API·와이어프레임·ARIA·sp-\* 토큰 매핑) | pblsketch |
