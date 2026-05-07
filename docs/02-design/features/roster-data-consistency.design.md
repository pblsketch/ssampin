# roster-data-consistency Design Document

> **Summary**: 명렬 데이터 정합성 회복을 위한 6 Phase 설계. (1) 활성 학생 판정의 단일 진실 원천 확립, (2) 27+ 호출처 codemod + 메타테스트로 회귀 차단, (3) 일괄 import 시 (이름+학번) 매칭으로 외부 참조 자동 보존 + 충돌 시 모달, (4) 학생 수 감소·상담 외부 참조 안전화, (5) legacy 명렬 시스템 명료화, (6) 그룹 명단 분리 옵션.
>
> **Project**: SsamPin
> **Version**: TBD (구현 완료 후 결정)
> **Author**: pblsketch
> **Date**: 2026-05-07
> **Status**: Draft
> **Planning Doc**: [roster-data-consistency.plan.md](../../01-plan/features/roster-data-consistency.plan.md)
> **Analysis Doc**: [roster-data-consistency.analysis.md](../../03-analysis/roster-data-consistency.analysis.md)

### 관련 문서

| 문서 | 경로 | 상태 |
|------|------|------|
| Plan | `docs/01-plan/features/roster-data-consistency.plan.md` | Draft |
| Analysis | `docs/03-analysis/roster-data-consistency.analysis.md` | Draft |
| 기존 Student 엔티티 | `src/domain/entities/Student.ts` | 현행 |
| 기존 TeachingClass 엔티티 | `src/domain/entities/TeachingClass.ts` | 현행 |
| 기존 Roster Import 규칙 | `src/domain/rules/rosterImportRules.ts` | 현행 |
| 기존 Modal 컴포넌트 | `src/adapters/components/common/Modal.tsx` | 현행 |
| Modal 디자인 시스템 | `docs/impeccable-audit-v3.md` | 현행 |

---

## 1. 개요

### 1.1 설계 목표

1. **단일 진실 원천(SSoT)**: 활성 학생 판정 로직을 도메인 레이어 단일 함수로 응집. 모든 호출처가 이 함수를 거치도록 강제.
2. **회귀 차단 메커니즘**: 메타 테스트로 미래에 누군가 다시 `\.isVacant` 직접 접근하는 코드를 추가하면 즉시 실패.
3. **외부 참조 보존**: import는 기본적으로 기존 학생 id를 재사용. 충돌 시에만 사용자 결정 요구.
4. **데이터 손실 0**: 학생 수 감소·삭제 작업은 비활성 우선 + 활성 학생 삭제 시 명시적 확인.
5. **외부 시스템 호환**: Supabase 스키마(`targetStudents: { number }`)에 영향 주지 않으면서 정합성 확보 → "학번 불변 보장" 전략.
6. **점진적 적용**: 6 Phase로 분리 commit. 각 Phase 종료 시 사용자 검증.

### 1.2 설계 원칙

- **최소 침습**: 기존 저장 키, Repository 인터페이스, Supabase 스키마는 그대로. 도메인 헬퍼·UI 가드만 추가.
- **Clean Architecture 준수**: domain은 외부 의존 0. usecase는 domain만 import. 컴포넌트는 usecase + domain만.
- **Backward compatible migration**: 기존 사용자 데이터는 자동 마이그레이션, 실패해도 fallback 유지.
- **Codemod 안전**: 정규식 기반 일괄 치환 + tsc + 메타테스트 3중 안전망.
- **NEIS 회피**: NEIS 관련 파일 일체 변경 금지. `StepStudentRoster.tsx`(NEIS 인접)도 codemod 화이트리스트에서 제외.

### 1.3 범위 / 비범위

**포함** (Plan §2.1과 동일)
- Phase 1~6 전체

**제외** (Plan §2.2와 동일)
- NEIS Schedule 영역
- Supabase `targetStudents` 스키마 변경 (학번 불변 전략으로 우회)
- Google Drive sync 충돌 해결 (별도 PDCA)
- 명렬 audit log
- 학생 미디어/사진

---

## 2. 아키텍처

### 2.1 컴포넌트 다이어그램

```
[domain layer] ─────────────────────────────────────────────
   entities/
     Student.ts          ← normalizeStudentStatus() 헬퍼 추가
     TeachingClass.ts    ← 동일 (TeachingClassStudent용)
   rules/
     studentActivity.ts  ← NEW: isStudentActive / isStudentInactive
     rosterImportPlan.ts ← NEW: planImport(existing, imported) → {matched, conflicts, newOnly}
     rosterImportRules.ts ← matchExistingStudent(imp, exist) 추가
   __tests__/
     studentActivity.test.ts             ← NEW: 모든 status×isVacant 조합 행렬
     rosterImportPlan.test.ts            ← NEW: matched/conflicts/newOnly 분기

[usecases layer] ──────────────────────────────────────────
   roster/
     PreserveStudentNumber.ts ← NEW (선택): 학번 불변 보장 헬퍼
     (import은 컴포넌트에서 domain rules 직접 호출, 별도 usecase 불필요)

[adapters layer] ──────────────────────────────────────────
   stores/
     useStudentStore.ts          ← load() 마이그레이션, setStudentCount 안전화
     useTeachingClassStore.ts    ← load() 양방향 마이그레이션 강화, syncGroupStudents 분기
     useSeatingStore.ts          ← isStudentActive 사용
   components/
     Homeroom/
       RosterManagementTab.tsx       ← 3개 import 경로에 planImport+ConflictResolveModal
       RosterImport/
         ConflictResolveModal.tsx    ← NEW (frontend-architect 디자인)
         StudentCountReduceConfirmModal.tsx ← NEW (frontend-architect 디자인)
       Consultation/
         ConsultationCreateModal.tsx ← number 기반 유지 + 학번 불변 가드
     ClassManagement/
       ClassRosterTab.tsx          ← studentSyncMode 토글
     Tools/
       ClassRosterSelector.tsx     ← 명단 출처 안내 배너
     Settings/
       RosterCopyAction.tsx        ← NEW: 담임→수업반 복사 액션
   __tests__/
     studentActivityCallSites.test.ts ← NEW 메타테스트

[infrastructure layer] ────────────────────────────────────
   변경 없음 (저장 인터페이스, Repository 구현 유지)
```

### 2.2 Phase별 구현 순서 (의존성 그래프)

```
Phase 1: 도메인 단일화
   ├─ studentActivity.ts (FR-01)
   ├─ Student/TeachingClass.ts 헬퍼 (normalizeStudentStatus)
   ├─ useStudentStore.load() 양방향 마이그레이션 (FR-02)
   └─ studentActivity.test.ts 단위 테스트
        │
        ▼
Phase 2: 호출처 codemod (FR-03, FR-04)
   ├─ ~30 파일 일괄 치환 (4개 패턴 → isStudentActive)
   ├─ studentActivityCallSites.test.ts 메타테스트
   └─ tsc + 기존 단위 테스트 재실행
        │
        ▼
Phase 3: Import id 보존 (FR-05, FR-06)
   ├─ rosterImportPlan.ts (planImport 알고리즘)
   ├─ rosterImportRules.ts에 matchExistingStudent 추가
   ├─ ConflictResolveModal.tsx 신설 ← frontend-architect 디자인
   ├─ RosterManagementTab.tsx 3개 경로 적용
   └─ rosterImportPlan.test.ts 분기 단위 테스트
        │
        ├─────────────────────┐
        ▼                     ▼
Phase 4: 데이터 손실 차단    Phase 5: 시스템 통합 (병렬 가능)
  (FR-07, FR-08)              (FR-09, FR-10)
   ├─ useStudentStore         ├─ ClassRosterSelector 배너
   │   .setStudentCount        ├─ Settings 복사 액션
   │   안전화 (비활성 우선)   └─ (선택) legacy 마이그레이션 도우미
   ├─ StudentCountReduce
   │   ConfirmModal           
   ├─ ConsultationCreateModal 
   │   학번 불변 가드 + 
   │   number 폴백 유지       
   └─ 학번 변경 시 외부 참조  
       경고 토스트            
        │
        ▼
Phase 6: 그룹 분리 옵션 (FR-11, FR-12)
   ├─ TeachingClass.studentSyncMode 추가
   ├─ syncGroupStudents 분기
   ├─ ClassRosterTab 토글
   └─ 일괄 입력 부가 정보 보존 (Phase 3 자동 처리됨)
```

