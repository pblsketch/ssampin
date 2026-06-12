import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IRubricRepository } from '@domain/repositories/IRubricRepository';
import type { RubricsData } from '@domain/entities/Rubric';

export class JsonRubricRepository implements IRubricRepository {
  constructor(private readonly storage: IStoragePort) {}

  load(): Promise<RubricsData | null> {
    return this.storage.read<RubricsData>('rubrics');
  }

  save(data: RubricsData): Promise<void> {
    return this.storage.write('rubrics', data);
  }
}
