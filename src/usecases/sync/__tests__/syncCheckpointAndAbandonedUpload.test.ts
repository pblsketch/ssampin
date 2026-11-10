/**
 * 업로드가 끊겨도 동기화가 영구 교착으로 굳지 않게 (2026-11-10 오너 PC 실측).
 *
 * 사고: [클라우드 백업 다시 만들기]가 새 폴더에 101개를 올린 뒤 장부를 확정하기 전에 끊겼다
 * (원격 장부 files {} 그대로). 그 뒤 구글 캘린더 동기화가 로컬 일정을 바꾸자 모든 동기화가
 * "클라우드 events 파일과 동기화 장부가 일치하지 않습니다"로 영원히 멈췄다.
 *
 * 고친 것:
 *  ① 장부 중간 확정 — 정적 파일 뒤, 바이너리 5개마다, 아카이브 전.
 *  ② 장부 밖 파일 — 방금이면 건너뛰고, 30분 넘게 방치됐으면 덮지 않고 원격 장부에 편입해
 *     받기 판정(충돌로 묻기)에 넘긴다. 같은 세대의 후속본만 조건부로 덮는다.
 *  ③ 실행 임대 — 절전 등으로 오래 멈췄던 실행은 장부를 확정하지 않는다.
 */
import { describe, it, expect, vi } from 'vitest';
import { SyncToCloud, computeSyncChecksum } from '../SyncToCloud';
import { SyncFromCloud } from '../SyncFromCloud';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type { DriveSyncFileInfo, DriveSyncManifest } from '@domain/entities/DriveSyncState';
import {
  SYNC_RUN_LEASE_EXPIRED_MESSAGE,
  UNKNOWN_UPLOADER,
  buildManifestMismatchMessage,
} from '@domain/rules/driveSyncRecovery';

const DEVICE = 'this-pc';
const T0 = Date.parse('2026-11-10T03:00:00.000Z');
const TWO_HOURS_AGO = '2026-11-10T01:00:00.000Z';
const FIVE_MIN_AGO = '2026-11-10T02:55:00.000Z';

function emptyManifest(deviceId = DEVICE): DriveSyncManifest {
  return { version: 2, lastSyncedAt: '', deviceId, deviceName: deviceId, files: {} };
}

function makeStorage(json: Record<string, unknown>, binaries: Record<string, Uint8Array> = {}) {
  const files: Record<string, unknown> = { ...json };
  const storage = {
    read: vi.fn(async (name: string) => (name in files ? files[name] : null)),
    write: vi.fn(async (name: string, data: unknown) => {
      files[name] = data;
    }),
    remove: vi.fn(async (name: string) => {
      delete files[name];
    }),
    replaceIfUnchanged: vi.fn(async (name: string, expected: unknown, next: unknown) => {
      const current = name in files ? files[name] : null;
      if (JSON.stringify(current) !== JSON.stringify(expected)) return false;
      files[name] = next;
      return true;
    }),
    readBinary: vi.fn(async (relPath: string) => binaries[relPath] ?? null),
    writeBinary: vi.fn(async () => undefined),
    removeBinary: vi.fn(async () => undefined),
  } as unknown as IStoragePort;
  return { storage, files };
}

/**
 * 인메모리 Drive. 파일은 **실제 드라이브 파일명 그대로**(접두사 제외) 보관한다 —
 * 사진 세대명(`….json.rev-<checksum>`)처럼 `.json` 으로 끝나지 않는 이름도 다룬다.
 */
