import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IImportedTranscriptRepository } from '@domain/repositories/IImportedTranscriptRepository';
import type { ImportedTranscriptData } from '@domain/entities/ImportedTranscript';

/** 담임 전과목 성적 로컬 JSON 저장소('transcripts'). 네트워크 전송 없음. */
export class JsonImportedTranscriptRepository implements IImportedTranscriptRepository {
  constructor(private readonly storage: IStoragePort) {}

  load(): Promise<ImportedTranscriptData | null> {
    return this.storage.read<ImportedTranscriptData>('transcripts');
  }

  save(data: ImportedTranscriptData): Promise<void> {
    return this.storage.write('transcripts', data);
  }
}
