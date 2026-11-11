/**
 * ADR-148 — 시작 스냅샷으로 되돌린 자료가 클라우드의 더 새 사본을 덮지 않는다.
 *
 * 되돌린 자료는 장부로 보면 "아직 안 올린 로컬 변경"과 똑같다. 그대로 두면 받기는 건너뛰고(SKIP)
 * 올리기는 원격이 장부와 같으니 올려서(UPLOAD) 그날 처음 켰을 때의 옛 상태로 클라우드를 덮는다.
 * 가짜 Drive 는 `contentMismatchPendingLocalChange.test.ts` 와 같은 인메모리 방식(CAS 계약 그대로)이다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncToCloud } from '../SyncToCloud';
import { SyncFromCloud } from '../SyncFromCloud';
import type { RestoredDataHold } from '../restoredDataHold';
import { RESTORED_CONFLICT_NOTE } from '@domain/rules/restoredDataNotice';
import { YEAR_TRANSITION_REMOVED_KEY } from '@usecases/schoolYear/ExecuteYearTransition';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type { DriveSyncManifest } from '@domain/entities/DriveSyncState';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

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
    readBinary: vi.fn(async () => null),
    writeBinary: vi.fn(async () => undefined),
  } as unknown as IStoragePort;
  return { storage, files };
}

/**
 * 인메모리 Drive — 실제 내용과 modifiedTime을 보관한다.
 * v2.3.1 이후 업로드 경로는 CAS다: 파일이 있으면 uploadSyncFileIfUnchanged(기대 시각 일치),
 * 없으면 createSyncFileIfMissing(이미 있으면 null). 그 계약을 그대로 흉내낸다.
 */
function makeDrive(initialManifest: DriveSyncManifest | null, seed: Record<string, string> = {}) {
  const state = { manifest: initialManifest };
  const files = new Map<string, { content: string; modifiedTime: string }>();
  for (const [key, content] of Object.entries(seed)) {
    files.set(key, { content, modifiedTime: '2026-07-30T03:54:24.657Z' });
  }
  let tick = 0;
  const nextTime = () => `2026-08-10T07:${String(tick++).padStart(2, '0')}:00.000Z`;
  const keyOf = (filename: string) => filename.replace(/\.json$/, '');

  const port = {
    getOrCreateSyncFolder: vi.fn(async () => ({ id: 'folder-1', name: '쌤핀 동기화' })),
    createSyncFileIfMissing: vi.fn(async (_folderId: string, filename: string, content: string) => {
      if (filename === 'manifest.json') {
        if (state.manifest) return null;
        state.manifest = JSON.parse(content) as DriveSyncManifest;
        return { fileId: 'manifest', modifiedTime: nextTime() };
      }
      const key = keyOf(filename);
      if (files.has(key)) return null;
      const modifiedTime = nextTime();
      files.set(key, { content, modifiedTime });
      return { fileId: key, modifiedTime };
    }),
    uploadSyncFile: vi.fn(async (_folderId: string, filename: string, content: string) => {
      const key = keyOf(filename);
      const modifiedTime = nextTime();
      files.set(key, { content, modifiedTime });
      return { fileId: key, modifiedTime };
    }),
    uploadSyncFileIfUnchanged: vi.fn(
      async (_folderId: string, filename: string, content: string, expected: string) => {
        const key = keyOf(filename);
        const current = files.get(key);
        if (!current || current.modifiedTime !== expected) return null;
        const modifiedTime = nextTime();
        files.set(key, { content, modifiedTime });
        return { fileId: key, modifiedTime };
      },
    ),
    downloadSyncFile: vi.fn(async (fileId: string) => files.get(fileId)?.content ?? '{}'),
    getSyncManifest: vi.fn(async () => state.manifest),
    updateSyncManifest: vi.fn(async (_folderId: string, m: DriveSyncManifest) => {
      state.manifest = m;
      return 'manifest';
    }),
    updateSyncManifestIfUnchanged: vi.fn(
      async (_folderId: string, _expected: DriveSyncManifest, next: DriveSyncManifest) => {
        state.manifest = next;
        return true;
      },
    ),
    listSyncFiles: vi.fn(async () =>
      Array.from(files.entries()).map(([id, v]) => ({
        id,
        name: `${id}.json`,
        modifiedTime: v.modifiedTime,
      })),
    ),
    deleteSyncFolder: vi.fn(async () => undefined),
  } as unknown as IDriveSyncPort;
  return { port, state, files };
}

