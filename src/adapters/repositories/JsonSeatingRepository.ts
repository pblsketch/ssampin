import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { ISeatingRepository } from '@domain/repositories/ISeatingRepository';
import type { SeatingData } from '@domain/entities/Seating';

export class JsonSeatingRepository implements ISeatingRepository {
  constructor(private readonly storage: IStoragePort) {}

  getSeating(): Promise<SeatingData | null> {
    return this.storage.read<SeatingData>('seating');
  }

  saveSeating(data: SeatingData): Promise<void> {
    return this.storage.write('seating', data);
  }
}