---

## 3. Phase 1 상세: 도메인 단일화

### 3.1 `src/domain/rules/studentActivity.ts` (신설)

**목적**: 모든 활성 학생 판정의 단일 진실 원천.

```typescript
import type { Student, StudentStatus } from '@domain/entities/Student';
import type { TeachingClassStudent } from '@domain/entities/TeachingClass';

/**
 * 활성 학생 판정 — 모든 호출처가 이 함수를 사용해야 한다.
 *
 * 우선순위:
 *  1. status가 명시되어 있으면 status === 'active'
 *  2. status가 undefined이면 !isVacant (하위 호환)
 *
 * 두 필드가 불일치하면 status를 신뢰한다 (changeStatus가 강제 동기화하기 때문).
 */
export function isStudentActive(
  s: Pick<Student | TeachingClassStudent, 'status' | 'isVacant'>,
): boolean {
  if (s.status !== undefined) return s.status === 'active';
  return !s.isVacant;
}

export function isStudentInactive(
  s: Pick<Student | TeachingClassStudent, 'status' | 'isVacant'>,
): boolean {
  return !isStudentActive(s);
}

/**
 * 학생 데이터를 정규화 — status와 isVacant를 일치시킨다.
 *
 * - status 있음 → isVacant = (status !== 'active')
 * - status 없음, isVacant=true → status = 'withdrawn' (하위 호환)
 * - 둘 다 없음 → status = 'active', isVacant = false
 *
 * 마이그레이션 시 한 번에 양방향으로 정규화 가능.
 */
export function normalizeStudentStatus<T extends { status?: StudentStatus; isVacant?: boolean }>(
  s: T,
): T {
  if (s.status !== undefined) {
    const targetVacant = s.status !== 'active';
    if (s.isVacant === targetVacant) return s;
    return { ...s, isVacant: targetVacant };
  }
  // status undefined
  if (s.isVacant === true) {
    return { ...s, status: 'withdrawn' as StudentStatus, isVacant: true };
  }
  return { ...s, status: 'active' as StudentStatus, isVacant: false };
}

/** 활성 학생만 필터링 (편의 함수) */
export function filterActive<T extends { status?: StudentStatus; isVacant?: boolean }>(
  list: readonly T[],
): T[] {
  return list.filter(isStudentActive);
}
```

### 3.2 마이그레이션 통합

`useStudentStore.load`:

```typescript
load: async () => {
  if (get().loaded) return;
  try {
    const data = await studentRepository.getStudents();
    let students = data ?? SAMPLE_STUDENTS;
    if (!data) {
      await studentRepository.saveStudents(SAMPLE_STUDENTS);
    } else {
      // NEW: 양방향 마이그레이션 — 정규화된 결과가 다르면 저장
      const normalized = students.map(normalizeStudentStatus);
      const dirty = normalized.some((n, i) => n !== students[i]);
      if (dirty) {
        students = normalized;
        await studentRepository.saveStudents(students);
      }
    }
    set({ students, loaded: true });
  } catch {
    set({ loaded: true });
  }
},
```

`useTeachingClassStore.load`: 기존 `migrateStudentStatus`(단방향)를 `normalizeStudentStatus`(양방향)로 교체. 동일 로직.

### 3.3 단위 테스트 — `studentActivity.test.ts`

```typescript
describe('isStudentActive', () => {
  // status × isVacant 매트릭스 (3 × 3 = 9 케이스)
  it.each([
    [{ status: 'active' as const, isVacant: false }, true],
    [{ status: 'active' as const, isVacant: true }, true], // status 우선
    [{ status: 'transferred' as const, isVacant: false }, false], // ← 회귀 케이스
    [{ status: 'transferred' as const, isVacant: true }, false],
    [{ status: 'withdrawn' as const, isVacant: false }, false],
    [{ isVacant: false }, true], // status 없음, 하위 호환
    [{ isVacant: true }, false],
    [{}, true], // 둘 다 없음 = 활성 (안전한 default)
  ])('isStudentActive(%o) === %s', (input, expected) => {
    expect(isStudentActive(input)).toBe(expected);
  });
});

describe('normalizeStudentStatus', () => {
  it('status 있고 isVacant 불일치 시 isVacant 동기화', () => {
    const input = { status: 'transferred' as const, isVacant: false };
    expect(normalizeStudentStatus(input)).toEqual({ status: 'transferred', isVacant: true });
  });
  it('status 없고 isVacant=true → status=withdrawn', () => {
    const input = { isVacant: true };
    expect(normalizeStudentStatus(input)).toEqual({ status: 'withdrawn', isVacant: true });
  });
  it('이미 정규화된 데이터는 같은 참조 반환 (불필요한 set 방지)', () => {
    const input = { status: 'active' as const, isVacant: false };
    expect(normalizeStudentStatus(input)).toBe(input);
  });
});
```

---

## 4. Phase 2 상세: 호출처 codemod

### 4.1 치환 패턴 매핑

| 원래 패턴 | 치환 결과 | 정규식 (단순화) |
|-----------|-----------|-----------------|
| `\.filter\(\(s\) => !s\.isVacant\)` | `.filter(isStudentActive)` | `\.filter\(\(([a-z]+)\)\s*=>\s*!\1\.isVacant\)` |
| `\.filter\(\(s\) => !s\.isVacant && \(!s\.status \|\| s\.status === 'active'\)\)` | `.filter(isStudentActive)` | (복잡한 패턴이라 수동 검토 + Edit) |
| `\.filter\(\(s\) => !s\.isVacant && \(s\.status \?\? 'active'\) === 'active'\)` | `.filter(isStudentActive)` | (수동) |
| `\.filter\(\(s\) => \{ if \(s\.status\) return s\.status === 'active'; return !s\.isVacant; \}\)` | `.filter(isStudentActive)` | (수동, useStudentStore.activeStudents) |
| `isInactiveStatus\(s\.status\) \|\| !!s\.isVacant` | `isStudentInactive(s)` | (수동) |
| `student\.isVacant \|\| isInactiveStatus\(student\.status\)` | `isStudentInactive(student)` | (수동) |
| `!isInactiveStatus\(s\.status\) && !s\.isVacant` | `isStudentActive(s)` | (수동) |

### 4.2 codemod 절차

1. 각 파일 위에 `import { isStudentActive, isStudentInactive } from '@domain/rules/studentActivity';` 추가
2. 정규식 치환 (단순 케이스 ~25 파일)
3. 복잡 케이스(~5 파일) 수동 Edit
4. `npx tsc --noEmit` 통과 확인
5. 메타 테스트 실행

### 4.3 메타 테스트 — `studentActivityCallSites.test.ts`

