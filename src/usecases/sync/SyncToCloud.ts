import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type { DriveSyncFileInfo } from '@domain/entities/DriveSyncState';
import { uint8ToBase64 } from './binaryBase64';

/** SHA-256 체크섬 계산 (Web Crypto API) */
export async function computeSyncChecksum(content: string): Promise<string> {
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
import {
  YEAR_TRANSITION_REMOVED_KEY,
  type YearTransitionRemovedMarker,
} from '../schoolYear/ExecuteYearTransition';

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

/**
 * (S4.1) 로컬 아카이브 파일 키(`archives/{term}/{relPath}`) 열거 훅.
 * 데스크톱만 주입한다(archiveSyncGateway — archive:list/read IPC 경유).
 * 미주입 = 아카이브 동기화 전체 비활성(모바일·브라우저 모드 — 기존 동작 무변경).
 */
export type GetArchiveSyncFiles = () => Promise<string[]>;

/**
 * (S4.1) 아카이브 파일 1개의 바이트 읽기 훅 — archive:read(체크섬 검증 포함) 경유.
 * 부재·검증 실패 시 null(해당 파일만 스킵 — 다음 동기화에서 재시도).
 */
export type ReadArchiveSyncFile = (key: string) => Promise<Uint8Array | null>;

/**
 * (S4.1) 아카이브 키 업로드 순서 — 학기별로 묶고, 각 학기의 manifest.json을 그 학기의
 * 맨 뒤로 보낸다. "리모트에 manifest.json이 있다 = 그 학기 업로드가 완결됐다"는
 * 다운로드 측 판정의 성립 조건이다(부분 업로드 학기를 새 기기가 들여오지 않게).
 */
export function sortArchiveSyncKeysManifestLast(keys: readonly string[]): string[] {
  const termOf = (k: string): string => k.split('/')[1] ?? '';
  const isManifest = (k: string): boolean => k.endsWith('/manifest.json');
  return [...keys].sort((a, b) => {
    const at = termOf(a);
    const bt = termOf(b);
    if (at !== bt) return at.localeCompare(bt);
    const am = isManifest(a) ? 1 : 0;
    const bm = isManifest(b) ? 1 : 0;
    if (am !== bm) return am - bm;
    return a.localeCompare(b);
  });
}

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
    /** (S4.1) 아카이브 훅 2종 — 둘 다 주입될 때만 아카이브 업로드가 켜진다(데스크톱 전용). */
    private readonly getArchiveSyncFiles?: GetArchiveSyncFiles,
    private readonly readArchiveSyncFile?: ReadArchiveSyncFile,
  ) {}

  async execute(onProgress?: (progress: SyncProgress) => void): Promise<SyncToCloudResult> {
    console.log(`[SyncToCloud] ▶ 시작 | deviceId=${this.deviceId} | deviceName=${this.deviceName}`);
    const folder = await this.drivePort.getOrCreateSyncFolder();
    const localManifest = await this.syncRepo.getLocalManifest();
    const uploaded: string[] = [];
    const skipped: string[] = [];
    const deferred: string[] = [];
    const total = SYNC_FILES.length;

    // F8a(RT2) — 전환 마커 활성 키 로드: 이 키들은 DEFER하지 않는다(아래 uploadOne 참조).
    // 읽기 실패·형식 불일치 = 마커 없음(fail-open — DEFER는 원래 보호 장치다).
    let transitionGuardedKeys: ReadonlySet<string> = new Set();
    try {
      const marker = await this.storage.read<YearTransitionRemovedMarker>(
        YEAR_TRANSITION_REMOVED_KEY,
      );
      if (marker && marker.version === 1 && Array.isArray(marker.keys)) {
        transitionGuardedKeys = new Set(marker.keys);
      }
    } catch {
      transitionGuardedKeys = new Set();
    }

    // 리모트 매니페스트를 먼저 읽어 다른 기기가 올린 파일 엔트리를 보존
    const remoteManifest = await this.drivePort.getSyncManifest(folder.id);
    console.log(`[SyncToCloud] 리모트 매니페스트 deviceId=${remoteManifest?.deviceId ?? 'NONE'}`);
    console.log(`[SyncToCloud] 로컬 매니페스트 deviceId=${localManifest?.deviceId ?? 'NONE'}`);
    // 리모트/로컬 매니페스트는 서로 다른 사실을 기록하므로 절대 합치지 않는다.
    //  - 리모트: Drive에 실제 있는 파일들 = 리모트 기존 항목 + 이번에 업로드한 항목
    //  - 로컬: 이 기기가 실제 주고받은 파일들 = 로컬 기존 항목 + 이번에 업로드한 항목
    // 과거 {...remote, ...local} 단일 병합은 ① 받은 적 없는 리모트 항목을 로컬 장부에
    // 승계시켜 이후 다운로드가 checksum 동일 판정으로 영구 스킵되고(2026-07-21 신고),
    // ② 낡은 로컬 항목이 리모트의 더 새 항목을 덮어 다른 기기의 변경 감지를 깨뜨렸다.
    const nextRemoteFiles: Record<string, DriveSyncFileInfo> = {
      ...(remoteManifest?.files ?? {}),
    };
    const nextLocalFiles: Record<string, DriveSyncFileInfo> = {
      ...(localManifest?.files ?? {}),
    };

    // 동적 파일 목록 사전 조회 — 진행률 total 계산에 포함
    const dynamicFiles = this.getDynamicSyncFiles ? await this.getDynamicSyncFiles() : [];
    const binaryFilesPreview = this.getBinaryDynamicSyncFiles
      ? await this.getBinaryDynamicSyncFiles()
      : [];
    // (S4.1) 아카이브 키 사전 조회 — 열거 실패는 라이브 동기화를 막지 않는다(빈 목록 취급).
    let archiveKeys: string[] = [];
    if (this.getArchiveSyncFiles && this.readArchiveSyncFile) {
      try {
        archiveKeys = sortArchiveSyncKeysManifestLast(await this.getArchiveSyncFiles());
      } catch (err) {
        console.warn('[SyncToCloud] 아카이브 열거 실패 — 라이브 동기화는 계속:', err);
      }
    }
    const grandTotal = total + dynamicFiles.length + binaryFilesPreview.length + archiveKeys.length;

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
      const checksum = await computeSyncChecksum(content);
      const manifestChecksum = localManifest?.files[filename]?.checksum;

      // 체크섬이 같으면 스킵
      if (manifestChecksum === checksum) {
        skipped.push(filename);
        return;
      }

      // 리모트가 우리 마지막 동기화 이후 변경되었으면 업로드 유예 (다른 기기가 올린 최신 데이터 보호)
      const remoteChecksum = remoteManifest?.files[filename]?.checksum;
      if (remoteChecksum && manifestChecksum && remoteChecksum !== manifestChecksum) {
        // F8a(RT2) — 전환 마커 활성 키는 유예하지 않는다: 마커가 다운로드를 봉쇄하는 동안
        // pull-merge-push가 장부를 갱신하지 못해 DEFER가 영구 교착이 된다(재정화 불가 실측).
        // 이 키의 리모트 값은 전환 전 옛 데이터(또는 미전환 기기의 되오염)라 보호 대상이
        // 아니다 — 강제 업로드로 리모트를 정화해야 마커 해제 조건(정화 확인)이 성립한다.
        if (transitionGuardedKeys.has(filename)) {
          console.log(
            `[SyncToCloud]   ${filename}: 전환 마커 활성 — DEFER 없이 정화 업로드 진행(remote=${remoteChecksum.slice(0, 8)})`,
          );
        } else {
          console.log(
            `[SyncToCloud]   ${filename}: DEFER (remote changed: local-manifest=${manifestChecksum.slice(0, 8)} remote=${remoteChecksum.slice(0, 8)}, syncFromCloud 병합 후 재업로드 필요)`,
          );
          skipped.push(filename);
          deferred.push(filename);
          return;
        }
      }

      console.log(
        `[SyncToCloud]   ${filename}: UPLOAD (checksum ${manifestChecksum?.slice(0, 8) ?? 'NONE'} → ${checksum.slice(0, 8)})`,
      );
      const result = await this.drivePort.uploadSyncFile(folder.id, `${filename}.json`, content);
      const entry: DriveSyncFileInfo = {
        lastModified: result.modifiedTime,
        checksum,
        size: new TextEncoder().encode(content).length,
        uploadedBy: this.deviceId,
      };
      nextRemoteFiles[filename] = entry;
      nextLocalFiles[filename] = entry;
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
      const checksum = await computeSyncChecksum(content);
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
      const entry: DriveSyncFileInfo = {
        lastModified: result.modifiedTime,
        checksum,
        size: new TextEncoder().encode(content).length,
        uploadedBy: this.deviceId,
      };
      nextRemoteFiles[relPath] = entry;
      nextLocalFiles[relPath] = entry;
      uploaded.push(relPath);
    }

    // (S4.1) 아카이브 파일 업로드 — 불변 계약:
    //  - 리모트 매니페스트에 키가 이미 있으면 **무조건 스킵**(존재=완결, 절대 덮어쓰기 금지.
    //    체크섬 비교·DEFER 없음 — 아카이브는 수정되지 않으므로 재업로드 자체가 없다).
    //  - 파일 단위 try/catch: 한 파일 실패가 라이브 동기화·다른 아카이브 파일을 막지 않고,
    //    실패분은 매니페스트에 기록되지 않아 **다음 동기화에서 이어서** 올라간다.
    //  - manifest.json은 학기별 맨 뒤(sortArchiveSyncKeysManifestLast) — 완결 표식.
    const readArchiveSyncFile = this.readArchiveSyncFile;
    for (const key of archiveKeys) {
      if (!readArchiveSyncFile) break; // archiveKeys가 비어 있어 도달 불가 — 타입 좁히기용
      index++;
      onProgress?.({ current: index, total: grandTotal, filename: key });

      if (remoteManifest?.files[key]) {
        skipped.push(key);
        continue; // 존재=완결 — 아카이브는 절대 덮어쓰지 않는다
      }

      try {
        const bytes = await readArchiveSyncFile(key);
        if (bytes === null) {
          skipped.push(key);
          console.log(`[SyncToCloud]   ${key}: SKIP (아카이브 파일 읽기 실패·부재)`);
          continue;
        }
        const wrapper = { __binaryBase64: uint8ToBase64(bytes), __relPath: key };
        const content = JSON.stringify(wrapper);
        const checksum = await computeSyncChecksum(content);
        console.log(`[SyncToCloud]   ${key}: UPLOAD archive (${bytes.byteLength}B)`);
        const driveFilename = `${key.replace(/\//g, '__')}.json`;
        const result = await this.drivePort.uploadSyncFile(folder.id, driveFilename, content);
        const entry: DriveSyncFileInfo = {
          lastModified: result.modifiedTime,
          checksum,
          size: new TextEncoder().encode(content).length,
          uploadedBy: this.deviceId,
        };
        nextRemoteFiles[key] = entry;
        nextLocalFiles[key] = entry;
        uploaded.push(key);
      } catch (err) {
        skipped.push(key);
        console.warn(`[SyncToCloud]   ${key}: 아카이브 업로드 실패(다음 동기화에서 재시도):`, err);
      }
    }

    // 매니페스트 업데이트 — 실제 업로드가 있었을 때만.
    // no-op 실행("변경 없음")이 매니페스트를 다시 쓰면 리모트 deviceId가 업로드하지 않은
    // 기기로 찍히고(다운로드의 "내가 올린 데이터" 스킵 오판) lastSyncedAt만 위조된다.
    if (uploaded.length > 0) {
      const now = new Date().toISOString();
      await this.drivePort.updateSyncManifest(folder.id, {
        version: 1,
        lastSyncedAt: now,
        deviceId: this.deviceId,
        deviceName: this.deviceName,
        files: nextRemoteFiles,
      });
      await this.syncRepo.saveLocalManifest({
        version: 1,
        lastSyncedAt: now,
        deviceId: this.deviceId,
        deviceName: this.deviceName,
        files: nextLocalFiles,
      });
    }

    console.log(
      `[SyncToCloud] ✅ 완료 | uploaded=${uploaded.length} skipped=${skipped.length} deferred=${deferred.length} | uploaded=[${uploaded.join(', ')}]`,
    );
    return { uploaded, skipped, deferred };
  }
}
