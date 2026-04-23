import { describe, it, expect, beforeEach } from 'vitest';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDriveSyncPort, DriveSyncFileListItem } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type { DriveFolderInfo } from '@domain/ports/IGoogleDrivePort';
import type { DriveSyncManifest, DriveSyncFileInfo } from '@domain/entities/DriveSyncState';
import type { Settings, SyncSettings, WidgetStyleSettings } from '@domain/entities/Settings';
import {
  ImportSettingsFromCloud,
  ImportSettingsFromCloudError,
} from '../ImportSettingsFromCloud';

// ============================================================
// 테스트용 최소 Settings 팩토리
// (실제 Settings 타입은 매우 크므로 필요한 필드만 채워 타입 단언)
// ============================================================

const REMOTE_SETTINGS_ISO = '2026-04-20T10:00:00.000Z';

function mkSettings(overrides: Partial<Settings> = {}): Settings {
  const base = {
    schoolName: '원격 중학교',
    className: '3-2',
    teacherName: '원격선생',
    subject: '국어',
    schoolLevel: 'middle',
    maxPeriods: 7,
    periodTimes: [],
    seatingRows: 6,
    seatingCols: 6,
    widget: {
      width: 380,
      height: 650,
      transparent: false,
      opacity: 0.8,
      cardOpacity: 1.0,
      alwaysOnTop: true,
      closeToWidget: true,
      layoutMode: 'full',
      desktopMode: 'normal',
      visibleSections: {
        dateTime: true,
        weather: true,
        message: true,
        teacherTimetable: true,
        classTimetable: false,
        events: true,
        periodBar: true,
        todayClass: false,
        seating: false,
        studentRecords: false,
        meal: false,
        memo: false,
        todo: false,
      },
    },
    system: {
      autoLaunch: false,
      notificationSound: true,
      doNotDisturbStart: '22:00',
      doNotDisturbEnd: '07:00',
    },
    theme: 'system',
    fontSize: 'medium',
    neis: { schoolCode: '', atptCode: '', schoolName: '' },
    pin: {
      enabled: false,
      pinHash: null,
      protectedFeatures: {
        timetable: false,
        seating: false,
        schedule: false,
        studentRecords: false,
        meal: false,
        memo: false,
        note: false,
        todo: false,
        classManagement: false,
        bookmarks: false,
      },
      autoLockMinutes: 5,
    },
    alarmSound: {
      selectedSound: 'beep',
      customAudioName: null,
      volume: 0.8,
      boost: 1,
      preWarning: { enabled: true, secondsBefore: 60, sound: 'gentle-chime' },
    },
    workSymbols: { symbols: [] },
    weather: { location: null, refreshIntervalMin: 30 },
  };
  return { ...(base as unknown as Settings), ...overrides };
}

function mkSync(overrides: Partial<SyncSettings> = {}): SyncSettings {
  return {
    enabled: false,
    autoSyncOnStart: true,
    autoSyncOnSave: false,
    autoSyncIntervalMin: 0,
    conflictPolicy: 'latest',
    lastSyncedAt: null,
    deviceId: '',
    ...overrides,
  };
}

function mkSettingsFileInfo(checksum = 'remote-checksum'): DriveSyncFileInfo {
  return {
    lastModified: REMOTE_SETTINGS_ISO,
    checksum,
    size: 1024,
  };
}

function mkManifest(overrides: Partial<DriveSyncManifest> = {}): DriveSyncManifest {
  return {
    version: 1,
    lastSyncedAt: REMOTE_SETTINGS_ISO,
    deviceId: 'REMOTE-DEVICE-ID',
    deviceName: '원격 맥북',
    files: { settings: mkSettingsFileInfo() },
    ...overrides,
  };
}

// ============================================================
// Fake 구현
// ============================================================

interface FakeDriveState {
  folder: DriveFolderInfo;
  manifest: DriveSyncManifest | null;
  files: Map<string, string>; // fileId -> content
  fileList: DriveSyncFileListItem[];
  /** null이면 정상 흐름, 아니면 해당 에러 throw */
  throwOnGetFolder?: Error | null;
  throwOnGetManifest?: Error | null;
  throwOnDownload?: Error | null;
  throwOnList?: Error | null;
}

