/**
 * 관찰 기록 '한 바퀴' 끝 지점(ADR-135) — 동기화 병합 경로 시험.
 *
 * 끝 지점 파일은 설정처럼 통째 교체되면 안 된다. 두 컴퓨터가 각자 끝낸 바퀴가 있으면
 * (카드, 학기)마다 더 뒤 끝 지점·더 큰 바퀴 수로 합쳐져야 한다. 순수 병합 함수만 시험하면
 * 내려받기 경로에 연결되지 않아도 초록이 되므로, 실제 SyncFromCloud 를 돌려 확인한다.
 * (도우미는 syncManifestLifecycle.test.ts 와 같은 인메모리 구현을 옮겨 왔다.)
 */
import { describe, it, expect, vi } from 'vitest';
import { computeSyncChecksum } from '../SyncToCloud';
import { SyncFromCloud, mergeLapMarkData } from '../SyncFromCloud';
import { SYNC_FILES, SYNC_FILE_KEYS } from '../syncRegistry';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type { DriveSyncManifest } from '@domain/entities/DriveSyncState';
import type { LapMark, LapMarkData } from '@domain/entities/ObservationLap';

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
    remove: vi.fn(async (filename: string) => {
      delete files[filename];
    }),
    replaceIfUnchanged: vi.fn(async (filename: string, expected: unknown, next: unknown) => {
      const current = filename in files ? files[filename] : null;
      if (JSON.stringify(current) !== JSON.stringify(expected)) return false;
      files[filename] = next;
      return true;
    }),
    readBinary: vi.fn(async () => null),
    writeBinary: vi.fn(async () => undefined),
    removeBinary: vi.fn(async () => undefined),
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
    uploadSyncFile: vi.fn(async (_folderId: string, filename: string, content: string) => {
      const key = filename.replace(/\.json$/, '');
      uploadSequence += 1;
      const modifiedTime = `2026-07-21T07:34:${String(uploadSequence).padStart(2, '0')}Z`;
      fileContents[key] = content;
      fileModifiedTimes[key] = modifiedTime;
      return { fileId: key, modifiedTime };
    }),
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
    createSyncFileIfMissing: vi.fn(async (_folderId: string, filename: string, content: string) => {
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
    }),
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
    deleteSyncFile: vi.fn(async (_folderId: string, filename: string) => {
      const key = filename.replace(/\.json$/, '');
      delete fileContents[key];
      delete fileModifiedTimes[key];
    }),
    deleteSyncFileIfUnchanged: vi.fn(
      async (_folderId: string, filename: string, expectedModifiedTime: string) => {
        const key = filename.replace(/\.json$/, '');
        if (!(key in fileContents)) return true;
        if (fileModifiedTimes[key] !== expectedModifiedTime) return false;
        delete fileContents[key];
        delete fileModifiedTimes[key];
        return true;
      },
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

const FILE = 'observation-laps';

function mark(card: string, date: string, completed: number): LapMark {
  return {
    card,
    term: '2026-2',
    completed,
    boundary: { date, createdAt: 1, recordId: `${card}-${date}` },
  };
}

describe('끝 지점 파일 등록', () => {
  it('동기화 파일 목록과 락 키에 들어 있다', () => {
    expect(SYNC_FILES).toContain(FILE);
    expect(SYNC_FILE_KEYS.observationLaps).toBe(FILE);
  });
});

describe('끝 지점 병합', () => {
  it('(카드, 학기)마다 더 뒤 끝 지점·더 큰 바퀴 수', () => {
    const merged = mergeLapMarkData(
      { records: [mark('homeroom', '2026-09-10', 3), mark('subject:a', '2026-09-01', 1)] },
      { records: [mark('homeroom', '2026-09-20', 2), mark('subject:b', '2026-09-05', 1)] },
    );
    const byCard = Object.fromEntries(merged.records.map((m) => [m.card, m]));
    expect(byCard['homeroom']?.boundary.date).toBe('2026-09-20');
    expect(byCard['homeroom']?.completed).toBe(3);
    expect(Object.keys(byCard).sort()).toEqual(['homeroom', 'subject:a', 'subject:b']);
  });

  it('로컬 파일이 없으면 리모트 그대로', () => {
    expect(
      mergeLapMarkData(null, { records: [mark('homeroom', '2026-09-10', 1)] }).records,
    ).toHaveLength(1);
  });
});

async function remoteFixture(remoteData: LapMarkData, uploadedBy: string) {
  const content = JSON.stringify(remoteData);
  const checksum = await computeSyncChecksum(content);
  return {
    content,
    entry: { checksum, lastModified: '2026-09-23T01:00:00Z', size: content.length, uploadedBy },
  };
}

describe('SyncFromCloud — 끝 지점 파일은 통째 교체가 아니라 병합한다', () => {
  it('양쪽 모두 바뀌었을 때(장부 있음) 합쳐 쓴다 — 충돌로 묻지 않는다', async () => {
    const localData: LapMarkData = { records: [mark('homeroom', '2026-09-10', 3)] };
    const remoteData: LapMarkData = {
      records: [mark('homeroom', '2026-09-20', 2), mark('subject:a', '2026-09-05', 1)],
    };
    const { content, entry } = await remoteFixture(remoteData, 'other-pc');
    const { storage, files } = makeStorage({ [FILE]: localData });
    const { port } = makeDrive(manifest({ [FILE]: entry }, 'other-pc'), { [FILE]: content });
    const { repo } = makeSyncRepo(
      manifest(
        {
          [FILE]: {
            checksum: 'old',
            lastModified: '2026-09-22T01:00:00Z',
            size: 1,
            uploadedBy: 'this-pc',
          },
        },
        'this-pc',
      ),
    );

    const result = await new SyncFromCloud(
      storage,
      port,
      repo,
      'this-pc',
      '이 컴퓨터',
      'ask',
    ).execute();

    expect(result.conflicts.map((c) => c.filename)).not.toContain(FILE);
    const merged = files[FILE] as LapMarkData;
    const home = merged.records.find((m) => m.card === 'homeroom');
    expect(home?.boundary.date).toBe('2026-09-20');
    expect(home?.completed).toBe(3);
    expect(merged.records.some((m) => m.card === 'subject:a')).toBe(true);
  });

  it('장부에 없는데 로컬 파일이 있을 때(처음 받기)도 합친다 — 충돌로 묻지 않는다', async () => {
    const localData: LapMarkData = { records: [mark('homeroom', '2026-09-10', 3)] };
    const remoteData: LapMarkData = { records: [mark('subject:a', '2026-09-05', 1)] };
    const { content, entry } = await remoteFixture(remoteData, 'other-pc');
    const { storage, files } = makeStorage({ [FILE]: localData });
    const { port } = makeDrive(manifest({ [FILE]: entry }, 'other-pc'), { [FILE]: content });
    const { repo } = makeSyncRepo(manifest({}, 'this-pc'));

    const result = await new SyncFromCloud(
      storage,
      port,
      repo,
      'this-pc',
      '이 컴퓨터',
      'latest',
    ).execute();

    expect(result.conflicts.map((c) => c.filename)).not.toContain(FILE);
    const merged = files[FILE] as LapMarkData;
    expect(merged.records.map((m) => m.card).sort()).toEqual(['homeroom', 'subject:a']);
  });
});
