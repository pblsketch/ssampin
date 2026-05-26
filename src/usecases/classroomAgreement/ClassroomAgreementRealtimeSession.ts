import type {
  AgreementFinalItem,
  ClassroomAgreementCandidate,
  ClassroomAgreementParticipant,
  ClassroomAgreementPhase,
  ClassroomAgreementProposal,
  ClassroomAgreementSession,
  PriorityVote,
  RefinementVote,
} from '@domain/entities/ClassroomAgreement';
import {
  canStudentActInClassroomAgreement,
  reduceClassroomAgreementPhase,
  type ClassroomAgreementTeacherPhaseCommand,
} from '@domain/rules/classroomAgreementPhaseRules';
import type {
  ClassroomAgreementClientMessage,
  ClassroomAgreementServerMessage,
} from '@shared/wsProtocol/classroomAgreement';
import { CLASSROOM_AGREEMENT_PROTOCOL_VERSION } from '@shared/wsProtocol/classroomAgreement';

export interface ClassroomAgreementRealtimeSessionDeps {
  readonly now: () => number;
  readonly makeId: () => string;
  readonly makeStudentToken: () => string;
}

export type ClassroomAgreementTeacherEvent =
  | { readonly type: 'session-state'; readonly session: ClassroomAgreementSession }
  | { readonly type: 'proposal-received'; readonly proposal: ClassroomAgreementProposal }
  | {
      readonly type: 'vote-received';
      readonly voteKind: 'refinement' | 'priority';
      readonly candidateIds: readonly string[];
    }
  | { readonly type: 'phase-changed'; readonly phase: ClassroomAgreementPhase };

export interface ClassroomAgreementMessageResult {
  readonly reply: ClassroomAgreementServerMessage;
  readonly broadcast?: ClassroomAgreementServerMessage;
  readonly teacherEvent?: ClassroomAgreementTeacherEvent;
}

export interface ClassroomAgreementPublicCandidate {
  readonly id: string;
  readonly ifText: string;
  readonly thenText: string;
  readonly showAuthors: boolean;
  readonly authorLabels: readonly string[];
  readonly agreeCount: number;
  readonly needsWorkCount: number;
  readonly priorityVoteCount: number;
  readonly status: ClassroomAgreementCandidate['status'];
}

export interface ClassroomAgreementPublicState {
  readonly id: string;
  readonly title: string;
  readonly agreementType: ClassroomAgreementSession['agreementType'];
  readonly scene: string;
  readonly phase: ClassroomAgreementPhase;
  readonly settings: {
    readonly maxProposalsPerStudent: number;
    readonly priorityVoteLimit: number;
    readonly allowNickname: boolean;
  };
  readonly participantCount: number;
  readonly proposalCount: number;
  readonly candidates: readonly ClassroomAgreementPublicCandidate[];
  readonly finalItems: readonly AgreementFinalItem[];
}

export class ClassroomAgreementRealtimeSession {
  private session: ClassroomAgreementSession;

  constructor(
    initialSession: ClassroomAgreementSession,
    private readonly deps: ClassroomAgreementRealtimeSessionDeps,
  ) {
    this.session = initialSession;
  }

  getSession(): ClassroomAgreementSession {
    return this.session;
  }

  getPublicState(): ClassroomAgreementPublicState {
    return makeClassroomAgreementPublicState(this.session);
  }

  replaceSession(nextSession: ClassroomAgreementSession): void {
    this.session = {
      ...nextSession,
      updatedAt: this.deps.now(),
    };
  }

  applyTeacherPhaseCommand(
    command: ClassroomAgreementTeacherPhaseCommand,
  ): { ok: true; broadcast: ClassroomAgreementServerMessage } | { ok: false; reason: string } {
    const reduced = reduceClassroomAgreementPhase({
      phase: this.session.phase,
      command,
    });
    if (!reduced.accepted) {
      return { ok: false, reason: reduced.reason ?? 'invalid-transition' };
    }

    this.session = {
      ...this.session,
      phase: reduced.phase,
      updatedAt: this.deps.now(),
    };

    return {
      ok: true,
      broadcast: {
        type: 'phase-changed',
        phase: this.session.phase,
      },
    };
  }

