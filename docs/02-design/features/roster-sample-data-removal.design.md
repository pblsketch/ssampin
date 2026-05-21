---
template: design
version: 1.1
feature: roster-sample-data-removal
date: 2026-05-21
author: pblsketch
project: ssampin
version_target: v2.0.7 (Phase 1+2+3 통합)
---

> **v1.1 변경 (2026-05-21)**: bkit:frontend-architect 협업 디자인 사양 통합. RosterEmptyState 9개 컨텍스트 카피 확정, SampleRosterWarningBanner amber 톤 + 좌측 stripe + 3일 후 재표시 dismissible 채택, 사이드바 배지 빨간 점(`w-2 h-2`) 채택. (1순위 frontend-design 미등록 → 2순위 frontend-architect 폴백, 메모리 규칙 따름)

# 담임 명단 샘플 데이터 자동 채움 제거 — Design Document

> **Summary**: SAMPLE_STUDENTS 35명 자동 채움(`useStudentStore.ts:12-48, 82-92`)을 제거하고, 기존에 박혀 있는 사용자는 **6중 안전 가드**(A·B·C·D·E·F) AND를 통과할 때만 자동 정리한다. 학생 의존 화면 8곳에 공용 `<RosterEmptyState>` 가드, 회귀 차단 메타테스트 2건으로 SAMPLE_STUDENTS·EmptyState 누락 재발 차단.
>
> **불변식**: 본인 명단을 제대로 등록한 사용자에게는 어떤 데이터 변경도 가하지 않는다.
>
> **Project**: ssampin
> **Author**: pblsketch
> **Date**: 2026-05-21
> **Status**: v1.2 — Open Q 4건 확정, 구현 진입 (2026-05-21)
> **Planning Doc**: [`roster-sample-data-removal.plan.md`](../../01-plan/features/roster-sample-data-removal.plan.md)

---

## 1. Overview

### 1.1 Design Goals

1. **SAMPLE_STUDENTS 런타임 코드에서 0건**: 코드에서 완전 삭제. 필요 시 docs/fixtures/로 이동.
2. **빈 명단 자동 채움 0건**: `useStudentStore.load()` null 분기에서 빈 배열 반환.
3. **EmptyState 일관성**: 학생 의존 화면 8곳에 공용 `<RosterEmptyState>` 가드.
4. **마이그레이션 안전성**: 6중 가드(A~F) AND로 false-positive 0건 보장.
5. **회귀 차단**: 메타테스트 2건으로 SAMPLE_STUDENTS·EmptyState 누락 재발 방지.

### 1.2 Design Principles

- **데이터 보존 우선**: 가드 한 개라도 실패하면 정리 거부. 사용자 데이터 손실 0건이 모든 결정의 최우선.
- **사용자 흔적 탐지**: 직접 입력(updateStudentField), 일괄 import(updateStudents), 인원 변경(commitStudentCountChange), 단순 토글(toggleVacant, changeStatus) 등 모든 상태 변경 액션 끝에 `settings.everEditedRoster = true` 세팅.
- **순수 도메인 규칙으로 격리**: 시그니처 매칭은 `domain/rules/sampleRosterSignature.ts`에 순수 함수로. 외부 의존성 0.
- **외부 참조 검사 효율**: 각 store가 `hasStudentReferences(ids: readonly string[])` 메서드 노출. O(N) 단일 패스.
- **하위 호환**: 기존 students.json 포맷 변경 없음. 신규 플래그(everEditedRoster, didCleanSampleRoster)는 settings에 옵셔널로 추가.

### 1.3 Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│ Phase 1 (P0 — 핫픽스)                                                │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ useStudentStore.ts                                               │ │
│ │   - SAMPLE_STUDENTS 상수 삭제                                    │ │
│ │   - 초기 상태: students: [] (이전: SAMPLE_STUDENTS)               │ │
│ │   - load() null 분기: 빈 배열 set, 디스크 쓰기 안 함             │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ 신규 컴포넌트: <RosterEmptyState />                              │ │
│ │   - 학생 의존 화면 8곳 상단 가드                                   │ │
│ │   - context prop으로 화면별 카피 다르게                            │ │
│ │   - CTA: [학생 명단 등록하기] → 담임 업무 → 명렬 관리 탭          │ │
│ └──────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
                                ↓
