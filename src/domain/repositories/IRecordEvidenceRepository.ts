import type { RecordEvidenceData } from '../entities/RecordEvidence';

/**
 * 생기부 작성 근거 자료(RecordEvidence) 저장소 인터페이스.
 * record-evidence.json 단일 파일을 통째로 읽고/쓴다(RecordDrafts 저장 방식 미러).
 */
export interface IRecordEvidenceRepository {
  getRecordEvidence(): Promise<RecordEvidenceData | null>;
  saveRecordEvidence(data: RecordEvidenceData): Promise<void>;
}
