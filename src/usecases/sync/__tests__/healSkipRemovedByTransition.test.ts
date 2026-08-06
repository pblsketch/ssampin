/**
 * F1(B1) 회귀 테스트 — 학년도 전환이 remove로 비운 파일의 "치유 다운로드" 부활 차단 (qa3-D 재현).
 *
 * 재현 조건(QA-A): 전환 기기가 과거 업로드한 students가 리모트·로컬 장부 양쪽에 남아
 * 체크섬 동일 + 전환-remove로 로컬 파일 부재 → ADR-024 치유 경로가 자기 기기의 옛 리모트
 * 사본을 그대로 복원했다. 마커(year-transition-removed, 로컬 전용)가 이 경로를 게이트한다.
 * 예외: 리모트 modifiedTime > removedAt(다른 기기가 전환 이후 실제 새 데이터를 올림)이면
 * 정당한 다운로드로 보고 허용 + 해당 키 마커 해제.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncFromCloud } from '../SyncFromCloud';
import {
  YEAR_TRANSITION_REMOVED_KEY,
  type YearTransitionRemovedMarker,
} from '../../schoolYear/ExecuteYearTransition';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type { DriveSyncManifest } from '@domain/entities/DriveSyncState';

const REMOVED_AT = '2026-08-06T00:00:00Z';
const BEFORE_REMOVAL = '2026-08-01T00:00:00Z';
const AFTER_REMOVAL = '2026-08-07T00:00:00Z';

function manifest(files: DriveSyncManifest['files'], deviceId: string): DriveSyncManifest {
  return { version: 1, lastSyncedAt: REMOVED_AT, deviceId, deviceName: deviceId, files };
}

function marker(keys: readonly string[]): YearTransitionRemovedMarker {
  return { version: 1, term: '2026-2', removedAt: REMOVED_AT, keys };
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
    listBinary: vi.fn(async () => []),
  } as unknown as IStoragePort;
  return { storage, files };
}

function makeDrive(
  initialManifest: DriveSyncManifest | null,
  fileContents: Record<string, string> = {},
) {
  const port = {
    getOrCreateSyncFolder: vi.fn(async () => ({ id: 'folder-1', name: '쌤핀 동기화' })),
    uploadSyncFile: vi.fn(async () => ({ fileId: 'f', modifiedTime: AFTER_REMOVAL })),
    downloadSyncFile: vi.fn(async (fileId: string) => fileContents[fileId] ?? '{}'),
    getSyncManifest: vi.fn(async () => initialManifest),
    updateSyncManifest: vi.fn(async () => 'manifest-1'),
    listSyncFiles: vi.fn(async () =>
      Object.keys(fileContents).map((id) => ({ id, name: `${id}.json` })),
    ),
    deleteSyncFolder: vi.fn(async () => undefined),
  } as unknown as IDriveSyncPort;
  return { port };
}

function makeSyncRepo(initial: DriveSyncManifest | null): IDriveSyncRepository {
  const state = { manifest: initial };
  return {
    getLocalManifest: vi.fn(async () => state.manifest),
    saveLocalManifest: vi.fn(async (m: DriveSyncManifest) => {
      state.manifest = m;
    }),
  };
}

/** qa3-D 공통 셋업: 장부 양쪽에 students 체크섬 동일 + 로컬 파일 부재. */
function healScenario(remoteModified: string, storageInit: Record<string, unknown>) {
  const entry = { checksum: 'old-v1', lastModified: remoteModified, size: 100 };
  const remote = manifest({ students: entry }, 'my-pc');
  const local = manifest({ students: entry }, 'my-pc');
  const { storage, files } = makeStorage(storageInit);
  const { port } = makeDrive(remote, {
    students: JSON.stringify([{ id: 'stu-old', name: '학생옛명렬' }]),
  });
  const repo = makeSyncRepo(local);
  const useCase = new SyncFromCloud(storage, port, repo, 'my-pc', '내 PC', 'latest');
  return { useCase, files };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('F1(B1) — 전환-remove 파일의 치유 다운로드 게이트', () => {
  it('qa3-D 재현: 마커가 있으면 치유 다운로드가 일어나지 않는다(옛 사본 부활 차단)', async () => {
    const { useCase, files } = healScenario(BEFORE_REMOVAL, {
      [YEAR_TRANSITION_REMOVED_KEY]: marker(['students', 'seating', 'seating-snapshots']),
    });

    const result = await useCase.execute();

    expect(result.downloaded).not.toContain('students');
    expect(result.skipped).toContain('students');
    expect(files['students']).toBeUndefined(); // 옛 명렬 부활 0
    // 마커는 그대로 유지(다음 동기화에서도 계속 게이트)
    expect((files[YEAR_TRANSITION_REMOVED_KEY] as YearTransitionRemovedMarker).keys).toContain(
      'students',
    );
  });

  it('예외: 리모트 modifiedTime > removedAt이면 정당한 새 데이터로 다운로드 + 해당 키 마커 해제', async () => {
    const { useCase, files } = healScenario(AFTER_REMOVAL, {
      [YEAR_TRANSITION_REMOVED_KEY]: marker(['students', 'seating']),
    });

    const result = await useCase.execute();

    expect(result.downloaded).toContain('students');
    expect(files['students']).toEqual([{ id: 'stu-old', name: '학생옛명렬' }]);
    // students만 해제 — seating은 남는다
    const after = files[YEAR_TRANSITION_REMOVED_KEY] as YearTransitionRemovedMarker;
    expect(after.keys).toEqual(['seating']);
  });

  it('마커에 마지막 키만 남았을 때 해제되면 마커 파일 자체를 지운다', async () => {
    const { useCase, files } = healScenario(AFTER_REMOVAL, {
      [YEAR_TRANSITION_REMOVED_KEY]: marker(['students']),
    });

    await useCase.execute();

    expect(files[YEAR_TRANSITION_REMOVED_KEY]).toBeUndefined();
  });

  it('revert 후(마커 없음)에는 기존 치유 다운로드가 정상 동작한다 (ADR-024 보존)', async () => {
    const { useCase, files } = healScenario(BEFORE_REMOVAL, {}); // 마커 없음

    const result = await useCase.execute();

    expect(result.downloaded).toContain('students');
    expect(files['students']).toEqual([{ id: 'stu-old', name: '학생옛명렬' }]);
  });

  it('마커에 없는 파일은 마커가 있어도 정상 치유된다(게이트는 remove 키에만)', async () => {
    const entry = { checksum: 'todos-v1', lastModified: BEFORE_REMOVAL, size: 50 };
    const remote = manifest({ todos: entry }, 'my-pc');
    const local = manifest({ todos: entry }, 'my-pc');
    const { storage, files } = makeStorage({
      [YEAR_TRANSITION_REMOVED_KEY]: marker(['students']),
    });
    const { port } = makeDrive(remote, { todos: JSON.stringify({ items: ['할 일'] }) });
    const useCase = new SyncFromCloud(
      storage,
      port,
      makeSyncRepo(local),
      'my-pc',
      '내 PC',
      'latest',
    );

    const result = await useCase.execute();

    expect(result.downloaded).toContain('todos');
    expect(files['todos']).toEqual({ items: ['할 일'] });
  });

  it('마커 손상(형식 불일치)은 마커 없음으로 취급한다(fail-open — 치유는 원래 보호 장치)', async () => {
    const { useCase, files } = healScenario(BEFORE_REMOVAL, {
      [YEAR_TRANSITION_REMOVED_KEY]: { broken: true },
    });

    const result = await useCase.execute();

    expect(result.downloaded).toContain('students');
    expect(files['students']).toEqual([{ id: 'stu-old', name: '학생옛명렬' }]);
  });
});
