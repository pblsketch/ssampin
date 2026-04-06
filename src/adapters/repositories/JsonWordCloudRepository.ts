import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IWordCloudRepository } from '@domain/repositories/IWordCloudRepository';
import type { WordCloudHistoryData } from '@domain/entities/WordCloudSession';

export class JsonWordCloudRepository implements IWordCloudRepository {
  constructor(private readonly storage: IStoragePort) {}

  load(): Promise<WordCloudHistoryData | null> {
    return this.storage.read<WordCloudHistoryData>('wordcloud-history');
  }

  save(data: WordCloudHistoryData): Promise<void> {
    return this.storage.write('wordcloud-history', data);
  }
}