```typescript
import { execSync } from 'child_process';

const ALLOWED_FILES = new Set([
  'src/domain/rules/studentActivity.ts',          // 정의 자체
  'src/domain/rules/studentActivity.test.ts',     // 테스트
  'src/domain/entities/Student.ts',               // 인터페이스 정의
  'src/domain/entities/TeachingClass.ts',         // 인터페이스 정의
  'src/adapters/stores/useStudentStore.ts',       // changeStatus·setStudentCount·toggleVacant 내부 동기화
  'src/adapters/stores/useTeachingClassStore.ts', // updateStudentStatus·migration
  'src/adapters/components/Homeroom/RosterManagementTab.tsx', // isVacant UI 표시 가드
  'src/adapters/components/ClassManagement/ClassRosterTab.tsx', // 동일
  'src/adapters/components/Homeroom/shared/StudentGrid.tsx',    // 동일
  'src/domain/rules/birthdaySync.ts',             // 마이그레이션 후 단일화 가능 — Phase 2.5에서 처리
  // ... (구현 시 명시적 화이트리스트)
]);

describe('isStudentActive 호출처 정합성 (메타 테스트)', () => {
  it('domain·entity·migration·UI 가드 외에는 .isVacant 직접 접근 금지', () => {
    const result = execSync(
      'rg -l "\\.isVacant" src --type ts --type tsx',
      { encoding: 'utf-8' },
    );
    const files = result.trim().split('\n').filter(Boolean);
    const violations = files.filter((f) => !ALLOWED_FILES.has(f));
    expect(violations, `다음 파일들은 isStudentActive를 사용해야 합니다:\n${violations.join('\n')}`).toEqual([]);
  });

  it('isInactiveStatus 단독 사용도 금지 (isStudentInactive 사용 권장)', () => {
    const result = execSync(
      'rg -l "isInactiveStatus" src --type ts --type tsx',
      { encoding: 'utf-8' },
    );
    const files = result.trim().split('\n').filter(Boolean);
    const violations = files.filter((f) => !ALLOWED_FILES.has(f));
    expect(violations).toEqual([]);
  });
});
```

화이트리스트는 PR 단계에서 정확히 확정. 신규 파일 추가 시 PR 리뷰어가 화이트리스트에 추가하도록 강제.

---

## 5. Phase 3 상세: Import id 보존

### 5.1 `src/domain/rules/rosterImportPlan.ts` (신설)

```typescript
import type { Student } from '@domain/entities/Student';
import type { ImportReadyStudent } from './rosterImportRules';

export type ImportAction = 'replace' | 'add' | 'skip' | 'merge';

export interface MatchedRow {
  /** 매칭된 기존 학생 id — 보존 */
  readonly existingId: string;
  /** 가져오는 데이터 (병합/교체 결정 시 사용) */
  readonly imported: ImportReadyStudent;
}

export type ConflictType =
  | 'name_changed'        // 같은 학번, 다른 이름
  | 'number_changed'      // 같은 이름, 다른 학번
  | 'returning_inactive'; // 같은 이름이 비활성 학생과 매칭

export interface ConflictRow {
  readonly type: ConflictType;
  readonly existing: Student;
  readonly imported: ImportReadyStudent;
  /** 사용자가 선택한 액션. 모달에서 결정. */
  resolution?: ImportAction;
}

export interface PlanResult {
  readonly matched: readonly MatchedRow[];
  readonly conflicts: readonly ConflictRow[];
  readonly newOnly: readonly ImportReadyStudent[];
}

/**
 * 매칭 알고리즘 — 외부 참조(student.id)를 최대한 보존.
 *
 * 매칭 우선순위:
 *  1. (이름 trim, 학번) 완전 일치 → matched (id 재사용, 다른 필드 update)
 *  2. (학번) 같지만 이름 다름 → conflict TYPE 'name_changed'
 *  3. (이름) 같지만 학번 다름 → conflict TYPE 'number_changed'
 *  4. 이름 같은 활성 매치도 학번 매치도 없음 → 신규 (newOnly)
 *  5. 이름 같은 비활성(transferred/withdrawn) 학생 있음 → conflict TYPE 'returning_inactive'
 */
export function planImport(
  existing: readonly Student[],
  imported: readonly ImportReadyStudent[],
): PlanResult {
  const matched: MatchedRow[] = [];
  const conflicts: ConflictRow[] = [];
  const newOnly: ImportReadyStudent[] = [];

  const usedExistingIds = new Set<string>();

  // 인덱스: 빠른 조회용
  const byNumber = new Map<number, Student>();
  const byName = new Map<string, Student[]>();
  for (const s of existing) {
    if (s.studentNumber !== undefined) byNumber.set(s.studentNumber, s);
    const list = byName.get(s.name.trim()) ?? [];
    list.push(s);
    byName.set(s.name.trim(), list);
  }

  for (const imp of imported) {
    const impName = imp.name.trim();
    const byNum = byNumber.get(imp.studentNumber);
    const byNm = byName.get(impName) ?? [];

    // 우선순위 1: 이름+학번 완전 일치
    if (byNum && byNum.name.trim() === impName && !usedExistingIds.has(byNum.id)) {
      matched.push({ existingId: byNum.id, imported: imp });
      usedExistingIds.add(byNum.id);
      continue;
    }

    // 우선순위 2: 학번 같지만 이름 다름 (그 학번이 이미 매칭에 사용 안 됨)
    if (byNum && byNum.name.trim() !== impName && !usedExistingIds.has(byNum.id)) {
      conflicts.push({ type: 'name_changed', existing: byNum, imported: imp });
      usedExistingIds.add(byNum.id);
      continue;
    }

    // 우선순위 3: 이름 같지만 학번 다름
    const activeByName = byNm.find((s) => !usedExistingIds.has(s.id) && s.status !== 'transferred' && s.status !== 'withdrawn' && s.status !== 'expelled' && s.status !== 'dropped');
    if (activeByName) {
      conflicts.push({ type: 'number_changed', existing: activeByName, imported: imp });
      usedExistingIds.add(activeByName.id);
      continue;
    }

    // 우선순위 5: 이름 같은 비활성 학생만 있음
    const inactiveByName = byNm.find((s) => !usedExistingIds.has(s.id));
    if (inactiveByName) {
      conflicts.push({ type: 'returning_inactive', existing: inactiveByName, imported: imp });
      usedExistingIds.add(inactiveByName.id);
      continue;
    }

    // 우선순위 4: 매칭 없음 = 신규
    newOnly.push(imp);
  }

  return { matched, conflicts, newOnly };
}
```

### 5.2 적용 함수 — `src/usecases/roster/applyImportPlan.ts` (신설, 선택)

