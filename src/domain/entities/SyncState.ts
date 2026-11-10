/** 동기화 상태 */
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline';

/** 동기화 상태 정보 */
export interface SyncState {
  readonly status: SyncStatus;
  readonly lastSyncedAt?: string; // ISO 8601
  readonly lastError?: string;
  readonly pendingChanges: number;
  readonly syncTokens: Readonly<Record<string, string>>; // calendarId → syncToken
  /**
   * calendarId → 전체 다시 받기를 마친 판 번호. 받은 일정을 해석하는 규칙을 고쳤을 때
   * 이미 저장된 일정도 고쳐지도록 한 번 전체를 다시 받는 데 쓴다(없으면 0).
   */
  readonly fullResyncVersions?: Readonly<Record<string, number>>;
}
