import type { DriveSyncManifest } from '../entities/DriveSyncState';
import type { DriveFolderInfo } from './IGoogleDrivePort';

/** Drive 동기화 파일 목록 항목 */
export interface DriveSyncFileListItem {
  readonly id: string;
  readonly name: string;
  readonly modifiedTime: string;
}

/** Google Drive 동기화 전용 포트 (과제수합 IGoogleDrivePort와 별도) */
export interface IDriveSyncPort {
  /** "쌤핀 동기화" 폴더 조회 또는 생성 */
  getOrCreateSyncFolder(): Promise<DriveFolderInfo>;
  /** 동기화 파일 업로드 (기존 파일 있으면 업데이트) */
  uploadSyncFile(
    folderId: string,
    filename: string,
    content: string,
  ): Promise<{ fileId: string; modifiedTime: string }>;
  /** 같은 이름 파일이 없을 때만 새로 생성. 경쟁 생성이 감지되면 null. */
  createSyncFileIfMissing(
    folderId: string,
    filename: string,
    content: string,
  ): Promise<{ fileId: string; modifiedTime: string } | null>;
  /** 기존 리모트 버전이 그대로일 때만 원자적으로 업데이트. 변경됐으면 null. */
  uploadSyncFileIfUnchanged(
    folderId: string,
    filename: string,
    content: string,
    expectedModifiedTime: string,
  ): Promise<{ fileId: string; modifiedTime: string } | null>;
  /** 동기화 파일 다운로드 (텍스트) */
  downloadSyncFile(fileId: string): Promise<string>;
  /** 동기화 매니페스트 조회 */
  getSyncManifest(folderId: string): Promise<DriveSyncManifest | null>;
  /** 동기화 매니페스트 업데이트 */
  updateSyncManifest(
    folderId: string,
    manifest: DriveSyncManifest,
    existingFileId?: string,
  ): Promise<string>;
  /** 매니페스트가 읽은 시점과 같을 때만 원자적으로 교체. 변경됐으면 false. */
  updateSyncManifestIfUnchanged(
    folderId: string,
    expected: DriveSyncManifest,
    next: DriveSyncManifest,
  ): Promise<boolean>;
  /** 동기화 폴더 내 파일 목록 조회 */
  listSyncFiles(folderId: string): Promise<DriveSyncFileListItem[]>;
  /** 동기화 폴더 내 모든 파일 삭제 (클라우드 데이터 초기화) */
  deleteSyncFolder(folderId: string): Promise<void>;
  /**
   * 동기화 폴더 안의 **파일 하나**를 지운다. 없으면 아무 일도 하지 않는다(멱등).
   *
   * ## 왜 폴더 삭제만으로는 부족한가
   *
   * 학생 얼굴 사진처럼 **개인정보를 파기해야 하는 자료**가 생기면서 필요해졌다.
   * 지금까지 클라우드 삭제 수단은 `deleteSyncFolder`(전부 지우기)뿐이라,
   * "이 반 사진만 지우기"를 하면 **로컬에서만 사라지고 클라우드에는 그대로 남았다.**
   * 그 상태로 "사진을 지웠습니다"라고 안내하면 사실이 아니게 된다.
   *
   * 휴지통이 아니라 **즉시 소멸**이어야 한다 — 휴지통에 30일 남아 있으면 파기가 아니다.
   */
  deleteSyncFile(folderId: string, filename: string): Promise<void>;
  /** 파일 수정 시각이 기대값과 같을 때만 지운다. 변경됐으면 false. */
  deleteSyncFileIfUnchanged?(
    folderId: string,
    filename: string,
    expectedModifiedTime: string,
  ): Promise<boolean>;
}
