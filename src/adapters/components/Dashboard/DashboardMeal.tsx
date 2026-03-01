import { useEffect } from 'react';
import { useMealStore } from '@adapters/stores/useMealStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';

function isWeekend(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

export function DashboardMeal() {
  const { settings } = useSettingsStore();
  const { todayMeals, todayLoading, todayError, loadTodayMeals } = useMealStore();
  const { atptCode, schoolCode } = settings.neis;

  useEffect(() => {
    if (atptCode && schoolCode) {
      void loadTodayMeals(atptCode, schoolCode);
    }
  }, [atptCode, schoolCode, loadTodayMeals]);

  // 학교 미설정
  if (!schoolCode) {
    return (
      <div className="rounded-xl bg-sp-card p-6 min-h-[260px] flex flex-col">
        <h3 className="text-base font-bold text-white flex items-center gap-2 mb-4">
          <span className="text-lg">🍚</span>
          오늘의 급식
        </h3>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sp-muted text-sm text-center">
            설정에서 학교를 등록해주세요
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-sp-card p-6 min-h-[260px] flex flex-col">
      <h3 className="text-base font-bold text-white flex items-center gap-2 mb-4">
        <span className="text-lg">🍚</span>
        오늘의 급식
      </h3>

      <div className="flex-1 overflow-y-auto space-y-3">
        {todayLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-sp-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {todayError && (
          <p className="text-red-400 text-sm text-center py-4">{todayError}</p>
        )}

        {!todayLoading && !todayError && todayMeals.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <p className="text-sp-muted text-sm text-center">
              {isWeekend() ? '오늘은 급식이 없어요 🎉' : '급식 정보가 없습니다'}
            </p>
          </div>
        )}

        {!todayLoading && todayMeals.map((meal, idx) => (
          <div key={idx} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-sp-accent uppercase tracking-wider">
                {meal.mealType}
              </span>
              {meal.calorie && (
                <span className="text-[11px] text-sp-muted">{meal.calorie}</span>
              )}
            </div>
            <ul className="space-y-1">
              {meal.dishes.map((dish, di) => (
                <li key={di} className="text-sm text-slate-300 flex items-baseline gap-1.5">
                  <span className="text-sp-muted text-[10px] mt-0.5">•</span>
                  <span>{dish.name}</span>
                  {dish.allergens.length > 0 && (
                    <span className="text-[10px] text-slate-500 shrink-0">
                      {dish.allergens.join('.')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
