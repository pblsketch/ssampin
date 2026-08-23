import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { ICoolImportHistoryRepository } from '@domain/repositories/ICoolImportHistoryRepository';
import type { CoolImportHistory } from '@domain/entities/CoolMessage';

export class JsonCoolImportHistoryRepository implements ICoolImportHistoryRepository {
  constructor(private readonly storage: IStoragePort) {}

  load(): Promise<CoolImportHistory | null> {
    return this.storage.read<CoolImportHistory>('cool-import-history');
  }

  save(data: CoolImportHistory): Promise<void> {
    return this.storage.write('cool-import-history', data);
  }
}
