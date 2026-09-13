import {
  RECORD_MAP_PROPOSAL_SCHEMA_VERSION,
  type RecordMapProposalData,
} from '@domain/entities/RecordMapProposal';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IRecordMapProposalRepository } from '@domain/repositories/IRecordMapProposalRepository';

export const RECORD_MAP_PROPOSALS_STORAGE_KEY = 'record-map-proposals';
const EMPTY_RECORD_MAP_PROPOSAL_DATA: RecordMapProposalData = {
  schemaVersion: RECORD_MAP_PROPOSAL_SCHEMA_VERSION,
  runs: [],
  proposals: [],
};
let proposalWriteTail: Promise<void> = Promise.resolve();

async function withProposalWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = proposalWriteTail;
  let release: () => void = () => undefined;
  proposalWriteTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

/** Electron userData 또는 브라우저 localStorage에 같은 JSON 계약으로 저장한다. */
export class JsonRecordMapProposalRepository implements IRecordMapProposalRepository {
  constructor(private readonly storage: IStoragePort) {}

  getRecordMapProposals(): Promise<RecordMapProposalData | null> {
    return this.storage.read<RecordMapProposalData>(RECORD_MAP_PROPOSALS_STORAGE_KEY);
  }

  async updateRecordMapProposals(
    update: (current: RecordMapProposalData) => RecordMapProposalData,
  ): Promise<RecordMapProposalData> {
    return withProposalWriteLock(async () => {
      if (this.storage.replaceIfUnchanged === undefined) {
        throw new Error('안전한 비교 저장을 사용할 수 없어 지도 제안을 갱신하지 못했습니다.');
      }
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const stored = await this.storage.read<RecordMapProposalData>(
          RECORD_MAP_PROPOSALS_STORAGE_KEY,
        );
        const next = update(stored ?? EMPTY_RECORD_MAP_PROPOSAL_DATA);
        const replaced = await this.storage.replaceIfUnchanged(
          RECORD_MAP_PROPOSALS_STORAGE_KEY,
          stored,
          next,
        );
        if (!replaced) continue;
        const readback = await this.storage.read<RecordMapProposalData>(
          RECORD_MAP_PROPOSALS_STORAGE_KEY,
        );
        if (JSON.stringify(readback) !== JSON.stringify(next)) {
          throw new Error('지도 제안 저장 결과가 일치하지 않습니다.');
        }
        return next;
      }
      throw new Error('지도 제안이 다른 작업에서 바뀌었습니다. 다시 시도해 주세요.');
    });
  }
}
