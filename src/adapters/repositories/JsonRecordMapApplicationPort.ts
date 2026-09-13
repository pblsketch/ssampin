import type { RecordMapApplicationData } from '@domain/entities/RecordMapApplication';
import type { InquiryThreadData } from '@domain/entities/InquiryThread';
import type { RecordEvidenceData } from '@domain/entities/RecordEvidence';
import type { IRecordMapApplicationPort } from '@domain/ports/IRecordMapApplicationPort';
import type {
  RecordMapFileSnapshot,
  RecordMapReplaceResult,
} from '@domain/ports/IRecordMapApplicationPort';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import { SYNC_FILE_KEYS } from '@usecases/sync/syncRegistry';

const EMPTY_EVIDENCE: RecordEvidenceData = { records: [] };
const EMPTY_THREADS: InquiryThreadData = { records: [] };
const EMPTY_APPLICATIONS: RecordMapApplicationData = { schemaVersion: 1, applications: [] };
const APPLICATION_STORAGE_KEY = 'record-map-applications';
let applicationWriteTail: Promise<void> = Promise.resolve();

async function withApplicationWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = applicationWriteTail;
  let release: () => void = () => undefined;
  applicationWriteTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export class JsonRecordMapApplicationPort implements IRecordMapApplicationPort {
  constructor(private readonly storage: IStoragePort) {}

  async loadEvidence(): Promise<RecordEvidenceData> {
    return (await this.loadEvidenceSnapshot()).data;
  }

  async loadThreads(): Promise<InquiryThreadData> {
    return (await this.loadThreadsSnapshot()).data;
  }

  async loadEvidenceSnapshot(): Promise<RecordMapFileSnapshot<RecordEvidenceData>> {
    const raw = await this.storage.read<RecordEvidenceData>(SYNC_FILE_KEYS.recordEvidence);
    return { raw, data: raw ?? EMPTY_EVIDENCE };
  }

  async loadThreadsSnapshot(): Promise<RecordMapFileSnapshot<InquiryThreadData>> {
    const raw = await this.storage.read<InquiryThreadData>(SYNC_FILE_KEYS.inquiryThreads);
    return { raw, data: raw ?? EMPTY_THREADS };
  }

  replaceEvidence(
    expected: RecordEvidenceData | null,
    next: RecordEvidenceData,
  ): Promise<RecordMapReplaceResult> {
    return this.replaceAndVerify(SYNC_FILE_KEYS.recordEvidence, expected, next);
  }

  replaceThreads(
    expected: InquiryThreadData | null,
    next: InquiryThreadData,
  ): Promise<RecordMapReplaceResult> {
    return this.replaceAndVerify(SYNC_FILE_KEYS.inquiryThreads, expected, next);
  }

  async loadApplications(): Promise<RecordMapApplicationData> {
    return (
      (await this.storage.read<RecordMapApplicationData>(APPLICATION_STORAGE_KEY)) ??
      EMPTY_APPLICATIONS
    );
  }

  async upsertApplication(
    application: RecordMapApplicationData['applications'][number],
  ): Promise<void> {
    await withApplicationWriteLock(async () => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const stored = await this.storage.read<RecordMapApplicationData>(APPLICATION_STORAGE_KEY);
        const current = stored ?? EMPTY_APPLICATIONS;
        const next: RecordMapApplicationData = {
          schemaVersion: 1,
          applications: [
            ...current.applications.filter((item) => item.id !== application.id),
            application,
          ],
        };
        if (this.storage.replaceIfUnchanged === undefined) {
          throw new Error('안전한 비교 저장을 사용할 수 없어 지도 적용을 중단했습니다.');
        }
        const replaced = await this.storage.replaceIfUnchanged(
          APPLICATION_STORAGE_KEY,
          stored,
          next,
        );
        if (!replaced) continue;
        const readback = await this.storage.read<RecordMapApplicationData>(APPLICATION_STORAGE_KEY);
        if (!same(readback, next)) throw new Error('지도 적용 기록 저장 결과가 일치하지 않습니다.');
        return;
      }
      throw new Error('지도 적용 기록이 다른 작업에서 바뀌었습니다. 다시 시도해 주세요.');
    });
  }

  private async replaceAndVerify<T>(
    filename: string,
    expected: T | null,
    next: T,
  ): Promise<RecordMapReplaceResult> {
    if (this.storage.replaceIfUnchanged === undefined) return { kind: 'conflict' };
    try {
      const replaced = await this.storage.replaceIfUnchanged(filename, expected, next);
      if (!replaced) return { kind: 'conflict' };
      const readback = await this.storage.read<T>(filename);
      return same(readback, next)
        ? { kind: 'written' }
        : { kind: 'uncertain', message: 'CAS succeeded but readback did not match.' };
    } catch (error) {
      return {
        kind: 'uncertain',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
