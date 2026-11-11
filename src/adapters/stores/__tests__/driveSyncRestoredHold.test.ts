/**
 * ADR-148 — 드라이브 동기화 store 가 시작 스냅샷 복원 기록을 유스케이스에 넘기고, 맞춰진 것을 정리한다.
 *
 * 유스케이스 자체의 판정은 `usecases/sync/__tests__/restoredDataSyncHold.test.ts` 가 실제 동기화 코드로
 * 확인한다. 여기서는 store 배선만 본다: 올리기·받기·저장 시 자동 올리기 모두 같은 훅을 받는지,
 * 동기화를 쓰지 않으면 기록을 건드리지 않는지, 충돌을 풀면 정리하는지.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveSyncConflict } from '@domain/entities/DriveSyncState';
import type { GetRestoredDataHolds } from '@usecases/sync/restoredDataHold';

const settings = {
  teacherName: '선생님',
  sync: { enabled: true, deviceId: 'this-pc', conflictPolicy: 'ask' as const },
};
const toCtorArgs: unknown[][] = [];
const fromCtorArgs: unknown[][] = [];
const resolveExecute = vi.fn(async () => undefined);

vi.mock('@adapters/di/container', () => ({
  driveSyncRepository: {},
  getDriveSyncAdapter: () => ({}),
  authenticateGoogle: { getValidAccessToken: async () => 'token' },
  storage: {},
  noteRepository: { listPageBodyKeys: async () => [] },
  observationAttachmentRepository: {},
  studentPhotoRepository: {},
}));
vi.mock('@adapters/repositories/binarySyncKeys', () => ({ collectBinarySyncKeys: async () => [] }));
vi.mock('@adapters/repositories/archiveSyncGateway', () => ({ hasArchiveSync: () => false }));
vi.mock('@adapters/repositories/driveSyncDeviceState', () => ({
  clearDriveSyncLastSyncedAt: async () => undefined,
  readDriveSyncDeviceState: async () => null,
  saveDriveSyncLastSyncedAt: async () => undefined,
}));
vi.mock('@adapters/hooks/useAnalytics', () => ({ trackAnalytics: () => undefined }));
vi.mock('@adapters/hooks/useDriveSync', () => ({ reloadStores: vi.fn(async () => undefined) }));
vi.mock('../useSettingsStore', () => ({
  useSettingsStore: { getState: () => ({ settings, update: async () => undefined }) },
}));
// 가짜 유스케이스도 진짜처럼 시작할 때 복원 기록 훅을 부른다(못 읽으면 예외로 멈춘다).
vi.mock('@usecases/sync/SyncToCloud', () => ({
  SyncToCloud: class {
    private readonly args: unknown[];
    constructor(...args: unknown[]) {
      this.args = args;
      toCtorArgs.push(args);
    }
    execute = async () => {
      await (this.args[10] as (() => Promise<unknown>) | undefined)?.();
      return {
        uploaded: [],
        skipped: ['todos'],
        deferred: [],
        binaryFailures: [],
        restoredResolved: ['events'],
        restoredReleasedForYearTransition: ['students'],
      };
    };
  },
}));
vi.mock('@usecases/sync/SyncFromCloud', () => ({
  SyncFromCloud: class {
    private readonly args: unknown[];
    constructor(...args: unknown[]) {
      this.args = args;
      fromCtorArgs.push(args);
    }
    execute = async () => {
      await (this.args[12] as (() => Promise<unknown>) | undefined)?.();
      return {
        downloaded: [],
        conflicts: [],
        skipped: [],
        restoredResolved: ['memos'],
      };
    };
  },
}));
vi.mock('@usecases/sync/ResolveSyncConflict', () => ({
  ResolveSyncConflict: class {
    execute = resolveExecute;
  },
}));

import { useDriveSyncStore } from '../useDriveSyncStore';
import {
  getRestoredDataHolds,
  RESTORED_DATA_UNAVAILABLE_MESSAGE,
} from '@adapters/repositories/restoredDataGateway';

const getRestoredDataFiles = vi.fn(async () => [
  {
    id: 'todos@1',
    file: 'todos',
    snapshotModifiedAt: '2026-11-10T04:41:00.000Z',
    notified: true,
    syncResolved: false,
  },
  {
    id: 'memos@1',
    file: 'memos',
    snapshotModifiedAt: '2026-11-01T00:00:00.000Z',
    notified: true,
    syncResolved: true,
  },
]);
const markRestoredDataSyncResolved = vi.fn(async () => undefined);

beforeEach(() => {
  toCtorArgs.length = 0;
  fromCtorArgs.length = 0;
  getRestoredDataFiles.mockClear();
  markRestoredDataSyncResolved.mockClear();
  settings.sync.enabled = true;
  vi.stubGlobal('window', {
    electronAPI: { getRestoredDataFiles, markRestoredDataSyncResolved },
  });
  useDriveSyncStore.setState({
    status: 'idle',
    conflicts: [],
    conflictError: null,
    resolvingConflict: null,
    error: null,
    firstSyncRequired: false,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('드라이브 동기화 store — 시작 스냅샷 복원 보호', () => {
  it('올리기·받기 모두 복원 기록 훅을 넘기고, 맞춰진 것을 정리한다', async () => {
    await useDriveSyncStore.getState().syncToCloud();
    await useDriveSyncStore.getState().syncFromCloud();

    // SyncToCloud 11번째·SyncFromCloud 13번째 인자
    const toHook = toCtorArgs[0]?.[10] as GetRestoredDataHolds;
    const fromHook = fromCtorArgs[0]?.[12] as GetRestoredDataHolds;
    expect(toHook).toBe(getRestoredDataHolds);
    expect(fromHook).toBe(getRestoredDataHolds);
    // 맞춰지지 않은 것만 보호 대상이다
    expect(await toHook()).toEqual([{ key: 'todos', restoredStateAt: '2026-11-10T04:41:00.000Z' }]);
    expect(markRestoredDataSyncResolved).toHaveBeenNthCalledWith(1, ['events'], undefined);
    // 학년도 전환 표시 때문에 보호 없이 올린 키는 그 까닭과 함께 정리한다
    expect(markRestoredDataSyncResolved).toHaveBeenNthCalledWith(
      2,
      ['students'],
      'year-transition',
    );
    expect(markRestoredDataSyncResolved).toHaveBeenNthCalledWith(3, ['memos'], undefined);
  });

  it('저장 시 자동 올리기도 같은 보호를 받는다', async () => {
    vi.useFakeTimers();
    useDriveSyncStore.getState().triggerSaveSync();
    await vi.advanceTimersByTimeAsync(5000);
    await vi.waitFor(() => expect(toCtorArgs).toHaveLength(1));

    expect(toCtorArgs[0]?.[10]).toBe(getRestoredDataHolds);
  });

  it('동기화를 쓰지 않으면 아무것도 바꾸지 않는다', async () => {
    settings.sync.enabled = false;

    await useDriveSyncStore.getState().syncToCloud();
    await useDriveSyncStore.getState().syncFromCloud();

    expect(toCtorArgs).toHaveLength(0);
    expect(fromCtorArgs).toHaveLength(0);
    expect(getRestoredDataFiles).not.toHaveBeenCalled();
    expect(markRestoredDataSyncResolved).not.toHaveBeenCalled();
  });

  it('충돌을 어느 쪽으로든 풀면 그 자료의 복원 기록을 정리한다', async () => {
    const conflict: DriveSyncConflict = {
      filename: 'todos',
      localModified: '2026-11-10T04:41:00.000Z',
      remoteModified: '2026-11-10T07:00:00.000Z',
      localDeviceName: '이 PC',
      remoteDeviceName: '이 PC',
      kind: 'json',
      baselineChecksum: 'b',
      localChecksum: 'l',
      remoteChecksum: 'r',
    };
    useDriveSyncStore.setState({ status: 'conflict', conflicts: [conflict] });

    await useDriveSyncStore.getState().resolveConflict(conflict, 'remote');

    expect(resolveExecute).toHaveBeenCalledWith(conflict, 'remote');
    expect(markRestoredDataSyncResolved).toHaveBeenCalledWith(['todos'], undefined);
  });

  it.each(['syncToCloud', 'syncFromCloud'] as const)(
    '복원 기록을 읽지 못하면 이번 동기화를 멈추고 기존 오류 표시로 알린다: %s',
    async (action) => {
      getRestoredDataFiles.mockRejectedValueOnce(
        new Error("Error invoking remote method 'data:restored-list'"),
      );

      await useDriveSyncStore.getState()[action]();

      const state = useDriveSyncStore.getState();
      expect(state.status).toBe('error');
      expect(state.error).toBe(RESTORED_DATA_UNAVAILABLE_MESSAGE);
      expect(markRestoredDataSyncResolved).not.toHaveBeenCalled();
    },
  );
});
