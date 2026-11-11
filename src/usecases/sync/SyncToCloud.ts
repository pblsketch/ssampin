import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type {
  DriveSyncDeletionInfo,
  DriveSyncFileInfo,
  DriveSyncManifest,
  DriveSyncRestorationInfo,
} from '@domain/entities/DriveSyncState';
import { driveSyncDeletionIdentity } from '@domain/entities/DriveSyncState';
import { uint8ToBase64 } from './binaryBase64';
import {
  assertDataOperationRecoveryClear,
  withDataOperationLock,
} from '@usecases/shared/dataOperationMutex';
import { toBinaryDriveFilename } from './binaryDriveFilename';
import { SyncIntegrityError } from './SyncIntegrityError';
import {
  CHECKPOINT_EVERY_UPLOADS,
  SYNC_RUN_LEASE_EXPIRED_MESSAGE,
  SYNC_RUN_LEASE_MS,
  UNKNOWN_UPLOADER,
  buildDuplicateFileMessage,
  buildManifestMismatchMessage,
  classifyUnledgeredFileAge,
} from '@domain/rules/driveSyncRecovery';
import { loadRestoredDataHolds, type GetRestoredDataHolds } from './restoredDataHold';

function defaultDriveFilename(logicalKey: string): string {
  return `${logicalKey.replace(/\//g, '__')}.json`;
}

function restorationDriveFilename(
  logicalKey: string,
  restoration: DriveSyncRestorationInfo,
): string {
  const generation = `${restoration.restoredBy}-${restoration.restoredAt}`.replace(
    /[^a-zA-Z0-9_-]/g,
    '_',
  );
  return `${defaultDriveFilename(logicalKey)}.restore-${generation}`;
}

