import type { WordCloudHistoryData } from '../entities/WordCloudSession';

export interface IWordCloudRepository {
  load(): Promise<WordCloudHistoryData | null>;
  save(data: WordCloudHistoryData): Promise<void>;
}
