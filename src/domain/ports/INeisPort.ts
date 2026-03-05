import type { MealInfo, SchoolSearchResult } from '../entities/Meal';
import type { NeisClassInfo, NeisTimetableRow, SchoolLevel } from '../entities/NeisTimetable';

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

  /** 학급 목록 조회 */
  getClassList(params: {
    apiKey: string;
    officeCode: string;
    schoolCode: string;
    academicYear: string;
    grade: string;
  }): Promise<readonly NeisClassInfo[]>;

  /** 시간표 조회 */
  getTimetable(params: {
    apiKey: string;
    officeCode: string;
    schoolCode: string;
    schoolLevel: SchoolLevel;
    academicYear: string;
    semester: string;
    grade: string;
    className: string;
    fromDate: string;
    toDate: string;
  }): Promise<readonly NeisTimetableRow[]>;
}