function makeDrive(
  initialManifest: DriveSyncManifest,
  initialFiles: Record<string, { content: string; modifiedTime: string }> = {},
) {
  const contents: Record<string, string> = {};
  const modified: Record<string, string> = {};
  for (const [name, f] of Object.entries(initialFiles)) {
    contents[name] = f.content;
    modified[name] = f.modifiedTime;
  }
  const state = { manifest: JSON.parse(JSON.stringify(initialManifest)) as DriveSyncManifest };
  let seq = 0;
  const stamp = (): string => {
    seq += 1;
    return new Date(T0 + seq * 1000).toISOString();
  };
  const port = {
    getOrCreateSyncFolder: vi.fn(async () => ({ id: 'folder', name: '쌤핀 동기화' })),
    getSyncManifest: vi.fn(async () => JSON.parse(JSON.stringify(state.manifest))),
    listSyncFiles: vi.fn(async () =>
      Object.keys(contents).map((name) => ({ id: name, name, modifiedTime: modified[name] })),
    ),
    downloadSyncFile: vi.fn(async (id: string) => contents[id] ?? '{}'),
    uploadSyncFile: vi.fn(async () => {
      throw new Error('무조건 업로드는 쓰면 안 된다');
    }),
    createSyncFileIfMissing: vi.fn(async (_f: string, name: string, content: string) => {
      if (name in contents) return null;
      contents[name] = content;
      modified[name] = stamp();
      return { fileId: name, modifiedTime: modified[name]! };
    }),
    uploadSyncFileIfUnchanged: vi.fn(
      async (_f: string, name: string, content: string, expected: string) => {
        if (modified[name] !== expected) return null;
        contents[name] = content;
        modified[name] = stamp();
        return { fileId: name, modifiedTime: modified[name]! };
      },
    ),
    updateSyncManifest: vi.fn(async () => {
      throw new Error('무조건 장부 쓰기는 쓰면 안 된다');
    }),
    updateSyncManifestIfUnchanged: vi.fn(
      async (_f: string, expected: DriveSyncManifest, next: DriveSyncManifest) => {
        if (JSON.stringify(state.manifest) !== JSON.stringify(expected)) return false;
        state.manifest = JSON.parse(JSON.stringify(next)) as DriveSyncManifest;
        return true;
      },
    ),
    deleteSyncFile: vi.fn(async () => undefined),
    deleteSyncFileIfUnchanged: vi.fn(async () => true),
    deleteSyncFolder: vi.fn(async () => undefined),
  } as unknown as IDriveSyncPort;
  return { port, contents, modified, state };
}

function makeRepo(initial: DriveSyncManifest | null) {
  const state = {
    local: initial ? (JSON.parse(JSON.stringify(initial)) as DriveSyncManifest) : null,
  };
  const saveLocalManifest = vi.fn(async (m: DriveSyncManifest) => {
    state.local = JSON.parse(JSON.stringify(m)) as DriveSyncManifest;
  });
  const repo = {
    getLocalManifest: vi.fn(async () => state.local),
    saveLocalManifest,
  } as unknown as IDriveSyncRepository;
  return { repo, state, saveLocalManifest };
}

function toCloud(
  storage: IStoragePort,
  port: IDriveSyncPort,
  repo: IDriveSyncRepository,
  opts: { binaries?: string[]; now?: () => number } = {},
): SyncToCloud {
  return new SyncToCloud(
    storage,
    port,
    repo,
    DEVICE,
    '이 PC',
    undefined,
    opts.binaries ? async () => opts.binaries ?? [] : undefined,
    undefined,
    undefined,
    opts.now ?? (() => T0),
  );
}

async function entryFor(content: string, lastModified: string, uploadedBy = DEVICE) {
  const info: DriveSyncFileInfo = {
    lastModified,
    checksum: await computeSyncChecksum(content),
    size: new TextEncoder().encode(content).length,
    uploadedBy,
  };
  return info;
}

const binWrapper = (relPath: string, base64: string): string =>
  JSON.stringify({ __binaryBase64: base64, __relPath: relPath });

