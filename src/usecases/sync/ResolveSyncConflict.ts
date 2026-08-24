import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type { DriveSyncConflict, DriveSyncFileInfo } from '@domain/entities/DriveSyncState';
import { computeSyncChecksum } from './SyncToCloud';
import { preserveNewerTermGuard, type TermGuardSnapshot } from './SyncFromCloud';
import { base64ToUint8, uint8ToBase64 } from './binaryBase64';
import { withFileLock } from '@usecases/shared/fileWriteLock';
import { withDataOperationLock } from '@usecases/shared/dataOperationMutex';

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

  private async readLocalChecksum(conflict: DriveSyncConflict): Promise<string | null> {
    if (conflict.kind === 'binary') {
      const bytes = await this.storage.readBinary(conflict.filename);
      if (bytes === null) return null;
      return computeSyncChecksum(
        JSON.stringify({
          __binaryBase64: uint8ToBase64(bytes),
          __relPath: conflict.filename,
        }),
      );
    }
    const data = await this.storage.read<unknown>(conflict.filename);
    return data === null ? null : computeSyncChecksum(JSON.stringify(data));
  }

  private driveFilename(conflict: DriveSyncConflict, info?: DriveSyncFileInfo): string {
    return (
      info?.driveFilename ??
      (conflict.kind === 'binary'
        ? `${conflict.filename.replace(/\//g, '__')}.json`
        : `${conflict.filename}.json`)
    );
  }

  private async updateRemoteManifestSafely(
    folderId: string,
    deviceId: string,
    deviceName: string,
    filename: string,
    expectedPreviousInfo: DriveSyncFileInfo,
    fileInfo: DriveSyncFileInfo,
  ): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const latest = await this.drivePort.getSyncManifest(folderId);
      if (!latest) throw new Error('클라우드 동기화 장부를 다시 확인하지 못했습니다.');
      const latestInfo = latest.files[filename];
      if (
        !latestInfo ||
        latestInfo.lastModified !== expectedPreviousInfo.lastModified ||
        latestInfo.checksum !== expectedPreviousInfo.checksum
      ) {
        throw new StaleSyncConflictError();
      }
      const next = {
        ...latest,
        version: Math.max(2, latest.version),
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
    return withDataOperationLock(() => this.executeUnlocked(conflict, resolution));
  }

  private async executeUnlocked(
    conflict: DriveSyncConflict,
    resolution: 'local' | 'remote',
  ): Promise<void> {
    const expectedLocalChecksum =
      conflict.localChecksum !== undefined
        ? conflict.localChecksum
        : await this.readLocalChecksum(conflict);
    const folder = await this.drivePort.getOrCreateSyncFolder();
    const localManifest = await this.syncRepo.getLocalManifest();
    const remoteManifest = await this.drivePort.getSyncManifest(folder.id);

    if (!remoteManifest) throw new Error('클라우드 동기화 장부가 없어 충돌을 해결할 수 없습니다.');
    const remoteFileInfo = remoteManifest.files[conflict.filename];
    const driveFilename = this.driveFilename(conflict, remoteFileInfo);
    const remoteFiles = await this.drivePort.listSyncFiles(folder.id);
    const driveFile = remoteFiles.find((f) => f.name === driveFilename);
    const manifest = localManifest ?? {
      version: remoteManifest.version,
      lastSyncedAt: new Date(0).toISOString(),
      deviceId: this.currentDeviceId,
      deviceName: this.currentDeviceName || conflict.localDeviceName,
      files: {},
      deletions: remoteManifest.deletions,
      restorations: undefined,
    };

    if (resolution === 'local') {
      await withFileLock(conflict.filename, async () => {
        if ((await this.readLocalChecksum(conflict)) !== expectedLocalChecksum) {
          throw new StaleSyncConflictError();
        }
        const preUploadManifest = await this.drivePort.getSyncManifest(folder.id);
        const currentRemoteInfo = preUploadManifest?.files[conflict.filename];
        if (
          !preUploadManifest ||
          currentRemoteInfo?.lastModified !== conflict.remoteModified ||
          (conflict.remoteChecksum !== undefined &&
            currentRemoteInfo.checksum !== conflict.remoteChecksum)
        ) {
          throw new StaleSyncConflictError();
        }

        let content: string;
        if (conflict.kind === 'binary') {
          const bytes = await this.storage.readBinary(conflict.filename);
          if (bytes === null) {
            throw new Error(`이 기기의 ${conflict.filename} 데이터가 없습니다.`);
          }
          content = JSON.stringify({
            __binaryBase64: uint8ToBase64(bytes),
            __relPath: conflict.filename,
          });
        } else {
          const data = await this.storage.read<unknown>(conflict.filename);
          if (data === null) {
            throw new Error(`이 기기의 ${conflict.filename} 데이터가 없습니다.`);
          }
          content = JSON.stringify(data);
        }

        const checksum = await computeSyncChecksum(content);
        if (checksum !== expectedLocalChecksum) throw new StaleSyncConflictError();
        const immutableStudentPhoto =
          conflict.kind === 'binary' && conflict.filename.startsWith('student-photos/');
        const baseDriveFilename = this.driveFilename(conflict);
        const generation = `${checksum}-${this.currentDeviceId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
        const resolvedDriveFilename = immutableStudentPhoto
          ? `${baseDriveFilename}.rev-${generation}`
          : this.driveFilename(conflict, currentRemoteInfo);
        let result: { fileId: string; modifiedTime: string } | null;
        const existingGeneration = immutableStudentPhoto
          ? remoteFiles.find((file) => file.name === resolvedDriveFilename)
          : undefined;
        if (existingGeneration) {
          const existingContent = await this.drivePort.downloadSyncFile(existingGeneration.id);
          if ((await computeSyncChecksum(existingContent)) !== checksum) {
            throw new StaleSyncConflictError();
          }
          result = {
            fileId: existingGeneration.id,
            modifiedTime: existingGeneration.modifiedTime,
          };
        } else if (immutableStudentPhoto) {
          result = await this.drivePort.createSyncFileIfMissing(
            folder.id,
            resolvedDriveFilename,
            content,
          );
        } else {
          result = await this.drivePort.uploadSyncFileIfUnchanged(
            folder.id,
            resolvedDriveFilename,
            content,
            conflict.remoteModified,
          );
        }
        if (!result) throw new StaleSyncConflictError();
        const now = new Date().toISOString();
        const fileInfo: DriveSyncFileInfo = {
          lastModified: result.modifiedTime,
          checksum,
          size: new TextEncoder().encode(content).length,
          uploadedBy: manifest.deviceId,
          ...(resolvedDriveFilename !== baseDriveFilename
            ? { driveFilename: resolvedDriveFilename }
            : {}),
        };
        const uploadedSnapshotManifest = {
          ...manifest,
          version: Math.max(2, manifest.version),
          lastSyncedAt: now,
          files: { ...manifest.files, [conflict.filename]: fileInfo },
        };
        try {
          await this.updateRemoteManifestSafely(
            folder.id,
            manifest.deviceId,
            manifest.deviceName,
            conflict.filename,
            currentRemoteInfo,
            fileInfo,
          );
        } catch (err) {
          await this.syncRepo.saveLocalManifest(uploadedSnapshotManifest);
          throw err;
        }
        await this.syncRepo.saveLocalManifest(uploadedSnapshotManifest);
      });
      return;
    }

    if (!driveFile)
      throw new Error(`클라우드에서 ${conflict.filename}.json 파일을 찾지 못했습니다.`);
    if (!remoteFileInfo) {
      throw new Error(`클라우드 장부에 ${conflict.filename} 항목이 없습니다.`);
    }
    if (
      remoteFileInfo.lastModified !== conflict.remoteModified ||
      (conflict.remoteChecksum !== undefined && remoteFileInfo.checksum !== conflict.remoteChecksum)
    ) {
      throw new StaleSyncConflictError();
    }

    const content = await this.drivePort.downloadSyncFile(driveFile.id);
    const downloadedChecksum = await computeSyncChecksum(content);
    if (downloadedChecksum !== remoteFileInfo.checksum) {
      throw new Error(`클라우드 ${conflict.filename} 파일의 체크섬이 장부와 일치하지 않습니다.`);
    }

    const parsed = JSON.parse(content) as unknown;
    let dataToWrite = parsed;
    let binaryToWrite: Uint8Array | null = null;
    if (conflict.kind === 'binary') {
      const wrapper = parsed as { __binaryBase64?: unknown; __relPath?: unknown };
      if (typeof wrapper.__binaryBase64 !== 'string' || wrapper.__relPath !== conflict.filename) {
        throw new Error(`클라우드 ${conflict.filename} 바이너리 형식이 올바르지 않습니다.`);
      }
      binaryToWrite = base64ToUint8(wrapper.__binaryBase64);
    } else if (conflict.filename === 'settings') {
      const localSettings = await this.storage.read<TermGuardSnapshot>('settings');
      dataToWrite = preserveNewerTermGuard(parsed, localSettings ?? {});
    }

    const correctedContent = JSON.stringify(dataToWrite);
    const correctedChecksum = await computeSyncChecksum(correctedContent);
    let resolvedFileInfo = remoteFileInfo;
    if (conflict.kind !== 'binary' && correctedChecksum !== remoteFileInfo.checksum) {
      // settings 학기 가드를 보존해 내용이 달라졌다면 교정본을 즉시 클라우드에도 반영한다.
      const result = await this.drivePort.uploadSyncFileIfUnchanged(
        folder.id,
        driveFilename,
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
        remoteFileInfo,
        resolvedFileInfo,
      );
    }

    const nextLocalManifest = {
      ...manifest,
      version: Math.max(2, manifest.version),
      lastSyncedAt: new Date().toISOString(),
      files: { ...manifest.files, [conflict.filename]: resolvedFileInfo },
    };

    // 실제 데이터를 CAS로 먼저 확정한다. 장부를 먼저 쓰면 뒤의 데이터
    // 쓰기 실패가 장부와 실제 내용을 엇갈리게 만든다. 장부 저장만 실패하면 다음
    // 동기화가 실제 체크섬을 기준으로 안전하게 재수렴시킨다.
    await withFileLock(conflict.filename, async () => {
      if (binaryToWrite !== null) {
        const current = await this.storage.readBinary(conflict.filename);
        const currentChecksum = await this.readLocalChecksum(conflict);
        if (currentChecksum !== expectedLocalChecksum) throw new StaleSyncConflictError();
        const replaced = this.storage.replaceBinaryIfUnchanged
          ? await this.storage.replaceBinaryIfUnchanged(conflict.filename, current, binaryToWrite)
          : await (async (): Promise<boolean> => {
              if ((await this.readLocalChecksum(conflict)) !== expectedLocalChecksum) return false;
              await this.storage.writeBinary(conflict.filename, binaryToWrite);
              return true;
            })();
        if (!replaced) throw new StaleSyncConflictError();
      } else {
        const current = await this.storage.read<unknown>(conflict.filename);
        const currentChecksum =
          current === null ? null : await computeSyncChecksum(JSON.stringify(current));
        if (currentChecksum !== expectedLocalChecksum) throw new StaleSyncConflictError();
        const replaced = this.storage.replaceIfUnchanged
          ? await this.storage.replaceIfUnchanged(conflict.filename, current, dataToWrite)
          : await (async (): Promise<boolean> => {
              if ((await this.readLocalChecksum(conflict)) !== expectedLocalChecksum) return false;
              await this.storage.write(conflict.filename, dataToWrite);
              return true;
            })();
        if (!replaced) throw new StaleSyncConflictError();
      }
      await this.syncRepo.saveLocalManifest(nextLocalManifest);
    });
  }
}
