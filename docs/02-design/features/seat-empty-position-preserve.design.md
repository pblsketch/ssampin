---
template: design
version: 1.0
feature: seat-empty-position-preserve
date: 2026-04-22
author: pblsketch
project: ssampin
plan: ../../01-plan/features/seat-empty-position-preserve.plan.md
---

# 자리 배치 빈자리 위치 보존 설계서

> **요약**: Plan에서 정의한 FR-01~FR-07을 만족시키는 순수 함수 3개의 Before/After 시그니처·의사코드·테스트 매트릭스. 셔플 전략을 "null을 뒤로 밀기" → "원본 null 좌표를 마스크로 보존"으로 변경한다.
>
> **Based on Plan**: [seat-empty-position-preserve.plan.md](../../01-plan/features/seat-empty-position-preserve.plan.md)
> **Status**: Draft

---

## 1. Design Overview

### 1.1 Goal

`src/domain/rules/seatRules.ts`의 셔플 관련 3개 순수 함수를 수정하여, 원본 `seats` 2D 배열에서 `null`이었던 좌표가 결과에서도 동일 좌표에 `null`로 남도록 한다. 함수 시그니처·호출부는 변경하지 않는다.

### 1.2 Scope of Change

| 파일 | 변경 종류 | 라인 대략 |
|------|-----------|-----------|
| [src/domain/rules/seatRules.ts](../../../src/domain/rules/seatRules.ts) | 수정 | 67~102 (`shuffleSeatsPreservingGroups`), 108~140 (`shuffleSeats`), 440~468 (freeSlots 빌드 로직) |
| src/domain/rules/seatRules.test.ts | 신규 | - |

호출부([RandomizeSeats.ts](../../../src/usecases/seating/RandomizeSeats.ts), [Seating.tsx](../../../src/adapters/components/Seating/Seating.tsx), [ShuffleOverlay.tsx](../../../src/adapters/components/Seating/ShuffleOverlay.tsx), [GroupShuffleOverlay.tsx](../../../src/adapters/components/Seating/GroupShuffleOverlay.tsx)) 수정 없음.

---

## 2. Function Designs

### 2.1 `shuffleSeats` — 기본 셔플

#### Before (buggy)

```typescript
export function shuffleSeats(seats, random = Math.random) {
  const flat = seats.flatMap((row) => [...row]);
  const studentIds = flat.filter((id): id is string => id !== null);
  const emptyCount = flat.length - studentIds.length;

  // Fisher-Yates on studentIds
  // ...

  // 🔴 학생을 앞에 몰고 null을 뒤에 붙임 → 빈자리 위치 유실
  const arranged = [...studentIds, ...Array(emptyCount).fill(null)];

  // 1D → 2D 복원
}
```

#### After (fixed)

```typescript
export function shuffleSeats(
  seats: readonly (readonly (string | null)[])[],
  random: () => number = Math.random,
): (string | null)[][] {
  const rows = seats.length;
  const cols = seats[0]?.length ?? 0;

  // 1. 학생 ID만 추출 (빈자리 제외)
  const studentIds = seats.flat().filter((id): id is string => id !== null);

  // 2. Fisher-Yates 셔플 (기존 헬퍼 재사용)
  const shuffled = fisherYatesShuffle(studentIds, random);

  // 3. 원본 null 좌표는 null 유지, non-null 좌표에만 셔플된 학생을 row-major로 배치
  const result: (string | null)[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null),
  );
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (seats[r]![c] !== null) {
        result[r]![c] = shuffled[idx++] ?? null;
      }
    }
  }
  return result;
}
```

**핵심**: `seats[r][c]`가 `null`인가로 마스크를 만들어, 결과에서도 동일 좌표는 null 유지.

### 2.2 `shuffleSeatsPreservingGroups` — 짝꿍 모드

#### Before (buggy)

