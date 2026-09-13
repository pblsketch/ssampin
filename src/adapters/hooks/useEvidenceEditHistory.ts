import { EvidenceEditJournal, subscribeEvidenceWrites } from '@adapters/stores/evidenceEditJournal';
import { useEffect, useMemo, useReducer, useRef } from 'react';
import { EditHistory } from '@domain/rules/editHistory';
import {
  captureEvidenceHistory,
  restoreEvidenceHistory,
  sameHistoryRecords,
  type EvidenceHistoryData,
} from '@adapters/stores/restoreEvidenceHistory';
import type { EvidenceMapPositions } from './useEvidenceMapPositions';
import type { MapOffset } from '@adapters/components/RecordDraft/evidenceMapLayout';
interface Snapshot extends EvidenceHistoryData {
  readonly conflict?: boolean;
  readonly offsets: ReadonlyMap<string, MapOffset>;
}
const sameOffsets = (
  a: ReadonlyMap<string, MapOffset>,
  b: ReadonlyMap<string, MapOffset>,
): boolean =>
  a.size === b.size &&
  [...a].every(([id, value]) => b.get(id)?.dx === value.dx && b.get(id)?.dy === value.dy);
export function useEvidenceEditHistory(
  scope: string,
  studentRef: string | null,
  positions: EvidenceMapPositions,
) {
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  const { getOffsets, restore } = positions;
  const journal = useMemo(() => new EvidenceEditJournal(studentRef, scope), [scope, studentRef]);
  useEffect(() => subscribeEvidenceWrites((event) => journal.collect(event)), [journal]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const history = useMemo(
    () =>
      new EditHistory<Snapshot>(
        () => ({ ...captureEvidenceHistory(), offsets: getOffsets() }),
        (a, b) =>
          sameHistoryRecords(a.evidence, b.evidence) &&
          sameHistoryRecords(a.threads, b.threads) &&
          sameOffsets(a.offsets, b.offsets),
        async (expected, target) => {
          if (expected.conflict || target.conflict)
            throw new Error(
              '저장 중 다른 곳에서 같은 기록을 수정해 되돌리지 않았습니다. 현재 내용을 확인해 주세요.',
            );
          const moves = !sameOffsets(expected.offsets, target.offsets);
          if (moves && !sameOffsets(getOffsets(), expected.offsets))
            throw new Error('지도 위치가 바뀌어 되돌리지 않았습니다.');
          await restoreEvidenceHistory(expected, target);
          if (moves) restore(target.offsets);
        },
        () => {
          if (mounted.current) refresh();
        },
        50,
        {
          start: () => journal.start(),
          finish: (before, after) => {
            const changes = journal.finish();
            return {
              before: { ...changes.before, offsets: before.offsets, conflict: changes.conflict },
              after: { ...changes.after, offsets: after.offsets, conflict: changes.conflict },
            };
          },
        },
      ),
    [getOffsets, restore, journal],
  );
  const wrap =
    <A extends unknown[], R>(
      action: (...args: A) => Promise<R>,
      label = '근거 정리',
    ): ((...args: A) => Promise<R>) =>
    (...args) =>
      history.run(label, () => action(...args));
  const importRun = async <T>(refs: readonly string[], action: () => Promise<T>): Promise<T> => {
    const previous = journal.allowed;
    journal.allowed = new Set([...previous, ...refs]);
    try {
      return await history.run('엑셀 가져오기', action);
    } finally {
      journal.allowed = previous;
    }
  };
  return { history, wrap, importRun };
}
