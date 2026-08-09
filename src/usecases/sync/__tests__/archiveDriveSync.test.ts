/**
 * 아카이브 Drive 동기화(S4.1) — SyncToCloud/SyncFromCloud 아카이브 훅 동작.
 *
 * 핵심 계약(계획 §4 S4.1 AC):
 *  - **절대 덮어쓰기 금지**: 리모트에 이미 있는 키는 업로드하지 않고, 로컬에 이미 있는
 *    학기는 다운로드하지 않는다(존재=완결 — 아카이브 불변).
 *  - **부분 실패 격리**: 아카이브 한 파일의 실패가 라이브 동기화를 막지 않고,
 *    다음 동기화에서 파일 단위로 이어서 재시도된다.
 *  - **훅 미주입 = 기존 동작 그대로**(모바일·브라우저 모드 회귀 0).
 */
import { describe, it, expect, vi } from 'vitest';
import { SyncToCloud, sortArchiveSyncKeysManifestLast } from '../SyncToCloud';
import { SyncFromCloud } from '../SyncFromCloud';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type { DriveSyncManifest, DriveSyncFileInfo } from '@domain/entities/DriveSyncState';
import { uint8ToBase64 } from '../binaryBase64';

function manifest(files: DriveSyncManifest['files'], deviceId: string): DriveSyncManifest {
  return {
    version: 1,
    lastSyncedAt: '2026-08-01T00:00:00Z',
    deviceId,
    deviceName: deviceId,
    files,
  };
}

function fileInfo(checksum: string): DriveSyncFileInfo {
  return { checksum, lastModified: '2026-08-01T00:00:00Z', size: 10, uploadedBy: 'other-device' };
}

/** 모든 정적 파일이 '데이터 없음'인 스토리지 — 라이브 루프는 전부 스킵된다. */
function makeEmptyStorage(): IStoragePort {
  return {
    read: vi.fn(async () => null),
    write: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    readBinary: vi.fn(async () => null),
    writeBinary: vi.fn(async () => undefined),
    removeBinary: vi.fn(async () => undefined),
    listBinary: vi.fn(async () => []),
  } as unknown as IStoragePort;
}

interface FakeDrive {
  port: IDriveSyncPort;
  uploadSyncFile: ReturnType<typeof vi.fn>;
  createSyncFileIfMissing: ReturnType<typeof vi.fn>;
  downloadSyncFile: ReturnType<typeof vi.fn>;
  files: { id: string; name: string; content: string; modifiedTime?: string }[];
}

function makeDrivePort(
  remote: DriveSyncManifest | null,
  driveFiles: readonly { id: string; name: string; content: string; modifiedTime?: string }[] = [],
): FakeDrive {
  const files = driveFiles.map((file) => ({ ...file }));
  let sequence = 0;
  const uploadSyncFile = vi.fn(async (_folderId: string, name: string, content: string) => {
    const existing = files.find((file) => file.name === name);
    const result = {
      fileId: existing?.id ?? `file-${++sequence}`,
      modifiedTime: '2026-08-02T00:00:00Z',
    };
    if (existing) {
      existing.content = content;
      existing.modifiedTime = result.modifiedTime;
    } else {
      files.push({ id: result.fileId, name, content, modifiedTime: result.modifiedTime });
    }
    return result;
  });
  const createSyncFileIfMissing = vi.fn(
    async (_folderId: string, name: string, content: string) => {
      if (files.some((file) => file.name === name)) return null;
      const result = {
        fileId: `file-${++sequence}`,
        modifiedTime: '2026-08-02T00:00:00Z',
      };
      files.push({ id: result.fileId, name, content, modifiedTime: result.modifiedTime });
      return result;
    },
  );
  const downloadSyncFile = vi.fn(async (id: string) => {
    const found = files.find((f) => f.id === id);
    if (!found) throw new Error(`파일 없음: ${id}`);
    return found.content;
  });
  const port = {
    getOrCreateSyncFolder: vi.fn(async () => ({ id: 'folder-1', name: '쌤핀 동기화' })),
    uploadSyncFile,
    uploadSyncFileIfUnchanged: uploadSyncFile,
    createSyncFileIfMissing,
    downloadSyncFile,
    getSyncManifest: vi.fn(async () => remote),
    updateSyncManifest: vi.fn(async () => 'manifest-1'),
    updateSyncManifestIfUnchanged: vi.fn(async () => true),
    listSyncFiles: vi.fn(async () =>
      files.map((f) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime })),
    ),
    deleteSyncFolder: vi.fn(async () => undefined),
  } as unknown as IDriveSyncPort;
  return { port, uploadSyncFile, createSyncFileIfMissing, downloadSyncFile, files };
}