```typescript
export function shuffleSeatsPreservingGroups(seats, cols, oddColumnMode, random) {
  const rows = seats.length;
  const groups = buildPairGroups(cols, oddColumnMode);
  const allStudentIds = seats.flat().filter((id): id is string => id !== null);
  const shuffled = fisherYatesShuffle(allStudentIds, random);

  const grid = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null)
  );

  // 🔴 그룹 순서로 학생을 앞에서부터 채움 → 빈자리 위치 유실
  let studentIdx = 0;
  for (let r = 0; r < rows; r++) {
    for (const group of groups) {
      for (let c = group.startCol; c <= group.endCol; c++) {
        if (studentIdx < shuffled.length) {
          grid[r][c] = shuffled[studentIdx++];
        }
      }
    }
  }
  return grid;
}
```

#### After (fixed)

```typescript
export function shuffleSeatsPreservingGroups(
  seats: readonly (readonly (string | null)[])[],
  cols: number,
  oddColumnMode: OddColumnMode,
  random: () => number = Math.random,
): (string | null)[][] {
  const rows = seats.length;
  const groups = buildPairGroups(cols, oddColumnMode);

  const studentIds = seats.flat().filter((id): id is string => id !== null);
  const shuffled = fisherYatesShuffle(studentIds, random);

  const grid: (string | null)[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null),
  );

  // 그룹 순회 순서로 non-null 좌표에만 셔플된 학생을 배치
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (const group of groups) {
      for (let c = group.startCol; c <= group.endCol; c++) {
        if (seats[r]![c] !== null) {
          grid[r]![c] = shuffled[idx++] ?? null;
        }
      }
    }
  }
  return grid;
}
```

**핵심**: 그룹 순회 순서는 유지(짝꿍 그룹 무결성 보장)하되, 각 셀을 채울 때 원본 null 여부를 마스크로 사용.

### 2.3 `shuffleSeatsWithConstraints` — 제약 조건 경로

현재 `freeSlots`는 "occupied에 포함되지 않은 모든 좌표"로 만들어지고, `shuffledFree` 학생을 앞에서부터 채운다. 결과적으로 남은 null 슬롯은 row-major 순회의 **마지막 셀들**에 몰리게 된다. 이를 "원본 null이었던 좌표는 freeSlots에서 제외"로 변경.

#### Before (buggy) — 발췌 (line 440~468)

```typescript
// 3단계: 나머지 학생 → 남은 빈 자리에 배치
const freeSlots: { row: number; col: number }[] = [];
if (options?.pairMode) {
  const groups = buildPairGroups(cols, options.oddColumnMode ?? 'single');
  for (let r = 0; r < rows; r++) {
    for (const group of groups) {
      for (let c = group.startCol; c <= group.endCol; c++) {
        if (!occupied.has(`${r},${c}`)) {
          freeSlots.push({ row: r, col: c });  // 🔴 원본 null도 포함됨
        }
      }
    }
  }
} else {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!occupied.has(`${r},${c}`)) {
        freeSlots.push({ row: r, col: c });  // 🔴 원본 null도 포함됨
      }
    }
  }
}

const shuffledFree = fisherYatesShuffle(freeStudents, random);
for (let i = 0; i < shuffledFree.length && i < freeSlots.length; i++) {
  const slot = freeSlots[i]!;
  grid[slot.row]![slot.col] = shuffledFree[i]!;
}
// 남은 빈 슬롯은 null 유지
```

#### After (fixed)

