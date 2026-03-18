import { create } from 'zustand';
import type { MealInfo } from '@domain/entities/Meal';
import { NEIS_API_KEY } from '@domain/entities/Meal';
import { neisPort } from '@mobile/di/container';
import { GetMeals } from '@usecases/meal/GetMeals';

const getMeals = new GetMeals(neisPort);

interface MobileMealState {
  todayMeals: readonly MealInfo[];
  loading: boolean;
  loadTodayMeals: (atptCode: string, schoolCode: string) => Promise<void>;
}

function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export const useMobileMealStore = create<MobileMealState>((set) => ({
  todayMeals: [],
  loading: false,

  loadTodayMeals: async (atptCode, schoolCode) => {
    if (!atptCode || !schoolCode) return;
    set({ loading: true });
    try {
      const meals = await getMeals.execute(NEIS_API_KEY, atptCode, schoolCode, todayString());
      set({ todayMeals: meals, loading: false });
    } catch {
      set({ todayMeals: [], loading: false });
    }
  },
}));