function makeSyncRepo(local: DriveSyncManifest | null): IDriveSyncRepository {
  return {
    getLocalManifest: vi.fn(async () => local),
    saveLocalManifest: vi.fn(async () => undefined),
  };
}

const ENC = new TextEncoder();

describe('sortArchiveSyncKeysManifestLast', () => {
  it('학기별로 묶고 manifest.json을 각 학기의 맨 뒤로 보낸다', () => {
    const sorted = sortArchiveSyncKeysManifestLast([
      'archives/2026-1/manifest.json',
      'archives/2025-2/students.json',
      'archives/2026-1/students.json',
      'archives/2025-2/manifest.json',
    ]);
    expect(sorted).toEqual([
      'archives/2025-2/students.json',
      'archives/2025-2/manifest.json',
      'archives/2026-1/students.json',
      'archives/2026-1/manifest.json',
    ]);
  });
});

describe('SyncToCloud — 아카이브 업로드', () => {
  const KEYS = ['archives/2026-1/manifest.json', 'archives/2026-1/students.json'];
  const readArchive = async (key: string): Promise<Uint8Array | null> =>
    ENC.encode(`content-of:${key}`);

  it('리모트에 없는 아카이브 파일을 create-only로 생성하고 매니페스트에 기록한다', async () => {
    const { port, uploadSyncFile, createSyncFileIfMissing } = makeDrivePort(
      manifest({}, 'other-device'),
    );
    const useCase = new SyncToCloud(
      makeEmptyStorage(),
      port,
      makeSyncRepo(null),
      'my-device',
      '내 PC',
      undefined,
      undefined,
      async () => [...KEYS],
      readArchive,
    );
    const result = await useCase.execute();

    expect(result.uploaded).toEqual(expect.arrayContaining(KEYS));
    expect(uploadSyncFile).not.toHaveBeenCalled();
    // Drive 파일명은 '/' → '__' 평탄화 + .json
    const names = createSyncFileIfMissing.mock.calls.map((c) => c[1] as string);
    expect(names).toContain('archives__2026-1__students.json.json');
    expect(names).toContain('archives__2026-1__manifest.json.json');
    // manifest.json이 그 학기의 마지막에 올라간다(완결 표식)
    expect(names.indexOf('archives__2026-1__manifest.json.json')).toBeGreaterThan(
      names.indexOf('archives__2026-1__students.json.json'),
    );
  });

  it('불변 계약 — 리모트 매니페스트에 이미 있는 키는 절대 다시 업로드하지 않는다', async () => {
    const remote = manifest(
      {
        'archives/2026-1/manifest.json': fileInfo('remote-1'),
        'archives/2026-1/students.json': fileInfo('remote-2'),
      },
      'other-device',
    );
    const { port, uploadSyncFile } = makeDrivePort(remote);
    const useCase = new SyncToCloud(
      makeEmptyStorage(),
      port,
      makeSyncRepo(null),
      'my-device',
      '내 PC',
      undefined,
      undefined,
      async () => [...KEYS],
      readArchive, // 로컬 내용이 리모트와 달라도 — 존재=완결이므로 업로드 금지
    );
    const result = await useCase.execute();

    expect(uploadSyncFile).not.toHaveBeenCalled();
    expect(result.uploaded).toEqual([]);
    expect(result.skipped).toEqual(expect.arrayContaining(KEYS));
  });

  it('아카이브 생성 후 manifest CAS 실패는 동일 실제 본문이면 다음 실행에서 재업로드 없이 수렴한다', async () => {
    const key = 'archives/2026-1/students.json';
    const remote = manifest({}, 'other-device');
    const { port, uploadSyncFile, createSyncFileIfMissing, files } = makeDrivePort(remote);
    vi.mocked(port.updateSyncManifestIfUnchanged)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const repo = makeSyncRepo(null);
    const makeUseCase = () =>
      new SyncToCloud(
        makeEmptyStorage(),
        port,
        repo,
        'my-device',
        '내 PC',
        undefined,
        undefined,
        async () => [key],
        readArchive,
      );

    await expect(makeUseCase().execute()).rejects.toThrow('클라우드 동기화 장부');
    expect(files).toHaveLength(1);

    const retry = await makeUseCase().execute();

    expect(uploadSyncFile).not.toHaveBeenCalled();
    expect(createSyncFileIfMissing).toHaveBeenCalledTimes(1);
    expect(retry.skipped).toContain(key);
    expect(repo.saveLocalManifest).toHaveBeenCalledTimes(1);
  });

  it('장부 없는 아카이브 실제 파일의 본문이 다르면 덮어쓰거나 성공으로 삼지 않는다', async () => {
    const key = 'archives/2026-1/students.json';
    const name = 'archives__2026-1__students.json.json';
    const foreignContent = JSON.stringify({
      __binaryBase64: uint8ToBase64(ENC.encode('다른 기기 아카이브')),
      __relPath: key,
    });
    const { port, uploadSyncFile, createSyncFileIfMissing, files } = makeDrivePort(
      manifest({}, 'other-device'),
      [{ id: 'foreign', name, content: foreignContent }],
    );

    await expect(
      new SyncToCloud(
        makeEmptyStorage(),
        port,
        makeSyncRepo(null),
        'my-device',
        '내 PC',
        undefined,
        undefined,
        async () => [key],
        readArchive,
      ).execute(),
    ).rejects.toThrow('클라우드 아카이브 파일과 동기화 장부가 일치하지 않습니다');

    expect(files[0]?.content).toBe(foreignContent);
    expect(uploadSyncFile).not.toHaveBeenCalled();
    expect(createSyncFileIfMissing).not.toHaveBeenCalled();
  });

  it('장부 없는 같은 이름 아카이브 실제 파일이 중복되면 임의 선택하지 않고 중단한다', async () => {
    const key = 'archives/2026-1/students.json';
    const name = 'archives__2026-1__students.json.json';
    const content = JSON.stringify({
      __binaryBase64: uint8ToBase64(await readArchive(key) as Uint8Array),
      __relPath: key,
    });
    const { port, uploadSyncFile, createSyncFileIfMissing } = makeDrivePort(
      manifest({}, 'other-device'),
      [
        { id: 'archive-a', name, content },
        { id: 'archive-b', name, content: `${content}foreign` },
      ],
    );

    await expect(
      new SyncToCloud(
        makeEmptyStorage(),
        port,
        makeSyncRepo(null),
        'my-device',
        '내 PC',
        undefined,
        undefined,
        async () => [key],
        readArchive,
      ).execute(),
    ).rejects.toThrow('클라우드 archives/2026-1/students.json 파일이 중복되어');

    expect(uploadSyncFile).not.toHaveBeenCalled();
    expect(createSyncFileIfMissing).not.toHaveBeenCalled();
  });

  it('아카이브 create-only 경쟁은 성공으로 숨기지 않고 중단한다', async () => {
    const key = 'archives/2026-1/students.json';
    const { port, createSyncFileIfMissing } = makeDrivePort(manifest({}, 'other-device'));
    createSyncFileIfMissing.mockResolvedValue(null);
    const repo = makeSyncRepo(null);

    await expect(
      new SyncToCloud(
        makeEmptyStorage(),
        port,
        repo,
        'my-device',
        '내 PC',
        undefined,
        undefined,
        async () => [key],
        readArchive,
      ).execute(),
    ).rejects.toThrow('동기화 중 생성되었습니다');

    expect(repo.saveLocalManifest).not.toHaveBeenCalled();
  });

  it('부분 실패 격리 — 아카이브 한 파일 실패가 라이브 업로드·다른 파일을 막지 않는다', async () => {
    const storage = makeEmptyStorage();
    (storage.read as ReturnType<typeof vi.fn>).mockImplementation(async (filename: string) =>
      filename === 'todos' ? { items: ['할일'] } : null,
    );
    const { port, createSyncFileIfMissing } = makeDrivePort(manifest({}, 'other-device'));
    createSyncFileIfMissing.mockImplementation(async (_folderId: string, name: string) => {
      if (name === 'archives__2026-1__students.json.json') throw new Error('네트워크 오류');
      return { fileId: 'file-x', modifiedTime: '2026-08-02T00:00:00Z' };
    });
    const useCase = new SyncToCloud(
      storage,
      port,
      makeSyncRepo(null),
      'my-device',
      '내 PC',
      undefined,
      undefined,
      async () => [...KEYS],
      readArchive,
    );
    const result = await useCase.execute();

    expect(result.uploaded).toContain('todos'); // 라이브 무영향
    expect(result.uploaded).toContain('archives/2026-1/manifest.json'); // 다른 아카이브 파일 무영향
    expect(result.uploaded).not.toContain('archives/2026-1/students.json');
    expect(result.skipped).toContain('archives/2026-1/students.json'); // 다음 동기화에서 재시도
  });

  it('훅 미주입이면 아카이브 관련 동작이 전혀 없다(기존 동작 그대로)', async () => {
    const { port, uploadSyncFile } = makeDrivePort(manifest({}, 'other-device'));
    const useCase = new SyncToCloud(
      makeEmptyStorage(),
      port,
      makeSyncRepo(null),
      'my-device',
      '내 PC',
    );
    const result = await useCase.execute();
    expect(uploadSyncFile).not.toHaveBeenCalled();
    expect(result.uploaded).toEqual([]);
  });
});