describe('장부 중간 확정', () => {
  it('사진 업로드 도중 끊겨도 정적 파일과 5개 단위로 올린 첨부는 장부에 남는다', async () => {
    const binaries: Record<string, Uint8Array> = {};
    const keys: string[] = [];
    for (let i = 1; i <= 7; i++) {
      const key = `obs-attachments/a${i}.png`;
      keys.push(key);
      binaries[key] = new Uint8Array([i, i, i]);
    }
    const { storage } = makeStorage({ settings: { theme: 'x' }, todos: { items: [] } }, binaries);
    const { port, state } = makeDrive(emptyManifest());
    const { repo, state: local } = makeRepo(emptyManifest());

    const run = toCloud(storage, port, repo, { binaries: keys }).execute((p) => {
      // 7번째 첨부를 시작하려는 순간 끊긴다(창 닫기·절전 흉내 — 항목별 try 바깥).
      if (p.filename === 'obs-attachments/a7.png') throw new Error('실행 중단');
    });
    await expect(run).rejects.toThrow('실행 중단');

    const committed = Object.keys(state.manifest.files).sort();
    expect(committed).toEqual(
      [
        'obs-attachments/a1.png',
        'obs-attachments/a2.png',
        'obs-attachments/a3.png',
        'obs-attachments/a4.png',
        'obs-attachments/a5.png',
        'settings',
        'todos',
      ].sort(),
    );
    // 6번째는 올라갔지만 확정 전에 끊겼다 — 다음 실행이 정리한다(내용이 같으면 장부만 편입).
    expect(state.manifest.files['obs-attachments/a6.png']).toBeUndefined();
    expect(Object.keys(local.local?.files ?? {}).sort()).toEqual(committed);
  });

  it('바뀐 것이 없으면 장부를 쓰지 않는다(no-op 계약)', async () => {
    const content = JSON.stringify({ items: [] });
    const entry = await entryFor(content, TWO_HOURS_AGO);
    const manifest = { ...emptyManifest(), files: { todos: entry } };
    const { storage } = makeStorage({ todos: { items: [] } });
    const { port } = makeDrive(manifest, {
      'todos.json': { content, modifiedTime: TWO_HOURS_AGO },
    });
    const { repo, saveLocalManifest } = makeRepo(manifest);

    const result = await toCloud(storage, port, repo).execute();

    expect(result.uploaded).toEqual([]);
    expect(port.updateSyncManifestIfUnchanged).not.toHaveBeenCalled();
    expect(saveLocalManifest).not.toHaveBeenCalled();
  });

  it('정적 파일만 바뀐 실행은 장부를 한 번만 쓴다', async () => {
    const { storage } = makeStorage({ todos: { items: [{ id: 1 }] } });
    const { port } = makeDrive(emptyManifest());
    const { repo } = makeRepo(emptyManifest());

    const result = await toCloud(storage, port, repo, { binaries: [] }).execute();

    expect(result.uploaded).toEqual(['todos']);
    expect(port.updateSyncManifestIfUnchanged).toHaveBeenCalledTimes(1);
  });

  it('중간 확정이 거부되면 멈추고 그 뒤 파일은 올리지 않는다', async () => {
    const key = 'obs-attachments/a1.png';
    const { storage } = makeStorage({ todos: { items: [] } }, { [key]: new Uint8Array([1]) });
    const { port } = makeDrive(emptyManifest());
    vi.mocked(port.updateSyncManifestIfUnchanged).mockResolvedValueOnce(false);
    const { repo, saveLocalManifest } = makeRepo(emptyManifest());

    await expect(toCloud(storage, port, repo, { binaries: [key] }).execute()).rejects.toThrow(
      '클라우드 동기화 장부가 다른 기기에서 변경되었습니다',
    );
    const createdNames = vi.mocked(port.createSyncFileIfMissing).mock.calls.map((c) => c[1]);
    expect(createdNames).toContain('todos.json');
    expect(createdNames.some((n) => n.startsWith('obs-attachments'))).toBe(false);
    expect(saveLocalManifest).not.toHaveBeenCalled();
  });

  it('절전 등으로 오래 멈췄다 이어진 실행은 장부를 확정하지 않는다', async () => {
    const clock = { now: T0 };
    const { storage } = makeStorage({ events: { events: [] }, todos: { items: [] } });
    const { port, state } = makeDrive(emptyManifest());
    const { repo, saveLocalManifest } = makeRepo(emptyManifest());

    const run = toCloud(storage, port, repo, { now: () => clock.now }).execute((p) => {
      if (p.filename === 'todos') clock.now = T0 + 20 * 60 * 1000; // 20분 멈춤
    });

    await expect(run).rejects.toThrow(SYNC_RUN_LEASE_EXPIRED_MESSAGE);
    expect(state.manifest.files).toEqual({});
    expect(saveLocalManifest).not.toHaveBeenCalled();
  });
});

