import type { ToolResultsData } from '../entities/ToolResult';

export interface IToolResultRepository {
  load(): Promise<ToolResultsData | null>;
  save(data: ToolResultsData): Promise<void>;
}
