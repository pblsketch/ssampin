import { create } from 'zustand';
import type { MealInfo, SchoolSearchResult } from '@domain/entities/Meal';
import { NEIS_API_KEY } from '@domain/entities/Meal';
import { neisPort } from '@adapters/di/container';
import { GetMeals } from '@usecases/meal/GetMeals';
import { SearchSchool } from '@usecases/school/SearchSchool';

const getMeals = new GetMeals(neisPort);
const searchSchoolUseCase = new SearchSchool(neisPort);

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

  // Actions
  loadTodayMeals: (atptCode: string, schoolCode: string) => Promise<void>;
  loadWeekMeals: (atptCode: string, schoolCode: string, startDate: string, endDate: string) => Promise<void>;
  searchSchools: (query: string) => Promise<void>;
  clearSearch: () => void;
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
}));
