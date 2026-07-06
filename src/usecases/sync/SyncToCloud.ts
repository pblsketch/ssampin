import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type { DriveSyncManifest, DriveSyncFileInfo } from '@domain/entities/DriveSyncState';
import { uint8ToBase64 } from './binaryBase64';

/** SHA-256 체크섬 계산 (Web Crypto API) */
async function computeChecksum(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// SYNC_FILES와 SyncFileName은 syncRegistry로 단일화됨.
// 본 파일 내부 사용 + 기존 import 경로(`from './SyncToCloud'`) 호환을 위해 import + re-export.
import { SYNC_FILES } from './syncRegistry';
export { SYNC_FILES };
export type { SyncFileName } from './syncRegistry';

/**
 * 런타임에 결정되는 동적 파일 키 목록을 반환하는 훅 타입.
 * 노트 페이지 본문(`note-body--{pageId}`)처럼 페이지 수에 따라 개수가 변하는
 * 도메인을 SyncToCloud / SyncFromCloud에 주입할 때 사용.
 */
export type GetDynamicSyncFiles = () => Promise<string[]>;

/**
 * 동적 바이너리 키 목록을 반환하는 훅 타입.
 * 관찰 첨부(`obs-attachments/{id}.{ext}`)처럼 바이너리 스토어에 저장된 파일의
 * 상대 경로 목록을 반환한다. SyncToCloud/SyncFromCloud는 이 키에 대해
 * readBinary→base64→JSON 래퍼 / JSON 래퍼→base64 디코드→writeBinary 경로를 사용한다.
 */
export type GetBinaryDynamicSyncFiles = () => Promise<string[]>;

export interface SyncToCloudResult {
  readonly uploaded: string[];
  readonly skipped: string[];
  /**
   * 리모트가 내 마지막 동기화 이후 변경되어 업로드를 미룬 파일들.
   * (skipped에도 포함됨 — 요약 UI 집계 호환)
   * 호출자는 syncFromCloud(병합) 후 syncToCloud를 1회 재시도해
   * 로컬 변경분이 고아가 되지 않게 해야 한다.
   */
  readonly deferred: string[];
}

export interface SyncProgress {
  current: number;
  total: number;
  filename: string;
}

/**
 * 로컬 데이터를 Google Drive에 업로드하는 UseCase
 */
export class SyncToCloud {
  constructor(
    private readonly storage: IStoragePort,
    private readonly drivePort: IDriveSyncPort,
    private readonly syncRepo: IDriveSyncRepository,
    private readonly deviceId: string,
    private readonly deviceName: string,
    private readonly getDynamicSyncFiles?: GetDynamicSyncFiles,
    private readonly getBinaryDynamicSyncFiles?: GetBinaryDynamicSyncFiles,
  ) {}

  async execute(onProgress?: (progress: SyncProgress) => void): Promise<SyncToCloudResult> {
    console.log(`[SyncToCloud] ▶ 시작 | deviceId=${this.deviceId} | deviceName=${this.deviceName}`);
    const folder = await this.drivePort.getOrCreateSyncFolder();
    const localManifest = await this.syncRepo.getLocalManifest();
    const uploaded: string[] = [];
    const skipped: string[] = [];
    const deferred: string[] = [];
    const total = SYNC_FILES.length;

    // 리모트 매니페스트를 먼저 읽어 다른 기기가 올린 파일 엔트리를 보존
    const remoteManifest = await this.drivePort.getSyncManifest(folder.id);
    console.log(`[SyncToCloud] 리모트 매니페스트 deviceId=${remoteManifest?.deviceId ?? 'NONE'}`);
    console.log(`[SyncToCloud] 로컬 매니페스트 deviceId=${localManifest?.deviceId ?? 'NONE'}`);
    const updatedFiles: Record<string, DriveSyncFileInfo> = {
      ...(remoteManifest?.files ?? {}),
      ...(localManifest?.files ?? {}),
    };

    // 동적 파일 목록 사전 조회 — 진행률 total 계산에 포함
    const dynamicFiles = this.getDynamicSyncFiles ? await this.getDynamicSyncFiles() : [];
    const binaryFilesPreview = this.getBinaryDynamicSyncFiles
      ? await this.getBinaryDynamicSyncFiles()
      : [];
    const grandTotal = total + dynamicFiles.length + binaryFilesPreview.length;

    // 정적/동적 파일 모두 동일 로직으로 처리하기 위한 헬퍼
    const uploadOne = async (filename: string, current: number): Promise<void> => {
      onProgress?.({ current, total: grandTotal, filename });

      const data = await this.storage.read<unknown>(filename);
      if (data === null) {
        skipped.push(filename);
        console.log(`[SyncToCloud]   ${filename}: SKIP (데이터 없음)`);
        return;
      }

      const content = JSON.stringify(data);
      const checksum = await computeChecksum(content);
      const manifestChecksum = localManifest?.files[filename]?.checksum;

      // 체크섬이 같으면 스킵
      if (manifestChecksum === checksum) {
        skipped.push(filename);
        return;
      }

      // 리모트가 우리 마지막 동기화 이후 변경되었으면 업로드 유예 (다른 기기가 올린 최신 데이터 보호)
      const remoteChecksum = remoteManifest?.files[filename]?.checksum;
      if (remoteChecksum && manifestChecksum && remoteChecksum !== manifestChecksum) {
        console.log(
          `[SyncToCloud]   ${filename}: DEFER (remote changed: local-manifest=${manifestChecksum.slice(0, 8)} remote=${remoteChecksum.slice(0, 8)}, syncFromCloud 병합 후 재업로드 필요)`,
        );
        skipped.push(filename);
        deferred.push(filename);
        return;
      }

      console.log(
        `[SyncToCloud]   ${filename}: UPLOAD (checksum ${manifestChecksum?.slice(0, 8) ?? 'NONE'} → ${checksum.slice(0, 8)})`,
      );
      const result = await this.drivePort.uploadSyncFile(folder.id, `${filename}.json`, content);
      updatedFiles[filename] = {
        lastModified: result.modifiedTime,
        checksum,
        size: new TextEncoder().encode(content).length,
      };
      uploaded.push(filename);
    };

    let index = 0;
    for (const filename of SYNC_FILES) {
      index++;
      await uploadOne(filename, index);
    }

    // 동적 파일(예: note-body--{pageId}) 업로드 — 정적 루프와 동일 로직
    for (const filename of dynamicFiles) {
      index++;
      await uploadOne(filename, index);
    }

    // 바이너리 동적 파일(예: obs-attachments/{id}.{ext}) 업로드 — base64 JSON 래퍼 경유
    for (const relPath of binaryFilesPreview) {
      index++;
      onProgress?.({ current: index, total: grandTotal, filename: relPath });

      const bytes = await this.storage.readBinary(relPath);
      if (bytes === null) {
        skipped.push(relPath);
        console.log(`[SyncToCloud]   ${relPath}: SKIP (바이너리 없음)`);
        continue;
      }

      // base64 래핑 — Drive JSON 파이프라인 재사용 (대용량 안전 청크 인코딩)
      const base64 = uint8ToBase64(bytes);
      const wrapper = { __binaryBase64: base64, __relPath: relPath };
      const content = JSON.stringify(wrapper);
      const checksum = await computeChecksum(content);
      const manifestChecksum = localManifest?.files[relPath]?.checksum;

      if (manifestChecksum === checksum) {
        skipped.push(relPath);
        continue;
      }

      const remoteChecksum = remoteManifest?.files[relPath]?.checksum;
      if (remoteChecksum && manifestChecksum && remoteChecksum !== manifestChecksum) {
        console.log(
          `[SyncToCloud]   ${relPath}: DEFER (remote changed, syncFromCloud 병합 후 재업로드 필요)`,
        );
        skipped.push(relPath);
        deferred.push(relPath);
        continue;
      }

      console.log(
        `[SyncToCloud]   ${relPath}: UPLOAD binary (checksum ${manifestChecksum?.slice(0, 8) ?? 'NONE'} → ${checksum.slice(0, 8)})`,
      );
      // Drive 파일명: slashes를 '__'로 치환해 단일 파일명으로 평탄화
      const driveFilename = `${relPath.replace(/\//g, '__')}.json`;
      const result = await this.drivePort.uploadSyncFile(folder.id, driveFilename, content);
      updatedFiles[relPath] = {
        lastModified: result.modifiedTime,
        checksum,
        size: new TextEncoder().encode(content).length,
      };
      uploaded.push(relPath);
    }

    // 매니페스트 업데이트
    const newManifest: DriveSyncManifest = {
      version: 1,
      lastSyncedAt: new Date().toISOString(),
      deviceId: this.deviceId,
      deviceName: this.deviceName,
      files: updatedFiles,
    };

    await this.drivePort.updateSyncManifest(folder.id, newManifest);
    await this.syncRepo.saveLocalManifest(newManifest);

    console.log(
      `[SyncToCloud] ✅ 완료 | uploaded=${uploaded.length} skipped=${skipped.length} deferred=${deferred.length} | uploaded=[${uploaded.join(', ')}]`,
    );
    return { uploaded, skipped, deferred };
  }
}
