import type { IStoragePort } from '@domain/ports/IStoragePort';
import type {
  LocalSignatureRequestDraft,
  SignatureRequestDraftsData,
} from '@domain/entities/SignatureRequest';
import type { ISignatureRequestRepository } from '@domain/repositories/ISignatureRequestRepository';

export const SIGNATURE_REQUESTS_STORAGE_KEY = 'signature-requests';

export class JsonSignatureRequestRepository implements ISignatureRequestRepository {
  constructor(private readonly storage: IStoragePort) {}

  load(): Promise<SignatureRequestDraftsData | null> {
    return this.storage.read<SignatureRequestDraftsData>(SIGNATURE_REQUESTS_STORAGE_KEY);
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