```typescript
import { generateUUID } from '@infrastructure/utils/uuid'; // adapters via repository
import type { Student } from '@domain/entities/Student';
import type { PlanResult, ConflictRow, ImportAction } from '@domain/rules/rosterImportPlan';
import type { ImportReadyStudent } from '@domain/rules/rosterImportRules';

/**
 * planImport 결과 + 충돌 해결 + 기존 명렬 → 최종 적용할 새 명렬 배열 반환.
 *
 * 순수 함수 — Repository 호출은 컴포넌트가 결과를 받아서 직접 수행.
 */
export function applyImportPlan(
  existing: readonly Student[],
  plan: PlanResult,
  conflictResolutions: ReadonlyMap<string, ImportAction>, // key: `${type}:${existingId}`
  newIdGenerator: () => string,
): Student[] {
  const result: Student[] = [];
  const handledExistingIds = new Set<string>();

  // 1. matched: 기존 id 보존, imported 필드로 update
  for (const m of plan.matched) {
    const exist = existing.find((s) => s.id === m.existingId);
    if (!exist) continue;
    result.push(mergeStudent(exist, m.imported, 'replace'));
    handledExistingIds.add(exist.id);
  }

  // 2. conflicts: resolution에 따라 분기
  for (const c of plan.conflicts) {
    const key = `${c.type}:${c.existing.id}`;
    const action = conflictResolutions.get(key) ?? 'skip';
    handledExistingIds.add(c.existing.id);

    switch (action) {
      case 'replace':
        result.push(mergeStudent(c.existing, c.imported, 'replace'));
        break;
      case 'merge':
        result.push(mergeStudent(c.existing, c.imported, 'merge'));
        break;
      case 'add':
        result.push(c.existing); // 기존 유지
        result.push(toNewStudent(c.imported, newIdGenerator()));
        break;
      case 'skip':
        result.push(c.existing); // 기존만 유지
        break;
    }
  }

  // 3. newOnly: 새 id로 추가
  for (const n of plan.newOnly) {
    result.push(toNewStudent(n, newIdGenerator()));
  }

  // 4. 처리되지 않은 기존 학생: 가져오기 명단에서 빠진 학생
  //    → 기본은 "유지". 사용자가 "전체 교체" 모드일 때만 제외.
  //    (이번 PDCA에서는 항상 유지. 명시적 삭제는 별도 기능)
  for (const exist of existing) {
    if (!handledExistingIds.has(exist.id)) {
      result.push(exist);
    }
  }

  return result;
}

function mergeStudent(
  existing: Student,
  imported: ImportReadyStudent,
  mode: 'replace' | 'merge',
): Student {
  if (mode === 'replace') {
    return {
      ...existing,
      name: imported.name,
      studentNumber: imported.studentNumber,
      phone: imported.phone,
      parentPhone: imported.parentPhone,
      parentPhoneLabel: imported.parentPhoneLabel,
      parentPhone2: imported.parentPhone2,
      parentPhone2Label: imported.parentPhone2Label,
      birthDate: imported.birthDate,
      isVacant: imported.isVacant,
      // status·statusNote·statusChangedAt는 보존 (외부에서 변경된 비활성 정보)
    };
  }
  // merge: 기존 빈 필드만 채움
  return {
    ...existing,
    name: existing.name || imported.name,
    studentNumber: existing.studentNumber ?? imported.studentNumber,
    phone: existing.phone || imported.phone,
    parentPhone: existing.parentPhone || imported.parentPhone,
    parentPhoneLabel: existing.parentPhoneLabel || imported.parentPhoneLabel,
    parentPhone2: existing.parentPhone2 || imported.parentPhone2,
    parentPhone2Label: existing.parentPhone2Label || imported.parentPhone2Label,
    birthDate: existing.birthDate || imported.birthDate,
  };
}

function toNewStudent(imp: ImportReadyStudent, id: string): Student {
  return {
    id,
    name: imp.name,
    studentNumber: imp.studentNumber,
    phone: imp.phone,
    parentPhone: imp.parentPhone,
    parentPhoneLabel: imp.parentPhoneLabel,
    parentPhone2: imp.parentPhone2,
    parentPhone2Label: imp.parentPhone2Label,
    birthDate: imp.birthDate,
    isVacant: imp.isVacant,
  };
}
```

### 5.3 ConflictResolveModal UI

> 본 섹션은 frontend-architect 에이전트가 디자인한 spec. 신설 위치: `src/adapters/components/Homeroom/RosterImport/ConflictResolveModal.tsx`

#### Layout (ASCII mockup)

```
┌─────────────────────── 명렬 가져오기 — 충돌 해결 ──────────────────────────┐
│  총 12개 충돌  ·  매칭 자동 적용 24건  ·  신규 추가 3건                       │
│  ──────────────────────────────────────────────────────────────────────── │
│  일괄 적용: [모두 교체▼]  [모두 신규]  [모두 건너뛰기]                          │
│  ──────────────────────────────────────────────────────────────────────── │
│  ① [TYPE-A] 이름 같음, 학번 다름                         1 / 12              │
│  ┌─────────────────────────────┬────────────────────────────────────────┐ │
│  │  기존 학생                   │  가져오는 데이터                          │ │
│  │  [7번] 김철수                │  [9번] 김철수                            │ │
│  │  상태: 재학                  │  (신규 가져오기)                          │ │
│  └─────────────────────────────┴────────────────────────────────────────┘ │
│  [교체]  [신규 추가]  [병합]  [건너뛰기]   ← 현재 선택: 교체 (파란 링)        │
│  ──────────────────────────────────────────────────────────────────────── │
│  ② [TYPE-B] 학번 같음, 이름 다름                                             │
│  ┌─────────────────────────────┬────────────────────────────────────────┐ │
│  │  기존: [3번] 박민수           │  가져오기: [3번] 박지수                    │ │
│  └─────────────────────────────┴────────────────────────────────────────┘ │
│  [교체]  [신규 추가]  [병합]  [건너뛰기]                                      │
│  ──────────────────────────────────────────────────────────────────────── │
│  ③ [TYPE-C] 전출 학생과 이름 동일 (전입 가능성)                                │
│  ┌─────────────────────────────┬────────────────────────────────────────┐ │
│  │  기존: [5번] 이수진 (전출)    │  가져오기: [5번] 이수진                    │ │
│  └─────────────────────────────┴────────────────────────────────────────┘ │
│  [교체]  [신규 추가]  [병합]  [건너뛰기]                                      │
│  ──────────────────────────────────────────────────────────────────────── │
│  ⚠ 이 작업은 되돌릴 수 없습니다. 완료 후 화면 하단 토스트의 '실행 취소'만 가능.   │
│  ──────────────────────────────────────────────────────────────────────── │
│  [취소]                                    [선택대로 적용 (12건)]            │
└────────────────────────────────────────────────────────────────────────────┘
```

#### Component skeleton

```tsx
<Modal isOpen size="xl" title="명렬 가져오기 — 충돌 해결" closeOnBackdrop={false} closeOnEsc={false}>
  <ConflictSummaryBar matched={matchedCount} conflicts={conflicts.length} newOnly={newCount} />
  <BulkActionBar onApplyAll={(action) => setAllResolutions(action)} />

  <div role="list" className="overflow-y-auto flex-1 px-6 divide-y divide-sp-border/40">
    {conflicts.map((c, i) => (
      <ConflictRow
        key={c.key}
        index={i + 1}
        total={conflicts.length}
        conflict={c}
        selected={resolutions.get(c.key)}
        onSelect={(action) => setResolution(c.key, action)}
      />
    ))}
  </div>

  <ConflictFooter pendingCount={unresolvedCount} onCancel={onCancel} onApply={() => onApply(resolutions)} />
</Modal>
```

각 `ConflictRow`:
```tsx
<div role="listitem" aria-label={`충돌 ${index}/${total}: 기존 ${existing.name} vs 가져오기 ${incoming.name}`}>
  <ConflictTypeBadge type={conflict.type} />
  <div className="grid grid-cols-2 gap-3 mt-2">
    <StudentDataCell label="기존 학생" data={conflict.existing} />
    <StudentDataCell label="가져오는 데이터" data={conflict.incoming} highlight />
  </div>
  <ActionSelector
    options={['replace', 'addNew', 'merge', 'skip']}
    value={selected}
    onChange={onSelect}
  />
</div>
```

#### Props interface (확정)

