import { useEffect, useCallback, useState } from 'react';
import { useMealStore } from '@adapters/stores/useMealStore';
import { useWidgetRefresh } from '@widgets/hooks/useWidgetRefresh';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useDashboardConfig } from '@widgets/useDashboardConfig';
import { DateNavigator } from '@adapters/components/common/DateNavigator';

function isWeekendDate(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function toMealDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

export function DashboardMeal() {
  const { settings } = useSettingsStore();
  const {
    todayLoading, todayError, loadTodayMeals,
    manualLoaded, loadManualMeals, mealSource,
    getMergedMealsForDate, getMergedTodayMeals,
    loadMealsForDate,
  } = useMealStore();
  // 급식 조회용 별도 학교가 설정되어 있으면 우선 사용
  const atptCode = settings.mealSchool?.atptCode || settings.neis?.atptCode;
  const schoolCode = settings.mealSchool?.schoolCode || settings.neis?.schoolCode;

  // 날짜 탐색 상태
  const [viewDate, setViewDate] = useState(new Date());
  const viewDateStr = toMealDateString(viewDate);
  const todayStr = toMealDateString(new Date());
  const isViewingToday = viewDateStr === todayStr;

  // 표시할 급식 데이터 — 오늘: todayMeals 스토어, 기타: 캐시 기반 (캐시 없으면 빈 배열)
  const displayMeals = isViewingToday
    ? getMergedTodayMeals()
    : getMergedMealsForDate(viewDateStr);

  // 자신의 colSpan 읽기 (가로 배열 판정용)
  const config = useDashboardConfig((s) => s.config);
  const myColSpan = config?.widgets.find((w) => w.widgetId === 'meal')?.colSpan ?? 1;
  const isWide = myColSpan >= 3;

  // 수동 급식 로드
  useEffect(() => {
    if (!manualLoaded) void loadManualMeals();
  }, [manualLoaded, loadManualMeals]);

  useEffect(() => {
    if (atptCode && schoolCode && mealSource !== 'manual') {
      void loadTodayMeals(atptCode, schoolCode);
    }
  }, [atptCode, schoolCode, loadTodayMeals, mealSource]);

  // 다른 날짜로 이동 시 캐시에 없으면 자동 fetch
  useEffect(() => {
    if (!isViewingToday && atptCode && schoolCode && mealSource !== 'manual') {
      void loadMealsForDate(atptCode, schoolCode, viewDateStr);
    }
  }, [viewDateStr, isViewingToday, atptCode, schoolCode, mealSource, loadMealsForDate]);

  const reloadMeal = useCallback(() => {
    if (atptCode && schoolCode && mealSource !== 'manual') void loadTodayMeals(atptCode, schoolCode);
  }, [atptCode, schoolCode, loadTodayMeals, mealSource]);

  useWidgetRefresh(reloadMeal, { intervalMs: 30 * 60 * 1000 });

  // 공통 헤더 렌더링 헬퍼
  const renderHeader = () => (
    <div className="mb-2 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-sp-text flex items-center gap-1.5">
          <span>🍱</span>
          급식
        </h3>
      </div>
      <DateNavigator date={viewDate} onDateChange={setViewDate} />
    </div>
  );

  // 학교 미설정 (수동 모드에서는 허용)
  if (!schoolCode && mealSource !== 'manual') {
    return (
      <div className="rounded-xl bg-sp-card p-4 h-full flex flex-col transition-shadow duration-sp-base ease-sp-out hover:shadow-sp-md">
        {renderHeader()}
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sp-muted text-sm text-center">
            설정에서 학교를 등록해주세요
          </p>
        </div>
      </div>
    );
  }

  // 오늘 외 날짜: 로딩/에러는 오늘 데이터 기준, 캐시만 표시
  const showLoading = isViewingToday && todayLoading;
  const showError = isViewingToday && todayError;
  const isEmpty = !showLoading && !showError && displayMeals.length === 0;

  return (
    <div className="rounded-xl bg-sp-card p-4 flex flex-col transition-shadow duration-sp-base ease-sp-out hover:shadow-sp-md">
      {renderHeader()}

      <div className="flex-1 overflow-y-auto">
        {showLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-sp-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {showError && (
          <p className="text-red-400 text-sm text-center py-4">{todayError}</p>
        )}

        {isEmpty && (
          <div className="flex items-center justify-center py-8">
            <p className="text-sp-muted text-sm text-center">
              {isWeekendDate(viewDate) ? '급식이 없는 날이에요 🎉' : '급식 정보가 없습니다'}
            </p>
          </div>
        )}

        {/* 넓은 카드(3~4칸): 가로 배열 / 좁은 카드(1~2칸): 세로 배열 */}
        {!showLoading && displayMeals.length > 0 && (
          <div className={isWide
            ? `grid gap-4 ${displayMeals.length >= 3 ? 'grid-cols-3' : displayMeals.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`
            : 'space-y-3'
          }>
            {displayMeals.map((meal, idx) => (
              <div key={idx} className={isWide ? 'border-r border-sp-border last:border-r-0 pr-4 last:pr-0 space-y-2' : 'border-b border-sp-border last:border-b-0 pb-3 last:pb-0 space-y-2'}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-sp-accent uppercase tracking-wider">
                    {meal.mealType}
                  </span>
                  {meal.calorie && (
                    <span className="text-detail text-sp-muted">{meal.calorie}</span>
                  )}
                </div>
                <ul className="space-y-1">
                  {meal.dishes.map((dish, di) => (
                    <li key={di} className="text-sm text-sp-text flex items-baseline gap-1.5">
                      <span className="text-sp-muted text-caption mt-0.5">•</span>
                      <span>{dish.name}</span>
                      {dish.allergens.length > 0 && (
                        <span className="text-caption text-sp-muted shrink-0">
                          {dish.allergens.join('.')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
