import { useState, useRef, useCallback } from 'react';
import type { MealInfo } from '@domain/entities/Meal';

const ALLERGEN_NAMES: Record<number, string> = {
  1: '난류', 2: '우유', 3: '메밀', 4: '땅콩', 5: '대두',
  6: '밀', 7: '고등어', 8: '게', 9: '새우', 10: '돼지고기',
  11: '복숭아', 12: '토마토', 13: '아황산류', 14: '호두',
  15: '닭고기', 16: '쇠고기', 17: '오징어', 18: '조개류',
  19: '잣',
};

const MEAL_TYPE_LABEL: Record<string, string> = {
  '조식': '아침',
  '중식': '점심',
  '석식': '저녁',
};

interface Props {
  meals: readonly MealInfo[];
  loading: boolean;
}

export function MealCard({ meals, loading }: Props) {
  // Find which meal types exist
  const availableMeals = meals.filter((m) => m.dishes.length > 0);

  // Default to 중식 if exists, otherwise first available
  const defaultIdx = Math.max(0, availableMeals.findIndex((m) => m.mealType === '중식'));
  const [currentIdx, setCurrentIdx] = useState(defaultIdx);

  const touchStartX = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) > 40) {
      setCurrentIdx((prev) => {
        if (dx < 0) return Math.min(prev + 1, availableMeals.length - 1);
        return Math.max(prev - 1, 0);
      });
    }
  }, [availableMeals.length]);

  const currentMeal = availableMeals[currentIdx];

  return (
    <div className="bg-sp-card rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-orange-400">restaurant</span>
          <span className="text-sp-text font-bold">오늘 급식</span>
        </div>
        {/* Meal type tabs */}
        {availableMeals.length > 1 && (
          <div className="flex items-center gap-1">
            {availableMeals.map((meal, idx) => (
              <button
                key={meal.mealType}
                onClick={() => setCurrentIdx(idx)}
                className={`px-2 py-0.5 rounded-md text-xs font-medium transition-colors ${
                  idx === currentIdx
                    ? 'bg-orange-400/20 text-orange-400'
                    : 'text-sp-muted hover:text-sp-text'
                }`}
              >
                {MEAL_TYPE_LABEL[meal.mealType] ?? meal.mealType}
              </button>
            ))}
          </div>
        )}
      </div>
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
          {/* Dots indicator */}
          {availableMeals.length > 1 && (
            <div className="flex items-center justify-center gap-1.5 mt-3">
              {availableMeals.map((_, idx) => (
                <div
                  key={idx}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    idx === currentIdx ? 'bg-orange-400' : 'bg-sp-border'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sp-muted text-sm">급식 정보가 없습니다.</p>
      )}
    </div>
  );
}
