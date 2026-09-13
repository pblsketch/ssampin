import { isRecordMapExecuting } from './recordMapExecutionLease';
import type { RecordMapStudentContext } from '@domain/entities/RecordMapProposal';
import type { IRecordMapProposalRepository } from '@domain/repositories/IRecordMapProposalRepository';
import {
  recordMapContextKey,
  replaceRecordMapRun,
  updateRecordMapData,
} from './recordMapRunSupport';

/** 기존 제안을 보존한 채 한 학생만 다시 생성 가능한 상태로 돌린다. */
export class RequeueRecordMapStudent {
  constructor(
    private readonly repository: IRecordMapProposalRepository,
    private readonly now: () => number,
  ) {}

  async execute(runId: string, context: RecordMapStudentContext): Promise<boolean> {
    const key = recordMapContextKey(context);
    const timestamp = this.now();
    let requeued = false;
    await updateRecordMapData(this.repository, (current) => {
      const run = current.runs.find((item) => item.runId === runId);
      const target = run?.items.find((item) => recordMapContextKey(item.context) === key);
      if (
        run === undefined ||
        target === undefined ||
        isRecordMapExecuting(runId) ||
        run.lifecycle === 'running' ||
        target.runStatus === 'generating'
      ) {
        return current;
      }
      requeued = true;
      return replaceRecordMapRun(current, {
        ...run,
        lifecycle: 'paused',
        items: run.items.map((item) =>
          recordMapContextKey(item.context) === key
            ? { context: item.context, runStatus: 'queued', updatedAt: timestamp }
            : item,
        ),
        updatedAt: timestamp,
      });
    });
    return requeued;
  }
}