┌────────────────────────────────────────────────────────────────────┐
│ Phase 2 (P1 — 마이그레이션)                                          │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ domain/rules/sampleRosterSignature.ts (신규, 순수 함수)          │ │
│ │   - SAMPLE_ROSTER_SIGNATURE (35명 ids/names/numbers, 동결)       │ │
│ │   - isSampleRoster(students): boolean   ← 가드 A·B·C            │ │
│ │   - hasUserDataMarks(students): boolean ← 가드 E                │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ usecases/roster/cleanupSampleRoster.ts (신규)                    │ │
│ │   - decideCleanupAction(students, refs, settings): CleanupAction │ │
│ │   - action: 'cleanup' | 'banner' | 'noop'                         │ │
│ │   - 가드 A~G AND로 결정. 순수 함수 — 테스트 용이                  │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ Settings 확장                                                     │ │
│ │   + everEditedRoster?: boolean    (사용자 수정 흔적)              │ │
│ │   + didCleanSampleRoster?: boolean (멱등성)                       │ │
│ │   + sampleRosterBannerDismissedAt?: string (배너 닫음 시각)       │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ useStudentStore.load() 보강                                       │ │
│ │   1. data 로드                                                    │ │
│ │   2. cleanupSampleRoster.decide(data, externalRefs, settings)    │ │
│ │   3. action === 'cleanup': students=[] + flags set + 토스트큐    │ │
│ │      action === 'banner':  유지 + showSampleBanner: true         │ │
│ │      action === 'noop':    그대로                                 │ │
│ └──────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
                                ↓
┌────────────────────────────────────────────────────────────────────┐
│ Phase 3 (P2 — 회귀 차단)                                             │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ tests/meta/sampleStudentsBanned.test.ts                          │ │
│ │   - useStudentStore.ts에 SAMPLE_STUDENTS 또는                     │ │
│ │     "김민지" "이서연" 등 SAMPLE 이름 직접 박힘 감지 → CI fail    │ │
│ │ tests/meta/rosterEmptyStateCoverage.test.ts                      │ │
│ │   - 학생 의존 화면 8곳에 <RosterEmptyState> 가드 누락 → CI fail  │ │
│ └──────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

---

## 2. Phase 1 — SAMPLE_STUDENTS 제거 + EmptyState

### 2.1 `useStudentStore.ts` 변경 사양

**삭제**:

- Line 11~48: `SAMPLE_STUDENTS` 상수 전체

**변경**:

```typescript
// Before (line 82-83)
export const useStudentStore = create<StudentState>((set, get) => ({
  students: SAMPLE_STUDENTS,
  loaded: false,

// After
export const useStudentStore = create<StudentState>((set, get) => ({
  students: [],
  loaded: false,
```

```typescript
// Before (line 86-94)
load: async () => {
  if (get().loaded) return;
  try {
    const data = await studentRepository.getStudents();
    if (!data) {
      await studentRepository.saveStudents(SAMPLE_STUDENTS);  // ← 제거
      set({ students: SAMPLE_STUDENTS, loaded: true });       // ← 제거
      return;
    }
    // ...
  }
},

// After
load: async () => {
  if (get().loaded) return;
  try {
    const data = await studentRepository.getStudents();
    if (!data) {
      set({ students: [], loaded: true });
      return;
    }
    // Phase 2 마이그레이션 검사 호출 지점 (Phase 2에서 추가)
    const normalized = normalizeStudentList(data);
    if (normalized !== data) {
      await studentRepository.saveStudents(normalized);
    }
    set({ students: normalized, loaded: true });
  } catch {
    set({ loaded: true });
  }
},
```

**파급 효과**: 신규 설치 시 students.json이 생성되지 않음. 사용자가 명단을 등록하기 전까지는 파일 부재 상태 유지. 다른 기능이 빈 배열을 받아도 정상 동작해야 함 (EmptyState 가드로 보호).

### 2.2 `<RosterEmptyState>` 컴포넌트 (v1.1 디자인 확정)

**위치**: `src/adapters/components/common/RosterEmptyState.tsx`

**Props 시그니처**:

```typescript
type RosterEmptyStateContext =
  | 'homeroom' // 담임 업무 일반 (기록 탭)
  | 'seating' // 자리배치
  | 'attendance' // 출결
  | 'assignment' // 과제 수합
  | 'survey' // 설문
  | 'records' // 학생 기록
  | 'consultation' // 상담 예약
  | 'seat_picker' // 쌤도구 → 자리 뽑기
  | 'grouping' // 쌤도구 → 모둠 셔플
  | 'roster_management'; // 명렬 관리 탭 자체 (CTA 다름)

interface RosterEmptyStateProps {
  readonly context: RosterEmptyStateContext;
  readonly onNavigate?: () => void;
}
```

**레이아웃**:

