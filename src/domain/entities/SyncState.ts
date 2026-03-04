/** 동기화 상태 */
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

/** 동기화 상태 정보 */
export interface SyncState {
  readonly status: SyncStatus;
  readonly lastSyncedAt?: string;   // ISO 8601
  readonly lastError?: string;
  readonly pendingChanges: number;
  readonly syncTokens: Readonly<Record<string, string>>;  // calendarId → syncToken
}
