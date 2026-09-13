import { acquireRecordMapExecution, releaseRecordMapExecution } from './recordMapExecutionLease';
import type { RecordMapReviewPace, RecordMapRun } from '@domain/entities/RecordMapProposal';
import type { IRecordMapProposalRepository } from '@domain/repositories/IRecordMapProposalRepository';
import type { GenerateRecordMapStudentResult } from './GenerateRecordMapStudent';
import { GenerateRecordMapStudent } from './GenerateRecordMapStudent';
import { loadRecordMapData, replaceRecordMapRun, updateRecordMapData } from './recordMapRunSupport';

export interface RunRecordMapBatchResult {
  readonly attempted: number;
  readonly results: readonly GenerateRecordMapStudentResult[];
  readonly lifecycle: RecordMapRun['lifecycle'];
}

function reviewPaceLimit(reviewPace: RecordMapReviewPace): number {
  if (reviewPace.kind === 'one') return 1;
  if (reviewPace.kind === 'batch') return reviewPace.size;
  return Number.POSITIVE_INFINITY;
}

export class RunRecordMapBatch {
  constructor(
    private readonly repository: IRecordMapProposalRepository,
    private readonly generateStudent: GenerateRecordMapStudent,
    private readonly now: () => number,
  ) {}

  async execute(runId: string): Promise<RunRecordMapBatchResult> {
    const owner = Symbol(runId);
    if (!acquireRecordMapExecution(runId, owner)) {
      return { attempted: 0, results: [], lifecycle: 'running' };
    }
    try {
      return await this.executeOwned(runId, owner);
    } finally {
      releaseRecordMapExecution(runId, owner);
    }
  }

  private async executeOwned(runId: string, owner: symbol): Promise<RunRecordMapBatchResult> {
    const initial = await loadRecordMapData(this.repository);
    const run = initial.runs.find((item) => item.runId === runId);
    if (run === undefined) throw new Error('지도 제안 작업을 찾을 수 없습니다.');
    if (run.lifecycle === 'stopped' || run.lifecycle === 'completed') {
      return { attempted: 0, results: [], lifecycle: run.lifecycle };
    }
    const limit = reviewPaceLimit(run.reviewPace);
    const targets = run.items.filter((item) => item.runStatus === 'queued');
    const results: GenerateRecordMapStudentResult[] = [];
    for (const target of targets) {
      results.push(await this.generateStudent.execute(runId, target.context, owner));
      const current = (await loadRecordMapData(this.repository)).runs.find(
        (item) => item.runId === runId,
      );
      if (current?.lifecycle === 'stopped' || current?.lifecycle === 'paused') {
        return { attempted: results.length, results, lifecycle: current.lifecycle };
      }
      if (results.filter((result) => result !== 'skipped').length >= limit) break;
    }
    const latest = await loadRecordMapData(this.repository);
    const latestRun = latest.runs.find((item) => item.runId === runId);
    if (latestRun === undefined) throw new Error('지도 제안 작업을 찾을 수 없습니다.');
    const hasQueued = latestRun.items.some((item) => item.runStatus === 'queued');
    const lifecycle: RecordMapRun['lifecycle'] = hasQueued ? 'paused' : 'completed';
    const timestamp = this.now();
    let savedLifecycle: RecordMapRun['lifecycle'] = lifecycle;
    await updateRecordMapData(this.repository, (current) => {
      const currentRun = current.runs.find((item) => item.runId === runId);
      if (currentRun === undefined) return current;
      if (currentRun.lifecycle === 'stopped') {
        savedLifecycle = 'stopped';
        return current;
      }
      savedLifecycle = currentRun.items.some((item) => item.runStatus === 'queued')
        ? 'paused'
        : 'completed';
      return replaceRecordMapRun(current, {
        ...currentRun,
        lifecycle: savedLifecycle,
        updatedAt: timestamp,
      });
    });
    return { attempted: results.length, results, lifecycle: savedLifecycle };
  }
}