```
┌─────────────────────────────────────────┐  bg-sp-card
│   [아이콘 48×48 — Material Symbol]      │  rounded-xl  ring-1 ring-sp-border
│                                         │  shadow-sp-sm  px-8 py-10
│   제목 (text-base font-bold)            │  flex-col items-center text-center
│   본문 (text-sm text-sp-muted)          │  gap-4  max-w-[26rem]
│   [Primary CTA]                         │
│   [Secondary CTA] (선택)                │
└─────────────────────────────────────────┘
```

**토큰**:
| 역할 | 클래스 |
|---|---|
| 카드 배경 | `bg-sp-card` |
| 카드 테두리 | `ring-1 ring-sp-border` |
| 카드 그림자 | `shadow-sp-sm` |
| 카드 모서리 | `rounded-xl` |
| 아이콘 컨테이너 | `bg-sp-accent/10 rounded-xl p-3` |
| 아이콘 색 | `text-sp-accent` |
| 제목 | `text-base font-bold text-sp-text` |
| 본문 | `text-sm text-sp-muted leading-relaxed` |
| Primary 버튼 | `bg-sp-accent text-white rounded-lg px-5 py-2.5 text-sm font-medium` |
| Secondary 링크 | `text-sm text-sp-accent hover:underline` |

**컨텍스트별 카피 (10개)**:

| context             | 아이콘 (Material Symbol) | 제목                                       | 본문                                                                               | Primary CTA                                |
| ------------------- | ------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------ |
| `homeroom`          | `school`                 | 우리 반 명단을 등록해 주세요               | 학생 이름을 등록하면 담임 업무 전체를 한 곳에서 관리할 수 있어요.                  | 학생 명단 등록하기                         |
| `seating`           | `table_restaurant`       | 명단이 있어야 자리를 배치할 수 있어요      | 우리 반 학생을 먼저 등록하면 한 번에 자리를 배치하고 섞을 수 있어요.               | 학생 명단 등록하기                         |
| `attendance`        | `fact_check`             | 출결 기록을 시작하려면 명단이 필요해요     | 학생을 먼저 등록해 주세요. 등록 후 날짜별로 출결을 기록할 수 있어요.               | 학생 명단 등록하기                         |
| `assignment`        | `assignment`             | 과제를 수합할 학생을 등록해 주세요         | 학생이 없으면 과제 수합을 시작할 수 없어요. 명단을 등록하면 바로 시작할 수 있어요. | 학생 명단 등록하기                         |
| `survey`            | `quiz`                   | 설문을 보낼 학생을 등록해 주세요           | 우리 반 명단을 등록하면 학생별로 응답을 확인할 수 있어요.                          | 학생 명단 등록하기                         |
| `records`           | `menu_book`              | 학생 기록을 시작하기 전에 명단이 필요해요  | 학생을 등록하면 개인별 상담·행동·성적 메모를 체계적으로 쌓을 수 있어요.            | 학생 명단 등록하기                         |
| `consultation`      | `chat`                   | 상담 일정을 잡기 전에 명단을 등록해 주세요 | 학생 명단이 있어야 상담 신청·예약·기록을 연결할 수 있어요.                         | 학생 명단 등록하기                         |
| `seat_picker`       | `casino`                 | 학생이 있어야 자리를 뽑을 수 있어요        | 우리 반 명단을 등록하면 공정하게 자리를 정해드려요.                                | 학생 명단 등록하기                         |
| `grouping`          | `groups`                 | 모둠을 섞으려면 명단이 필요해요            | 학생을 등록하면 원하는 모둠 수로 바로 나눌 수 있어요.                              | 학생 명단 등록하기                         |
| `roster_management` | `groups_add`             | 아직 학생이 없어요                         | 엑셀에서 이름을 복사해 붙여넣거나, 직접 한 명씩 입력할 수 있어요.                  | 엑셀에서 붙여넣기 / 직접 입력 시작 (둘 다) |

**인터랙션 상태**:

- Primary CTA hover: `hover:bg-sp-accent/90 transition-colors duration-150`
- Primary CTA focus-visible: `focus-visible:outline-2 focus-visible:outline-sp-accent focus-visible:outline-offset-2`
- Primary CTA active: `active:scale-95`

**접근성**:

- 카드: `role="region"` + `aria-label="{컨텍스트 명} 시작 안내"`
- 아이콘: `aria-hidden="true"`
- 제목: `<h2>` 시멘틱
- Primary CTA: `<button type="button">` + 키보드 Enter/Space
- 포커스 순서: 제목 → 본문 → Primary → Secondary

### 2.3 EmptyState 가드 삽입 위치 (8곳)

