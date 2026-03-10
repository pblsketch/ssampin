import type { DDayData } from '../entities/DDay';

export interface IDDayRepository {
  load(): Promise<DDayData | null>;
  save(data: DDayData): Promise<void>;
}
