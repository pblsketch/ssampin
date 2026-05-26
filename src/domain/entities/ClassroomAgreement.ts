export const CLASSROOM_AGREEMENT_SCHEMA_VERSION = 1;

export type ClassroomAgreementType = 'class-rule' | 'lesson-rule' | 'group-agreement';

export type ClassroomAgreementPhase =
  | 'setup'
  | 'collecting'
  | 'teacherReview'
  | 'refinementVoting'
  | 'priorityVoting'
  | 'finalized';

export type ClassroomAgreementSaveMode = 'finalOnly' | 'includeProcess';

export type AgreementValidationIssueCode =
  | 'abstractPhrase'
  | 'negativeOnly'
  | 'tooManyActions'
  | 'vagueIf'
  | 'vagueThen'
  | 'longTermOutcome'
  | 'missingObservableAction';

export type AgreementValidationIssueSeverity = 'info' | 'warning';

export interface AgreementValidationIssue {
  readonly code: AgreementValidationIssueCode;
  readonly severity: AgreementValidationIssueSeverity;
  readonly message: string;
  readonly target: 'ifText' | 'thenText' | 'sentence';
  readonly matchedText?: string;
}

export interface ClassroomAgreementSettings {
  readonly maxProposalsPerStudent: number;
  readonly priorityVoteLimit: number;
  readonly allowNickname: boolean;
  readonly defaultShowAuthor: boolean;
  readonly allowProposalsDuringReview: boolean;
  readonly saveMode: ClassroomAgreementSaveMode;
}

export interface ClassroomAgreementParticipant {
  readonly studentToken: string;
  readonly displayName: string;
  readonly joinedAt: number;
  readonly lastSeenAt: number;
}

export interface ClassroomAgreementProposal {
  readonly id: string;
  readonly studentToken: string;
  readonly displayName: string;
  readonly ifText: string;
  readonly thenText: string;
  readonly submittedAt: number;
  readonly promotedCandidateId?: string;
}

export interface RefinementVote {
  readonly candidateId: string;
  readonly studentToken: string;
  readonly value: 'agree' | 'needsWork';
  readonly votedAt: number;
}

export interface PriorityVote {
  readonly candidateId: string;
  readonly studentToken: string;
  readonly votedAt: number;
}

export interface ClassroomAgreementCandidate {
  readonly id: string;
  readonly sourceProposalIds: readonly string[];
  readonly authorLabels: readonly string[];
  readonly ifText: string;
  readonly thenText: string;
  readonly showAuthors: boolean;
  readonly validationIssues: readonly AgreementValidationIssue[];
  readonly refinementVotes: readonly RefinementVote[];
  readonly priorityVotes: readonly PriorityVote[];
  readonly status: 'draft' | 'active' | 'removed' | 'finalized';
}

export interface AgreementFinalItem {
  readonly id: string;
  readonly ifText: string;
  readonly thenText: string;
  readonly showAuthors: boolean;
  readonly authorLabels: readonly string[];
  readonly priorityRank: number;
}

export interface ClassroomAgreementSession {
  readonly schemaVersion: typeof CLASSROOM_AGREEMENT_SCHEMA_VERSION;
  readonly id: string;
  readonly title: string;
  readonly agreementType: ClassroomAgreementType;
  readonly scene: string;
  readonly phase: ClassroomAgreementPhase;
  readonly settings: ClassroomAgreementSettings;
  readonly participants: readonly ClassroomAgreementParticipant[];
  readonly proposals: readonly ClassroomAgreementProposal[];
  readonly candidates: readonly ClassroomAgreementCandidate[];
  readonly finalItems: readonly AgreementFinalItem[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ClassroomAgreementSavedSession {
  readonly schemaVersion: typeof CLASSROOM_AGREEMENT_SCHEMA_VERSION;
  readonly id: string;
  readonly title: string;
  readonly agreementType: ClassroomAgreementType;
  readonly scene: string;
  readonly saveMode: ClassroomAgreementSaveMode;
  readonly finalItems: readonly AgreementFinalItem[];
  readonly savedAt: number;
  readonly process?: {
    readonly participants: readonly ClassroomAgreementParticipant[];
    readonly proposals: readonly ClassroomAgreementProposal[];
    readonly candidates: readonly ClassroomAgreementCandidate[];
  };
}

export interface ClassroomAgreementSessionsData {
  readonly sessions: readonly ClassroomAgreementSavedSession[];
}