| 화면                  | 컴포넌트                              | 가드 위치                                    |
| --------------------- | ------------------------------------- | -------------------------------------------- |
| 담임 업무 → 기록      | `RecordsTab.tsx`                      | `activeStudents().length === 0` 시 본문 대신 |
| 담임 업무 → 자리배치  | `SeatingTab.tsx` (또는 자리배치 화면) | students.length === 0 시                     |
| 담임 업무 → 설문      | `SurveyTab.tsx`                       | students.length === 0 시                     |
| 담임 업무 → 과제 수합 | `AssignmentTab.tsx`                   | students.length === 0 시                     |
| 담임 업무 → 명렬 관리 | `RosterManagementTab.tsx`             | students.length === 0 시 (CTA 다름)          |
| 담임 업무 → 상담 예약 | `ConsultationTab.tsx`                 | students.length === 0 시                     |
| 쌤도구 → 자리 뽑기    | `SeatPickerTool.tsx`                  | 학급 모드 선택 시 students.length === 0      |
| 쌤도구 → 모둠 셔플    | `GroupShuffleTool.tsx`                | 학급 모드 선택 시 students.length === 0      |

수업반 모드(`TeachingClass`)는 별도 store이므로 이 가드 대상 아님.

---

## 3. Phase 2 — 마이그레이션 (6중 가드)

### 3.1 Domain Rule: `sampleRosterSignature.ts`

**위치**: `src/domain/rules/sampleRosterSignature.ts`

**Export 시그니처**:

```typescript
import type { Student } from '@domain/entities/Student';

/** 동결 시그니처: 35명 (id, name, studentNumber). 코드에서 영원히 변하지 않음. */
export const SAMPLE_ROSTER_SIGNATURE: readonly {
  id: string;
  name: string;
  studentNumber: number;
}[] = Object.freeze([
  { id: 's01', name: '김민지', studentNumber: 1 },
  // ... 35명
]);

/**
 * 가드 A·B·C: 학생 배열이 SAMPLE 시그니처와 정확히 일치하는가.
 *
 * 통과 조건:
 *   - students.length === 35
 *   - 모든 학생의 id가 s01~s35 정확 매칭 (정렬 후 비교)
 *   - 동일 id끼리 name·studentNumber도 정확 일치
 *
 * @returns true: 샘플 시그니처와 정확 일치 (정리 후보)
 *          false: 사용자 명단으로 추정
 */
export function isSampleRoster(students: readonly Student[]): boolean;

/**
 * 가드 E: 35명 중 누구든 추가 입력 필드에 값이 있는가.
 *
 * 통과 조건 (정리 가능): 아래 모든 필드가 35명 전원에 대해 빈 값/undefined
 *   - phone, parentPhone, parentPhone2, birthDate, statusNote
 *
 * 단 하나라도 입력값이 있으면 사용자 입력으로 간주 → 정리 거부
 */
export function hasUserDataMarks(students: readonly Student[]): boolean;
```

**테스트 케이스 (단위)**:

1. SAMPLE 35명 정확 일치 → `isSampleRoster = true`, `hasUserDataMarks = false`
2. SAMPLE 35명 중 김민지 이름만 변경 → `isSampleRoster = false`
3. SAMPLE 35명 중 id `s01` → `student-001` 변경 → `isSampleRoster = false`
4. SAMPLE 34명 (한 명 삭제) → `isSampleRoster = false`
5. SAMPLE 36명 (한 명 추가) → `isSampleRoster = false`
6. SAMPLE 35명 + 김민지 phone에 `010-1234-5678` → `isSampleRoster = true`, `hasUserDataMarks = true` → 보수 분기
7. SAMPLE 35명 + 박지민 birthDate `2010-05-15` → 가드 E 실패

### 3.2 Use Case: `cleanupSampleRoster.ts`

**위치**: `src/usecases/roster/cleanupSampleRoster.ts`

