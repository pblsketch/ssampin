import type { InquiryThreadData } from '@domain/entities/InquiryThread';
import type { RecordEvidenceData } from '@domain/entities/RecordEvidence';
import type {
  RecordMapApplication,
  RecordMapApplicationPhase,
} from '@domain/entities/RecordMapApplication';
import type { IRecordMapApplicationPort } from '@domain/ports/IRecordMapApplicationPort';
import type { RecordMapReplaceResult } from '@domain/ports/IRecordMapApplicationPort';
import { mergeRecordChanges, recordsMatchChanges } from '@domain/rules/recordMapApplication';

export function withApplicationPhase(
  application: RecordMapApplication,
  phase: RecordMapApplicationPhase,
  now: number,
  failureMessage?: string,
): RecordMapApplication {
  return {
    ...application,
    phase,
    failureMessage,
    updatedAt: now,
  };
}

export async function writeEvidenceChanges(
  port: IRecordMapApplicationPort,
  changes: RecordMapApplication['evidenceChanges'],
  direction: 'forward' | 'backward',
): Promise<RecordMapReplaceResult> {
  const current = await port.loadEvidenceSnapshot();
  const records = mergeRecordChanges(current.data.records, changes, direction);
  if (records === null) return { kind: 'conflict' };
  const next: RecordEvidenceData = { ...current.data, records };
  return port.replaceEvidence(current.raw, next);
}

export async function writeThreadChanges(
  port: IRecordMapApplicationPort,
  changes: RecordMapApplication['threadChanges'],
  direction: 'forward' | 'backward',
): Promise<RecordMapReplaceResult> {
  const current = await port.loadThreadsSnapshot();
  const records = mergeRecordChanges(current.data.records, changes, direction);
  if (records === null) return { kind: 'conflict' };
  const next: InquiryThreadData = { ...current.data, records };
  return port.replaceThreads(current.raw, next);
}

export type RecordMapDiskState = 'before' | 'after' | 'mixed-or-unknown';

export async function inspectApplicationDiskState(
  port: IRecordMapApplicationPort,
  application: RecordMapApplication,
): Promise<RecordMapDiskState> {
  const [evidence, threads] = await Promise.all([port.loadEvidence(), port.loadThreads()]);
  const evidenceBefore = recordsMatchChanges(
    evidence.records,
    application.evidenceChanges,
    'before',
  );
  const evidenceAfter = recordsMatchChanges(evidence.records, application.evidenceChanges, 'after');
  const threadsBefore = recordsMatchChanges(threads.records, application.threadChanges, 'before');
  const threadsAfter = recordsMatchChanges(threads.records, application.threadChanges, 'after');
  if (evidenceBefore && threadsBefore) return 'before';
  if (evidenceAfter && threadsAfter) return 'after';
  return 'mixed-or-unknown';
}