  handleClientMessage(msg: ClassroomAgreementClientMessage): ClassroomAgreementMessageResult {
    if (msg.type === 'join-session') {
      return this.handleJoinSession(msg.displayName, msg.previousToken);
    }

    const action = clientMessageToStudentAction(msg.type);
    const gate = canStudentActInClassroomAgreement({
      phase: this.session.phase,
      action,
      settings: this.session.settings,
    });
    if (!gate.accepted) {
      return rejected('wrong-phase', gate.reason ?? 'wrong-phase');
    }

    switch (msg.type) {
      case 'submit-proposal':
        return this.handleSubmitProposal(msg.studentToken, msg.ifText, msg.thenText);
      case 'submit-refinement-vote':
        return this.handleSubmitRefinementVote(msg.studentToken, msg.candidateId, msg.value);
      case 'submit-priority-vote':
        return this.handleSubmitPriorityVote(msg.studentToken, msg.candidateIds);
      case 'heartbeat':
        return this.handleHeartbeat(msg.studentToken);
      default: {
        const exhaustive: never = msg;
        return exhaustive;
      }
    }
  }

  private handleJoinSession(
    displayName: string,
    previousToken: string | undefined,
  ): ClassroomAgreementMessageResult {
    const gate = canStudentActInClassroomAgreement({
      phase: this.session.phase,
      action: 'join-session',
      settings: this.session.settings,
    });
    if (!gate.accepted) {
      return rejected('wrong-phase', gate.reason ?? 'wrong-phase');
    }

    const now = this.deps.now();
    const knownPrevious = previousToken
      ? this.session.participants.find((participant) => participant.studentToken === previousToken)
      : undefined;
    const studentToken = knownPrevious?.studentToken ?? this.deps.makeStudentToken();
    const participant: ClassroomAgreementParticipant = {
      studentToken,
      displayName: displayName.trim(),
      joinedAt: knownPrevious?.joinedAt ?? now,
      lastSeenAt: now,
    };

    this.session = {
      ...this.session,
      participants: [
        participant,
        ...this.session.participants.filter((item) => item.studentToken !== studentToken),
      ],
      updatedAt: now,
    };

    return {
      reply: {
        type: 'session-joined',
        protocolVersion: CLASSROOM_AGREEMENT_PROTOCOL_VERSION,
        studentToken,
        displayName: participant.displayName,
        phase: this.session.phase,
      },
      broadcast: publicStateMessage(this.session),
      teacherEvent: { type: 'session-state', session: this.session },
    };
  }

  private handleSubmitProposal(
    studentToken: string,
    ifText: string,
    thenText: string,
  ): ClassroomAgreementMessageResult {
    if (!this.hasParticipant(studentToken)) {
      return rejected('session-closed', '먼저 활동에 참여해 주세요.');
    }

    const submittedCount = this.session.proposals.filter(
      (proposal) => proposal.studentToken === studentToken,
    ).length;
    if (submittedCount >= this.session.settings.maxProposalsPerStudent) {
      return rejected('proposal-limit', '제안할 수 있는 약속 수를 모두 사용했습니다.');
    }

    const now = this.deps.now();
    const participant = this.requireParticipant(studentToken);
    const proposal: ClassroomAgreementProposal = {
      id: this.deps.makeId(),
      studentToken,
      displayName: participant.displayName,
      ifText: ifText.trim(),
      thenText: thenText.trim(),
      submittedAt: now,
    };

    this.session = {
      ...this.session,
      proposals: [proposal, ...this.session.proposals],
      participants: touchParticipant(this.session.participants, studentToken, now),
      updatedAt: now,
    };

    return {
      reply: {
        type: 'proposal-accepted',
        proposalId: proposal.id,
      },
      broadcast: publicStateMessage(this.session),
      teacherEvent: { type: 'proposal-received', proposal },
    };
  }

