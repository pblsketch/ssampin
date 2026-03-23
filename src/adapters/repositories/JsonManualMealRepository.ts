import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IManualMealRepository } from '@domain/repositories/IManualMealRepository';
import type { ManualMealData } from '@domain/entities/Meal';

export class JsonManualMealRepository implements IManualMealRepository {
  constructor(private readonly storage: IStoragePort) {}

  async getAll(): Promise<ManualMealData> {
    const data = await this.storage.read<ManualMealData>('manual-meals');
    return data ?? {};
  }

  async save(data: ManualMealData): Promise<void> {
    return this.storage.write('manual-meals', data);
  }
}
