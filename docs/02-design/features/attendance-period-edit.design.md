---
template: design
version: 1.2
feature: attendance-period-edit
date: 2026-04-17
author: pblsketch
project: ssampin
version_target: v1.10.2
depends_on: docs/01-plan/features/attendance-period-edit.plan.md
---

# 출결 기록 교시 수정 기능 설계서

> Plan 문서의 요구사항을 구체적인 컴포넌트·상태·흐름·검증으로 변환한다. Clean Architecture 4레이어 의존성을 엄격히 준수한다.

---

## 1. Architecture Overview

### 1.1 Touchpoints

| 레이어 | 파일 | 변경 유형 |
|--------|------|-----------|
| domain | `src/domain/rules/attendanceRules.ts` | **추가** — `validateAttendancePeriods` 순수 함수 |
| domain | `src/domain/entities/StudentRecord.ts` | (변경 없음) — `attendancePeriods` 기존 활용 |
| usecases | `src/usecases/studentRecords/UpdateAttendancePeriods.ts` | **신규** — 교시 편집 저장 로직 (domain만 import) |
| adapters | `src/adapters/stores/useStudentRecordsStore.ts` | `updateAttendanceRecord` 액션 추가 |
| adapters | `src/adapters/stores/useTeachingClassStore.ts` | (변경 없음) — `saveDayAttendance` 재사용 |
| adapters | `src/adapters/components/Homeroom/Records/InlineRecordEditor.tsx` | 교시별 행 UI 추가 (attendance 한정) |
| adapters | `src/adapters/components/Homeroom/Records/PeriodRowEditor.tsx` | **신규** — 교시 행 단일 컴포넌트 |
| adapters | `src/adapters/components/Homeroom/Records/InputMode.tsx` / `SearchMode.tsx` | 저장 핸들러 교체 |

### 1.2 Dependency Rule 검증

```
PeriodRowEditor (adapters)
  ↓ uses
InlineRecordEditor (adapters)
  ↓ props callback
InputMode/SearchMode (adapters)
  ↓ calls
useStudentRecordsStore.updateAttendanceRecord (adapters)
  ↓ calls
UpdateAttendancePeriods usecase (usecases)
  ↓ uses
validateAttendancePeriods (domain/rules)
```

- ✅ usecases → domain only
- ✅ adapters → usecases + domain
- ✅ infrastructure 직접 접근 없음 (Repository 패턴 유지)

---

## 2. Domain Layer

### 2.1 Validation Rule

**파일**: `src/domain/rules/attendanceRules.ts` (기존 파일에 함수 추가)

```ts
export interface PeriodValidationError {
  readonly code: 'EMPTY' | 'DUPLICATE_PERIOD' | 'OUT_OF_RANGE' | 'MISSING_STATUS';
  readonly period?: number;
}

export function validateAttendancePeriods(
  entries: readonly AttendancePeriodEntry[],
  options: { minPeriod: number; maxPeriod: number },
): PeriodValidationError | null {
  if (entries.length === 0) return { code: 'EMPTY' }; // Q2(A안): 0행 허용 안 함

  const seen = new Set<number>();
  for (const e of entries) {
    if (e.period < options.minPeriod || e.period > options.maxPeriod) {
      return { code: 'OUT_OF_RANGE', period: e.period };
    }
    if (seen.has(e.period)) {
      return { code: 'DUPLICATE_PERIOD', period: e.period };
    }
    if (!e.status) {
      return { code: 'MISSING_STATUS', period: e.period };
    }
    // Q1: reason은 optional — 빈 값도 허용
    seen.add(e.period);
  }
  return null;
}
```

- **순수 함수**: 외부 의존성 없음
- **유닛 테스트 대상** (추후 작성)

### 2.2 기존 재사용

- `pickRepresentativeAttendance` — 저장 시 대표 subcategory 계산에 그대로 사용 (교시 오름차순에서 첫 비‑present 엔트리 채택)
- `ATTENDANCE_STATUS_LABEL`, `ATTENDANCE_REASONS` — UI select 옵션 소스

---

## 3. UseCase Layer

### 3.1 UpdateAttendancePeriods (신규)

**파일**: `src/usecases/studentRecords/UpdateAttendancePeriods.ts`

