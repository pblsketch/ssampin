import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IToolResultRepository } from '@domain/repositories/IToolResultRepository';
import type { ToolResultsData } from '@domain/entities/ToolResult';

export class JsonToolResultRepository implements IToolResultRepository {
  constructor(private readonly storage: IStoragePort) {}

  load(): Promise<ToolResultsData | null> {
    return this.storage.read<ToolResultsData>('tool-results');
  }

  save(data: ToolResultsData): Promise<void> {
    return this.storage.write('tool-results', data);
  }
}
