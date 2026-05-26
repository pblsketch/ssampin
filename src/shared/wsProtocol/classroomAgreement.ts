import { z } from 'zod';

export const CLASSROOM_AGREEMENT_PROTOCOL_VERSION = '1.0.0' as const;

export const ClassroomAgreementPhaseSchema = z.enum([
  'setup',
  'collecting',
  'teacherReview',
  'refinementVoting',
  'priorityVoting',
  'finalized',
]);

export const ClassroomAgreementTypeSchema = z.enum([
  'class-rule',
  'lesson-rule',
  'group-agreement',
]);

export const StudentTokenSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

export const DisplayNameSchema = z.string().trim().min(1).max(20);

export const ClientMessageIdSchema = z.string().min(1).max(64);

export const AgreementTextSchema = z.string().trim().min(1).max(200);

export const CandidateIdSchema = z.string().min(1).max(100);

export const JoinSessionSchema = z.object({
  type: z.literal('join-session'),
  protocolVersion: z.literal(CLASSROOM_AGREEMENT_PROTOCOL_VERSION),
  displayName: DisplayNameSchema,
  previousToken: StudentTokenSchema.optional(),
});

export const SubmitProposalSchema = z.object({
  type: z.literal('submit-proposal'),
  studentToken: StudentTokenSchema,
  clientMessageId: ClientMessageIdSchema,
  ifText: AgreementTextSchema,
  thenText: AgreementTextSchema,
});

export const SubmitRefinementVoteSchema = z.object({
  type: z.literal('submit-refinement-vote'),
  studentToken: StudentTokenSchema,
  clientMessageId: ClientMessageIdSchema,
  candidateId: CandidateIdSchema,
  value: z.enum(['agree', 'needsWork']),
});

export const SubmitPriorityVoteSchema = z.object({
  type: z.literal('submit-priority-vote'),
  studentToken: StudentTokenSchema,
  clientMessageId: ClientMessageIdSchema,
  candidateIds: z.array(CandidateIdSchema).min(1).max(20),
});

export const HeartbeatSchema = z.object({
  type: z.literal('heartbeat'),
  studentToken: StudentTokenSchema,
});

export const ClassroomAgreementClientMessageSchema = z.discriminatedUnion('type', [
  JoinSessionSchema,
  SubmitProposalSchema,
  SubmitRefinementVoteSchema,
  SubmitPriorityVoteSchema,
  HeartbeatSchema,
]);

export type ClassroomAgreementClientMessage = z.infer<typeof ClassroomAgreementClientMessageSchema>;

const SentAtSchema = z.object({
  sentAt: z.number().int().positive().optional(),
});

export const SessionJoinedSchema = SentAtSchema.extend({
  type: z.literal('session-joined'),
  protocolVersion: z.literal(CLASSROOM_AGREEMENT_PROTOCOL_VERSION),
  studentToken: StudentTokenSchema,
  displayName: DisplayNameSchema,
  phase: ClassroomAgreementPhaseSchema,
});

export const SessionStateSchema = SentAtSchema.extend({
  type: z.literal('session-state'),
  phase: ClassroomAgreementPhaseSchema,
  state: z.unknown(),
});

export const PhaseChangedSchema = SentAtSchema.extend({
  type: z.literal('phase-changed'),
  phase: ClassroomAgreementPhaseSchema,
});

export const ProposalAcceptedSchema = SentAtSchema.extend({
  type: z.literal('proposal-accepted'),
  proposalId: z.string().min(1).max(100),
});

export const VoteAcceptedSchema = SentAtSchema.extend({
  type: z.literal('vote-accepted'),
  candidateIds: z.array(CandidateIdSchema).min(1).max(20),
});

export const InputRejectedSchema = SentAtSchema.extend({
  type: z.literal('input-rejected'),
  code: z.enum([
    'wrong-phase',
    'proposal-limit',
    'duplicate-vote',
    'priority-vote-limit',
    'invalid-candidate',
    'session-closed',
  ]),
  message: z.string().min(1).max(300),
});

export const ClassroomAgreementErrorSchema = SentAtSchema.extend({
  type: z.literal('error'),
  message: z.string().min(1).max(300),
});

export const ClassroomAgreementClosedSchema = SentAtSchema.extend({
  type: z.literal('closed'),
});

export const ClassroomAgreementServerMessageSchema = z.discriminatedUnion('type', [
  SessionJoinedSchema,
  SessionStateSchema,
  PhaseChangedSchema,
  ProposalAcceptedSchema,
  VoteAcceptedSchema,
  InputRejectedSchema,
  ClassroomAgreementErrorSchema,
  ClassroomAgreementClosedSchema,
]);

export type ClassroomAgreementServerMessage = z.infer<typeof ClassroomAgreementServerMessageSchema>;
