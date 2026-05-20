/**
 * "이전 자리 피하기" (avoidHistory) 옵션의 단위 테스트.
 *
 * 검증 포인트:
 * - previousSeats 빈 배열 → 기존 동작과 동일
 * - strict: 모든 학생이 과거와 다른 좌표
 * - strict + 풀이 불가능한 상황 → fallback (성공 + relaxed=true 등)
 * - prefer: success=true 보장, violations 에 정보만 기록
 * - fixedSeats 학생은 avoidHistory 영향 받지 않음
 * - 여러 개 이전 배치 누적 제약
 * - pairMode 와 함께 동작
 */
import { describe, it, expect } from 'vitest';
import { shuffleSeatsWithConstraints } from './seatRules';
import type { AvoidHistoryOption } from './seatRules';
import type { SeatConstraints } from '@domain/entities/SeatConstraints';
import { EMPTY_SEAT_CONSTRAINTS } from '@domain/entities/SeatConstraints';

/** 결정론적 PRNG */
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

/** 좌석에서 (studentId → "r,c") 맵 추출 */
function positionMap(seats: readonly (readonly (string | null)[])[]): Map<string, string> {
  const map = new Map<string, string>();
  seats.forEach((row, r) =>
    row.forEach((id, c) => {
      if (id) map.set(id, `${r},${c}`);
    }),
  );
  return map;
}

/** 두 배치에서 같은 좌표에 있는 학생 수 */
function sameCoordCount(
  current: readonly (readonly (string | null)[])[],
  previous: readonly (readonly (string | null)[])[],
): number {
  const prev = positionMap(previous);
  let count = 0;
  current.forEach((row, r) =>
    row.forEach((id, c) => {
      if (id && prev.get(id) === `${r},${c}`) count += 1;
    }),
  );
  return count;
}

