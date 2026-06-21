import type { RecordDraftsData } from '../entities/RecordDraft';

export interface IRecordDraftsRepository {
  getRecordDrafts(): Promise<RecordDraftsData | null>;
  saveRecordDrafts(data: RecordDraftsData): Promise<void>;
}
