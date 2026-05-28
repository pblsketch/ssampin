import type { IStoragePort } from '@domain/ports/IStoragePort';
import {
  SIGNATURE_REQUEST_SCHEMA_VERSION,
  type LegacyLocalSignatureRequestDraft,
  type LocalSignatureRequestDraft,
  type SignatureRequestDraftsData,
} from '@domain/entities/SignatureRequest';
import { migrateLocalDraftV1ToV2 } from '@domain/rules/signatureSchemaMigration';
import type { ISignatureRequestRepository } from '@domain/repositories/ISignatureRequestRepository';

export const SIGNATURE_REQUESTS_STORAGE_KEY = 'signature-requests';

/**
 * Phase 2C v2 (PRD US-2C-04): load 시 storage 에 저장된 draft 의 schemaVersion 을
 * 검사하여, v1 (`schemaVersion === 1`) 이 발견되면 `migrateLocalDraftV1ToV2()` 로
 * 변환한 뒤 write-back 한다. 다음 로드부터는 이미 v2 라서 변환이 일어나지 않는다.
 *
 * 디스크에 저장된 raw JSON 은 `LocalSignatureRequestDraft | LegacyLocalSignatureRequestDraft`
 * 둘 다 될 수 있으므로, internal storage type 은 둘의 union 으로 다루고 외부 API 만
 * 항상 v2 view 를 반환한다.
 */
type StoredDraft = LocalSignatureRequestDraft | LegacyLocalSignatureRequestDraft;
interface StoredDraftsData {
  readonly drafts: readonly StoredDraft[];
}

export class JsonSignatureRequestRepository implements ISignatureRequestRepository {
  constructor(private readonly storage: IStoragePort) {}

  async load(): Promise<SignatureRequestDraftsData | null> {
    const raw = await this.storage.read<StoredDraftsData>(SIGNATURE_REQUESTS_STORAGE_KEY);
    if (!raw || !raw.drafts) return null;

    const { migratedDrafts, didMigrate } = migrateStoredDrafts(raw.drafts);

    if (didMigrate) {
      // write-back: 다음 로드부터는 이미 v2 라서 다시 마이그레이션이 일어나지 않는다.
      await this.storage.write(SIGNATURE_REQUESTS_STORAGE_KEY, { drafts: migratedDrafts });
    }

    return { drafts: migratedDrafts };
  }

  save(data: SignatureRequestDraftsData): Promise<void> {
    return this.storage.write(SIGNATURE_REQUESTS_STORAGE_KEY, {
      drafts: [...data.drafts],
    });
  }

  async list(): Promise<readonly LocalSignatureRequestDraft[]> {
    const data = await this.load();
    return data?.drafts ? [...data.drafts] : [];
  }

  async upsert(draft: LocalSignatureRequestDraft): Promise<void> {
    const current = await this.list();
    const next = [draft, ...current.filter((item) => item.request.id !== draft.request.id)];
    await this.save({ drafts: next });
  }

  async delete(id: string): Promise<void> {
    const current = await this.list();
    await this.save({ drafts: current.filter((item) => item.request.id !== id) });
  }
}

function migrateStoredDrafts(stored: readonly StoredDraft[]): {
  migratedDrafts: LocalSignatureRequestDraft[];
  didMigrate: boolean;
} {
  let didMigrate = false;
  const migratedDrafts = stored.map((draft) => {
    if (draft.request.schemaVersion === SIGNATURE_REQUEST_SCHEMA_VERSION) {
      return draft as LocalSignatureRequestDraft;
    }
    didMigrate = true;
    return migrateLocalDraftV1ToV2(draft as LegacyLocalSignatureRequestDraft);
  });
  return { migratedDrafts, didMigrate };
}
