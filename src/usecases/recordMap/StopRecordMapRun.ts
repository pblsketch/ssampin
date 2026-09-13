import type { RecordMapRun } from '@domain/entities/RecordMapProposal';
import type { IRecordMapProposalRepository } from '@domain/repositories/IRecordMapProposalRepository';
import type { RecordMapAiPort } from './RecordMapAiPort';
import { loadRecordMapData, replaceRecordMapRun, updateRecordMapData } from './recordMapRunSupport';

export class StopRecordMapRun {
  constructor(
    private readonly repository: IRecordMapProposalRepository,
    private readonly ai: RecordMapAiPort,
    private readonly now: () => number,
  ) {}

  async execute(runId: string): Promise<RecordMapRun> {
    const data = await loadRecordMapData(this.repository);
    const run = data.runs.find((item) => item.runId === runId);
    if (run === undefined) throw new Error('지도 제안 작업을 찾을 수 없습니다.');
    let activeAttempts = run.items.filter(
      (item) => item.runStatus === 'generating' && item.attemptId !== undefined,
    );
    const timestamp = this.now();
    const stopped: RecordMapRun = {
      ...run,
      lifecycle: 'stopped',
      items: run.items.map((item) =>
        item.runStatus === 'queued' || item.runStatus === 'generating'
          ? { ...item, runStatus: 'cancelled', updatedAt: timestamp }
          : item,
      ),
      updatedAt: timestamp,
    };
    // 상태를 먼저 저장해야 취소와 거의 동시에 도착한 답도 늦은 응답 가드에 걸린다.
    let savedStopped = stopped;
    await updateRecordMapData(this.repository, (current) => {
      const currentRun = current.runs.find((item) => item.runId === runId);
      if (currentRun === undefined) return current;
      activeAttempts = currentRun.items.filter(
        (item) => item.runStatus === 'generating' && item.attemptId !== undefined,
      );
      savedStopped = {
        ...currentRun,
        lifecycle: 'stopped',
        items: currentRun.items.map((item) =>
          item.runStatus === 'queued' || item.runStatus === 'generating'
            ? { ...item, runStatus: 'cancelled', updatedAt: timestamp }
            : item,
        ),
        updatedAt: timestamp,
      };
      return replaceRecordMapRun(current, savedStopped);
    });
    for (const item of activeAttempts) {
      if (item.attemptId !== undefined) await this.ai.cancel?.(runId, item.attemptId);
    }
    return savedStopped;
  }
}
