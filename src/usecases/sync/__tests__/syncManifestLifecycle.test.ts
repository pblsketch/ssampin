/**
 * 매니페스트 라이프사이클 회귀 테스트 (2026-07-21 모바일 동기화 안 됨 신고).
 *
 * 근본 원인: SyncToCloud가 업로드 0건(no-op)이어도 매니페스트를 무조건 재작성하며
 * {...remote.files, ...local.files} 단일 병합을 리모트/로컬 양쪽에 저장했다.
 *  ① 받은 적 없는 리모트 항목이 로컬 장부에 승계 → 이후 다운로드가 checksum 동일
 *     판정으로 영구 스킵 (PC 데이터가 폰에 영원히 안 내려옴)
 *  ② 낡은 로컬 항목이 리모트의 더 새 항목을 되돌리고 deviceId가 no-op 업로더로 찍힘
 *
 * 수정: no-op이면 매니페스트 미작성 + 업로드한 항목만 각 장부에 반영 + 파일별
 * uploadedBy 기록 + 다운로드 시 "장부엔 받았음인데 로컬 파일 없음" 오염 자가 치유.
 */
import { describe, it, expect, vi } from 'vitest';
import { SyncToCloud, computeSyncChecksum } from '../SyncToCloud';
import { SyncFromCloud } from '../SyncFromCloud';
import { ResolveSyncConflict } from '../ResolveSyncConflict';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type { DriveSyncManifest } from '@domain/entities/DriveSyncState';

function manifest(files: DriveSyncManifest['files'], deviceId: string): DriveSyncManifest {
  return {
    version: 1,
    lastSyncedAt: '2026-07-21T03:00:00Z',
    deviceId,
    deviceName: deviceId,
    files,
  };
}

/** 인메모리 스토리지 — 초기 파일 셋을 주면 read/write가 그대로 동작 */
function makeStorage(initial: Record<string, unknown> = {}) {
  const files: Record<string, unknown> = { ...initial };
  const storage = {
    read: vi.fn(async (filename: string) => (filename in files ? files[filename] : null)),
    write: vi.fn(async (filename: string, data: unknown) => {
      files[filename] = data;
    }),
    readBinary: vi.fn(async () => null),
    writeBinary: vi.fn(async () => undefined),
  } as unknown as IStoragePort;
  return { storage, files };
}

/** 인메모리 Drive — 리모트 매니페스트와 파일 내용을 상태로 유지 */
function makeDrive(
  initialManifest: DriveSyncManifest | null,
  initialFileContents?: Record<string, string>,
) {
  const fileContents: Record<string, string> =
    initialFileContents ??
    Object.fromEntries(Object.keys(initialManifest?.files ?? {}).map((key) => [key, '{}']));
  const state = { manifest: initialManifest };
  const fileModifiedTimes: Record<string, string> = {};
  for (const key of Object.keys(fileContents)) {
    fileModifiedTimes[key] = initialManifest?.files[key]?.lastModified ?? '2026-07-21T03:00:00Z';
  }
  let uploadSequence = 0;
  const updateSyncManifest = vi.fn(async (_folderId: string, m: DriveSyncManifest) => {
    state.manifest = m;
    return 'manifest';
  });
  const updateSyncManifestIfUnchanged = vi.fn(
    async (_folderId: string, expected: DriveSyncManifest, next: DriveSyncManifest) => {
      if (JSON.stringify(state.manifest) !== JSON.stringify(expected)) return false;
      state.manifest = next;
      return true;
    },
  );
  const port = {
    getOrCreateSyncFolder: vi.fn(async () => ({ id: 'folder-1', name: '쌤핀 동기화' })),
    uploadSyncFile: vi.fn(
      async (_folderId: string, filename: string, content: string) => {
        const key = filename.replace(/\.json$/, '');
        uploadSequence += 1;
        const modifiedTime = `2026-07-21T07:34:${String(uploadSequence).padStart(2, '0')}Z`;
        fileContents[key] = content;
        fileModifiedTimes[key] = modifiedTime;
        return { fileId: key, modifiedTime };
      },
    ),
    uploadSyncFileIfUnchanged: vi.fn(
      async (
        _folderId: string,
        filename: string,
        content: string,
        expectedModifiedTime: string,
      ) => {
        const key = filename.replace(/\.json$/, '');
        if (fileModifiedTimes[key] !== expectedModifiedTime) return null;
        fileContents[key] = content;
        uploadSequence += 1;
        const modifiedTime = `2026-07-21T07:33:${String(uploadSequence).padStart(2, '0')}Z`;
        fileModifiedTimes[key] = modifiedTime;
        return { fileId: key, modifiedTime };
      },
    ),
    createSyncFileIfMissing: vi.fn(
      async (_folderId: string, filename: string, content: string) => {
        const key = filename.replace(/\.json$/, '');
        if (key in fileContents) return null;
        uploadSequence += 1;
        const modifiedTime = `2026-07-21T07:32:${String(uploadSequence).padStart(2, '0')}Z`;
        fileContents[key] = content;
        fileModifiedTimes[key] = modifiedTime;
        if (filename === 'manifest.json') {
          state.manifest = JSON.parse(content) as DriveSyncManifest;
        }
        return { fileId: key, modifiedTime };
      },
    ),
    downloadSyncFile: vi.fn(async (fileId: string) => fileContents[fileId] ?? '{}'),
    getSyncManifest: vi.fn(async () => state.manifest),
    updateSyncManifest,
    updateSyncManifestIfUnchanged,
    listSyncFiles: vi.fn(async () =>
      Object.keys(fileContents).map((id) => ({
        id,
        name: `${id}.json`,
        modifiedTime: fileModifiedTimes[id],
      })),
    ),
    deleteSyncFolder: vi.fn(async () => undefined),
  } as unknown as IDriveSyncPort;
  return {
    port,
    state,
    updateSyncManifest,
    updateSyncManifestIfUnchanged,
    fileContents,
    fileModifiedTimes,
  };
}

function makeSyncRepo(initial: DriveSyncManifest | null) {
  const state = { manifest: initial };
  const saveLocalManifest = vi.fn(async (m: DriveSyncManifest) => {
    state.manifest = m;
  });
  const repo: IDriveSyncRepository = {
    getLocalManifest: vi.fn(async () => state.manifest),
    saveLocalManifest,
  };
  return { repo, state, saveLocalManifest };
}

