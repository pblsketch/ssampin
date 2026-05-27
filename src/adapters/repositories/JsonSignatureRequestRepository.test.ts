import { describe, expect, it } from 'vitest';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { LocalSignatureRequestDraft } from '@domain/entities/SignatureRequest';
import {
  JsonSignatureRequestRepository,
  SIGNATURE_REQUESTS_STORAGE_KEY,
} from './JsonSignatureRequestRepository';

class MemoryStorage implements IStoragePort {
  readonly data = new Map<string, unknown>();

  async read<T>(filename: string): Promise<T | null> {
    return (this.data.get(filename) as T | undefined) ?? null;
  }

  async write<T>(filename: string, data: T): Promise<void> {
    this.data.set(filename, data);
  }

  async remove(filename: string): Promise<void> {
    this.data.delete(filename);
  }

  async readBinary(): Promise<Uint8Array | null> {
    return null;
  }

  async writeBinary(): Promise<void> {
    return undefined;
  }

  async removeBinary(): Promise<void> {
    return undefined;
  }

  async listBinary(): Promise<readonly string[]> {
    return [];
  }
}

const draftA = makeDraft('req-a', '연수 등록부');
const draftB = makeDraft('req-b', '결석계');

describe('JsonSignatureRequestRepository', () => {
  it('starts with an empty list and persists under the signature request key', async () => {
    const storage = new MemoryStorage();
    const repo = new JsonSignatureRequestRepository(storage);

    expect(await repo.list()).toEqual([]);
    await repo.upsert(draftA);

    expect(storage.data.has(SIGNATURE_REQUESTS_STORAGE_KEY)).toBe(true);
    expect(await repo.list()).toEqual([draftA]);
  });

  it('upserts by request id and keeps the newest draft first', async () => {
    const repo = new JsonSignatureRequestRepository(new MemoryStorage());

    await repo.upsert(draftA);
    await repo.upsert(draftB);
    await repo.upsert({ ...draftA, request: { ...draftA.request, title: '수정된 등록부' } });

    const list = await repo.list();
    expect(list.map((draft) => draft.request.id)).toEqual(['req-a', 'req-b']);
    expect(list[0]?.request.title).toBe('수정된 등록부');
  });

  it('deletes a draft without touching other drafts', async () => {
    const repo = new JsonSignatureRequestRepository(new MemoryStorage());

    await repo.upsert(draftA);
    await repo.upsert(draftB);
    await repo.delete('req-b');

    expect((await repo.list()).map((draft) => draft.request.id)).toEqual(['req-a']);
  });
});

function makeDraft(id: string, title: string): LocalSignatureRequestDraft {
  return {
    request: {
      schemaVersion: 1,
      id,
      title,
      templateKind: 'training-register',
      templateSource: { type: 'google-sheets', url: 'https://docs.google.com/spreadsheets/d/test' },
      mapping: {
        textFields: [],
        signatureSlots: [
          {
            id: 'slot-1',
            kind: 'recipient',
            label: '서명',
            required: true,
            target: { type: 'generated-table-column', value: '서명' },
          },
        ],
      },
      participants: [
        {
          id: 'p1',
          displayName: '김교사',
          role: 'teacher',
          requiredSignatureKinds: ['recipient'],
        },
      ],
      submissions: [],
      access: { uniqueLinksEnabled: true, pinEnabled: false },
      scope: {
        legalEffect: 'none',
        automaticReminders: false,
        strongIdentityRequired: false,
      },
      status: 'draft',
      createdAt: '2026-05-27T00:00:00.000Z',
      updatedAt: '2026-05-27T00:00:00.000Z',
    },
    participantAccessSecrets: [
      {
        participantId: 'p1',
        uniqueLinkToken: 'local-token',
      },
    ],
  };
}
