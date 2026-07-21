/** Drive 동기화 파일 정보 */
export interface DriveSyncFileInfo {
  readonly lastModified: string; // ISO 8601
  readonly checksum: string; // SHA-256 hex
  readonly size: number;
  /**
   * 이 항목을 마지막으로 업로드한 기기 ID.
   * 매니페스트 최상위 deviceId는 "마지막으로 매니페스트를 쓴 기기"일 뿐 파일별 작성자가
   * 아니므로, 다운로드의 "내가 올린 데이터" 스킵 판정은 이 필드를 우선 사용한다.
   * 구버전 매니페스트 항목엔 없음(optional) — 부재 시 매니페스트 deviceId로 폴백.
   */
  readonly uploadedBy?: string;
}

/** Drive 동기화 매니페스트 */
export interface DriveSyncManifest {
  readonly version: number;
  readonly lastSyncedAt: string; // ISO 8601
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
