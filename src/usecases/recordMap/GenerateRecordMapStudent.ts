import { acquireRecordMapExecution, releaseRecordMapExecution } from './recordMapExecutionLease';
import type {
  RecordMapRun,
  RecordMapRunItem,
  RecordMapStudentContext,
} from '@domain/entities/RecordMapProposal';
import type { IRecordMapProposalRepository } from '@domain/repositories/IRecordMapProposalRepository';
import { validateRecordMapProposal } from '@domain/rules/recordMapProposal';
import {
  buildRecordMapSuggestPack,
  parseRecordMapSuggestion,
} from '@domain/services/recordMapSuggestPack';
import type { RecordMapAiPort, RecordMapStudentSourcePort } from './RecordMapAiPort';
import {
  loadRecordMapData,
  recordMapContextKey,
  replaceRecordMapProposal,
  replaceRecordMapRun,
  updateRecordMapData,
} from './recordMapRunSupport';

export type GenerateRecordMapStudentResult = 'generated' | 'skipped' | 'failed' | 'ignored';

export class GenerateRecordMapStudent {
  private readonly active = new Set<string>();

  constructor(
    private readonly repository: IRecordMapProposalRepository,
    private readonly ai: RecordMapAiPort,
    private readonly sources: RecordMapStudentSourcePort,
    private readonly createAttemptId: () => string,
    private readonly now: () => number,
  ) {}

  async execute(
    runId: string,
    context: RecordMapStudentContext,
    batchOwner?: symbol,
  ): Promise<GenerateRecordMapStudentResult> {
    const activeKey = `${runId}\u001e${recordMapContextKey(context)}`;
    if (this.active.has(activeKey)) return 'ignored';
    const owner = batchOwner ?? Symbol(runId);
    if (!acquireRecordMapExecution(runId, owner)) return 'ignored';
    this.active.add(activeKey);
    try {
      return await this.executeOnce(runId, context);
    } finally {
      this.active.delete(activeKey);
      if (batchOwner === undefined) releaseRecordMapExecution(runId, owner);
    }
  }

  private async executeOnce(
    runId: string,
    context: RecordMapStudentContext,
  ): Promise<GenerateRecordMapStudentResult> {
    const contextKey = recordMapContextKey(context);
    const initial = await loadRecordMapData(this.repository);
    const run = initial.runs.find((item) => item.runId === runId);
    const target = run?.items.find((item) => recordMapContextKey(item.context) === contextKey);
    if (
      run === undefined ||
      target === undefined ||
      run.lifecycle === 'stopped' ||
      !['queued', 'failed', 'cancelled'].includes(target.runStatus)
    ) {
      return 'ignored';
    }

    const attemptId = this.createAttemptId();
    const timestamp = this.now();
    const generatingItem: RecordMapRunItem = {
      context: target.context,
      runStatus: 'generating',
      attemptId,
      updatedAt: timestamp,
    };
    let started = false;
    await updateRecordMapData(this.repository, (current) => {
      const currentRun = current.runs.find((item) => item.runId === runId);
      const currentTarget = currentRun?.items.find(
        (item) => recordMapContextKey(item.context) === contextKey,
      );
      if (
        currentRun === undefined ||
        currentTarget === undefined ||
        currentRun.lifecycle === 'stopped' ||
        !['queued', 'failed', 'cancelled'].includes(currentTarget.runStatus)
      ) {
        return current;
      }
      started = true;
      return replaceRecordMapRun(current, {
        ...currentRun,
        lifecycle: 'running',
        items: currentRun.items.map((item) =>
          recordMapContextKey(item.context) === contextKey ? generatingItem : item,
        ),
        updatedAt: timestamp,
      });
    });
    if (!started) return 'ignored';

    try {
      const source = await this.sources.load(context);
      const pack = buildRecordMapSuggestPack({
        studentName: source.studentName,
        roster: source.roster,
        context,
        evidences: source.evidences,
        threads: source.threads,
        scaffoldPolicy: run.scaffoldPolicy,
        ...(run.rebuildTopics === undefined ? {} : { rebuildTopics: run.rebuildTopics }),
        ...(run.instruction === undefined ? {} : { instruction: run.instruction }),
      });
      if (!pack.canCallAi) {
        return await this.settleWithoutProposal(runId, contextKey, attemptId, 'skipped');
      }
      if (!(await this.isAttemptActive(runId, contextKey, attemptId))) return 'ignored';
      const answer = await this.ai.ask({
        runId,
        attemptId,
        provider: run.provider,
        text: pack.text,
      });
      const countExclusions = (reason: 'teacher' | 'empty' | 'prohibited' | 'too-long'): number =>
        pack.exclusions.filter((item) => item.reason === reason).length;
      const parsed = parseRecordMapSuggestion(answer, {
        runId,
        attemptId,
        context,
        sourceFingerprint: source.sourceFingerprint,
        numberedEvidenceIds: pack.numberedEvidenceIds,
        includedEvidenceIds: pack.numberedEvidenceIds.slice(0, pack.includedCount),
        excludedCounts: {
          teacher: countExclusions('teacher'),
          empty: countExclusions('empty'),
          prohibited: countExclusions('prohibited'),
          tooLong: countExclusions('too-long'),
        },
        suppressedMemoCount: pack.suppressedMemoCount,
        mappings: pack.mappings,
        now: this.now(),
      });
      if (!parsed.ok) {
        return await this.settleWithoutProposal(
          runId,
          contextKey,
          attemptId,
          'failed',
          parsed.failure,
        );
      }
      const validation = validateRecordMapProposal({
        proposal: parsed.proposal,
        evidences: source.evidences,
        threads: source.threads,
        scaffoldPolicy: run.scaffoldPolicy,
        phase: 'generation',
      });
      if (!validation.ok) {
        const failure = validation.issues.map((issue) => issue.code).join(',');
        return await this.settleWithoutProposal(runId, contextKey, attemptId, 'failed', failure);
      }
      const latest = await loadRecordMapData(this.repository);
      const latestRun = latest.runs.find((item) => item.runId === runId);
      const latestItem = latestRun?.items.find(
        (item) => recordMapContextKey(item.context) === contextKey,
      );
      if (
        latestRun === undefined ||
        latestRun.lifecycle === 'stopped' ||
        latestItem?.runStatus !== 'generating' ||
        latestItem.attemptId !== attemptId
      ) {
        return 'ignored';
      }
      const doneAt = this.now();
      let accepted = false;
      await updateRecordMapData(this.repository, (currentData) => {
        const currentRun = currentData.runs.find((item) => item.runId === runId);
        const currentItem = currentRun?.items.find(
          (item) => recordMapContextKey(item.context) === contextKey,
        );
        if (
          currentRun === undefined ||
          currentRun.lifecycle === 'stopped' ||
          currentItem?.runStatus !== 'generating' ||
          currentItem.attemptId !== attemptId
        ) {
          return currentData;
        }
        accepted = true;
        const mergedRun: RecordMapRun = {
          ...currentRun,
          items: currentRun.items.map((item) =>
            recordMapContextKey(item.context) === contextKey
              ? { ...item, runStatus: 'generated', updatedAt: doneAt }
              : item,
          ),
          updatedAt: doneAt,
        };
        return replaceRecordMapProposal(
          replaceRecordMapRun(currentData, mergedRun),
          parsed.proposal,
        );
      });
      if (!accepted) return 'ignored';
      return 'generated';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return await this.settleWithoutProposal(runId, contextKey, attemptId, 'failed', message);
    }
  }

