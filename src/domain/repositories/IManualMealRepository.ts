import type { ManualMealData } from '@domain/entities/Meal';

export interface IManualMealRepository {
  getAll(): Promise<ManualMealData>;
  save(data: ManualMealData): Promise<void>;
}
