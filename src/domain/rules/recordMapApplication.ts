import type { InquiryThread, NarrativeScene } from '../entities/InquiryThread';
import type { RecordEvidence } from '../entities/RecordEvidence';
import { evidenceInArea } from '../entities/RecordEvidence';
import type { RecordMapApplication, RecordMapRecordChange } from '../entities/RecordMapApplication';
import type {
  RecordMapScaffoldPolicy,
  RecordMapStudentContext,
  RecordMapStudentProposal,
} from '../entities/RecordMapProposal';
import { validateRecordMapProposal } from './recordMapProposal';

function sameOptional(left: string | undefined, right: string | undefined): boolean {
  return (left ?? '') === (right ?? '');
}

function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const object = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stable(object[key])}`)
    .join(',')}}`;
}

function evidenceMeaning(evidence: RecordEvidence): unknown {
  return {
    id: evidence.id,
    studentRef: evidence.studentRef,
    areas: evidence.areas,
    content: evidence.content,
    date: evidence.date,
    sourceType: evidence.sourceType,
    sourceId: evidence.sourceId,
    classId: evidence.classId,
    slots: evidence.slots,
    excludedFromAi: evidence.excludedFromAi,
    threadId: evidence.threadId,
    note: evidence.note,
    links: evidence.links,
  };
}

function threadMeaning(thread: InquiryThread): unknown {
  return {
    id: thread.id,
    studentRef: thread.studentRef,
    classId: thread.classId,
    title: thread.title,
    keywords: thread.keywords,
    standardCodes: thread.standardCodes,
    competencyKeywords: thread.competencyKeywords,
    nextNotes: thread.nextNotes,
    status: thread.status,
    term: thread.term,
    scenes: thread.scenes,
    link: thread.link,
    order: thread.order,
  };
}

/** 생성과 적용이 함께 쓰는 의미 기반 원본 판별값. updatedAt과 지도 좌표는 제외한다. */
export function recordMapSourceFingerprint(input: {
  readonly context: RecordMapStudentContext;
  readonly evidences: readonly RecordEvidence[];
  readonly threads: readonly InquiryThread[];
}): string {
  const { context } = input;
  const evidences = input.evidences
    .filter(
      (item) =>
        item.studentRef === context.studentRef &&
        sameOptional(item.classId, context.classId) &&
        evidenceInArea(item, context.area),
    )
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(evidenceMeaning);
  const threads = input.threads
    .filter(
      (item) =>
        item.studentRef === context.studentRef &&
        sameOptional(item.classId, context.classId) &&
        (context.term === undefined || item.term === undefined || item.term === context.term),
    )
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(threadMeaning);
  return stable({ context, evidences, threads });
}

function sameRecord<T>(left: T | null, right: T | null): boolean {
  return stable(left) === stable(right);
}

export function recordsMatchChanges<T extends { readonly id: string }>(
  records: readonly T[],
  changes: readonly RecordMapRecordChange<T>[],
  side: 'before' | 'after',
): boolean {
  const byId = new Map(records.map((record) => [record.id, record]));
  return changes.every((change) => sameRecord(byId.get(change.id) ?? null, change[side]));
}

export function mergeRecordChanges<T extends { readonly id: string }>(
  records: readonly T[],
  changes: readonly RecordMapRecordChange<T>[],
  direction: 'forward' | 'backward',
): readonly T[] | null {
  const byId = new Map(records.map((record) => [record.id, record]));
  for (const change of changes) {
    const expected = direction === 'forward' ? change.before : change.after;
    const replacement = direction === 'forward' ? change.after : change.before;
    if (!sameRecord(byId.get(change.id) ?? null, expected)) return null;
    if (replacement === null) byId.delete(change.id);
    else byId.set(change.id, replacement);
  }
  const changed = new Set(changes.map((change) => change.id));
  const next = records
    .filter((record) => !changed.has(record.id))
    .concat(
      changes.flatMap((change) => {
        const replacement = direction === 'forward' ? change.after : change.before;
        return replacement === null ? [] : [replacement];
      }),
    );
  return next;
}

function scenesWithRemovedEvidence(
  scenes: readonly NarrativeScene[] | undefined,
  movedEvidenceIds: ReadonlySet<string>,
): readonly NarrativeScene[] | undefined {
  if (scenes === undefined) return undefined;
  return scenes.map((scene) => ({
    ...scene,
    evidenceIds: scene.evidenceIds.filter((id) => !movedEvidenceIds.has(id)),
    ...(scene.evidenceFocus === undefined
      ? {}
      : {
          evidenceFocus: scene.evidenceFocus.filter(
            (item) => !movedEvidenceIds.has(item.evidenceId),
          ),
        }),
  }));
}

