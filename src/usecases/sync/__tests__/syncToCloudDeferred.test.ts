import { describe, it, expect, vi } from 'vitest';
import { SyncToCloud, computeSyncChecksum } from '../SyncToCloud';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type { DriveSyncManifest } from '@domain/entities/DriveSyncState';

function manifest(files: DriveSyncManifest['files'], deviceId: string): DriveSyncManifest {
  return {
    version: 1,
    lastSyncedAt: '2026-07-06T00:00:00Z',
    deviceId,
    deviceName: deviceId,
    files,
  };
}

/** todos만 데이터가 있는 스토리지 — 나머지 파일은 전부 '데이터 없음' 스킵 */
function makeStorage(): IStoragePort {
  return {
    read: vi.fn(async (filename: string) =>
      filename === 'todos' ? ({ items: ['변경된 로컬 할일'] } as unknown) : null,
    ),
    write: vi.fn(async () => undefined),
    readBinary: vi.fn(async () => null),
    writeBinary: vi.fn(async () => undefined),
  } as unknown as IStoragePort;
}

function makeDrivePort(remote: DriveSyncManifest | null): {
  port: IDriveSyncPort;
  uploadSyncFile: ReturnType<typeof vi.fn>;
} {
  const uploadSyncFile = vi.fn(async () => ({
    fileId: 'file-1',
    modifiedTime: '2026-07-06T01:00:00Z',
  }));
  let currentRemote = remote;
  const port = {
    getOrCreateSyncFolder: vi.fn(async () => ({ id: 'folder-1', name: '쌤핀 동기화' })),
    uploadSyncFile,
    uploadSyncFileIfUnchanged: uploadSyncFile,
    createSyncFileIfMissing: vi.fn(
      async (_folderId: string, filename: string, content: string) => {
        if (filename === 'manifest.json') {
          if (currentRemote) return null;
          currentRemote = JSON.parse(content) as DriveSyncManifest;
        }
        return { fileId: filename, modifiedTime: '2026-07-06T01:00:00Z' };
      },
    ),
    downloadSyncFile: vi.fn(async () => '{}'),
    getSyncManifest: vi.fn(async () => currentRemote),
    updateSyncManifest: vi.fn(async () => 'manifest-id'),
    updateSyncManifestIfUnchanged: vi.fn(async () => true),
    listSyncFiles: vi.fn(async () =>
      currentRemote?.files.todos
        ? [
            {
              id: 'todos',
              name: 'todos.json',
              modifiedTime: currentRemote.files.todos.lastModified,
            },
          ]
        : [],
    ),
    deleteSyncFolder: vi.fn(async () => undefined),
  } as unknown as IDriveSyncPort;
  return { port, uploadSyncFile };
}

function makeSyncRepo(local: DriveSyncManifest | null): IDriveSyncRepository {
  return {
    getLocalManifest: vi.fn(async () => local),
    saveLocalManifest: vi.fn(async () => undefined),
  };
}

describe('SyncToCloud deferred — 리모트 변경으로 업로드가 유예된 파일 분류', () => {
  it('로컬 내용이 장부와 같아도 리모트 장부가 바뀌었으면 pull 대상으로 유예한다', async () => {
    const checksum = await computeSyncChecksum(JSON.stringify({ items: ['변경된 로컬 할일'] }));
    const local = manifest(
      { todos: { checksum, lastModified: '2026-07-05T00:00:00Z', size: 10 } },
      'my-device',
    );
    const remote = manifest(
      {
        todos: {
          checksum: 'other-device-checksum',
          lastModified: '2026-07-06T00:30:00Z',
          size: 12,
          uploadedBy: 'other-device',
        },
      },
      'other-device',
    );
    const { port, uploadSyncFile } = makeDrivePort(remote);
    vi.mocked(port.listSyncFiles).mockResolvedValue([
      { id: 'todos', name: 'todos.json', modifiedTime: '2026-07-06T00:30:00Z' },
    ]);

    const result = await new SyncToCloud(
      makeStorage(),
      port,
      makeSyncRepo(local),
      'my-device',
      '내 폰',
    ).execute();

    expect(result.deferred).toEqual(['todos']);
    expect(result.skipped).toContain('todos');
    expect(uploadSyncFile).not.toHaveBeenCalled();
  });

  it('리모트가 내 마지막 동기화 이후 변경된 파일은 업로드하지 않고 deferred로 분류한다', async () => {
    // 로컬 manifest의 todos 체크섬(과거 동기화 시점) ≠ 리모트 manifest의 todos 체크섬(다른 기기가 올림)
    const local = manifest(
      { todos: { checksum: 'old-checksum', lastModified: '2026-07-05T00:00:00Z', size: 10 } },
      'my-device',
    );
    const remote = manifest(
      {
        todos: {
          checksum: 'other-device-checksum',
          lastModified: '2026-07-06T00:30:00Z',
          size: 12,
        },
      },
      'other-device',
    );
    const { port, uploadSyncFile } = makeDrivePort(remote);
    const useCase = new SyncToCloud(makeStorage(), port, makeSyncRepo(local), 'my-device', '내 폰');

    const result = await useCase.execute();

    expect(result.deferred).toEqual(['todos']);
    expect(result.skipped).toContain('todos'); // 요약 UI 집계 호환: skipped에도 포함
    expect(result.uploaded).not.toContain('todos');
    expect(uploadSyncFile).not.toHaveBeenCalled();
  });

  it('리모트가 그대로면(체크섬 일치) 정상 업로드되고 deferred는 비어 있다', async () => {
    const local = manifest(
      { todos: { checksum: 'old-checksum', lastModified: '2026-07-05T00:00:00Z', size: 10 } },
      'my-device',
    );
    // 리모트 체크섬 == 내 로컬 manifest 체크섬 → 아무도 안 건드림 → 업로드 가능
    const remote = manifest(
      { todos: { checksum: 'old-checksum', lastModified: '2026-07-05T00:00:00Z', size: 10 } },
      'my-device',
    );
    const { port, uploadSyncFile } = makeDrivePort(remote);
    const useCase = new SyncToCloud(makeStorage(), port, makeSyncRepo(local), 'my-device', '내 폰');

    const result = await useCase.execute();

    expect(result.deferred).toEqual([]);
    expect(result.uploaded).toContain('todos');
    expect(uploadSyncFile).toHaveBeenCalled();
  });

  it('로컬 manifest가 없는 새 기기는 기존 리모트를 덮지 않고 다운로드 대상으로 유예한다', async () => {
    const remote = manifest(
      {
        todos: {
          checksum: 'other-device-checksum',
          lastModified: '2026-07-06T00:30:00Z',
          size: 12,
          uploadedBy: 'other-device',
        },
      },
      'other-device',
    );
    const { port, uploadSyncFile } = makeDrivePort(remote);
    const useCase = new SyncToCloud(makeStorage(), port, makeSyncRepo(null), 'my-device', '내 폰');

    const result = await useCase.execute();

    expect(result.deferred).toEqual(['todos']);
    expect(result.uploaded).not.toContain('todos');
    expect(uploadSyncFile).not.toHaveBeenCalled();
  });
});