function makeSyncRepo(initial: DriveSyncManifest | null) {
  const state = { manifest: initial };
  const repo: IDriveSyncRepository = {
    getLocalManifest: vi.fn(async () => state.manifest),
    saveLocalManifest: vi.fn(async (m: DriveSyncManifest) => {
      state.manifest = m;
    }),
  };
  return { repo, state };
}

/** 11월 9일까지 쓴 할 일(클라우드에 올라간 최신본) */
const NEWER = { todos: [{ id: 'a' }, { id: 'b', text: '11월 9일에 더한 할 일' }] };
/** 그날 처음 켰을 때 찍힌 시작 스냅샷(되돌린 옛 상태) */
const OLDER = { todos: [{ id: 'a' }] };
const RESTORED_AT = '2026-11-10T04:41:00.000Z';

function holdsOf(...keys: string[]): RestoredDataHold[] {
  return keys.map((key) => ({ key, restoredStateAt: RESTORED_AT }));
}

/** holds 가 undefined 면 보호 훅을 주입하지 않는다(예전 동작). */
function syncFrom(
  storage: IStoragePort,
  port: IDriveSyncPort,
  repo: IDriveSyncRepository,
  holds: () => readonly RestoredDataHold[] | undefined,
): SyncFromCloud {
  return new SyncFromCloud(
    storage,
    port,
    repo,
    'pc-1',
    '교무실 PC',
    'ask',
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    holds() === undefined ? undefined : async () => holds() ?? [],
  );
}

function syncTo(
  storage: IStoragePort,
  port: IDriveSyncPort,
  repo: IDriveSyncRepository,
  holds: () => readonly RestoredDataHold[] | undefined,
): SyncToCloud {
  return new SyncToCloud(
    storage,
    port,
    repo,
    'pc-1',
    '교무실 PC',
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    holds() === undefined ? undefined : async () => holds() ?? [],
  );
}

/** 이 PC 가 newer 를 올려 장부가 확정된 뒤, 원본·백업이 깨져 older(스냅샷)로 되돌린 상태. */
async function restoredAfterSync(key = 'todos', newer: unknown = NEWER, older: unknown = OLDER) {
  const { storage, files } = makeStorage({ [key]: newer });
  const drive = makeDrive(null);
  const { repo } = makeSyncRepo(null);
  const first = await syncTo(storage, drive.port, repo, () => undefined).execute();
  expect(first.uploaded).toContain(key);
  files[key] = older;
  return { storage, files, drive, repo };
}

/** 다른 기기가 같은 자료를 고쳐 올린다. */
async function otherDeviceUploads(
  drive: ReturnType<typeof makeDrive>,
  key: string,
  data: unknown,
): Promise<void> {
  const { storage } = makeStorage({ [key]: data });
  const { repo } = makeSyncRepo(drive.state.manifest);
  const up = await new SyncToCloud(storage, drive.port, repo, 'pc-2', '집 노트북').execute();
  expect(up.uploaded).toContain(key);
}

