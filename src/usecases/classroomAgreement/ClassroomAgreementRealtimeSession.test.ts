import { describe, expect, it } from 'vitest';
import type {
  ClassroomAgreementCandidate,
  ClassroomAgreementSession,
} from '@domain/entities/ClassroomAgreement';
import { CLASSROOM_AGREEMENT_SCHEMA_VERSION } from '@domain/entities/ClassroomAgreement';
import { ClassroomAgreementRealtimeSession } from './ClassroomAgreementRealtimeSession';
import { CLASSROOM_AGREEMENT_PROTOCOL_VERSION } from '@shared/wsProtocol/classroomAgreement';

const TOKEN_A = '11111111-1111-4111-8111-111111111111';
const TOKEN_B = '22222222-2222-4222-8222-222222222222';

function buildCandidate(id: string): ClassroomAgreementCandidate {
  return {
    id,
    sceneId: 'scene-1',
    sourceProposalIds: [],
    authorLabels: [],
    ifText: `만약 ${id} 상황이면`,
    thenText: '우리는 바로 할 일을 시작한다',
    showAuthors: false,
    validationIssues: [],
    refinementVotes: [],
    priorityVotes: [],
    status: 'active',
  };
}

function buildSession(
  overrides: Partial<ClassroomAgreementSession> = {},
): ClassroomAgreementSession {
  return {
    schemaVersion: CLASSROOM_AGREEMENT_SCHEMA_VERSION,
    id: 'session-1',
    title: '교실 약속',
    agreementType: 'class-rule',
    classContext: { kind: 'manual', label: '3학년 2반' },
    scenes: [{ id: 'scene-1', label: '수업 시작', order: 1 }],
    activeSceneId: 'scene-1',
    phase: 'collecting',
    settings: {
      maxProposalsPerStudent: 1,
      priorityVoteLimit: 2,
      allowNickname: true,
      defaultShowAuthor: false,
      allowProposalsDuringReview: false,
      saveMode: 'finalOnly',
    },
    participants: [],
    proposals: [],
    candidates: [],
    finalItems: [],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function createRuntime(session: ClassroomAgreementSession) {
  let idSeed = 0;
  return new ClassroomAgreementRealtimeSession(session, {
    now: () => 2000 + idSeed,
    makeId: () => `generated-${++idSeed}`,
    makeStudentToken: () => (idSeed === 0 ? TOKEN_A : TOKEN_B),
  });
}

describe('ClassroomAgreementRealtimeSession', () => {
  it('issues a server-side token on join and sends public state without tokens', () => {
    const runtime = createRuntime(buildSession());

    const joined = runtime.handleClientMessage({
      type: 'join-session',
      protocolVersion: CLASSROOM_AGREEMENT_PROTOCOL_VERSION,
      displayName: '민수',
    });

    expect(joined.reply).toMatchObject({
      type: 'session-joined',
      studentToken: TOKEN_A,
      displayName: '민수',
    });
    expect(joined.broadcast?.type).toBe('session-state');
    expect(JSON.stringify(joined.broadcast)).not.toContain('studentToken');
    expect(JSON.stringify(joined.broadcast)).not.toContain(TOKEN_A);
  });

  it('enforces proposal limits by studentToken', () => {
    const runtime = createRuntime(buildSession());
    runtime.handleClientMessage({
      type: 'join-session',
      protocolVersion: CLASSROOM_AGREEMENT_PROTOCOL_VERSION,
      displayName: '민수',
    });

    const first = runtime.handleClientMessage({
      type: 'submit-proposal',
      studentToken: TOKEN_A,
      clientMessageId: 'm1',
      ifText: '만약 수업 시작 종이 울리면',
      thenText: '우리는 자리에 앉아 책과 노트를 펼친다',
    });
    const second = runtime.handleClientMessage({
      type: 'submit-proposal',
      studentToken: TOKEN_A,
      clientMessageId: 'm2',
      ifText: '만약 친구가 발표하고 있으면',
      thenText: '우리는 말을 끊지 않고 메모한다',
    });

    expect(first.reply.type).toBe('proposal-accepted');
    expect(second.reply).toMatchObject({
      type: 'input-rejected',
      code: 'proposal-limit',
    });
    expect(runtime.getSession().proposals).toHaveLength(1);
  });

  it('assigns submitted proposals to the currently active scene', () => {
    const runtime = createRuntime(
      buildSession({
        scenes: [
          { id: 'scene-1', label: '수업 시작', order: 1 },
          { id: 'scene-2', label: '모둠 토의', order: 2 },
        ],
        activeSceneId: 'scene-2',
      }),
    );
    runtime.handleClientMessage({
      type: 'join-session',
      protocolVersion: CLASSROOM_AGREEMENT_PROTOCOL_VERSION,
      displayName: '민수',
    });

    runtime.handleClientMessage({
      type: 'submit-proposal',
      studentToken: TOKEN_A,
      clientMessageId: 'scene-message-1',
      ifText: '만약 모둠 의견이 다르면',
      thenText: '우리는 먼저 상대 의견을 다시 말한다',
    });

    expect(runtime.getSession().proposals[0]!.sceneId).toBe('scene-2');
  });

  it('rejects student input in the wrong phase', () => {
    const runtime = createRuntime(buildSession({ phase: 'teacherReview' }));
    runtime.handleClientMessage({
      type: 'join-session',
      protocolVersion: CLASSROOM_AGREEMENT_PROTOCOL_VERSION,
      displayName: '민수',
    });

    const result = runtime.handleClientMessage({
      type: 'submit-proposal',
      studentToken: TOKEN_A,
      clientMessageId: 'm1',
      ifText: '만약 수업 시작 종이 울리면',
      thenText: '우리는 자리에 앉는다',
    });

    expect(result.reply).toMatchObject({
      type: 'input-rejected',
      code: 'wrong-phase',
    });
  });

  it('rejects proposal messages that use an unissued student token', () => {
    const runtime = createRuntime(buildSession());
    runtime.handleClientMessage({
      type: 'join-session',
      protocolVersion: CLASSROOM_AGREEMENT_PROTOCOL_VERSION,
      displayName: 'student-a',
    });

    const result = runtime.handleClientMessage({
      type: 'submit-proposal',
      studentToken: TOKEN_B,
      clientMessageId: 'forged-1',
      ifText: 'If a forged message arrives',
      thenText: 'we keep the session unchanged',
    });

    expect(result.reply).toMatchObject({
      type: 'input-rejected',
      code: 'session-closed',
    });
    expect(runtime.getSession().proposals).toHaveLength(0);
  });

  it('prevents duplicate refinement votes for the same candidate', () => {
    const runtime = createRuntime(
      buildSession({
        phase: 'refinementVoting',
        participants: [
          {
            studentToken: TOKEN_A,
            displayName: '민수',
            joinedAt: 1000,
            lastSeenAt: 1000,
          },
        ],
        candidates: [buildCandidate('candidate-1')],
      }),
    );

    const first = runtime.handleClientMessage({
      type: 'submit-refinement-vote',
      studentToken: TOKEN_A,
      clientMessageId: 'v1',
      candidateId: 'candidate-1',
      value: 'agree',
    });
    const second = runtime.handleClientMessage({
      type: 'submit-refinement-vote',
      studentToken: TOKEN_A,
      clientMessageId: 'v2',
      candidateId: 'candidate-1',
      value: 'needsWork',
    });

    expect(first.reply.type).toBe('vote-accepted');
    expect(second.reply).toMatchObject({
      type: 'input-rejected',
      code: 'duplicate-vote',
    });
  });

  it('enforces priority vote limits and rejects invalid candidates', () => {
    const runtime = createRuntime(
      buildSession({
        phase: 'priorityVoting',
        participants: [
          {
            studentToken: TOKEN_A,
            displayName: '민수',
            joinedAt: 1000,
            lastSeenAt: 1000,
          },
        ],
        candidates: [
          buildCandidate('candidate-1'),
          buildCandidate('candidate-2'),
          buildCandidate('candidate-3'),
        ],
      }),
    );

    const accepted = runtime.handleClientMessage({
      type: 'submit-priority-vote',
      studentToken: TOKEN_A,
      clientMessageId: 'p1',
      candidateIds: ['candidate-1', 'candidate-2'],
    });
    const overLimit = runtime.handleClientMessage({
      type: 'submit-priority-vote',
      studentToken: TOKEN_A,
      clientMessageId: 'p2',
      candidateIds: ['candidate-3'],
    });
    const invalid = runtime.handleClientMessage({
      type: 'submit-priority-vote',
      studentToken: TOKEN_A,
      clientMessageId: 'p3',
      candidateIds: ['missing'],
    });

    expect(accepted.reply.type).toBe('vote-accepted');
    expect(overLimit.reply).toMatchObject({
      type: 'input-rejected',
      code: 'priority-vote-limit',
    });
    expect(invalid.reply).toMatchObject({
      type: 'input-rejected',
      code: 'invalid-candidate',
    });
  });
});
