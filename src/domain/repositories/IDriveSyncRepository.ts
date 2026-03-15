import type { DriveSyncManifest } from '../entities/DriveSyncState';

/** Drive 동기화 로컬 매니페스트 저장소 */
export interface IDriveSyncRepository {
  getLocalManifest(): Promise<DriveSyncManifest | null>;
  saveLocalManifest(manifest: DriveSyncManifest): Promise<void>;
}
