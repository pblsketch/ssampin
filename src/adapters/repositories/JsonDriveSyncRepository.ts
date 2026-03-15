import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type { DriveSyncManifest } from '@domain/entities/DriveSyncState';

export class JsonDriveSyncRepository implements IDriveSyncRepository {
  constructor(private readonly storage: IStoragePort) {}

  getLocalManifest(): Promise<DriveSyncManifest | null> {
    return this.storage.read<DriveSyncManifest>('drive-sync-manifest');
  }

  saveLocalManifest(manifest: DriveSyncManifest): Promise<void> {
    return this.storage.write('drive-sync-manifest', manifest);
  }
}
