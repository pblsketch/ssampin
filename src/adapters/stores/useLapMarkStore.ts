import { create } from 'zustand';
import { lapMarkRepository } from '@adapters/di/container';
import type { LapMark } from '@domain/entities/ObservationLap';
import { mergeLapMarkLists, upsertLapMark } from '@domain/rules/observationLaps';
import { withFileLock } from '@usecases/shared/fileWriteLock';
import { SYNC_FILE_KEYS } from '@usecases/sync/syncRegistry';

/**
 * 관찰 기록 '한 바퀴' 끝 지점 스토어(ADR-135).
 *
 * ★쓰는 자리는 메인 창의 바퀴 훅 하나뿐이다(`useObservationLapKeeper`). 위젯 창은 읽기만 한다.
 * ★끝 지점은 **더 뒤로만** 바뀐다. 저장할 때 파일의 최신 값과 합친 뒤 넣어, 그 사이 동기화로
 *   들어온 더 뒤 끝 지점을 덮지 않는다(동기화 병합과 같은 파일 락으로 직렬화).
 */
interface LapMarkState {
  marks: readonly LapMark[];
  loaded: boolean;
  load: (force?: boolean) => Promise<void>;
  /** 새 끝 지점을 넣는다. 저장된 것보다 뒤일 때만 바뀌고, 바뀌었으면 true. */
  recordMark: (mark: LapMark) => Promise<boolean>;
}

export const useLapMarkStore = create<LapMarkState>((set, get) => ({
  marks: [],
  loaded: false,

  load: async (force = false) => {
    if (get().loaded && !force) return;
    try {
      const data = await lapMarkRepository.load();
      set({ marks: mergeLapMarkLists(data?.records, []), loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  recordMark: async (mark) => {
    return withFileLock(SYNC_FILE_KEYS.observationLaps, async () => {
      const data = await lapMarkRepository.load();
      const base = mergeLapMarkLists(data?.records, get().marks);
      const { marks, changed } = upsertLapMark(base, mark);
      if (changed) await lapMarkRepository.save({ records: marks });
      set({ marks, loaded: true });
      return changed;
    });
  },
}));