describe('SyncFromCloud — 아카이브 다운로드·배치', () => {
  const MANIFEST_KEY = 'archives/2026-1/manifest.json';
  const STUDENTS_KEY = 'archives/2026-1/students.json';
  const manifestBytes = ENC.encode('{"schemaVersion":1}');
  const studentsBytes = ENC.encode('{"students":[]}');

  function remoteWithArchive(): DriveSyncManifest {
    return manifest(
      { [MANIFEST_KEY]: fileInfo('a1'), [STUDENTS_KEY]: fileInfo('a2') },
      'other-device',
    );
  }

  function archiveDriveFiles(): { id: string; name: string; content: string }[] {
    return [
      {
        id: 'd1',
        name: 'archives__2026-1__manifest.json.json',
        content: JSON.stringify({
          __binaryBase64: uint8ToBase64(manifestBytes),
          __relPath: MANIFEST_KEY,
        }),
      },
      {
        id: 'd2',
        name: 'archives__2026-1__students.json.json',
        content: JSON.stringify({
          __binaryBase64: uint8ToBase64(studentsBytes),
          __relPath: STUDENTS_KEY,
        }),
      },
    ];
  }

  it('로컬에 없는 학기를 전부 내려받아 importArchiveTerm(relPath→base64)으로 배치한다', async () => {
    const { port } = makeDrivePort(remoteWithArchive(), archiveDriveFiles());
    const importArchiveTerm = vi.fn(async () => ({ ok: true }));
    const useCase = new SyncFromCloud(
      makeEmptyStorage(),
      port,
      makeSyncRepo(null),
      'my-device',
      '내 PC',
      'latest',
      undefined,
      undefined,
      async () => ({}),
      async () => [], // 로컬 아카이브 없음
      importArchiveTerm,
    );
    const result = await useCase.execute();

    expect(importArchiveTerm).toHaveBeenCalledTimes(1);
    const [term, files] = importArchiveTerm.mock.calls[0] as unknown as [
      string,
      Record<string, { format: string; content: string }>,
    ];
    expect(term).toBe('2026-1');
    expect(files['manifest.json']).toEqual({
      format: 'base64',
      content: uint8ToBase64(manifestBytes),
    });
    expect(files['students.json']).toEqual({
      format: 'base64',
      content: uint8ToBase64(studentsBytes),
    });
    expect(result.downloaded).toEqual(expect.arrayContaining([MANIFEST_KEY, STUDENTS_KEY]));
  });

  it('불변 계약 — 로컬에 이미 있는 학기는 다운로드·배치 자체를 하지 않는다', async () => {
    const { port, downloadSyncFile } = makeDrivePort(remoteWithArchive(), archiveDriveFiles());
    const importArchiveTerm = vi.fn(async () => ({ ok: true }));
    const useCase = new SyncFromCloud(
      makeEmptyStorage(),
      port,
      makeSyncRepo(null),
      'my-device',
      '내 PC',
      'latest',
      undefined,
      undefined,
      async () => ({}),
      async () => ['2026-1'], // 이미 있음 — 존재=완결
      importArchiveTerm,
    );
    const result = await useCase.execute();

    expect(downloadSyncFile).not.toHaveBeenCalled();
    expect(importArchiveTerm).not.toHaveBeenCalled();
    expect(result.downloaded).toEqual([]);
  });

  it('manifest.json이 아직 리모트에 없는 학기는 배치하지 않는다(업로드 완결 대기)', async () => {
    const remote = manifest({ [STUDENTS_KEY]: fileInfo('a2') }, 'other-device');
    const { port } = makeDrivePort(remote, archiveDriveFiles());
    const importArchiveTerm = vi.fn(async () => ({ ok: true }));
    const useCase = new SyncFromCloud(
      makeEmptyStorage(),
      port,
      makeSyncRepo(null),
      'my-device',
      '내 PC',
      'latest',
      undefined,
      undefined,
      async () => ({}),
      async () => [],
      importArchiveTerm,
    );
    const result = await useCase.execute();

    expect(importArchiveTerm).not.toHaveBeenCalled();
    expect(result.downloaded).toEqual([]);
  });

  it('배치 실패가 라이브 다운로드 결과를 오염시키지 않는다(다음 동기화에서 재시도)', async () => {
    const { port } = makeDrivePort(remoteWithArchive(), archiveDriveFiles());
    const importArchiveTerm = vi.fn(async () => ({ ok: false, error: '디스크 가득' }));
    const useCase = new SyncFromCloud(
      makeEmptyStorage(),
      port,
      makeSyncRepo(null),
      'my-device',
      '내 PC',
      'latest',
      undefined,
      undefined,
      async () => ({}),
      async () => [],
      importArchiveTerm,
    );
    const result = await useCase.execute();

    expect(result.downloaded).toEqual([]); // 실패분은 기록되지 않아 다음 동기화에서 재시도
    expect(result.skipped).toEqual(expect.arrayContaining([MANIFEST_KEY, STUDENTS_KEY]));
  });

  it('훅 미주입이면 아카이브 키가 있어도 손대지 않는다(기존 동작 그대로)', async () => {
    const { port, downloadSyncFile } = makeDrivePort(remoteWithArchive(), archiveDriveFiles());
    const useCase = new SyncFromCloud(
      makeEmptyStorage(),
      port,
      makeSyncRepo(null),
      'my-device',
      '내 PC',
      'latest',
    );
    const result = await useCase.execute();
    expect(downloadSyncFile).not.toHaveBeenCalled();
    expect(result.downloaded).toEqual([]);
  });
});
