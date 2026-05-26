import type {
  ClassroomAgreementPhase,
  ClassroomAgreementSettings,
} from '@domain/entities/ClassroomAgreement';

export type ClassroomAgreementStudentAction =
  | 'join-session'
  | 'submit-proposal'
  | 'submit-refinement-vote'
  | 'submit-priority-vote'
  | 'heartbeat';

export type ClassroomAgreementTeacherPhaseCommand =
  | 'start-collecting'
  | 'start-teacher-review'
  | 'start-refinement-voting'
  | 'start-priority-voting'
  | 'finalize';

export interface ClassroomAgreementStudentActionInput {
  readonly phase: ClassroomAgreementPhase;
  readonly action: ClassroomAgreementStudentAction;
  readonly settings: Pick<ClassroomAgreementSettings, 'allowProposalsDuringReview'>;
}

export interface ClassroomAgreementActionDecision {
  readonly accepted: boolean;
  readonly reason?: 'wrong-phase';
}

export interface ClassroomAgreementPhaseTransitionInput {
  readonly phase: ClassroomAgreementPhase;
  readonly command: ClassroomAgreementTeacherPhaseCommand;
}

export interface ClassroomAgreementPhaseTransitionResult {
  readonly accepted: boolean;
  readonly phase: ClassroomAgreementPhase;
  readonly reason?: 'invalid-transition';
}

const ACTIVE_PHASES: ReadonlySet<ClassroomAgreementPhase> = new Set([
  'setup',
  'collecting',
  'teacherReview',
  'refinementVoting',
  'priorityVoting',
  'finalized',
]);

function accept(): ClassroomAgreementActionDecision {
  return { accepted: true };
}

function reject(): ClassroomAgreementActionDecision {
  return { accepted: false, reason: 'wrong-phase' };
}

export function canStudentActInClassroomAgreement(
  input: ClassroomAgreementStudentActionInput,
): ClassroomAgreementActionDecision {
  const { phase, action, settings } = input;

  if (action === 'join-session') {
    return ACTIVE_PHASES.has(phase) ? accept() : reject();
  }

  if (action === 'heartbeat') {
    return ACTIVE_PHASES.has(phase) ? accept() : reject();
  }

  if (action === 'submit-proposal') {
    if (phase === 'collecting') return accept();
    if (phase === 'teacherReview' && settings.allowProposalsDuringReview) return accept();
    return reject();
  }

  if (action === 'submit-refinement-vote') {
    return phase === 'refinementVoting' ? accept() : reject();
  }

  if (action === 'submit-priority-vote') {
    return phase === 'priorityVoting' ? accept() : reject();
  }

  const exhaustive: never = action;
  return exhaustive;
}

export function reduceClassroomAgreementPhase(
  input: ClassroomAgreementPhaseTransitionInput,
): ClassroomAgreementPhaseTransitionResult {
  const next = getNextPhase(input.phase, input.command);
  if (!next) {
    return { accepted: false, phase: input.phase, reason: 'invalid-transition' };
  }
  return { accepted: true, phase: next };
}

function getNextPhase(
  phase: ClassroomAgreementPhase,
  command: ClassroomAgreementTeacherPhaseCommand,
): ClassroomAgreementPhase | null {
  if (phase === 'setup' && command === 'start-collecting') return 'collecting';
  if (phase === 'collecting' && command === 'start-teacher-review') return 'teacherReview';
  if (phase === 'teacherReview' && command === 'start-collecting') return 'collecting';
  if (phase === 'teacherReview' && command === 'start-refinement-voting') {
    return 'refinementVoting';
  }
  if (phase === 'refinementVoting' && command === 'start-teacher-review') {
    return 'teacherReview';
  }
  if (phase === 'priorityVoting' && command === 'start-teacher-review') {
    return 'teacherReview';
  }
  if (phase === 'refinementVoting' && command === 'start-priority-voting') {
    return 'priorityVoting';
  }
  if (phase === 'teacherReview' && command === 'start-priority-voting') return 'priorityVoting';
  if (phase === 'priorityVoting' && command === 'finalize') return 'finalized';
  return null;
}
