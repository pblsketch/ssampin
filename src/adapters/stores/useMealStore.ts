import { create } from 'zustand';
import type { MealInfo, SchoolSearchResult, ManualMealInfo, ManualMealData, MealSource, MealDish } from '@domain/entities/Meal';
import { NEIS_API_KEY } from '@domain/entities/Meal';
import { neisPort, manualMealRepository } from '@adapters/di/container';
import { GetMeals } from '@usecases/meal/GetMeals';
import { SearchSchool } from '@usecases/school/SearchSchool';

const getMeals = new GetMeals(neisPort);
const searchSchoolUseCase = new SearchSchool(neisPort);

/** NEIS + 수동 급식 병합 (수동이 우선) */
function mergeMeals(
  neisMeals: readonly MealInfo[],
  manualMeals: readonly ManualMealInfo[],
  source: MealSource,
): readonly MealInfo[] {
  if (source === 'manual') {
    return manualMeals.map((m) => ({
      date: m.date,
      mealType: m.mealType,
      dishes: m.dishes,
      calorie: m.calorie ?? '',
    }));
  }
  if (source === 'neis') return neisMeals;
  // merged: 수동이 있으면 수동, 없으면 NEIS
  if (manualMeals.length > 0) {
    return manualMeals.map((m) => ({
      date: m.date,
      mealType: m.mealType,
      dishes: m.dishes,
      calorie: m.calorie ?? '',
    }));
  }
  return neisMeals;
}

/** CSV 파싱 */
function parseMealCSV(content: string): { meals: ManualMealInfo[]; errors: string[] } {
  const lines = content.split('\n').filter((l) => l.trim());
  const meals: ManualMealInfo[] = [];
  const errors: string[] = [];

  // 첫 줄 헤더 스킵
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    // CSV with possible quoted fields
    const parts = line.split(',');
    if (parts.length < 3) { errors.push(`${i + 1}행: 형식 오류`); continue; }

    const date = parts[0]!.trim().replace(/[^0-9]/g, '');
    const mealType = parts[1]!.trim();
    const menuStr = parts.slice(2).join(',').replace(/"/g, '').trim();

    if (!/^\d{8}$/.test(date)) { errors.push(`${i + 1}행: 날짜 형식 오류 (YYYYMMDD)`); continue; }

    const dishes: MealDish[] = menuStr
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({ name, allergens: [] as readonly number[] }));

    meals.push({ date, mealType, dishes, source: 'manual' });
  }

  return { meals, errors };
}

interface MealState {
  // 오늘의 급식
  todayMeals: readonly MealInfo[];
  todayLoading: boolean;
  todayError: string | null;

  // 주간 급식
  weekMeals: readonly MealInfo[];
  weekLoading: boolean;

  // 학교 검색
  searchResults: readonly SchoolSearchResult[];
  searching: boolean;
  searchError: string | null;

  // 캐시 (날짜 → 급식 목록)
  cache: Record<string, readonly MealInfo[]>;

  // 수동 급식
  manualMeals: ManualMealData;
  manualLoaded: boolean;
  mealSource: MealSource;

  // Actions
  loadTodayMeals: (atptCode: string, schoolCode: string) => Promise<void>;
  loadMealsForDate: (atptCode: string, schoolCode: string, date: string) => Promise<void>;
  loadWeekMeals: (atptCode: string, schoolCode: string, startDate: string, endDate: string) => Promise<void>;
  searchSchools: (query: string) => Promise<void>;
  clearSearch: () => void;

  // 수동 급식 Actions
  loadManualMeals: () => Promise<void>;
  saveManualMeal: (date: string, meals: ManualMealInfo[]) => Promise<void>;
  deleteManualMeal: (date: string) => Promise<void>;
  setMealSource: (source: MealSource) => void;
  importFromCSV: (content: string) => Promise<{ imported: number; errors: string[] }>;

  // 병합된 급식 조회 (특정 날짜)
  getMergedMealsForDate: (date: string) => readonly MealInfo[];
  getMergedTodayMeals: () => readonly MealInfo[];
}

