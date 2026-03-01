import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IMemoRepository } from '@domain/repositories/IMemoRepository';
import type { MemosData } from '@domain/entities/Memo';

export class JsonMemoRepository implements IMemoRepository {
  constructor(private readonly storage: IStoragePort) {}

  getMemos(): Promise<MemosData | null> {
    return this.storage.read<MemosData>('memos');
  }

  saveMemos(data: MemosData): Promise<void> {
    return this.storage.write('memos', data);
  }
}
