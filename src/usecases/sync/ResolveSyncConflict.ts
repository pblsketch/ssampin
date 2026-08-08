import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type { DriveSyncConflict, DriveSyncFileInfo } from '@domain/entities/DriveSyncState';
import { computeSyncChecksum } from './SyncToCloud';
import { preserveNewerTermGuard, type TermGuardSnapshot } from './SyncFromCloud';

export class StaleSyncConflictError extends Error {
  constructor() {
    super('클라우드 데이터가 다시 변경되었습니다. 최신 상태를 다시 확인합니다.');
    this.name = 'StaleSyncConflictError';
  }
}

/**
 * 동기화 충돌 해결 UseCase
 */
export class ResolveSyncConflict {
  constructor(
    private readonly storage: IStoragePort,
    private readonly drivePort: IDriveSyncPort,
    private readonly syncRepo: IDriveSyncRepository,
    private readonly currentDeviceId = 'unknown-device',
    private readonly currentDeviceName = '현재 기기',
  ) {}

  private async updateRemoteManifestSafely(
    folderId: string,
    deviceId: string,
    deviceName: string,
    filename: string,
    fileInfo: DriveSyncFileInfo,
  ): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const latest = await this.drivePort.getSyncManifest(folderId);
      if (!latest) throw new Error('클라우드 동기화 장부를 다시 확인하지 못했습니다.');
      const next = {
        ...latest,
        deviceId,
        deviceName,
        lastSyncedAt: new Date().toISOString(),
        files: { ...latest.files, [filename]: fileInfo },
      };
      if (await this.drivePort.updateSyncManifestIfUnchanged(folderId, latest, next)) return;
    }
    throw new StaleSyncConflictError();
  }

  async execute(conflict: DriveSyncConflict, resolution: 'local' | 'remote'): Promise<void> {
    const folder = await this.drivePort.getOrCreateSyncFolder();
    const remoteFiles = await this.drivePort.listSyncFiles(folder.id);
    const driveFile = remoteFiles.find((f) => f.name === `${conflict.filename}.json`);
    const localManifest = await this.syncRepo.getLocalManifest();
    const remoteManifest = await this.drivePort.getSyncManifest(folder.id);

    if (!remoteManifest) throw new Error('클라우드 동기화 장부가 없어 충돌을 해결할 수 없습니다.');
    const manifest = localManifest ?? {
      version: remoteManifest.version,
      lastSyncedAt: new Date(0).toISOString(),
      deviceId: this.currentDeviceId,
      deviceName: this.currentDeviceName || conflict.localDeviceName,
      files: {},
    };

    if (resolution === 'local') {
      // 충돌 화면을 띄운 뒤 다른 기기가 같은 파일을 갱신했다면 낡은 선택으로 덮어쓰지 않는다.
      const preUploadManifest = await this.drivePort.getSyncManifest(folder.id);
      const currentRemoteInfo = preUploadManifest?.files[conflict.filename];
      if (!preUploadManifest || currentRemoteInfo?.lastModified !== conflict.remoteModified) {
        throw new StaleSyncConflictError();
      }

      const data = await this.storage.read<unknown>(conflict.filename);
      if (data === null) throw new Error(`이 기기의 ${conflict.filename} 데이터가 없습니다.`);

      const content = JSON.stringify(data);
      const checksum = await computeSyncChecksum(content);
      const result = await this.drivePort.uploadSyncFileIfUnchanged(
        folder.id,
        `${conflict.filename}.json`,
        content,
        conflict.remoteModified,
      );
      if (!result) throw new StaleSyncConflictError();
      const now = new Date().toISOString();
      const fileInfo: DriveSyncFileInfo = {
        lastModified: result.modifiedTime,
        checksum,
        size: new TextEncoder().encode(content).length,
        uploadedBy: manifest.deviceId,
      };
      await this.updateRemoteManifestSafely(
        folder.id,
        manifest.deviceId,
        manifest.deviceName,
        conflict.filename,
        fileInfo,
      );
      await this.syncRepo.saveLocalManifest({
        ...manifest,
        lastSyncedAt: now,
        files: { ...manifest.files, [conflict.filename]: fileInfo },
      });
      return;
    }

    if (!driveFile)
      throw new Error(`클라우드에서 ${conflict.filename}.json 파일을 찾지 못했습니다.`);
    const remoteFileInfo = remoteManifest.files[conflict.filename];
    if (!remoteFileInfo) {
      throw new Error(`클라우드 장부에 ${conflict.filename} 항목이 없습니다.`);
    }

    const content = await this.drivePort.downloadSyncFile(driveFile.id);
    const downloadedChecksum = await computeSyncChecksum(content);
    if (downloadedChecksum !== remoteFileInfo.checksum) {
      throw new Error(`클라우드 ${conflict.filename} 파일의 체크섬이 장부와 일치하지 않습니다.`);
    }

    const parsed = JSON.parse(content) as unknown;
    let dataToWrite = parsed;
    if (conflict.filename === 'settings') {
      const localSettings = await this.storage.read<TermGuardSnapshot>('settings');
      dataToWrite = preserveNewerTermGuard(parsed, localSettings ?? {});
    }

    const correctedContent = JSON.stringify(dataToWrite);
    const correctedChecksum = await computeSyncChecksum(correctedContent);
    let resolvedFileInfo = remoteFileInfo;
    if (correctedChecksum !== remoteFileInfo.checksum) {
      // settings 학기 가드를 보존해 내용이 달라졌다면 교정본을 즉시 클라우드에도 반영한다.
      const result = await this.drivePort.uploadSyncFileIfUnchanged(
        folder.id,
        `${conflict.filename}.json`,
        correctedContent,
        remoteFileInfo.lastModified,
      );
      if (!result) throw new StaleSyncConflictError();
      resolvedFileInfo = {
        lastModified: result.modifiedTime,
        checksum: correctedChecksum,
        size: new TextEncoder().encode(correctedContent).length,
        uploadedBy: manifest.deviceId,
      };
      await this.updateRemoteManifestSafely(
        folder.id,
        manifest.deviceId,
        manifest.deviceName,
        conflict.filename,
        resolvedFileInfo,
      );
    }

    const nextLocalManifest = {
      ...manifest,
      lastSyncedAt: new Date().toISOString(),
      files: { ...manifest.files, [conflict.filename]: resolvedFileInfo },
    };

    // 로컬 원본을 덮기 전에 클라우드 교정/CAS와 로컬 장부 저장을 모두 끝낸다.
    // 앞 단계가 실패하면 사용자가 선택하기 전의 로컬 데이터가 그대로 남는다.
    // 장부 저장 뒤 데이터 쓰기가 실패하더라도 실제 내용 체크섬 검사가 다시 충돌로
    // 올리므로, 조용한 데이터 손실 대신 복구 가능한 불일치 상태가 된다.
    await this.syncRepo.saveLocalManifest(nextLocalManifest);
    await this.storage.write(conflict.filename, dataToWrite);
  }
}
