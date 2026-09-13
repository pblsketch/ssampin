/**
 * 임시 근거 지도 제안 검증과 상태 전이.
 *
 * 잘못된 AI 답을 일부만 적용하지 않는다. 학생 한 명의 전체 제안을 검사해 오류가 하나라도 있으면
 * 그 학생의 적용을 막고, 다른 학생의 제안에는 영향을 주지 않는다.
 *
 * 이 파일은 도메인이다. 외부 의존성 import 금지.
 */
import type { InquiryThread, NarrativeScene } from '../entities/InquiryThread';
import type { RecordEvidence } from '../entities/RecordEvidence';
import { evidenceInArea } from '../entities/RecordEvidence';
import type {
  RecordMapReviewStatus,
  RecordMapRunStatus,
  RecordMapScaffoldPolicy,
  RecordMapScaffoldSnapshot,
  RecordMapStudentProposal,
  RecordMapTemporaryTopic,
} from '../entities/RecordMapProposal';
import { frameForArea, moduleFitsSlot, type RecordScaffoldScene } from './narrativeFrames';

export type RecordMapValidationCode =
  | 'student-boundary'
  | 'class-boundary'
  | 'area-boundary'
  | 'term-boundary'
  | 'unknown-thread'
  | 'duplicate-existing-thread'
  | 'duplicate-topic-id'
  | 'duplicate-scene-id'
  | 'unknown-evidence'
  | 'duplicate-evidence-owner'
  | 'placed-and-unplaced'
  | 'unknown-link-topic'
  | 'topic-cycle'
  | 'invalid-scene-module'
  | 'scaffold-required'
  | 'unknown-scaffold'
  | 'scaffold-shape-changed'
  | 'evidence-owner-changed'
  | 'existing-topic-changed'
  | 'existing-scene-changed'
  | 'missing-scaffold-reason'
  | 'missing-included-evidence'
  | 'duplicate-unplaced-evidence';

export interface RecordMapValidationIssue {
  readonly code: RecordMapValidationCode;
  readonly topicId?: string;
  readonly sceneId?: string;
  readonly evidenceId?: string;
  readonly message: string;
}

export interface RecordMapValidationInput {
  readonly proposal: RecordMapStudentProposal;
  /** 현재 저장된 전체 근거를 넘겨 타학생·타영역 참조도 검출한다. */
  readonly evidences: readonly RecordEvidence[];
  /** 현재 저장된 전체 주제를 넘겨 타학생·타수업반 참조도 검출한다. */
  readonly threads: readonly InquiryThread[];
  readonly scaffoldPolicy: RecordMapScaffoldPolicy;
  /** Generation accepts an explicit AI decision that manual scaffold selection is required. */
  readonly phase?: 'generation' | 'application';
}

export interface RecordMapValidationResult {
  readonly ok: boolean;
  readonly issues: readonly RecordMapValidationIssue[];
}

function sameOptional(left: string | undefined, right: string | undefined): boolean {
  return (left ?? '') === (right ?? '');
}

function sameScaffoldScene(left: RecordScaffoldScene, right: RecordScaffoldScene): boolean {
  return (
    left.role === right.role &&
    sameOptional(left.moduleId, right.moduleId) &&
    sameOptional(left.label, right.label)
  );
}

function scaffoldShapeMatches(
  scenes: readonly NarrativeScene[],
  scaffold: RecordMapScaffoldSnapshot,
): boolean {
  return (
    scenes.length === scaffold.scenes.length &&
    scenes.every((scene, index) => {
      const expected = scaffold.scenes[index];
      return expected !== undefined && sameScaffoldScene(scene, expected);
    })
  );
}

/**
 * 기존 구성 정책에서 AI가 바꿀 수 있는 장면 구조와 기존 근거 위치만 검사한다.
 * 교사 메타데이터는 AI 응답 계약에 없고 적용 시 원본에서 보존한다.
 */
