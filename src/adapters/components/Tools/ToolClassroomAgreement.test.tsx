import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import {
  buildFinalItemsFromCandidates,
  buildClassroomAgreementStudentUrl,
  ClassroomAgreementResultView,
  ClassroomAgreementSavedResultsPanel,
  createCandidateFromProposal,
  createClassroomAgreementSession,
  deriveClassroomAgreementTeacherStep,
  formatClassroomAgreementCopyText,
  mergeProposalsIntoCandidate,
  ToolClassroomAgreement,
} from './ToolClassroomAgreement';
import type {
  ClassroomAgreementCandidate,
  ClassroomAgreementProposal,
} from '@domain/entities/ClassroomAgreement';

describe('ToolClassroomAgreement shell', () => {
  it('creates a setup session with finalOnly as the default privacy mode', () => {
    const session = createClassroomAgreementSession(
      {
        title: ' 우리 반 약속 ',
        agreementType: 'class-rule',
        classContext: { kind: 'manual', label: ' 3학년 2반 ' },
        scenes: [' 발표 듣기 ', '모둠 토의'],
        maxProposalsPerStudent: 2,
        priorityVoteLimit: 3,
        allowNickname: true,
        allowProposalsDuringReview: false,
        saveMode: 'finalOnly',
      },
      () => 1234,
      () => 'session-1',
    );

    expect(session).toMatchObject({
      id: 'session-1',
      title: '우리 반 약속',
      agreementType: 'class-rule',
      classContext: { kind: 'manual', label: '3학년 2반' },
      scenes: [
        { id: 'session-1', label: '발표 듣기', order: 1 },
        { id: 'session-1', label: '모둠 토의', order: 2 },
      ],
      activeSceneId: 'session-1',
      phase: 'setup',
      createdAt: 1234,
      updatedAt: 1234,
    });
    expect(session.settings.saveMode).toBe('finalOnly');
    expect(session.settings.maxProposalsPerStudent).toBe(2);
    expect(session.settings.priorityVoteLimit).toBe(3);
  });

  it('maps server phases to focused teacher flow steps', () => {
    const baseSession = createClassroomAgreementSession(
      {
        title: '우리 반 약속',
        agreementType: 'class-rule',
        classContext: { kind: 'manual', label: '3학년 2반' },
        scenes: ['발표 듣기'],
        maxProposalsPerStudent: 2,
        priorityVoteLimit: 3,
        allowNickname: true,
        allowProposalsDuringReview: false,
        saveMode: 'finalOnly',
      },
      () => 1234,
      () => 'session-1',
    );

    expect(deriveClassroomAgreementTeacherStep(null)).toBe('setup');
    expect(deriveClassroomAgreementTeacherStep({ ...baseSession, phase: 'setup' })).toBe('share');
    expect(deriveClassroomAgreementTeacherStep({ ...baseSession, phase: 'collecting' })).toBe(
      'collect',
    );
    expect(deriveClassroomAgreementTeacherStep({ ...baseSession, phase: 'teacherReview' })).toBe(
      'review',
    );
    expect(deriveClassroomAgreementTeacherStep({ ...baseSession, phase: 'refinementVoting' })).toBe(
      'vote',
    );
    expect(deriveClassroomAgreementTeacherStep({ ...baseSession, phase: 'priorityVoting' })).toBe(
      'vote',
    );
    expect(deriveClassroomAgreementTeacherStep({ ...baseSession, phase: 'finalized' })).toBe(
      'final',
    );
  });

  it('builds public student links for the classroom agreement student app mode', () => {
    expect(buildClassroomAgreementStudentUrl('https://example.trycloudflare.com')).toBe(
      'https://example.trycloudflare.com/?tool=classroom-agreement',
    );
    expect(buildClassroomAgreementStudentUrl('https://example.test/student.html?x=1')).toBe(
      'https://example.test/student.html?x=1&tool=classroom-agreement',
    );
  });

  it('renders collaborative non-AI setup copy', () => {
    const html = renderToString(<ToolClassroomAgreement onBack={() => {}} isFullscreen={false} />);

    expect(html).toContain('함께 만드는 실행 문장');
    expect(html).toContain('문장을 대신 만들어 주지 않습니다');
    expect(html).not.toContain('AI 추천');
    expect(html).not.toContain('자동 생성');
  });

  it('promotes a proposal to a rule-checked candidate', () => {
    const proposal = buildProposal('proposal-1', '민수');
    const candidate = createCandidateFromProposal(
      proposal,
      false,
      () => 1000,
      () => 'candidate-1',
    );

    expect(candidate).toMatchObject({
      id: 'candidate-1',
      sourceProposalIds: ['proposal-1'],
      authorLabels: ['민수'],
      showAuthors: false,
      status: 'active',
    });
    expect(candidate.validationIssues).toEqual([]);
  });

  it('merges proposals with author display hidden by default', () => {
    const candidate = mergeProposalsIntoCandidate(
      [buildProposal('proposal-1', '민수'), buildProposal('proposal-2', '지아')],
      () => 1000,
      () => 'candidate-merged',
    );

    expect(candidate.id).toBe('candidate-merged');
    expect(candidate.sourceProposalIds).toEqual(['proposal-1', 'proposal-2']);
    expect(candidate.authorLabels).toEqual(['민수', '지아']);
    expect(candidate.showAuthors).toBe(false);
  });

  it('builds final items by priority votes and strips hidden authors', () => {
    const finalScenes = buildFinalItemsFromCandidates(
      [
        buildCandidate('candidate-low', 'Hidden author', false, 1),
        buildCandidate('candidate-high', 'Visible author', true, 3),
      ],
      [{ id: 'scene-1', label: 'Start', order: 1 }],
    );
    const finalItems = finalScenes[0]!.items;

    expect(finalItems.map((item) => item.id)).toEqual(['candidate-high', 'candidate-low']);
    expect(finalItems.map((item) => item.priorityRank)).toEqual([1, 2]);
    expect(finalItems).toHaveLength(2);
    expect(finalItems[0]!.authorLabels).toEqual(['Visible author']);
    expect(finalItems[1]!.authorLabels).toEqual([]);
  });

  it('keeps author visibility settings in copy and print output', () => {
    const finalItems = buildFinalItemsFromCandidates(
      [
        buildCandidate('candidate-hidden', 'Hidden author', false, 2),
        buildCandidate('candidate-visible', 'Visible author', true, 1),
      ],
      [{ id: 'scene-1', label: 'Start', order: 1 }],
    );

    const copyText = formatClassroomAgreementCopyText(finalItems, 'Class Promise', '3학년 2반');
    const printHtml = renderToString(
      <ClassroomAgreementResultView
        title="Class Promise"
        classContextLabel="3학년 2반"
        view="cards"
        finalScenes={finalItems}
      />,
    );

    expect(copyText).toContain('Visible author');
    expect(copyText).not.toContain('Hidden author');
    expect(printHtml).toContain('Visible author');
    expect(printHtml).not.toContain('Hidden author');
  });

  it('renders saved classroom agreement results so teachers can reopen stored promises', () => {
    const finalItems = buildFinalItemsFromCandidates(
      [buildCandidate('candidate-visible', 'Visible author', true, 2)],
      [{ id: 'scene-1', label: '발표 듣기', order: 1 }],
    );

    const html = renderToString(
      <ClassroomAgreementSavedResultsPanel
        savedSessions={[
          {
            schemaVersion: 2,
            id: 'saved-session-1',
            title: '우리 반 교실 약속',
            agreementType: 'class-rule',
            classContext: { kind: 'manual', label: '3학년 2반' },
            scenes: [{ id: 'scene-1', label: '발표 듣기', order: 1 }],
            saveMode: 'includeProcess',
            finalItems,
            savedAt: new Date('2026-05-27T09:00:00+09:00').getTime(),
            process: {
              participants: [],
              proposals: [buildProposal('proposal-1', '민수')],
              candidates: [],
            },
          },
        ]}
        onDelete={() => {}}
      />,
    );

    expect(html).toContain('저장된 약속');
    expect(html).toContain('우리 반 교실 약속');
    expect(html).toContain('장면');
    expect(html).toContain('발표 듣기');
    expect(html).toContain('과정 포함');
    expect(html).toContain('제안');
    expect(html).toContain('1');
    expect(html).toContain('If candidate-visible happens, we choose one visible action.');
  });
});

function buildProposal(id: string, displayName: string): ClassroomAgreementProposal {
  return {
    id,
    sceneId: 'scene-1',
    studentToken: `${id}-token`,
    displayName,
    ifText: '만약 친구가 발표하고 있으면',
    thenText: '우리는 말을 끊지 않고 메모한다',
    submittedAt: 1000,
  };
}

function buildCandidate(
  id: string,
  authorLabel: string,
  showAuthors: boolean,
  priorityVoteCount: number,
): ClassroomAgreementCandidate {
  return {
    id,
    sceneId: 'scene-1',
    sourceProposalIds: [`${id}-proposal`],
    authorLabels: [authorLabel],
    ifText: `If ${id} happens`,
    thenText: 'we choose one visible action',
    showAuthors,
    validationIssues: [],
    refinementVotes: [],
    priorityVotes: Array.from({ length: priorityVoteCount }, (_, index) => ({
      candidateId: id,
      studentToken: `${id}-voter-${index}`,
      votedAt: 1000 + index,
    })),
    status: 'active',
  };
}
