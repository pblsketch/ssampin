import type { InquiryThread } from './InquiryThread';
import type { RecordEvidence } from './RecordEvidence';

export const RECORD_MAP_APPLICATION_SCHEMA_VERSION = 1 as const;

export type RecordMapApplicationPhase =
  | 'prepared'
  | 'evidence-written'
  | 'threads-written'
  | 'committed'
  | 'rolling-back'
  | 'rolled-back'
  | 'recovery-required';

export interface RecordMapRecordChange<T> {
  readonly id: string;
  readonly before: T | null;
  readonly after: T | null;
}

/** 학생 한 명의 지도 적용을 다시 시작하고 부분 복구하기 위한 최소 변경 기록. */
export interface RecordMapApplication {
  readonly schemaVersion: typeof RECORD_MAP_APPLICATION_SCHEMA_VERSION;
  readonly id: string;
  readonly runId: string;
  readonly studentRef: string;
  readonly proposalAttemptId: string;
  readonly sourceFingerprint: string;
  readonly phase: RecordMapApplicationPhase;
  readonly evidenceChanges: readonly RecordMapRecordChange<RecordEvidence>[];
  readonly threadChanges: readonly RecordMapRecordChange<InquiryThread>[];
  readonly failureMessage?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface RecordMapApplicationData {
  readonly schemaVersion: typeof RECORD_MAP_APPLICATION_SCHEMA_VERSION;
  readonly applications: readonly RecordMapApplication[];
}