describe('SyncToCloud 매니페스트 라이프사이클', () => {
  it('장부 체크섬은 같아도 Drive 실제 파일이 없으면 로컬 원본을 다시 업로드한다', async () => {
    const localData = { items: [{ id: 'todo-1', text: '정상 PC 할 일' }] };
    const content = JSON.stringify(localData);
    const checksum = await computeSyncChecksum(content);
    const entry = {
      checksum,
      lastModified: '2026-08-09T00:00:00Z',
      size: new TextEncoder().encode(content).length,
      uploadedBy: 'desktop-device',
    };
    const remote = manifest({ todos: entry }, 'desktop-device');
    const local = manifest({ todos: entry }, 'desktop-device');
    const { storage } = makeStorage({ todos: localData });
    const { port, state: driveState, fileContents } = makeDrive(remote, {});
    const { repo, state: localState } = makeSyncRepo(local);

    const result = await new SyncToCloud(
      storage,
      port,
      repo,
      'desktop-device',
      '정상 PC',
    ).execute();

    expect(result.uploaded).toContain('todos');
    expect(fileContents.todos).toBe(content);
    expect(driveState.manifest?.files.todos?.checksum).toBe(checksum);
    expect(localState.manifest?.files.todos?.checksum).toBe(checksum);
  });

  it('Drive 파일 재생성 후 manifest CAS가 실패하면 로컬 장부를 성공으로 기록하지 않는다', async () => {
    const localData = { items: [{ id: 'todo-1', text: '정상 PC 할 일' }] };
    const content = JSON.stringify(localData);
    const checksum = await computeSyncChecksum(content);
    const entry = {
      checksum,
      lastModified: '2026-08-09T00:00:00Z',
      size: new TextEncoder().encode(content).length,
      uploadedBy: 'desktop-device',
    };
    const remote = manifest({ todos: entry }, 'desktop-device');
    const local = manifest({ todos: entry }, 'desktop-device');
    const { storage } = makeStorage({ todos: localData });
    const { port, fileContents } = makeDrive(remote, {});
    vi.mocked(port.updateSyncManifestIfUnchanged).mockResolvedValueOnce(false);
    const { repo, state: localState, saveLocalManifest } = makeSyncRepo(local);

    await expect(
      new SyncToCloud(storage, port, repo, 'desktop-device', '정상 PC').execute(),
    ).rejects.toThrow('클라우드 동기화 장부가 다른 기기에서 변경되었습니다');

    expect(fileContents.todos).toBe(content);
    expect(saveLocalManifest).not.toHaveBeenCalled();
    expect(localState.manifest).toEqual(local);
  });

  it('변경 본문 업로드 후 manifest CAS가 실패해도 다음 실행에서 재업로드 없이 장부를 수렴한다', async () => {
    const oldData = { items: [{ id: 'todo-1', text: '이전 할 일' }] };
    const currentData = { items: [{ id: 'todo-1', text: '수정된 할 일' }] };
    const oldContent = JSON.stringify(oldData);
    const currentContent = JSON.stringify(currentData);
    const oldChecksum = await computeSyncChecksum(oldContent);
    const currentChecksum = await computeSyncChecksum(currentContent);
    const oldEntry = {
      checksum: oldChecksum,
      lastModified: '2026-07-21T03:00:00Z',
      size: new TextEncoder().encode(oldContent).length,
      uploadedBy: 'desktop-device',
    };
    const remote = manifest({ todos: oldEntry }, 'desktop-device');
    const local = manifest({ todos: oldEntry }, 'desktop-device');
    const { storage } = makeStorage({ todos: currentData });
    const {
      port,
      state: driveState,
      fileContents,
      updateSyncManifestIfUnchanged,
    } = makeDrive(remote, { todos: oldContent });
    updateSyncManifestIfUnchanged.mockResolvedValueOnce(false);
    const { repo, state: localState, saveLocalManifest } = makeSyncRepo(local);
    const useCase = new SyncToCloud(storage, port, repo, 'desktop-device', '정상 PC');

    await expect(useCase.execute()).rejects.toThrow(
      '클라우드 동기화 장부가 다른 기기에서 변경되었습니다',
    );
    expect(fileContents.todos).toBe(currentContent);
    expect(saveLocalManifest).not.toHaveBeenCalled();

    const retry = await useCase.execute();

    expect(retry.skipped).toContain('todos');
    expect(port.uploadSyncFileIfUnchanged).toHaveBeenCalledTimes(1);
    expect(driveState.manifest?.files.todos?.checksum).toBe(currentChecksum);
    expect(localState.manifest?.files.todos?.checksum).toBe(currentChecksum);
  });

  it('신규 파일 생성 후 manifest CAS가 실패해도 동일한 실제 본문이면 다음 실행에서 장부에 안전하게 편입한다', async () => {
    const localData = { items: [{ id: 'todo-new', text: '최초 업로드 할 일' }] };
    const content = JSON.stringify(localData);
    const checksum = await computeSyncChecksum(content);
    const remote = manifest({}, 'desktop-device');
    const local = manifest({}, 'desktop-device');
    const { storage } = makeStorage({ todos: localData });
    const {
      port,
      state: driveState,
      fileContents,
      updateSyncManifestIfUnchanged,
    } = makeDrive(remote, {});
    updateSyncManifestIfUnchanged.mockResolvedValueOnce(false);
    const { repo, state: localState } = makeSyncRepo(local);
    const useCase = new SyncToCloud(storage, port, repo, 'desktop-device', '내 PC');

    await expect(useCase.execute()).rejects.toThrow(
      '클라우드 동기화 장부가 다른 기기에서 변경되었습니다',
    );
    expect(fileContents.todos).toBe(content);

    const retry = await useCase.execute();

    expect(retry.skipped).toContain('todos');
    expect(port.createSyncFileIfMissing).toHaveBeenCalledTimes(1);
    expect(driveState.manifest?.files.todos?.checksum).toBe(checksum);
    expect(localState.manifest?.files.todos?.checksum).toBe(checksum);
  });

  it('신규 바이너리 생성 후 manifest CAS 실패도 동일 본문이면 다음 실행에서 장부에 편입한다', async () => {
    const relPath = 'obs-attachments/attachment-new.png';
    const driveKey = 'obs-attachments__attachment-new.png';
    const bytes = new Uint8Array([1, 2, 3]);
    const content = JSON.stringify({ __binaryBase64: 'AQID', __relPath: relPath });
    const checksum = await computeSyncChecksum(content);
    const { storage } = makeStorage();
    vi.mocked(storage.readBinary).mockResolvedValue(bytes);
    const {
      port,
      state: driveState,
      fileContents,
      updateSyncManifestIfUnchanged,
    } = makeDrive(manifest({}, 'desktop-device'), {});
    updateSyncManifestIfUnchanged.mockResolvedValueOnce(false);
    const { repo, state: localState } = makeSyncRepo(manifest({}, 'desktop-device'));
    const useCase = new SyncToCloud(
      storage,
      port,
      repo,
      'desktop-device',
      '내 PC',
      undefined,
      async () => [relPath],
    );

    await expect(useCase.execute()).rejects.toThrow(
      '클라우드 동기화 장부가 다른 기기에서 변경되었습니다',
    );
    expect(fileContents[driveKey]).toBe(content);

    const retry = await useCase.execute();

    expect(retry.skipped).toContain(relPath);
    expect(port.createSyncFileIfMissing).toHaveBeenCalledTimes(1);
    expect(driveState.manifest?.files[relPath]?.checksum).toBe(checksum);
    expect(localState.manifest?.files[relPath]?.checksum).toBe(checksum);
  });

  it('새 기기는 기존 원격 바이너리 첨부를 덮어쓰지 않고 다운로드 대상으로 유예한다', async () => {
    const relPath = 'obs-attachments/attachment-1.png';
    const driveKey = 'obs-attachments__attachment-1.png';
    const localBytes = new Uint8Array([1, 2, 3]);
    const remoteContent = JSON.stringify({ __binaryBase64: 'CQkJ', __relPath: relPath });
    const remoteEntry = {
      checksum: await computeSyncChecksum(remoteContent),
      lastModified: '2026-07-21T03:00:00Z',
      size: remoteContent.length,
      uploadedBy: 'other-device',
    };
    const { storage } = makeStorage();
    vi.mocked(storage.readBinary).mockResolvedValue(localBytes);
    const { port, fileContents } = makeDrive(
      manifest({ [relPath]: remoteEntry }, 'other-device'),
      { [driveKey]: remoteContent },
    );
    const { repo } = makeSyncRepo(manifest({}, 'current-device'));

    const result = await new SyncToCloud(
      storage,
      port,
      repo,
      'current-device',
      '새 PC',
      undefined,
      async () => [relPath],
    ).execute();

    expect(result.deferred).toContain(relPath);
    expect(fileContents[driveKey]).toBe(remoteContent);
    expect(port.uploadSyncFile).not.toHaveBeenCalled();
    expect(port.uploadSyncFileIfUnchanged).not.toHaveBeenCalled();
  });

  it('장부에 없는 실제 바이너리 첨부는 자동 PATCH하지 않고 안전하게 중단한다', async () => {
    const relPath = 'obs-attachments/attachment-2.png';
    const driveKey = 'obs-attachments__attachment-2.png';
    const remoteContent = JSON.stringify({ __binaryBase64: 'CQkJ', __relPath: relPath });
    const { storage } = makeStorage();
    vi.mocked(storage.readBinary).mockResolvedValue(new Uint8Array([1, 2, 3]));
    const { port, fileContents } = makeDrive(manifest({}, 'current-device'), {
      [driveKey]: remoteContent,
    });
    const { repo, saveLocalManifest } = makeSyncRepo(manifest({}, 'current-device'));

    await expect(
      new SyncToCloud(
        storage,
        port,
        repo,
        'current-device',
        '내 PC',
        undefined,
        async () => [relPath],
      ).execute(),
    ).rejects.toThrow(`클라우드 ${relPath} 파일과 동기화 장부가 일치하지 않습니다`);

    expect(fileContents[driveKey]).toBe(remoteContent);
    expect(port.uploadSyncFile).not.toHaveBeenCalled();
    expect(saveLocalManifest).not.toHaveBeenCalled();
  });

  it('기존 바이너리 첨부 변경은 무조건 PATCH 대신 조건부 업로드를 사용한다', async () => {
    const relPath = 'obs-attachments/attachment-3.png';
    const driveKey = 'obs-attachments__attachment-3.png';
    const oldContent = JSON.stringify({ __binaryBase64: 'CQkJ', __relPath: relPath });
    const currentContent = JSON.stringify({ __binaryBase64: 'AQID', __relPath: relPath });
    const oldEntry = {
      checksum: await computeSyncChecksum(oldContent),
      lastModified: '2026-07-21T03:00:00Z',
      size: oldContent.length,
      uploadedBy: 'current-device',
    };
    const currentChecksum = await computeSyncChecksum(currentContent);
    const { storage } = makeStorage();
    vi.mocked(storage.readBinary).mockResolvedValue(new Uint8Array([1, 2, 3]));
    const { port, fileContents, state: driveState } = makeDrive(
      manifest({ [relPath]: oldEntry }, 'current-device'),
      { [driveKey]: oldContent },
    );
    const { repo, state: localState } = makeSyncRepo(
      manifest({ [relPath]: oldEntry }, 'current-device'),
    );

    const result = await new SyncToCloud(
      storage,
      port,
      repo,
      'current-device',
      '내 PC',
      undefined,
      async () => [relPath],
    ).execute();

    expect(result.uploaded).toContain(relPath);
    expect(port.uploadSyncFileIfUnchanged).toHaveBeenCalledTimes(1);
    expect(port.uploadSyncFile).not.toHaveBeenCalled();
    expect(fileContents[driveKey]).toBe(currentContent);
    expect(driveState.manifest?.files[relPath]?.checksum).toBe(currentChecksum);
    expect(localState.manifest?.files[relPath]?.checksum).toBe(currentChecksum);
  });

  it('Drive 실제 파일이 없어도 다른 기기가 올린 항목은 이 기기 원본으로 재생성하지 않는다', async () => {
    const localData = { items: [{ id: 'todo-1', text: '이 기기 할 일' }] };
    const content = JSON.stringify(localData);
    const checksum = await computeSyncChecksum(content);
    const remoteEntry = {
      checksum,
      lastModified: '2026-08-09T00:00:00Z',
      size: new TextEncoder().encode(content).length,
      uploadedBy: 'other-device',
    };
    const localEntry = { ...remoteEntry, uploadedBy: 'desktop-device' };
    const { storage } = makeStorage({ todos: localData });
    const { port, fileContents } = makeDrive(
      manifest({ todos: remoteEntry }, 'other-device'),
      {},
    );
    const { repo } = makeSyncRepo(manifest({ todos: localEntry }, 'desktop-device'));

    await expect(
      new SyncToCloud(storage, port, repo, 'desktop-device', '내 PC').execute(),
    ).rejects.toThrow('다른 기기가 올린 클라우드 todos 파일을 찾지 못했습니다');
    expect(fileContents.todos).toBeUndefined();
    expect(port.uploadSyncFile).not.toHaveBeenCalled();
  });

  it('파일별 소유권이 없는 레거시 장부는 top-level deviceId가 같아도 자동 재생성하지 않는다', async () => {
    const localData = { items: [{ id: 'todo-1', text: '레거시 할 일' }] };
    const content = JSON.stringify(localData);
    const checksum = await computeSyncChecksum(content);
    const legacyEntry = {
      checksum,
      lastModified: '2026-08-09T00:00:00Z',
      size: new TextEncoder().encode(content).length,
    };
    const { storage } = makeStorage({ todos: localData });
    const { port } = makeDrive(manifest({ todos: legacyEntry }, 'desktop-device'), {});
    const { repo } = makeSyncRepo(manifest({ todos: legacyEntry }, 'desktop-device'));

    await expect(
      new SyncToCloud(storage, port, repo, 'desktop-device', '내 PC').execute(),
    ).rejects.toThrow('소유 기기를 확인할 수 없는 클라우드 todos 파일');
    expect(port.uploadSyncFile).not.toHaveBeenCalled();
  });

  it('누락 파일 확인 직후 같은 이름 파일이 나타나면 새 파일을 덮어쓰지 않고 중단한다', async () => {
    const localData = { items: [{ id: 'todo-1', text: '정상 PC 할 일' }] };
    const content = JSON.stringify(localData);
    const checksum = await computeSyncChecksum(content);
    const entry = {
      checksum,
      lastModified: '2026-08-09T00:00:00Z',
      size: new TextEncoder().encode(content).length,
      uploadedBy: 'desktop-device',
    };
    const remote = manifest({ todos: entry }, 'desktop-device');
    const local = manifest({ todos: entry }, 'desktop-device');
    const { storage } = makeStorage({ todos: localData });
    const { port, fileContents } = makeDrive(remote, {});
    vi.mocked(port.createSyncFileIfMissing).mockImplementationOnce(async () => {
      fileContents.todos = JSON.stringify({ items: [{ id: 'other', text: '다른 기기 데이터' }] });
      return null;
    });
    const { repo, saveLocalManifest } = makeSyncRepo(local);

    await expect(
      new SyncToCloud(storage, port, repo, 'desktop-device', '내 PC').execute(),
    ).rejects.toThrow('클라우드 todos 파일이 동기화 중 생성되었습니다');
    expect(fileContents.todos).toContain('다른 기기 데이터');
    expect(port.uploadSyncFile).not.toHaveBeenCalled();
    expect(saveLocalManifest).not.toHaveBeenCalled();
  });

  it('최초 manifest 생성 경쟁이 발생하면 데이터 파일 업로드와 로컬 장부 저장을 시작하지 않는다', async () => {
    const { storage } = makeStorage({ todos: { items: [{ id: 'todo-1', text: '첫 할 일' }] } });
    const { port } = makeDrive(null, {});
    vi.mocked(port.createSyncFileIfMissing).mockResolvedValueOnce(null);
    const { repo, saveLocalManifest } = makeSyncRepo(null);

    await expect(
      new SyncToCloud(storage, port, repo, 'desktop-device', '내 PC').execute(),
    ).rejects.toThrow('클라우드 동기화 장부가 다른 기기에서 생성되었습니다');
    expect(port.uploadSyncFile).not.toHaveBeenCalled();
    expect(saveLocalManifest).not.toHaveBeenCalled();
  });

  it('Drive 실제 파일 revision이 장부와 다르면 변경 없음으로 숨기거나 자동 덮어쓰지 않는다', async () => {
    const localData = { items: [{ id: 'todo-1', text: '정상 PC 할 일' }] };
    const localContent = JSON.stringify(localData);
    const checksum = await computeSyncChecksum(localContent);
    const entry = {
      checksum,
      lastModified: '2026-08-09T00:00:00Z',
      size: new TextEncoder().encode(localContent).length,
      uploadedBy: 'desktop-device',
    };
    const remote = manifest({ todos: entry }, 'desktop-device');
    const local = manifest({ todos: entry }, 'desktop-device');
    const unexpectedRemoteContent = JSON.stringify({ items: [{ id: 'remote-new', text: '장부 밖 변경' }] });
    const { storage } = makeStorage({ todos: localData });
    const { port, fileContents, fileModifiedTimes } = makeDrive(remote, {
      todos: unexpectedRemoteContent,
    });
    fileModifiedTimes.todos = '2026-08-09T01:00:00Z';
    const { repo } = makeSyncRepo(local);

    await expect(
      new SyncToCloud(storage, port, repo, 'desktop-device', '정상 PC').execute(),
    ).rejects.toThrow('클라우드 todos 파일과 동기화 장부가 일치하지 않습니다');
    expect(fileContents.todos).toBe(unexpectedRemoteContent);
    expect(port.uploadSyncFile).not.toHaveBeenCalled();
  });

  it('같은 이름의 Drive 실제 파일이 둘 이상이면 첫 파일을 임의 선택하지 않고 중단한다', async () => {
    const data = { items: [{ id: 'todo-1', text: '중복 검사' }] };
    const content = JSON.stringify(data);
    const checksum = await computeSyncChecksum(content);
    const entry = {
      checksum,
      lastModified: '2026-08-09T00:00:00Z',
      size: content.length,
      uploadedBy: 'desktop-device',
    };
    const { storage } = makeStorage({ todos: data });
    const { port } = makeDrive(manifest({ todos: entry }, 'desktop-device'), {
      todos: content,
    });
    vi.mocked(port.listSyncFiles).mockResolvedValue([
      { id: 'todos-a', name: 'todos.json', modifiedTime: entry.lastModified },
      { id: 'todos-b', name: 'todos.json', modifiedTime: entry.lastModified },
    ]);
    const { repo, saveLocalManifest } = makeSyncRepo(
      manifest({ todos: entry }, 'desktop-device'),
    );

    await expect(
      new SyncToCloud(storage, port, repo, 'desktop-device', '내 PC').execute(),
    ).rejects.toThrow('클라우드 todos 파일이 중복되어');
    expect(port.uploadSyncFileIfUnchanged).not.toHaveBeenCalled();
    expect(saveLocalManifest).not.toHaveBeenCalled();
  });

  it('파일 업로드만 성공한 부분 상태는 같은 내용이면 재업로드 없이 장부 revision을 복구한다', async () => {
    const localData = { items: [{ id: 'todo-1', text: '정상 PC 할 일' }] };
    const content = JSON.stringify(localData);
    const checksum = await computeSyncChecksum(content);
    const oldEntry = {
      checksum,
      lastModified: '2026-08-09T00:00:00Z',
      size: new TextEncoder().encode(content).length,
      uploadedBy: 'desktop-device',
    };
    const remote = manifest({ todos: oldEntry }, 'desktop-device');
    const local = manifest({ todos: oldEntry }, 'desktop-device');
    const { storage } = makeStorage({ todos: localData });
    const { port, state: driveState, fileModifiedTimes } = makeDrive(remote, { todos: content });
    fileModifiedTimes.todos = '2026-08-09T01:00:00Z';
    const { repo, state: localState } = makeSyncRepo(local);

    const result = await new SyncToCloud(
      storage,
      port,
      repo,
      'desktop-device',
      '정상 PC',
    ).execute();

    expect(result.uploaded).not.toContain('todos');
    expect(port.uploadSyncFile).not.toHaveBeenCalled();
    expect(driveState.manifest?.files.todos?.lastModified).toBe('2026-08-09T01:00:00Z');
    expect(localState.manifest?.files.todos?.lastModified).toBe('2026-08-09T01:00:00Z');
  });

  it('업로드 0건(no-op)이면 리모트/로컬 매니페스트를 일절 쓰지 않는다', async () => {
    const remote = manifest(
      { todos: { checksum: 'pc-v1', lastModified: '2026-07-21T03:00:00Z', size: 100 } },
      'pc-device',
    );
    const { storage } = makeStorage(); // 로컬 데이터 전혀 없음 → 전부 스킵
    const { port, updateSyncManifest, state: driveState } = makeDrive(remote);
    const { repo, saveLocalManifest, state: localState } = makeSyncRepo(null);

    const result = await new SyncToCloud(storage, port, repo, 'mobile-abc', '내 폰').execute();

    expect(result.uploaded).toEqual([]);
    expect(updateSyncManifest).not.toHaveBeenCalled();
    expect(saveLocalManifest).not.toHaveBeenCalled();
    // 리모트 deviceId가 no-op 업로더로 바뀌지 않고, 로컬 장부도 오염되지 않는다
    expect(driveState.manifest?.deviceId).toBe('pc-device');
    expect(localState.manifest).toBeNull();
  });

  it('업로드 시 리모트 장부는 기존 리모트 항목을 보존하고, 로컬 장부는 리모트 항목을 승계하지 않는다', async () => {
    // 리모트: PC가 올린 todos 항목 존재. 내 로컬: memos만 데이터 보유(신규 업로드 대상).
    const remote = manifest(
      { todos: { checksum: 'pc-v1', lastModified: '2026-07-21T03:00:00Z', size: 100 } },
      'pc-device',
    );
    const { storage } = makeStorage({ memos: { items: ['폰 메모'] } });
    const { port, state: driveState } = makeDrive(remote);
    const { repo, state: localState } = makeSyncRepo(null);

    const result = await new SyncToCloud(storage, port, repo, 'mobile-abc', '내 폰').execute();

    expect(result.uploaded).toEqual(['memos']);
    // 리모트 장부: PC의 todos 유지 + 내 memos 추가(uploadedBy=나)
    expect(driveState.manifest?.files['todos']?.checksum).toBe('pc-v1');
    expect(driveState.manifest?.files['memos']?.uploadedBy).toBe('mobile-abc');
    // 로컬 장부: 내가 올린 memos만 — 받은 적 없는 todos는 절대 승계 금지(오염 방지 핵심)
    expect(localState.manifest?.files['memos']).toBeDefined();
    expect(localState.manifest?.files['todos']).toBeUndefined();
  });

  it('업로드 시 리모트 장부의 더 새 항목을 내 낡은 로컬 항목으로 되돌리지 않는다', async () => {
    // 내 로컬 장부: todos=v1(과거). 리모트 장부: PC가 그 후 올린 todos=v2.
    // 내 업로드 대상은 memos뿐 — todos 항목은 리모트 v2가 유지되어야 한다.
    const local = manifest(
      {
        todos: { checksum: 'v1', lastModified: '2026-07-21T01:00:00Z', size: 100 },
        memos: { checksum: 'memo-old', lastModified: '2026-07-21T01:00:00Z', size: 50 },
      },
      'mobile-abc',
    );
    const remote = manifest(
      {
        todos: { checksum: 'v2', lastModified: '2026-07-21T05:00:00Z', size: 120 },
        memos: { checksum: 'memo-old', lastModified: '2026-07-21T01:00:00Z', size: 50 },
      },
      'pc-device',
    );
    const { storage } = makeStorage({ memos: { items: ['수정된 폰 메모'] } });
    const { port, state: driveState } = makeDrive(remote);
    const { repo } = makeSyncRepo(local);

    const result = await new SyncToCloud(storage, port, repo, 'mobile-abc', '내 폰').execute();

    expect(result.uploaded).toEqual(['memos']);
    expect(driveState.manifest?.files['todos']?.checksum).toBe('v2'); // 되돌림 금지
  });
});

