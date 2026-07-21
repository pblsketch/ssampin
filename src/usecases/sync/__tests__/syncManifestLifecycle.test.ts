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
import { SyncToCloud } from '../SyncToCloud';
import { SyncFromCloud } from '../SyncFromCloud';
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
  fileContents: Record<string, string> = {},
) {
  const state = { manifest: initialManifest };
  const updateSyncManifest = vi.fn(async (_folderId: string, m: DriveSyncManifest) => {
    state.manifest = m;
    return 'manifest-1';
  });
  const port = {
    getOrCreateSyncFolder: vi.fn(async () => ({ id: 'folder-1', name: '쌤핀 동기화' })),
    uploadSyncFile: vi.fn(async () => ({ fileId: 'f', modifiedTime: '2026-07-21T07:33:00Z' })),
    downloadSyncFile: vi.fn(async (fileId: string) => fileContents[fileId] ?? '{}'),
    getSyncManifest: vi.fn(async () => state.manifest),
    updateSyncManifest,
    listSyncFiles: vi.fn(async () =>
      Object.keys(fileContents).map((id) => ({ id, name: `${id}.json` })),
    ),
    deleteSyncFolder: vi.fn(async () => undefined),
  } as unknown as IDriveSyncPort;
  return { port, state, updateSyncManifest };
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

  it('데이터 보존: 체크섬 동일 + 로컬 파일 존재면 절대 덮어쓰지 않는다', async () => {
    const local = manifest(
      { todos: { checksum: 'same', lastModified: '2026-07-21T03:00:00Z', size: 100 } },
      'mobile-abc',
    );
    const remote = manifest(
      { todos: { checksum: 'same', lastModified: '2026-07-21T03:00:00Z', size: 100 } },
      'pc-device',
    );
    const { storage, files } = makeStorage({ todos: { items: ['로컬에 이미 있는 할 일'] } });
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

describe('통합: 신고 흐름 전체 (no-op 업로드 → 다운로드)', () => {
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