function hasThreadCycle(threads: readonly InquiryThread[]): boolean {
  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  for (const start of threads) {
    const seen = new Set<string>();
    let cursor: InquiryThread | undefined = start;
    while (cursor?.link !== undefined) {
      if (seen.has(cursor.id)) return true;
      seen.add(cursor.id);
      const parent = byId.get(cursor.link.fromThreadId);
      if (
        parent === undefined ||
        parent.studentRef !== cursor.studentRef ||
        !sameOptional(parent.classId, cursor.classId)
      ) {
        return true;
      }
      cursor = parent;
    }
  }
  return false;
}

function hasInvalidSceneOwnership(
  context: RecordMapStudentContext,
  evidences: readonly RecordEvidence[],
  threads: readonly InquiryThread[],
): boolean {
  const evidenceById = new Map(evidences.map((evidence) => [evidence.id, evidence]));
  return threads
    .filter(
      (thread) =>
        thread.studentRef === context.studentRef && sameOptional(thread.classId, context.classId),
    )
    .some((thread) =>
      (thread.scenes ?? []).some((scene) =>
        scene.evidenceIds.some((evidenceId) => {
          const evidence = evidenceById.get(evidenceId);
          return (
            evidence === undefined ||
            evidence.studentRef !== thread.studentRef ||
            !sameOptional(evidence.classId, thread.classId) ||
            evidence.threadId !== thread.id
          );
        }),
      ),
    );
}

function hasTeacherSceneContent(scene: NarrativeScene): boolean {
  return (
    (scene.noteSource !== 'ai' && scene.note !== undefined) ||
    scene.leadIn !== undefined ||
    scene.leadInNeedsCheck !== undefined ||
    scene.evidenceFocus !== undefined
  );
}

function findUnambiguousSceneDestination(
  source: NarrativeScene,
  proposed: readonly NarrativeScene[],
): NarrativeScene | null {
  const exact = proposed.filter((scene) => scene.id === source.id);
  if (exact.length === 1) return exact[0] ?? null;
  const sameRole = proposed.filter((scene) => scene.role === source.role);
  return sameRole.length === 1 ? (sameRole[0] ?? null) : null;
}

export interface PlanRecordMapApplicationInput {
  readonly proposal: RecordMapStudentProposal;
  readonly scaffoldPolicy: RecordMapScaffoldPolicy;
  readonly evidences: readonly RecordEvidence[];
  readonly threads: readonly InquiryThread[];
  readonly applicationId: string;
  readonly now: number;
  readonly createId: () => string;
}

export type PlanRecordMapApplicationResult =
  | { readonly ok: true; readonly application: RecordMapApplication }
  | {
      readonly ok: false;
      readonly code: 'not-reviewed' | 'source-changed' | 'invalid-proposal';
      readonly message: string;
    };

