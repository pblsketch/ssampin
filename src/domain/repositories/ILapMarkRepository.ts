import type { LapMarkData } from '../entities/ObservationLap';

/**
 * 관찰 기록 '한 바퀴' 끝 지점 저장소(ADR-135) — 동기화 파일 'observation-laps'.
 * 끝난 바퀴를 고정하는 기준만 담는다. 관찰 기록 자체는 담지 않는다.
 */
export interface ILapMarkRepository {
  load(): Promise<LapMarkData | null>;
  save(data: LapMarkData): Promise<void>;
}
