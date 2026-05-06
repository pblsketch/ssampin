import { describe, expect, it } from 'vitest';
import { computeGridResizePlan } from '../computeGridResizePlan';

describe('computeGridResizePlan', () => {
  describe('확장 (잘림 없음)', () => {
    it('1×3(3칸) → 2×2(4칸): 기존 3개 제목 보존, 1칸 placeholder 추가', () => {
      const plan = computeGridResizePlan({
        from: { cols: 1, rows: 3, titles: ['A', 'B', 'C'] },
        to: { cols: 2, rows: 2 },
      });
      expect(plan.nextTitles).toHaveLength(4);
      expect(plan.nextTitles[0]).toBe('A');
      expect(plan.nextTitles[1]).toBe('B');
      expect(plan.nextTitles[2]).toBe('C');
      expect(plan.nextTitles[3]).toBe('카테고리 4');
      expect(plan.truncated).toHaveLength(0);
    });

    it('1×1 → 2×3: placeholder 5개 생성', () => {
      const plan = computeGridResizePlan({
        from: { cols: 1, rows: 1, titles: ['hello'] },
        to: { cols: 2, rows: 3 },
      });
      expect(plan.nextTitles).toHaveLength(6);
      expect(plan.nextTitles[0]).toBe('hello');
      expect(plan.nextTitles[1]).toBe('카테고리 2');
      expect(plan.nextTitles[5]).toBe('카테고리 6');
      expect(plan.truncated).toHaveLength(0);
    });

    it('동일 크기 (3×1 → 1×3, 둘 다 3칸)는 잘림 없이 제목 모두 보존', () => {
      const plan = computeGridResizePlan({
        from: { cols: 3, rows: 1, titles: ['수업', '학급', '업무'] },
        to: { cols: 1, rows: 3 },
      });
      expect(plan.nextTitles).toEqual(['수업', '학급', '업무']);
      expect(plan.truncated).toHaveLength(0);
    });
  });

  describe('축소 (잘림 발생)', () => {
    it('3×2(6칸) → 2×1(2칸): 박스 3,4,5,6 잘림', () => {
      const plan = computeGridResizePlan({
        from: { cols: 3, rows: 2, titles: ['A', 'B', 'C', 'D', 'E', 'F'] },
        to: { cols: 2, rows: 1 },
      });
      expect(plan.nextTitles).toEqual(['A', 'B']);
      expect(plan.truncated).toEqual([
        { index: 2, title: 'C' },
        { index: 3, title: 'D' },
        { index: 4, title: 'E' },
        { index: 5, title: 'F' },
      ]);
    });

    it('2×2(4칸) → 1×3(3칸): 박스 4 잘림', () => {
      const plan = computeGridResizePlan({
        from: { cols: 2, rows: 2, titles: ['1', '2', '3', '4'] },
        to: { cols: 1, rows: 3 },
      });
      expect(plan.nextTitles).toEqual(['1', '2', '3']);
      expect(plan.truncated).toEqual([{ index: 3, title: '4' }]);
    });

    it('빈 제목은 truncated에 포함하지 않음', () => {
      const plan = computeGridResizePlan({
        from: { cols: 2, rows: 2, titles: ['A', '', '   ', 'D'] },
        to: { cols: 1, rows: 1 },
      });
      expect(plan.nextTitles).toEqual(['A']);
      // index 1=''와 index 2='   '는 빈 제목이라 제외, index 3='D'만 잘림 안내
      expect(plan.truncated).toEqual([{ index: 3, title: 'D' }]);
    });

    it('축소 후 신규 칸 합 0개 (1×1)도 처리한다', () => {
      const plan = computeGridResizePlan({
        from: { cols: 6, rows: 2, titles: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] },
        to: { cols: 1, rows: 1 },
      });
      expect(plan.nextTitles).toEqual(['1']);
      expect(plan.truncated).toHaveLength(11); // 2~12까지 11개
    });
  });

  describe('동일 크기 (크기 변동 X)', () => {
    it('2×2 → 2×2 (모두 동일): nextTitles 그대로, 잘림 없음', () => {
      const plan = computeGridResizePlan({
        from: { cols: 2, rows: 2, titles: ['a', 'b', 'c', 'd'] },
        to: { cols: 2, rows: 2 },
      });
      expect(plan.nextTitles).toEqual(['a', 'b', 'c', 'd']);
      expect(plan.truncated).toHaveLength(0);
    });
  });

  describe('엣지 케이스', () => {
    it('from.titles가 비어있어도 안전하게 처리', () => {
      const plan = computeGridResizePlan({
        from: { cols: 1, rows: 1, titles: [] },
        to: { cols: 1, rows: 2 },
      });
      // titles가 비어있고 oldSize=1이므로 인덱스 0은 빈 문자열, 1은 placeholder
      expect(plan.nextTitles).toHaveLength(2);
      expect(plan.nextTitles[0]).toBe('');
      expect(plan.nextTitles[1]).toBe('카테고리 2');
      expect(plan.truncated).toHaveLength(0);
    });

    it('1×1 → 1×1 (제목 1개): 그대로 유지', () => {
      const plan = computeGridResizePlan({
        from: { cols: 1, rows: 1, titles: ['only'] },
        to: { cols: 1, rows: 1 },
      });
      expect(plan.nextTitles).toEqual(['only']);
      expect(plan.truncated).toHaveLength(0);
    });

    it('확장 시 placeholder 인덱스는 newSize 기준 (1-based 사용자 표시)', () => {
      const plan = computeGridResizePlan({
        from: { cols: 1, rows: 1, titles: ['X'] },
        to: { cols: 3, rows: 1 },
      });
      expect(plan.nextTitles[0]).toBe('X');
      expect(plan.nextTitles[1]).toBe('카테고리 2');
      expect(plan.nextTitles[2]).toBe('카테고리 3');
    });
  });
});
