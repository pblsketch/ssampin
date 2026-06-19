import type { ImportedTranscriptData } from '../entities/ImportedTranscript';

/**
 * 담임 학급 전과목 성적 저장소 (로컬 JSON 'transcripts' 키).
 * 학생 점수는 로컬 전용 — 클라우드 동기화(syncRegistry) 대상에 넣지 않는다.
 */
export interface IImportedTranscriptRepository {
  load(): Promise<ImportedTranscriptData | null>;
  save(data: ImportedTranscriptData): Promise<void>;
}