  private handleSubmitRefinementVote(
    studentToken: string,
    candidateId: string,
    value: RefinementVote['value'],
  ): ClassroomAgreementMessageResult {
    if (!this.hasParticipant(studentToken)) {
      return rejected('session-closed', '먼저 활동에 참여해 주세요.');
    }
    const candidate = this.findVoteableCandidate(candidateId);
    if (!candidate) {
      return rejected('invalid-candidate', '선택할 수 없는 약속 후보입니다.');
    }
    if (candidate.refinementVotes.some((vote) => vote.studentToken === studentToken)) {
      return rejected('duplicate-vote', '이미 이 약속 후보에 의견을 남겼습니다.');
    }

    const now = this.deps.now();
    const vote: RefinementVote = {
      candidateId,
      studentToken,
      value,
      votedAt: now,
    };
    this.session = updateCandidate(
      this.session,
      candidateId,
      (item) => ({
        ...item,
        refinementVotes: [vote, ...item.refinementVotes],
      }),
      now,
    );

    return {
      reply: { type: 'vote-accepted', candidateIds: [candidateId] },
      broadcast: publicStateMessage(this.session),
      teacherEvent: {
        type: 'vote-received',
        voteKind: 'refinement',
        candidateIds: [candidateId],
      },
    };
  }

  private handleSubmitPriorityVote(
    studentToken: string,
    candidateIds: readonly string[],
  ): ClassroomAgreementMessageResult {
    if (!this.hasParticipant(studentToken)) {
      return rejected('session-closed', '먼저 활동에 참여해 주세요.');
    }

    const uniqueCandidateIds = [...new Set(candidateIds)];
    const invalidCandidateId = uniqueCandidateIds.find((candidateId) => {
      return !this.findVoteableCandidate(candidateId);
    });
    if (invalidCandidateId) {
      return rejected('invalid-candidate', '선택할 수 없는 약속 후보입니다.');
    }

    const existingVotes = this.session.candidates.flatMap((candidate) =>
      candidate.priorityVotes.filter((vote) => vote.studentToken === studentToken),
    );
    const duplicated = uniqueCandidateIds.some((candidateId) =>
      this.session.candidates.some(
        (candidate) =>
          candidate.id === candidateId &&
          candidate.priorityVotes.some((vote) => vote.studentToken === studentToken),
      ),
    );
    if (duplicated) {
      return rejected('duplicate-vote', '이미 선택한 약속 후보가 포함되어 있습니다.');
    }
    if (
      existingVotes.length + uniqueCandidateIds.length >
      this.session.settings.priorityVoteLimit
    ) {
      return rejected('priority-vote-limit', '중요 약속 선택 개수를 초과했습니다.');
    }

    const now = this.deps.now();
    this.session = uniqueCandidateIds.reduce((nextSession, candidateId) => {
      const vote: PriorityVote = {
        candidateId,
        studentToken,
        votedAt: now,
      };
      return updateCandidate(
        nextSession,
        candidateId,
        (item) => ({
          ...item,
          priorityVotes: [vote, ...item.priorityVotes],
        }),
        now,
      );
    }, this.session);

    return {
      reply: { type: 'vote-accepted', candidateIds: uniqueCandidateIds },
      broadcast: publicStateMessage(this.session),
      teacherEvent: {
        type: 'vote-received',
        voteKind: 'priority',
        candidateIds: uniqueCandidateIds,
      },
    };
  }

  private handleHeartbeat(studentToken: string): ClassroomAgreementMessageResult {
    const now = this.deps.now();
    this.session = {
      ...this.session,
      participants: touchParticipant(this.session.participants, studentToken, now),
      updatedAt: now,
    };
    return {
      reply: publicStateMessage(this.session),
      teacherEvent: { type: 'session-state', session: this.session },
    };
  }

