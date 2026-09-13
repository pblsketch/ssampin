import type { RecordMapRun } from '@domain/entities/RecordMapProposal';
import type { IRecordMapProposalRepository } from '@domain/repositories/IRecordMapProposalRepository';
import { loadRecordMapData, replaceRecordMapRun, updateRecordMapData } from './recordMapRunSupport';

export class ResumeRecordMapRun {
  constructor(
    private readonly repository: IRecordMapProposalRepository,
    private readonly now: () => number,
  ) {}

  /** 저장 상태만 재개 준비로 바꾼다. AI 호출은 RunRecordMapBatch를 명시적으로 실행할 때만 일어난다. */
  async execute(runId: string): Promise<RecordMapRun> {
    const data = await loadRecordMapData(this.repository);
    const run = data.runs.find((item) => item.runId === runId);
    if (run === undefined) throw new Error('지도 제안 작업을 찾을 수 없습니다.');
    const timestamp = this.now();
    const resumed: RecordMapRun = {
      ...run,
      lifecycle: 'ready',
      items: run.items.map((item) =>
        item.runStatus === 'cancelled'
          ? {
              context: item.context,
              runStatus: 'queued',
              updatedAt: timestamp,
            }
          : item,
      ),
      updatedAt: timestamp,
    };
    let savedResumed = resumed;
    await updateRecordMapData(this.repository, (current) => {
      const currentRun = current.runs.find((item) => item.runId === runId);
      if (currentRun === undefined) return current;
      savedResumed = {
        ...currentRun,
        lifecycle: 'ready',
        items: currentRun.items.map((item) =>
          item.runStatus === 'cancelled'
            ? { context: item.context, runStatus: 'queued', updatedAt: timestamp }
            : item,
        ),
        updatedAt: timestamp,
      };
      return replaceRecordMapRun(current, savedResumed);
    });
    return savedResumed;
  }
}