function existingScenesPreserved(
  proposed: readonly NarrativeScene[],
  existing: readonly NarrativeScene[],
): boolean {
  if (proposed.length !== existing.length) return false;
  return existing.every((before, index) => {
    const after = proposed[index];
    if (after === undefined) return false;
    return (
      before.id === after.id &&
      before.role === after.role &&
      sameOptional(before.moduleId, after.moduleId) &&
      sameOptional(before.label, after.label) &&
      before.evidenceIds.every((id) => after.evidenceIds.includes(id))
    );
  });
}

/** 기존 정책 적용 계획용 병합. AI 제안에서는 근거 ID만 받고 교사 메타데이터와 구조는 보존한다. */
export function mergeExistingRecordMapScenes(
  existing: readonly NarrativeScene[],
  proposed: readonly NarrativeScene[],
): readonly NarrativeScene[] {
  const proposedById = new Map(proposed.map((scene) => [scene.id, scene]));
  return existing.map((scene) => {
    const suggestion = proposedById.get(scene.id);
    if (suggestion === undefined) return scene;
    return {
      ...scene,
      evidenceIds: [...new Set([...scene.evidenceIds, ...suggestion.evidenceIds])],
    };
  });
}

function scaffoldForTopic(
  topic: RecordMapTemporaryTopic,
  policy: RecordMapScaffoldPolicy,
): RecordMapScaffoldSnapshot | null {
  if (policy.kind === 'fixed') {
    return topic.scaffold.scaffoldId === policy.scaffold.id ? policy.scaffold : null;
  }
  if (policy.kind === 'ai') {
    if (topic.scaffold.scaffoldId === null) return null;
    return (
      policy.candidates.find((candidate) => candidate.id === topic.scaffold.scaffoldId) ?? null
    );
  }
  return topic.existingThreadId === undefined &&
    topic.scaffold.scaffoldId === policy.defaultScaffold.id
    ? policy.defaultScaffold
    : null;
}

function hasCycle(topics: readonly RecordMapTemporaryTopic[]): boolean {
  const parentById = new Map<string, string>();
  for (const topic of topics) {
    if (topic.link !== undefined) parentById.set(topic.id, topic.link.fromTopicId);
  }
  for (const topic of topics) {
    const seen = new Set<string>();
    let cursor: string | undefined = topic.id;
    while (cursor !== undefined) {
      if (seen.has(cursor)) return true;
      seen.add(cursor);
      cursor = parentById.get(cursor);
    }
  }
  return false;
}