function immutableStudentPhotoDriveFilename(logicalKey: string, checksum: string): string {
  return `${defaultDriveFilename(logicalKey)}.rev-${checksum}`;
}

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
  /**
   * 업로드 중 예외가 나서 이번 회차에 건너뛴 바이너리 파일들 (skipped 에도 포함됨).
   *
   * 예전에는 이런 실패가 사이클 전체를 중단시켜 출결·기록처럼 무관한 도메인까지 함께 멈췄다.
   * 이제는 그 항목만 건너뛰므로, 실패가 조용히 사라지지 않도록 개수를 밖으로 드러낸다.
   */
  readonly binaryFailures: string[];
  /**
   * 시작 스냅샷으로 되돌린 자료 중 이번에 클라우드와 맞춰진 것(내용 같음·클라우드 사본 없음, ADR-148).
   * 호출부가 복원 기록을 "맞춰짐"으로 바꾼다. 맞춰지지 않은 복원 자료는 올리지 않고 `skipped` 에 넣는다.
   */
  readonly restoredResolved?: string[];
  /** 되돌린 자료 중 학년도 전환 표시가 걸려 복원 보호 없이 평소대로 올린 키(ADR-148). */
  readonly restoredReleasedForYearTransition?: string[];
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
    /** 장부 밖 파일의 나이 판정에 쓰는 이 기기의 시계. 테스트에서 주입한다. */
    private readonly now: () => number = () => Date.now(),
    /** 시작 스냅샷으로 되돌려 아직 클라우드와 맞춰지지 않은 자료(ADR-148). 미주입 = 없음. */
    private readonly getRestoredDataHolds?: GetRestoredDataHolds,
  ) {}

  async execute(onProgress?: (progress: SyncProgress) => void): Promise<SyncToCloudResult> {
    return withDataOperationLock(() => {
      assertDataOperationRecoveryClear();
      return this.executeUnlocked(onProgress);
    });
  }

  private async executeUnlocked(
    onProgress?: (progress: SyncProgress) => void,
  ): Promise<SyncToCloudResult> {
    console.log(`[SyncToCloud] ▶ 시작 | deviceId=${this.deviceId} | deviceName=${this.deviceName}`);
    const folder = await this.drivePort.getOrCreateSyncFolder();
    const localManifest = await this.syncRepo.getLocalManifest();
    const uploaded: string[] = [];
    const skipped: string[] = [];
    const deferred: string[] = [];
    /** 항목별 try/catch 로 건너뛴 바이너리 — 다음 동기화에서 자연히 재시도된다 */
    const binaryFailures: string[] = [];
    const restoredResolved: string[] = [];
    const restoredReleasedForYearTransition: string[] = [];
    // ADR-148 — 복원 기록을 읽을 수 있는지 아무것도 올리기 전에 확인한다. 못 읽으면 여기서 멈춘다
    // (파일마다 묻는 중간에 멈추면 몇 개는 이미 올라간 채 장부 확정 없이 끝난다).
    await loadRestoredDataHolds(this.getRestoredDataHolds);
    let manifestReconciled = false;
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

    // 리모트 매니페스트를 먼저 확립한다. 최초 생성도 create-only로 수행해
    // 다른 기기가 같은 순간 만든 장부를 PATCH로 덮어쓰지 않는다.
    let remoteManifest = await this.drivePort.getSyncManifest(folder.id);
    if (!remoteManifest) {
      const initialManifest: DriveSyncManifest = {
        version: 2,
        lastSyncedAt: new Date().toISOString(),
        deviceId: this.deviceId,
        deviceName: this.deviceName,
        files: {},
      };
      const created = await this.drivePort.createSyncFileIfMissing(
        folder.id,
        'manifest.json',
        JSON.stringify(initialManifest, null, 2),
      );
      if (!created) {
        throw new Error(
          '클라우드 동기화 장부가 다른 기기에서 생성되었습니다. 다시 동기화해 주세요.',
        );
      }
      const confirmed = await this.drivePort.getSyncManifest(folder.id);
      if (!confirmed || JSON.stringify(confirmed) !== JSON.stringify(initialManifest)) {
        throw new Error(
          '클라우드 동기화 장부 생성 상태를 확인할 수 없습니다. 다시 동기화해 주세요.',
        );
      }
      remoteManifest = confirmed;
    }
    const remoteFiles = await this.drivePort.listSyncFiles(folder.id);
    const findUniqueRemoteFile = (logicalKey: string, driveFilename: string) => {
      const matches = remoteFiles.filter((file) => file.name === driveFilename);
      if (matches.length > 1) {
        // ⚠️ 무결성 위반이다 — 어느 쪽이 진짜인지 알 수 없는 상태라 진행하면 안 된다.
        //    평범한 Error 로 던지면 바이너리 루프의 항목별 catch 에 삼켜져
        //    같은 사고가 파일 종류에 따라 다르게 처리된다(정적 파일은 멈추고 사진은 조용히 건너뜀).
        throw new SyncIntegrityError(buildDuplicateFileMessage(logicalKey));
      }
      return matches[0];
    };
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
    const nextRemoteDeletions: Record<string, DriveSyncDeletionInfo> = {
      ...(remoteManifest.deletions ?? {}),
    };
    const nextLocalDeletions: Record<string, DriveSyncDeletionInfo> = {
      ...(localManifest?.deletions ?? {}),
      ...(remoteManifest.deletions ?? {}),
    };
    const nextRemoteRestorations: Record<string, DriveSyncRestorationInfo> = {
      ...(remoteManifest.restorations ?? {}),
    };
    const nextLocalRestorations: Record<string, DriveSyncRestorationInfo> = {
      ...(remoteManifest.restorations ?? {}),
      ...(localManifest?.restorations ?? {}),
    };
    for (const [key, restoration] of Object.entries(nextLocalRestorations)) {
      if (restoration.completedAt) continue;
      const remoteDeletion = nextRemoteDeletions[key];
      if (
        remoteDeletion &&
        driveSyncDeletionIdentity(remoteDeletion) !== restoration.replacesDeletionId
      ) {
        delete nextLocalRestorations[key];
      }
    }
    for (const [key, restoration] of Object.entries(nextRemoteRestorations)) {
      if (!restoration.completedAt) continue;
      const localDeletion = nextLocalDeletions[key];
      if (
        localDeletion &&
        driveSyncDeletionIdentity(localDeletion) === restoration.replacesDeletionId
      ) {
        delete nextLocalDeletions[key];
        manifestReconciled = true;
      }
    }
    // ── 장부 중간 확정 ──
    // 예전에는 파일을 전부 올린 뒤 맨 끝에서 한 번만 장부를 확정했다. 실행이 그 전에 끊기면
    // (창 닫기·절전·다른 기기의 장부 선점) 올린 파일이 전부 장부 밖으로 남았고, 그 뒤 로컬이
    // 바뀌면 모든 동기화가 무결성 정지로 영원히 멈췄다(2026-11-08 실측 — 다시 만들기가 101개를
    // 올리고 장부 확정 전에 끊김). 그래서 정적 파일 뒤, 바이너리·아카이브 몇 개마다 확정한다.
    // 기대값은 "이 실행이 마지막으로 확정한 장부"다. 판정 기준인 remoteManifest(실행 시작
    // 스냅샷)는 바꾸지 않는다.
    let committedRemoteManifest: DriveSyncManifest = remoteManifest;
    let committedLedgerState: string | null = null;
    let uploadsSinceCheckpoint = 0;
    // 실행 임대(lease) — 장부를 마지막으로 확인한 시각. 간격이 SYNC_RUN_LEASE_MS 를 넘으면
    // 절전 등으로 멈췄다가 깨어난 실행이다. 그 사이 다른 기기가 이 실행의 업로드를 버려진
    // 것으로 보고 정리했을 수 있으니 확정하지 않는다.
    let lastLedgerCheckMs = this.now();
    const ledgerState = (): string =>
      JSON.stringify([
        nextRemoteFiles,
        nextRemoteDeletions,
        nextRemoteRestorations,
        nextLocalFiles,
        nextLocalDeletions,
        nextLocalRestorations,
      ]);
    const commitManifest = async (): Promise<void> => {
      const checkedAt = this.now();
      const gap = checkedAt - lastLedgerCheckMs;
      lastLedgerCheckMs = checkedAt;
      // 이 실행에서 아직 확정한 적이 없으면 기존 no-op 계약(바뀐 게 없으면 쓰지 않음)을 따르고,
      // 확정한 적이 있으면 그 뒤로 바뀐 것이 있을 때만 쓴다.
      if (committedLedgerState === null) {
        if (uploaded.length === 0 && !manifestReconciled) return;
      } else if (ledgerState() === committedLedgerState) {
        return;
      }
      if (gap > SYNC_RUN_LEASE_MS) throw new Error(SYNC_RUN_LEASE_EXPIRED_MESSAGE);
      const now = new Date().toISOString();
      // 살아 있는 객체를 넘기지 않는다 — 뒤이은 항목 처리가 고친 내용이 확정본에 섞이면 안 된다.
      const nextRemoteManifest = JSON.parse(
        JSON.stringify({
          version: Math.max(2, remoteManifest.version),
          lastSyncedAt: now,
          deviceId: this.deviceId,
          deviceName: this.deviceName,
          files: nextRemoteFiles,
          deletions: nextRemoteDeletions,
          restorations: nextRemoteRestorations,
        }),
      ) as DriveSyncManifest;
      const updated = await this.drivePort.updateSyncManifestIfUnchanged(
        folder.id,
        committedRemoteManifest,
        nextRemoteManifest,
      );
      if (!updated) {
        throw new Error(
          '클라우드 동기화 장부가 다른 기기에서 변경되었습니다. 다시 동기화해 주세요.',
        );
      }
      committedRemoteManifest = nextRemoteManifest;
      await this.syncRepo.saveLocalManifest(
        JSON.parse(
          JSON.stringify({
            version: Math.max(2, localManifest?.version ?? remoteManifest.version),
            lastSyncedAt: now,
            deviceId: this.deviceId,
            deviceName: this.deviceName,
            files: nextLocalFiles,
            deletions: nextLocalDeletions,
            restorations: nextLocalRestorations,
          }),
        ) as DriveSyncManifest,
      );
      committedLedgerState = ledgerState();
      uploadsSinceCheckpoint = 0;
    };
    const checkpointIfDue = async (): Promise<void> => {
      if (
        uploadsSinceCheckpoint >= CHECKPOINT_EVERY_UPLOADS ||
        this.now() - lastLedgerCheckMs > SYNC_RUN_LEASE_MS / 2
      ) {
        await commitManifest();
      }
    };
    /** 버려진 업로드를 덮어쓴 직후 — 다음 확인 지점에서 곧바로 확정한다(덮은 채 끊기는 창을 줄인다). */
    const checkpointSoon = (): void => {
      uploadsSinceCheckpoint = Math.max(uploadsSinceCheckpoint, CHECKPOINT_EVERY_UPLOADS);
    };
    /**
     * 버려진 업로드를 덮지 않고 원격 장부에 그대로 편입한 뒤 받기 판정에 넘긴다.
     * 올린 기기가 이미 없을 수도 있어(그러면 이 파일이 유일한 사본이다) 덮어쓰지 않는다.
     * 로컬 장부에는 넣지 않는다 — 이 기기는 아직 그 내용을 받지 않았다. 받기 쪽은 로컬 기준이
     * 없으니 덮지 않고 충돌로 묻거나(일반 파일) 항목 단위로 합친다(기록·출결·관찰).
     */
    const adoptUnledgeredFile = (
      key: string,
      file: { readonly modifiedTime: string },
      actualChecksum: string,
      actualContent: string,
      base: DriveSyncFileInfo | undefined,
      driveFilename: string | undefined,
    ): void => {
      nextRemoteFiles[key] = {
        ...(base ?? {}),
        lastModified: file.modifiedTime,
        checksum: actualChecksum,
        size: new TextEncoder().encode(actualContent).length,
        uploadedBy:
          base?.uploadedBy && base.uploadedBy !== this.deviceId
            ? base.uploadedBy
            : UNKNOWN_UPLOADER,
        ...(driveFilename ? { driveFilename } : {}),
      };
      manifestReconciled = true;
      skipped.push(key);
      deferred.push(key);
      console.warn(
        `[SyncToCloud]   ${key}: 버려진 장부 밖 파일(${file.modifiedTime})을 원격 장부에 편입 — 받기 판정 후 재업로드`,
      );
    };

    const isPendingRestoration = (key: string): boolean =>
      nextLocalRestorations[key] !== undefined && !nextLocalRestorations[key]?.completedAt;
    const completeRestoration = (key: string): void => {
      const restoration = nextLocalRestorations[key];
      if (!restoration || restoration.completedAt) return;
      const completed = { ...restoration, completedAt: new Date().toISOString() };
      nextLocalRestorations[key] = completed;
      nextRemoteRestorations[key] = completed;
      delete nextLocalDeletions[key];
      delete nextRemoteDeletions[key];
      manifestReconciled = true;
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

    const dynamicSet = new Set(dynamicFiles);
    const binarySet = new Set(binaryFilesPreview);
    const inferredDeletes = Object.keys(localManifest?.files ?? {}).filter(
      (key) =>
        (key.startsWith('note-body--') && !dynamicSet.has(key)) ||
        ((key.startsWith('obs-attachments/') || key.startsWith('student-photos/')) &&
          !binarySet.has(key)),
    );

    const deletionTimestamp = new Date().toISOString();
    for (const key of inferredDeletes) {
      const previousFile = localManifest?.files[key];
      nextLocalDeletions[key] ??= {
        deletedAt: deletionTimestamp,
        deletedBy: this.deviceId,
        ...(previousFile?.driveFilename ? { driveFilename: previousFile.driveFilename } : {}),
        ...(previousFile?.lastModified ? { expectedModifiedTime: previousFile.lastModified } : {}),
      };
    }

    const deletionCleanupTargets = new Map<
      string,
      { driveFilename: string; expectedModifiedTime: string | null }
    >();
    for (const [key, deletion] of Object.entries(nextLocalDeletions)) {
      if (
        !key.startsWith('note-body--') &&
        !key.startsWith('obs-attachments/') &&
        !key.startsWith('student-photos/')
      ) {
        continue;
      }
      if (isPendingRestoration(key)) continue;
      delete nextRemoteRestorations[key];
      const previousRemoteDeletion = nextRemoteDeletions[key];
      nextRemoteDeletions[key] = deletion;
      delete nextRemoteFiles[key];
      delete nextLocalFiles[key];
      const driveFilename =
        deletion.driveFilename ??
        remoteManifest.files[key]?.driveFilename ??
        defaultDriveFilename(key);
      const driveFile = findUniqueRemoteFile(key, driveFilename);
      deletionCleanupTargets.set(key, {
        driveFilename,
        expectedModifiedTime: deletion.expectedModifiedTime ?? driveFile?.modifiedTime ?? null,
      });
      if (
        remoteManifest.files[key] ||
        localManifest?.files[key] ||
        !localManifest?.deletions?.[key] ||
        !previousRemoteDeletion ||
        previousRemoteDeletion.deletedAt !== deletion.deletedAt ||
        previousRemoteDeletion.deletedBy !== deletion.deletedBy
      ) {
        manifestReconciled = true;
      }
      skipped.push(key);
      console.log(`[SyncToCloud]   ${key}: DELETE intent queued`);
    }

    // 정적/동적 파일 모두 동일 로직으로 처리하기 위한 헬퍼
    const uploadOne = async (filename: string, current: number): Promise<void> => {
      onProgress?.({ current, total: grandTotal, filename });

      const restoring = isPendingRestoration(filename);
      if (!restoring && (nextLocalDeletions[filename] || nextRemoteDeletions[filename])) {
        skipped.push(filename);
        return;
      }

      const data = await this.storage.read<unknown>(filename);
      if (data === null) {
        skipped.push(filename);
        console.log(`[SyncToCloud]   ${filename}: SKIP (데이터 없음)`);
        return;
      }

      const content = JSON.stringify(data);
      const checksum = await computeSyncChecksum(content);
      const localInfo = localManifest?.files[filename];
      const remoteInfo = remoteManifest.files[filename];
      const manifestChecksum = localInfo?.checksum;
      const remoteChecksum = remoteInfo?.checksum;
      const driveFilename = `${filename}.json`;
      const driveFile = findUniqueRemoteFile(filename, driveFilename);

      // ADR-148 — 시작 스냅샷으로 되돌린 자료는 클라우드의 더 새 사본을 덮지 않는다.
      // 목록은 읽기 **뒤에** 묻는다: 이번 읽기가 바로 그 복원을 일으켰을 수 있다(처음 읽는 자료).
      const restoredHold = (await loadRestoredDataHolds(this.getRestoredDataHolds)).get(filename);
      if (restoredHold) {
        if (transitionGuardedKeys.has(filename)) {
          // 학년도 전환 표시가 걸린 키는 "이 기기가 새 학년도 기준"이다. 받기는 전환 때문에 이 키를
          // 건너뛰므로, 여기서도 막으면 영영 막힌다 — 복원 보호를 걸지 않고 평소(정화 업로드)대로 둔다.
          restoredReleasedForYearTransition.push(filename);
        } else if (remoteChecksum === checksum || (!remoteInfo && !driveFile)) {
          // 클라우드와 내용이 같거나 클라우드에 장부 항목도 실제 파일도 없다 — 덮을 것이 없다.
          restoredResolved.push(filename);
        } else if (remoteInfo) {
          // 받기에서 '동기화 충돌' 창으로 묻는다. 유예(deferred)에 넣지 않는다 — 넣으면
          // 받기→올리기 재시도가 같은 판정을 되풀이한다.
          skipped.push(filename);
          console.log(
            `[SyncToCloud]   ${filename}: SKIP (시작 스냅샷으로 되돌린 자료 — 클라우드와 맞출 때까지 올리지 않음)`,
          );
          return;
        }
        // 장부에 없는 실제 파일만 있다: 아래 기존 길이 덮지 않고 편입하거나(내용이 다르면) 장부만
        // 맞춘다(같으면).
      }

      if (remoteInfo && !localInfo && !transitionGuardedKeys.has(filename) && !restoring) {
        skipped.push(filename);
        deferred.push(filename);
        console.log(`[SyncToCloud]   ${filename}: DEFER (로컬 동기화 기준 없음)`);
        return;
      }

      // 리모트 변경 판정은 "로컬 내용이 바뀌었는지"보다 먼저 해야 한다. 로컬이 마지막
      // 업로드 상태 그대로여도 다른 기기의 리모트 변경은 pull 대상으로 유예해야 한다.
      if (
        remoteChecksum &&
        manifestChecksum &&
        remoteChecksum !== manifestChecksum &&
        (!driveFile || driveFile.modifiedTime === remoteInfo?.lastModified)
      ) {
        // F8a(RT2) — 전환 마커 활성 키는 유예하지 않는다: 마커가 다운로드를 봉쇄하는 동안
        // pull-merge-push가 장부를 갱신하지 못해 DEFER가 영구 교착이 된다.
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

      // 장부 밖 파일을 버려진 업로드로 보고 조건부로 덮어쓸 때 — 아래 "이미 같다" 판정들을
      // 건너뛰고 업로드 단계로 곧장 보낸다(장부가 실제 파일을 설명하지 못하므로 그 판정은 틀린다).
      let overwriteUnledgered = false;

      if (!remoteInfo && driveFile && !restoring) {
        const actualContent = await this.drivePort.downloadSyncFile(driveFile.id);
        const actualChecksum = await computeSyncChecksum(actualContent);
        if (actualChecksum !== checksum) {
          // 장부에 없는데 내용이 다르다 = 어느 기기도 확정하지 못한 업로드.
          const age = classifyUnledgeredFileAge(driveFile.modifiedTime, this.now());
          if (age === 'unknown') throw new Error(buildManifestMismatchMessage(filename));
          if (age === 'recent') {
            // 다른 기기가 지금 올리는 중일 수 있다 — 덮지 말고 이 파일만 다음 회차로 미룬다.
            skipped.push(filename);
            console.warn(
              `[SyncToCloud]   ${filename}: 장부 밖 파일이 방금 올라옴 — 이번 회차 건너뜀`,
            );
            return;
          }
          if (!transitionGuardedKeys.has(filename)) {
            adoptUnledgeredFile(
              filename,
              driveFile,
              actualChecksum,
              actualContent,
              undefined,
              undefined,
            );
            return;
          }
          // 전환 마커 키는 원래 원격 변경을 유예하지 않고 정화 업로드하는 키다(F8a) — 덮는다.
          console.warn(
            `[SyncToCloud]   ${filename}: 전환 마커 키의 버려진 장부 밖 파일 — 조건부 덮어쓰기`,
          );
          overwriteUnledgered = true;
          checkpointSoon();
        } else {
          const reconciledEntry: DriveSyncFileInfo = {
            lastModified: driveFile.modifiedTime,
            checksum,
            size: new TextEncoder().encode(actualContent).length,
            ...(localInfo?.uploadedBy ? { uploadedBy: localInfo.uploadedBy } : {}),
          };
          nextRemoteFiles[filename] = reconciledEntry;
          nextLocalFiles[filename] = reconciledEntry;
          completeRestoration(filename);
          manifestReconciled = true;
          skipped.push(filename);
          console.warn(
            `[SyncToCloud]   ${filename}: 장부 없는 실제 파일이 현재 로컬과 동일 — 장부만 안전하게 편입`,
          );
          return;
        }
      }

      if (
        !driveFile &&
        (remoteInfo || localInfo) &&
        !restoring &&
        !transitionGuardedKeys.has(filename)
      ) {
        const knownOwner = remoteInfo?.uploadedBy ?? localInfo?.uploadedBy;
        if (!knownOwner) {
          throw new Error(
            `소유 기기를 확인할 수 없는 클라우드 ${filename} 파일입니다. 원본 기기에서 클라우드 데이터를 다시 구성해 주세요.`,
          );
        }
        if (knownOwner !== this.deviceId) {
          throw new Error(
            `다른 기기가 올린 클라우드 ${filename} 파일을 찾지 못했습니다. 원본 기기에서 클라우드 데이터를 다시 구성해 주세요.`,
          );
        }
      }

      // 실제 파일 revision이 장부와 다르면 내용을 먼저 검증한다. 내용이 장부 체크섬과
      // 같을 때만 조건부 갱신 또는 revision 장부 복구를 허용한다.
      if (
        !restoring &&
        remoteInfo &&
        driveFile?.modifiedTime &&
        remoteInfo.lastModified &&
        driveFile.modifiedTime !== remoteInfo.lastModified
      ) {
        const actualContent = await this.drivePort.downloadSyncFile(driveFile.id);
        const actualChecksum = await computeSyncChecksum(actualContent);
        if (actualChecksum !== remoteInfo.checksum) {
          if (actualChecksum === localInfo?.checksum) {
            const recoveredEntry: DriveSyncFileInfo = {
              ...localInfo,
              lastModified: driveFile.modifiedTime,
              size: new TextEncoder().encode(actualContent).length,
            };
            nextRemoteFiles[filename] = recoveredEntry;
            nextLocalFiles[filename] = recoveredEntry;
            manifestReconciled = true;
            if (actualChecksum === checksum) {
              skipped.push(filename);
              console.warn(
                `[SyncToCloud]   ${filename}: 이전 업로드 부분 성공 — 로컬 기준과 일치해 장부만 복구`,
              );
              return;
            }
            console.warn(
              `[SyncToCloud]   ${filename}: 이전 업로드 부분 성공 복구 후 최신 로컬 변경을 계속 업로드`,
            );
          } else if (actualChecksum === checksum) {
            // 직전 실행에서 조건부 파일 업로드는 성공했지만 manifest CAS만 실패한 부분 성공.
            // 실제 Drive 본문이 현재 로컬과 정확히 같으면 재업로드하지 않고 장부만 CAS 복구한다.
            const reconciledEntry: DriveSyncFileInfo = {
              ...remoteInfo,
              lastModified: driveFile.modifiedTime,
              checksum,
              size: new TextEncoder().encode(actualContent).length,
              uploadedBy: localInfo?.uploadedBy ?? remoteInfo.uploadedBy,
            };
            nextRemoteFiles[filename] = reconciledEntry;
            nextLocalFiles[filename] = reconciledEntry;
            completeRestoration(filename);
            manifestReconciled = true;
            skipped.push(filename);
            console.warn(
              `[SyncToCloud]   ${filename}: 파일 업로드 부분 성공 — 현재 로컬 본문과 일치해 장부만 복구`,
            );
            return;
          } else {
            // 장부에 키는 있는데 실제 파일이 장부·로컬 장부·지금 로컬 어느 것과도 다르다
            // = 확정본 위에 누군가 올리고 장부 확정 전에 끊긴 후속본.
            const age = classifyUnledgeredFileAge(driveFile.modifiedTime, this.now());
            if (age === 'unknown') throw new Error(buildManifestMismatchMessage(filename));
            if (age === 'recent') {
              skipped.push(filename);
              console.warn(
                `[SyncToCloud]   ${filename}: 장부와 다른 실제 파일이 방금 올라옴 — 이번 회차 건너뜀`,
              );
              return;
            }
            if (
              localInfo?.checksum === remoteInfo.checksum ||
              transitionGuardedKeys.has(filename)
            ) {
              // 이 기기는 확정본 위에 있다(로컬이 그대로면 확정본으로 되돌리는 것이고, 바뀌었으면
              // 그 위의 변경이다). 버려진 후속본은 확정본을 바탕으로 한 것이라, 올린 기기는 그
              // 내용을 로컬에 갖고 있고 장부 기준이 확정본이다 — 다음에 그 기기가 평소처럼 올린다.
              // 장부는 확정본을 말하는데 실제 파일만 다른 상태는 다른 기기의 받기를 막으므로
              // 그대로 두지 않는다. (전환 마커 키는 원래 정화 업로드하는 키다.)
              console.warn(
                `[SyncToCloud]   ${filename}: 버려진 후속본(${driveFile.modifiedTime}) — 조건부 덮어쓰기`,
              );
              overwriteUnledgered = true;
              checkpointSoon();
            } else {
              // 이 기기가 아직 받지 않은 확정본이 있었다. 후속본은 그 확정본을 담고 있으므로
              // 덮지 말고(다른 기기 변경을 지운다) 원격 장부에 그대로 편입한 뒤 받기 판정에 넘긴다.
              adoptUnledgeredFile(
                filename,
                driveFile,
                actualChecksum,
                actualContent,
                remoteInfo,
                undefined,
              );
              return;
            }
          }
        }
        if (
          !overwriteUnledgered &&
          manifestChecksum === checksum &&
          remoteInfo.checksum === checksum
        ) {
          const reconciledEntry: DriveSyncFileInfo = {
            ...remoteInfo,
            lastModified: driveFile.modifiedTime,
            size: new TextEncoder().encode(actualContent).length,
          };
          nextRemoteFiles[filename] = reconciledEntry;
          nextLocalFiles[filename] = reconciledEntry;
          completeRestoration(filename);
          manifestReconciled = true;
          skipped.push(filename);
          console.warn(
            `[SyncToCloud]   ${filename}: 실제 파일 내용은 동일 — 부분 성공 상태의 장부 revision 복구`,
          );
          return;
        }
      }

      // 로컬·원격·실제 파일이 같은 고정점이면 콘텐츠 다운로드 없이 건너뛴다.
      if (!overwriteUnledgered && manifestChecksum === checksum && remoteInfo && driveFile) {
        skipped.push(filename);
        return;
      }

      console.log(
        `[SyncToCloud]   ${filename}: UPLOAD (checksum ${manifestChecksum?.slice(0, 8) ?? 'NONE'} → ${checksum.slice(0, 8)})`,
      );
      const result = driveFile
        ? await this.drivePort.uploadSyncFileIfUnchanged(
            folder.id,
            driveFilename,
            content,
            driveFile.modifiedTime,
          )
        : await this.drivePort.createSyncFileIfMissing(folder.id, driveFilename, content);
      if (!result) {
        throw new Error(
          driveFile
            ? `클라우드 ${filename} 파일이 동기화 중 변경되었습니다. 다시 동기화해 주세요.`
            : `클라우드 ${filename} 파일이 동기화 중 생성되었습니다. 다시 동기화해 주세요.`,
        );
      }
      const entry: DriveSyncFileInfo = {
        lastModified: result.modifiedTime,
        checksum,
        size: new TextEncoder().encode(content).length,
        uploadedBy: this.deviceId,
      };
      nextRemoteFiles[filename] = entry;
      nextLocalFiles[filename] = entry;
      completeRestoration(filename);
      uploaded.push(filename);
    };

    let index = 0;
    for (const filename of SYNC_FILES) {
      await checkpointIfDue();
      index++;
      await uploadOne(filename, index);
    }

    // 동적 파일(예: note-body--{pageId}) 업로드 — 정적 루프와 동일 로직
    for (const filename of dynamicFiles) {
      await checkpointIfDue();
      index++;
      await uploadOne(filename, index);
    }

    // 중간 확정 ① — 정적·동적 파일은 몇십 초면 끝난다. 느린 사진 업로드 전에 확정해 두면
    // 그 뒤에 끊겨도 선생님 자료 본체는 장부에 남는다.
    await commitManifest();

    // 바이너리 동적 파일(예: obs-attachments/{id}.{ext}) 업로드 — base64 JSON 래퍼 경유
    for (const relPath of binaryFilesPreview) {
      // 중간 확정 ② — 항목별 try 바깥에서 부른다. 확정 실패가 항목 실패로 삼켜지면 안 된다.
      await checkpointIfDue();
      index++;
      onProgress?.({ current: index, total: grandTotal, filename: relPath });

      // ⚠️ 항목 단위로 감싼다 — 사진/첨부 한 장의 실패가 동기화 사이클 전체를 죽이면
      //    출결·기록처럼 무관한 도메인까지 함께 멈춘다(실제로 그렇게 동작하고 있었다).
      //    실패분은 매니페스트에 기록되지 않으므로 다음 동기화에서 자연히 다시 시도된다
      //    — 바로 아래 아카이브 루프와 같은 계약이다.
      try {
        const restoring = isPendingRestoration(relPath);
        if (!restoring && (nextLocalDeletions[relPath] || nextRemoteDeletions[relPath])) {
          skipped.push(relPath);
          continue;
        }
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
        const localInfo = localManifest?.files[relPath];
        const remoteInfo = remoteManifest.files[relPath];
        const manifestChecksum = localInfo?.checksum;
        const remoteChecksum = remoteInfo?.checksum;
        // 복원본은 삭제 대상이던 이전 세대와 다른 물리 파일명을 쓴다.
        // 삭제 장부 CAS가 늦게 끝나도 이 새 파일을 지울 수 없다.
        const pendingRestoration = nextLocalRestorations[relPath];
        const defaultFilename = toBinaryDriveFilename(relPath);
        const currentDriveFilename =
          remoteInfo?.driveFilename ?? localInfo?.driveFilename ?? defaultFilename;
        const driveFile = findUniqueRemoteFile(relPath, currentDriveFilename);

        if (remoteInfo && !localInfo && !restoring) {
          skipped.push(relPath);
          deferred.push(relPath);
          console.log(`[SyncToCloud]   ${relPath}: DEFER binary (로컬 동기화 기준 없음)`);
          continue;
        }

        if (
          remoteChecksum &&
          manifestChecksum &&
          remoteChecksum !== manifestChecksum &&
          (!driveFile || driveFile.modifiedTime === remoteInfo?.lastModified)
        ) {
          console.log(
            `[SyncToCloud]   ${relPath}: DEFER (remote changed, syncFromCloud 병합 후 재업로드 필요)`,
          );
          skipped.push(relPath);
          deferred.push(relPath);
          continue;
        }

        // 장부 밖 바이너리를 버려진 업로드로 보고 올릴 때 — 정적 파일과 같은 규칙(uploadOne 참조).
        let overwriteUnledgered = false;

        if (!remoteInfo && driveFile && !restoring) {
          const actualContent = await this.drivePort.downloadSyncFile(driveFile.id);
          const actualChecksum = await computeSyncChecksum(actualContent);
          if (actualChecksum !== checksum) {
            const age = classifyUnledgeredFileAge(driveFile.modifiedTime, this.now());
            if (age === 'unknown') {
              throw new SyncIntegrityError(buildManifestMismatchMessage(relPath));
            }
            if (age === 'recent') {
              skipped.push(relPath);
              console.warn(
                `[SyncToCloud]   ${relPath}: 장부 밖 바이너리가 방금 올라옴 — 이번 회차 건너뜀`,
              );
              continue;
            }
            if (!relPath.startsWith('student-photos/')) {
              adoptUnledgeredFile(
                relPath,
                driveFile,
                actualChecksum,
                actualContent,
                undefined,
                currentDriveFilename !== defaultFilename ? currentDriveFilename : undefined,
              );
              continue;
            }
            // 사진은 아래 업로드 단계가 새 세대 파일(.rev-<checksum>)을 따로 만든다 — 버려진
            // 파일을 덮지도 지우지도 않으므로 그대로 이 기기 사진을 올린다.
            console.warn(
              `[SyncToCloud]   ${relPath}: 버려진 장부 밖 사진(${driveFile.modifiedTime}) — 새 세대로 올림`,
            );
            overwriteUnledgered = true;
          } else {
            const reconciledEntry: DriveSyncFileInfo = {
              lastModified: driveFile.modifiedTime,
              checksum,
              size: new TextEncoder().encode(actualContent).length,
              ...(localInfo?.uploadedBy ? { uploadedBy: localInfo.uploadedBy } : {}),
            };
            nextRemoteFiles[relPath] = reconciledEntry;
            nextLocalFiles[relPath] = reconciledEntry;
            completeRestoration(relPath);
            manifestReconciled = true;
            skipped.push(relPath);
            console.warn(
              `[SyncToCloud]   ${relPath}: 장부 없는 실제 바이너리가 현재 로컬과 동일 — 장부만 안전하게 편입`,
            );
            continue;
          }
        }

        if (!driveFile && (remoteInfo || localInfo) && !restoring) {
          const knownOwner = remoteInfo?.uploadedBy ?? localInfo?.uploadedBy;
          if (!knownOwner) {
            throw new SyncIntegrityError(
              `소유 기기를 확인할 수 없는 클라우드 ${relPath} 파일입니다. 원본 기기에서 클라우드 데이터를 다시 구성해 주세요.`,
            );
          }
          if (knownOwner !== this.deviceId) {
            throw new SyncIntegrityError(
              `다른 기기가 올린 클라우드 ${relPath} 파일을 찾지 못했습니다. 원본 기기에서 클라우드 데이터를 다시 구성해 주세요.`,
            );
          }
        }

        if (
          !restoring &&
          remoteInfo &&
          driveFile?.modifiedTime &&
          remoteInfo.lastModified &&
          driveFile.modifiedTime !== remoteInfo.lastModified
        ) {
          const actualContent = await this.drivePort.downloadSyncFile(driveFile.id);
          const actualChecksum = await computeSyncChecksum(actualContent);
          if (actualChecksum !== remoteInfo.checksum) {
            if (actualChecksum === localInfo?.checksum) {
              const recoveredEntry: DriveSyncFileInfo = {
                ...localInfo,
                lastModified: driveFile.modifiedTime,
                size: new TextEncoder().encode(actualContent).length,
              };
              nextRemoteFiles[relPath] = recoveredEntry;
              nextLocalFiles[relPath] = recoveredEntry;
              manifestReconciled = true;
              if (actualChecksum === checksum) {
                skipped.push(relPath);
                continue;
              }
            } else if (actualChecksum === checksum) {
              const reconciledEntry: DriveSyncFileInfo = {
                ...remoteInfo,
                lastModified: driveFile.modifiedTime,
                checksum,
                size: new TextEncoder().encode(actualContent).length,
                uploadedBy: localInfo?.uploadedBy ?? remoteInfo.uploadedBy,
              };
              nextRemoteFiles[relPath] = reconciledEntry;
              nextLocalFiles[relPath] = reconciledEntry;
              completeRestoration(relPath);
              manifestReconciled = true;
              skipped.push(relPath);
              console.warn(`[SyncToCloud]   ${relPath}: 바이너리 업로드 부분 성공 — 장부만 복구`);
              continue;
            } else {
              const age = classifyUnledgeredFileAge(driveFile.modifiedTime, this.now());
              if (age === 'unknown') {
                throw new SyncIntegrityError(buildManifestMismatchMessage(relPath));
              }
              if (age === 'recent') {
                skipped.push(relPath);
                console.warn(
                  `[SyncToCloud]   ${relPath}: 장부와 다른 실제 바이너리가 방금 올라옴 — 이번 회차 건너뜀`,
                );
                continue;
              }
              // 사진 파일명은 내용(체크섬)에 묶여 있다. 같은 이름에 다른 내용이면 손상이다 — 멈춘다.
              if (relPath.startsWith('student-photos/')) {
                throw new SyncIntegrityError(buildManifestMismatchMessage(relPath));
              }
              if (localInfo?.checksum === remoteInfo.checksum) {
                console.warn(
                  `[SyncToCloud]   ${relPath}: 버려진 바이너리 후속본(${driveFile.modifiedTime}) — 조건부 덮어쓰기`,
                );
                overwriteUnledgered = true;
                checkpointSoon();
              } else {
                adoptUnledgeredFile(
                  relPath,
                  driveFile,
                  actualChecksum,
                  actualContent,
                  remoteInfo,
                  undefined,
                );
                continue;
              }
            }
          }
          if (
            !overwriteUnledgered &&
            manifestChecksum === checksum &&
            remoteInfo.checksum === checksum
          ) {
            const reconciledEntry: DriveSyncFileInfo = {
              ...remoteInfo,
              lastModified: driveFile.modifiedTime,
              size: new TextEncoder().encode(actualContent).length,
            };
            nextRemoteFiles[relPath] = reconciledEntry;
            nextLocalFiles[relPath] = reconciledEntry;
            completeRestoration(relPath);
            manifestReconciled = true;
            skipped.push(relPath);
            continue;
          }
        }

        if (!overwriteUnledgered && manifestChecksum === checksum && remoteInfo && driveFile) {
          skipped.push(relPath);
          continue;
        }

        console.log(
          `[SyncToCloud]   ${relPath}: UPLOAD binary (checksum ${manifestChecksum?.slice(0, 8) ?? 'NONE'} → ${checksum.slice(0, 8)})`,
        );
        const uploadDriveFilename =
          restoring && pendingRestoration
            ? restorationDriveFilename(relPath, pendingRestoration)
            : relPath.startsWith('student-photos/')
              ? immutableStudentPhotoDriveFilename(relPath, checksum)
              : currentDriveFilename;
        const immutablePhoto = relPath.startsWith('student-photos/');
        const immutableExisting = immutablePhoto
          ? findUniqueRemoteFile(relPath, uploadDriveFilename)
          : undefined;
        let result: { fileId: string; modifiedTime: string } | null;
        if (immutableExisting) {
          const existingContent = await this.drivePort.downloadSyncFile(immutableExisting.id);
          if ((await computeSyncChecksum(existingContent)) !== checksum) {
            throw new SyncIntegrityError(
              `클라우드 ${relPath} 사진 세대의 내용이 체크섬과 일치하지 않습니다.`,
            );
          }
          result = { fileId: immutableExisting.id, modifiedTime: immutableExisting.modifiedTime };
        } else if (immutablePhoto) {
          result = await this.drivePort.createSyncFileIfMissing(
            folder.id,
            uploadDriveFilename,
            content,
          );
        } else {
          result = driveFile
            ? await this.drivePort.uploadSyncFileIfUnchanged(
                folder.id,
                uploadDriveFilename,
                content,
                driveFile.modifiedTime,
              )
            : await this.drivePort.createSyncFileIfMissing(folder.id, uploadDriveFilename, content);
        }
        if (!result) {
          throw new SyncIntegrityError(
            driveFile
              ? `클라우드 ${relPath} 파일이 동기화 중 변경되었습니다. 다시 동기화해 주세요.`
              : `클라우드 ${relPath} 파일이 동기화 중 생성되었습니다. 다시 동기화해 주세요.`,
          );
        }
        const entry: DriveSyncFileInfo = {
          lastModified: result.modifiedTime,
          checksum,
          size: new TextEncoder().encode(content).length,
          uploadedBy: this.deviceId,
          ...(uploadDriveFilename !== defaultFilename
            ? { driveFilename: uploadDriveFilename }
            : {}),
        };
        nextRemoteFiles[relPath] = entry;
        nextLocalFiles[relPath] = entry;
        completeRestoration(relPath);
        uploaded.push(relPath);
        uploadsSinceCheckpoint++;
      } catch (err) {
        // ⚠️ 무결성 위반은 **일부러 멈추는 안전장치**라 여기서 삼키면 안 된다.
        //    장부와 실제 파일이 다르거나 소유 기기를 확인할 수 없는 상태에서 계속 진행하면
        //    다른 기기의 자료를 덮어써 데이터가 사라질 수 있다.
        //    (항목별 catch 를 처음 넣었을 때 이걸 함께 삼켰다가 기존 안전 테스트가 잡아 줬다)
        if (err instanceof SyncIntegrityError) throw err;
        binaryFailures.push(relPath);
        skipped.push(relPath);
        console.warn(`[SyncToCloud]   ${relPath}: 바이너리 업로드 실패 — 이 항목만 건너뜀`, err);
      }
    }

    // (S4.1) 아카이브 파일 업로드 — 불변 계약:
    //  - 리모트 매니페스트에 키가 이미 있으면 **무조건 스킵**(존재=완결, 절대 덮어쓰기 금지.
    //    체크섬 비교·DEFER 없음 — 아카이브는 수정되지 않으므로 재업로드 자체가 없다).
    //  - 파일 단위 try/catch: 한 파일 실패가 라이브 동기화·다른 아카이브 파일을 막지 않고,
    //    실패분은 매니페스트에 기록되지 않아 **다음 동기화에서 이어서** 올라간다.
    //  - manifest.json은 학기별 맨 뒤(sortArchiveSyncKeysManifestLast) — 완결 표식.
    // 중간 확정 ③ — 사진·첨부까지 확정한 뒤 아카이브로 넘어간다.
    await commitManifest();

    const readArchiveSyncFile = this.readArchiveSyncFile;
    for (const key of archiveKeys) {
      if (!readArchiveSyncFile) break; // archiveKeys가 비어 있어 도달 불가 — 타입 좁히기용
      // 중간 확정 ④
      await checkpointIfDue();
      index++;
      onProgress?.({ current: index, total: grandTotal, filename: key });

      if (remoteManifest?.files[key]) {
        skipped.push(key);
        continue; // 존재=완결 — 아카이브는 절대 덮어쓰지 않는다
      }

      let bytes: Uint8Array | null;
      try {
        bytes = await readArchiveSyncFile(key);
      } catch (err) {
        skipped.push(key);
        console.warn(`[SyncToCloud]   ${key}: 아카이브 읽기 실패(다음 동기화에서 재시도):`, err);
        continue;
      }
      if (bytes === null) {
        skipped.push(key);
        console.log(`[SyncToCloud]   ${key}: SKIP (아카이브 파일 읽기 실패·부재)`);
        continue;
      }

      const wrapper = { __binaryBase64: uint8ToBase64(bytes), __relPath: key };
      const content = JSON.stringify(wrapper);
      const checksum = await computeSyncChecksum(content);
      const driveFilename = `${key.replace(/\//g, '__')}.json`;
      const driveFile = findUniqueRemoteFile(key, driveFilename);

      if (driveFile) {
        const actualContent = await this.drivePort.downloadSyncFile(driveFile.id);
        const actualChecksum = await computeSyncChecksum(actualContent);
        if (actualChecksum !== checksum) {
          throw new Error(buildManifestMismatchMessage('아카이브'));
        }
        const localInfo = localManifest?.files[key];
        const reconciledEntry: DriveSyncFileInfo = {
          lastModified: driveFile.modifiedTime ?? '',
          checksum,
          size: new TextEncoder().encode(actualContent).length,
          ...(localInfo?.uploadedBy ? { uploadedBy: localInfo.uploadedBy } : {}),
        };
        nextRemoteFiles[key] = reconciledEntry;
        nextLocalFiles[key] = reconciledEntry;
        manifestReconciled = true;
        skipped.push(key);
        console.log(`[SyncToCloud]   ${key}: RECONCILE archive manifest`);
        continue;
      }

      console.log(`[SyncToCloud]   ${key}: CREATE archive (${bytes.byteLength}B)`);
      let result: Awaited<ReturnType<IDriveSyncPort['createSyncFileIfMissing']>>;
      try {
        result = await this.drivePort.createSyncFileIfMissing(folder.id, driveFilename, content);
      } catch (err) {
        skipped.push(key);
        console.warn(`[SyncToCloud]   ${key}: 아카이브 생성 실패(다음 동기화에서 재시도):`, err);
        continue;
      }
      if (!result) {
        throw new Error(`클라우드 ${key} 파일이 동기화 중 생성되었습니다. 다시 동기화해 주세요.`);
      }
      const entry: DriveSyncFileInfo = {
        lastModified: result.modifiedTime,
        checksum,
        size: new TextEncoder().encode(content).length,
        uploadedBy: this.deviceId,
      };
      nextRemoteFiles[key] = entry;
      nextLocalFiles[key] = entry;
      uploaded.push(key);
      uploadsSinceCheckpoint++;
    }

    // 최종 확정 — 실제 업로드·장부 정리가 있었을 때만(no-op 실행은 장부를 쓰지 않는다).
    // no-op 실행("변경 없음")이 매니페스트를 다시 쓰면 리모트 deviceId가 업로드하지 않은
    // 기기로 찍히고(다운로드의 "내가 올린 데이터" 스킵 오판) lastSyncedAt만 위조된다.
    // 중간 확정이 이미 다 실었고 그 뒤 바뀐 게 없으면 commitManifest 가 쓰기를 건너뛴다.
    await commitManifest();

    // 삭제 표식이 클라우드 장부에 확정된 뒤에만 실제 파일을 지운다. 실패해도 표식은 남아
    // 다음 동기화에서 재시도되며, 다른 기기는 이 파일을 다시 내려받거나 올리지 않는다.
    for (const [key, target] of deletionCleanupTargets) {
      if (!target.expectedModifiedTime || !this.drivePort.deleteSyncFileIfUnchanged) {
        if (target.expectedModifiedTime) binaryFailures.push(key);
        console.warn(`[SyncToCloud]   ${key}: 안전한 조건부 삭제를 사용할 수 없어 물리 삭제 보류`);
        continue;
      }
      try {
        const deleted = await this.drivePort.deleteSyncFileIfUnchanged(
          folder.id,
          target.driveFilename,
          target.expectedModifiedTime,
        );
        if (!deleted) {
          binaryFailures.push(key);
          console.warn(`[SyncToCloud]   ${key}: 파일 세대가 바뀌어 물리 삭제 보류`);
          continue;
        }
        console.log(`[SyncToCloud]   ${key}: DELETE unchanged file after tombstone commit`);
      } catch (err) {
        binaryFailures.push(key);
        console.warn(`[SyncToCloud]   ${key}: 실제 파일 삭제 실패 — 다음 동기화에서 재시도`, err);
      }
    }

    console.log(
      `[SyncToCloud] ✅ 완료 | uploaded=${uploaded.length} skipped=${skipped.length} deferred=${deferred.length} | uploaded=[${uploaded.join(', ')}]`,
    );
    return {
      uploaded,
      skipped,
      deferred,
      binaryFailures,
      restoredResolved,
      restoredReleasedForYearTransition,
    };
  }
}
