import { historyRecordKey as logical } from './evidenceEditJournal';
import type { InquiryThread } from '@domain/entities/InquiryThread';
import type { RecordEvidence } from '@domain/entities/RecordEvidence';
import { inquiryThreadRepository, recordEvidenceRepository } from '@adapters/di/container';
import { useInquiryThreadStore } from './useInquiryThreadStore';
import { useRecordEvidenceStore } from './useRecordEvidenceStore';
import { withFileLock } from '@usecases/shared/fileWriteLock';
import { SYNC_FILE_KEYS } from '@usecases/sync/syncRegistry';

export interface EvidenceHistoryData {
  readonly evidence: readonly RecordEvidence[];
  readonly threads: readonly InquiryThread[];
}
export function captureEvidenceHistory(): EvidenceHistoryData {
  return {
    evidence: useRecordEvidenceStore.getState().records,
    threads: useInquiryThreadStore.getState().records,
  };
}
export function sameHistoryRecords<T extends { readonly id: string; readonly updatedAt: number }>(
  a: readonly T[],
  b: readonly T[],
): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((record) => [record.id, record]));
  return a.every(
    (record) => record === byId.get(record.id) || logical(record) === logical(byId.get(record.id)),
  );
}
function patch<T extends { readonly id: string; readonly updatedAt: number }>(
  current: readonly T[],
  expected: readonly T[],
  target: readonly T[],
): readonly T[] {
  const previous = new Map(expected.map((record) => [record.id, record]));
  const next = new Map(target.map((record) => [record.id, record]));
  const now = new Map(current.map((record) => [record.id, record]));
  const changed = new Set(
    [...new Set([...previous.keys(), ...next.keys()])].filter(
      (id) => logical(previous.get(id)) !== logical(next.get(id)),
    ),
  );
  for (const id of changed) {
    if (logical(now.get(id)) !== logical(previous.get(id)))
      throw new Error(
        '이 기록이 다른 곳에서 바뀌어 되돌리지 않았습니다. 현재 내용을 확인해 주세요.',
      );
  }
  const restored = (record: T): T => ({ ...record, updatedAt: Date.now() });
  return [
    ...current.flatMap((record) => {
      if (!changed.has(record.id)) return [record];
      const replacement = next.get(record.id);
      return replacement ? [restored(replacement)] : [];
    }),
    ...target.filter((record) => changed.has(record.id) && !now.has(record.id)).map(restored),
  ];
}
/** 두 파일의 현재값을 확인한 뒤 변경한 항목만 복원한다. 원본 관찰/누가기록은 쓰지 않는다. */
export async function restoreEvidenceHistory(
  expected: EvidenceHistoryData,
  target: EvidenceHistoryData,
): Promise<void> {
  await withFileLock(SYNC_FILE_KEYS.inquiryThreads, () =>
    withFileLock(SYNC_FILE_KEYS.recordEvidence, async () => {
      const oldEvidence = (await recordEvidenceRepository.getRecordEvidence()) ?? { records: [] };
      const oldThreads = (await inquiryThreadRepository.getInquiryThreads()) ?? { records: [] };
      const evidence = patch(oldEvidence.records, expected.evidence, target.evidence);
      const threads = patch(oldThreads.records, expected.threads, target.threads);
      const oldEvidenceById = new Map(oldEvidence.records.map((record) => [record.id, record]));
      const evidenceById = new Map(evidence.map((record) => [record.id, record]));
      const threadsById = new Map(threads.map((record) => [record.id, record]));
      const oldThreadsById = new Map(oldThreads.records.map((record) => [record.id, record]));
      const sourceCounts = new Map<string, number>();
      for (const record of evidence)
        if (record.sourceId) {
          const key = JSON.stringify([record.studentRef, record.sourceId]);
          sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1);
        }
      for (const record of evidence)
        if (
          record.sourceId &&
          logical(record) !== logical(oldEvidenceById.get(record.id)) &&
          (sourceCounts.get(JSON.stringify([record.studentRef, record.sourceId])) ?? 0) > 1
        )
          throw new Error(
            '같은 원본에서 가져온 근거가 이미 있어 다시 실행하지 않았습니다. 현재 근거를 확인해 주세요.',
          );
      const removedThreads = new Set(
        oldThreads.records.filter((t) => !threadsById.has(t.id)).map((t) => t.id),
      );
      const removedEvidence = new Set(
        oldEvidence.records.filter((e) => !evidenceById.has(e.id)).map((e) => e.id),
      );
      if (
        evidence.some(
          (e) =>
            (e.threadId && removedThreads.has(e.threadId)) ||
            e.links?.some((link) => removedEvidence.has(link.toId)),
        ) ||
        threads.some(
          (t) =>
            (t.link && removedThreads.has(t.link.fromThreadId)) ||
            t.scenes?.some((s) => s.evidenceIds.some((id) => removedEvidence.has(id))),
        )
      )
        throw new Error('새로 연결된 기록이 있어 되돌리지 않았습니다. 연결을 먼저 확인해 주세요.');
      const changedOwners = new Set(
        oldEvidence.records
          .filter((old) => evidenceById.get(old.id)?.threadId !== old.threadId)
          .map((record) => record.id),
      );
      const changedThreads = new Set(
        threads
          .filter((thread) => logical(thread) !== logical(oldThreadsById.get(thread.id)))
          .map((thread) => thread.id),
      );
      for (const record of evidence) {
        if (!changedOwners.has(record.id) && oldEvidenceById.has(record.id)) continue;
        if (record.threadId && threadsById.get(record.threadId)?.studentRef !== record.studentRef)
          throw new Error('되돌릴 주제가 없거나 학생이 달라 되돌리지 않았습니다.');
      }
      for (const id of changedThreads) {
        const visited = new Set<string>();
        const start = threadsById.get(id)!;
        let thread: InquiryThread | undefined = start;
        while (thread) {
          if (visited.has(thread.id))
            throw new Error('주제 연결이 순환하게 되어 되돌리지 않았습니다.');
          visited.add(thread.id);
          if (!thread.link) break;
          const next = threadsById.get(thread.link.fromThreadId);
          if (!next || next.studentRef !== start.studentRef)
            throw new Error('연결할 주제가 없거나 학생이 달라 되돌리지 않았습니다.');
          thread = next;
        }
      }
      for (const thread of threads)
        for (const scene of thread.scenes ?? [])
          for (const id of scene.evidenceIds) {
            if (!changedOwners.has(id) && !changedThreads.has(thread.id)) continue;
            const owner = evidenceById.get(id);
            if (!owner || owner.threadId !== thread.id || owner.studentRef !== thread.studentRef)
              throw new Error(
                '새로 바뀐 장면 연결이 있어 되돌리지 않았습니다. 현재 연결을 확인해 주세요.',
              );
          }
      const changeEvidence = !sameHistoryRecords(oldEvidence.records, evidence);
      const changeThreads = !sameHistoryRecords(oldThreads.records, threads);
      if (changeEvidence)
        await recordEvidenceRepository.saveRecordEvidence({ ...oldEvidence, records: evidence });
      try {
        if (changeThreads)
          await inquiryThreadRepository.saveInquiryThreads({ ...oldThreads, records: threads });
      } catch (error) {
        if (changeEvidence) {
          try {
            await recordEvidenceRepository.saveRecordEvidence(oldEvidence);
          } catch {
            useRecordEvidenceStore.setState({ records: evidence });
            throw new Error(
              '되돌리기 저장과 복구에 실패했습니다. 일부 상태가 달라졌을 수 있으니 다시 불러와 확인해 주세요.',
            );
          }
        }
        throw error;
      }
      useRecordEvidenceStore.setState({ records: evidence });
      useInquiryThreadStore.setState({ records: threads });
    }),
  );
}