describe('SyncFromCloud 오염 치유 + 파일별 작성자 판정', () => {
  it('로컬 장부 항목이 없고 실제 데이터가 있으면 latest 정책이어도 선택 전 덮어쓰지 않는다', async () => {
    const localEvents = { events: [{ id: 'local-event', title: '기기 일정' }], categories: [] };
    const remoteEvents = {
      events: [{ id: 'remote-event', title: '클라우드 일정' }],
      categories: [],
    };
    const remote = manifest(
      {
        events: {
          checksum: 'remote-events',
          lastModified: '2026-08-07T04:13:20.871Z',
          size: 100,
          uploadedBy: 'previous-mobile',
        },
      },
      'previous-mobile',
    );
    const { storage, files } = makeStorage({ events: localEvents });
    const { port } = makeDrive(remote, { events: JSON.stringify(remoteEvents) });
    const { repo } = makeSyncRepo(manifest({}, 'current-mobile'));

    const result = await new SyncFromCloud(
      storage,
      port,
      repo,
      'current-mobile',
      '현재 폰',
      'latest',
    ).execute();

    expect(result.conflicts.map((c) => c.filename)).toContain('events');
    expect(result.downloaded).not.toContain('events');
    expect(files['events']).toEqual(localEvents);
  });

  it('동적 파일도 로컬 장부 항목 없이 실제 데이터가 있으면 선택 전 덮어쓰지 않는다', async () => {
    const filename = 'note-body--page-1';
    const localNote = { content: '기기 노트' };
    const remoteNote = { content: '클라우드 노트' };
    const remote = manifest(
      {
        [filename]: {
          checksum: 'remote-note',
          lastModified: '2026-08-07T04:13:20.871Z',
          size: 100,
          uploadedBy: 'previous-mobile',
        },
      },
      'previous-mobile',
    );
    const { storage, files } = makeStorage({ [filename]: localNote });
    const { port } = makeDrive(remote, { [filename]: JSON.stringify(remoteNote) });
    const { repo } = makeSyncRepo(manifest({}, 'current-mobile'));

    const result = await new SyncFromCloud(
      storage,
      port,
      repo,
      'current-mobile',
      '현재 폰',
      'latest',
      async () => [filename],
    ).execute();

    expect(result.conflicts.map((c) => c.filename)).toContain(filename);
    expect(result.downloaded).not.toContain(filename);
    expect(files[filename]).toEqual(localNote);
  });

  it('장부 체크섬은 같지만 실제 로컬 파일 내용이 다르면 변경 없음으로 숨기지 않고 충돌로 보고한다', async () => {
    const remoteEvents = {
      events: [{ id: 'event-1', title: '클라우드 일정', date: '2026-08-13' }],
      categories: [],
    };
    const remoteContent = JSON.stringify(remoteEvents);
    const bytes = new TextEncoder().encode(remoteContent);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const checksum = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const entry = {
      checksum,
      lastModified: '2026-08-07T04:13:20.871Z',
      size: bytes.length,
      uploadedBy: 'previous-mobile',
    };
    const poisonedLocal = manifest({ events: entry }, 'previous-mobile');
    const remote = manifest({ events: entry }, 'current-mobile');
    const emptyLocalEvents = { events: [], categories: [] };
    const { storage, files } = makeStorage({ events: emptyLocalEvents });
    const { port } = makeDrive(remote, { events: remoteContent });
    const { repo } = makeSyncRepo(poisonedLocal);

    const result = await new SyncFromCloud(
      storage,
      port,
      repo,
      'current-mobile',
      '제보 폰',
      'latest',
    ).execute();

    expect(result.conflicts.map((c) => c.filename)).toContain('events');
    expect(result.skipped).not.toContain('events');
    expect(files['events']).toEqual(emptyLocalEvents);
  });

  it('신고 시나리오 재현: 오염된 장부(구버전이 만든 상태)에서도 다운로드가 PC 데이터를 받아온다', async () => {
    // 구버전 no-op 업로드가 만들어 둔 오염 상태 그대로: 폰 로컬 장부에 todos=pc-v1
    // "받았음" 기록이 있지만 실제 폰 스토리지엔 todos 파일이 없다.
    const poisonedLocal = manifest(
      { todos: { checksum: 'pc-v1', lastModified: '2026-07-21T03:00:00Z', size: 100 } },
      'mobile-abc',
    );
    // 구버전 버그로 리모트 deviceId도 폰으로 찍혀 있는 최악 케이스
    const remote = manifest(
      { todos: { checksum: 'pc-v1', lastModified: '2026-07-21T03:00:00Z', size: 100 } },
      'mobile-abc',
    );
    const { storage, files } = makeStorage();
    const { port } = makeDrive(remote, {
      todos: JSON.stringify({ items: ['교과세특 입력하기'] }),
    });
    const { repo } = makeSyncRepo(poisonedLocal);

    const result = await new SyncFromCloud(
      storage,
      port,
      repo,
      'mobile-abc',
      '내 폰',
      'latest',
    ).execute();

    expect(result.downloaded).toContain('todos');
    expect(files['todos']).toEqual({ items: ['교과세특 입력하기'] });
  });

  it('데이터 보존: 체크섬 동일 + 실제 로컬 내용도 동일하면 절대 덮어쓰지 않는다', async () => {
    const localTodos = { items: ['로컬에 이미 있는 할 일'] };
    const content = JSON.stringify(localTodos);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
    const checksum = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const local = manifest(
      { todos: { checksum, lastModified: '2026-07-21T03:00:00Z', size: content.length } },
      'mobile-abc',
    );
    const remote = manifest(
      { todos: { checksum, lastModified: '2026-07-21T03:00:00Z', size: content.length } },
      'pc-device',
    );
    const { storage, files } = makeStorage({ todos: localTodos });
    const { port } = makeDrive(remote, { todos: content });
    const { repo } = makeSyncRepo(local);

    const result = await new SyncFromCloud(
      storage,
      port,
      repo,
      'mobile-abc',
      '내 폰',
      'latest',
    ).execute();

    expect(result.downloaded).toEqual([]);
    expect(result.skipped).toContain('todos');
    expect(files['todos']).toEqual({ items: ['로컬에 이미 있는 할 일'] }); // 불변
  });

  it('파일별 작성자 판정: 매니페스트 deviceId가 나여도 다른 기기가 올린(uploadedBy) 파일은 받는다', async () => {
    // 시나리오: PC가 todos v2를 올린 뒤 폰이 다른 파일을 올려 매니페스트 deviceId=폰.
    // 구버전은 "동일 deviceId=내가 올린 데이터"로 오판해 스킵했다.
    const local = manifest(
      { todos: { checksum: 'v1', lastModified: '2026-07-21T01:00:00Z', size: 100 } },
      'mobile-abc',
    );
    const remote = manifest(
      {
        todos: {
          checksum: 'v2',
          lastModified: '2026-07-21T05:00:00Z',
          size: 120,
          uploadedBy: 'pc-device',
        },
      },
      'mobile-abc', // 마지막 매니페스트 작성자는 폰
    );
    const { storage, files } = makeStorage({ todos: { items: ['옛 버전'] } });
    const { port } = makeDrive(remote, { todos: JSON.stringify({ items: ['PC 최신 버전'] }) });
    const { repo } = makeSyncRepo(local);

    const result = await new SyncFromCloud(
      storage,
      port,
      repo,
      'mobile-abc',
      '내 폰',
      'latest',
    ).execute();

    expect(result.downloaded).toContain('todos');
    expect(files['todos']).toEqual({ items: ['PC 최신 버전'] });
  });

  it('구버전 항목 폴백: uploadedBy 없고 매니페스트 deviceId가 나면 기존대로 스킵(안전 방향)', async () => {
    const local = manifest(
      { todos: { checksum: 'v1', lastModified: '2026-07-21T01:00:00Z', size: 100 } },
      'mobile-abc',
    );
    const remote = manifest(
      { todos: { checksum: 'v2', lastModified: '2026-07-21T05:00:00Z', size: 120 } },
      'mobile-abc',
    );
    const { storage, files } = makeStorage({ todos: { items: ['내 로컬 버전'] } });
    const { port } = makeDrive(remote, { todos: JSON.stringify({ items: ['리모트 버전'] }) });
    const { repo } = makeSyncRepo(local);

    const result = await new SyncFromCloud(
      storage,
      port,
      repo,
      'mobile-abc',
      '내 폰',
      'latest',
    ).execute();

    expect(result.downloaded).toEqual([]);
    expect(files['todos']).toEqual({ items: ['내 로컬 버전'] }); // 불변
  });
});

