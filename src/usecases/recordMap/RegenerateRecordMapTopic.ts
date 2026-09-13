import type {
  RecordMapScaffoldSnapshot,
  RecordMapStudentProposal,
} from '@domain/entities/RecordMapProposal';
import type { IRecordMapProposalRepository } from '@domain/repositories/IRecordMapProposalRepository';
import {
  buildRecordMapSuggestPack,
  parseRecordMapSuggestion,
} from '@domain/services/recordMapSuggestPack';
import { validateRecordMapProposal } from '@domain/rules/recordMapProposal';
import type { RecordMapAiPort, RecordMapStudentSourcePort } from './RecordMapAiPort';
import { acquireRecordMapExecution, releaseRecordMapExecution } from './recordMapExecutionLease';
import {
  loadRecordMapData,
  recordMapContextKey,
  replaceRecordMapProposal,
  replaceRecordMapRun,
  updateRecordMapData,
} from './recordMapRunSupport';

export class RegenerateRecordMapTopic {
  constructor(
    private readonly repository: IRecordMapProposalRepository,
    private readonly ai: RecordMapAiPort,
    private readonly sources: RecordMapStudentSourcePort,
    private readonly createId: () => string,
    private readonly now: () => number,
  ) {}

  async execute(
    proposal: RecordMapStudentProposal,
    topicId: string,
    scaffold: RecordMapScaffoldSnapshot,
  ): Promise<boolean> {
    const owner = Symbol(proposal.runId);
    if (!acquireRecordMapExecution(proposal.runId, owner)) return false;
    const key = recordMapContextKey(proposal.context);
    const attemptId = this.createId();
    let started = false;
    try {
      const data = await loadRecordMapData(this.repository);
      const run = data.runs.find((item) => item.runId === proposal.runId);
      const current = data.proposals.find(
        (item) => item.runId === proposal.runId && recordMapContextKey(item.context) === key,
      );
      const topic = current?.topics.find((item) => item.id === topicId);
      if (
        !run ||
        !current ||
        !topic ||
        current.attemptId !== proposal.attemptId ||
        current.reviewStatus === 'applied' ||
        run.lifecycle === 'running' ||
        run.scaffoldPolicy.kind !== 'ai' ||
        !run.scaffoldPolicy.candidates.some((item) => item.id === scaffold.id)
      )
        return false;
      const source = await this.sources.load(proposal.context);
      if (source.sourceFingerprint !== proposal.sourceFingerprint) return false;
      const ids = new Set(topic.scenes.flatMap((scene) => scene.evidenceIds));
      const pack = buildRecordMapSuggestPack({
        ...source,
        context: proposal.context,
        evidences: source.evidences.filter((item) => ids.has(item.id)),
        threads: [],
        scaffoldPolicy: { kind: 'fixed', scaffold },
        instruction: '정확히 하나의 주제만 만들고 제공된 모든 근거를 그 주제의 장면에 배치하세요.',
      });
      if (!pack.canCallAi) return false;
      await updateRecordMapData(this.repository, (latest) => {
        const latestRun = latest.runs.find((item) => item.runId === run.runId);
        const latestProposal = latest.proposals.find(
          (item) => item.runId === run.runId && recordMapContextKey(item.context) === key,
        );
        if (
          !latestRun ||
          latestRun.lifecycle === 'stopped' ||
          latestProposal?.attemptId !== current.attemptId
        )
          return latest;
        started = true;
        return replaceRecordMapRun(latest, {
          ...latestRun,
          lifecycle: 'running',
          items: latestRun.items.map((item) =>
            recordMapContextKey(item.context) === key
              ? { ...item, runStatus: 'generating', attemptId }
              : item,
          ),
        });
      });
      if (!started) return false;
      const answer = await this.ai.ask({
        runId: run.runId,
        attemptId,
        provider: run.provider,
        text: pack.text,
      });
      const parsed = parseRecordMapSuggestion(answer, {
        runId: run.runId,
        attemptId,
        context: proposal.context,
        sourceFingerprint: source.sourceFingerprint,
        numberedEvidenceIds: pack.numberedEvidenceIds,
        mappings: pack.mappings,
        now: this.now(),
      });
      if (
        !parsed.ok ||
        parsed.proposal.topics.length !== 1 ||
        parsed.proposal.unplacedEvidence.length !== 0
      )
        return false;
      const replacement = parsed.proposal.topics[0];
      if (!replacement) return false;
      const merged: RecordMapStudentProposal = {
        ...current,
        attemptId,
        reviewStatus: 'unreviewed',
        updatedAt: this.now(),
        topics: current.topics.map((item) =>
          item.id === topicId
            ? {
                ...item,
                scenes: replacement.scenes,
                scaffold: {
                  ...replacement.scaffold,
                  reason: replacement.scaffold.reason ?? scaffold.name,
                },
              }
            : item,
        ),
      };
      if (
        !validateRecordMapProposal({
          phase: 'generation',
          proposal: merged,
          evidences: source.evidences,
          threads: source.threads,
          scaffoldPolicy: run.scaffoldPolicy,
        }).ok
      )
        return false;
      let accepted = false;
      await updateRecordMapData(this.repository, (latest) => {
        const latestRun = latest.runs.find((item) => item.runId === run.runId);
        const target = latestRun?.items.find((item) => recordMapContextKey(item.context) === key);
        if (
          !latestRun ||
          latestRun.lifecycle === 'stopped' ||
          target?.attemptId !== attemptId ||
          target.runStatus !== 'generating'
        )
          return latest;
        accepted = true;
        return replaceRecordMapProposal(
          replaceRecordMapRun(latest, {
            ...latestRun,
            items: latestRun.items.map((item) =>
              recordMapContextKey(item.context) === key
                ? { ...item, runStatus: 'generated' }
                : item,
            ),
          }),
          merged,
        );
      });
      return accepted;
    } finally {
      try {
        if (started)
          await updateRecordMapData(this.repository, (latest) => {
            const run = latest.runs.find((item) => item.runId === proposal.runId);
            if (!run || run.lifecycle === 'stopped') return latest;
            return replaceRecordMapRun(latest, {
              ...run,
              lifecycle: run.items.some((item) => item.runStatus === 'queued')
                ? 'paused'
                : 'completed',
              items: run.items.map((item) =>
                item.attemptId === attemptId && item.runStatus === 'generating'
                  ? { ...item, attemptId: proposal.attemptId, runStatus: 'generated' }
                  : item,
              ),
            });
          });
      } finally {
        releaseRecordMapExecution(proposal.runId, owner);
      }
    }
  }
}
