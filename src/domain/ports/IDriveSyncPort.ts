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
  uploadSyncFile(folderId: string, filename: string, content: string): Promise<{ fileId: string; modifiedTime: string }>;
  /** 동기화 파일 다운로드 (텍스트) */
  downloadSyncFile(fileId: string): Promise<string>;
  /** 동기화 매니페스트 조회 */
  getSyncManifest(folderId: string): Promise<DriveSyncManifest | null>;
  /** 동기화 매니페스트 업데이트 */
  updateSyncManifest(folderId: string, manifest: DriveSyncManifest, existingFileId?: string): Promise<string>;
  /** 동기화 폴더 내 파일 목록 조회 */
  listSyncFiles(folderId: string): Promise<DriveSyncFileListItem[]>;
  /** 동기화 폴더 내 모든 파일 삭제 (클라우드 데이터 초기화) */
  deleteSyncFolder(folderId: string): Promise<void>;
}
