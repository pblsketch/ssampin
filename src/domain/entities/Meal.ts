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

/** 수동 입력 급식 */
export interface ManualMealInfo {
  readonly date: string;       // YYYYMMDD
  readonly mealType: string;   // "중식", "간식" 등
  readonly dishes: readonly MealDish[];
  readonly calorie?: string;
  readonly source: 'manual';
}

/** 급식 데이터 소스 */
export type MealSource = 'neis' | 'manual' | 'merged';

/** 수동 급식 저장 데이터 (날짜 → 배열) */
export interface ManualMealData {
  readonly [date: string]: readonly ManualMealInfo[];
}

/** 날짜별 급식 캐시 */
export interface MealCache {
  readonly [date: string]: readonly MealInfo[];
}
