/**
 * 회귀 테스트 — "장부 체크섬은 같은데 실제 로컬 내용이 다름" 판정 (2026-08-10 신고).
 *
 * v2.3.1 핫픽스(81b58ab5)가 이 상태를 **무조건 충돌**로 올리면서, 동기화가 스스로 남긴
 * 흔적까지 가짜 충돌이 됐다. v2.3.4까지 동기화 완료 후 settings.sync.lastSyncedAt을 다시
 * 쓰는 경로가 장부 확정 *이후* 파일을 건드렸으므로, 다음 다운로드가 매번 "설정" 충돌 창을
 * 띄웠다(해결해도 다음 동기화에서 부활 — 화면엔 Invalid Date로 표시).
 *
 * 판정 수정(ADR-039): 겹쳐 있던 둘을 가른다.
 *   (a) 아직 안 올린 로컬 변경 → 스킵(리모트는 내 장부와 동일해 받을 것이 없다)
 *   (b) 빈 봉투 + 리모트가 더 큼 → 유실 의심이므로 충돌로 회수 (v2.3.1 보호 유지)
 * 시각 재기록 자체는 ADR-040(기기 전용 저장소 분리)로 제거했다 — 아래 두 번째 테스트.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncToCloud } from '../SyncToCloud';
import { SyncFromCloud } from '../SyncFromCloud';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type { DriveSyncManifest } from '@domain/entities/DriveSyncState';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

function manifest(files: DriveSyncManifest['files'], deviceId: string): DriveSyncManifest {
  return {
    version: 1,
    lastSyncedAt: '2026-08-10T06:00:00.000Z',
    deviceId,
    deviceName: deviceId,
    files,
  };
}

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

describe('미업로드 로컬 변경은 충돌이 아니다 (ADR-039)', () => {
  it('동기화 직후 settings가 한 번 더 쓰여도 다음 다운로드가 충돌을 올리지 않는다', async () => {
    const { storage, files } = makeStorage({
      settings: {
        teacherName: '박준일',
        periodTimes: [{ period: 1, start: '09:00' }],
        sync: { enabled: true, deviceId: 'pc-1', lastSyncedAt: '2026-08-10T06:00:00.000Z' },
      },
    });
    const { port } = makeDrive(null);
    const { repo } = makeSyncRepo(null);

    // 1) 업로드 — settings가 Drive에 올라가고 로컬/리모트 장부에 체크섬이 확정된다
    const up = await new SyncToCloud(storage, port, repo, 'pc-1', '박준일').execute();
    expect(up.uploaded).toContain('settings');

    // 2) v2.3.4까지 useDriveSyncStore가 하던 일: 장부 확정 *이후* lastSyncedAt 덧쓰기.
    //    (ADR-040으로 제거했지만, 사용자가 설정을 바꾼 직후 동기화도 같은 형태다.)
    const before = files['settings'] as { sync: Record<string, unknown> };
    files['settings'] = {
      ...before,
      sync: { ...before.sync, lastSyncedAt: '2026-08-10T06:54:36.000Z' },
    };

    // 3) 다음 주기의 다운로드 — 다른 기기가 없으니 리모트는 그대로다
    const down = await new SyncFromCloud(storage, port, repo, 'pc-1', '박준일', 'ask').execute();

    expect(down.conflicts).toEqual([]);
    expect(down.skipped).toContain('settings');
  });

  it('ADR-040: 동기화가 settings를 건드리지 않으므로 다음 주기에 settings를 다시 올리지 않는다', async () => {
    // v2.3.4까지는 동기화 끝에 settings.sync.lastSyncedAt을 덧써서 내용이 매번 달라졌고,
    // 그래서 **주기마다 무조건 재업로드**됐다. 시각을 기기 전용 저장소로 옮긴 뒤로는
    // settings가 사용자의 실제 설정 변경 때만 올라가야 한다.
    const { storage } = makeStorage({
      settings: {
        teacherName: '박준일',
        periodTimes: [{ period: 1, start: '09:00' }],
        sync: { enabled: true, deviceId: 'pc-1' },
      },
    });
    const { port } = makeDrive(null);
    const { repo } = makeSyncRepo(null);

    const first = await new SyncToCloud(storage, port, repo, 'pc-1', '박준일').execute();
    expect(first.uploaded).toContain('settings');

    const down = await new SyncFromCloud(storage, port, repo, 'pc-1', '박준일', 'ask').execute();
    expect(down.conflicts).toEqual([]);
    const second = await new SyncToCloud(storage, port, repo, 'pc-1', '박준일').execute();

    expect(second.uploaded).not.toContain('settings');
    expect(second.skipped).toContain('settings');
  });

  it('스킵한 로컬 변경은 이어지는 업로드가 실제로 클라우드에 올린다(고아로 남지 않음)', async () => {
    const { storage, files } = makeStorage({ memos: { items: ['첫 메모'] } });
    const { port, files: driveFiles } = makeDrive(null);
    const { repo } = makeSyncRepo(null);

    await new SyncToCloud(storage, port, repo, 'pc-1', '박준일').execute();

    // 사용자가 메모를 고쳤지만 아직 업로드 전인 상태에서 다운로드가 먼저 돈다
    files['memos'] = { items: ['첫 메모', '고친 메모'] };
    const down = await new SyncFromCloud(storage, port, repo, 'pc-1', '박준일', 'ask').execute();
    expect(down.conflicts).toEqual([]);

    // 곧바로 이어지는 업로드가 그 변경을 올린다
    const up = await new SyncToCloud(storage, port, repo, 'pc-1', '박준일').execute();
    expect(up.uploaded).toContain('memos');
    expect(JSON.parse(driveFiles.get('memos')?.content ?? '{}')).toEqual({
      items: ['첫 메모', '고친 메모'],
    });
  });
});

describe('빈 봉투 유실은 여전히 충돌로 회수한다 (v2.3.1 보호 유지)', () => {
  it('장부는 "받았음"인데 로컬이 빈 봉투이고 리모트가 더 크면 충돌을 올린다', async () => {
    const shared = {
      checksum: 'shared-checksum',
      lastModified: '2026-07-30T03:54:24.657Z',
      size: 743,
      uploadedBy: 'pc-device',
    };
    const remote = manifest({ events: shared }, 'pc-device');
    const local = manifest({ events: { ...shared, uploadedBy: undefined } }, 'mobile-abc');
    // 로컬은 PWA 재설치로 빈 봉투만 남았다(28B) — 리모트에는 원본(743B)이 있다
    const { storage } = makeStorage({ events: { events: [], categories: [] } });
    const { port } = makeDrive(remote, { events: JSON.stringify({ events: [{ id: 'e1' }] }) });
    const { repo } = makeSyncRepo(local);

    const down = await new SyncFromCloud(
      storage,
      port,
      repo,
      'mobile-abc',
      '내 폰',
      'ask',
    ).execute();

    expect(down.conflicts.map((c) => c.filename)).toEqual(['events']);
    expect(down.conflicts[0]?.localModified).toBe('content-mismatch');
  });

  it('로컬이 비었어도 리모트가 더 크지 않으면(사용자가 직접 비운 경우) 충돌로 올리지 않는다', async () => {
    const shared = {
      checksum: 'shared-checksum',
      lastModified: '2026-07-30T03:54:24.657Z',
      size: 20, // 리모트도 사실상 빈 상태
      uploadedBy: 'pc-device',
    };
    const remote = manifest({ events: shared }, 'pc-device');
    const local = manifest({ events: { ...shared, uploadedBy: undefined } }, 'mobile-abc');
    const { storage } = makeStorage({ events: { events: [], categories: [] } });
    const { port } = makeDrive(remote, { events: JSON.stringify({ events: [] }) });
    const { repo } = makeSyncRepo(local);

    const down = await new SyncFromCloud(
      storage,
      port,
      repo,
      'mobile-abc',
      '내 폰',
      'ask',
    ).execute();

    expect(down.conflicts).toEqual([]);
  });
});
