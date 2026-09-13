import type { RecordMapStudentProposal } from '@domain/entities/RecordMapProposal';
import type {
  ApplyRecordMapProposal,
  ApplyRecordMapProposalResult,
} from './ApplyRecordMapProposal';

export interface RecordMapBatchApplyItem {
  readonly studentRef: string;
  readonly result: ApplyRecordMapProposalResult;
}

export class ApplyReviewedRecordMapBatch {
  constructor(private readonly applyOne: Pick<ApplyRecordMapProposal, 'execute'>) {}

  async execute(
    proposals: readonly RecordMapStudentProposal[],
  ): Promise<readonly RecordMapBatchApplyItem[]> {
    const results: RecordMapBatchApplyItem[] = [];
    for (const proposal of proposals.filter((item) => item.reviewStatus === 'reviewed')) {
      const item = {
        studentRef: proposal.context.studentRef,
        result: await this.applyOne.execute(proposal),
      };
      results.push(item);
      if (!item.result.ok && item.result.code === 'recovery-required') break;
    }
    return results;
  }
}