export function validateRecordMapProposal(
  input: RecordMapValidationInput,
): RecordMapValidationResult {
  const { proposal, evidences, threads, scaffoldPolicy } = input;
  const issues: RecordMapValidationIssue[] = [];
  const context = proposal.context;
  const evidenceById = new Map(evidences.map((evidence) => [evidence.id, evidence]));
  const threadById = new Map(threads.map((thread) => [thread.id, thread]));
  const topicIds = new Set<string>();
  const sceneIds = new Set<string>();
  const ownerByEvidence = new Map<string, string>();
  const existingThreadIds = new Set<string>();

  for (const topic of proposal.topics) {
    if (topicIds.has(topic.id)) {
      issues.push({
        code: 'duplicate-topic-id',
        topicId: topic.id,
        message: '주제 ID가 겹칩니다.',
      });
    }
    topicIds.add(topic.id);
  }
  const existingIdByTopicId = new Map(
    proposal.topics.map((topic) => [topic.id, topic.existingThreadId ?? topic.id]),
  );

  for (const topic of proposal.topics) {
    const existing =
      topic.existingThreadId === undefined ? undefined : threadById.get(topic.existingThreadId);
    if (topic.existingThreadId !== undefined) {
      if (existingThreadIds.has(topic.existingThreadId)) {
        issues.push({
          code: 'duplicate-existing-thread',
          topicId: topic.id,
          message: '같은 기존 주제를 제안에서 두 번 사용할 수 없습니다.',
        });
      }
      existingThreadIds.add(topic.existingThreadId);
    }
    if (topic.existingThreadId !== undefined && existing === undefined) {
      issues.push({
        code: 'unknown-thread',
        topicId: topic.id,
        message: '원본 주제를 찾을 수 없습니다.',
      });
    }
    if (existing !== undefined) {
      if (existing.studentRef !== context.studentRef) {
        issues.push({
          code: 'student-boundary',
          topicId: topic.id,
          message: '다른 학생의 주제입니다.',
        });
      }
      if (!sameOptional(existing.classId, context.classId)) {
        issues.push({
          code: 'class-boundary',
          topicId: topic.id,
          message: '다른 수업반의 주제입니다.',
        });
      }
      if (
        existing.term !== undefined &&
        context.term !== undefined &&
        existing.term !== context.term
      ) {
        issues.push({
          code: 'term-boundary',
          topicId: topic.id,
          message: '다른 학기의 주제입니다.',
        });
      }
      if (
        (scaffoldPolicy.kind === 'existing' || existing.status === 'closed') &&
        (topic.title !== existing.title ||
          topic.status !== existing.status ||
          (topic.link !== undefined &&
            (!sameOptional(
              existingIdByTopicId.get(topic.link.fromTopicId),
              existing.link?.fromThreadId,
            ) ||
              !sameOptional(topic.link.note, existing.link?.note))))
      ) {
        issues.push({
          code: 'existing-topic-changed',
          topicId: topic.id,
          message: '기존 주제의 이름 또는 상태가 바뀌었습니다.',
        });
      }
    }

    const expectedFrame = frameForArea(context.area);
    for (const scene of topic.scenes) {
      if (sceneIds.has(scene.id)) {
        issues.push({
          code: 'duplicate-scene-id',
          topicId: topic.id,
          sceneId: scene.id,
          message: '장면 ID가 겹칩니다.',
        });
      }
      sceneIds.add(scene.id);
      if (
        scene.moduleId !== undefined &&
        !moduleFitsSlot(expectedFrame, scene.role, scene.moduleId)
      ) {
        issues.push({
          code: 'invalid-scene-module',
          topicId: topic.id,
          sceneId: scene.id,
          message: '현재 영역의 이 자리에 놓을 수 없는 카테고리입니다.',
        });
      }
      for (const evidenceId of new Set(scene.evidenceIds)) {
        const evidence = evidenceById.get(evidenceId);
        if (evidence === undefined) {
          issues.push({
            code: 'unknown-evidence',
            topicId: topic.id,
            sceneId: scene.id,
            evidenceId,
            message: '근거를 찾을 수 없습니다.',
          });
          continue;
        }
        if (evidence.studentRef !== context.studentRef) {
          issues.push({
            code: 'student-boundary',
            topicId: topic.id,
            evidenceId,
            message: '다른 학생의 근거입니다.',
          });
        }
        if (!sameOptional(evidence.classId, context.classId)) {
          issues.push({
            code: 'class-boundary',
            topicId: topic.id,
            evidenceId,
            message: '다른 수업반의 근거입니다.',
          });
        }
        if (
          !evidenceInArea(evidence, context.area) &&
          !(
            scaffoldPolicy.kind === 'existing' &&
            existing !== undefined &&
            evidence.threadId === existing.id &&
            existing.scenes?.some(
              (original) => original.id === scene.id && original.evidenceIds.includes(evidenceId),
            )
          )
        ) {
          issues.push({
            code: 'area-boundary',
            topicId: topic.id,
            evidenceId,
            message: '다른 생기부 영역의 근거입니다.',
          });
        }
        if (
          scaffoldPolicy.kind === 'existing' &&
          evidence.threadId !== undefined &&
          evidence.threadId !== topic.existingThreadId
        ) {
          issues.push({
            code: 'evidence-owner-changed',
            topicId: topic.id,
            evidenceId,
            message: '기존 주제에 속한 근거를 다른 주제로 옮길 수 없습니다.',
          });
        }
        const owner = ownerByEvidence.get(evidenceId);
        if (owner !== undefined && owner !== topic.id) {
          issues.push({
            code: 'duplicate-evidence-owner',
            topicId: topic.id,
            evidenceId,
            message: '한 근거가 여러 주제에 속해 있습니다.',
          });
        } else {
          ownerByEvidence.set(evidenceId, topic.id);
        }
      }
    }

    if (
      existing !== undefined &&
      (scaffoldPolicy.kind === 'existing' || existing.status === 'closed')
    ) {
      if (!existingScenesPreserved(topic.scenes, existing.scenes ?? [])) {
        issues.push({
          code: 'existing-scene-changed',
          topicId: topic.id,
          message: '기존 장면의 이름·역할·차례·교사 메모 또는 배치가 바뀌었습니다.',
        });
      }
    } else {
      const scaffold = scaffoldForTopic(topic, scaffoldPolicy);
      if (topic.scaffold.scaffoldId === null) {
        if (input.phase === 'generation') {
          // A null AI choice is a reviewable proposal, but application still requires a scaffold.
        } else {
          issues.push({
            code: 'scaffold-required',
            topicId: topic.id,
            message: '적용 전에 뼈대를 직접 골라야 합니다.',
          });
        }
      } else if (scaffold === null) {
        issues.push({
          code: 'unknown-scaffold',
          topicId: topic.id,
          message: '시작할 때 허용한 뼈대 후보가 아닙니다.',
        });
      } else if (!scaffoldShapeMatches(topic.scenes, scaffold)) {
        issues.push({
          code: 'scaffold-shape-changed',
          topicId: topic.id,
          message: '뼈대의 장면 이름·역할·차례가 바뀌었습니다.',
        });
      }
      if (scaffoldPolicy.kind === 'ai' && (topic.scaffold.reason?.trim() ?? '').length === 0) {
        issues.push({
          code: 'missing-scaffold-reason',
          topicId: topic.id,
          message: 'AI의 뼈대 선택 또는 부적합 이유가 없습니다.',
        });
      }
    }
  }

  for (const item of proposal.unplacedEvidence) {
    if (
      proposal.unplacedEvidence.filter((candidate) => candidate.evidenceId === item.evidenceId)
        .length > 1
    ) {
      issues.push({
        code: 'duplicate-unplaced-evidence',
        evidenceId: item.evidenceId,
        message: '같은 근거가 자리 미정 목록에 여러 번 들어 있습니다.',
      });
    }
    const evidence = evidenceById.get(item.evidenceId);
    if (evidence === undefined) {
      issues.push({
        code: 'unknown-evidence',
        evidenceId: item.evidenceId,
        message: '자리 미정 근거를 찾을 수 없습니다.',
      });
    } else if (evidence.studentRef !== context.studentRef) {
      issues.push({
        code: 'student-boundary',
        evidenceId: item.evidenceId,
        message: '다른 학생의 근거입니다.',
      });
    } else if (!sameOptional(evidence.classId, context.classId)) {
      issues.push({
        code: 'class-boundary',
        evidenceId: item.evidenceId,
        message: '다른 수업반의 근거입니다.',
      });
    } else if (!evidenceInArea(evidence, context.area)) {
      issues.push({
        code: 'area-boundary',
        evidenceId: item.evidenceId,
        message: '다른 생기부 영역의 근거입니다.',
      });
    }
    if (ownerByEvidence.has(item.evidenceId)) {
      issues.push({
        code: 'placed-and-unplaced',
        evidenceId: item.evidenceId,
        message: '같은 근거가 배치와 자리 미정에 함께 있습니다.',
      });
    }
  }

  for (const evidenceId of proposal.requestEvidence?.includedEvidenceIds ?? []) {
    const placed = ownerByEvidence.has(evidenceId);
    const unplaced = proposal.unplacedEvidence.some((item) => item.evidenceId === evidenceId);
    if (placed === unplaced) {
      issues.push({
        code: 'missing-included-evidence',
        evidenceId,
        message: placed
          ? 'AI에 보낸 근거가 배치와 자리 미정에 동시에 들어 있습니다.'
          : 'AI에 보낸 근거가 제안 결과에서 빠졌습니다.',
      });
    }
  }

  for (const topic of proposal.topics) {
    if (topic.link !== undefined && !topicIds.has(topic.link.fromTopicId)) {
      issues.push({
        code: 'unknown-link-topic',
        topicId: topic.id,
        message: '제안 밖의 주제로 연결할 수 없습니다.',
      });
    }
  }
  if (hasCycle(proposal.topics)) {
    issues.push({ code: 'topic-cycle', message: '주제 연결이 순환합니다.' });
  }

  return { ok: issues.length === 0, issues };
}

