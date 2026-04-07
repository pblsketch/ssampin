import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IToolTemplateRepository } from '@domain/repositories/IToolTemplateRepository';
import type { ToolTemplatesData } from '@domain/entities/ToolTemplate';

export class JsonToolTemplateRepository implements IToolTemplateRepository {
  constructor(private readonly storage: IStoragePort) {}

  load(): Promise<ToolTemplatesData | null> {
    return this.storage.read<ToolTemplatesData>('tool-templates');
  }

  save(data: ToolTemplatesData): Promise<void> {
    return this.storage.write('tool-templates', data);
  }
}
