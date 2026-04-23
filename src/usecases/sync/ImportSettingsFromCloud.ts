import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type { DriveSyncManifest, DriveSyncFileInfo } from '@domain/entities/DriveSyncState';
import type { Settings, SyncSettings, WidgetStyleSettings, CustomFontSettings } from '@domain/entities/Settings';

export type ImportSettingsFromCloudErrorCode =
  | 'NO_BACKUP'          // Drive에 쌤핀 폴더/매니페스트/settings 엔트리 없음
  | 'SCOPE_INSUFFICIENT' // OAuth 권한 부족
  | 'PARSE_ERROR'        // settings.json 파싱 실패
  | 'NETWORK_ERROR'      // 기타 네트워크/Drive 오류
  | 'UNKNOWN';

export class ImportSettingsFromCloudError extends Error {
  constructor(
    public readonly code: ImportSettingsFromCloudErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ImportSettingsFromCloudError';
  }
}

export interface ImportSettingsFromCloudResult {
  readonly applied: true;
  readonly appliedAt: string;         // ISO
  readonly remoteDeviceName?: string; // 매니페스트의 업로더 디바이스
  readonly remoteUpdatedAt?: string;  // 매니페스트의 settings 엔트리 lastModified
}

/**
 * 같은 Google 계정의 Drive 동기화 폴더에서 **settings.json만** 이 기기에 적용하는 유스케이스.
 *
 * 일반 복원(SyncFromCloud)과 다른 점:
 *   - 시간표/학생/메모 등 settings 외 다른 파일은 **전혀 건드리지 않는다**.
 *   - 기기 고유 식별자(sync.deviceId, sync.lastSyncedAt 등)와 로컬 전용 필드(widgetStyle.backgroundImage,
 *     customFont)는 리모트 값을 무시하고 로컬 값을 유지한다.
 *   - settings 외 파일의 로컬 매니페스트 엔트리는 건드리지 않고, settings 엔트리만 리모트에 맞춰 갱신한다
 *     (다음 정상 sync 사이클에서 불필요한 충돌/업로드를 방지).
 */
export class ImportSettingsFromCloud {
  constructor(
    private readonly storage: IStoragePort,
    private readonly drivePort: IDriveSyncPort,
    private readonly syncRepo: IDriveSyncRepository,
  ) {}

  async execute(): Promise<ImportSettingsFromCloudResult> {
    // 1. Drive 동기화 폴더 조회(없으면 생성). 폴더만 생성되고 매니페스트가 없으면 아래에서 NO_BACKUP.
    let folder;
    try {
      folder = await this.drivePort.getOrCreateSyncFolder();
    } catch (err) {
      throw this.wrap(err);
    }

    // 2. 리모트 매니페스트 조회
    let manifest: DriveSyncManifest | null;
    try {
      manifest = await this.drivePort.getSyncManifest(folder.id);
    } catch (err) {
      throw this.wrap(err);
    }
    if (!manifest || !manifest.files || !manifest.files['settings']) {
      throw new ImportSettingsFromCloudError(
        'NO_BACKUP',
        '클라우드에 저장된 설정 백업이 없습니다.',
      );
    }
    const settingsEntry: DriveSyncFileInfo = manifest.files['settings'];

    // 3. settings.json 파일 ID 찾기 (IDriveSyncPort의 파일 엔트리는 fileId가 아닌 체크섬/lastModified만 갖는다 —
    //    실제 다운로드를 위해 listSyncFiles로 Drive fileId를 조회해야 함. SyncFromCloud와 동일한 패턴.)
    let remoteRaw: string;
    try {
      const remoteFiles = await this.drivePort.listSyncFiles(folder.id);
      const driveFile = remoteFiles.find((f) => f.name === 'settings.json');
      if (!driveFile) {
        throw new ImportSettingsFromCloudError(
          'NO_BACKUP',
          '클라우드에 저장된 설정 백업이 없습니다.',
        );
      }
      remoteRaw = await this.drivePort.downloadSyncFile(driveFile.id);
    } catch (err) {
      if (err instanceof ImportSettingsFromCloudError) throw err;
      throw this.wrap(err);
    }

    // 4. 파싱
    let remoteSettings: Settings;
    try {
      const parsed: unknown = JSON.parse(remoteRaw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('settings payload is not an object');
      }
      remoteSettings = parsed as Settings;
    } catch (err) {
      throw new ImportSettingsFromCloudError(
        'PARSE_ERROR',
        '설정 파일을 해석할 수 없습니다.',
        err,
      );
    }

    // 5. 현재 로컬 settings 조회
    const localSettings = await this.storage.read<Settings>('settings');

    // 6. 병합 (machine-specific 필드는 로컬 우선)
    const merged = this.mergeRemoteIntoLocal(remoteSettings, localSettings);

    // 7. 로컬 저장
    await this.storage.write('settings', merged);

    // 8. 로컬 매니페스트 엔트리 중 'settings'만 리모트 기준으로 동기화
    //    (다음 sync 사이클에서 불필요한 settings 재업로드/충돌 방지)
    try {
      const localManifest = await this.syncRepo.getLocalManifest();
      const nowIso = new Date().toISOString();
      const nextFiles: Record<string, DriveSyncFileInfo> = {
        ...(localManifest?.files ?? {}),
        settings: {
          lastModified: settingsEntry.lastModified,
          checksum: settingsEntry.checksum,
          size: settingsEntry.size,
        },
      };
      const nextManifest: DriveSyncManifest = {
        version: localManifest?.version ?? manifest.version ?? 1,
        lastSyncedAt: localManifest?.lastSyncedAt ?? nowIso,
        deviceId: localManifest?.deviceId ?? '',
        deviceName: localManifest?.deviceName ?? '',
        files: nextFiles,
      };
      await this.syncRepo.saveLocalManifest(nextManifest);
    } catch (err) {
      // 매니페스트 갱신 실패는 치명적이지 않음 — 로그만 남기고 success 반환
      console.warn('[ImportSettingsFromCloud] 로컬 매니페스트 갱신 실패:', err);
    }

    return {
      applied: true,
      appliedAt: new Date().toISOString(),
      remoteDeviceName: manifest.deviceName || manifest.deviceId,
      remoteUpdatedAt: settingsEntry.lastModified,
    };
  }