```typescript
interface ConflictItem {
  key: string;                    // existing.id + imported row index
  type: 'A' | 'B' | 'C';          // name_changed / number_changed / returning_inactive
  existing: {
    id: string;
    studentNumber: number;
    name: string;
    status?: string;
    hasRecords: boolean;          // 학생기록 여부 (위험성 시각화)
  };
  incoming: {
    studentNumber: number;
    name: string;
  };
}

type ConflictAction = 'replace' | 'addNew' | 'merge' | 'skip';

interface ConflictResolveModalProps {
  isOpen: boolean;
  onCancel: () => void;
  matched: number;                // 정보 표시용 (자동 적용된 건수)
  newOnly: number;                // 정보 표시용 (신규 건수)
  conflicts: readonly ConflictItem[];
  /** 모든 충돌 결정 후 호출. resolutions는 Record<conflictKey, ConflictAction> */
  onApply: (resolutions: Record<string, ConflictAction>) => void;
}
```

**도메인 매핑**: `ConflictItem.type`의 'A'/'B'/'C'는 `rosterImportPlan.ts`의 `ConflictType` enum과 매핑:
- 'A' = `name_changed` (학번 같음, 이름 다름) — *모달 라벨은 "이름 같음, 학번 다름"으로 표시 — 사용자 직관에 맞춤*
- 'B' = `number_changed`
- 'C' = `returning_inactive`

> **주의**: 모달의 TYPE-A/B/C 라벨링은 사용자 시각의 "어느 쪽이 같은지" 기준. 도메인 enum과 의미가 약간 다르므로 매핑 함수에서 명확히 변환.

#### Tailwind classes (zone별)

| Zone | 클래스 |
|------|--------|
| 헤더 요약 바 | `px-6 py-3 border-b border-sp-border flex items-center gap-4 text-sm text-sp-muted bg-sp-surface` |
| 요약 수치 강조 | `text-sp-text font-semibold` |
| 일괄 액션 바 | `px-6 py-2 flex items-center gap-2 border-b border-sp-border bg-sp-surface/60` |
| 충돌 목록 스크롤 | `flex-1 overflow-y-auto px-6 divide-y divide-sp-border/40` |
| ConflictRow 래퍼 | `py-4` |
| TYPE-A 배지 | `text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400` |
| TYPE-B 배지 | `text-xs font-medium px-2 py-0.5 rounded-full bg-blue-500/15 text-sp-accent` |
| TYPE-C 배지 | `text-xs font-medium px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400` |
| 비교 그리드 | `mt-2 grid grid-cols-2 gap-3` |
| StudentDataCell | `rounded-lg p-3 border border-sp-border bg-sp-surface text-sm` |
| 가져오는 셀 (하이라이트) | `border-sp-accent/50` |
| 액션 버튼 그룹 | `mt-3 flex gap-2` |
| 액션 버튼 기본 | `px-3 py-1.5 rounded-lg text-xs border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-accent/50 transition-colors` |
| 액션 버튼 선택 | `border-sp-accent bg-sp-accent/15 text-sp-accent font-medium` |
| 경고 배너 | `px-6 py-3 text-xs text-amber-400 bg-amber-500/10 border-t border-amber-500/20` |
| 푸터 | `px-6 py-4 flex items-center justify-between border-t border-sp-border` |
| 취소 버튼 | `px-4 py-2 rounded-lg border border-sp-border text-sm text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors` |
| 적용 버튼 | `px-5 py-2 rounded-lg bg-sp-accent hover:bg-blue-600 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed` |

#### Interaction states

- **Initial**: 모든 row 미선택, 적용 버튼 비활성. 미결 건수를 버튼 옆에 작은 뱃지로 표시 ("12건 미결")
- **Hover (액션 버튼)**: border + text가 sp-accent로 부드럽게 전환
- **Selected**: 해당 액션 버튼에 `border-sp-accent bg-sp-accent/15` 링, 즉시 전환
- **All resolved**: 미결 0이 되면 적용 버튼 활성화, 라벨 "선택대로 적용 (12건)"
- **일괄 적용 후**: 모든 row 선택이 해당 액션으로 덮어씀. 안내문: "개별 수정 후 일괄 적용하면 덮어씁니다"
- **스크롤**: 목록 영역만 스크롤(`overflow-y-auto`), 헤더·요약·푸터는 sticky

#### Accessibility

- Modal 컴포넌트가 `role="dialog"` + `aria-labelledby` 제공
- 충돌 목록: `role="list"` + 각 row `role="listitem"` + `aria-label="충돌 {N}/{total}: ..."`
- ActionSelector: `role="group"` + `aria-labelledby` row 제목 id 참조. 각 버튼 `aria-pressed`
- 미결 경고: `aria-live="polite"`로 스크린리더가 변화 감지
- 포커스 순서: 요약 바 → 일괄 액션 → ConflictRow[0] 첫 액션 버튼 → 취소 → 적용
- 키보드: Tab으로 row 간 이동, Space/Enter로 액션 선택. ESC 차단(`closeOnEsc={false}`) — 실수 방지

#### Edge cases

| 케이스 | 처리 |
|--------|------|
| 충돌 1건 | 일괄 액션 바 숨김. 안내문 "1건의 충돌이 있습니다. 적용 방식을 선택하세요." |
| 충돌 50건+ | 목록 `max-h-[min(60vh,480px)]` 클램프 + 스크롤 |
| 충돌 150건+ | 콘솔 경고. **별도 PDCA로 react-window 가상화 도입** (이번엔 단순 map) |
| 모두 같은 TYPE | TYPE 배지를 헤더에 한 번 + 일괄 안내문 |
| onApply throw | 푸터에 `role="alert"` 인라인 에러. 모달 유지 |
| 네트워크 오류 | 본 앱 오프라인 동작이라 N/A |

### 5.4 RosterManagementTab 수정 흐름

```typescript
const handleBulkApply = useCallback(async () => {
  if (!parseResult) return;
  const imported = toImportStudents(parseResult.rows, columnMappings);

  const plan = planImport(students, imported);

  if (plan.conflicts.length === 0) {
    // 자동 적용 — 기존 id 보존
    const newStudents = applyImportPlan(students, plan, new Map(), generateUUID);
    prevStudentsRef.current = students;
    await updateStudents(newStudents);
    showToast(`${imported.length}명 (보존 ${plan.matched.length}, 신규 ${plan.newOnly.length})`, 'success', { ... });
  } else {
    // 충돌 모달 노출
    setConflictPlan(plan);
    setConflictImported(imported);
    setShowConflictModal(true);
  }
  resetBulkImport();
  setShowBulkImport(false);
}, [...]);

// ConflictResolveModal의 onApply 핸들러
const handleResolveApply = useCallback(async (resolutions) => {
  const newStudents = applyImportPlan(students, conflictPlan!, resolutions, generateUUID);
  prevStudentsRef.current = students;
  await updateStudents(newStudents);
  setShowConflictModal(false);
  showToast(`${conflictImported.length}명 처리 완료`, 'success', { 실행 취소 });
}, [students, conflictPlan, conflictImported, updateStudents]);
```

### 5.5 단위 테스트 — `rosterImportPlan.test.ts`