const RUN_TRANSITIONS: Readonly<Record<RecordMapRunStatus, readonly RecordMapRunStatus[]>> = {
  queued: ['generating', 'skipped', 'cancelled'],
  generating: ['generated', 'failed', 'cancelled'],
  generated: [],
  failed: ['queued'],
  skipped: ['queued'],
  cancelled: ['queued'],
};

const REVIEW_TRANSITIONS: Readonly<
  Record<RecordMapReviewStatus, readonly RecordMapReviewStatus[]>
> = {
  unreviewed: ['reviewed', 'held', 'source-changed'],
  reviewed: ['unreviewed', 'held', 'source-changed', 'applying'],
  held: ['unreviewed', 'source-changed'],
  'source-changed': ['unreviewed'],
  applying: ['applied', 'save-failed', 'source-changed'],
  applied: [],
  'save-failed': ['applying', 'source-changed'],
};

export function canTransitionRecordMapRun(
  from: RecordMapRunStatus,
  to: RecordMapRunStatus,
): boolean {
  return from === to || RUN_TRANSITIONS[from].includes(to);
}

export function canTransitionRecordMapReview(
  from: RecordMapReviewStatus,
  to: RecordMapReviewStatus,
): boolean {
  return from === to || REVIEW_TRANSITIONS[from].includes(to);
}

