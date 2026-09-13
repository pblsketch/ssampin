import { describe, expect, it } from 'vitest';
import type { RecordMapProposalData } from '@domain/entities/RecordMapProposal';
import type { IRecordMapProposalRepository } from '@domain/repositories/IRecordMapProposalRepository';
import { RequeueRecordMapStudent } from '../RequeueRecordMapStudent';

describe('RequeueRecordMapStudent', () => {
  it('기존 제안을 지우지 않고 지정한 학생만 대기로 돌린다', async () => {
    const context = { studentRef: 's1', area: 'subject' as const };
    let data: RecordMapProposalData = {
      schemaVersion: 1,
      runs: [
        {
          schemaVersion: 1,
          runId: 'run',
          targetMode: 'class',
          targetContexts: [context, { studentRef: 's2', area: 'subject' }],
          lifecycle: 'completed',
          items: [
            { context, runStatus: 'generated', updatedAt: 1 },
            {
              context: { studentRef: 's2', area: 'subject' },
              runStatus: 'generated',
              updatedAt: 1,
            },
          ],
          reviewPace: { kind: 'continuous' },
          scaffoldPolicy: {
            kind: 'fixed',
            scaffold: { id: 'fixed', name: '고정', frame: 'inquiry', scenes: [] },
          },
          provider: 'codex',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      proposals: [
        {
          schemaVersion: 1,
          runId: 'run',
          attemptId: 'old',
          context,
          sourceFingerprint: 'old-source',
          topics: [],
          unplacedEvidence: [],
          warnings: [],
          runStatus: 'generated',
          reviewStatus: 'source-changed',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };
    const repository: IRecordMapProposalRepository = {
      getRecordMapProposals: async () => data,
      updateRecordMapProposals: async (update) => (data = update(data)),
    };

    await expect(
      new RequeueRecordMapStudent(repository, () => 10).execute('run', context),
    ).resolves.toBe(true);

    expect(data.runs[0]?.items.map((item) => item.runStatus)).toEqual(['queued', 'generated']);
    expect(data.proposals[0]?.attemptId).toBe('old');
  });
});
