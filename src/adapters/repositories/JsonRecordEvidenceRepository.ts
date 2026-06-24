import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IRecordEvidenceRepository } from '@domain/repositories/IRecordEvidenceRepository';
import type { RecordEvidenceData } from '@domain/entities/RecordEvidence';

export class JsonRecordEvidenceRepository implements IRecordEvidenceRepository {
  constructor(private readonly storage: IStoragePort) {}

  getRecordEvidence(): Promise<RecordEvidenceData | null> {
    return this.storage.read<RecordEvidenceData>('record-evidence');
  }

  saveRecordEvidence(data: RecordEvidenceData): Promise<void> {
    return this.storage.write('record-evidence', data);
  }
}