export interface RecordMapChangeSummary {
  readonly addedTopics: number;
  readonly changedTopics: number;
  readonly addedScenes: number;
  readonly assignedEvidence: number;
  readonly changedTopicLinks: number;
}

/** 검토 화면의 변경 요약. 좌표는 의미 변경에 포함하지 않는다. */
export function summarizeRecordMapChanges(
  proposal: RecordMapStudentProposal,
  threads: readonly InquiryThread[],
): RecordMapChangeSummary {
  const existingById = new Map(threads.map((thread) => [thread.id, thread]));
  let addedTopics = 0;
  let changedTopics = 0;
  let addedScenes = 0;
  let assignedEvidence = 0;
  let changedTopicLinks = 0;
  for (const topic of proposal.topics) {
    const existing =
      topic.existingThreadId === undefined ? undefined : existingById.get(topic.existingThreadId);
    if (existing === undefined) {
      addedTopics += 1;
      addedScenes += topic.scenes.length;
      assignedEvidence += new Set(topic.scenes.flatMap((scene) => scene.evidenceIds)).size;
      if (topic.link !== undefined) changedTopicLinks += 1;
      continue;
    }
    const oldEvidence = new Set((existing.scenes ?? []).flatMap((scene) => scene.evidenceIds));
    const newEvidence = new Set(topic.scenes.flatMap((scene) => scene.evidenceIds));
    const hasChange =
      existing.title !== topic.title ||
      !existingScenesPreserved(topic.scenes, existing.scenes ?? []) ||
      [...newEvidence].some((id) => !oldEvidence.has(id));
    if (hasChange) changedTopics += 1;
    addedScenes += Math.max(0, topic.scenes.length - (existing.scenes?.length ?? 0));
    assignedEvidence += [...newEvidence].filter((id) => !oldEvidence.has(id)).length;
    const oldFrom = existing.link?.fromThreadId;
    if ((topic.link?.fromTopicId ?? '') !== (oldFrom ?? '')) changedTopicLinks += 1;
  }
  return { addedTopics, changedTopics, addedScenes, assignedEvidence, changedTopicLinks };
}
