/**
 * 급식 메뉴 관련 엔티티
 */

/** 나이스 오픈 API 공용 키 */
export const NEIS_API_KEY = 'e36a3e86a5ef45c2b93cc2c40e3af688';

export interface MealDish {
  readonly name: string;
  readonly allergens: readonly number[];
}

export interface MealInfo {
  readonly date: string;       // YYYYMMDD
  readonly mealType: string;   // 중식, 석식 등 (MMEAL_SC_NM)
  readonly dishes: readonly MealDish[];
  readonly calorie: string;    // e.g. "693.2 Kcal"
}

export interface SchoolSearchResult {
  readonly schoolName: string;   // SCHUL_NM
  readonly schoolCode: string;   // SD_SCHUL_CODE
  readonly atptCode: string;     // ATPT_OFCDC_SC_CODE
  readonly address: string;      // ORG_RDNMA (도로명주소)
  readonly schoolType: string;   // SCHUL_KND_SC_NM (고등학교, 중학교 등)
}

/** 날짜별 급식 캐시 */
export interface MealCache {
  readonly [date: string]: readonly MealInfo[];
}