  private hasParticipant(studentToken: string): boolean {
    return this.session.participants.some(
      (participant) => participant.studentToken === studentToken,
    );
  }

  private requireParticipant(studentToken: string): ClassroomAgreementParticipant {
    const participant = this.session.participants.find(
      (item) => item.studentToken === studentToken,
    );
    if (!participant) {
      throw new Error('participant not found after hasParticipant check');
    }
    return participant;
  }

  private findVoteableCandidate(candidateId: string): ClassroomAgreementCandidate | undefined {
    return this.session.candidates.find(
      (candidate) => candidate.id === candidateId && candidate.status !== 'removed',
    );
  }
}

export function makeClassroomAgreementPublicState(
  session: ClassroomAgreementSession,
): ClassroomAgreementPublicState {
  return {
    id: session.id,
    title: session.title,
    agreementType: session.agreementType,
    scene: session.scene,
    phase: session.phase,
    settings: {
      maxProposalsPerStudent: session.settings.maxProposalsPerStudent,
      priorityVoteLimit: session.settings.priorityVoteLimit,
      allowNickname: session.settings.allowNickname,
    },
    participantCount: session.participants.length,
    proposalCount: session.proposals.length,
    candidates: session.candidates
      .filter((candidate) => candidate.status !== 'removed')
      .map((candidate) => ({
        id: candidate.id,
        ifText: candidate.ifText,
        thenText: candidate.thenText,
        showAuthors: candidate.showAuthors,
        authorLabels: candidate.showAuthors ? [...candidate.authorLabels] : [],
        agreeCount: candidate.refinementVotes.filter((vote) => vote.value === 'agree').length,
        needsWorkCount: candidate.refinementVotes.filter((vote) => vote.value === 'needsWork')
          .length,
        priorityVoteCount: candidate.priorityVotes.length,
        status: candidate.status,
      })),
    finalItems: session.finalItems.map((item) => ({
      ...item,
      authorLabels: item.showAuthors ? [...item.authorLabels] : [],
    })),
  };
}

function publicStateMessage(session: ClassroomAgreementSession): ClassroomAgreementServerMessage {
  return {
    type: 'session-state',
    phase: session.phase,
    state: makeClassroomAgreementPublicState(session),
  };
}

function rejected(
  code: Extract<ClassroomAgreementServerMessage, { type: 'input-rejected' }>['code'],
  message: string,
): ClassroomAgreementMessageResult {
  return {
    reply: {
      type: 'input-rejected',
      code,
      message,
    },
  };
}

function clientMessageToStudentAction(
  type: Exclude<ClassroomAgreementClientMessage['type'], 'join-session'>,
) {
  switch (type) {
    case 'submit-proposal':
      return 'submit-proposal';
    case 'submit-refinement-vote':
      return 'submit-refinement-vote';
    case 'submit-priority-vote':
      return 'submit-priority-vote';
    case 'heartbeat':
      return 'heartbeat';
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}

function touchParticipant(
  participants: readonly ClassroomAgreementParticipant[],
  studentToken: string,
  lastSeenAt: number,
): readonly ClassroomAgreementParticipant[] {
  return participants.map((participant) =>
    participant.studentToken === studentToken ? { ...participant, lastSeenAt } : participant,
  );
}

function updateCandidate(
  session: ClassroomAgreementSession,
  candidateId: string,
  updater: (candidate: ClassroomAgreementCandidate) => ClassroomAgreementCandidate,
  updatedAt: number,
): ClassroomAgreementSession {
  return {
    ...session,
    candidates: session.candidates.map((candidate) =>
      candidate.id === candidateId ? updater(candidate) : candidate,
    ),
    participants: session.participants,
    updatedAt,
  };
}
