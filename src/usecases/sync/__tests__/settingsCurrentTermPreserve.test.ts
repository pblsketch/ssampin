/**
 * F3(H1) 회귀 테스트 — settings 통파일 교체 시 currentTerm "더 최신 학기 승" 보존 (qa3-C 재현).
 *
 * settings는 병합 없는 통파일 LWW라, 아직 전환하지 않은 기기가 올린 settings가 내려오면
 * currentTerm이 벗겨져 옛 학년도 스킵 필터(S2.2b)가 영구 비활성됐다. 보존 규칙은
 * 다운로드 교체 지점(SyncFromCloud.writeReplacedFile + resolveConflict 'remote')에서
 * 1회 쓰기로만 동작한다 — 체크섬이 리모트와 달라져 다음 업로드가 교정본을 밀어올린다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncFromCloud, preserveNewerCurrentTerm } from '../SyncFromCloud';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type { DriveSyncManifest } from '@domain/entities/DriveSyncState';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('preserveNewerCurrentTerm — 단위 규칙', () => {
  it('수신에 currentTerm 부재 → 로컬 값 재부착(필터 영구 비활성 차단)', () => {
    expect(preserveNewerCurrentTerm({ theme: 'light' }, '2027-1')).toEqual({
      theme: 'light',
      currentTerm: '2027-1',
    });
  });

  it('수신이 구학기 → 로컬 보존', () => {
    expect(preserveNewerCurrentTerm({ currentTerm: '2026-2' }, '2027-1')).toEqual({
      currentTerm: '2027-1',
    });
  });

  it('수신이 더 최신 → 수신 채택(정상 LWW)', () => {
    const incoming = { currentTerm: '2027-2' };
    expect(preserveNewerCurrentTerm(incoming, '2027-1')).toBe(incoming);
  });

  it('동일 학기 → 수신 그대로(무동작)', () => {
    const incoming = { currentTerm: '2027-1' };
    expect(preserveNewerCurrentTerm(incoming, '2027-1')).toBe(incoming);
  });

  it('양쪽 부재·로컬 파싱 불가 → 무동작', () => {
    const incoming = { theme: 'dark' };
    expect(preserveNewerCurrentTerm(incoming, undefined)).toBe(incoming);
    expect(preserveNewerCurrentTerm(incoming, '이상한값')).toBe(incoming);
  });

  it('수신이 객체가 아니면 건드리지 않는다(방어)', () => {
    expect(preserveNewerCurrentTerm(null, '2027-1')).toBeNull();
    expect(preserveNewerCurrentTerm([1], '2027-1')).toEqual([1]);
  });

  it('F9a: lastClosedTerm도 같은 규칙으로 보존한다(스킵 필터 기준이 벗겨지면 B2 재발)', () => {
    // 수신에 lastClosedTerm 부재 → 로컬 값 재부착
    expect(preserveNewerCurrentTerm({ currentTerm: '2026-2' }, '2026-2', '2026-1')).toEqual({
      currentTerm: '2026-2',
      lastClosedTerm: '2026-1',
    });
    // 수신이 더 최신 마감이면 수신 채택
    const newer = { currentTerm: '2027-1', lastClosedTerm: '2026-2' };
    expect(preserveNewerCurrentTerm(newer, '2026-2', '2026-1')).toBe(newer);
    // 두 필드 동시 보존
    expect(preserveNewerCurrentTerm({}, '2027-1', '2026-2')).toEqual({
      currentTerm: '2027-1',
      lastClosedTerm: '2026-2',
    });
    // 로컬 lastClosedTerm 부재 → 그 필드는 무동작
    expect(preserveNewerCurrentTerm({ currentTerm: '2027-1' }, '2027-1', undefined)).toEqual({
      currentTerm: '2027-1',
    });
  });
});

/* ─── SyncFromCloud 통합 — settings 충돌 latest 교체 경로 ─── */

function manifest(files: DriveSyncManifest['files'], deviceId: string): DriveSyncManifest {
  return {
    version: 1,
    lastSyncedAt: '2026-08-06T00:00:00Z',
    deviceId,
    deviceName: deviceId,
    files,
  };
}

function harness(localSettings: unknown, remoteSettings: unknown) {
  const files: Record<string, unknown> = { settings: localSettings };
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
    listBinary: vi.fn(async () => []),
  } as unknown as IStoragePort;

  // 충돌 latest 경로: 체크섬 다름 + 리모트 최신 + 타 기기 업로드
  const remote = manifest(
    {
      settings: {
        checksum: 'remote-v2',
        lastModified: '2026-08-06T09:00:00Z',
        size: 100,
        uploadedBy: 'other-pc',
      },
    },
    'other-pc',
  );
  const local = manifest(
    { settings: { checksum: 'local-v1', lastModified: '2026-08-06T01:00:00Z', size: 100 } },
    'my-pc',
  );
  const port = {
    getOrCreateSyncFolder: vi.fn(async () => ({ id: 'folder-1', name: '쌤핀 동기화' })),
    uploadSyncFile: vi.fn(async () => ({ fileId: 'f', modifiedTime: '2026-08-06T10:00:00Z' })),
    downloadSyncFile: vi.fn(async () => JSON.stringify(remoteSettings)),
    getSyncManifest: vi.fn(async () => remote),
    updateSyncManifest: vi.fn(async () => 'manifest-1'),
    listSyncFiles: vi.fn(async () => [{ id: 'settings', name: 'settings.json' }]),
    deleteSyncFolder: vi.fn(async () => undefined),
  } as unknown as IDriveSyncPort;
  const repo: IDriveSyncRepository = {
    getLocalManifest: vi.fn(async () => local),
    saveLocalManifest: vi.fn(async () => undefined),
  };
  const useCase = new SyncFromCloud(storage, port, repo, 'my-pc', '내 PC', 'latest');
  return { useCase, files };
}

describe('SyncFromCloud 통합 — settings 교체 시 currentTerm 보존 (qa3-C)', () => {
  it('미전환 기기의 settings(currentTerm 없음)가 내려와도 로컬 currentTerm이 살아남는다', async () => {
    const { useCase, files } = harness(
      { theme: 'dark', currentTerm: '2027-1' },
      { theme: 'light' }, // 미전환 기기가 올린 settings — currentTerm 벗겨짐
    );

    const result = await useCase.execute();

    expect(result.downloaded).toContain('settings');
    expect(files['settings']).toEqual({ theme: 'light', currentTerm: '2027-1' }); // 재부착
  });

  it('수신 settings가 더 최신 학기면 그대로 채택한다', async () => {
    const { useCase, files } = harness(
      { theme: 'dark', currentTerm: '2027-1' },
      { theme: 'light', currentTerm: '2027-2' },
    );

    await useCase.execute();

    expect(files['settings']).toEqual({ theme: 'light', currentTerm: '2027-2' });
  });

  it('양쪽 모두 currentTerm 없으면 무동작(현행 통파일 교체 그대로)', async () => {
    const { useCase, files } = harness({ theme: 'dark' }, { theme: 'light' });

    await useCase.execute();

    expect(files['settings']).toEqual({ theme: 'light' });
  });
});