  /**
   * Machine-specific 필드는 현재 기기 값을 유지하고, 나머지는 remote 값을 적용한다.
   *
   * 로컬 유지:
   *  - sync.deviceId          (이 기기 고유 ID — 절대 덮지 않음)
   *  - sync.lastSyncedAt      (이 기기의 마지막 동기화 시각)
   *  - sync.enabled           ("가져오기"를 눌렀다는 건 이미 이 기기에서 Drive 연동 ON 상태)
   *  - widgetStyle.backgroundImage (로컬 file:// 경로 — 다른 PC엔 없으므로 로컬 값 보존, 로컬이 없으면 null)
   *  - customFont             (기기별 설치 폰트 또는 로컬 base64 데이터 — 로컬 값 유지)
   *
   * 리모트 적용:
   *  - sync.autoSyncOnStart / autoSyncOnSave / autoSyncIntervalMin / conflictPolicy
   *  - 그 외 모든 필드(학교명/학급/시간표/좌석/테마/알림음/위젯 가시성 등)
   */
  private mergeRemoteIntoLocal(remote: Settings, local: Settings | null): Settings {
    const safeLocal = (local ?? {}) as Partial<Settings>;

    // sync 병합 — machine-specific 필드 로컬 우선, 나머지는 리모트 우선
    const mergedSync: SyncSettings = this.mergeSync(remote.sync, safeLocal.sync);

    // widgetStyle 병합 — backgroundImage만 로컬 우선
    const mergedWidgetStyle: WidgetStyleSettings | undefined = this.mergeWidgetStyle(
      remote.widgetStyle,
      safeLocal.widgetStyle,
    );

    // customFont — 로컬 값 유지 (없으면 undefined 유지; 리모트 값도 기기별 base64여서 그대로 두지 않음)
    const mergedCustomFont: CustomFontSettings | undefined = safeLocal.customFont;

    const result: Settings = {
      ...remote,
      sync: mergedSync,
      ...(mergedWidgetStyle ? { widgetStyle: mergedWidgetStyle } : {}),
      ...(mergedCustomFont ? { customFont: mergedCustomFont } : {}),
    };

    // remote에 widgetStyle/customFont가 없고 local에도 없으면 그대로 제거된 상태 유지
    if (!mergedWidgetStyle && 'widgetStyle' in result) {
      delete (result as { widgetStyle?: WidgetStyleSettings }).widgetStyle;
    }
    if (!mergedCustomFont && 'customFont' in result) {
      delete (result as { customFont?: CustomFontSettings }).customFont;
    }

    return result;
  }

  private mergeSync(
    remote: SyncSettings | undefined,
    local: SyncSettings | undefined,
  ): SyncSettings {
    // 둘 다 없으면 안전한 기본값
    const r = remote;
    const l = local;
    return {
      enabled: l?.enabled ?? r?.enabled ?? false,
      autoSyncOnStart: r?.autoSyncOnStart ?? l?.autoSyncOnStart ?? true,
      autoSyncOnSave: r?.autoSyncOnSave ?? l?.autoSyncOnSave ?? false,
      autoSyncIntervalMin: r?.autoSyncIntervalMin ?? l?.autoSyncIntervalMin ?? 0,
      conflictPolicy: r?.conflictPolicy ?? l?.conflictPolicy ?? 'latest',
      deviceId: l?.deviceId ?? r?.deviceId ?? '',
      lastSyncedAt: l?.lastSyncedAt ?? null,
    };
  }

  private mergeWidgetStyle(
    remote: WidgetStyleSettings | undefined,
    local: WidgetStyleSettings | undefined,
  ): WidgetStyleSettings | undefined {
    if (!remote && !local) return undefined;
    if (remote && !local) {
      // 리모트만 있을 때 — backgroundImage는 로컬에 없으므로 null 처리 (file:// 경로는 이 기기에서 깨짐)
      return { ...remote, backgroundImage: null };
    }
    if (!remote && local) {
      return local;
    }
    // 둘 다 있을 때 — 리모트 적용하되 backgroundImage는 로컬 값 우선
    return {
      ...(remote as WidgetStyleSettings),
      backgroundImage: (local as WidgetStyleSettings).backgroundImage ?? null,
    };
  }

  private wrap(err: unknown): ImportSettingsFromCloudError {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('SCOPE_INSUFFICIENT')) {
      return new ImportSettingsFromCloudError(
        'SCOPE_INSUFFICIENT',
        'Google Drive 접근 권한이 부족합니다. Google 계정 연결을 다시 해주세요.',
        err,
      );
    }
    return new ImportSettingsFromCloudError(
      'NETWORK_ERROR',
      `Drive 통신에 실패했습니다: ${message}`,
      err,
    );
  }
}
