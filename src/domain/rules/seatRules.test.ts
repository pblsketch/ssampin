import { describe, it, expect } from 'vitest';
import {
  shuffleSeats,
  shuffleSeatsPreservingGroups,
  shuffleSeatsWithConstraints,
} from './seatRules';
import type { SeatConstraints } from '@domain/entities/SeatConstraints';
import { EMPTY_SEAT_CONSTRAINTS } from '@domain/entities/SeatConstraints';

/** 결정론적 PRNG for tests */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 2D 좌석에서 null 좌표 셋 반환 */
function nullPositions(
  seats: readonly (readonly (string | null)[])[],
): Set<string> {
  const set = new Set<string>();
  for (let r = 0; r < seats.length; r++) {
    for (let c = 0; c < seats[r]!.length; c++) {
      if (seats[r]![c] === null) set.add(`${r},${c}`);
    }
  }
  return set;
}

function studentIdSet(
  seats: readonly (readonly (string | null)[])[],
): Set<string> {
  return new Set(seats.flat().filter((x): x is string => x !== null));
}

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

  it('FR-01: 다양한 빈자리 위치 — 전 좌표 마스크 일치', () => {
    const seats: (string | null)[][] = [
      [null, 'a', 'b', 'c', null],
      ['d', 'e', null, 'f', 'g'],
      ['h', null, 'i', 'j', null],
    ];
    const expectedNulls = nullPositions(seats);
    for (let seed = 1; seed <= 20; seed++) {
      const result = shuffleSeats(seats, mulberry32(seed));
      expect(nullPositions(result)).toEqual(expectedNulls);
    }
  });

  it('FR-02: 학생 ID 총 개수 및 집합 보존', () => {
    const seats: (string | null)[][] = [
      ['a', null, 'b'],
      [null, 'c', 'd'],
    ];
    const expected = studentIdSet(seats);
    for (let seed = 1; seed <= 10; seed++) {
      const result = shuffleSeats(seats, mulberry32(seed));
      expect(studentIdSet(result)).toEqual(expected);
    }
  });

  it('FR-06: 빈자리 0일 때 기존 동작처럼 모든 좌표 채워짐', () => {
    const seats: (string | null)[][] = [
      ['a', 'b'],
      ['c', 'd'],
    ];
    const result = shuffleSeats(seats, mulberry32(7));
    expect(nullPositions(result).size).toBe(0);
    expect(studentIdSet(result)).toEqual(new Set(['a', 'b', 'c', 'd']));
  });

  it('FR-07: 빈자리가 맨 뒤에 있던 케이스에서도 위치 유지 (회귀)', () => {
    const seats: (string | null)[][] = [
      ['a', 'b', 'c'],
      ['d', 'e', null],
    ];
    const result = shuffleSeats(seats, mulberry32(3));
    expect(result[1]![2]).toBeNull();
    expect(nullPositions(result)).toEqual(new Set(['1,2']));
  });

  it('E2: 학생 0명이면 결과도 전부 null', () => {
    const seats: (string | null)[][] = [
      [null, null],
      [null, null],
    ];
    const result = shuffleSeats(seats, mulberry32(1));
    expect(result.flat().every((x) => x === null)).toBe(true);
  });

  it('E3: 1×1 빈 그리드', () => {
    const seats: (string | null)[][] = [[null]];
    const result = shuffleSeats(seats, mulberry32(1));
    expect(result).toEqual([[null]]);
  });

  it('E4: 1×1 단일 학생', () => {
    const seats: (string | null)[][] = [['s1']];
    const result = shuffleSeats(seats, mulberry32(1));
    expect(result).toEqual([['s1']]);
  });

  it('결정론: 동일 seed → 동일 결과', () => {
    const seats: (string | null)[][] = [
      ['a', null, 'b', 'c'],
      [null, 'd', 'e', null],
    ];
    const r1 = shuffleSeats(seats, mulberry32(999));
    const r2 = shuffleSeats(seats, mulberry32(999));
    expect(r1).toEqual(r2);
  });
});

describe('shuffleSeatsPreservingGroups', () => {
  it('FR-03: 짝꿍 그룹 구조 + 빈자리 좌표 보존 (single)', () => {
    // 4열 짝꿍 모드: [0-1] [2-3]
    const seats: (string | null)[][] = [
      ['a', 'b', 'c', null],
      [null, 'd', 'e', 'f'],
    ];
    const expectedNulls = nullPositions(seats);
    for (let seed = 1; seed <= 15; seed++) {
      const result = shuffleSeatsPreservingGroups(
        seats,
        4,
        'single',
        mulberry32(seed),
      );
      expect(nullPositions(result)).toEqual(expectedNulls);
      expect(studentIdSet(result)).toEqual(studentIdSet(seats));
    }
  });

  it('FR-03: 5열 single 모드 — 홀수 열이 단독 그룹', () => {
    const seats: (string | null)[][] = [
      ['a', 'b', 'c', 'd', null],
      [null, 'e', 'f', 'g', 'h'],
    ];
    const expectedNulls = nullPositions(seats);
    const result = shuffleSeatsPreservingGroups(
      seats,
      5,
      'single',
      mulberry32(5),
    );
    expect(nullPositions(result)).toEqual(expectedNulls);
    expect(studentIdSet(result)).toEqual(studentIdSet(seats));
  });

  it('triple 모드에서 빈자리 위치 유지', () => {
    const seats: (string | null)[][] = [
      ['a', 'b', null, 'c', 'd'],
      ['e', null, 'f', 'g', 'h'],
    ];
    const expectedNulls = nullPositions(seats);
    const result = shuffleSeatsPreservingGroups(
      seats,
      5,
      'triple',
      mulberry32(11),
    );
    expect(nullPositions(result)).toEqual(expectedNulls);
    expect(studentIdSet(result)).toEqual(studentIdSet(seats));
  });
});

