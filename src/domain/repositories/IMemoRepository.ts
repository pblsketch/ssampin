import type { MemosData } from '../entities/Memo';

export interface IMemoRepository {
  getMemos(): Promise<MemosData | null>;
  saveMemos(data: MemosData): Promise<void>;
}