```typescript
describe('planImport', () => {
  const existing = [
    { id: 'e1', name: '김철수', studentNumber: 1, ... },
    { id: 'e2', name: '이영희', studentNumber: 2, ..., status: 'transferred' },
    { id: 'e3', name: '박민수', studentNumber: 3, ... },
  ];

  it('완전 매칭: matched로 분류, id 보존', () => {
    const imported = [{ name: '김철수', studentNumber: 1, ... }];
    const result = planImport(existing, imported);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].existingId).toBe('e1');
  });

  it('학번 같음 이름 다름: conflict name_changed', () => {
    const imported = [{ name: '김민수', studentNumber: 1, ... }];
    const result = planImport(existing, imported);
    expect(result.conflicts[0].type).toBe('name_changed');
    expect(result.conflicts[0].existing.id).toBe('e1');
  });

  it('이름 같음 학번 다름: conflict number_changed', () => {
    const imported = [{ name: '김철수', studentNumber: 99, ... }];
    const result = planImport(existing, imported);
    expect(result.conflicts[0].type).toBe('number_changed');
  });

  it('이름 같은 비활성 학생: returning_inactive', () => {
    const imported = [{ name: '이영희', studentNumber: 5, ... }];
    const result = planImport(existing, imported);
    expect(result.conflicts[0].type).toBe('returning_inactive');
  });

  it('완전 신규: newOnly', () => {
    const imported = [{ name: '신학생', studentNumber: 4, ... }];
    const result = planImport(existing, imported);
    expect(result.newOnly).toHaveLength(1);
  });

  it('동일 매칭 학생 중복 사용 방지 (usedExistingIds)', () => {
    const imported = [
      { name: '김철수', studentNumber: 1, ... },
      { name: '김철수', studentNumber: 99, ... },
    ];
    const result = planImport(existing, imported);
    expect(result.matched).toHaveLength(1);   // 첫 번째만 매칭
    expect(result.newOnly).toHaveLength(1);   // 두 번째는 신규
  });
});
```

---

## 6. Phase 4 상세: 데이터 손실 차단

### 6.1 `setStudentCount` 안전화

```typescript
setStudentCount: async (count: number) => {
  const clamped = Math.max(1, Math.min(50, count));
  const { students } = get();

  if (clamped > students.length) {
    // 증가: 기존 로직 유지
    ...
  } else if (clamped < students.length) {
    const toRemoveCount = students.length - clamped;
    const sorted = [...students].sort((a, b) => (a.studentNumber ?? 0) - (b.studentNumber ?? 0));

    // 1단계: 비활성 학생부터 끝번호 우선 제거
    const inactiveFromEnd = sorted
      .map((s, i) => ({ s, i }))
      .reverse()
      .filter(({ s }) => isStudentInactive(s))
      .slice(0, toRemoveCount);

    if (inactiveFromEnd.length === toRemoveCount) {
      // 비활성만으로 충분
      const removeIndices = new Set(inactiveFromEnd.map(({ i }) => i));
      const newStudents = sorted.filter((_, i) => !removeIndices.has(i));
      await studentRepository.saveStudents(newStudents);
      set({ students: newStudents });
      return;
    }

    // 2단계: 활성 학생도 잘라야 함 → 컴포넌트가 모달 띄우도록 throw
    const stillNeed = toRemoveCount - inactiveFromEnd.length;
    const activeToRemove = sorted
      .filter((s) => isStudentActive(s))
      .slice(-stillNeed);

    throw new ActiveStudentRemovalRequiredError({
      inactiveToRemove: inactiveFromEnd.map(({ s }) => s),
      activeToRemove,
      proceed: async () => {
        const allToRemove = new Set([
          ...inactiveFromEnd.map(({ s }) => s.id),
          ...activeToRemove.map((s) => s.id),
        ]);
        const newStudents = sorted.filter((s) => !allToRemove.has(s.id));
        await studentRepository.saveStudents(newStudents);
        set({ students: newStudents });
      },
    });
  }
},
```

`ActiveStudentRemovalRequiredError`는 컴포넌트 측에서 catch하여 `StudentCountReduceConfirmModal`을 노출.

### 6.2 StudentCountReduceConfirmModal

> frontend-architect 에이전트 디자인. **확인 패턴: "삭제" 텍스트 직접 입력** (근거는 §6.2.7).
> 신설 위치: `src/adapters/components/Homeroom/RosterImport/StudentCountReduceConfirmModal.tsx`

#### 6.2.1 Layout (ASCII mockup)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ⚠  5명의 학생 데이터가 영구 삭제됩니다                                       │
│  ──────────────────────────────────────────────────────────────────────── │
│  [-] 버튼으로 학생 수를 줄이려면 아래 학생의 모든 정보                           │
│  (이름·연락처·보호자·학생기록 등)가 완전히 사라집니다.                           │
│                                                                          │
│  삭제될 학생 목록                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  26번  김민준  재학  ● 학생기록 있음                                  │   │
│  │  27번  이서윤  재학  ● 학생기록 있음                                  │   │
│  │  28번  박지후  재학                                                  │   │
│  │  29번  최수아  재학                                                  │   │
│  │  30번  윤도현  재학  ● 학생기록 있음                                  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  유지하려면 아래 버튼을 닫고 [명렬 관리]에서 해당 학생을 결번 처리하세요.           │
│                                                                          │
│  이 작업을 실행하려면 아래 입력란에 "삭제"를 입력하세요.                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  여기에 입력…                                                       │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│  ──────────────────────────────────────────────────────────────────────── │
│  [취소 (데이터 보존)]                            [영구 삭제]                 │
└──────────────────────────────────────────────────────────────────────────┘
```

#### 6.2.2 Component skeleton

```tsx
<Modal isOpen size="md" title="학생 데이터가 영구 삭제됩니다"
       closeOnBackdrop={false} closeOnEsc={false}
       initialFocusRef={cancelButtonRef}>
  <div className="px-6 py-4 flex flex-col gap-4">
    <WarningDescription count={studentsToDelete.length} />
    <StudentDeleteList students={studentsToDelete} />
    <GuidanceNote />  {/* "결번 처리" 안내 */}
    <TextConfirmInput
      requiredValue="삭제"
      value={confirmInput}
      onChange={setConfirmInput}
    />
  </div>
  <div className="px-6 py-4 flex items-center justify-between border-t border-sp-border">
    <button ref={cancelButtonRef} onClick={onCancel}>취소 (데이터 보존)</button>
    <button onClick={onConfirm} disabled={confirmInput !== '삭제'}>영구 삭제</button>
  </div>
</Modal>
```

#### 6.2.3 Props interface (확정)

```typescript
interface StudentToDelete {
  id: string;
  studentNumber: number;
  name: string;
  status: string;
  hasRecords: boolean;        // 학생기록 존재 여부
}

interface StudentCountReduceConfirmModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** 실제로 삭제될 활성 학생 목록 (비활성은 이미 자동 제거 완료) */
  studentsToDelete: readonly StudentToDelete[];
}
```

> **호출 측 책임**: `useStudentStore.setStudentCount`가 throw한 `ActiveStudentRemovalRequiredError`를 catch하여 `studentsToDelete = error.activeToRemove`를 props로 넘기고, `onConfirm = () => error.proceed()` 콜백 연결.

#### 6.2.4 Tailwind classes (zone별)

| Zone | 클래스 |
|------|--------|
| 모달 패널 | `bg-sp-card border border-sp-border rounded-xl` (Modal 기본) |
| 경고 제목 영역 | `px-6 pt-6 pb-0 flex items-start gap-3` |
| 경고 아이콘 래퍼 | `w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center shrink-0 mt-0.5` |
| 제목 텍스트 | `text-lg font-bold text-sp-text` ("N명"만 `text-red-400` 강조) |
| 설명 텍스트 | `text-sm text-sp-muted leading-relaxed` |
| 삭제 목록 래퍼 | `rounded-lg border border-red-500/30 bg-red-500/5 overflow-hidden` |
| 목록 헤더 | `px-3 py-2 text-xs font-semibold text-sp-muted border-b border-red-500/20` |
| 목록 행 | `px-3 py-2 flex items-center gap-2 text-sm border-b border-sp-border/30 last:border-0` |
| 학번 + 이름 | `text-sp-text` |
| 상태 배지 (재학) | `text-xs px-1.5 py-0.5 rounded-full bg-sp-accent/15 text-sp-accent` |
| 학생기록 표시 | `text-xs text-amber-400 flex items-center gap-1` + warning 14px |
| 안내문 컨테이너 | `rounded-lg bg-sp-surface border border-sp-border px-3 py-2 text-xs text-sp-muted` |
| 텍스트 확인 라벨 | `text-sm text-sp-text` ("삭제"는 `text-red-400 font-semibold font-mono`) |
| 텍스트 입력 | `w-full rounded-lg border border-sp-border bg-sp-surface px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted/50 focus:outline-none focus:ring-1 focus:ring-red-500/60` |
| 취소 버튼 | `px-4 py-2 rounded-lg border border-sp-border text-sm text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors` |
| 삭제 버튼 비활성 | `px-5 py-2 rounded-lg bg-red-600/30 text-red-400/50 text-sm font-medium cursor-not-allowed` |
| 삭제 버튼 활성 | `px-5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors` |

#### 6.2.5 Interaction states

- **Initial**: 포커스 = 취소 버튼 (`initialFocusRef`). 삭제 버튼 비활성(흐린 빨간)
- **입력 중**: 입력값이 "삭제"와 다르면 버튼 계속 비활성. 일치 순간 버튼 활성화 + `focus:ring-red-500/60` flash
- **삭제 확정**: 버튼 클릭 → onConfirm → 토스트 "N명 삭제됨 — 실행 취소"
- **ESC / backdrop**: `closeOnEsc={false}` + `closeOnBackdrop={false}` — 의도치 않은 해제 차단
- **hasRecords=true 학생**: 행에 `⚠ 학생기록 있음` amber 배지로 위험성 시각화

#### 6.2.6 Accessibility

- `role="dialog"` + `aria-labelledby` + `aria-describedby` (설명 단락 id 참조)
- `initialFocusRef` = 취소 버튼 → 의도치 않은 삭제 방지 (안전 경로 기본 포커스)
- 삭제 버튼: `aria-disabled` + `aria-describedby` → 입력 라벨 id 참조
- 텍스트 입력: `aria-label="삭제 확인 입력"` + `autocomplete="off"` + `spellcheck="false"`
- 학생 목록: `role="list"` + 각 행 `role="listitem"`

#### 6.2.7 확인 패턴 결정 — "삭제" 텍스트 입력 (근거)

**선택**: 사용자가 입력란에 "삭제" 2글자를 직접 타이핑해야 삭제 버튼 활성화.

**근거**:
- **교사 사용자 특성**: ICT 비전문가 + 실수 가능성 높음. "더블 Are You Sure" 패턴은 클릭 습관으로 무의식 통과 가능. 길게 누르기(hold) 패턴은 마우스 + 트랙패드 환경에서 신뢰도 낮음
- **텍스트 입력의 장점**: 손을 멈추고 의도를 확인하는 물리적 마찰. 글자를 타이핑하는 행동 자체가 "정말 맞다"는 재확인 루프
- **"삭제" 선택 이유**: 2글자로 짧고 명확. 영문 "delete"는 IME 전환 실수 유발 가능. GitHub·Supabase 등 실무 검증 패턴
- **피해야 할 것**: 레포지토리 이름 입력처럼 긴 텍스트는 IME 환경에서 오타 유발. 2글자가 적정
- **취소 버튼 라벨 "취소 (데이터 보존)"**: 주 행동이 무엇인지 명확. 패닉 상태에서도 안전 경로 직관적

### 6.3 ConsultationCreateModal 학번 불변 가드

**전략 변경**: Supabase 스키마 (`targetStudents: { number }`)는 그대로 유지하되, **학번이 import·편집을 거쳐도 변하지 않도록 보장**한다. 학번 보존은 Phase 3의 `applyImportPlan`이 이미 제공 (matched/merge 모드는 기존 id 보존 + imported.studentNumber 적용).

추가 가드:
- `RosterManagementTab` 학생 번호 input 변경 시 toast 경고: "학번을 변경하면 진행 중인 상담의 대상이 달라질 수 있습니다"
- `useStudentStore.updateStudentField('studentNumber', ...)`에 사용처가 있는지 확인 → ConsultationDetail이 number로 학생을 찾음

```typescript
// ConsultationCreateModal.tsx — 변경 없음 (number 유지)
targetStudents: filterActive(students).map((s) => ({ number: s.studentNumber ?? 0 })),

// 단, filterActive로 통일 (Phase 2 codemod에 포함)
```

`ConsultationDetail` (read-side):
- 기존: `students.find((s) => s.studentNumber === target.number)`
- 변경 없음. 학번이 보존되므로 정상 동작.
- 단, 학번이 미설정인 학생 처리 추가: `?.studentNumber ?? 0` 가드 강화.

---

## 7. Phase 5 상세: 시스템 통합

### 7.1 ClassRosterSelector 안내 배너

```tsx
{/* ClassRosterSelector.tsx 상단에 추가 */}
<div className="flex items-start gap-2 px-3 py-2 mb-3 rounded-lg border border-sp-accent/30 bg-sp-accent/10 text-xs text-sp-muted">
  <span className="material-symbols-outlined text-sp-accent text-base">info</span>
  <p>
    여기서 만든 학급 명렬은 <b>도구 전용</b>입니다.
    <br />담임반·수업반 명렬과는 별도로 저장됩니다.
    설정에서 "담임반 명렬 가져오기"를 사용하면 한번에 채울 수 있습니다.
  </p>