describe('shuffleSeatsWithConstraints', () => {
  const baseConstraints: SeatConstraints = EMPTY_SEAT_CONSTRAINTS;

  it('제약 없음: shuffleSeats로 fallback되어 빈자리 유지', () => {
    const seats: (string | null)[][] = [
      ['a', null, 'b'],
      [null, 'c', 'd'],
    ];
    const expectedNulls = nullPositions(seats);
    const { seats: result, success } = shuffleSeatsWithConstraints(
      seats,
      baseConstraints,
      2,
      3,
      mulberry32(42),
    );
    expect(success).toBe(true);
    expect(nullPositions(result)).toEqual(expectedNulls);
  });

  it('FR-04: 분리 제약 + 빈자리 위치 보존', () => {
    const seats: (string | null)[][] = [
      ['a', 'b', 'c'],
      ['d', null, 'e'],
      ['f', 'g', null],
    ];
    const expectedNulls = nullPositions(seats);
    const constraints: SeatConstraints = {
      ...EMPTY_SEAT_CONSTRAINTS,
      separations: [{ studentA: 'a', studentB: 'b', minDistance: 2 }],
    };
    const { seats: result } = shuffleSeatsWithConstraints(
      seats,
      constraints,
      3,
      3,
      mulberry32(5),
    );
    expect(nullPositions(result)).toEqual(expectedNulls);
    expect(studentIdSet(result)).toEqual(studentIdSet(seats));
  });

  it('FR-04: 영역(zone) 제약 + 빈자리 위치 보존', () => {
    const seats: (string | null)[][] = [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      [null, 'g', null],
    ];
    const expectedNulls = nullPositions(seats);
    const constraints: SeatConstraints = {
      ...EMPTY_SEAT_CONSTRAINTS,
      zones: [{ studentId: 'a', zone: 'front1', reason: 'test' }],
    };
    const { seats: result } = shuffleSeatsWithConstraints(
      seats,
      constraints,
      3,
      3,
      mulberry32(7),
    );
    expect(nullPositions(result)).toEqual(expectedNulls);
    expect(studentIdSet(result)).toEqual(studentIdSet(seats));
    // a는 front1(row=0)에 있어야 함
    const aPos = result.flatMap((row, r) =>
      row.map((id, c) => ({ id, r, c })),
    ).find((x) => x.id === 'a');
    expect(aPos?.r).toBe(0);
  });

  it('FR-05: 고정좌석이 원본 빈자리 좌표를 지정하면 학생이 앉음 (빈자리 덮어쓰기 허용)', () => {
    const seats: (string | null)[][] = [
      ['a', 'b', 'c'],
      ['d', 'e', null], // (1,2)가 빈자리
    ];
    const constraints: SeatConstraints = {
      ...EMPTY_SEAT_CONSTRAINTS,
      fixedSeats: [
        { studentId: 'a', row: 1, col: 2, reason: '고정' }, // 빈자리 (1,2)에 a 고정
      ],
    };
    const { seats: result } = shuffleSeatsWithConstraints(
      seats,
      constraints,
      2,
      3,
      mulberry32(9),
    );
    // 고정된 (1,2)는 'a'
    expect(result[1]![2]).toBe('a');
    // 그 대신 원래 a가 있던 (0,0)이 비게 됨 → 학생 ID는 보존되지만 null 좌표가 이동함
    // 이 케이스는 "사용자 의도적 배정"이므로 빈자리 위치가 변해도 허용
    expect(studentIdSet(result)).toEqual(new Set(['a', 'b', 'c', 'd', 'e']));
  });

  it('pairMode + 제약 + 빈자리 보존', () => {
    const seats: (string | null)[][] = [
      ['a', 'b', 'c', null],
      [null, 'd', 'e', 'f'],
    ];
    const expectedNulls = nullPositions(seats);
    const constraints: SeatConstraints = {
      ...EMPTY_SEAT_CONSTRAINTS,
      adjacencies: [{ studentA: 'a', studentB: 'd', maxDistance: 3 }],
    };
    const { seats: result } = shuffleSeatsWithConstraints(
      seats,
      constraints,
      2,
      4,
      mulberry32(13),
      { pairMode: true, oddColumnMode: 'single' },
    );
    expect(nullPositions(result)).toEqual(expectedNulls);
    expect(studentIdSet(result)).toEqual(studentIdSet(seats));
  });
});
