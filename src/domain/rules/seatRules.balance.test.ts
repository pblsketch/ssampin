import { describe, it, expect } from 'vitest';
import {
  shuffleSeatsTwoStage,
  computeBalanceScore,
  computeLexScore,
  compareLexScores,
} from './seatRules';
import type { SeatConstraints } from '@domain/entities/SeatConstraints';
import type { StudentPiiOverlay } from '@domain/entities/StudentPiiOverlay';

/**
 * seatRules.balance.test — ADR Decision 3 + Critic C#7
 *
 * Acceptance:
 *   - 'balance(academicLevel) lexicographically beats balance(gender)'
 *   - 'row variance for ABCDE under threshold over 100 runs'
 */

function fillGrid(rows: number, cols: number, studentIds: readonly string[]): (string | null)[][] {
  const grid: (string | null)[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null),
  );
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (idx < studentIds.length) {
        grid[r]![c] = studentIds[idx]!;
        idx++;
      }
    }
  }
  return grid;
}

/**
 * Stratified 균등 분포 학생 풀: 행 수 × 등급 수만큼 학생 생성.
 * 각 행에 A·B·C·D·E 1명씩 들어가야 평균 분산 0이 가능.
 */
function makeStratifiedPii(rows: number, perLevel: number): {
  studentIds: string[];
  pii: Map<string, StudentPiiOverlay>;
} {
  const levels: Array<NonNullable<StudentPiiOverlay['academicLevel']>> = ['A', 'B', 'C', 'D', 'E'];
  const studentIds: string[] = [];
  const pii = new Map<string, StudentPiiOverlay>();
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let lv = 0; lv < perLevel; lv++) {
      for (const level of levels) {
        const id = `s${n++}`;
        studentIds.push(id);
        pii.set(id, {
          studentId: id,
          gender: n % 2 === 0 ? 'M' : 'F',
          academicLevel: level,
        });
      }
    }
  }
  return { studentIds, pii };
}

const EMPTY: SeatConstraints = {
  zones: [],
  separations: [],
  adjacencies: [],
  fixedSeats: [],
  forbiddenPairs: [],
  balanceDescriptors: [],
};