export function planRecordMapApplication(
  input: PlanRecordMapApplicationInput,
): PlanRecordMapApplicationResult {
  const { proposal, evidences, threads, scaffoldPolicy } = input;
  if (proposal.reviewStatus !== 'reviewed') {
    return { ok: false, code: 'not-reviewed', message: '검토 완료한 학생만 적용할 수 있습니다.' };
  }
  const fingerprint = recordMapSourceFingerprint({ context: proposal.context, evidences, threads });
  if (fingerprint !== proposal.sourceFingerprint) {
    return { ok: false, code: 'source-changed', message: '원본이 바뀌어 적용할 수 없습니다.' };
  }
  const validation = validateRecordMapProposal({ proposal, evidences, threads, scaffoldPolicy });
  if (!validation.ok) {
    return {
      ok: false,
      code: 'invalid-proposal',
      message: validation.issues.map((issue) => issue.message).join(' '),
    };
  }

  if (scaffoldPolicy.kind !== 'existing') {
    for (const topic of proposal.topics) {
      const existing = threads.find((thread) => thread.id === topic.existingThreadId);
      const destinations = new Set<string>();
      for (const scene of existing?.scenes ?? []) {
        const destination = findUnambiguousSceneDestination(scene, topic.scenes);
        if (
          hasTeacherSceneContent(scene) &&
          (destination === null || destinations.has(destination.id))
        ) {
          return {
            ok: false,
            code: 'invalid-proposal',
            message: '기존 교사 메모를 옮길 장면을 확정할 수 없어 직접 확인이 필요합니다.',
          };
        }
        if (hasTeacherSceneContent(scene) && destination !== null) destinations.add(destination.id);
      }
    }
  }

  const existingIds = new Set(threads.map((thread) => thread.id));
  const idByTopic = new Map<string, string>();
  for (const topic of proposal.topics) {
    if (topic.existingThreadId !== undefined) idByTopic.set(topic.id, topic.existingThreadId);
    else {
      let id = input.createId();
      while (existingIds.has(id)) id = input.createId();
      existingIds.add(id);
      idByTopic.set(topic.id, id);
    }
  }
  const usedSceneIds = new Set(
    threads.flatMap((thread) => (thread.scenes ?? []).map((scene) => scene.id)),
  );
  const sceneIdByProposalKey = new Map<string, string>();
  for (const topic of proposal.topics) {
    const existing = threads.find((thread) => thread.id === topic.existingThreadId);
    const existingSceneIds = new Set((existing?.scenes ?? []).map((scene) => scene.id));
    for (const scene of topic.scenes) {
      if (existingSceneIds.has(scene.id)) {
        sceneIdByProposalKey.set(`${topic.id}\u001f${scene.id}`, scene.id);
        continue;
      }
      let id = input.createId();
      while (usedSceneIds.has(id)) id = input.createId();
      usedSceneIds.add(id);
      sceneIdByProposalKey.set(`${topic.id}\u001f${scene.id}`, id);
    }
  }
  const ownerByEvidence = new Map<string, string>();
  for (const topic of proposal.topics) {
    const threadId = idByTopic.get(topic.id);
    if (threadId === undefined) continue;
    for (const scene of topic.scenes) {
      for (const evidenceId of scene.evidenceIds) ownerByEvidence.set(evidenceId, threadId);
    }
  }
  const evidenceChanges: RecordMapRecordChange<RecordEvidence>[] = [];
  for (const evidence of evidences) {
    const owner = ownerByEvidence.get(evidence.id);
    if (owner === undefined || owner === evidence.threadId) continue;
    evidenceChanges.push({
      id: evidence.id,
      before: evidence,
      after: { ...evidence, threadId: owner, updatedAt: input.now },
    });
  }

  const movedByOldOwner = new Map<string, Set<string>>();
  for (const change of evidenceChanges) {
    if (change.before?.threadId === undefined) continue;
    const moved = movedByOldOwner.get(change.before.threadId) ?? new Set<string>();
    moved.add(change.id);
    movedByOldOwner.set(change.before.threadId, moved);
  }
  const afterByThread = new Map(threads.map((thread) => [thread.id, thread]));
  for (const [oldOwner, moved] of movedByOldOwner) {
    const existing = afterByThread.get(oldOwner);
    if (existing !== undefined) {
      afterByThread.set(oldOwner, {
        ...existing,
        scenes: scenesWithRemovedEvidence(existing.scenes, moved),
        updatedAt: input.now,
      });
    }
  }
  const maxOrder = threads.reduce((max, thread) => Math.max(max, thread.order ?? -1), -1);
  let newOrder = maxOrder + 1;
  for (const topic of proposal.topics) {
    const id = idByTopic.get(topic.id);
    if (id === undefined) continue;
    const existing = threads.find((thread) => thread.id === topic.existingThreadId);
    const proposedLink =
      topic.link === undefined
        ? undefined
        : {
            fromThreadId: idByTopic.get(topic.link.fromTopicId) ?? '',
            ...(topic.link.note === undefined ? {} : { note: topic.link.note }),
          };
    if (
      existing?.link !== undefined &&
      proposedLink !== undefined &&
      !sameRecord(existing.link, proposedLink)
    ) {
      return {
        ok: false,
        code: 'invalid-proposal',
        message: '기존 주제 연결과 메모가 바뀌므로 직접 확인이 필요합니다.',
      };
    }
    if (
      existing !== undefined &&
      scaffoldPolicy.kind !== 'existing' &&
      (existing.scenes ?? []).some((scene) =>
        scene.evidenceIds.some((evidenceId) => {
          const record = evidences.find((item) => item.id === evidenceId);
          return record === undefined || !evidenceInArea(record, proposal.context.area);
        }),
      )
    ) {
      return {
        ok: false,
        code: 'invalid-proposal',
        message: '다른 영역의 근거가 있는 주제는 뼈대를 바꾸기 전에 직접 확인해 주세요.',
      };
    }
    if (existing === undefined) {
      const materializedScenes = topic.scenes.map((scene) => ({
        ...scene,
        id: sceneIdByProposalKey.get(`${topic.id}\u001f${scene.id}`) ?? scene.id,
      }));
      afterByThread.set(id, {
        id,
        studentRef: proposal.context.studentRef,
        ...(proposal.context.classId === undefined ? {} : { classId: proposal.context.classId }),
        title: topic.title,
        keywords: [],
        status: topic.status,
        ...(proposal.context.term === undefined ? {} : { term: proposal.context.term }),
        scenes: materializedScenes,
        ...(proposedLink === undefined ? {} : { link: proposedLink }),
        order: newOrder++,
        createdAt: input.now,
        updatedAt: input.now,
      });
    } else {
      const base = afterByThread.get(id) ?? existing;
      let scenes: readonly NarrativeScene[];
      if (scaffoldPolicy.kind === 'existing') {
        const proposedById = new Map(topic.scenes.map((scene) => [scene.id, scene]));
        const existingSceneIds = new Set((base.scenes ?? []).map((scene) => scene.id));
        scenes = (base.scenes ?? [])
          .map((scene) => {
            const proposed = proposedById.get(scene.id);
            if (proposed === undefined) return scene;
            const preservedEvidence = scene.evidenceIds.filter(
              (evidenceId) => !ownerByEvidence.has(evidenceId),
            );
            const evidenceIds = [...new Set([...proposed.evidenceIds, ...preservedEvidence])];
            const preservedFocus = (scene.evidenceFocus ?? []).filter(
              (item) => !ownerByEvidence.has(item.evidenceId),
            );
            const evidenceFocus = [...(proposed.evidenceFocus ?? []), ...preservedFocus];
            return {
              ...scene,
              evidenceIds,
              ...(evidenceFocus.length === 0 ? {} : { evidenceFocus }),
            };
          })
          .concat(
            topic.scenes
              .filter((scene) => !existingSceneIds.has(scene.id))
              .map((scene) => ({
                ...scene,
                id: sceneIdByProposalKey.get(`${topic.id}\u001f${scene.id}`) ?? scene.id,
              })),
          );
      } else {
        const oldScenes = base.scenes ?? [];
        const consumed = new Set<string>();
        scenes = topic.scenes.map((scene) => {
          const old = oldScenes.find(
            (candidate) =>
              !consumed.has(candidate.id) &&
              hasTeacherSceneContent(candidate) &&
              findUnambiguousSceneDestination(candidate, topic.scenes)?.id === scene.id,
          );
          if (old !== undefined) consumed.add(old.id);
          const teacherFields =
            old !== undefined
              ? {
                  ...(old.note === undefined || old.noteSource === 'ai'
                    ? {}
                    : { note: old.note, noteSource: 'teacher' as const }),
                  ...(old.noteSource === undefined || old.noteSource === 'ai'
                    ? {}
                    : { noteSource: old.noteSource }),
                  ...(old.leadIn === undefined ? {} : { leadIn: old.leadIn }),
                  ...(old.leadInNeedsCheck === undefined
                    ? {}
                    : { leadInNeedsCheck: old.leadInNeedsCheck }),
                  ...(old.evidenceFocus === undefined ? {} : { evidenceFocus: old.evidenceFocus }),
                }
              : {};
          return {
            ...scene,
            ...teacherFields,
            id: sceneIdByProposalKey.get(`${topic.id}\u001f${scene.id}`) ?? scene.id,
          };
        });
      }
      afterByThread.set(id, {
        ...base,
        scenes,
        ...(proposedLink === undefined ? {} : { link: proposedLink }),
        updatedAt: input.now,
      });
    }
  }
  const afterThreads = [...afterByThread.values()];
  if (hasThreadCycle(afterThreads)) {
    return {
      ok: false,
      code: 'invalid-proposal',
      message: '최종 지도에 순환 또는 다른 학생 주제 연결이 생깁니다.',
    };
  }
  const afterEvidence = evidences.map((evidence) => {
    const owner = ownerByEvidence.get(evidence.id);
    return owner === undefined ? evidence : { ...evidence, threadId: owner };
  });
  if (hasInvalidSceneOwnership(proposal.context, afterEvidence, afterThreads)) {
    return {
      ok: false,
      code: 'invalid-proposal',
      message: '최종 지도에 다른 학생 근거 또는 소유가 맞지 않는 장면이 생깁니다.',
    };
  }
  const threadChanges: RecordMapRecordChange<InquiryThread>[] = [];
  const beforeByThread = new Map(threads.map((thread) => [thread.id, thread]));
  for (const [id, after] of afterByThread) {
    const before = beforeByThread.get(id) ?? null;
    if (!sameRecord(before, after)) threadChanges.push({ id, before, after });
  }
  return {
    ok: true,
    application: {
      schemaVersion: 1,
      id: input.applicationId,
      runId: proposal.runId,
      studentRef: proposal.context.studentRef,
      proposalAttemptId: proposal.attemptId,
      sourceFingerprint: fingerprint,
      phase: 'prepared',
      evidenceChanges,
      threadChanges,
      createdAt: input.now,
      updatedAt: input.now,
    },
  };
}
