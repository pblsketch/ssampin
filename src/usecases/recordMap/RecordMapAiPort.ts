import type { InquiryThread } from '@domain/entities/InquiryThread';
import type { RecordEvidence } from '@domain/entities/RecordEvidence';
import type { RecordMapStudentContext } from '@domain/entities/RecordMapProposal';
import type { KeywordGroup } from '@domain/privacy/types';
import type { AiRunProviderId } from '@domain/entities/ApiKeyProvider';

export interface RecordMapAiRequest {
  readonly runId: string;
  readonly attemptId: string;
  /** Provider is frozen when the run is created and survives resume. */
  readonly provider: AiRunProviderId;
  readonly text: string;
}

/** UI·Electron을 모르는 AI 실행 경계. 한 요청은 반드시 한 학생의 요청서다. */
export interface RecordMapAiPort {
  ask(request: RecordMapAiRequest): Promise<string>;
  cancel?(runId: string, attemptId: string): void | Promise<void>;
}

export interface RecordMapStudentSource {
  readonly studentName: string;
  readonly roster: readonly KeywordGroup[];
  readonly evidences: readonly RecordEvidence[];
  readonly threads: readonly InquiryThread[];
  readonly sourceFingerprint: string;
}

export interface RecordMapStudentSourcePort {
  load(context: RecordMapStudentContext): Promise<RecordMapStudentSource>;
}
