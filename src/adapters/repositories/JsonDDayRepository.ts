import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDDayRepository } from '@domain/repositories/IDDayRepository';
import type { DDayData } from '@domain/entities/DDay';

export class JsonDDayRepository implements IDDayRepository {
  constructor(private readonly storage: IStoragePort) {}

  load(): Promise<DDayData | null> {
    return this.storage.read<DDayData>('dday');
  }

  save(data: DDayData): Promise<void> {
    return this.storage.write('dday', data);
  }
}
