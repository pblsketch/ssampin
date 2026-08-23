/**
 * 급식을 모델에 보낼 요약으로 바꾼다(순수 함수).
 *
 * 급식은 나이스 공시 데이터라 학생 개인정보가 없다. 다만 **수동 입력 경로**
 * (CSV·직접 입력)가 있어 메뉴 문자열에 무엇이 들어올지 보장할 수 없으므로,
 * 레지스트리에서 `dishes` 를 freeTextFields 로 선언해 그물 ③을 통과시킨다.
 */

/** summarizeMeals 가 필요로 하는 최소 필드 (adapters 의 MealInfo 와 호환) */
export interface MealLike {
  /** YYYYMMDD — 나이스 원형 그대로 */
  readonly date: string;
  readonly mealType: string;
  readonly dishes: readonly { readonly name: string }[];
  readonly calorie: string;
}

export interface SummarizeMealsOptions {
  /** YYYY-MM-DD (포함) */
  readonly from: string;
  /** YYYY-MM-DD (포함) */
  readonly to: string;
}

export interface MealsSummary {
  readonly period: string;
  readonly items: readonly {
    /** YYYY-MM-DD 로 정규화해 내보낸다 — 모델·화면 모두 대시 형식을 쓴다 */
    readonly date: string;
    readonly mealType: string;
    /** 메뉴를 쉼표로 합친 한 줄. 알레르기 숫자는 이미 원천에서 분리돼 있다 */
    readonly dishes: string;
    readonly calorie: string;
  }[];
}

/** YYYYMMDD → YYYY-MM-DD. 이미 대시가 있으면 그대로 둔다. */
function toDashed(date: string): string {
  if (date.includes('-')) return date;
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

export function summarizeMeals(
  meals: readonly MealLike[],
  opts: SummarizeMealsOptions,
): MealsSummary {
  const items = meals
    .map((m) => ({
      date: toDashed(m.date),
      mealType: m.mealType,
      dishes: m.dishes.map((d) => d.name).join(', '),
      calorie: m.calorie,
    }))
    .filter((m) => m.date >= opts.from && m.date <= opts.to)
    .sort((a, b) => a.date.localeCompare(b.date));

  return { period: `${opts.from} ~ ${opts.to}`, items };
}