</div>
```

### 7.2 Settings 복사 액션

```tsx
// src/adapters/components/Settings/RosterCopyAction.tsx (신설)
export function RosterCopyAction() {
  const students = useStudentStore((s) => s.activeStudents());
  const teachingClasses = useTeachingClassStore((s) => s.classes);
  const updateClass = useTeachingClassStore((s) => s.updateClass);
  const showToast = useToastStore((s) => s.show);
  const [target, setTarget] = useState<string | null>(null);

  const handleCopy = async () => {
    if (!target) return;
    const cls = teachingClasses.find((c) => c.id === target);
    if (!cls) return;
    const tcStudents: TeachingClassStudent[] = students.map((s) => ({
      number: s.studentNumber ?? 0,
      name: s.name,
      // grade·classNum은 settings에서 가져옴
    }));
    await updateClass({ ...cls, students: tcStudents });
    showToast(`${tcStudents.length}명을 ${cls.name}(${cls.subject})에 복사했습니다`, 'success');
  };

  return (
    <div className="rounded-xl bg-sp-card border border-sp-border p-4">
      <h4 className="text-sm font-bold text-sp-text mb-2">담임반 → 수업반 명렬 복사</h4>
      <p className="text-xs text-sp-muted mb-3">담임 명렬을 선택한 수업반에 일괄 복사합니다. 기존 수업반 명단은 교체됩니다.</p>
      <select value={target ?? ''} onChange={(e) => setTarget(e.target.value || null)} className="...">
        <option value="">수업반 선택...</option>
        {teachingClasses.map((c) => (
          <option key={c.id} value={c.id}>{c.name} - {c.subject}</option>
        ))}
      </select>
      <button onClick={() => void handleCopy()} disabled={!target} className="...">복사</button>
    </div>
  );
}
```

배치 위치: `Settings` 페이지의 "데이터 관리" 섹션. 기존 backup·restore 컴포넌트 옆.

### 7.3 (선택) Legacy class-rosters 마이그레이션

`useClassRosterStore`에 `migrateToTeachingClass(rosterId, teachingClassId)` 메서드 추가. UI는 ClassRosterSelector에 "이 명렬을 수업반으로 변환" 버튼.

본 PDCA 범위 — 시간 허락 시. 미구현 시 별도 PDCA로 분리.

---

## 8. Phase 6 상세: 그룹 명단 분리 옵션

### 8.1 스키마 확장

```typescript
// src/domain/entities/TeachingClass.ts
export interface TeachingClass {
  ...
  /** 'shared' (기본): 같은 groupId 클래스가 명단 공유. 'independent': 과목별 다른 명단 */
  readonly studentSyncMode?: 'shared' | 'independent';
}
```

기본값 `'shared'` (현재 동작 유지). 명시적으로 `'independent'`일 때만 분리.

### 8.2 syncGroupStudents 분기

```typescript
syncGroupStudents: async (groupId, students) => {
  const classes = get().classes;
  const target = classes.find((c) => c.groupId === groupId);
  if (target?.studentSyncMode === 'independent') {
    // 단일 클래스만 업데이트 (caller가 정확한 classId를 알 수 있도록 시그니처 변경 검토)
    // → 호출자가 updateClass를 직접 사용하도록 안내. syncGroupStudents는 'shared' 전용.
    return;
  }
  // 기존 로직 (shared 분기)
  ...
},
```

### 8.3 ClassRosterTab 토글 UI

```tsx
{/* 그룹 멤버일 때만 노출 */}
{cls.groupId && groupSiblingCount > 1 && (
  <label className="flex items-center gap-2 text-xs">
    <input
      type="checkbox"
      checked={cls.studentSyncMode === 'independent'}
      onChange={(e) => void updateClass({
        ...cls,
        studentSyncMode: e.target.checked ? 'independent' : 'shared',
      })}
    />
    <span>이 과목은 다른 명단 사용 (그룹과 분리)</span>
  </label>
)}
```

토글 활성화 시: 기존 명단을 그대로 복사한 독립 명단으로 분기. 이후 변경은 이 클래스에만 적용.

### 8.4 일괄 입력 부가 정보 보존 (H-9)

Phase 3의 `applyImportPlan`이 이미 처리: `merge` 모드 또는 `replace` 모드 모두 기존 id 유지 → 부가 정보 보존. 단일 열 모드(이름만)는 자동으로 `merge` 액션 default로 적용 (이름 매칭만 신뢰).

---

## 9. 위험 / 회귀 / 롤백

### 9.1 codemod 누락 위험

- **방어**: 메타테스트 + tsc + 수동 회귀 시나리오 8건 (Plan §7)
- **롤백**: Phase 2 commit 단위로 분리. 회귀 발견 시 `git revert` 가능
- **잔여 위험**: 메타테스트가 grep 기반이라 동적 import·변수명 다른 케이스(`student.isVacant` 외에 `s.isVacant` 등)는 정규식 패턴에 모두 포함시켜야 함. 확장 패턴: `\b\w+\.isVacant\b`

### 9.2 마이그레이션 부작용

- **위험**: 기존 데이터에서 status='active' & isVacant=true인 비정상 케이스 → 마이그레이션 결과 isVacant=false로 강제 동기화. 사용자가 의도적으로 이렇게 만든 경우(상상하기 어려움)에도 변경됨.
- **방어**: 마이그레이션 1회 수행 시 콘솔 로그 + 변경 통계 토스트 ("N명의 학생 데이터가 정규화되었습니다")
- **롤백**: 사용자가 클라우드 백업으로 복원 가능 (별도 PDCA)

### 9.3 import id 보존 알고리즘 오작동

- **위험**: 매칭 알고리즘이 잘못된 학생을 매칭하여 외부 참조가 다른 학생으로 옮겨감
- **방어**:
  - 우선순위 1(이름+학번 완전 일치)만 자동 — 가장 안전
  - 우선순위 2~5는 모두 conflict로 분류 → 사용자 결정
  - 모든 작업은 토스트 "실행 취소" 5초간 가능
- **추가 안전망**: 적용 직전에 `console.info` 로 매칭 결과 dump (디버깅용)

### 9.4 Supabase 호환성

- `targetStudents` 스키마 변경 없음 → 외부 시스템(예: 학부모 상담 링크) 영향 0
- 학번 불변만 보장하면 외부 참조 무결성 유지

### 9.5 native-desktop v2.1.0 RC와의 충돌

- 본 PDCA는 별도 브랜치 `feature/roster-data-consistency`에서 진행
- merge 시 `useStudentStore.ts` / `useTeachingClassStore.ts`만 충돌 가능 → 수동 머지
- native-desktop이 main 도달 후 본 PDCA를 main에 merge

---

## 10. 테스트 전략

### 10.1 단위 테스트 (Vitest)

- `studentActivity.test.ts` — 9 케이스 매트릭스
- `rosterImportPlan.test.ts` — 6 분기 + 중복 매칭 방지
- 기존 `rosterImportRules.test.ts` (있다면) 회귀 확인
- 기존 `seatRules.test.ts` 회귀 확인

### 10.2 메타 테스트

- `studentActivityCallSites.test.ts` — `\.isVacant` 직접 사용처 화이트리스트 강제

### 10.3 통합 / E2E (수동)

Plan §7 시나리오 그대로 수행. 핵심:
1. status='transferred' & isVacant=false 가짜 데이터 주입 → 자동 정규화 + 모든 화면에서 비활성 처리 확인
2. 학생 30명 import → 학생기록 일부 입력 → 다시 import → 학생기록 살아있는지 확인
3. [-] 5번 클릭 → 비활성 우선 제거 동작 확인
4. 그룹 내 한 과목만 명단 분리 → 다른 과목 영향 없는지 확인

### 10.4 Zero Script QA (Phase 3·4 적용 시)

JSON 로깅으로 import 결과 추적:
```typescript
console.info('[roster-import]', { matched: plan.matched.length, conflicts: plan.conflicts.length, newOnly: plan.newOnly.length });
```
qa-monitor 에이전트가 로그 분석하여 의도한 결과인지 확인.

---

## 11. 미해결 / 후속 작업

- 명렬 변경 audit log
- Google Drive sync에서 명렬 충돌 해결 (다른 기기에서 동시 수정)
- 과제 시스템 `Assignment.targetStudents` 외부 참조 형식 통일 (현재 useStudentLists의 합성 id 의존)
- 학생 통합 검색 (담임 + 수업반 + 학급 명렬 횡단)
- legacy `useClassRosterStore` 단계적 제거 결정

---

## 12. 변경 이력

| 일자 | 작성자 | 내용 |
|------|--------|------|
| 2026-05-07 | pblsketch | 초안 작성 (도메인·codemod·migration·meta-test 설계 완료) |
| 2026-05-07 | pblsketch + bkit:frontend-architect | ConflictResolveModal + StudentCountReduceConfirmModal 풀 spec 통합 (mockup·props·Tailwind·a11y·확인 패턴 결정). 디자인 시스템 v3.2 토큰 준수, 라운드 정책(rounded-xl/lg) 준수, 한국어 UI 텍스트 검증 완료 |