describe('장부 밖 파일 — 오너 PC 사고 재현', () => {
  const localEvents = { events: [{ id: 'e1', title: '11/9 이후 바뀐 일정' }] };
  const orphanEventsContent = JSON.stringify({ events: [{ id: 'e1', title: '11/8 일정' }] });
  const settingsData = { theme: 'blue' };

  it('30분 넘게 방치된 장부 밖 events 는 멈추지 않고 덮지도 않고 원격 장부에 편입해 받기 판정에 넘긴다', async () => {
    const { storage } = makeStorage({ events: localEvents, settings: settingsData });
    const { port, contents, state } = makeDrive(emptyManifest(), {
      'events.json': { content: orphanEventsContent, modifiedTime: TWO_HOURS_AGO },
      'settings.json': { content: JSON.stringify(settingsData), modifiedTime: TWO_HOURS_AGO },
    });
    const { repo, state: local } = makeRepo(emptyManifest());

    const result = await toCloud(storage, port, repo).execute();

    expect(result.deferred).toContain('events');
    expect(contents['events.json']).toBe(orphanEventsContent); // 덮지 않았다
    expect(state.manifest.files.events).toMatchObject({
      checksum: await computeSyncChecksum(orphanEventsContent),
      lastModified: TWO_HOURS_AGO,
      uploadedBy: UNKNOWN_UPLOADER,
    });
    expect(local.local?.files.events).toBeUndefined(); // 아직 받지 않았다
    // 내용이 같은 장부 밖 파일은 기존처럼 장부만 편입한다.
    expect(state.manifest.files.settings).toBeDefined();
    expect(local.local?.files.settings).toBeDefined();
    expect(port.uploadSyncFileIfUnchanged).not.toHaveBeenCalled();
  });

  it('편입 뒤 받기는 로컬 일정을 조용히 덮지 않고 선생님에게 묻는다', async () => {
    const { storage, files } = makeStorage({ events: localEvents, settings: settingsData });
    const { port } = makeDrive(emptyManifest(), {
      'events.json': { content: orphanEventsContent, modifiedTime: TWO_HOURS_AGO },
    });
    const { repo } = makeRepo(emptyManifest());

    await toCloud(storage, port, repo).execute();
    const pulled = await new SyncFromCloud(
      storage,
      port,
      repo,
      DEVICE,
      '이 PC',
      'latest',
    ).execute();

    expect(pulled.conflicts.map((c) => c.filename)).toContain('events');
    expect(files.events).toEqual(localEvents);
  });

  it('방금(30분 이내) 올라온 장부 밖 events 는 이번 회차만 건너뛰고 다른 파일은 확정한다', async () => {
    const { storage } = makeStorage({ events: localEvents, todos: { items: [{ id: 1 }] } });
    const { port, contents, state } = makeDrive(emptyManifest(), {
      'events.json': { content: orphanEventsContent, modifiedTime: FIVE_MIN_AGO },
    });
    const { repo } = makeRepo(emptyManifest());

    const result = await toCloud(storage, port, repo).execute();

    expect(result.skipped).toContain('events');
    expect(result.deferred).not.toContain('events');
    expect(contents['events.json']).toBe(orphanEventsContent);
    expect(state.manifest.files.events).toBeUndefined();
    expect(state.manifest.files.todos).toBeDefined();
  });

  it('수정 시각을 알 수 없으면 기존처럼 멈춘다', async () => {
    const { storage } = makeStorage({ events: localEvents });
    const { port, contents } = makeDrive(emptyManifest(), {
      'events.json': { content: orphanEventsContent, modifiedTime: '' },
    });
    const { repo } = makeRepo(emptyManifest());

    await expect(toCloud(storage, port, repo).execute()).rejects.toThrow(
      buildManifestMismatchMessage('events'),
    );
    expect(contents['events.json']).toBe(orphanEventsContent);
  });
});

describe('장부에 키는 있는데 실제 파일이 다른 후속본', () => {
  const committedContent = JSON.stringify({ items: [{ id: 'todo', text: '확정본' }] });
  const orphanContent = JSON.stringify({ items: [{ id: 'todo', text: '확정 못 한 후속본' }] });

  it('이 기기가 확정본 위에 있으면 버려진 후속본을 조건부로 덮는다(로컬 그대로면 확정본으로 되돌림)', async () => {
    const entry = await entryFor(committedContent, '2026-11-09T00:00:00.000Z');
    const manifest = { ...emptyManifest(), files: { todos: entry } };
    const { storage } = makeStorage({ todos: JSON.parse(committedContent) });
    const { port, contents, state } = makeDrive(manifest, {
      'todos.json': { content: orphanContent, modifiedTime: TWO_HOURS_AGO },
    });
    const { repo } = makeRepo(manifest);

    const result = await toCloud(storage, port, repo).execute();

    expect(result.uploaded).toContain('todos');
    expect(contents['todos.json']).toBe(committedContent);
    expect(vi.mocked(port.uploadSyncFileIfUnchanged).mock.calls[0]?.[3]).toBe(TWO_HOURS_AGO);
    expect(state.manifest.files.todos?.checksum).toBe(entry.checksum);
    expect(state.manifest.files.todos?.lastModified).not.toBe(entry.lastModified);
  });

  it('이 기기가 받지 않은 확정본이 있었으면 덮지 않고 후속본을 원격 장부에 편입한다', async () => {
    const oldContent = JSON.stringify({ items: [] });
    const localEntry = await entryFor(oldContent, '2026-11-01T00:00:00.000Z');
    const remoteEntry = await entryFor(committedContent, '2026-11-09T00:00:00.000Z', 'other-pc');
    const { storage } = makeStorage({ todos: { items: [{ id: 'mine', text: '이 PC 변경' }] } });
    const { port, contents, state } = makeDrive(
      { ...emptyManifest('other-pc'), files: { todos: remoteEntry } },
      { 'todos.json': { content: orphanContent, modifiedTime: TWO_HOURS_AGO } },
    );
    const { repo, state: local } = makeRepo({ ...emptyManifest(), files: { todos: localEntry } });

    const result = await toCloud(storage, port, repo).execute();

    expect(result.deferred).toContain('todos');
    expect(contents['todos.json']).toBe(orphanContent);
    expect(port.uploadSyncFileIfUnchanged).not.toHaveBeenCalled();
    expect(state.manifest.files.todos).toMatchObject({
      checksum: await computeSyncChecksum(orphanContent),
      lastModified: TWO_HOURS_AGO,
      uploadedBy: 'other-pc',
    });
    expect(local.local?.files.todos).toEqual(localEntry);
  });

  it('방금 바뀐 후속본은 건너뛴다', async () => {
    const entry = await entryFor(committedContent, '2026-11-09T00:00:00.000Z');
    const manifest = { ...emptyManifest(), files: { todos: entry } };
    const { storage } = makeStorage({ todos: JSON.parse(committedContent) });
    const { port, contents } = makeDrive(manifest, {
      'todos.json': { content: orphanContent, modifiedTime: FIVE_MIN_AGO },
    });
    const { repo } = makeRepo(manifest);

    const result = await toCloud(storage, port, repo).execute();

    expect(result.skipped).toContain('todos');
    expect(contents['todos.json']).toBe(orphanContent);
    expect(port.uploadSyncFileIfUnchanged).not.toHaveBeenCalled();
  });
});

