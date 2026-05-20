import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { ISeatingRepository } from '@domain/repositories/ISeatingRepository';
import type { SeatingData } from '@domain/entities/Seating';

const KEY_SEATING = 'seating';
const KEY_PRESET = 'seating-preset';

export class JsonSeatingRepository implements ISeatingRepository {
  constructor(private readonly storage: IStoragePort) {}

  getSeating(): Promise<SeatingData | null> {
    return this.storage.read<SeatingData>(KEY_SEATING);
  }

  saveSeating(data: SeatingData): Promise<void> {
    return this.storage.write(KEY_SEATING, data);
  }

  /* Phase 3b: 우연을 가장한 배치용 프리셋 */

  getPreset(): Promise<SeatingData | null> {
    return this.storage.read<SeatingData>(KEY_PRESET);
  }

  savePreset(data: SeatingData): Promise<void> {
    return this.storage.write(KEY_PRESET, data);
  }

  clearPreset(): Promise<void> {
    return this.storage.remove(KEY_PRESET);
  }
}