  private async isAttemptActive(
    runId: string,
    contextKey: string,
    attemptId: string,
  ): Promise<boolean> {
    const latest = await loadRecordMapData(this.repository);
    const run = latest.runs.find((item) => item.runId === runId);
    const current = run?.items.find((item) => recordMapContextKey(item.context) === contextKey);
    return (
      run !== undefined &&
      run.lifecycle !== 'stopped' &&
      current?.runStatus === 'generating' &&
      current.attemptId === attemptId
    );
  }

  private async settleWithoutProposal(
    runId: string,
    contextKey: string,
    attemptId: string,
    status: 'failed' | 'skipped',
    failureMessage?: string,
  ): Promise<GenerateRecordMapStudentResult> {
    const latest = await loadRecordMapData(this.repository);
    const run = latest.runs.find((item) => item.runId === runId);
    const current = run?.items.find((item) => recordMapContextKey(item.context) === contextKey);
    if (
      run === undefined ||
      run.lifecycle === 'stopped' ||
      current?.runStatus !== 'generating' ||
      current.attemptId !== attemptId
    ) {
      return 'ignored';
    }
    const timestamp = this.now();
    let settled = false;
    await updateRecordMapData(this.repository, (currentData) => {
      const currentRun = currentData.runs.find((item) => item.runId === runId);
      const currentItem = currentRun?.items.find(
        (item) => recordMapContextKey(item.context) === contextKey,
      );
      if (
        currentRun === undefined ||
        currentRun.lifecycle === 'stopped' ||
        currentItem?.runStatus !== 'generating' ||
        currentItem.attemptId !== attemptId
      ) {
        return currentData;
      }
      settled = true;
      return replaceRecordMapRun(currentData, {
        ...currentRun,
        ...([
          'busy',
          'not-signed-in',
          'usage-limit',
          'not-installed',
          'version',
          'model-unavailable',
          'prompt-rate-limited-minute',
          'prompt-rate-limited-day',
        ].includes(failureMessage ?? '')
          ? { lifecycle: 'paused' as const }
          : {}),
        items: currentRun.items.map((item) =>
          recordMapContextKey(item.context) === contextKey
            ? {
                ...item,
                runStatus: status,
                ...(failureMessage === undefined ? {} : { failureMessage }),
                updatedAt: timestamp,
              }
            : item,
        ),
        updatedAt: timestamp,
      });
    });
    if (!settled) return 'ignored';
    return status;
  }
}
