import { describe, expect, it } from 'vitest';
import { validateGridDimensions } from '../validateGridDimensions';

describe('validateGridDimensions', () => {
  describe('정상 케이스', () => {
    it('1×3은 통과한다', () => {
      const result = validateGridDimensions(1, 3);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.cols).toBe(1);
        expect(result.rows).toBe(3);
      }
    });

    it('3×1은 통과한다', () => {
      const result = validateGridDimensions(3, 1);
      expect(result.ok).toBe(true);
    });

    it('2×2는 통과한다', () => {
      const result = validateGridDimensions(2, 2);
      expect(result.ok).toBe(true);
    });

    it('2×6 = 12칸 (상한 경계)은 통과한다', () => {
      const result = validateGridDimensions(2, 6);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.cols).toBe(2);
        expect(result.rows).toBe(6);
      }
    });

    it('1×1 (최소)은 통과한다', () => {
      const result = validateGridDimensions(1, 1);
      expect(result.ok).toBe(true);
    });

    it('6×2 = 12칸 (상한 경계)은 통과한다', () => {
      const result = validateGridDimensions(6, 2);
      expect(result.ok).toBe(true);
    });

    it('3×4 = 12칸은 통과한다', () => {
      const result = validateGridDimensions(3, 4);
      expect(result.ok).toBe(true);
    });
  });

  describe('범위 거부', () => {
    it('cols=0은 거부한다', () => {
      const result = validateGridDimensions(0, 1);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain('최소');
    });

    it('rows=0은 거부한다', () => {
      const result = validateGridDimensions(1, 0);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain('최소');
    });

    it('cols=-1은 거부한다', () => {
      const result = validateGridDimensions(-1, 3);
      expect(result.ok).toBe(false);
    });

    it('cols=7은 거부한다', () => {
      const result = validateGridDimensions(7, 1);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain('최대');
    });

    it('rows=10은 거부한다', () => {
      const result = validateGridDimensions(2, 10);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain('최대');
    });
  });

  describe('합산 거부', () => {
    it('3×5 = 15칸은 거부한다 (셀 합 12 초과)', () => {
      const result = validateGridDimensions(3, 5);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain('12');
    });

    it('4×4 = 16칸은 거부한다', () => {
      const result = validateGridDimensions(4, 4);
      expect(result.ok).toBe(false);
    });

    it('6×6 = 36칸은 거부한다', () => {
      const result = validateGridDimensions(6, 6);
      expect(result.ok).toBe(false);
    });
  });

  describe('타입 거부', () => {
    it('소수점은 거부한다 (cols=2.5)', () => {
      const result = validateGridDimensions(2.5, 1);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain('정수');
    });

    it('NaN은 거부한다', () => {
      const result = validateGridDimensions(Number.NaN, 1);
      expect(result.ok).toBe(false);
    });

    it('Infinity는 거부한다', () => {
      const result = validateGridDimensions(Infinity, 1);
      expect(result.ok).toBe(false);
    });
  });
});