describe('shuffleSeatsWithConstraints — avoidHistory', () => {
  const EMPTY: SeatConstraints = EMPTY_SEAT_CONSTRAINTS;

  // 3x2 = 6 좌석에 6명 가득 채운 배치 (셔플 여지를 충분히 줌)
  const FULL_SEATS: (string | null)[][] = [
    ['a', 'b'],
    ['c', 'd'],
    ['e', 'f'],
  ];

  it('previousSeats 빈 배열 → avoidHistory 미지정과 동일 동작', () => {
    const avoid: AvoidHistoryOption = {
      previousSeats: [],
      strength: 'strict',
    };
    const result = shuffleSeatsWithConstraints(FULL_SEATS, EMPTY, 3, 2, mulberry32(1), {
      avoidHistory: avoid,
    });
    expect(result.success).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('strict: 단일 이전 배치 → 모든 학생이 다른 좌표로 이동', () => {
    const previous = FULL_SEATS;
    const avoid: AvoidHistoryOption = {
      previousSeats: [previous],
      strength: 'strict',
    };

    const result = shuffleSeatsWithConstraints(FULL_SEATS, EMPTY, 3, 2, mulberry32(2), {
      avoidHistory: avoid,
    });
    expect(result.success).toBe(true);
    expect(sameCoordCount(result.seats, previous)).toBe(0);
  });

  it('strict + 좌석 1칸만 비어 있어 풀이 불가 → fallback 으로 success=true', () => {
    // 2x1 = 2석, 학생 2명. strict 셔플은 a,b가 둘 다 자리를 바꿔야 함 → 가능 (a↔b)
    // 하지만 1x2 = 2석 학생 2명 + a 고정좌석 + 이전 배치 = a를 같은 자리에 묶음 → 불가
    const seats: (string | null)[][] = [['a', 'b']];
    const constraints: SeatConstraints = {
      ...EMPTY,
      fixedSeats: [{ studentId: 'a', row: 0, col: 0, reason: '고정' }],
    };
    const previous: (string | null)[][] = [['a', 'b']];
    const avoid: AvoidHistoryOption = {
      previousSeats: [previous],
      strength: 'strict',
    };

    const result = shuffleSeatsWithConstraints(seats, constraints, 1, 2, mulberry32(3), {
      avoidHistory: avoid,
    });
    // fallback 으로 성공해야 함 (avoid 가 가장 약한 제약)
    expect(result.success).toBe(true);
  });

  it('prefer: 위반이 있어도 success=true (best-effort)', () => {
    // 2x1=2석, 학생 2명만 있는 극한 상황. 셔플 시 a-b 가 자리만 바꿈
    const seats: (string | null)[][] = [['a', 'b']];
    const previous: (string | null)[][] = [['a', 'b']];
    const avoid: AvoidHistoryOption = {
      previousSeats: [previous],
      strength: 'prefer',
    };

    const result = shuffleSeatsWithConstraints(seats, EMPTY, 1, 2, mulberry32(4), {
      avoidHistory: avoid,
    });
    // prefer 모드는 항상 success=true
    expect(result.success).toBe(true);
  });

  it('prefer + 위반 발생 시 violations 에 "이전 자리 권고 위반" 메시지 포함', () => {
    // 1x1 좌석 1개, 학생 1명 — 어떻게 셔플해도 같은 자리
    const seats: (string | null)[][] = [['a']];
    const previous: (string | null)[][] = [['a']];
    const avoid: AvoidHistoryOption = {
      previousSeats: [previous],
      // 우선 prefer 로 — 무조건 같은 자리
      strength: 'prefer',
    };

    const result = shuffleSeatsWithConstraints(seats, EMPTY, 1, 1, mulberry32(5), {
      avoidHistory: avoid,
    });
    expect(result.success).toBe(true);
    expect(result.violations.some((v) => v.includes('이전 자리'))).toBe(true);
  });

  it('fixedSeats 학생은 avoidHistory 위반 검사에서 제외 (사용자 강제 위치)', () => {
    // a는 (0,0) 고정. 이전 배치도 a가 (0,0). strict 여도 a 는 violation 아님
    const seats: (string | null)[][] = [['a', 'b']];
    const previous: (string | null)[][] = [['a', 'b']];
    const constraints: SeatConstraints = {
      ...EMPTY,
      fixedSeats: [{ studentId: 'a', row: 0, col: 0, reason: '고정' }],
    };
    const avoid: AvoidHistoryOption = {
      previousSeats: [previous],
      strength: 'strict',
    };

    const result = shuffleSeatsWithConstraints(seats, constraints, 1, 2, mulberry32(6), {
      avoidHistory: avoid,
    });

    // a는 fixed라 strict 검증 제외 → b만 자리를 바꾸면 성공
    expect(result.success).toBe(true);
    expect(result.seats[0]![0]).toBe('a'); // a는 고정
  });

  it('여러 개 이전 배치 누적: 학생이 모든 이전 배치 좌표와 달라야 함 (strict)', () => {
    // 충분히 큰 좌석으로 테스트 — 3x3=9석에 6명
    const wide: (string | null)[][] = [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      [null, null, null],
    ];
    const prev1: (string | null)[][] = [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      [null, null, null],
    ];
    const prev2: (string | null)[][] = [
      ['b', 'a', 'd'],
      ['c', 'f', 'e'],
      [null, null, null],
    ];
    const avoid: AvoidHistoryOption = {
      previousSeats: [prev1, prev2],
      strength: 'strict',
    };

    const result = shuffleSeatsWithConstraints(wide, EMPTY, 3, 3, mulberry32(7), {
      avoidHistory: avoid,
    });

    // 성공한 경우 두 이전 배치 모두에 대해 위반 없음 (또는 fallback 동작)
    if (result.success) {
      expect(sameCoordCount(result.seats, prev1)).toBe(0);
      expect(sameCoordCount(result.seats, prev2)).toBe(0);
    }
    // 실패해도 fallback 으로 결과는 반환됨
    expect(result.seats).toBeDefined();
  });

  it('일반 분리 제약과 동시 사용 → 둘 다 만족하는 배치 가능', () => {
    const previous = FULL_SEATS;
    const constraints: SeatConstraints = {
      ...EMPTY,
      separations: [{ studentA: 'a', studentB: 'b', minDistance: 1 }],
    };
    const avoid: AvoidHistoryOption = {
      previousSeats: [previous],
      strength: 'strict',
    };

    const result = shuffleSeatsWithConstraints(FULL_SEATS, constraints, 3, 2, mulberry32(8), {
      avoidHistory: avoid,
    });

    expect(result.success).toBe(true);
    // strict 성공 시 같은 좌표 0
    expect(sameCoordCount(result.seats, previous)).toBe(0);
  });

  it('pairMode + avoidHistory 함께 동작 (시그니처 충돌 없음)', () => {
    const seats: (string | null)[][] = [
      ['a', 'b', 'c', 'd'],
      ['e', 'f', 'g', 'h'],
    ];
    const previous = seats;
    const avoid: AvoidHistoryOption = {
      previousSeats: [previous],
      strength: 'prefer',
    };

    const result = shuffleSeatsWithConstraints(seats, EMPTY, 2, 4, mulberry32(9), {
      pairMode: true,
      oddColumnMode: 'single',
      avoidHistory: avoid,
    });

    expect(result.success).toBe(true);
    // 학생 ID 보존
    const ids = new Set(result.seats.flat().filter((x): x is string => x !== null));
    expect(ids.size).toBe(8);
  });

  it('빈자리 좌표는 avoidHistory 비교에서 무시 (null 매칭은 위반 아님)', () => {
    const seats: (string | null)[][] = [
      ['a', null, 'b'],
      [null, 'c', null],
    ];
    const previous: (string | null)[][] = [
      ['a', null, 'b'],
      [null, 'c', null],
    ];
    const avoid: AvoidHistoryOption = {
      previousSeats: [previous],
      strength: 'prefer',
    };

    const result = shuffleSeatsWithConstraints(seats, EMPTY, 2, 3, mulberry32(10), {
      avoidHistory: avoid,
    });

    expect(result.success).toBe(true);
    // 빈자리 위치는 보존되어야 함
    expect(result.seats[0]![1]).toBeNull();
    expect(result.seats[1]![0]).toBeNull();
    expect(result.seats[1]![2]).toBeNull();
  });

  it('strict 성공 케이스에서 success=true 그리고 violations 빈 배열', () => {
    // 충분히 큰 좌석 (4x2=8) 에 4명 → 자리 변경 여유 충분
    const seats: (string | null)[][] = [
      ['a', 'b'],
      ['c', 'd'],
      [null, null],
      [null, null],
    ];
    const previous = seats;
    const avoid: AvoidHistoryOption = {
      previousSeats: [previous],
      strength: 'strict',
    };

    const result = shuffleSeatsWithConstraints(seats, EMPTY, 4, 2, mulberry32(11), {
      avoidHistory: avoid,
    });

    expect(result.success).toBe(true);
    expect(result.violations).toEqual([]);
    // strict 성공 시 한 명도 같은 자리에 있지 않아야 함
    expect(sameCoordCount(result.seats, previous)).toBe(0);
  });
});
