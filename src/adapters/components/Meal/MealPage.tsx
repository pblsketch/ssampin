import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useMealStore } from '@adapters/stores/useMealStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import type { MealInfo, MealSource, ManualMealInfo } from '@domain/entities/Meal';
import { MealEditModal } from './MealEditModal';

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

function MealCell({ meals, hasManual }: { meals: readonly MealInfo[]; hasManual: boolean }) {
  if (meals.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[120px]">
        <p className="text-sp-muted text-xs">급식 없음</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-1">
      {hasManual && (
        <div className="flex items-center gap-1 mb-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span className="text-[10px] text-amber-400/80">수동 입력</span>
        </div>
      )}
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
  const {
    weekMeals, weekLoading, loadWeekMeals,
    manualMeals, manualLoaded, loadManualMeals,
    mealSource, setMealSource,
    saveManualMeal, getMergedMealsForDate, importFromCSV,
  } = useMealStore();
  // 급식 조회용 별도 학교가 설정되어 있으면 우선 사용
  const atptCode = settings.mealSchool?.atptCode || settings.neis.atptCode;
  const schoolCode = settings.mealSchool?.schoolCode || settings.neis.schoolCode;
  const schoolName = settings.neis.schoolName;

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const weekDates = useMemo(() => getWeekDates(currentDate), [currentDate]);

  // 수동 입력 모달
  const [editingDate, setEditingDate] = useState<string | null>(null);

  // 파일 import 상태
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);

  // 수동 급식 로드
  useEffect(() => {
    if (!manualLoaded) void loadManualMeals();
  }, [manualLoaded, loadManualMeals]);

  const loadWeek = useCallback(() => {
    if (atptCode && schoolCode && weekDates.length === 5) {
      void loadWeekMeals(atptCode, schoolCode, weekDates[0]!, weekDates[4]!);
    }
  }, [atptCode, schoolCode, weekDates, loadWeekMeals]);

  useEffect(() => {
    // mealSource가 manual-only이면 NEIS 호출 불필요
    if (mealSource !== 'manual') {
      loadWeek();
    }
  }, [loadWeek, mealSource]);

  const goWeek = (offset: number) => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + offset * 7);
      return d;
    });
  };

  const goThisWeek = () => setCurrentDate(new Date());

  // 날짜별 NEIS 급식 그룹핑 (캐시에 넣기 위해)
  const neisByDate: Record<string, readonly MealInfo[]> = {};
  for (const meal of weekMeals) {
    const existing = neisByDate[meal.date] ?? [];
    neisByDate[meal.date] = [...existing, meal];
  }

  // 오늘 날짜 문자열
  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  })();

  // 파일 가져오기 핸들러
  const handleFileImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const result = await importFromCSV(content);
      setImportResult(result);
      // 3초 후 메시지 자동 제거
      setTimeout(() => setImportResult(null), 5000);
    } catch {
      setImportResult({ imported: 0, errors: ['파일을 읽을 수 없습니다'] });
    }

    // 입력 초기화 (같은 파일 재선택 허용)
    e.target.value = '';
  };

  const handleEditSave = (meals: ManualMealInfo[]) => {
    if (editingDate) {
      void saveManualMeal(editingDate, meals);
      setEditingDate(null);
    }
  };

  // 학교 미설정이고 수동 모드도 아닌 경우
  if (!schoolCode && mealSource !== 'manual') {
    return (
      <div className="-m-8 flex h-[calc(100%+4rem)] items-center justify-center flex-col gap-4">
        <span className="text-5xl">🍚</span>
        <p className="text-sp-muted text-base">설정에서 학교를 등록하거나, 수동 입력 모드를 사용하세요</p>
        <button
          type="button"
          onClick={() => setMealSource('manual')}
          className="text-sm px-4 py-2 rounded-lg bg-sp-accent text-white hover:bg-sp-accent/80 transition-colors"
        >
          수동 입력 모드로 전환
        </button>
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

        {/* 소스 전환 + 파일 가져오기 */}
        <div className="flex items-center gap-3">
          <select
            value={mealSource}
            onChange={(e) => setMealSource(e.target.value as MealSource)}
            className="bg-sp-surface border border-sp-border rounded-lg px-3 py-1.5 text-xs text-sp-text focus:outline-none focus:border-sp-accent cursor-pointer"
          >
            <option value="merged">자동 (NEIS + 수동)</option>
            <option value="neis">NEIS만</option>
            <option value="manual">수동 입력만</option>
          </select>

          <a
            href="/meal-template.csv"
            download="급식_양식.csv"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-sp-muted hover:text-sp-text border border-sp-border rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-sm">download</span>
            양식 다운로드
          </a>

          <button
            type="button"
            onClick={handleFileImport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-sp-muted hover:text-sp-text border border-sp-border rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-sm">upload_file</span>
            CSV 가져오기
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileSelected}
          />
        </div>
      </header>

      {/* Import 결과 메시지 */}
      {importResult && (
        <div className={`mx-8 mt-4 px-4 py-3 rounded-xl text-sm ${
          importResult.errors.length > 0
            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-300'
            : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
        }`}>
          <p>{importResult.imported}개 급식 메뉴를 가져왔습니다.</p>
          {importResult.errors.length > 0 && (
            <ul className="mt-1 text-xs opacity-80">
              {importResult.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
        </div>
      )}

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
        {weekLoading && mealSource !== 'manual' ? (
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
              const mergedMeals = getMergedMealsForDate(date);
              const hasManual = (manualMeals[date]?.length ?? 0) > 0;
              const isToday = date === today;
              return (
                <div
                  key={`meal-${date}`}
                  className={`rounded-b-xl p-3 min-h-[200px] flex flex-col ${
                    isToday
                      ? 'bg-sp-card ring-1 ring-sp-accent/30'
                      : 'bg-sp-card ring-1 ring-sp-border/50'
                  }`}
                >
                  <div className="flex-1">
                    <MealCell meals={mergedMeals} hasManual={hasManual && mealSource !== 'neis'} />
                  </div>
                  {/* 수동 입력 버튼 */}
                  <button
                    type="button"
                    onClick={() => setEditingDate(date)}
                    className="mt-2 w-full py-1 text-[10px] text-sp-muted hover:text-sp-accent border border-dashed border-sp-border/50 rounded-lg transition-colors"
                  >
                    <span className="material-symbols-outlined text-xs align-middle mr-0.5">edit</span>
                    수동 입력
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 수동 입력 모달 */}
      {editingDate && (
        <MealEditModal
          date={editingDate}
          existingMeals={(manualMeals[editingDate] ?? []) as ManualMealInfo[]}
          onSave={handleEditSave}
          onClose={() => setEditingDate(null)}
        />
      )}
    </div>
  );
}