function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export const useMealStore = create<MealState>((set, get) => ({
  todayMeals: [],
  todayLoading: false,
  todayError: null,
  weekMeals: [],
  weekLoading: false,
  searchResults: [],
  searching: false,
  searchError: null,
  cache: {},
  manualMeals: {},
  manualLoaded: false,
  mealSource: 'merged',

  loadTodayMeals: async (atptCode, schoolCode) => {
    if (!atptCode || !schoolCode) {
      set({ todayMeals: [], todayError: null, todayLoading: false });
      return;
    }

    const date = todayString();
    const cached = get().cache[date];
    if (cached) {
      set({ todayMeals: cached, todayError: null, todayLoading: false });
      return;
    }

    set({ todayLoading: true, todayError: null });
    try {
      const meals = await getMeals.execute(NEIS_API_KEY, atptCode, schoolCode, date);
      set((s) => ({
        todayMeals: meals,
        todayLoading: false,
        todayError: null,
        cache: { ...s.cache, [date]: meals },
      }));
    } catch {
      set({ todayLoading: false, todayError: '급식 정보를 불러올 수 없습니다' });
    }
  },

  loadMealsForDate: async (atptCode, schoolCode, date) => {
    if (!atptCode || !schoolCode) return;
    const cached = get().cache[date];
    if (cached) return; // already in cache
    try {
      const meals = await getMeals.execute(NEIS_API_KEY, atptCode, schoolCode, date);
      set((s) => ({
        cache: { ...s.cache, [date]: meals },
      }));
    } catch {
      // silently fail — will show "no meals" for that date
    }
  },

  loadWeekMeals: async (atptCode, schoolCode, startDate, endDate) => {
    if (!atptCode || !schoolCode) {
      set({ weekMeals: [], weekLoading: false });
      return;
    }

    set({ weekLoading: true });
    try {
      const meals = await getMeals.executeRange(NEIS_API_KEY, atptCode, schoolCode, startDate, endDate);
      // 캐시에도 저장
      const newCache: Record<string, readonly MealInfo[]> = {};
      for (const meal of meals) {
        const existing = newCache[meal.date] ?? [];
        newCache[meal.date] = [...existing, meal];
      }
      set((s) => ({
        weekMeals: meals,
        weekLoading: false,
        cache: { ...s.cache, ...newCache },
      }));
    } catch {
      set({ weekMeals: [], weekLoading: false });
    }
  },

  searchSchools: async (query) => {
    if (!query.trim()) {
      set({ searchResults: [], searching: false, searchError: null });
      return;
    }

    set({ searching: true, searchError: null });
    try {
      const results = await searchSchoolUseCase.execute(NEIS_API_KEY, query);
      set({
        searchResults: results,
        searching: false,
        searchError: results.length === 0 ? '검색 결과가 없습니다' : null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '검색 중 오류가 발생했습니다';
      set({ searchResults: [], searching: false, searchError: msg });
    }
  },

  clearSearch: () => set({ searchResults: [], searchError: null }),

  // === 수동 급식 ===

  loadManualMeals: async () => {
    if (get().manualLoaded) return;
    try {
      const data = await manualMealRepository.getAll();
      set({ manualMeals: data, manualLoaded: true });
    } catch {
      set({ manualLoaded: true });
    }
  },

  saveManualMeal: async (date, meals) => {
    const all = { ...get().manualMeals };
    if (meals.length === 0) {
      delete all[date];
    } else {
      all[date] = meals;
    }
    await manualMealRepository.save(all);
    set({ manualMeals: all });
  },

  deleteManualMeal: async (date) => {
    const all = { ...get().manualMeals };
    delete all[date];
    await manualMealRepository.save(all);
    set({ manualMeals: all });
  },

  setMealSource: (source) => set({ mealSource: source }),

  importFromCSV: async (content) => {
    const { meals, errors } = parseMealCSV(content);
    if (meals.length === 0) return { imported: 0, errors };

    const all = { ...get().manualMeals };
    for (const meal of meals) {
      const existing = all[meal.date] ?? [];
      // 같은 날짜+식사유형이면 교체
      const filtered = [...existing].filter((m) => m.mealType !== meal.mealType);
      all[meal.date] = [...filtered, meal];
    }
    await manualMealRepository.save(all);
    set({ manualMeals: all });
    return { imported: meals.length, errors };
  },

  getMergedMealsForDate: (date) => {
    const { cache, manualMeals, mealSource } = get();
    const neis = cache[date] ?? [];
    const manual = manualMeals[date] ?? [];
    return mergeMeals(neis, manual as ManualMealInfo[], mealSource);
  },

  getMergedTodayMeals: () => {
    const { todayMeals, manualMeals, mealSource } = get();
    const date = todayString();
    const manual = manualMeals[date] ?? [];
    return mergeMeals(todayMeals, manual as ManualMealInfo[], mealSource);
  },
}));
