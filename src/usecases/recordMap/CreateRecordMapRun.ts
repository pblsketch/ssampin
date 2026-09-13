import {
  RECORD_MAP_PROPOSAL_SCHEMA_VERSION,
  type RecordMapReviewPace,
  type RecordMapRun,
  type RecordMapScaffoldPolicy,
  type RecordMapStudentContext,
  type RecordMapTargetMode,
} from '@domain/entities/RecordMapProposal';
import type { IRecordMapProposalRepository } from '@domain/repositories/IRecordMapProposalRepository';
import type { OwnAiProviderId } from '@domain/entities/OwnAiProvider';
import {
  recordMapContextKey,
  replaceRecordMapRun,
  updateRecordMapData,
} from './recordMapRunSupport';

export interface CreateRecordMapRunInput {
  readonly runId: string;
  readonly targetMode: RecordMapTargetMode;
  readonly targetContexts: readonly RecordMapStudentContext[];
  readonly reviewPace: RecordMapReviewPace;
  readonly scaffoldPolicy: RecordMapScaffoldPolicy;
  readonly provider: OwnAiProviderId;
  readonly rebuildTopics?: boolean;
  readonly instruction?: string;
}

export class CreateRecordMapRun {
  constructor(
    private readonly repository: IRecordMapProposalRepository,
    private readonly now: () => number,
  ) {}

  async execute(input: CreateRecordMapRunInput): Promise<RecordMapRun> {
    if (input.runId.trim().length === 0) throw new Error('runId가 필요합니다.');
    if (input.targetContexts.length === 0) throw new Error('대상 학생이 필요합니다.');
    if (
      input.reviewPace.kind === 'batch' &&
      (!Number.isInteger(input.reviewPace.size) || input.reviewPace.size <= 0)
    ) {
      throw new Error('묶음 크기는 양의 정수여야 합니다.');
    }
    const seen = new Set<string>();
    const targetContexts = input.targetContexts.filter((context) => {
      const key = recordMapContextKey(context);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const timestamp = this.now();
    const run: RecordMapRun = {
      schemaVersion: RECORD_MAP_PROPOSAL_SCHEMA_VERSION,
      runId: input.runId,
      targetMode: input.targetMode,
      targetContexts,
      lifecycle: 'ready',
      items: targetContexts.map((context) => ({
        context,
        runStatus: 'queued',
        updatedAt: timestamp,
      })),
      reviewPace: input.reviewPace,
      scaffoldPolicy: input.scaffoldPolicy,
      provider: input.provider,
      ...(input.rebuildTopics === undefined ? {} : { rebuildTopics: input.rebuildTopics }),
      ...(input.instruction === undefined ? {} : { instruction: input.instruction }),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await updateRecordMapData(this.repository, (current) => {
      if (current.runs.some((item) => item.runId === input.runId)) {
        throw new Error('같은 지도 제안 작업이 이미 있습니다.');
      }
      return replaceRecordMapRun(current, run);
    });
    return run;
  }
}
