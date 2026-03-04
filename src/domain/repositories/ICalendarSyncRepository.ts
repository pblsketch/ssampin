import type { GoogleAuthTokens } from '../ports/IGoogleAuthPort';
import type { CalendarMapping } from '../entities/CalendarMapping';
import type { SyncState } from '../entities/SyncState';
import type { SyncQueueItem } from '../entities/SyncQueueItem';

/** 캘린더 동기화 저장소 인터페이스 */
export interface ICalendarSyncRepository {
  // 인증 토큰
  getAuthTokens(): Promise<GoogleAuthTokens | null>;
  saveAuthTokens(tokens: GoogleAuthTokens): Promise<void>;
  deleteAuthTokens(): Promise<void>;

  // 매핑
  getMappings(): Promise<readonly CalendarMapping[]>;
  saveMappings(mappings: readonly CalendarMapping[]): Promise<void>;

  // 동기화 상태
  getSyncState(): Promise<SyncState>;
  saveSyncState(state: SyncState): Promise<void>;

  // 오프라인 큐
  getQueue(): Promise<readonly SyncQueueItem[]>;
  addToQueue(item: SyncQueueItem): Promise<void>;
  removeFromQueue(id: string): Promise<void>;
  clearQueue(): Promise<void>;
}
