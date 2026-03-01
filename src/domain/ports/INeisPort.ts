import type { MealInfo, SchoolSearchResult } from '../entities/Meal';

/**
 * NEIS Open API 포트 인터페이스
 * infrastructure 레이어에서 구현
 */
export interface INeisPort {
  searchSchool(
    apiKey: string,
    schoolName: string,
  ): Promise<readonly SchoolSearchResult[]>;

  getMeals(
    apiKey: string,
    atptCode: string,
    schoolCode: string,
    date: string,
  ): Promise<readonly MealInfo[]>;

  getMealsRange(
    apiKey: string,
    atptCode: string,
    schoolCode: string,
    startDate: string,
    endDate: string,
  ): Promise<readonly MealInfo[]>;
}
