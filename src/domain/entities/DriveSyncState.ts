/** Drive 동기화 파일 정보 */
export interface DriveSyncFileInfo {
  readonly lastModified: string;  // ISO 8601
  readonly checksum: string;       // SHA-256 hex
  readonly size: number;
}

/** Drive 동기화 매니페스트 */
export interface DriveSyncManifest {
  readonly version: number;
  readonly lastSyncedAt: string;   // ISO 8601
  readonly deviceId: string;
  readonly deviceName: string;
  readonly files: Readonly<Record<string, DriveSyncFileInfo>>;
}

/** Drive 동기화 상태 */
export type DriveSyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'conflict';

/** Drive 동기화 충돌 정보 */
export interface DriveSyncConflict {
  readonly filename: string;
  readonly localModified: string;
  readonly remoteModified: string;
  readonly localDeviceName: string;
  readonly remoteDeviceName: string;
}
