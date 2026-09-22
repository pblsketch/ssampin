import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { ILapMarkRepository } from '@domain/repositories/ILapMarkRepository';
import type { LapMarkData } from '@domain/entities/ObservationLap';

/** 관찰 기록 '한 바퀴' 끝 지점 — JSON('observation-laps') 영속. 동기화 대상(병합형). */
export class JsonLapMarkRepository implements ILapMarkRepository {
  constructor(private readonly storage: IStoragePort) {}

  load(): Promise<LapMarkData | null> {
    return this.storage.read<LapMarkData>('observation-laps');
  }

  save(data: LapMarkData): Promise<void> {
    return this.storage.write('observation-laps', data);
  }
}
