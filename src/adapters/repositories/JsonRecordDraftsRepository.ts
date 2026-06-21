import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IRecordDraftsRepository } from '@domain/repositories/IRecordDraftsRepository';
import type { RecordDraftsData } from '@domain/entities/RecordDraft';

export class JsonRecordDraftsRepository implements IRecordDraftsRepository {
  constructor(private readonly storage: IStoragePort) {}

  getRecordDrafts(): Promise<RecordDraftsData | null> {
    return this.storage.read<RecordDraftsData>('record-drafts');
  }

  saveRecordDrafts(data: RecordDraftsData): Promise<void> {
    return this.storage.write('record-drafts', data);
  }
}
