/**
 * 여러 학생의 AI 근거 지도 제안 계약.
 *
 * 제안은 실제 근거·주제 파일과 분리된 임시 스냅샷이다. AI가 답한 뒤에도 교사가 검토하고
 * 적용하기 전까지 `RecordEvidence.threadId`와 `InquiryThread`는 바뀌지 않는다.
 *
 * 이 파일은 도메인이다. 외부 의존성 import 금지.
 */
import type { InquiryThreadStatus, NarrativeScene } from './InquiryThread';
import type { RecordArea } from './RecordDraft';
import type { NarrativeFrameId, RecordScaffoldScene } from '../rules/narrativeFrames';
import type { OwnAiProviderId } from './OwnAiProvider';

export const RECORD_MAP_PROPOSAL_SCHEMA_VERSION = 1 as const;

export type RecordMapRunStatus =
  | 'queued'
  | 'generating'
  | 'generated'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export type RecordMapReviewStatus =
  | 'unreviewed'
  | 'reviewed'
  | 'held'
  | 'source-changed'
  | 'applying'
  | 'applied'
  | 'save-failed';

export const RECORD_MAP_RUN_STATUSES: readonly RecordMapRunStatus[] = [
  'queued',
  'generating',
  'generated',
  'failed',
  'skipped',
  'cancelled',
];

export const RECORD_MAP_REVIEW_STATUSES: readonly RecordMapReviewStatus[] = [
  'unreviewed',
  'reviewed',
  'held',
  'source-changed',
  'applying',
  'applied',
  'save-failed',
];

const RUN_STATUS_SET: ReadonlySet<string> = new Set(RECORD_MAP_RUN_STATUSES);
const REVIEW_STATUS_SET: ReadonlySet<string> = new Set(RECORD_MAP_REVIEW_STATUSES);

export function isRecordMapRunStatus(value: unknown): value is RecordMapRunStatus {
  return typeof value === 'string' && RUN_STATUS_SET.has(value);
}

export function isRecordMapReviewStatus(value: unknown): value is RecordMapReviewStatus {
  return typeof value === 'string' && REVIEW_STATUS_SET.has(value);
}

/** 한 번 시작한 작업에서 바뀌지 않는 학생·영역·과목 경계. */
export interface RecordMapStudentContext {
  readonly studentRef: string;
  /** 담임은 생략하고, 수업 관리에서는 TeachingClass.id를 고정한다. */
  readonly classId?: string;
  readonly area: RecordArea;
  /** 화면 표시용 과목명이 아니라 충돌 판별용 식별자. 수업 관리에서는 필수로 채운다. */
  readonly subjectId?: string;
  /** 실제 존재하는 학기 식별자(예: 2026-1). */
  readonly term?: string;
}

/** 시작 시 복사한 뼈대. 이후 개인 뼈대가 바뀌어도 이 판본으로 검증한다. */
export interface RecordMapScaffoldSnapshot {
  readonly id: string;
  readonly name: string;
  readonly frame: NarrativeFrameId;
  readonly scenes: readonly RecordScaffoldScene[];
  readonly builtIn?: boolean;
}

export type RecordMapScaffoldPolicy =
  | {
      readonly kind: 'existing';
      /** 장면이 없는 새 주제에만 쓰는 시작 시점의 기본 뼈대. */
      readonly defaultScaffold: RecordMapScaffoldSnapshot;
    }
  | {
      readonly kind: 'fixed';
      readonly scaffold: RecordMapScaffoldSnapshot;
    }
  | {
      readonly kind: 'ai';
      readonly candidates: readonly RecordMapScaffoldSnapshot[];
    };

export interface RecordMapProposedScene extends NarrativeScene {
  /** 임시 장면임을 드러내는 제안 내부 ID. 적용할 때 실제 ID를 새로 만든다. */
  readonly id: string;
}

export interface RecordMapScaffoldSelection {
  /** AI 정책에서 맞는 후보가 없으면 null. 이 경우 학생 전체 적용을 막는다. */
  readonly scaffoldId: string | null;
  /** AI가 후보를 골랐거나 고르지 못한 근거 기반 설명. */
  readonly reason?: string;
}

export interface RecordMapTopicLink {
  /** 이 주제의 바로 앞 주제. 제안 안의 임시 주제 ID만 가리킨다. */
  readonly fromTopicId: string;
  readonly note?: string;
}

export interface RecordMapTemporaryTopic {
  /** 새 주제는 `tmp:` 접두사를 권장한다. 실제 저장 ID로 사용하지 않는다. */
  readonly id: string;
  /** 기존 주제를 유지하는 제안이면 원본 InquiryThread.id. */
  readonly existingThreadId?: string;
  readonly title: string;
  readonly status: InquiryThreadStatus;
  readonly scenes: readonly RecordMapProposedScene[];
  readonly scaffold: RecordMapScaffoldSelection;
  readonly link?: RecordMapTopicLink;
}

export interface RecordMapUnplacedEvidence {
  readonly evidenceId: string;
  readonly reason: string;
}

export interface RecordMapStudentProposal {
  readonly schemaVersion: typeof RECORD_MAP_PROPOSAL_SCHEMA_VERSION;
  readonly runId: string;
  readonly attemptId: string;
  readonly context: RecordMapStudentContext;
  /** 적용 직전 원본 변경 감지에 쓰는 판별값. */
  readonly sourceFingerprint: string;
  /** Request audit metadata. It contains identifiers/counts, never prompt text or aliases. */
  readonly requestEvidence?: {
    readonly includedEvidenceIds: readonly string[];
    readonly excludedCounts: {
      readonly teacher: number;
      readonly empty: number;
      readonly prohibited: number;
      readonly tooLong: number;
    };
    readonly suppressedMemoCount: number;
  };
  readonly topics: readonly RecordMapTemporaryTopic[];
  readonly unplacedEvidence: readonly RecordMapUnplacedEvidence[];
  readonly warnings: readonly string[];
  readonly runStatus: RecordMapRunStatus;
  readonly reviewStatus: RecordMapReviewStatus;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export type RecordMapTargetMode = 'current' | 'selected' | 'class';
export type RecordMapRunLifecycle = 'ready' | 'running' | 'paused' | 'completed' | 'stopped';
export type RecordMapReviewPace =
  | { readonly kind: 'one' }
  | { readonly kind: 'batch'; readonly size: number }
  | { readonly kind: 'continuous' };

export interface RecordMapRunItem {
  readonly context: RecordMapStudentContext;
  readonly runStatus: RecordMapRunStatus;
  /** 실행하지 않은 학생은 비어 있다. 늦은 응답을 거르는 실행 판본. */
  readonly attemptId?: string;
  readonly failureMessage?: string;
  readonly updatedAt: number;
}

export interface RecordMapRun {
  readonly schemaVersion: typeof RECORD_MAP_PROPOSAL_SCHEMA_VERSION;
  readonly runId: string;
  readonly targetMode: RecordMapTargetMode;
  readonly targetContexts: readonly RecordMapStudentContext[];
  readonly lifecycle: RecordMapRunLifecycle;
  readonly items: readonly RecordMapRunItem[];
  readonly reviewPace: RecordMapReviewPace;
  readonly scaffoldPolicy: RecordMapScaffoldPolicy;
  readonly provider: OwnAiProviderId;
  readonly rebuildTopics?: boolean;
  readonly instruction?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface RecordMapProposalData {
  readonly schemaVersion: typeof RECORD_MAP_PROPOSAL_SCHEMA_VERSION;
  readonly runs: readonly RecordMapRun[];
  readonly proposals: readonly RecordMapStudentProposal[];
}
