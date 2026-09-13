import type { InquiryThreadData } from '../entities/InquiryThread';
import type { RecordEvidenceData } from '../entities/RecordEvidence';
import type {
  RecordMapApplication,
  RecordMapApplicationData,
} from '../entities/RecordMapApplication';

export interface RecordMapFileSnapshot<T> {
  readonly data: T;
  /** CAS must distinguish a missing file from a normalized empty document. */
  readonly raw: T | null;
}

export type RecordMapReplaceResult =
  | { readonly kind: 'written' }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'uncertain'; readonly message: string };

export interface IRecordMapApplicationPort {
  loadEvidence(): Promise<RecordEvidenceData>;
  loadThreads(): Promise<InquiryThreadData>;
  loadEvidenceSnapshot(): Promise<RecordMapFileSnapshot<RecordEvidenceData>>;
  loadThreadsSnapshot(): Promise<RecordMapFileSnapshot<InquiryThreadData>>;
  replaceEvidence(
    expected: RecordEvidenceData | null,
    next: RecordEvidenceData,
  ): Promise<RecordMapReplaceResult>;
  replaceThreads(
    expected: InquiryThreadData | null,
    next: InquiryThreadData,
  ): Promise<RecordMapReplaceResult>;
  loadApplications(): Promise<RecordMapApplicationData>;
  upsertApplication(application: RecordMapApplication): Promise<void>;
}
