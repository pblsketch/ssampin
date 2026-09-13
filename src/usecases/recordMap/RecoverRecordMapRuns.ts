import { isRecordMapExecuting } from './recordMapExecutionLease';
import type { RecordMapProposalData } from '@domain/entities/RecordMapProposal';
import type { IRecordMapProposalRepository } from '@domain/repositories/IRecordMapProposalRepository';
import { loadRecordMapData, updateRecordMapData } from './recordMapRunSupport';

export class RecoverRecordMapRuns {
  constructor(
    private readonly repository: IRecordMapProposalRepository,
    private readonly now: () => number,
  ) {}

  /** 앱 재시작 시 실행 중이던 요청만 중단 상태로 복원한다. AI를 부르는 의존성 자체가 없다. */
  async execute(): Promise<RecordMapProposalData> {
    const data = await loadRecordMapData(this.repository);
    const timestamp = this.now();
    const changed = data.runs.some((run) => run.lifecycle === 'running');
    if (!changed) return data;
    return updateRecordMapData(this.repository, (current) => ({
      ...current,
      runs: current.runs.map((run) => {
        if (run.lifecycle !== 'running' || isRecordMapExecuting(run.runId)) return run;
        return {
          ...run,
          lifecycle: 'stopped',
          items: run.items.map((item) =>
            item.runStatus === 'generating'
              ? { ...item, runStatus: 'cancelled', updatedAt: timestamp }
              : item,
          ),
          updatedAt: timestamp,
        };
      }),
    }));
  }
}