describe('모바일 충돌 선택: 클라우드 원본 복구', () => {
  it('이 기기 유지를 선택해도 다른 기기의 리모트 매니페스트 항목을 지우지 않는다', async () => {
    const remote = manifest(
      {
        events: { checksum: 'remote-events', lastModified: '2026-07-30T03:54:24.657Z', size: 743 },
        settings: {
          checksum: 'remote-settings',
          lastModified: '2026-08-07T04:13:20.871Z',
          size: 124,
        },
      },
      'previous-mobile',
    );
    const local = manifest(
      { events: { checksum: 'stale-events', lastModified: '2026-07-29T00:00:00Z', size: 28 } },
      'current-mobile',
    );
    const localEvents = { events: [], categories: [] };
    const { storage } = makeStorage({ events: localEvents });
    const { port, state: driveState } = makeDrive(remote, {
      events: JSON.stringify({ events: [{}] }),
    });
    const { repo } = makeSyncRepo(local);
    const conflict = {
      filename: 'events',
      localModified: 'content-mismatch',
      remoteModified: '2026-07-30T03:54:24.657Z',
      localDeviceName: '현재 폰',
      remoteDeviceName: '예전 폰',
    };

    await new ResolveSyncConflict(storage, port, repo).execute(conflict, 'local');

    expect(driveState.manifest?.files['settings']).toEqual(remote.files['settings']);
    expect(driveState.manifest?.files['events']?.uploadedBy).toBe('current-mobile');
  });

  it('충돌 화면 이후 클라우드 파일이 갱신됐으면 이 기기 유지 업로드를 중단한다', async () => {
    const remote = manifest(
      {
        events: {
          checksum: 'newer-events',
          lastModified: '2026-08-08T08:00:00.000Z',
          size: 100,
          uploadedBy: 'another-device',
        },
      },
      'another-device',
    );
    const local = manifest(
      {
        events: {
          checksum: 'stale-events',
          lastModified: '2026-07-29T00:00:00.000Z',
          size: 28,
        },
      },
      'current-mobile',
    );
    const { storage } = makeStorage({ events: { events: [], categories: [] } });
    const { port } = makeDrive(remote, { events: JSON.stringify({ events: [{}] }) });
    const { repo } = makeSyncRepo(local);

    await expect(
      new ResolveSyncConflict(storage, port, repo).execute(
        {
          filename: 'events',
          localModified: 'content-mismatch',
          remoteModified: '2026-07-30T03:54:24.657Z',
          localDeviceName: '현재 폰',
          remoteDeviceName: '예전 폰',
        },
        'local',
      ),
    ).rejects.toThrow('클라우드 데이터가 다시 변경되었습니다');
    expect(port.uploadSyncFile).not.toHaveBeenCalled();
  });

  it('업로드 직전 ETag 조건이 실패하면 같은 파일의 동시 갱신을 덮어쓰지 않는다', async () => {
    const remote = manifest(
      {
        events: {
          checksum: 'cloud-events',
          lastModified: '2026-07-21T05:00:00Z',
          size: 10,
          uploadedBy: 'pc-device',
        },
      },
      'pc-device',
    );
    const local = manifest(
      {
        events: {
          checksum: 'local-events',
          lastModified: '2026-07-21T01:00:00Z',
          size: 10,
          uploadedBy: 'current-mobile',
        },
      },
      'current-mobile',
    );
    const { storage } = makeStorage({ events: { events: [{ id: 'local-event' }] } });
    const { port, updateSyncManifest } = makeDrive(remote, { events: '{}' });
    vi.mocked(port.uploadSyncFileIfUnchanged).mockResolvedValueOnce(null);
    const { repo } = makeSyncRepo(local);

    await expect(
      new ResolveSyncConflict(storage, port, repo).execute(
        {
          filename: 'events',
          localModified: '2026-07-21T01:00:00Z',
          remoteModified: '2026-07-21T05:00:00Z',
          localDeviceName: '현재 폰',
          remoteDeviceName: 'PC',
        },
        'local',
      ),
    ).rejects.toThrow('클라우드 데이터가 다시 변경');
    expect(updateSyncManifest).not.toHaveBeenCalled();
  });

  it('로컬 동기화 장부가 없어도 표시된 충돌을 클라우드 원본으로 해결할 수 있다', async () => {
    const cloudEvents = { events: [{ id: 'cloud-event', title: '클라우드 일정' }] };
    const content = JSON.stringify(cloudEvents);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
    const checksum = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    const remote = manifest(
      {
        events: {
          checksum,
          lastModified: '2026-07-21T05:00:00Z',
          size: content.length,
          uploadedBy: 'pc-device',
        },
      },
      'pc-device',
    );
    const { storage, files } = makeStorage({ events: { events: [{ id: 'local-event' }] } });
    const { port } = makeDrive(remote, { events: content });
    const { repo, state } = makeSyncRepo(null);

    await new ResolveSyncConflict(storage, port, repo, 'current-mobile', '현재 폰').execute(
      {
        filename: 'events',
        localModified: 'unknown',
        remoteModified: '2026-07-21T05:00:00Z',
        localDeviceName: '현재 폰',
        remoteDeviceName: 'PC',
      },
      'remote',
    );

    expect(files['events']).toEqual(cloudEvents);
    expect(state.manifest?.deviceId).toBe('current-mobile');
    expect(state.manifest?.files['events']?.checksum).toBe(checksum);
  });

  it('클라우드 유지를 선택하면 Drive의 events를 로컬에 쓰고 로컬 장부도 갱신한다', async () => {
    const remoteEvents = { events: [{ id: 'event-1', title: '복구할 일정' }], categories: [] };
    const remoteContent = JSON.stringify(remoteEvents);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(remoteContent));
    const checksum = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const entry = {
      checksum,
      lastModified: '2026-07-30T03:54:24.657Z',
      size: new TextEncoder().encode(remoteContent).length,
      uploadedBy: 'previous-mobile',
    };
    const remote = manifest({ events: entry }, 'current-mobile');
    const local = manifest({ events: { ...entry, checksum: 'stale-ledger' } }, 'current-mobile');
    const { storage, files } = makeStorage({ events: { events: [], categories: [] } });
    const { port } = makeDrive(remote, { events: remoteContent });
    const { repo, state } = makeSyncRepo(local);
    const conflict = {
      filename: 'events',
      localModified: 'content-mismatch',
      remoteModified: entry.lastModified,
      localDeviceName: '현재 폰',
      remoteDeviceName: '예전 폰',
    };

    await new ResolveSyncConflict(storage, port, repo).execute(conflict, 'remote');

    expect(files['events']).toEqual(remoteEvents);
    expect(state.manifest?.files['events']).toEqual(entry);
  });

  it('클라우드 파일이 없거나 체크섬이 다르면 로컬을 건드리지 않고 실패한다', async () => {
    const localEvents = { events: [], categories: [] };
    const entry = {
      checksum: 'expected-checksum',
      lastModified: '2026-07-30T03:54:24.657Z',
      size: 10,
    };
    const remote = manifest({ events: entry }, 'previous-mobile');
    const local = manifest({ events: entry }, 'current-mobile');
    const conflict = {
      filename: 'events',
      localModified: 'content-mismatch',
      remoteModified: entry.lastModified,
      localDeviceName: '현재 폰',
      remoteDeviceName: '예전 폰',
    };

    const missingStorage = makeStorage({ events: localEvents });
    const missingDrive = makeDrive(remote, {});
    const missingRepo = makeSyncRepo(local);
    await expect(
      new ResolveSyncConflict(missingStorage.storage, missingDrive.port, missingRepo.repo).execute(
        conflict,
        'remote',
      ),
    ).rejects.toThrow('파일을 찾지 못했습니다');
    expect(missingStorage.files['events']).toEqual(localEvents);

    const badStorage = makeStorage({ events: localEvents });
    const badDrive = makeDrive(remote, { events: JSON.stringify({ events: ['손상'] }) });
    const badRepo = makeSyncRepo(local);
    await expect(
      new ResolveSyncConflict(badStorage.storage, badDrive.port, badRepo.repo).execute(
        conflict,
        'remote',
      ),
    ).rejects.toThrow('체크섬이 장부와 일치하지 않습니다');
    expect(badStorage.files['events']).toEqual(localEvents);
  });

  it('settings 클라우드 복구에서도 더 최신 로컬 학기 가드를 보존하고 교정본을 업로드한다', async () => {
    const remoteSettings = { currentTerm: '2026-2', theme: 'dark' };
    const content = JSON.stringify(remoteSettings);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
    const checksum = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const entry = {
      checksum,
      lastModified: '2026-07-30T03:54:24.657Z',
      size: new TextEncoder().encode(content).length,
    };
    const remote = manifest({ settings: entry }, 'previous-mobile');
    const local = manifest({ settings: { ...entry, checksum: 'stale' } }, 'current-mobile');
    const { storage, files } = makeStorage({ settings: { currentTerm: '2027-1', theme: 'light' } });
    const { port, state: driveState } = makeDrive(remote, { settings: content });
    const { repo, state: localState } = makeSyncRepo(local);

    await new ResolveSyncConflict(storage, port, repo).execute(
      {
        filename: 'settings',
        localModified: 'content-mismatch',
        remoteModified: entry.lastModified,
        localDeviceName: '현재 폰',
        remoteDeviceName: '예전 폰',
      },
      'remote',
    );

    expect(files['settings']).toEqual({ currentTerm: '2027-1', theme: 'dark' });
    expect(driveState.manifest?.files['settings']?.checksum).toBe(
      localState.manifest?.files['settings']?.checksum,
    );
    expect(driveState.manifest?.files['settings']?.checksum).not.toBe(entry.checksum);
  });

  it('settings 교정본의 클라우드 장부 CAS가 실패하면 로컬 데이터와 장부를 바꾸지 않는다', async () => {
    const remoteSettings = { currentTerm: '2026-2', theme: 'dark' };
    const content = JSON.stringify(remoteSettings);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
    const checksum = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const entry = {
      checksum,
      lastModified: '2026-07-30T03:54:24.657Z',
      size: new TextEncoder().encode(content).length,
    };
    const remote = manifest({ settings: entry }, 'previous-mobile');
    const local = manifest({ settings: { ...entry, checksum: 'stale-local' } }, 'current-mobile');
    const localSettings = { currentTerm: '2027-1', theme: 'light' };
    const { storage, files } = makeStorage({ settings: localSettings });
    const { port } = makeDrive(remote, { settings: content });
    vi.mocked(port.updateSyncManifestIfUnchanged).mockResolvedValue(false);
    const { repo, state: localState } = makeSyncRepo(local);

    await expect(
      new ResolveSyncConflict(storage, port, repo).execute(
        {
          filename: 'settings',
          localModified: 'content-mismatch',
          remoteModified: entry.lastModified,
          localDeviceName: '현재 폰',
          remoteDeviceName: '예전 폰',
        },
        'remote',
      ),
    ).rejects.toThrow('클라우드 데이터가 다시 변경되었습니다');

    expect(files['settings']).toEqual(localSettings);
    expect(localState.manifest).toEqual(local);
  });

  it('로컬 장부 저장이 실패하면 클라우드 원본으로 로컬 데이터를 먼저 덮어쓰지 않는다', async () => {
    const remoteEvents = { events: [{ id: 'cloud-event' }] };
    const content = JSON.stringify(remoteEvents);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
    const checksum = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const entry = {
      checksum,
      lastModified: '2026-07-30T03:54:24.657Z',
      size: new TextEncoder().encode(content).length,
    };
    const remote = manifest({ events: entry }, 'previous-mobile');
    const local = manifest({ events: { ...entry, checksum: 'stale-local' } }, 'current-mobile');
    const localEvents = { events: [{ id: 'local-event' }] };
    const { storage, files } = makeStorage({ events: localEvents });
    const { port } = makeDrive(remote, { events: content });
    const { repo, saveLocalManifest } = makeSyncRepo(local);
    saveLocalManifest.mockRejectedValueOnce(new Error('로컬 장부 저장 실패'));

    await expect(
      new ResolveSyncConflict(storage, port, repo).execute(
        {
          filename: 'events',
          localModified: 'content-mismatch',
          remoteModified: entry.lastModified,
          localDeviceName: '현재 폰',
          remoteDeviceName: '예전 폰',
        },
        'remote',
      ),
    ).rejects.toThrow('로컬 장부 저장 실패');

    expect(files['events']).toEqual(localEvents);
  });
});

