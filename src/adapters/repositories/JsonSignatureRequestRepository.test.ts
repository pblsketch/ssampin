import { describe, expect, it } from 'vitest';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import {
  SIGNATURE_REQUEST_SCHEMA_VERSION,
  type LocalSignatureRequestDraft,
} from '@domain/entities/SignatureRequest';
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

  // Phase 2C v2 (PRD US-2C-04): v1 → v2 자동 마이그레이션
  describe('schemaVersion v1 draft auto-migration', () => {
    it('storage 에 저장된 v1 draft 를 로드 시 v2 로 변환한다', async () => {
      const storage = new MemoryStorage();
      const legacyV1 = makeLegacyV1Draft('req-legacy-1');
      storage.data.set(SIGNATURE_REQUESTS_STORAGE_KEY, { drafts: [legacyV1] });

      const repo = new JsonSignatureRequestRepository(storage);
      const result = await repo.list();

      expect(result).toHaveLength(1);
      expect(result[0]?.request.schemaVersion).toBe(2);
      expect(result[0]?.request.mapping).toEqual({ textFields: [], signatureSlots: [] });
      // Phase 2C v2 신규 필수 필드
      expect(result[0]?.request.regions).toEqual([]);
      expect(result[0]?.request.regionVersion).toBe(0);
      // participants 보존
      expect(result[0]?.request.participants).toHaveLength(1);
      expect(result[0]?.request.participants[0]?.displayName).toBe('이전 학생');
    });

    it('v1 draft 변환 결과를 storage 에 write-back 한다 (다음 로드는 마이그레이션 안 함)', async () => {
      const storage = new MemoryStorage();
      const legacyV1 = makeLegacyV1Draft('req-legacy-2');
      storage.data.set(SIGNATURE_REQUESTS_STORAGE_KEY, { drafts: [legacyV1] });

      const repo = new JsonSignatureRequestRepository(storage);
      await repo.load(); // 1차 로드 시 write-back

      const persisted = storage.data.get(SIGNATURE_REQUESTS_STORAGE_KEY) as {
        drafts: { request: { schemaVersion: number } }[];
      };
      expect(persisted.drafts[0]?.request.schemaVersion).toBe(2);

      // 2차 로드: 이미 v2 라서 변환 없이 그대로
      const secondLoad = await repo.list();
      expect(secondLoad[0]?.request.schemaVersion).toBe(2);
    });

    it('v1 / v2 가 섞여 있어도 v1 만 마이그레이션한다', async () => {
      const storage = new MemoryStorage();
      const legacyV1 = makeLegacyV1Draft('req-mixed-1');
      storage.data.set(SIGNATURE_REQUESTS_STORAGE_KEY, {
        drafts: [legacyV1, draftA],
      });

      const repo = new JsonSignatureRequestRepository(storage);
      const result = await repo.list();

      expect(result).toHaveLength(2);
      expect(result.find((d) => d.request.id === 'req-mixed-1')?.request.schemaVersion).toBe(2);
      expect(result.find((d) => d.request.id === 'req-a')?.request.schemaVersion).toBe(2);
    });
  });
});

// v1 fixture: 의도적으로 legacy 4가지 mapping target 타입 중 하나(`generated-table-column`)를
// 가진 draft 를 raw 형태로 만든다. 타입은 unknown 으로 다루고 저장소에 그대로 넣는다.
function makeLegacyV1Draft(id: string): unknown {
  return {
    request: {
      schemaVersion: 1,
      id,
      title: '이전 양식 (v1)',
      templateKind: 'training-register',
      templateSource: {
        type: 'google-sheets',
        url: 'https://docs.google.com/spreadsheets/d/legacy',
      },
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
          id: 'p-legacy-1',
          displayName: '이전 학생',
          role: 'student',
          studentNumber: 1,
          requiredSignatureKinds: ['recipient'],
        },
      ],
      submissions: [],
      access: { uniqueLinksEnabled: false, pinEnabled: false },
      scope: {
        legalEffect: 'none',
        automaticReminders: false,
        strongIdentityRequired: false,
      },
      status: 'draft',
      createdAt: '2026-05-10T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    },
    participantAccessSecrets: [],
  };
}

function makeDraft(id: string, title: string): LocalSignatureRequestDraft {
  return {
    request: {
      schemaVersion: SIGNATURE_REQUEST_SCHEMA_VERSION,
      id,
      title,
      templateKind: 'training-register',
      templateSource: { type: 'pdf', url: 'https://example.com/template.pdf' },
      // Phase 2C v2: mapping 은 빈 객체로 유지. 실제 매핑은 regions 에 저장된다.
      mapping: { textFields: [], signatureSlots: [] },
      regions: [],
      regionVersion: 0,
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
