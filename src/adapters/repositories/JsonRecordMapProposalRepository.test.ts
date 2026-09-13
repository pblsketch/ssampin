import { describe, expect, it } from 'vitest';

import type { RecordMapProposalData } from '@domain/entities/RecordMapProposal';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import {
  JsonRecordMapProposalRepository,
  RECORD_MAP_PROPOSALS_STORAGE_KEY,
} from './JsonRecordMapProposalRepository';

class MemoryStorage implements IStoragePort {
  readonly json = new Map<string, unknown>();

  async read<T>(filename: string): Promise<T | null> {
    return (this.json.get(filename) as T | undefined) ?? null;
  }

  async write<T>(filename: string, data: T): Promise<void> {
    this.json.set(filename, data);
  }

  async replaceIfUnchanged<T>(filename: string, expected: T | null, next: T): Promise<boolean> {
    const current = (this.json.get(filename) as T | undefined) ?? null;
    if (JSON.stringify(current) !== JSON.stringify(expected)) return false;
    this.json.set(filename, next);
    return true;
  }

  async remove(filename: string): Promise<void> {
    this.json.delete(filename);
  }

  async readBinary(): Promise<Uint8Array | null> {
    return null;
  }

  async writeBinary(): Promise<void> {}

  async removeBinary(): Promise<void> {}

  async listBinary(): Promise<readonly string[]> {
    return [];
  }
}

const EMPTY: RecordMapProposalData = { schemaVersion: 1, runs: [], proposals: [] };

describe('JsonRecordMapProposalRepository', () => {
  it('실제 지도 파일과 다른 전용 키로 작업·제안을 왕복 저장한다', async () => {
    const storage = new MemoryStorage();
    const repository = new JsonRecordMapProposalRepository(storage);

    expect(await repository.getRecordMapProposals()).toBeNull();
    await repository.updateRecordMapProposals(() => EMPTY);

    expect(storage.json.has(RECORD_MAP_PROPOSALS_STORAGE_KEY)).toBe(true);
    expect(await repository.getRecordMapProposals()).toEqual(EMPTY);
  });

  it('최신 판본 안에서 변경분을 계산해 앞선 제안을 지우지 않는다', async () => {
    const storage = new MemoryStorage();
    const repository = new JsonRecordMapProposalRepository(storage);
    await repository.updateRecordMapProposals(() => EMPTY);

    await repository.updateRecordMapProposals((current) => ({
      ...current,
      proposals: [
        ...current.proposals,
        {
          schemaVersion: 1,
          runId: 'r',
          attemptId: 'a',
          context: { studentRef: 's', area: 'subject' },
          sourceFingerprint: 'f',
          topics: [],
          unplacedEvidence: [],
          warnings: [],
          runStatus: 'generated',
          reviewStatus: 'reviewed',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    }));
    const latest = await repository.updateRecordMapProposals((current) => ({
      ...current,
      runs: current.runs,
    }));

    expect(latest.proposals).toHaveLength(1);
    expect(latest.proposals[0]?.reviewStatus).toBe('reviewed');
  });
});