```typescript
import type { Student } from '@domain/entities/Student';
import type { Settings } from '@domain/entities/Settings';
import { isSampleRoster, hasUserDataMarks } from '@domain/rules/sampleRosterSignature';

export interface SampleRosterExternalRefs {
  readonly studentRecordCount: number;
  readonly seatingRefCount: number;
  readonly seatConstraintCount: number;
  readonly seatPickerRefCount: number;
  readonly homeroomAttendanceCount: number;
  readonly consultationRefCount: number;
}

export type CleanupAction = 'cleanup' | 'banner' | 'noop';

/**
 * 6중 가드 AND로 액션 결정.
 *
 * - cleanup: 가드 A·B·C·D·E·F·G 모두 통과 → students=[] + 토스트 + 배지
 * - banner:  가드 A·B·C 통과 + 가드 D 또는 E 실패 → 유지 + 상단 배너
 * - noop:    가드 A·B·C 중 하나라도 실패 → 본인 명단으로 확정, 아무 동작 없음
 */
export function decideCleanupAction(
  students: readonly Student[],
  externalRefs: SampleRosterExternalRefs,
  settings: Settings,
): CleanupAction {
  // G. 멱등성 (이미 정리한 사용자는 재실행 안 함)
  if (settings.didCleanSampleRoster) return 'noop';

  // A·B·C. 시그니처 매칭
  if (!isSampleRoster(students)) return 'noop';

  // F. 사용자 수정 흔적 (한 번이라도 만진 적 있으면 거부)
  if (settings.everEditedRoster) return 'noop';

  // D. 외부 참조 검사
  const totalRefs =
    externalRefs.studentRecordCount +
    externalRefs.seatingRefCount +
    externalRefs.seatConstraintCount +
    externalRefs.seatPickerRefCount +
    externalRefs.homeroomAttendanceCount +
    externalRefs.consultationRefCount;
  if (totalRefs > 0) return 'banner';

  // E. 추가 입력 필드 흔적
  if (hasUserDataMarks(students)) return 'banner';

  // 모든 가드 통과
  return 'cleanup';
}
```

**테스트 케이스 (단위, 10건)**: Plan v1.2 §6.2 시나리오 1~10 표 그대로.

### 3.3 외부 참조 검사 구현

각 store에 `hasStudentReferences(studentIds: readonly string[]): number` 메서드 추가:

| Store                       | 검사 대상                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| `useStudentRecordsStore`    | `records.filter(r => studentIds.includes(r.studentId)).length`                                          |
| `useSeatingStore`           | seating.seats 평탄화 후 studentId 매칭 카운트                                                           |
| `useSeatConstraintsStore`   | constraints 안 studentId 카운트                                                                         |
| `useSeatPickerStore`        | preAssigned 안 studentId 카운트 (학급 scope만)                                                          |
| `useAttendanceStore` (담임) | attendanceRecords의 students 안 studentNumber 매칭 — Student.id가 아니라 number 기반이라 우회 변환 필요 |
| `useConsultationStore`      | schedules의 targetStudents.number 매칭 (위와 같은 우회)                                                 |

**주의**: Attendance·Consultation은 `studentNumber` 기반 외부 키. SAMPLE_STUDENTS의 studentNumber 1~35가 사용자 명단의 1~35와 같은 공간이라, 사용자 명단의 출결까지 잘못 카운트할 위험. → **이 두 엔티티는 가드 D에서 제외하거나, "출결 기록의 학생 이름이 SAMPLE 이름과 일치하는 경우에만" 카운트하는 보수적 매칭** 필요.

**결정**: 가드 D에서 Attendance·Consultation은 보수적으로 **"해당 record가 SAMPLE 이름과 일치할 때만 카운트"**. 안전을 위해 양성 거부(false-positive로 banner) 쪽으로 기움.

### 3.4 Settings 엔티티 확장

`src/domain/entities/Settings.ts`에 옵셔널 필드 3개 추가:

```typescript
export interface Settings {
  // ... 기존 필드 ...

  /** Phase 2 — 사용자가 RosterManagementTab에서 명단을 1번이라도 수정한 흔적.
   *  마이그레이션 가드 F. 기본 false (undefined로 표현). */
  readonly everEditedRoster?: boolean;

  /** Phase 2 — 마이그레이션이 1회 정리를 완료했는지. 멱등성 가드 G. */
  readonly didCleanSampleRoster?: boolean;

  /** Phase 2 — 상단 샘플 경고 배너를 사용자가 닫은 시각 (ISO 8601). */
  readonly sampleRosterBannerDismissedAt?: string;
}
```

**플래그 세팅 위치 (everEditedRoster)**:

- `useStudentStore.updateStudents`
- `useStudentStore.updateStudentName`
- `useStudentStore.updateStudentField`
- `useStudentStore.toggleVacant`
- `useStudentStore.changeStatus`
- `useStudentStore.commitStudentCountChange`
- 모든 RosterManagementTab 액션 후

### 3.5 마이그레이션 트리거 시점

`useStudentStore.load()`의 데이터 로드 직후 1회 호출:

```typescript
load: async () => {
  if (get().loaded) return;
  try {
    const data = await studentRepository.getStudents();
    if (!data) {
      set({ students: [], loaded: true });
      return;
    }

    const normalized = normalizeStudentList(data);

    // Phase 2 — 마이그레이션 검사
    const externalRefs = await collectExternalRefs(normalized);
    const action = decideCleanupAction(normalized, externalRefs, useSettingsStore.getState().settings);

    if (action === 'cleanup') {
      await studentRepository.saveStudents([]);
      await useSettingsStore.getState().update({ didCleanSampleRoster: true });
      useToastStore.getState().show({
        message: '이전에 자동으로 들어가 있던 샘플 명단을 정리했어요. 우리 반 학생을 등록해 주세요.',
        action: { label: '지금 등록하기', onClick: () => navigateToRosterTab() },
        durationMs: 5000,
      });
      set({ students: [], loaded: true });
      return;
    }

    if (action === 'banner') {
      useSampleBannerStore.getState().show();
      // students는 유지
    }

    if (normalized !== data) {
      await studentRepository.saveStudents(normalized);
    }
    set({ students: normalized, loaded: true });
  } catch {
    set({ loaded: true });
  }
},
```

### 3.6 사이드바 배지 (v1.1 확정)

**디자인 결정**: 빨간 점 (`w-2 h-2 bg-red-500 rounded-full`) 채택 — 기존 업데이트 배지 패턴 학습 효과.

**표시 조건**: `students.length === 0 && !settings.everEditedRoster`

**자동 사라짐**: 학생 1명 이상 등록되거나 명단 1회라도 수정 시 (`students.length > 0 || settings.everEditedRoster === true`) → `opacity-0` 전환 후 DOM 제거.

**레이아웃**:

- 펼친 모드 (w-64): `flex items-center justify-between` 행 우측 끝 `ml-auto mr-1`
- 접힌 모드 (w-16): 아이콘 컨테이너 `relative`, 점 `absolute top-0.5 right-0.5`
- 애니메이션: `transition-opacity duration-300`

**접근성**:

- 점 `<span>`: `aria-hidden="true"` (시각 표식 전용)
- 부모 `<button>` aria-label 동적: `students.length === 0 ? "담임 업무 (명단 미등록)" : "담임 업무"`

### 3.7 상단 경고 배너 `<SampleRosterWarningBanner>` (v1.1 신규)

**위치**: `src/adapters/components/common/SampleRosterWarningBanner.tsx`

**표시 조건**: `cleanupSampleRoster.decide(...) === 'banner'` 결과를 `useSampleBannerStore`가 보유. 다음 모두 충족 시 렌더:

- `useSampleBannerStore.shouldShow === true`
- `settings.sampleRosterBannerDismissedAt`이 없거나 3일 이상 지남

**카피**: "이 명단이 샘플일 가능성이 있어요. 우리 반 명단을 직접 등록하시면 정리됩니다." + [지금 등록하기] CTA + [✕] 닫기

**디자인 결정**:

- 톤: **amber(경고)** — 데이터 오염 위험이 있는 상태 (blue 정보 톤은 부적합)
- 위치: 메인 콘텐츠 `<PageHeader>` 직하 (전역 헤더 위는 너무 침습적)
- Dismissible: 채택. 닫으면 3일간 숨김 + 학생 1명 이상 등록되면 영구 해소.

**레이아웃**:

```
┌─────────────────────────────────────────────────────────────┐
│ ⚠  이 명단이 샘플일 가능성이 있어요. 우리 반 명단을 직접   [지금 등록하기]  ✕ │
│    등록하시면 정리됩니다.                                          │
└─────────────────────────────────────────────────────────────┘
border-l-4 border-l-amber-400  bg-sp-card  ring-1 ring-sp-border
px-4 py-3  rounded-lg  mx-4 mb-3
```

**토큰**:
| 역할 | 클래스 |
|---|---|
| 배경 | `bg-sp-card` |
| 좌측 stripe | `border-l-4 border-l-amber-400` |
| 테두리 | `ring-1 ring-sp-border rounded-lg` |
| 아이콘 | `text-amber-400` (Material Symbol `warning`) |
| 본문 | `text-sm text-sp-text leading-relaxed` |
| CTA | `text-sm font-medium text-sp-accent hover:underline` |
| 닫기 | IconButton ghost sm |

**접근성**: `role="alert"`, 닫기 `aria-label="샘플 명단 경고 배너 닫기"`, 닫힌 후 포커스를 메인 콘텐츠 첫 요소로 이동.

### 3.8 마이그레이션 토스트 (v1.1 확정)

기존 `useToastStore` 활용. 다음 한 번만 호출:

```typescript
useToastStore.show({
  message: '이전에 자동으로 들어가 있던 샘플 명단을 정리했어요. 우리 반 학생을 등록해 주세요.',
  type: 'success',
  action: { label: '지금 등록하기', onClick: navigateToRosterManagement },
  duration: 5000,
});
```

**1회 보장**: 호출 전 `settings.sampleRosterMigrationToastShownAt` 확인 후 빈 값일 때만 발사. 발사 후 ISO 8601 타임스탬프 저장.

**기존 ToastItem 변경 사항**: `duration` prop 미지원 시 기본 3000ms를 외부 인자로 받도록 확장 필요 (또는 `showOnce` 래퍼 신설).

**Settings 필드 추가 (Design v1.1)**:

```typescript
/** Phase 2 — 마이그레이션 토스트 1회 표시 보장. */
readonly sampleRosterMigrationToastShownAt?: string;
```

---

## 4. Phase 3 — 메타테스트

### 4.1 `sampleStudentsBanned.test.ts`

**위치**: `tests/meta/sampleStudentsBanned.test.ts`

**검사**:

- `src/adapters/stores/useStudentStore.ts`에 다음 정규식 부재:
  - `const SAMPLE_STUDENTS\s*=`
  - `'김민지'`, `'이서연'`, `'박지민'` 등 SAMPLE 이름 3개 이상 동시 등장
- 위반 시 즉시 CI 실패. 메시지: "SAMPLE_STUDENTS 또는 샘플 학생 이름이 런타임 코드에 재도입되었습니다. docs/fixtures/로 옮기거나 완전 삭제하세요."

### 4.2 `rosterEmptyStateCoverage.test.ts`

**위치**: `tests/meta/rosterEmptyStateCoverage.test.ts`

**검사**:

- 정의된 8개 컴포넌트 파일에 `<RosterEmptyState` import + 사용 흔적이 모두 있어야 함
- 화이트리스트 외 컴포넌트가 useStudentStore의 students를 구독하면서 빈 배열 가드가 없으면 경고
- 위반 시 CI 실패

---

## 5. 영향 받는 파일 매트릭스 (Clean Architecture 4-layer)

| Layer                                    | 파일                                    | 변경 유형                                                      |
| ---------------------------------------- | --------------------------------------- | -------------------------------------------------------------- |
| **domain/entities**                      | `Settings.ts`                           | 옵셔널 필드 3개 추가                                           |
| **domain/rules**                         | `sampleRosterSignature.ts`              | 🆕 신규                                                        |
| **usecases/roster**                      | `cleanupSampleRoster.ts`                | 🆕 신규                                                        |
| **adapters/stores**                      | `useStudentStore.ts`                    | SAMPLE 제거, load 보강, 모든 수정 액션에 everEditedRoster 세팅 |
| **adapters/stores**                      | `useStudentRecordsStore.ts`             | `hasStudentReferences` 메서드 추가                             |
| **adapters/stores**                      | `useSeatingStore.ts`                    | 동일                                                           |
| **adapters/stores**                      | `useSeatConstraintsStore.ts`            | 동일                                                           |
| **adapters/stores**                      | `useSeatPickerStore.ts`                 | 동일                                                           |
| **adapters/stores**                      | `useAttendanceStore.ts`                 | 보수적 매칭 메서드                                             |
| **adapters/stores**                      | `useConsultationStore.ts`               | 보수적 매칭 메서드                                             |
| **adapters/stores**                      | `useSampleBannerStore.ts`               | 🆕 신규 (banner 표시 토글)                                     |
| **adapters/components/common**           | `RosterEmptyState.tsx`                  | 🆕 신규                                                        |
| **adapters/components/common**           | `SampleRosterWarningBanner.tsx`         | 🆕 신규                                                        |
| **adapters/components/Homeroom/Records** | `RecordsTab.tsx`                        | EmptyState 가드                                                |
| **adapters/components/Homeroom**         | `RosterManagementTab.tsx`               | EmptyState 가드 (특수 CTA)                                     |
| **adapters/components/Homeroom**         | `SeatingTab.tsx` (또는 자리배치 호스트) | EmptyState 가드                                                |
| **adapters/components/Homeroom**         | `SurveyTab.tsx`                         | EmptyState 가드                                                |
| **adapters/components/Homeroom**         | `AssignmentTab.tsx`                     | EmptyState 가드                                                |
| **adapters/components/Homeroom**         | `ConsultationTab.tsx`                   | EmptyState 가드                                                |
| **adapters/components/Tools**            | `SeatPickerTool.tsx`                    | EmptyState 가드 (학급 모드만)                                  |
| **adapters/components/Tools**            | `GroupShuffleTool.tsx`                  | EmptyState 가드 (학급 모드만)                                  |
| **adapters/components/Layout**           | `Sidebar.tsx`                           | 배지 추가                                                      |
| **tests/meta**                           | `sampleStudentsBanned.test.ts`          | 🆕 신규                                                        |
| **tests/meta**                           | `rosterEmptyStateCoverage.test.ts`      | 🆕 신규                                                        |
| **tests/unit/domain/rules**              | `sampleRosterSignature.test.ts`         | 🆕 신규 (7건)                                                  |
| **tests/unit/usecases**                  | `cleanupSampleRoster.test.ts`           | 🆕 신규 (10건)                                                 |
| **tests/integration**                    | `rosterMigration.test.ts`               | 🆕 신규 (위험 시나리오 5건)                                    |