function makeFakeDrive(state: FakeDriveState): IDriveSyncPort {
  return {
    async getOrCreateSyncFolder() {
      if (state.throwOnGetFolder) throw state.throwOnGetFolder;
      return state.folder;
    },
    async getSyncManifest(folderId: string) {
      if (state.throwOnGetManifest) throw state.throwOnGetManifest;
      if (folderId !== state.folder.id) return null;
      return state.manifest;
    },
    async downloadSyncFile(fileId: string) {
      if (state.throwOnDownload) throw state.throwOnDownload;
      const content = state.files.get(fileId);
      if (content == null) throw new Error(`file not found: ${fileId}`);
      return content;
    },
    async listSyncFiles(folderId: string) {
      if (state.throwOnList) throw state.throwOnList;
      if (folderId !== state.folder.id) return [];
      return state.fileList;
    },
    // 사용하지 않는 메서드 — 테스트에선 호출되지 않음
    async uploadSyncFile() {
      throw new Error('not used in test');
    },
    async updateSyncManifest() {
      throw new Error('not used in test');
    },
    async deleteSyncFolder() {
      throw new Error('not used in test');
    },
  };
}

interface FakeStorageState {
  data: Map<string, unknown>;
}

function makeFakeStorage(state: FakeStorageState): IStoragePort {
  return {
    async read<T>(filename: string): Promise<T | null> {
      const v = state.data.get(filename);
      return (v ?? null) as T | null;
    },
    async write<T>(filename: string, data: T): Promise<void> {
      state.data.set(filename, data);
    },
    async remove(filename: string): Promise<void> {
      state.data.delete(filename);
    },
    async readBinary() {
      return null;
    },
    async writeBinary() {
      /* no-op */
    },
    async removeBinary() {
      /* no-op */
    },
    async listBinary() {
      return [];
    },
  };
}

interface FakeSyncRepoState {
  manifest: DriveSyncManifest | null;
  saveCalls: DriveSyncManifest[];
}

function makeFakeSyncRepo(state: FakeSyncRepoState): IDriveSyncRepository {
  return {
    async getLocalManifest() {
      return state.manifest;
    },
    async saveLocalManifest(manifest: DriveSyncManifest) {
      state.saveCalls.push(manifest);
      state.manifest = manifest;
    },
  };
}

// ============================================================
// 테스트 컨텍스트 헬퍼
// ============================================================

interface TestContext {
  storage: IStoragePort;
  drive: IDriveSyncPort;
  syncRepo: IDriveSyncRepository;
  storageState: FakeStorageState;
  driveState: FakeDriveState;
  syncRepoState: FakeSyncRepoState;
  usecase: ImportSettingsFromCloud;
}

function makeContext(init?: {
  localSettings?: Settings | null;
  remoteSettings?: Settings | null;
  manifest?: DriveSyncManifest | null;
  fileList?: DriveSyncFileListItem[];
  localManifest?: DriveSyncManifest | null;
}): TestContext {
  const storageState: FakeStorageState = { data: new Map() };
  if (init?.localSettings !== undefined && init.localSettings !== null) {
    storageState.data.set('settings', init.localSettings);
  }

  const files = new Map<string, string>();
  const fileList =
    init?.fileList ??
    (init?.remoteSettings === null
      ? []
      : [
          {
            id: 'settings-file-id',
            name: 'settings.json',
            modifiedTime: REMOTE_SETTINGS_ISO,
          },
        ]);
  if (init?.remoteSettings !== null) {
    files.set('settings-file-id', JSON.stringify(init?.remoteSettings ?? mkSettings()));
  }

  const driveState: FakeDriveState = {
    folder: { id: 'folder-id', name: '쌤핀 동기화' },
    manifest: init?.manifest === undefined ? mkManifest() : init.manifest,
    files,
    fileList,
  };

  const syncRepoState: FakeSyncRepoState = {
    manifest: init?.localManifest ?? null,
    saveCalls: [],
  };

  const storage = makeFakeStorage(storageState);
  const drive = makeFakeDrive(driveState);
  const syncRepo = makeFakeSyncRepo(syncRepoState);
  const usecase = new ImportSettingsFromCloud(storage, drive, syncRepo);
  return { storage, drive, syncRepo, storageState, driveState, syncRepoState, usecase };
}

// ============================================================
// 테스트
// ============================================================

