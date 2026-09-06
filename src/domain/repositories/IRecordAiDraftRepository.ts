import type { RecordAiDraftData } from '../entities/RecordAiDraft';

/**
 * AI 초안 판(RecordAiDraft) 저장소 — record-ai-drafts.json 단일 파일을 통째로 읽고/쓴다
 * (RecordDrafts 저장 방식 미러).
 */
export interface IRecordAiDraftRepository {
  getRecordAiDrafts(): Promise<RecordAiDraftData | null>;
  saveRecordAiDrafts(data: RecordAiDraftData): Promise<void>;
}