```typescript
// 원본 null 좌표 = 빈자리 (고정/영역이 이미 점유하지 않는 한 보존)
const originallyEmpty = (r: number, c: number) => seats[r]![c] === null;

// 3단계: 나머지 학생 → 원본 null이 아니었던 좌표 중 occupied가 아닌 곳에만 배치
const freeSlots: { row: number; col: number }[] = [];
if (options?.pairMode) {
  const groups = buildPairGroups(cols, options.oddColumnMode ?? 'single');
  for (let r = 0; r < rows; r++) {
    for (const group of groups) {
      for (let c = group.startCol; c <= group.endCol; c++) {
        if (!occupied.has(`${r},${c}`) && !originallyEmpty(r, c)) {
          freeSlots.push({ row: r, col: c });
        }
      }
    }
  }
} else {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!occupied.has(`${r},${c}`) && !originallyEmpty(r, c)) {
        freeSlots.push({ row: r, col: c });
      }
    }
  }
}

const shuffledFree = fisherYatesShuffle(freeStudents, random);
for (let i = 0; i < shuffledFree.length && i < freeSlots.length; i++) {
  const slot = freeSlots[i]!;
  grid[slot.row]![slot.col] = shuffledFree[i]!;
}
// 원본 빈자리(originallyEmpty) + 학생이 다 배치되고 남은 freeSlots 모두 null 유지
```

**핵심**: `originallyEmpty(r, c)`를 freeSlots 필터에 AND 조건으로 추가. 이것으로 원래 null이었던 칸은 어떤 학생도 배정되지 않고 결과 `grid`에서도 null로 유지된다.

**고정 좌석이 원본 빈자리 좌표를 지정한 경우의 동작**: 1단계에서 `grid[fc.row][fc.col] = fc.studentId`로 채워지고 `occupied`에 포함되므로, 3단계에서 `originallyEmpty`를 체크하기 전에 이미 학생이 앉은 상태. 즉 **고정 좌석이 원본 빈자리를 덮어쓰는 것은 허용** (사용자의 의도적 배정). 이것은 FR-05 관련 엣지 케이스로 테스트.

---

## 3. Edge Case Matrix

| 케이스 | 입력 | 기대 결과 |
|-------|------|----------|
| E1: 빈자리 0 | 학생 == 좌석 | 기존 동작과 동일 (모든 좌표 채워짐) |
| E2: 전부 빈자리 | 학생 0명 | 결과도 전부 null |
| E3: 1×1 그리드, 학생 0명 | `[[null]]` | `[[null]]` |
| E4: 1×1 그리드, 학생 1명 | `[['s1']]` | `[['s1']]` |
| E5: 빈자리가 맨뒤 오른쪽 | `[[a,b],[c,null]]` | 결과도 (1,1)이 null |
| E6: 빈자리가 앞쪽 왼쪽 | `[[null,a],[b,c]]` | 결과도 (0,0)이 null |
| E7: 빈자리가 중간 분산 | `[[a,null,b],[null,c,d]]` | 결과에서도 (0,1),(1,0) 이 null |
| E8: 짝꿍 모드 + 빈자리 그룹 내부 | pairMode, 그룹 [0-1]열 중 (0,1)이 null | 결과에서도 (0,1)이 null, 그룹 크기 유지 |
| E9: 고정좌석이 원본 빈자리 지정 | `seats[2][0] === null`, fixedSeat={row:2,col:0,studentId:s1} | 결과에서 (2,0)이 s1 (학생이 앉음) |
| E10: 영역고정 + 빈자리 | front1 영역에 빈자리 있음, zone 학생 1명 | zone 학생은 front1 non-null 좌표에 배치, 원본 null은 유지 |
| E11: 분리/인접 제약 + 빈자리 | separation 조건 + 빈자리 2개 | 빈자리 유지하면서 제약 만족 시도 |

---

## 4. Test Matrix (TDD)

### 4.1 테스트 파일 구조

