import type { SeatPickerConfig } from '../entities/SeatPickerConfig';

export interface ISeatPickerConfigRepository {
  getConfig(): Promise<SeatPickerConfig>;
  saveConfig(data: SeatPickerConfig): Promise<void>;
}
