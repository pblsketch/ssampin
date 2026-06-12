import { describe, it, expect } from 'vitest';
import { mergeMeals } from './useMealStore';
import type { MealInfo, ManualMealInfo } from '@domain/entities/Meal';

/** 테스트 헬퍼 — NEIS 급식 */
function neisMeal(mealType: string, dish: string): MealInfo {
  return {
    date: '20260615',
    mealType,
    dishes: [{ name: dish, allergens: [] }],
    calorie: '',
  };
}

/** 테스트 헬퍼 — 수동 급식 */
function manualMeal(mealType: string, dish: string): ManualMealInfo {
  return {
    date: '20260615',
    mealType,
    dishes: [{ name: dish, allergens: [] }],
    source: 'manual',
  };
}

describe('mergeMeals', () => {
  describe('source = neis', () => {
    it('NEIS 급식을 그대로 반환한다 (석식 포함)', () => {
      const neis = [neisMeal('중식', '제육볶음'), neisMeal('석식', '비빔밥')];
      const result = mergeMeals(neis, [], 'neis');
      expect(result).toEqual(neis);
    });

    it('수동 입력이 있어도 무시하고 NEIS만 반환한다', () => {
      const neis = [neisMeal('중식', '제육볶음')];
      const manual = [manualMeal('석식', '내가 적은 석식')];
      const result = mergeMeals(neis, manual, 'neis');
      expect(result).toEqual(neis);
    });
  });

  describe('source = manual', () => {
    it('수동 급식만 반환한다 (NEIS 무시)', () => {
      const neis = [neisMeal('중식', '제육볶음')];
      const manual = [manualMeal('석식', '내가 적은 석식')];
      const result = mergeMeals(neis, manual, 'manual');
      expect(result).toHaveLength(1);
      expect(result[0]!.mealType).toBe('석식');
      expect(result[0]!.dishes[0]!.name).toBe('내가 적은 석식');
    });
  });

  describe('source = merged (끼니별 병합)', () => {
    it('수동 입력이 없으면 NEIS 급식을 그대로 반환한다 (석식 포함)', () => {
      const neis = [neisMeal('중식', '제육볶음'), neisMeal('석식', '비빔밥')];
      const result = mergeMeals(neis, [], 'merged');
      expect(result.map((m) => m.mealType)).toEqual(['중식', '석식']);
    });

    it('수동으로 다른 끼니를 넣어도 NEIS 석식이 사라지지 않는다 (핵심 회귀 가드)', () => {
      // NEIS: 중식 + 석식 / 수동: 간식 → 셋 다 보여야 함
      const neis = [neisMeal('중식', '제육볶음'), neisMeal('석식', '비빔밥')];
      const manual = [manualMeal('간식', '요구르트')];
      const result = mergeMeals(neis, manual, 'merged');
      expect(result.map((m) => m.mealType)).toEqual(['중식', '석식', '간식']);
      // NEIS 석식이 보존되었는지 확인
      const dinner = result.find((m) => m.mealType === '석식');
      expect(dinner?.dishes[0]?.name).toBe('비빔밥');
    });

    it('같은 끼니는 수동이 NEIS를 덮어쓴다', () => {
      const neis = [neisMeal('중식', 'NEIS 중식'), neisMeal('석식', 'NEIS 석식')];
      const manual = [manualMeal('중식', '내가 고친 중식')];
      const result = mergeMeals(neis, manual, 'merged');
      // 중식은 수동, 석식은 NEIS 유지
      const lunch = result.find((m) => m.mealType === '중식');
      const dinner = result.find((m) => m.mealType === '석식');
      expect(lunch?.dishes[0]?.name).toBe('내가 고친 중식');
      expect(dinner?.dishes[0]?.name).toBe('NEIS 석식');
    });

    it('끼니 순서(조식→중식→석식→간식)대로 정렬한다', () => {
      const neis = [neisMeal('석식', '석'), neisMeal('조식', '조'), neisMeal('중식', '중')];
      const result = mergeMeals(neis, [], 'merged');
      expect(result.map((m) => m.mealType)).toEqual(['조식', '중식', '석식']);
    });

    it('NEIS가 비어 있고 수동만 있으면 수동을 반환한다', () => {
      const manual = [manualMeal('석식', '내가 적은 석식')];
      const result = mergeMeals([], manual, 'merged');
      expect(result).toHaveLength(1);
      expect(result[0]!.mealType).toBe('석식');
    });
  });
});
