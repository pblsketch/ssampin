import { useEffect, useState, useCallback, useMemo } from 'react';
import { useMealStore } from '@adapters/stores/useMealStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import type { MealInfo } from '@domain/entities/Meal';

const DAY_LABELS = ['월', '화', '수', '목', '금'] as const;

/** 주어진 날짜가 속한 주의 월~금 날짜 배열 반환 (YYYYMMDD) */
function getWeekDates(baseDate: Date): string[] {
  const day = baseDate.getDay(); // 0=일, 1=월 ... 6=토
  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() - ((day === 0 ? 7 : day) - 1));

  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}${m}${dd}`;
  });
}

function formatDateDisplay(yyyymmdd: string): string {
  const m = parseInt(yyyymmdd.slice(4, 6), 10);
  const d = parseInt(yyyymmdd.slice(6, 8), 10);
  return `${m}/${d}`;
}

function formatWeekLabel(dates: string[]): string {
  if (dates.length < 5) return '';
  const first = dates[0]!;
  const last = dates[4]!;
  const fy = first.slice(0, 4);
  const fm = parseInt(first.slice(4, 6), 10);
  const fd = parseInt(first.slice(6, 8), 10);
  const lm = parseInt(last.slice(4, 6), 10);
  const ld = parseInt(last.slice(6, 8), 10);
  return `${fy}년 ${fm}월 ${fd}일 ~ ${lm}월 ${ld}일`;
}

function MealCell({ meals }: { meals: readonly MealInfo[] }) {
  if (meals.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[120px]">
        <p className="text-sp-muted text-xs">급식 없음</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-1">
      {meals.map((meal, idx) => (
        <div key={idx}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-sp-accent">{meal.mealType}</span>
            {meal.calorie && (
              <span className="text-[10px] text-sp-muted">{meal.calorie}</span>
            )}
          </div>
          <ul className="space-y-0.5">
            {meal.dishes.map((dish, di) => (
              <li key={di} className="text-xs text-slate-300 leading-relaxed">
                {dish.name}
                {dish.allergens.length > 0 && (
                  <span className="text-[10px] text-slate-500 ml-1">
                    ({dish.allergens.join('.')})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function MealPage() {
  const { settings } = useSettingsStore();
  const { weekMeals, weekLoading, loadWeekMeals } = useMealStore();
  // 급식 조회용 별도 학교가 설정되어 있으면 우선 사용
  const atptCode = settings.mealSchool?.atptCode || settings.neis.atptCode;
  const schoolCode = settings.mealSchool?.schoolCode || settings.neis.schoolCode;
  const schoolName = settings.neis.schoolName;

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const weekDates = useMemo(() => getWeekDates(currentDate), [currentDate]);

  const loadWeek = useCallback(() => {
    if (atptCode && schoolCode && weekDates.length === 5) {
      void loadWeekMeals(atptCode, schoolCode, weekDates[0]!, weekDates[4]!);
    }
  }, [atptCode, schoolCode, weekDates, loadWeekMeals]);

  useEffect(() => {
    loadWeek();
  }, [loadWeek]);

  const goWeek = (offset: number) => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + offset * 7);
      return d;
    });
  };

  const goThisWeek = () => setCurrentDate(new Date());

  // 날짜별 급식 그룹핑
  const mealsByDate: Record<string, readonly MealInfo[]> = {};
  for (const meal of weekMeals) {
    const existing = mealsByDate[meal.date] ?? [];
    mealsByDate[meal.date] = [...existing, meal];
  }

  // 오늘 날짜 문자열
  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  })();

  if (!schoolCode) {
    return (
      <div className="-m-8 flex h-[calc(100%+4rem)] items-center justify-center flex-col gap-4">
        <span className="text-5xl">🍚</span>
        <p className="text-sp-muted text-base">설정에서 학교를 등록해주세요</p>
      </div>
    );
  }

  return (
    <div className="-m-8 flex flex-col h-[calc(100%+4rem)]">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-6 sticky top-0 bg-sp-bg/95 backdrop-blur-sm z-10 border-b border-sp-border/30">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight flex items-center gap-2">
            <span className="text-2xl">🍚</span>
            급식
          </h2>
          {schoolName && (
            <p className="text-sp-muted text-sm mt-1">{schoolName}</p>
          )}
        </div>
      </header>

      {/* 주간 네비게이션 */}
      <div className="px-8 pt-6 pb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => goWeek(-1)}
          className="p-2 rounded-lg text-sp-muted hover:text-white hover:bg-white/5 transition-colors"
        >
          <span className="material-symbols-outlined">chevron_left</span>
        </button>

        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-white">{formatWeekLabel(weekDates)}</h3>
          <button
            type="button"
            onClick={goThisWeek}
            className="text-xs px-3 py-1 rounded-lg border border-sp-border text-sp-muted hover:text-white hover:bg-white/5 transition-colors"
          >
            이번 주
          </button>
        </div>

        <button
          type="button"
          onClick={() => goWeek(1)}
          className="p-2 rounded-lg text-sp-muted hover:text-white hover:bg-white/5 transition-colors"
        >
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
      </div>

      {/* 주간 급식표 */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {weekLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-sp-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-3">
            {/* 헤더 */}
            {weekDates.map((date, i) => {
              const isToday = date === today;
              return (
                <div
                  key={date}
                  className={`text-center py-3 rounded-t-xl font-bold text-sm ${
                    isToday
                      ? 'bg-sp-accent/20 text-sp-accent'
                      : 'bg-sp-surface text-sp-muted'
                  }`}
                >
                  <div>{DAY_LABELS[i]}</div>
                  <div className="text-xs mt-0.5">{formatDateDisplay(date)}</div>
                </div>
              );
            })}

            {/* 급식 내용 */}
            {weekDates.map((date) => {
              const meals = mealsByDate[date] ?? [];
              const isToday = date === today;
              return (
                <div
                  key={`meal-${date}`}
                  className={`rounded-b-xl p-3 min-h-[200px] ${
                    isToday
                      ? 'bg-sp-card ring-1 ring-sp-accent/30'
                      : 'bg-sp-card ring-1 ring-sp-border/50'
                  }`}
                >
                  <MealCell meals={meals} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
