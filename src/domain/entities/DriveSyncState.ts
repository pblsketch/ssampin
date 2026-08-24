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
  /**
   * 논리 키와 실제 Drive 파일명이 다를 때의 물리 파일명.
   * 삭제된 사진을 복원할 때는 이전 세대 파일과 다른 이름을 써서 늦게 도착한 삭제가
   * 새 복원본을 지우지 못하게 한다. 구버전 항목은 없으며 기존 규칙으로 폴백한다.
   */
  readonly driveFilename?: string;
}

/** 여러 기기에 전달되는 명시적 삭제 기록. 실제 파일보다 장부에 먼저 확정한다. */
export interface DriveSyncDeletionInfo {
  readonly deletedAt: string;
  readonly deletedBy: string;
  readonly deletionId?: string;
  /** 재시도 때도 정확한 물리 세대를 지우기 위한 Drive 파일명. */
  readonly driveFilename?: string;
  /** 삭제를 요청한 시점의 물리 파일 revision. 다른 세대로 바뀌면 삭제하지 않는다. */
  readonly expectedModifiedTime?: string;
}

export function driveSyncDeletionIdentity(deletion: DriveSyncDeletionInfo): string {
  return deletion.deletionId ?? `${deletion.deletedBy}:${deletion.deletedAt}`;
}

/** 삭제된 동일 경로에 사용자가 사진을 다시 등록한 세대 기록. */
export interface DriveSyncRestorationInfo {
  readonly restoredAt: string;
  readonly restoredBy: string;
  /** 이 복원으로 취소할 정확한 삭제 세대. 다른 삭제 세대에는 효력이 없다. */
  readonly replacesDeletionId: string;
  /** 원격 파일 업로드와 장부 반영까지 끝난 복원 세대에만 존재한다. */
  readonly completedAt?: string;
}

/** Drive 동기화 매니페스트 */
export interface DriveSyncManifest {
  readonly version: number;
  readonly lastSyncedAt: string; // ISO 8601
  readonly deviceId: string;
  readonly deviceName: string;
  readonly files: Readonly<Record<string, DriveSyncFileInfo>>;
  readonly deletions?: Readonly<Record<string, DriveSyncDeletionInfo>>;
  readonly restorations?: Readonly<Record<string, DriveSyncRestorationInfo>>;
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
  readonly kind?: 'json' | 'binary';
  readonly baselineChecksum?: string | null;
  readonly localChecksum?: string | null;
  readonly remoteChecksum?: string;
}
