import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { ISeatPickerConfigRepository } from '@domain/repositories/ISeatPickerConfigRepository';
import type { SeatPickerConfig } from '@domain/entities/SeatPickerConfig';
import { EMPTY_SEAT_PICKER_CONFIG } from '@domain/entities/SeatPickerConfig';

export class JsonSeatPickerConfigRepository implements ISeatPickerConfigRepository {
  constructor(private readonly storage: IStoragePort) {}

  async getConfig(): Promise<SeatPickerConfig> {
    const data = await this.storage.read<SeatPickerConfig>('seat-picker-config');
    return data ?? EMPTY_SEAT_PICKER_CONFIG;
  }

  saveConfig(data: SeatPickerConfig): Promise<void> {
    return this.storage.write('seat-picker-config', data);
  }
}
