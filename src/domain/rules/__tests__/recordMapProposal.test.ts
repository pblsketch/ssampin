import { describe, expect, it } from 'vitest';

import type { InquiryThread, NarrativeScene } from '../../entities/InquiryThread';
import type { RecordEvidence } from '../../entities/RecordEvidence';
import {
  RECORD_MAP_PROPOSAL_SCHEMA_VERSION,
  type RecordMapScaffoldPolicy,
  type RecordMapStudentProposal,
} from '../../entities/RecordMapProposal';
import {
  canTransitionRecordMapReview,
  canTransitionRecordMapRun,
  mergeExistingRecordMapScenes,
  validateRecordMapProposal,
} from '../recordMapProposal';

const NOW = 1_700_000_000_000;

const evidence = (id: string, over: Partial<RecordEvidence> = {}): RecordEvidence => ({
  id,
  studentRef: 'student-1',
  classId: 'class-korean',
  areas: ['subject'],
  content: `${id} 관찰`,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const originalScene: NarrativeScene = {
  id: 'scene-existing',
  role: 'motive',
  moduleId: 'issueQuestion',
  label: '질문의 시작',
  note: '교사가 적은 메모',
  noteSource: 'teacher',
  evidenceIds: ['e1'],
};

const thread: InquiryThread = {
  id: 'thread-1',
  studentRef: 'student-1',
  classId: 'class-korean',
  title: '자료 해석',
  keywords: [],
  status: 'open',
  term: '2026-1',
  scenes: [originalScene],
  createdAt: NOW,
  updatedAt: NOW,
};

const fixedPolicy: RecordMapScaffoldPolicy = {
  kind: 'fixed',
  scaffold: {
    id: 'scaffold-fixed',
    name: '질문 중심',
    frame: 'inquiry',
    scenes: [
      { role: 'evaluation', moduleId: 'teacherJudgement' },
      { role: 'motive', moduleId: 'issueQuestion', label: '질문의 시작' },
    ],
  },
};

function fixedProposal(): RecordMapStudentProposal {
  return {
    schemaVersion: RECORD_MAP_PROPOSAL_SCHEMA_VERSION,
    runId: 'run-1',
    attemptId: 'attempt-1',
    context: {
      studentRef: 'student-1',
      classId: 'class-korean',
      subjectId: 'korean',
      area: 'subject',
      term: '2026-1',
    },
    sourceFingerprint: 'fp-1',
    topics: [
      {
        id: 'tmp:1',
        title: '새 주제',
        status: 'open',
        scaffold: { scaffoldId: 'scaffold-fixed' },
        scenes: [
          {
            id: 'tmp-scene:1',
            role: 'evaluation',
            moduleId: 'teacherJudgement',
            evidenceIds: [],
          },
          {
            id: 'tmp-scene:2',
            role: 'motive',
            moduleId: 'issueQuestion',
            label: '질문의 시작',
            evidenceIds: ['e1', 'e2'],
          },
        ],
      },
    ],
    unplacedEvidence: [],
    warnings: [],
    runStatus: 'generated',
    reviewStatus: 'unreviewed',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const codes = (proposal: RecordMapStudentProposal, policy: RecordMapScaffoldPolicy = fixedPolicy) =>
  validateRecordMapProposal({
    proposal,
    evidences: [
      evidence('e1'),
      evidence('e2'),
      evidence('foreign', { studentRef: 'student-2' }),
      evidence('other-area', { areas: ['career'] }),
      evidence('other-class', { classId: 'class-math' }),
    ],
    threads: [thread],
    scaffoldPolicy: policy,
  }).issues.map((issue) => issue.code);

describe('validateRecordMapProposal', () => {
  it('고정 뼈대의 역할·이름·차례와 같은 주제 안 다중 장면 참조를 허용한다', () => {
    const proposal = fixedProposal();
    const topic = proposal.topics[0];
    if (topic === undefined) throw new Error('fixture');
    const next = {
      ...proposal,
      topics: [
        {
          ...topic,
          scenes: [
            { ...topic.scenes[0]!, evidenceIds: ['e1'] },
            { ...topic.scenes[1]!, evidenceIds: ['e1', 'e2'] },
          ],
        },
      ],
    };
    expect(codes(next)).toEqual([]);
  });

  it('고정 뼈대 장면을 추가·삭제·재정렬하거나 이름을 바꾸면 막는다', () => {
    const proposal = fixedProposal();
    const topic = proposal.topics[0]!;
    const changed = {
      ...proposal,
      topics: [
        {
          ...topic,
          scenes: [{ ...topic.scenes[1]!, label: 'AI가 바꾼 이름' }, topic.scenes[0]!],
        },
      ],
    };
    expect(codes(changed)).toContain('scaffold-shape-changed');
  });

  it('AI 뼈대는 허용 후보만 받고 선택·부적합 이유를 요구한다', () => {
    const proposal = fixedProposal();
    const topic = proposal.topics[0]!;
    const aiPolicy: RecordMapScaffoldPolicy = {
      kind: 'ai',
      candidates: [fixedPolicy.kind === 'fixed' ? fixedPolicy.scaffold : neverScaffold()],
    };
    const arbitrary = {
      ...proposal,
      topics: [{ ...topic, scaffold: { scaffoldId: 'made-up' } }],
    };
    expect(codes(arbitrary, aiPolicy)).toEqual(
      expect.arrayContaining(['unknown-scaffold', 'missing-scaffold-reason']),
    );

    const noFit = {
      ...proposal,
      topics: [
        { ...topic, scaffold: { scaffoldId: null, reason: '1번 근거에 맞는 후보가 없습니다.' } },
      ],
    };
    expect(codes(noFit, aiPolicy)).toContain('scaffold-required');
    expect(codes(noFit, aiPolicy)).not.toContain('missing-scaffold-reason');
  });

  it('타학생·타수업반·타영역 근거와 알 수 없는 근거를 모두 막는다', () => {
    const proposal = fixedProposal();
    const topic = proposal.topics[0]!;
    const changed = {
      ...proposal,
      topics: [
        {
          ...topic,
          scenes: [
            topic.scenes[0]!,
            {
              ...topic.scenes[1]!,
              evidenceIds: ['foreign', 'other-class', 'other-area', 'missing'],
            },
          ],
        },
      ],
    };
    expect(codes(changed)).toEqual(
      expect.arrayContaining([
        'student-boundary',
        'class-boundary',
        'area-boundary',
        'unknown-evidence',
      ]),
    );
  });

  it('한 근거의 주제 중복 소속과 배치·자리 미정 중복을 막는다', () => {
    const proposal = fixedProposal();
    const first = proposal.topics[0]!;
    const changed = {
      ...proposal,
      topics: [
        first,
        {
          ...first,
          id: 'tmp:2',
          scenes: first.scenes.map((scene) => ({ ...scene, id: `${scene.id}-2` })),
        },
      ],
      unplacedEvidence: [{ evidenceId: 'e1', reason: '애매함' }],
    };
    expect(codes(changed)).toEqual(
      expect.arrayContaining(['duplicate-evidence-owner', 'placed-and-unplaced']),
    );
  });

  it('제안 밖 주제 연결과 주제 순환을 막는다', () => {
    const proposal = fixedProposal();
    const first = proposal.topics[0]!;
    const second = {
      ...first,
      id: 'tmp:2',
      scenes: first.scenes.map((scene) => ({ ...scene, id: `${scene.id}-2`, evidenceIds: [] })),
      link: { fromTopicId: 'tmp:1' },
    };
    const cycle = {
      ...proposal,
      topics: [{ ...first, link: { fromTopicId: 'tmp:2' } }, second],
    };
    expect(codes(cycle)).toContain('topic-cycle');
    expect(
      codes({ ...proposal, topics: [{ ...first, link: { fromTopicId: 'outside' } }] }),
    ).toContain('unknown-link-topic');
  });

  it('기존 구성 유지에서는 기존 장면 구조와 놓인 근거를 바꾸지 못한다', () => {
    const existingPolicy: RecordMapScaffoldPolicy = {
      kind: 'existing',
      defaultScaffold: fixedPolicy.kind === 'fixed' ? fixedPolicy.scaffold : neverScaffold(),
    };
    const proposal = fixedProposal();
    const changed = {
      ...proposal,
      topics: [
        {
          id: 'tmp:existing',
          existingThreadId: 'thread-1',
          title: thread.title,
          status: 'open' as const,
          scaffold: { scaffoldId: null },
          scenes: [{ ...originalScene, role: 'result' as const }],
        },
      ],
    };
    expect(codes(changed, existingPolicy)).toContain('existing-scene-changed');
  });

  it('실제 existing 응답처럼 교사 메타데이터가 없어도 통과하고 병합 때 원본을 보존한다', () => {
    const existingPolicy: RecordMapScaffoldPolicy = {
      kind: 'existing',
      defaultScaffold: fixedPolicy.kind === 'fixed' ? fixedPolicy.scaffold : neverScaffold(),
    };
    const existingWithMetadata: NarrativeScene = {
      ...originalScene,
      leadIn: '앞 장면에서 이어짐',
      leadInNeedsCheck: true,
      evidenceFocus: [{ evidenceId: 'e1', note: '질문 부분을 사용' }],
    };
    const sourceThread: InquiryThread = { ...thread, scenes: [existingWithMetadata] };
    const proposal = fixedProposal();
    const liveResponse = {
      ...proposal,
      topics: [
        {
          id: 'tmp:existing',
          existingThreadId: 'thread-1',
          title: thread.title,
          status: 'open' as const,
          scaffold: { scaffoldId: null },
          scenes: [
            {
              id: originalScene.id,
              role: originalScene.role,
              moduleId: originalScene.moduleId,
              label: originalScene.label,
              note: 'AI가 반환한 설명',
              evidenceIds: ['e1', 'e2'],
            },
          ],
        },
      ],
    };
    const validation = validateRecordMapProposal({
      proposal: liveResponse,
      evidences: [evidence('e1', { threadId: 'thread-1' }), evidence('e2')],
      threads: [sourceThread],
      scaffoldPolicy: existingPolicy,
    });
    expect(validation.issues.map((issue) => issue.code)).not.toContain('existing-scene-changed');

    const merged = mergeExistingRecordMapScenes(
      sourceThread.scenes ?? [],
      liveResponse.topics[0]?.scenes ?? [],
    );
    expect(merged[0]).toEqual({ ...existingWithMetadata, evidenceIds: ['e1', 'e2'] });
    expect(merged[0]?.note).toBe('교사가 적은 메모');
    expect(merged[0]?.noteSource).toBe('teacher');
    expect(merged[0]?.leadInNeedsCheck).toBe(true);
    expect(merged[0]?.evidenceFocus).toEqual([{ evidenceId: 'e1', note: '질문 부분을 사용' }]);
  });

  it('기존 구성 유지에서는 근거의 현재 주제 소속과 기본 뼈대 후보를 우회하지 못한다', () => {
    const existingPolicy: RecordMapScaffoldPolicy = {
      kind: 'existing',
      defaultScaffold: fixedPolicy.kind === 'fixed' ? fixedPolicy.scaffold : neverScaffold(),
    };
    const proposal = fixedProposal();
    const topic = proposal.topics[0]!;
    const moved = {
      ...proposal,
      topics: [
        {
          ...topic,
          scaffold: { scaffoldId: 'made-up' },
          scenes: topic.scenes.map((scene) => ({
            ...scene,
            evidenceIds: scene.evidenceIds.includes('e1') ? ['owned'] : scene.evidenceIds,
          })),
        },
      ],
    };
    const result = validateRecordMapProposal({
      proposal: moved,
      evidences: [evidence('owned', { threadId: 'thread-1' }), evidence('e2')],
      threads: [thread],
      scaffoldPolicy: existingPolicy,
    });
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['evidence-owner-changed', 'unknown-scaffold']),
    );
  });
});

describe('지도 제안 상태 전이', () => {
  it('실패·중단은 대기로 재시도하고 생성 완료는 되돌리지 않는다', () => {
    expect(canTransitionRecordMapRun('failed', 'queued')).toBe(true);
    expect(canTransitionRecordMapRun('cancelled', 'queued')).toBe(true);
    expect(canTransitionRecordMapRun('generated', 'queued')).toBe(false);
  });

  it('검토 완료 뒤에만 적용으로 가며 저장 실패는 재시도할 수 있다', () => {
    expect(canTransitionRecordMapReview('unreviewed', 'applying')).toBe(false);
    expect(canTransitionRecordMapReview('reviewed', 'applying')).toBe(true);
    expect(canTransitionRecordMapReview('save-failed', 'applying')).toBe(true);
  });
});

describe('record map proposal completeness', () => {
  it('requires every included request evidence to appear in a topic or unplaced list', () => {
    const source = fixedProposal();
    const proposal = {
      ...source,
      requestEvidence: {
        includedEvidenceIds: ['e1', 'e3'],
        excludedCounts: { teacher: 1, empty: 0, prohibited: 0, tooLong: 2 },
        suppressedMemoCount: 1,
      },
    };
    const result = validateRecordMapProposal({
      proposal,
      evidences: [evidence('e1'), evidence('e2'), evidence('e3')],
      threads: [],
      scaffoldPolicy: fixedPolicy,
    });

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'missing-included-evidence',
        evidenceId: 'e3',
      }),
    );
  });

  it('accepts AI scaffold null during generation but still blocks application', () => {
    const source = fixedProposal();
    const aiPolicy: RecordMapScaffoldPolicy = {
      kind: 'ai',
      candidates: fixedPolicy.kind === 'fixed' ? [fixedPolicy.scaffold] : [],
    };
    const proposal = {
      ...source,
      topics: source.topics.map((topic) => ({
        ...topic,
        scaffold: { scaffoldId: null, reason: '맞는 뼈대가 없어 직접 선택이 필요합니다.' },
      })),
    };

    const generated = validateRecordMapProposal({
      proposal,
      evidences: [evidence('e1')],
      threads: [],
      scaffoldPolicy: aiPolicy,
      phase: 'generation',
    });
    const applying = validateRecordMapProposal({
      proposal,
      evidences: [evidence('e1')],
      threads: [],
      scaffoldPolicy: aiPolicy,
    });

    expect(generated.issues.map((issue) => issue.code)).not.toContain('scaffold-required');
    expect(generated.issues.map((issue) => issue.code)).not.toContain('unknown-scaffold');
    expect(applying.issues.map((issue) => issue.code)).toContain('scaffold-required');
  });
});

function neverScaffold(): never {
  throw new Error('unreachable');
}