describe('장부 밖 바이너리', () => {
  it('버려진 관찰 첨부는 덮지 않고 원격 장부에 편입한다', async () => {
    const relPath = 'obs-attachments/x.png';
    const driveName = 'obs-attachments__x.png.json';
    const orphan = binWrapper(relPath, 'CQkJ');
    const { storage } = makeStorage({}, { [relPath]: new Uint8Array([1, 2, 3]) });
    const { port, contents, state } = makeDrive(emptyManifest(), {
      [driveName]: { content: orphan, modifiedTime: TWO_HOURS_AGO },
    });
    const { repo } = makeRepo(emptyManifest());

    const result = await toCloud(storage, port, repo, { binaries: [relPath] }).execute();

    expect(result.deferred).toContain(relPath);
    expect(contents[driveName]).toBe(orphan);
    expect(state.manifest.files[relPath]?.checksum).toBe(await computeSyncChecksum(orphan));
    expect(state.manifest.files[relPath]?.driveFilename).toBeUndefined();
  });

  it('버려진 장부 밖 사진은 지우거나 덮지 않고 이 기기 사진을 새 세대로 올린다', async () => {
    const relPath = 'student-photos/s1.jpg';
    const orphanName = 'student-photos__s1.jpg.json';
    const orphan = binWrapper(relPath, 'CQkJ');
    const { storage } = makeStorage({}, { [relPath]: new Uint8Array([7, 7, 7]) });
    const { port, contents, state } = makeDrive(emptyManifest(), {
      [orphanName]: { content: orphan, modifiedTime: TWO_HOURS_AGO },
    });
    const { repo } = makeRepo(emptyManifest());

    const result = await toCloud(storage, port, repo, { binaries: [relPath] }).execute();

    expect(result.uploaded).toContain(relPath);
    expect(contents[orphanName]).toBe(orphan);
    const driveFilename = state.manifest.files[relPath]?.driveFilename;
    expect(driveFilename).toMatch(/^student-photos__s1\.jpg\.json\.rev-/);
    expect(contents[driveFilename ?? '']).toBeDefined();
  });

  it('사진 세대 파일 내용이 장부와 다르면 손상으로 보고 멈춘다', async () => {
    const relPath = 'student-photos/s2.jpg';
    const committed = binWrapper(relPath, 'AQID');
    const entry = await entryFor(committed, '2026-11-09T00:00:00.000Z');
    const revName = `student-photos__s2.jpg.json.rev-${entry.checksum}`;
    const withName = { ...entry, driveFilename: revName };
    const manifest = { ...emptyManifest(), files: { [relPath]: withName } };
    const { storage } = makeStorage({}, { [relPath]: new Uint8Array([9]) });
    const { port } = makeDrive(manifest, {
      [revName]: { content: binWrapper(relPath, 'CQkJ'), modifiedTime: TWO_HOURS_AGO },
    });
    const { repo } = makeRepo(manifest);

    await expect(toCloud(storage, port, repo, { binaries: [relPath] }).execute()).rejects.toThrow(
      buildManifestMismatchMessage(relPath),
    );
  });
});