describe('시작 스냅샷으로 되돌린 자료의 동기화 보호 (ADR-148)', () => {
  it('복원된 파일은 장부와 달라도 받기에서 충돌로 올린다', async () => {
    const { storage, drive, repo } = await restoredAfterSync();

    // 보호가 없으면 "안 올린 로컬 변경"으로 건너뛴다 — 이어지는 올리기가 클라우드를 덮던 경로
    const unguarded = await syncFrom(storage, drive.port, repo, () => undefined).execute();
    expect(unguarded.conflicts).toEqual([]);
    expect(unguarded.skipped).toContain('todos');

    const down = await syncFrom(storage, drive.port, repo, () => holdsOf('todos')).execute();

    expect(down.conflicts).toHaveLength(1);
    expect(down.conflicts[0]).toMatchObject({
      filename: 'todos',
      kind: 'json',
      // 충돌 창의 "이 기기" 시각 = 되돌린 상태의 시각
      localModified: RESTORED_AT,
      localDeviceName: '교무실 PC',
      // 충돌 창의 "이 기기" 아래 안내 한 줄
      localNote: RESTORED_CONFLICT_NOTE,
    });
    expect(down.restoredResolved).toEqual([]);
    expect(down.downloaded).toEqual([]);
  });

  it.each(['student-records', 'attendance', 'observations'])(
    '항목 단위로 합치는 자료도 되돌렸으면 받기에서 충돌로 묻는다: %s',
    async (key) => {
      const { storage, drive, repo } = await restoredAfterSync(
        key,
        { records: [{ id: 'r1' }, { id: 'r2' }] },
        { records: [{ id: 'r1' }] },
      );

      const down = await syncFrom(storage, drive.port, repo, () => holdsOf(key)).execute();

      expect(down.conflicts.map((c) => c.filename)).toEqual([key]);
    },
  );

  it('복원된 파일은 충돌이 풀리기 전까지 올리지 않는다(저장 시 자동 올리기 포함)', async () => {
    const { storage, drive, repo } = await restoredAfterSync();
    const cloudBefore = drive.files.get('todos')?.content;

    // 저장할 때마다 도는 자동 올리기도 같은 SyncToCloud 를 받기 없이 부른다
    const up = await syncTo(storage, drive.port, repo, () => holdsOf('todos')).execute();

    expect(up.uploaded).not.toContain('todos');
    expect(up.skipped).toContain('todos');
    // 유예하지 않는다 — 넣으면 받기→올리기 재시도가 같은 판정을 되풀이한다
    expect(up.deferred).not.toContain('todos');
    expect(up.restoredResolved).toEqual([]);
    expect(drive.files.get('todos')?.content).toBe(cloudBefore);
    expect(JSON.parse(cloudBefore ?? '{}')).toEqual(NEWER);

    // 보호가 없으면 옛 상태로 클라우드를 덮는다(고친 결함의 재현)
    const unguarded = await syncTo(storage, drive.port, repo, () => undefined).execute();
    expect(unguarded.uploaded).toContain('todos');
  });

  it('처음 읽는 자료가 그 읽기에서 되돌려져도 올리지 않는다', async () => {
    const { storage, files, drive, repo } = await restoredAfterSync();
    files['todos'] = NEWER; // 아직 아무도 읽지 않았다 — 디스크에서는 깨진 상태
    const holds: RestoredDataHold[] = [];
    const realRead = vi.mocked(storage.read).getMockImplementation();
    vi.mocked(storage.read).mockImplementation(async (filename: string) => {
      if (filename === 'todos' && holds.length === 0) {
        // 이 읽기가 메인 프로세스에서 시작 스냅샷 복원을 일으킨다
        files['todos'] = OLDER;
        holds.push(...holdsOf('todos'));
      }
      return realRead?.(filename) ?? null;
    });

    const up = await syncTo(storage, drive.port, repo, () => holds).execute();

    expect(up.uploaded).not.toContain('todos');
    expect(JSON.parse(drive.files.get('todos')?.content ?? '{}')).toEqual(NEWER);
  });

  it('클라우드도 같이 바뀌었으면(동시 변경) 받기는 충돌로 묻고 올리기는 건너뛴다', async () => {
    const { storage, drive, repo } = await restoredAfterSync();
    await otherDeviceUploads(drive, 'todos', { todos: [{ id: 'c' }] });

    const up = await syncTo(storage, drive.port, repo, () => holdsOf('todos')).execute();
    expect(up.uploaded).not.toContain('todos');
    expect(up.deferred).not.toContain('todos');

    const down = await syncFrom(storage, drive.port, repo, () => holdsOf('todos')).execute();
    expect(down.conflicts.map((c) => c.filename)).toEqual(['todos']);
    expect(down.restoredResolved).toEqual([]);
  });

  it('내용이 같으면 복원 기록을 정리한다', async () => {
    // 시작 스냅샷이 마지막으로 주고받은 내용과 같았다 — 잃은 것도, 덮을 것도 없다
    const { storage, files, drive, repo } = await restoredAfterSync();
    files['todos'] = NEWER;

    const down = await syncFrom(storage, drive.port, repo, () => holdsOf('todos')).execute();
    expect(down.conflicts).toEqual([]);
    expect(down.restoredResolved).toEqual(['todos']);

    const up = await syncTo(storage, drive.port, repo, () => holdsOf('todos')).execute();
    expect(up.restoredResolved).toEqual(['todos']);
    expect(up.uploaded).not.toContain('todos');
  });

  it('받기로 클라우드 내용을 내려받아 맞춰지면 정리한다', async () => {
    const { storage, files, drive, repo } = await restoredAfterSync();
    // 되돌린 내용이 마지막으로 주고받은 내용과 같고(로컬 변경 없음), 다른 기기가 그 뒤에 고쳐 올렸다
    files['todos'] = NEWER;
    await otherDeviceUploads(drive, 'todos', { todos: [{ id: 'c' }] });

    const down = await syncFrom(storage, drive.port, repo, () => holdsOf('todos')).execute();

    expect(down.downloaded).toEqual(['todos']);
    expect(files['todos']).toEqual({ todos: [{ id: 'c' }] });
    expect(down.restoredResolved).toEqual(['todos']);
  });

  it('클라우드에 사본이 아예 없으면 올리기가 정리하고 평소처럼 올린다', async () => {
    const { storage } = makeStorage({ todos: OLDER });
    const drive = makeDrive(null);
    const { repo } = makeSyncRepo(null);

    // 받기는 장부가 없다는 것만으로 풀지 않는다(장부가 깨져도 없음으로 보인다)
    const down = await syncFrom(storage, drive.port, repo, () => holdsOf('todos')).execute();
    expect(down.restoredResolved).toEqual([]);

    const up = await syncTo(storage, drive.port, repo, () => holdsOf('todos')).execute();
    expect(up.restoredResolved).toEqual(['todos']);
    expect(up.uploaded).toContain('todos');
  });

  it('클라우드 장부가 깨져 보이면 보호를 풀지 않는다', async () => {
    const { storage, drive, repo } = await restoredAfterSync();
    // 장부 파일은 있는데 읽히지 않는다 — 어댑터는 이때도 null 을 준다
    vi.mocked(drive.port.getSyncManifest).mockResolvedValue(null);

    const down = await syncFrom(storage, drive.port, repo, () => holdsOf('todos')).execute();
    expect(down.restoredResolved).toEqual([]);

    // 올리기는 장부를 새로 만들려다 이미 있어 멈춘다 — 클라우드 사본은 그대로
    await expect(
      syncTo(storage, drive.port, repo, () => holdsOf('todos')).execute(),
    ).rejects.toThrow();
    expect(JSON.parse(drive.files.get('todos')?.content ?? '{}')).toEqual(NEWER);
  });

  it('학년도 전환 보호가 걸린 키는 복원 보호로 막지 않는다', async () => {
    const roster = [{ id: 's1', name: '지난 학년도' }];
    const { storage, files, drive, repo } = await restoredAfterSync('students', roster, [
      { id: 'n1', name: '새 학년도' },
    ]);
    // 전환을 안 한 다른 기기가 지난 학년도 명렬을 다시 올렸다(클라우드가 정화되지 않음)
    await otherDeviceUploads(drive, 'students', [...roster, { id: 's2', name: '지난 학년도 2' }]);
    // 학년도 전환이 이 키를 비웠다는 표시 — 받기는 이 키를 건너뛴다(로컬이 새 학년도 기준)
    files[YEAR_TRANSITION_REMOVED_KEY] = {
      version: 1,
      removedAt: '2026-11-10T00:00:00.000Z',
      keys: ['students'],
    };

    const down = await syncFrom(storage, drive.port, repo, () => holdsOf('students')).execute();
    expect(down.conflicts).toEqual([]);
    expect(down.restoredReleasedForYearTransition).toEqual(['students']);
    expect(down.restoredResolved).toEqual([]);

    const up = await syncTo(storage, drive.port, repo, () => holdsOf('students')).execute();
    expect(up.restoredReleasedForYearTransition).toEqual(['students']);
    expect(up.uploaded).toContain('students');
    expect(JSON.parse(drive.files.get('students')?.content ?? '[]')).toEqual([
      { id: 'n1', name: '새 학년도' },
    ]);
  });

  it('복원 목록을 읽지 못하면 받기도 아무것도 받기 전에 멈춘다', async () => {
    const { storage, files, drive, repo } = await restoredAfterSync();
    await otherDeviceUploads(drive, 'todos', { todos: [{ id: 'c' }] });
    const failing = new SyncFromCloud(
      storage,
      drive.port,
      repo,
      'pc-1',
      '교무실 PC',
      'ask',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      async () => {
        throw new Error('IPC 실패');
      },
    );

    await expect(failing.execute()).rejects.toThrow('IPC 실패');
    expect(files['todos']).toEqual(OLDER);
  });

  it('복원 목록을 읽지 못하면 동기화를 멈춘다(빈 목록으로 삼켜 덮지 않는다)', async () => {
    const { storage, drive, repo } = await restoredAfterSync();
    const failing = new SyncToCloud(
      storage,
      drive.port,
      repo,
      'pc-1',
      '교무실 PC',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      async () => {
        throw new Error('IPC 실패');
      },
    );

    await expect(failing.execute()).rejects.toThrow('IPC 실패');
    expect(JSON.parse(drive.files.get('todos')?.content ?? '{}')).toEqual(NEWER);
  });
});