describe('balance descriptors', () => {
  it('balance(academicLevel) lexicographically beats balance(gender) when ordered first', () => {
    // s0,s1 = A/M, s2,s3 = C/F, s4,s5 = E/M
    const pii = new Map<string, StudentPiiOverlay>([
      ['s0', { studentId: 's0', gender: 'M', academicLevel: 'A' }],
      ['s1', { studentId: 's1', gender: 'M', academicLevel: 'A' }],
      ['s2', { studentId: 's2', gender: 'F', academicLevel: 'C' }],
      ['s3', { studentId: 's3', gender: 'F', academicLevel: 'C' }],
      ['s4', { studentId: 's4', gender: 'M', academicLevel: 'E' }],
      ['s5', { studentId: 's5', gender: 'M', academicLevel: 'E' }],
    ]);

    // row-internal variance 평균 알고리즘:
    //   각 행 내부의 ord 분산을 평균. 행 내부가 동질일수록 낮은 score (균질 = 좋음).
    //
    // gridHomogeneous: 각 행에 동일 등급 → 행 내부 var 0 → score 0
    //   행1: A,A → ord 5,5 → var 0
    //   행2: C,C → ord 3,3 → var 0
    //   행3: E,E → ord 1,1 → var 0
    //   평균 = 0
    const gridHomogeneous: (string | null)[][] = [
      ['s0', 's1'],
      ['s2', 's3'],
      ['s4', 's5'],
    ];
    // gridHeterogeneous: 행마다 등급 섞임 → 행 내부 var ↑
    //   행1: A,C → ord 5,3 → var 1
    //   행2: E,A → ord 1,5 → var 4
    //   행3: C,E → ord 3,1 → var 1
    //   평균 = (1+4+1)/3 = 2
    const gridHeterogeneous: (string | null)[][] = [
      ['s0', 's2'],
      ['s4', 's1'],
      ['s3', 's5'],
    ];

    const descriptors = [{ kind: 'academicLevel' as const }, { kind: 'gender' as const }];
    const scoreHomogeneous = computeLexScore(gridHomogeneous, pii, descriptors);
    const scoreHeterogeneous = computeLexScore(gridHeterogeneous, pii, descriptors);

    // academicLevel score 우선 lex → homogeneous(행 내부 동질)가 낮은 score = 우선
    expect(scoreHomogeneous[0]).toBeLessThan(scoreHeterogeneous[0]!);
    // compareLexScores: homogeneous < heterogeneous (정렬 시 homogeneous 우선)
    expect(compareLexScores(scoreHomogeneous, scoreHeterogeneous)).toBeLessThan(0);

    // 정확한 값 검증: row-internal variance 평균
    expect(scoreHomogeneous[0]).toBe(0);
    expect(scoreHeterogeneous[0]).toBeCloseTo(2, 5);
  });

  it('compareLexScores: 첫 컴포넌트가 같으면 두 번째 컴포넌트 비교', () => {
    expect(compareLexScores([1, 2], [1, 3])).toBeLessThan(0);
    expect(compareLexScores([1, 3], [1, 2])).toBeGreaterThan(0);
    expect(compareLexScores([1, 2], [1, 2])).toBe(0);
    expect(compareLexScores([0.5, 100], [0.6, 0])).toBeLessThan(0); // 첫 컴포넌트 결정
  });

  it('computeBalanceScore: undefined 등급 학생은 점수 계산에서 제외', () => {
    const pii = new Map<string, StudentPiiOverlay>([
      ['s0', { studentId: 's0', academicLevel: 'A' }],
      ['s1', { studentId: 's1' }], // undefined
    ]);
    const grid: (string | null)[][] = [['s0', 's1']];
    const score = computeBalanceScore(grid, pii, 'academicLevel');
    // 1명만 점수 계산 → variance 0
    expect(score).toBe(0);
  });

  it('row variance for ABCDE under threshold over multiple runs (stratified pool)', () => {
    // 행 수 = 3, 각 행에 A·B·C·D·E 1명씩 = 5열 × 3행 = 15명
    const stratified = makeStratifiedPii(3, 1);
    const seats = fillGrid(3, 5, stratified.studentIds);
    const pii = stratified.pii;
    const constraints: SeatConstraints = {
      ...EMPTY,
      balanceDescriptors: [{ kind: 'academicLevel' }],
    };

    let bestScore = Infinity;
    const variances: number[] = [];
    for (let seed = 1; seed <= 30; seed++) {
      const result = shuffleSeatsTwoStage(seats, constraints, 3, 5, pii, {
        seed,
        candidateCount: 50,
      });
      const v = result.score[0] ?? Infinity;
      variances.push(v);
      if (v < bestScore) bestScore = v;
    }

    // stratified 풀에서는 best variance가 매우 작아야 함 (각 행에 5단계 1명씩 = variance 2.0)
    // shuffle이 잘 작동하면 평균에도 영향
    const avg = variances.reduce((s, v) => s + v, 0) / variances.length;
    expect(bestScore).toBeLessThan(2.5);
    expect(avg).toBeLessThan(2.5);
  });

  it('empty grid returns score 0 (no rows scored)', () => {
    const grid: (string | null)[][] = [
      [null, null],
      [null, null],
    ];
    const score = computeBalanceScore(grid, new Map(), 'academicLevel');
    expect(score).toBe(0);
  });

  it('gender ordinal: M=1, F=0 — row-internal variance averaged', () => {
    const pii = new Map<string, StudentPiiOverlay>([
      ['m1', { studentId: 'm1', gender: 'M' }],
      ['m2', { studentId: 'm2', gender: 'M' }],
      ['f1', { studentId: 'f1', gender: 'F' }],
      ['f2', { studentId: 'f2', gender: 'F' }],
    ]);
    // homogeneous(행마다 동성) → 행 내부 var 0 → 평균 0
    const homogeneous: (string | null)[][] = [
      ['m1', 'm2'],
      ['f1', 'f2'],
    ];
    // heterogeneous(행마다 혼성) → 행 내부 var = ((1-0.5)²+(0-0.5)²)/2 = 0.25 → 평균 0.25
    const heterogeneous: (string | null)[][] = [
      ['m1', 'f1'],
      ['m2', 'f2'],
    ];
    expect(computeBalanceScore(homogeneous, pii, 'gender')).toBe(0);
    expect(computeBalanceScore(heterogeneous, pii, 'gender')).toBeCloseTo(0.25, 5);
  });

  it('legacy shuffleSeatsWithConstraints 호환: balanceDescriptors 비어있어도 기존 동작', () => {
    const studentIds = ['a', 'b', 'c', 'd'];
    const seats = fillGrid(2, 2, studentIds);
    const pii = new Map<string, StudentPiiOverlay>();
    const result = shuffleSeatsTwoStage(seats, EMPTY, 2, 2, pii, { seed: 1 });
    expect(result.seats.flat().filter((x) => x !== null)).toHaveLength(4);
  });
});
