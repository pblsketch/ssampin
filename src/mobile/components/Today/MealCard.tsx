import { useState, useRef, useEffect, useCallback } from 'react';
import type { MealInfo } from '@domain/entities/Meal';
import { CollapsibleCard } from '@mobile/components/common/CollapsibleCard';

const ALLERGEN_NAMES: Record<number, string> = {
  1: '난류',
  2: '우유',
  3: '메밀',
  4: '땅콩',
  5: '대두',
  6: '밀',
  7: '고등어',
  8: '게',
  9: '새우',
  10: '돼지고기',
  11: '복숭아',
  12: '토마토',
  13: '아황산류',
  14: '호두',
  15: '닭고기',
  16: '쇠고기',
  17: '오징어',
  18: '조개류',
  19: '잣',
};

const MEAL_TYPE_LABEL: Record<string, string> = {
  조식: '아침',
  중식: '점심',
  석식: '저녁',
};

interface Props {
  meals: readonly MealInfo[];
  loading: boolean;
}

export function MealCard({ meals, loading }: Props) {
  const availableMeals = meals.filter((m) => m.dishes.length > 0);
  const [currentIdx, setCurrentIdx] = useState(0);
  const initializedRef = useRef(false);

  // meals 는 첫 렌더 시 비어있다가 비동기로 로드됨 → 첫 비어있지 않은 시점에 중식으로 초기화,
  // 이후 meals 가 줄어 인덱스가 범위를 벗어나면 보정 (사용자가 고른 끼니는 그 외엔 유지)
  useEffect(() => {
    setCurrentIdx((i) => {
      if (!initializedRef.current && availableMeals.length > 0) {
        initializedRef.current = true;
        const lunch = availableMeals.findIndex((m) => m.mealType === '중식');
        return lunch >= 0 ? lunch : 0;
      }
      return Math.min(i, Math.max(0, availableMeals.length - 1));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meals]);

  const touchStartX = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null) return;
      const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
      touchStartX.current = null;
      if (Math.abs(dx) > 40) {
        setCurrentIdx((prev) => {
          if (dx < 0) return Math.min(prev + 1, availableMeals.length - 1);
          return Math.max(prev - 1, 0);
        });
      }
    },
    [availableMeals.length],
  );

  const currentMeal = availableMeals[currentIdx];

  const summary = loading
    ? '불러오는 중'
    : currentMeal
      ? `${MEAL_TYPE_LABEL[currentMeal.mealType] ?? currentMeal.mealType} · ${currentMeal.dishes.length}찬`
      : '급식 정보 없음';

  const headerExtra =
    availableMeals.length > 1 ? (
      <div className="flex items-center gap-1">
        {availableMeals.map((meal, idx) => (
          <button
            key={meal.mealType}
            onClick={() => setCurrentIdx(idx)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              idx === currentIdx
                ? 'bg-sp-highlight/15 text-sp-highlight'
                : 'text-sp-muted hover:text-sp-text'
            }`}
          >
            {MEAL_TYPE_LABEL[meal.mealType] ?? meal.mealType}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <CollapsibleCard
      cardId="meal"
      title="오늘 급식"
      icon="restaurant"
      iconClass="text-orange-500"
      summary={summary}
      headerExtra={headerExtra}
    >
      {loading ? (
        <p className="text-sp-muted text-sm">로딩 중...</p>
      ) : currentMeal ? (
        <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          <ul className="space-y-1">
            {currentMeal.dishes.map((dish, i) => (
              <li key={i} className="text-sp-text text-sm">
                {dish.name}
                {dish.allergens.length > 0 && (
                  <span className="text-sp-muted text-xs ml-1">
                    ({dish.allergens.map((a) => ALLERGEN_NAMES[a] ?? a).join(', ')})
                  </span>
                )}
              </li>
            ))}
          </ul>
          {currentMeal.calorie && (
            <p className="text-sp-muted text-xs mt-2">{currentMeal.calorie}</p>
          )}
          {availableMeals.length > 1 && (
            <div className="flex items-center justify-center gap-1.5 mt-3">
              {availableMeals.map((_, idx) => (
                <div
                  key={idx}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    idx === currentIdx ? 'bg-sp-highlight' : 'bg-sp-divider'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sp-muted text-sm">급식 정보가 없습니다.</p>
      )}
    </CollapsibleCard>
  );
}
