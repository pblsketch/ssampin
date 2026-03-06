import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { ISeatConstraintsRepository } from '@domain/repositories/ISeatConstraintsRepository';
import type { SeatConstraints } from '@domain/entities/SeatConstraints';
import { EMPTY_SEAT_CONSTRAINTS } from '@domain/entities/SeatConstraints';

export class JsonSeatConstraintsRepository implements ISeatConstraintsRepository {
  constructor(private readonly storage: IStoragePort) {}

  async getConstraints(): Promise<SeatConstraints> {
    const data = await this.storage.read<SeatConstraints>('seat-constraints');
    return data ?? EMPTY_SEAT_CONSTRAINTS;
  }

  saveConstraints(data: SeatConstraints): Promise<void> {
    return this.storage.write('seat-constraints', data);
  }
}
