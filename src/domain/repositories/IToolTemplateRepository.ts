import type { ToolTemplatesData } from '../entities/ToolTemplate';

export interface IToolTemplateRepository {
  load(): Promise<ToolTemplatesData | null>;
  save(data: ToolTemplatesData): Promise<void>;
}
