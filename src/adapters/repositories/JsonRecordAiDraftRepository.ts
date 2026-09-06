import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IRecordAiDraftRepository } from '@domain/repositories/IRecordAiDraftRepository';
import type { RecordAiDraftData } from '@domain/entities/RecordAiDraft';

export class JsonRecordAiDraftRepository implements IRecordAiDraftRepository {
  constructor(private readonly storage: IStoragePort) {}

  getRecordAiDrafts(): Promise<RecordAiDraftData | null> {
    return this.storage.read<RecordAiDraftData>('record-ai-drafts');
  }

  saveRecordAiDrafts(data: RecordAiDraftData): Promise<void> {
    return this.storage.write('record-ai-drafts', data);
  }
}