```ts
import type { AttendancePeriodEntry, StudentRecord } from '@domain/entities/StudentRecord';
import type { AttendanceStatus } from '@domain/entities/Attendance';
import { ATTENDANCE_STATUS_LABEL } from '@domain/entities/Attendance';
import { validateAttendancePeriods } from '@domain/rules/attendanceRules';

export interface UpdateAttendancePeriodsInput {
  readonly record: StudentRecord;
  readonly nextPeriods: readonly AttendancePeriodEntry[];
  readonly content: string;
  readonly options: { minPeriod: number; maxPeriod: number };
}

export interface UpdateAttendancePeriodsResult {
  readonly record: StudentRecord;
}

export function updateAttendancePeriods(
  input: UpdateAttendancePeriodsInput,
): UpdateAttendancePeriodsResult {
  const err = validateAttendancePeriods(input.nextPeriods, input.options);
  if (err) throw new Error(`INVALID_PERIODS:${err.code}:${err.period ?? ''}`);

  const sorted = [...input.nextPeriods].sort((a, b) => a.period - b.period);
  const rep = sorted[0]; // 오름차순 첫 엔트리 = 대표 (pickRepresentativeAttendance 규칙과 일치)
  const typeLabel = ATTENDANCE_STATUS_LABEL[rep.status as Exclude<AttendanceStatus, 'present'>];
  const subcategory = rep.reason ? `${typeLabel} (${rep.reason})` : typeLabel;

  return {
    record: {
      ...input.record,
      subcategory,
      content: input.content,
      attendancePeriods: sorted,
    },
  };
}
```

- **domain만 import** — 의존성 규칙 준수
- 입출력은 순수 데이터 변환

---

## 4. Adapter Layer

### 4.1 Store Action

**파일**: `src/adapters/stores/useStudentRecordsStore.ts`

새 액션 `updateAttendanceRecord`:

```ts
updateAttendanceRecord: async (params: {
  record: StudentRecord;
  nextPeriods: AttendancePeriodEntry[];
  content: string;
  classId: string;
  date: string;
}) => {
  const { record, nextPeriods, content, classId, date } = params;

  // 1) usecase 호출 (검증 + 대표 subcategory 재계산)
  const { record: updatedRecord } = updateAttendancePeriods({
    record, nextPeriods, content,
    options: { minPeriod: 1, maxPeriod: 7 },
  });

  // 2) 원본 출결부 동기화 (양방향)
  await syncToTeachingClassStore(classId, date, updatedRecord);

  // 3) 기록 레이어 갱신
  await manageRecords.update(updatedRecord);
  set((s) => ({
    records: s.records.map((r) => (r.id === updatedRecord.id ? updatedRecord : r)),
  }));
},
```

**`syncToTeachingClassStore` 의사 코드**:

```ts
async function syncToTeachingClassStore(classId, date, record) {
  const teaching = useTeachingClassStore.getState();

  // 기존 (반, 날짜)의 전체 recordsByPeriod 로드 — 다른 학생 엔트리 보존 필수!
  const existing = await teaching.loadDayAttendance(classId, date);

  // studentNumber 식별
  const studentNumber = getStudent(record.studentId).studentNumber;
  if (studentNumber == null) return;

  const nextMap = new Map(existing); // Map<period, StudentAttendance[]>

  // 1~7교시 순회하며 이 학생 엔트리 갱신
  for (let p = 1; p <= 7; p += 1) {
    const periodEntry = record.attendancePeriods.find((e) => e.period === p);
    const others = (nextMap.get(p) ?? []).filter((sa) => sa.number !== studentNumber);

    if (periodEntry) {
      others.push({
        number: studentNumber,
        status: periodEntry.status,
        reason: periodEntry.reason,
        memo: periodEntry.memo,
      });
    }
    // periodEntry 없으면 해당 교시에서 학생 제거 (= present 취급)
    nextMap.set(p, others);
  }

  await teaching.saveDayAttendance(classId, date, nextMap);
}
```

⚠️ **중요**: `others.filter` 로 다른 학생 엔트리를 반드시 보존. 이 부분이 틀리면 반 전체 출결이 날아갈 수 있음.

### 4.2 PeriodRowEditor (신규 컴포넌트)

**파일**: `src/adapters/components/Homeroom/Records/PeriodRowEditor.tsx`

```tsx
interface PeriodRowEditorProps {
  entries: AttendancePeriodEntry[];
  onChange: (next: AttendancePeriodEntry[]) => void;
  duplicateError?: number; // 중복된 교시 번호
}
```

**UI 구조**:

```
┌ 교시별 상세 ─────────────────────────┐
│ [2교시▼] [지각▼] (질병▼)       [✕] │
│ [5교시▼] [조퇴▼] (기타▼)       [✕] │
│                                       │
│ + 교시 추가                           │
└───────────────────────────────────────┘
```

- 각 select는 Tailwind `bg-sp-surface border-sp-border` 톤 유지
- 삭제 버튼(`✕`)은 `text-sp-muted hover:text-red-400`
- 중복 교시 행은 `border-red-500` + 하단에 `role="alert"` 헬퍼 텍스트

### 4.3 InlineRecordEditor 변경

`isAttendance` 분기에서 기존의 "유형/사유 2단계 chip"을 **편집 중일 때만** `<PeriodRowEditor>` 로 대체. 신규 기록 추가(=`editingId`가 없을 때)에는 기존 chip UI 유지(행 추가 단계가 필요 없음).

**판단 시그널**: props에 `mode: 'create' | 'edit'` 추가.

### 4.4 InputMode / SearchMode 저장 핸들러

편집 저장 시 기존 `saveEdit` 호출을 다음으로 교체:

```ts
if (record.category === 'attendance') {
  await updateAttendanceRecord({
    record, nextPeriods: localEntries, content: editContent, classId, date,
  });
} else {
  await saveEdit(...); // 기존 경로
}
```

---

## 5. State Flow

```
┌─ 사용자: [편집] 클릭
│
├─ InlineRecordEditor mount (mode="edit")
│   └─ attendancePeriods → localEntries 로 복제
│       (레거시: entries 없으면 subcategory 파싱해 1행 생성)
│
├─ 사용자: 교시/유형/사유 변경, 행 추가/삭제
│   └─ localEntries 갱신 (React useState)
│
├─ 실시간 검증: validateAttendancePeriods(localEntries)
│   └─ 에러 있으면 저장 버튼 disabled + 헬퍼 텍스트
│
├─ 사용자: [저장] 클릭
│   └─ updateAttendanceRecord({ record, nextPeriods: localEntries, ... })
│       ├─ usecase: 정렬 + 대표 subcategory 재계산
│       ├─ syncToTeachingClassStore: 원본 출결부 patch (다른 학생 보존)
│       └─ manageRecords.update + 스토어 state 갱신
│
└─ 토스트: "저장됨"
```

---

## 6. Edge Cases & Error Handling

| 케이스 | 처리 |
|--------|------|
| 레거시 기록: `attendancePeriods` 없음 | mount 시 `subcategory` 문자열을 파싱해 1행 생성 (`status=기록일, period=1`) |
| 모든 행 삭제 (0행) | **A안**: 저장 버튼 disabled, 헬퍼 텍스트 "최소 1개 교시가 필요합니다". 삭제는 기록 카드의 [삭제] 버튼으로만 수행 |
| 사유 "(없음)" 선택 | `reason` 필드를 `undefined`로 저장. 표시는 `{유형}` 만 (예: "2교시 지각"). subcategory 문자열도 괄호 없이 저장 |
| 같은 교시 2행 | 두 번째 행에 빨간 테두리, 저장 disabled |
| 양방향 저장 중 실패 | 예외 catch → 에러 토스트 + 기록 레이어 롤백(기존 record 유지) |
| `classId` 없음 (담임 반 미설정) | 편집기는 여전히 동작, `syncToTeachingClassStore` 는 skip + 콘솔 경고 |

---

## 7. Testing Strategy

### 7.1 Unit Tests (domain)

- `validateAttendancePeriods`
  - 빈 배열 → `EMPTY`
  - 중복 교시 → `DUPLICATE_PERIOD`
  - 범위 초과(0교시, 8교시) → `OUT_OF_RANGE`
  - 정상 → null

### 7.2 Unit Tests (usecase)

- `updateAttendancePeriods`
  - 대표 subcategory 계산: `[3교시 지각(기타), 1교시 결석(질병)]` → 오름차순 정렬 후 `결석 (질병)` 반환
  - 검증 실패 시 throw

### 7.3 Integration (수동 QA 체크리스트)

- [ ] 3교시 지각(질병) 기록 → 편집 → 2교시로 변경 → 저장 → 기록 탭/출결 탭 모두 2교시로 표시
- [ ] 1교시 결석 기록 → 편집 → "5교시 지각" 행 추가 → 저장 → 기록 탭 "1교시 결석(질병), 5교시 지각(질병)" 표시, 출결 탭 두 교시 모두 반영
- [ ] 2행 중 1행만 삭제 → 저장 → 남은 1행만 반영, 삭제된 교시는 출결부에서 제거(=present)
- [ ] 같은 반 다른 학생의 기존 출결은 **변경 없음** (회귀 방지 핵심)
- [ ] 교시 중복 선택 시 저장 버튼 비활성화 + 경고 표시
- [ ] 레거시 기록(attendancePeriods 없음) 편집 → 1행으로 표시 → 저장 시 정상 저장

---

## 8. Rollout Plan

1. 기능 플래그 없이 바로 적용 (단일 데스크톱 앱, 피드백 대응 목적)
2. v1.10.2 릴리즈 노트에 "출결 기록 편집 시 교시 변경/추가/삭제" 명시
3. AI 챗봇 지식 베이스(`scripts/ingest-chatbot-qa.mjs`) 에 Q&A 추가
4. 노션 사용자 가이드 업데이트

---

## 9. Out of Scope (재확인)

- 출결 탭 UI 리디자인
- 여러 날짜 일괄 편집
- 모바일 앱 UI 변경

---

## 10. References

- Plan: [docs/01-plan/features/attendance-period-edit.plan.md](../../01-plan/features/attendance-period-edit.plan.md)
- 기존 브릿지 로직: [useStudentRecordsStore.ts:313](../../../src/adapters/stores/useStudentRecordsStore.ts#L313)
- 원본 저장: [useTeachingClassStore.ts:630](../../../src/adapters/stores/useTeachingClassStore.ts#L630)
- 대표 추출 규칙: [attendanceRules.ts:166](../../../src/domain/rules/attendanceRules.ts#L166)
