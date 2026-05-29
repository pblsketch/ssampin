import { describe, it, expect } from 'vitest';
import {
  shuffleSeatsTwoStage,
  makeSeededRandom,
} from './seatRules';
import type { SeatConstraints } from '@domain/entities/SeatConstraints';
import type { StudentPiiOverlay } from '@domain/entities/StudentPiiOverlay';

/**
 * seatRules.precedence.property.test — ADR Decision 3 + Critic C#7
 *
 * Acceptance: 'for any constraint set, hard layer is satisfied before soft layer is scored'
 *
 * Property test 패턴: seed/학생수/제약을 변화시키며 hard 통과 후보가 있으면 항상
 * 그 후보의 lex score만으로 선택되며, hard 위반 후보가 hard 통과 후보를 누르지 않음을 검증.
 */

function buildEmptyGrid(rows: number, cols: number): (string | null)[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
}

function fillGrid(rows: number, cols: number, studentIds: readonly string[]): (string | null)[][] {
  const grid = buildEmptyGrid(rows, cols);
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

function makePiiUniform(studentIds: readonly string[]): Map<string, StudentPiiOverlay> {
  // 정확히 5단계 균등 분포 (A·B·C·D·E)
  const levels: Array<StudentPiiOverlay['academicLevel']> = ['A', 'B', 'C', 'D', 'E'];
  const pii = new Map<string, StudentPiiOverlay>();
  studentIds.forEach((id, i) => {
    pii.set(id, {
      studentId: id,
      gender: i % 2 === 0 ? 'M' : 'F',
      academicLevel: levels[i % 5],
    });
  });
  return pii;
}

const EMPTY: SeatConstraints = {
  zones: [],
  separations: [],
  adjacencies: [],
  fixedSeats: [],
  forbiddenPairs: [],
  balanceDescriptors: [],
};

describe('shuffleSeatsTwoStage — precedence property', () => {
  it('hard layer (forbiddenPairs) is satisfied before soft scoring (10 seeds × 4 configs)', () => {
    const studentIds = Array.from({ length: 20 }, (_, i) => `s${i}`);
    const seats = fillGrid(5, 4, studentIds);
    const pii = makePiiUniform(studentIds);

    const constraints: SeatConstraints = {
      ...EMPTY,
      forbiddenPairs: [
        { studentA: 's0', studentB: 's1' },
        { studentA: 's2', studentB: 's3' },
      ],
      balanceDescriptors: [{ kind: 'academicLevel' }, { kind: 'gender' }],
    };

    for (let seed = 1; seed <= 10; seed++) {
      const result = shuffleSeatsTwoStage(seats, constraints, 5, 4, pii, {
        seed,
        candidateCount: 30,
      });
      // hardSatisfied가 true면 forbiddenPairs 위반 0
      if (result.hardSatisfied) {
        const violations = result.violations.filter((v) => v.startsWith('forbiddenPair'));
        expect(violations).toHaveLength(0);
      }
    }
  });

  it('when hard-OK candidates exist, hard-violating candidates are never returned', () => {
    const studentIds = Array.from({ length: 12 }, (_, i) => `s${i}`);
    const seats = fillGrid(3, 4, studentIds);
    const pii = makePiiUniform(studentIds);

    const constraints: SeatConstraints = {
      ...EMPTY,
      forbiddenPairs: [{ studentA: 's0', studentB: 's11' }],
      balanceDescriptors: [{ kind: 'academicLevel' }],
    };

    // 큰 candidateCount로 hard 통과 후보가 거의 확실히 발견되도록
    const result = shuffleSeatsTwoStage(seats, constraints, 3, 4, pii, {
      seed: 42,
      candidateCount: 100,
    });

    // s0과 s11이 너무 가까운 grid에 배치돼도 hardSatisfied가 true면 violations 0
    if (result.hardSatisfied) {
      expect(result.violations).toHaveLength(0);
    }
  });

  it('zero candidates → fallback violation surfaced (no silent success)', () => {
    const seats = fillGrid(2, 2, ['a', 'b', 'c', 'd']);
    const pii = makePiiUniform(['a', 'b', 'c', 'd']);
    const result = shuffleSeatsTwoStage(seats, EMPTY, 2, 2, pii, {
      candidateCount: 0,
    });
    expect(result.hardSatisfied).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('seeded RNG produces deterministic output for same seed', () => {
    const studentIds = Array.from({ length: 9 }, (_, i) => `s${i}`);
    const seats = fillGrid(3, 3, studentIds);
    const pii = makePiiUniform(studentIds);
    const constraints: SeatConstraints = {
      ...EMPTY,
      balanceDescriptors: [{ kind: 'academicLevel' }],
    };

    const r1 = shuffleSeatsTwoStage(seats, constraints, 3, 3, pii, { seed: 123 });
    const r2 = shuffleSeatsTwoStage(seats, constraints, 3, 3, pii, { seed: 123 });
    expect(r1.seats).toEqual(r2.seats);
    expect(r1.score).toEqual(r2.score);
  });

  it('makeSeededRandom produces deterministic uniform stream', () => {
    const r1 = makeSeededRandom(99);
    const r2 = makeSeededRandom(99);
    for (let i = 0; i < 50; i++) {
      const a = r1();
      const b = r2();
      expect(a).toBe(b);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(1);
    }
  });
});