---

## 6. 테스트 매트릭스 (총 30+ 신규)

### 6.1 Domain Rules (7건)

- isSampleRoster: 정확 일치 / 이름 변경 / id 변경 / 학번 변경 / 길이 다름 / 추가 / 정렬 다름
- hasUserDataMarks: phone / parentPhone / parentPhone2 / birthDate / statusNote 각 1건씩 + 모두 빈 값

### 6.2 Use Case (10건)

- Plan v1.2 §6.2 시나리오 1~10 그대로

### 6.3 Integration (5건)

- 신규 설치 시뮬 → 빈 상태 카드 표시
- 샘플 35명만 + 첫 load → cleanup + 토스트
- 샘플 35명 + 출결 1건 → banner
- 샘플 35명 + phone 1건 → banner
- 본인 명단 25명 → noop, banner 없음, 카드 없음

### 6.4 Meta (2건)

- sampleStudentsBanned: 위반 시 CI fail
- rosterEmptyStateCoverage: 8곳 누락 시 CI fail

### 6.5 Component (5건+)

- RosterEmptyState 컨텍스트별 카피 렌더 5건
- CTA 클릭 시 onNavigate 호출 1건
- 키보드 접근성 (Tab → Enter) 1건

---

## 7. 검증 게이트

```bash
npx tsc --noEmit                # 0 errors
npm run lint                    # 0 errors
npm run test                    # 1503 → 1530+ 통과 (신규 30+)
npm run regression-check        # 9 → 11 통과 (메타테스트 2건 추가)
```

---

## 8. 위험·완화 (Plan v1.2 §7 보강)

(Plan §7 위험표 그대로 + 다음 보강)

| 추가 위험                                                     | 영향                                                                            | 완화                                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `decideCleanupAction`이 `cleanup` 반환했는데 디스크 쓰기 실패 | flag만 set되고 디스크는 옛 35명 그대로 → 다음 load 시 G 가드로 스킵 → 영구 오염 | 디스크 쓰기 성공 후에만 didCleanSampleRoster 세팅 (순서 강제)                                   |
| `everEditedRoster` 세팅을 일부 액션에 빠뜨림                  | 마이그레이션이 사용자 명단을 잘못 정리                                          | 단위 테스트로 모든 수정 액션 끝에 플래그가 true가 되는지 검증                                   |
| 외부 참조 검사가 비동기 race                                  | load 도중 다른 store가 동시 변경                                                | load는 직렬화. 마이그레이션이 끝나기 전까지 students slice subscribers는 loaded=false 보고 대기 |

---

## 9. Open Questions

### v1.1에서 확정 (frontend-architect 결과 반영)

7. ✅ **배너 톤**: amber(경고) 채택 + 좌측 stripe 패턴
8. ✅ **사이드바 배지 사라짐**: 학생 1명 이상 등록 또는 everEditedRoster=true 시 자동
9. ✅ **배너 위치**: PageHeader 직하 + 닫기 시 3일간 숨김

### v1.2에서 확정 (사용자 결정 2026-05-21)

5. ✅ **샘플 데이터 보존**: 완전 삭제 — 메타테스트로 재도입 차단
6. ✅ **가드 D 엔티티**: TeachingClass 검사 안 함 — Student.id와 ID 공간 완전 분리
7. ✅ **PR 전략**: 단일 PR — Phase 1+2+3 통합
8. ✅ **Design 검증**: 바로 구현 진입 — gap-detector가 사후 검증

---

## 10. 다음 단계

1. frontend-design 에이전트 결과 수령 → §2.2, §3.6 EmptyState/배너/토스트/배지 디자인 사양 확정
2. 사용자 Open Question 5~9 결정
3. v1.1 갱신 후 구현 착수
