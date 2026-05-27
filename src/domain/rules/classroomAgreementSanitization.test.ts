import { describe, expect, it } from 'vitest';
import type { ClassroomAgreementSession } from '@domain/entities/ClassroomAgreement';
import { CLASSROOM_AGREEMENT_SCHEMA_VERSION } from '@domain/entities/ClassroomAgreement';
import { sanitizeClassroomAgreementSessionForSave } from './classroomAgreementSanitization';

const buildSession = (
  overrides: Partial<ClassroomAgreementSession> = {},
): ClassroomAgreementSession => ({
  schemaVersion: CLASSROOM_AGREEMENT_SCHEMA_VERSION,
  id: 'session-1',
  title: '3학년 2반 약속',
  agreementType: 'class-rule',
  classContext: { kind: 'manual', label: '3학년 2반' },
  scenes: [{ id: 'scene-1', label: '발표 듣기', order: 1 }],
  activeSceneId: 'scene-1',
  phase: 'finalized',
  settings: {
    maxProposalsPerStudent: 2,
    priorityVoteLimit: 3,
    allowNickname: true,
    defaultShowAuthor: false,
    allowProposalsDuringReview: false,
    saveMode: 'finalOnly',
  },
  participants: [
    {
      studentToken: 'tok-hidden-a',
      displayName: '숨김학생',
      joinedAt: 1000,
      lastSeenAt: 2000,
    },
    {
      studentToken: 'tok-shown-b',
      displayName: '공개학생',
      joinedAt: 1100,
      lastSeenAt: 2100,
    },
  ],
  proposals: [
    {
      id: 'proposal-1',
      sceneId: 'scene-1',
      studentToken: 'tok-hidden-a',
      displayName: '숨김학생',
      ifText: '만약 친구가 발표하고 있으면',
      thenText: '우리는 말을 끊지 않고 메모한다',
      submittedAt: 1200,
      promotedCandidateId: 'candidate-1',
    },
  ],
  candidates: [
    {
      id: 'candidate-1',
      sceneId: 'scene-1',
      sourceProposalIds: ['proposal-1'],
      authorLabels: ['숨김학생'],
      ifText: '만약 친구가 발표하고 있으면',
      thenText: '우리는 말을 끊지 않고 메모한다',
      showAuthors: false,
      validationIssues: [],
      refinementVotes: [
        {
          candidateId: 'candidate-1',
          studentToken: 'tok-shown-b',
          value: 'agree',
          votedAt: 1300,
        },
      ],
      priorityVotes: [
        {
          candidateId: 'candidate-1',
          studentToken: 'tok-shown-b',
          votedAt: 1400,
        },
      ],
      status: 'finalized',
    },
  ],
  finalItems: [
    {
      sceneId: 'scene-1',
      sceneLabel: '발표 듣기',
      items: [
        {
          id: 'final-hidden-author',
          sceneId: 'scene-1',
          ifText: '만약 친구가 발표하고 있으면',
          thenText: '우리는 말을 끊지 않고 메모한다',
          showAuthors: false,
          authorLabels: ['숨김학생'],
          priorityRank: 1,
        },
        {
          id: 'final-shown-author',
          sceneId: 'scene-1',
          ifText: '만약 모둠 의견이 다르면',
          thenText: '우리는 먼저 상대 의견을 한 문장으로 다시 말한다',
          showAuthors: true,
          authorLabels: ['공개학생'],
          priorityRank: 2,
        },
      ],
    },
  ],
  createdAt: 1000,
  updatedAt: 2000,
  ...overrides,
});

describe('classroomAgreementSanitization', () => {
  it('defaults to finalOnly and strips student process data', () => {
    const saved = sanitizeClassroomAgreementSessionForSave(buildSession(), {
      savedAt: 3000,
    });

    expect(saved.saveMode).toBe('finalOnly');
    expect(saved.savedAt).toBe(3000);
    expect(saved.process).toBeUndefined();
    expect(saved.finalItems[0]!.items[0]!.authorLabels).toEqual([]);
    expect(saved.finalItems[0]!.items[1]!.authorLabels).toEqual(['공개학생']);

    const serialized = JSON.stringify(saved);
    expect(serialized).not.toContain('participants');
    expect(serialized).not.toContain('studentToken');
    expect(serialized).not.toContain('tok-hidden-a');
    expect(serialized).not.toContain('tok-shown-b');
    expect(serialized).not.toContain('proposals');
    expect(serialized).not.toContain('refinementVotes');
    expect(serialized).not.toContain('priorityVotes');
    expect(serialized).not.toContain('숨김학생');
  });

  it('uses explicit finalOnly even when session setting is includeProcess', () => {
    const saved = sanitizeClassroomAgreementSessionForSave(
      buildSession({
        settings: {
          maxProposalsPerStudent: 2,
          priorityVoteLimit: 3,
          allowNickname: true,
          defaultShowAuthor: false,
          allowProposalsDuringReview: false,
          saveMode: 'includeProcess',
        },
      }),
      { saveMode: 'finalOnly', savedAt: 3000 },
    );

    expect(saved.saveMode).toBe('finalOnly');
    expect(saved.process).toBeUndefined();
  });

  it('keeps process data only when includeProcess is explicitly selected', () => {
    const saved = sanitizeClassroomAgreementSessionForSave(buildSession(), {
      saveMode: 'includeProcess',
      savedAt: 3000,
    });

    expect(saved.saveMode).toBe('includeProcess');
    expect(saved.process?.participants).toHaveLength(2);
    expect(saved.process?.proposals).toHaveLength(1);
    expect(saved.process?.candidates[0]?.refinementVotes).toHaveLength(1);
    expect(saved.process?.candidates[0]?.priorityVotes).toHaveLength(1);
    expect(JSON.stringify(saved)).toContain('studentToken');
  });
});