describe('통합: 신고 흐름 전체 (no-op 업로드 → 다운로드)', () => {
  it('2026-08-07 제보 매니페스트처럼 현재 폰이 장부 작성자여도 예전 폰의 events를 깨끗한 폰이 받는다', async () => {
    const remote = manifest(
      {
        settings: {
          checksum: '565e98dafd802e425e070c5f170d37d012bdb5bdf0ec5207065701d45092e80e',
          lastModified: '2026-08-07T04:13:20.871Z',
          size: 124,
          uploadedBy: 'current-mobile',
        },
        events: {
          checksum: 'b278fc3de05e1c178f0b561e8d08fd2b200a8feb06786fc535d866026e91cb01',
          lastModified: '2026-07-30T03:54:24.657Z',
          size: 743,
          uploadedBy: 'previous-mobile',
        },
        todos: {
          checksum: 'aa2ef5accf5d53cf63e74f8197c3b80c6c36769017655a5757599b585209d2c5',
          lastModified: '2026-07-30T03:44:00.339Z',
          size: 28,
          uploadedBy: 'previous-mobile',
        },
      },
      'current-mobile',
    );
    const remoteEvents = {
      events: [
        { id: 'event-1', title: '일정 1' },
        { id: 'event-2', title: '일정 2' },
        { id: 'event-3', title: '일정 3' },
      ],
      categories: [],
    };
    const { storage, files } = makeStorage();
    const { port } = makeDrive(remote, {
      events: JSON.stringify(remoteEvents),
      settings: JSON.stringify({ teacherName: '제보 교사' }),
      todos: JSON.stringify({ todos: [] }),
    });
    const { repo } = makeSyncRepo(null);

    const result = await new SyncFromCloud(
      storage,
      port,
      repo,
      'current-mobile',
      '제보 폰',
      'latest',
    ).execute();

    expect(result.downloaded).toContain('events');
    expect(files['events']).toEqual(remoteEvents);
  });

  it('폰 no-op 업로드가 끼어도 이후 다운로드가 PC의 todos를 정상 수신한다', async () => {
    const remote = manifest(
      { todos: { checksum: 'pc-v1', lastModified: '2026-07-21T03:00:00Z', size: 100 } },
      'pc-device',
    );
    const { storage, files } = makeStorage();
    const { port } = makeDrive(remote, {
      todos: JSON.stringify({ items: ['교과세특 입력하기'] }),
    });
    const { repo } = makeSyncRepo(null);

    // 1단계: 자동 동기화의 no-op 업로드 ("변경 없음 (28)")
    const up = await new SyncToCloud(storage, port, repo, 'mobile-abc', '내 폰').execute();
    expect(up.uploaded).toEqual([]);

    // 2단계: 다운로드 — 수정 전엔 장부 오염으로 downloaded=[] 였다
    const down = await new SyncFromCloud(
      storage,
      port,
      repo,
      'mobile-abc',
      '내 폰',
      'latest',
    ).execute();

    expect(down.downloaded).toContain('todos');
    expect(files['todos']).toEqual({ items: ['교과세특 입력하기'] });
  });
});

