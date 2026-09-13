import {
  RECORD_MAP_PROPOSAL_SCHEMA_VERSION,
  type RecordMapProposalData,
  type RecordMapRun,
  type RecordMapStudentContext,
  type RecordMapStudentProposal,
} from '@domain/entities/RecordMapProposal';
import type { IRecordMapProposalRepository } from '@domain/repositories/IRecordMapProposalRepository';

export const EMPTY_RECORD_MAP_PROPOSAL_DATA: RecordMapProposalData = {
  schemaVersion: RECORD_MAP_PROPOSAL_SCHEMA_VERSION,
  runs: [],
  proposals: [],
};

export function recordMapContextKey(context: RecordMapStudentContext): string {
  return [
    context.studentRef,
    context.classId ?? '',
    context.area,
    context.subjectId ?? '',
    context.term ?? '',
  ].join('\u001f');
}

export async function loadRecordMapData(
  repository: IRecordMapProposalRepository,
): Promise<RecordMapProposalData> {
  return (await repository.getRecordMapProposals()) ?? EMPTY_RECORD_MAP_PROPOSAL_DATA;
}

export async function updateRecordMapData(
  repository: IRecordMapProposalRepository,
  update: (current: RecordMapProposalData) => RecordMapProposalData,
): Promise<RecordMapProposalData> {
  return repository.updateRecordMapProposals(update);
}

export function replaceRecordMapRun(
  data: RecordMapProposalData,
  run: RecordMapRun,
): RecordMapProposalData {
  return {
    ...data,
    runs: data.runs.some((item) => item.runId === run.runId)
      ? data.runs.map((item) => (item.runId === run.runId ? run : item))
      : [...data.runs, run],
  };
}

export function replaceRecordMapProposal(
  data: RecordMapProposalData,
  proposal: RecordMapStudentProposal,
): RecordMapProposalData {
  const key = recordMapContextKey(proposal.context);
  const same = (item: RecordMapStudentProposal): boolean =>
    item.runId === proposal.runId && recordMapContextKey(item.context) === key;
  return {
    ...data,
    proposals: data.proposals.some(same)
      ? data.proposals.map((item) => (same(item) ? proposal : item))
      : [...data.proposals, proposal],
  };
}

export async function settleRecordMapRun(
  repository: IRecordMapProposalRepository,
  runId: string,
  now: number,
): Promise<void> {
  await updateRecordMapData(repository, (data) => {
    const run = data.runs.find((item) => item.runId === runId);
    if (
      !run ||
      run.lifecycle === 'stopped' ||
      run.items.some((item) => item.runStatus === 'generating')
    )
      return data;
    return replaceRecordMapRun(data, {
      ...run,
      lifecycle: run.items.some((item) => item.runStatus === 'queued') ? 'paused' : 'completed',
      updatedAt: now,
    });
  });
}
