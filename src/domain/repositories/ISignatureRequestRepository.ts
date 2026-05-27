import type {
  LocalSignatureRequestDraft,
  SignatureRequestDraftsData,
} from '@domain/entities/SignatureRequest';

export interface ISignatureRequestRepository {
  load(): Promise<SignatureRequestDraftsData | null>;
  save(data: SignatureRequestDraftsData): Promise<void>;
  list(): Promise<readonly LocalSignatureRequestDraft[]>;
  upsert(draft: LocalSignatureRequestDraft): Promise<void>;
  delete(id: string): Promise<void>;
}