describe('활성 충돌 갱신의 fail-closed 동작', () => {
  it('활성 충돌 중 원격 매니페스트를 읽지 못하면 성공(no-op)으로 처리하지 않는다', async () => {
    const { storage } = makeStorage();
    const { port } = makeDrive(null);
    const { repo } = makeSyncRepo(null);
    const sync = new SyncFromCloud(
      storage,
      port,
      repo,
      'mobile-device',
      '내 폰',
      'ask',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      true,
    );

    await expect(sync.execute()).rejects.toThrow('활성 충돌을 갱신하는 동안');
  });
});

describe('병합 파일 체크섬 고정점', () => {
  it.each([
    {
      filename: 'student-records',
      localData: {
        records: [
          {
            id: 'local-record',
            studentId: 'student-1',
            category: 'life',
            content: '기기 기록',
            createdAt: '2026-08-08T09:00:00Z',
          },
        ],
      },
      remoteData: {
        records: [
          {
            id: 'remote-record',
            studentId: 'student-2',
            category: 'life',
            content: '클라우드 기록',
            createdAt: '2026-08-08T10:00:00Z',
          },
        ],
      },
    },
    {
      filename: 'attendance',
      localData: {
        records: [
          {
            classId: 'class-1',
            date: '2026-08-08',
            period: 1,
            students: [{ number: 1, status: 'present' }],
          },
        ],
      },
      remoteData: {
        records: [
          {
            classId: 'class-1',
            date: '2026-08-08',
            period: 2,
            students: [{ number: 1, status: 'absent' }],
          },
        ],
      },
    },
    {
      filename: 'observations',
      localData: {
        records: [
          {
            id: 'local-observation',
            studentId: 'student-1',
            classId: 'class-1',
            authorId: 'teacher-1',
            date: '2026-08-08',
            content: '기기 관찰',
            tags: [],
            visibility: 'private',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
      remoteData: {
        records: [
          {
            id: 'remote-observation',
            studentId: 'student-2',
            classId: 'class-1',
            authorId: 'teacher-1',
            date: '2026-08-08',
            content: '클라우드 관찰',
            tags: [],
            visibility: 'private',
            createdAt: 2,
            updatedAt: 2,
          },
        ],
      },
    },
  ])('$filename 병합 결과를 양쪽 장부와 클라우드 파일에 같은 체크섬으로 수렴한다', async ({
    filename,
    localData,
    remoteData,
  }) => {
    const remoteContent = JSON.stringify(remoteData);
    const remoteChecksum = await computeSyncChecksum(remoteContent);
    const remoteEntry = {
      checksum: remoteChecksum,
      lastModified: '2026-08-08T10:00:00Z',
      size: new TextEncoder().encode(remoteContent).length,
      uploadedBy: 'desktop-device',
    };
    const localEntry = {
      ...remoteEntry,
      checksum: 'local-old-checksum',
      lastModified: '2026-08-08T09:00:00Z',
      uploadedBy: 'mobile-device',
    };
    const { storage, files } = makeStorage({ [filename]: localData });
    const { port, state: driveState, fileContents } = makeDrive(
      manifest({ [filename]: remoteEntry }, 'desktop-device'),
      { [filename]: remoteContent },
    );
    const { repo, state: localState } = makeSyncRepo(
      manifest({ [filename]: localEntry }, 'mobile-device'),
    );
    const sync = new SyncFromCloud(
      storage,
      port,
      repo,
      'mobile-device',
      '내 폰',
      'ask',
    );

    const first = await sync.execute();
    const actualChecksum = await computeSyncChecksum(JSON.stringify(files[filename]));

    expect(first.downloaded).toContain(filename);
    expect((files[filename] as { records: unknown[] }).records).toHaveLength(2);
    expect(localState.manifest?.files[filename]?.checksum).toBe(actualChecksum);
    expect(driveState.manifest?.files[filename]?.checksum).toBe(actualChecksum);
    expect(fileContents[filename]).toBeDefined();
    expect(await computeSyncChecksum(fileContents[filename]!)).toBe(actualChecksum);

    const second = await sync.execute();
    expect(second.conflicts).toEqual([]);
    expect(second.skipped).toContain(filename);
  });

  it.each([
    { mode: 'file' as const, message: '병합 중 다시 변경' },
    { mode: 'manifest' as const, message: '안전하게 갱신' },
  ])('$mode CAS 실패 시 로컬 병합 자료를 보존하고 실패한 장부를 기록하지 않는다', async ({
    mode,
    message,
  }) => {
    const filename = 'student-records';
    const localData = {
      records: [
        {
          id: 'local-record',
          studentId: 'student-1',
          category: 'life',
          content: '기기 기록',
          createdAt: '2026-08-08T09:00:00Z',
        },
      ],
    };
    const remoteData = {
      records: [
        {
          id: 'remote-record',
          studentId: 'student-2',
          category: 'life',
          content: '클라우드 기록',
          createdAt: '2026-08-08T10:00:00Z',
        },
      ],
    };
    const remoteContent = JSON.stringify(remoteData);
    const remoteChecksum = await computeSyncChecksum(remoteContent);
    const remoteEntry = {
      checksum: remoteChecksum,
      lastModified: '2026-08-08T10:00:00Z',
      size: new TextEncoder().encode(remoteContent).length,
      uploadedBy: 'desktop-device',
    };
    const localEntry = {
      ...remoteEntry,
      checksum: 'local-old-checksum',
      lastModified: '2026-08-08T09:00:00Z',
      uploadedBy: 'mobile-device',
    };
    const { storage, files } = makeStorage({ [filename]: localData });
    const {
      port,
      state: driveState,
      fileContents,
      updateSyncManifestIfUnchanged,
    } = makeDrive(
      manifest({ [filename]: remoteEntry }, 'desktop-device'),
      { [filename]: remoteContent },
    );
    const { repo, state: localState } = makeSyncRepo(
      manifest({ [filename]: localEntry }, 'mobile-device'),
    );
    if (mode === 'file') {
      port.uploadSyncFileIfUnchanged = vi.fn(async () => null);
    } else {
      port.updateSyncManifestIfUnchanged = vi.fn(async () => false);
    }
    const sync = new SyncFromCloud(
      storage,
      port,
      repo,
      'mobile-device',
      '내 폰',
      'ask',
    );

    await expect(sync.execute()).rejects.toThrow(message);

    expect((files[filename] as { records: unknown[] }).records).toHaveLength(2);
    expect(localState.manifest?.files[filename]?.checksum).toBe('local-old-checksum');
    expect(driveState.manifest?.files[filename]?.checksum).toBe(remoteChecksum);
    if (mode === 'file') {
      expect(fileContents[filename]).toBe(remoteContent);
    } else {
      expect((JSON.parse(fileContents[filename]!) as { records: unknown[] }).records).toHaveLength(2);
      port.updateSyncManifestIfUnchanged = updateSyncManifestIfUnchanged;
      const recovered = await sync.execute();
      const recoveredChecksum = await computeSyncChecksum(fileContents[filename]!);
      expect(recovered.conflicts).toEqual([]);
      expect(localState.manifest?.files[filename]?.checksum).toBe(recoveredChecksum);
      expect(driveState.manifest?.files[filename]?.checksum).toBe(recoveredChecksum);
      expect(port.uploadSyncFileIfUnchanged).toHaveBeenCalledTimes(1);
    }
  });
});