```
src/domain/rules/seatRules.test.ts
├── describe('shuffleSeats')
│   ├── it('FR-01: 원본 null 좌표는 결과에서도 null') — E5~E7
│   ├── it('FR-02: 학생 ID 총 개수 보존') — E5
│   ├── it('FR-06: 빈자리 0일 때 모든 좌표 채워짐') — E1
│   ├── it('E2: 학생 0명이면 결과도 전부 null') — E2
│   ├── it('E3: 1×1 빈 그리드')
│   ├── it('E4: 1×1 단일 학생')
│   ├── it('결정론: 동일 random seed → 동일 결과')
│   └── it('학생 집합은 정확히 같은 ID set')
├── describe('shuffleSeatsPreservingGroups')
│   ├── it('FR-03: 짝꿍 그룹 구조 + 빈자리 좌표 보존') — E8
│   ├── it('단일 열(single) 모드에서 빈자리 위치 유지')
│   └── it('triple 모드에서 빈자리 위치 유지')
└── describe('shuffleSeatsWithConstraints')
    ├── it('FR-04: 제약 + 빈자리 위치 보존') — E11
    ├── it('FR-05: 고정좌석이 원본 빈자리 지정 시 학생이 앉음') — E9
    ├── it('영역고정은 영역 내 non-null 좌표에 배치') — E10
    └── it('pairMode + 제약 조건 + 빈자리 보존')
```

### 4.2 결정론적 랜덤 헬퍼

테스트 파일 내부에 [mulberry32](https://en.wikipedia.org/wiki/Mulberry32) PRNG를 인라인으로 정의해, `random: () => number` 주입으로 재현성 확보.

```typescript
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

### 4.3 핵심 테스트 케이스 예시

```typescript
describe('shuffleSeats', () => {
  it('FR-01: 원본 null 좌표는 결과에서도 null', () => {
    const seats: (string | null)[][] = [
      ['a', null, 'b'],
      [null, 'c', 'd'],
    ];
    const result = shuffleSeats(seats, mulberry32(42));
    expect(result[0]![1]).toBeNull();
    expect(result[1]![0]).toBeNull();
  });

  it('FR-02: 학생 ID 총 개수 보존', () => {
    const seats: (string | null)[][] = [
      ['a', null, 'b'],
      [null, 'c', 'd'],
    ];
    const result = shuffleSeats(seats, mulberry32(42));
    const ids = result.flat().filter((x): x is string => x !== null);
    expect(new Set(ids)).toEqual(new Set(['a', 'b', 'c', 'd']));
  });
});
```

---

## 5. Non-Regression Plan

1. **사용자 시나리오 수동 재현** (릴리즈 전 필수):
   - `npm run dev` 실행
   - 자리배치 → 5열×6행 그리드 + 학생 28명(빈자리 2개) 입력
   - 빈자리를 1열 맨뒤, 5열 맨뒤로 이동
   - 랜덤 배치 10회 반복 → 빈자리가 항상 1열 맨뒤, 5열 맨뒤인지 확인
2. **기존 E2E 동작** (Seating.tsx 호출 경로):
   - 빈자리 0 상태로 셔플 → 모든 좌석이 학생으로 채워지는지
   - 짝꿍 모드 → 그룹 크기(2/3명) 유지
3. **제약 경로**:
   - 고정좌석 1개 + 빈자리 1개 → 고정좌석 보존 + 빈자리 위치 보존
   - 분리 조건 1개 + 빈자리 1개 → 분리 만족 + 빈자리 위치 보존

---

## 6. Rollback Plan

단일 파일 수정이라 `git revert`로 즉시 복구 가능. 별도 플래그 없음.

---

## 7. Release Note Draft (v1.10.5)

```json
{
  "version": "1.10.5",
  "date": "2026-04-22",
  "highlights": "자리 배치 버그 픽스 — 빈자리가 뒤로 밀리지 않아요",
  "changes": [
    {
      "type": "fix",
      "title": "랜덤 자리 배치 시 빈자리 위치가 유지됩니다",
      "description": "교실 구조에 맞춰 배치한 빈자리(예: 1열 맨뒤, 5열 맨뒤)가 랜덤 배치 후에도 원래 위치에 그대로 유지됩니다. 이전에는 학생이 앞에서부터 채워져 빈자리가 항상 맨 뒤 오른쪽 칸으로 몰렸습니다."
    }
  ]
}
```

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-22 | 초기 Design (3함수 수정 + 테스트 매트릭스) | pblsketch |