describe('ImportSettingsFromCloud', () => {
  describe('성공 케이스', () => {
    let ctx: TestContext;

    beforeEach(() => {
      const localSettings = mkSettings({
        schoolName: '로컬 중학교',
        className: '1-1',
        teacherName: '로컬선생',
        sync: mkSync({
          enabled: true,
          deviceId: 'LOCAL-DEVICE-ID',
          lastSyncedAt: '2026-04-22T00:00:00.000Z',
        }),
      });
      const remoteSettings = mkSettings({
        schoolName: '원격 중학교',
        className: '3-2',
        teacherName: '원격선생',
        sync: mkSync({
          enabled: true,
          deviceId: 'REMOTE-DEVICE-ID',
          lastSyncedAt: '2026-04-20T10:00:00.000Z',
          autoSyncOnSave: true,
          autoSyncIntervalMin: 15,
          conflictPolicy: 'ask',
        }),
      });
      ctx = makeContext({ localSettings, remoteSettings });
    });

    it('remote settings를 storage에 기록한다', async () => {
      const result = await ctx.usecase.execute();
      expect(result.applied).toBe(true);
      const saved = (await ctx.storage.read<Settings>('settings')) as Settings;
      expect(saved.schoolName).toBe('원격 중학교');
      expect(saved.className).toBe('3-2');
      expect(saved.teacherName).toBe('원격선생');
    });

    it('machine-specific sync 필드(deviceId, lastSyncedAt, enabled)는 로컬 값을 유지한다', async () => {
      await ctx.usecase.execute();
      const saved = (await ctx.storage.read<Settings>('settings')) as Settings;
      expect(saved.sync?.deviceId).toBe('LOCAL-DEVICE-ID');
      expect(saved.sync?.lastSyncedAt).toBe('2026-04-22T00:00:00.000Z');
      expect(saved.sync?.enabled).toBe(true);
    });

    it('리모트 sync 정책(autoSyncOnSave, autoSyncIntervalMin, conflictPolicy)은 적용된다', async () => {
      await ctx.usecase.execute();
      const saved = (await ctx.storage.read<Settings>('settings')) as Settings;
      expect(saved.sync?.autoSyncOnSave).toBe(true);
      expect(saved.sync?.autoSyncIntervalMin).toBe(15);
      expect(saved.sync?.conflictPolicy).toBe('ask');
    });

    it('remoteDeviceName을 결과로 반환한다', async () => {
      const result = await ctx.usecase.execute();
      expect(result.remoteDeviceName).toBe('원격 맥북');
      expect(result.remoteUpdatedAt).toBe(REMOTE_SETTINGS_ISO);
    });

    it('로컬 매니페스트의 settings 엔트리만 리모트 값으로 갱신한다', async () => {
      const otherEntry: DriveSyncFileInfo = {
        lastModified: '2026-04-01T00:00:00.000Z',
        checksum: 'other-checksum',
        size: 2048,
      };
      const localManifest: DriveSyncManifest = {
        version: 1,
        lastSyncedAt: '2026-04-22T00:00:00.000Z',
        deviceId: 'LOCAL-DEVICE-ID',
        deviceName: '로컬 데스크탑',
        files: {
          events: otherEntry,
          settings: {
            lastModified: '2026-04-10T00:00:00.000Z',
            checksum: 'old-settings-checksum',
            size: 512,
          },
        },
      };
      const ctx2 = makeContext({
        localSettings: mkSettings({
          sync: mkSync({ enabled: true, deviceId: 'LOCAL-DEVICE-ID' }),
        }),
        remoteSettings: mkSettings(),
        localManifest,
      });

      await ctx2.usecase.execute();
      expect(ctx2.syncRepoState.saveCalls.length).toBe(1);
      const saved = ctx2.syncRepoState.saveCalls[0]!;
      // settings 엔트리 교체
      expect(saved.files['settings']?.checksum).toBe('remote-checksum');
      // 다른 엔트리는 그대로 유지
      expect(saved.files['events']).toEqual(otherEntry);
      // deviceId/deviceName 등 로컬 유지
      expect(saved.deviceId).toBe('LOCAL-DEVICE-ID');
      expect(saved.deviceName).toBe('로컬 데스크탑');
    });
  });

  describe('widgetStyle.backgroundImage 처리', () => {
    it('로컬에 backgroundImage가 있으면 로컬 값을 유지한다', async () => {
      const localWidgetStyle: WidgetStyleSettings = {
        borderRadius: 4,
        cardColor: null,
        bgColor: null,
        accentColor: null,
        textColor: null,
        cardGap: 12,
        showBorder: false,
        borderWidth: 1,
        borderColor: null,
        shadow: 'none',
        backgroundImage: 'file:///C:/Users/local/bg.png',
        backgroundImageOpacity: 0.15,
        fontFamily: 'pretendard',
        gridRowHeight: 80,
      };
      const remoteWidgetStyle: WidgetStyleSettings = {
        ...localWidgetStyle,
        backgroundImage: 'file:///D:/remote/remote-bg.png',
        cardGap: 20,
      };
      const ctx = makeContext({
        localSettings: mkSettings({ widgetStyle: localWidgetStyle }),
        remoteSettings: mkSettings({ widgetStyle: remoteWidgetStyle }),
      });
      await ctx.usecase.execute();
      const saved = (await ctx.storage.read<Settings>('settings')) as Settings;
      expect(saved.widgetStyle?.backgroundImage).toBe('file:///C:/Users/local/bg.png');
      // 그러나 다른 필드는 리모트 반영
      expect(saved.widgetStyle?.cardGap).toBe(20);
    });

    it('로컬에 backgroundImage가 없으면 null로 설정한다', async () => {
      const remoteWidgetStyle: WidgetStyleSettings = {
        borderRadius: 4,
        cardColor: null,
        bgColor: null,
        accentColor: null,
        textColor: null,
        cardGap: 12,
        showBorder: false,
        borderWidth: 1,
        borderColor: null,
        shadow: 'none',
        backgroundImage: 'file:///D:/remote/remote-bg.png',
        backgroundImageOpacity: 0.15,
        fontFamily: 'pretendard',
        gridRowHeight: 80,
      };
      const ctx = makeContext({
        localSettings: null,
        remoteSettings: mkSettings({ widgetStyle: remoteWidgetStyle }),
      });
      await ctx.usecase.execute();
      const saved = (await ctx.storage.read<Settings>('settings')) as Settings;
      expect(saved.widgetStyle?.backgroundImage).toBe(null);
      expect(saved.widgetStyle?.cardGap).toBe(12);
    });
  });

  describe('NO_BACKUP', () => {
    it('매니페스트가 null이면 NO_BACKUP', async () => {
      const ctx = makeContext({ manifest: null });
      await expect(ctx.usecase.execute()).rejects.toBeInstanceOf(
        ImportSettingsFromCloudError,
      );
      try {
        await ctx.usecase.execute();
      } catch (e) {
        expect((e as ImportSettingsFromCloudError).code).toBe('NO_BACKUP');
      }
    });

    it('매니페스트가 있어도 files.settings 엔트리가 없으면 NO_BACKUP', async () => {
      const ctx = makeContext({
        manifest: mkManifest({ files: {} }),
      });
      try {
        await ctx.usecase.execute();
        expect.fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ImportSettingsFromCloudError);
        expect((e as ImportSettingsFromCloudError).code).toBe('NO_BACKUP');
      }
    });

    it('매니페스트엔 settings 엔트리가 있지만 Drive 파일 목록에 settings.json이 없으면 NO_BACKUP', async () => {
      const ctx = makeContext({
        fileList: [
          {
            id: 'other-file',
            name: 'events.json',
            modifiedTime: REMOTE_SETTINGS_ISO,
          },
        ],
      });
      try {
        await ctx.usecase.execute();
        expect.fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ImportSettingsFromCloudError);
        expect((e as ImportSettingsFromCloudError).code).toBe('NO_BACKUP');
      }
    });
  });

  describe('PARSE_ERROR', () => {
    it('downloadSyncFile이 깨진 JSON을 반환하면 PARSE_ERROR', async () => {
      const ctx = makeContext();
      // 파일 내용을 깨진 JSON으로 교체
      ctx.driveState.files.set('settings-file-id', '{ not valid json');
      try {
        await ctx.usecase.execute();
        expect.fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ImportSettingsFromCloudError);
        expect((e as ImportSettingsFromCloudError).code).toBe('PARSE_ERROR');
      }
    });

    it('JSON이 객체가 아니면 PARSE_ERROR', async () => {
      const ctx = makeContext();
      ctx.driveState.files.set('settings-file-id', '"just a string"');
      try {
        await ctx.usecase.execute();
        expect.fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ImportSettingsFromCloudError);
        expect((e as ImportSettingsFromCloudError).code).toBe('PARSE_ERROR');
      }
    });
  });

  describe('SCOPE_INSUFFICIENT', () => {
    it('drivePort에서 SCOPE_INSUFFICIENT 에러를 throw하면 동일 code로 랩핑', async () => {
      const ctx = makeContext();
      ctx.driveState.throwOnGetFolder = new Error('SCOPE_INSUFFICIENT: missing drive.file');
      try {
        await ctx.usecase.execute();
        expect.fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ImportSettingsFromCloudError);
        expect((e as ImportSettingsFromCloudError).code).toBe('SCOPE_INSUFFICIENT');
      }
    });

    it('getSyncManifest에서 SCOPE_INSUFFICIENT throw도 올바르게 랩핑', async () => {
      const ctx = makeContext();
      ctx.driveState.throwOnGetManifest = new Error('SCOPE_INSUFFICIENT');
      try {
        await ctx.usecase.execute();
        expect.fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ImportSettingsFromCloudError);
        expect((e as ImportSettingsFromCloudError).code).toBe('SCOPE_INSUFFICIENT');
      }
    });
  });

  describe('NETWORK_ERROR', () => {
    it('기타 drive 오류는 NETWORK_ERROR로 랩핑', async () => {
      const ctx = makeContext();
      ctx.driveState.throwOnDownload = new Error('fetch failed: ECONNRESET');
      try {
        await ctx.usecase.execute();
        expect.fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ImportSettingsFromCloudError);
        expect((e as ImportSettingsFromCloudError).code).toBe('NETWORK_ERROR');
      }
    });
  });
});
