import { describe, expect, it, vi } from 'vitest';

import { withDataOperationLock } from '../dataOperationMutex';
import { SyncToCloud } from '@usecases/sync/SyncToCloud';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type { DriveSyncManifest } from '@domain/entities/DriveSyncState';

describe('withDataOperationLock', () => {
  it('데이터 작업을 시작 순서대로 한 번에 하나만 실행한다', async () => {
    const order: string[] = [];
    let releaseFirst: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = withDataOperationLock(async () => {
      order.push('first:start');
      await firstGate;
      order.push('first:end');
    });
    const second = withDataOperationLock(async () => {
      order.push('second:start');
      order.push('second:end');
    });

    await vi.waitFor(() => expect(order).toEqual(['first:start']));
    releaseFirst();
    await Promise.all([first, second]);

    expect(order).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('앞 작업이 실패해도 다음 작업의 잠금을 해제한다', async () => {
    const next = vi.fn(async () => 'continued');

    await expect(
      withDataOperationLock(async () => {
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');

    await expect(withDataOperationLock(next)).resolves.toBe('continued');
    expect(next).toHaveBeenCalledOnce();
  });

  it('실제 SyncToCloud 진입점도 동시 실행되지 않는다', async () => {
    const manifest: DriveSyncManifest = {
      version: 1,
      lastSyncedAt: '2026-08-24T00:00:00.000Z',
      deviceId: 'device',
      deviceName: '기기',
      files: {},
    };
    const storage = {
      read: vi.fn(async () => null),
      write: vi.fn(async () => undefined),
      readBinary: vi.fn(async () => null),
      writeBinary: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
      removeBinary: vi.fn(async () => undefined),
      listBinary: vi.fn(async () => []),
    } as unknown as IStoragePort;
    const repo = {
      getLocalManifest: vi.fn(async () => manifest),
      saveLocalManifest: vi.fn(async () => undefined),
    } as IDriveSyncRepository;
    const makePort = (getFolder: () => Promise<{ id: string; name: string }>) =>
      ({
        getOrCreateSyncFolder: getFolder,
        getSyncManifest: vi.fn(async () => manifest),
        listSyncFiles: vi.fn(async () => []),
      }) as unknown as IDriveSyncPort;

    let releaseFirst: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstGetFolder = vi.fn(async () => {
      await firstGate;
      return { id: 'folder', name: '쎤핀 동기화' };
    });
    const secondGetFolder = vi.fn(async () => ({ id: 'folder', name: '쎤핀 동기화' }));

    const first = new SyncToCloud(
      storage,
      makePort(firstGetFolder),
      repo,
      'device-1',
      '기기 1',
    ).execute();
    await vi.waitFor(() => expect(firstGetFolder).toHaveBeenCalledOnce());
    const second = new SyncToCloud(
      storage,
      makePort(secondGetFolder),
      repo,
      'device-2',
      '기기 2',
    ).execute();

    await Promise.resolve();
    expect(secondGetFolder).not.toHaveBeenCalled();
    releaseFirst();
    await Promise.all([first, second]);
    expect(secondGetFolder).toHaveBeenCalledOnce();
  });
});
