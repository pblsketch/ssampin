/**
 * F7c 회귀 테스트 — 전환 마커의 전 다운로드 분기 게이트 (QA-A B1 계열 공격 표면 영구화).
 *
 * QA-A 재공격이 반증한 것들을 표면 기준으로 고정한다:
 *  - qa3-D: 치유 분기(장부 체크섬 동일+로컬 부재)가 자기 리모트 옛 사본을 부활시켰다.
 *  - RB1 우회①: conflict 분기(체크섬 상이)가 마커를 우회했다.
 *  - RB1 우회②: 장부 없는 첫 다운로드 분기가 마커를 우회했다.
 *  - RH2: removedAt vs modifiedTime 시각 비교는 시계 스큐로 뚫렸다 → **시각 비교 자체를 제거**,
 *    판정은 "마커 활성 여부"뿐. 해제는 (a) 로컬 실질 내용 (b) revert(마커 삭제)만.
 *  - F7b 효과: 첫 업로드가 빈 값을 리모트에 올려 정화 → 새 PC는 빈 값을 받는다(옛 명렬 아님).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncFromCloud } from '../SyncFromCloud';
import { SyncToCloud } from '../SyncToCloud';
import {
  YEAR_TRANSITION_REMOVED_KEY,
  type YearTransitionRemovedMarker,
} from '../../schoolYear/ExecuteYearTransition';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { IDriveSyncRepository } from '@domain/repositories/IDriveSyncRepository';
import type { DriveSyncManifest } from '@domain/entities/DriveSyncState';

const REMOVED_AT = '2026-08-06T00:00:00Z';
/** RH2 — 시계 스큐 모사: 리모트 modifiedTime이 removedAt보다 "미래"여도 게이트는 뚫리면 안 된다. */
const SKEWED_FUTURE = '2026-08-07T00:00:00Z';
const OLD_ROSTER = [{ id: 'stu-old', name: '학생옛명렬' }];

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
    uploadSyncFile: vi.fn(async () => ({ fileId: 'f', modifiedTime: SKEWED_FUTURE })),
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

interface ScenarioOptions {
  /** 로컬 장부의 students 체크섬(undefined = 장부 자체 없음 — 우회②). */
  readonly localChecksum?: string;
  readonly storageInit?: Record<string, unknown>;
}

/** students 공격 표면 공통 셋업 — 리모트에 옛 명렬, 리모트 modifiedTime은 시계 스큐(미래). */
function scenario({ localChecksum, storageInit = {} }: ScenarioOptions) {
  const remote = manifest(
    { students: { checksum: 'remote-v1', lastModified: SKEWED_FUTURE, size: 100 } },
    'other-pc',
  );
  const local =
    localChecksum === undefined
      ? null
      : manifest(
          { students: { checksum: localChecksum, lastModified: REMOVED_AT, size: 100 } },
          'my-pc',
        );
  const { storage, files } = makeStorage(storageInit);
  const { port } = makeDrive(remote, { students: JSON.stringify(OLD_ROSTER) });
  const useCase = new SyncFromCloud(storage, port, makeSyncRepo(local), 'my-pc', '내 PC', 'latest');
  return { useCase, files };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('F7c — 전환 마커의 전 다운로드 분기 게이트', () => {
  it('qa3-D(치유 분기): 장부 체크섬 동일+로컬 부재+마커 → 다운로드 0 (시계 스큐 무의미 — RH2)', async () => {
    const { useCase, files } = scenario({
      localChecksum: 'remote-v1', // 체크섬 동일 → 치유 분기
      storageInit: { [YEAR_TRANSITION_REMOVED_KEY]: marker(['students', 'seating']) },
    });

    const result = await useCase.execute();

    expect(result.downloaded).not.toContain('students');
    expect(result.skipped).toContain('students');
    expect(files['students']).toBeUndefined();
    // 리모트 modifiedTime(미래·스큐)과 무관하게 마커는 유지된다 — 시각 비교가 없다
    expect((files[YEAR_TRANSITION_REMOVED_KEY] as YearTransitionRemovedMarker).keys).toContain(
      'students',
    );
  });

  it('RB1 우회①(conflict 분기): 체크섬 상이+마커+로컬 빈 값 → 다운로드 0', async () => {
    const { useCase, files } = scenario({
      localChecksum: 'local-empty-v2', // 체크섬 상이 → conflict 분기(latest)
      storageInit: {
        students: [], // F7b 리셋 직후의 빈 값
        [YEAR_TRANSITION_REMOVED_KEY]: marker(['students']),
      },
    });

    const result = await useCase.execute();

    expect(result.downloaded).not.toContain('students');
    expect(files['students']).toEqual([]); // 옛 명렬로 덮이지 않는다
  });

  it('RB1 우회②(장부 없는 첫 다운로드): localManifest 없음+마커 → 다운로드 0', async () => {
    const { useCase, files } = scenario({
      localChecksum: undefined, // 장부 자체 없음 → 첫 다운로드 분기
      storageInit: {
        students: [],
        [YEAR_TRANSITION_REMOVED_KEY]: marker(['students']),
      },
    });

    const result = await useCase.execute();

    expect(result.downloaded).not.toContain('students');
    expect(files['students']).toEqual([]);
  });

  it('해제(a): 로컬 실질 내용 + 리모트 정화 확인(체크섬 일치) → 마커 해제·정상 동기화 재개', async () => {
    const { useCase, files } = scenario({
      localChecksum: 'remote-v1', // F8a: 리모트 == 내가 마지막으로 올린 것(정화 상태)
      storageInit: {
        students: [{ id: 'stu-new', name: '학생새명렬' }], // 사용자가 새로 입력
        [YEAR_TRANSITION_REMOVED_KEY]: marker(['students', 'seating']),
      },
    });

    await useCase.execute();

    // students만 해제 — seating은 남는다
    const after = files[YEAR_TRANSITION_REMOVED_KEY] as YearTransitionRemovedMarker;
    expect(after.keys).toEqual(['seating']);
  });

  it('해제 시 마지막 키였다면 마커 파일 자체를 지운다', async () => {
    const { useCase, files } = scenario({
      localChecksum: 'remote-v1', // 정화 상태
      storageInit: {
        students: [{ id: 'stu-new', name: '학생새명렬' }],
        [YEAR_TRANSITION_REMOVED_KEY]: marker(['students']),
      },
    });

    await useCase.execute();

    expect(files[YEAR_TRANSITION_REMOVED_KEY]).toBeUndefined();
  });

  it('F8a(RT2) 체인 재현: 리모트 되오염 상태에선 로컬 실질 내용이 있어도 해제하지 않는다', async () => {
    // B(미전환 기기)가 리모트를 옛 명렬로 되오염(remote-v1 ≠ 내 장부 my-upload-v2) →
    // A 사용자가 새 명렬 입력. 구 해제 조건(로컬 실질 내용만)이었다면 해제 직후 충돌 분기가
    // A의 새 명렬을 옛 명렬로 덮었다(QA 3차 재현). 강화 후: 마커 유지+스킵+새 명렬 보존.
    const newRoster = [{ id: 'stu-new', name: '학생새명렬' }];
    const { useCase, files } = scenario({
      localChecksum: 'my-upload-v2', // 리모트(remote-v1)와 불일치 = 되오염
      storageInit: {
        students: newRoster,
        [YEAR_TRANSITION_REMOVED_KEY]: marker(['students']),
      },
    });

    const result = await useCase.execute();

    expect(result.downloaded).not.toContain('students');
    expect(files['students']).toEqual(newRoster); // 새 명렬이 옛 명렬로 덮이지 않는다
    expect((files[YEAR_TRANSITION_REMOVED_KEY] as YearTransitionRemovedMarker).keys).toContain(
      'students',
    ); // 마커 유지 — 재정화는 업로드가 담당
  });

  it('revert 후(마커 없음)에는 기존 치유 다운로드가 정상 동작한다 (ADR-024 보존)', async () => {
    const { useCase, files } = scenario({ localChecksum: 'remote-v1', storageInit: {} });

    const result = await useCase.execute();

    expect(result.downloaded).toContain('students');
    expect(files['students']).toEqual(OLD_ROSTER);
  });

  it('마커에 없는 파일은 마커가 있어도 정상 치유된다(게이트는 guardDownloads 키에만)', async () => {
    const entry = { checksum: 'todos-v1', lastModified: REMOVED_AT, size: 50 };
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

  it('마커 손상(형식 불일치)은 마커 없음으로 취급한다(fail-open — 다운로드는 보호 장치)', async () => {
    const { useCase, files } = scenario({
      localChecksum: 'remote-v1',
      storageInit: { [YEAR_TRANSITION_REMOVED_KEY]: { broken: true } },
    });

    const result = await useCase.execute();

    expect(result.downloaded).toContain('students');
    expect(files['students']).toEqual(OLD_ROSTER);
  });

  it('F8a(RT2): 전환 마커 활성 키는 리모트가 변했어도 DEFER 없이 정화 업로드된다', async () => {
    // 마커가 다운로드를 봉쇄하는 동안 DEFER는 pull-merge-push 장부 갱신이 불가능해
    // 영구 교착이 된다 — 마커 키는 강제 업로드로 리모트를 정화해야 해제 조건이 성립한다.
    const localLedger = manifest(
      {
        students: { checksum: 'my-upload-v2', lastModified: REMOVED_AT, size: 10 },
        todos: { checksum: 'todos-old', lastModified: REMOVED_AT, size: 10 },
      },
      'my-pc',
    );
    const remoteLedger = manifest(
      {
        students: { checksum: 'poisoned-v9', lastModified: SKEWED_FUTURE, size: 100 }, // 되오염
        todos: { checksum: 'todos-new', lastModified: SKEWED_FUTURE, size: 100 }, // 타 기기 최신
      },
      'other-pc',
    );
    const { storage } = makeStorage({
      students: [{ id: 'stu-new', name: '학생새명렬' }],
      todos: { items: ['할 일'] },
      [YEAR_TRANSITION_REMOVED_KEY]: marker(['students']),
    });
    const { port } = makeDrive(remoteLedger);
    const useCase = new SyncToCloud(storage, port, makeSyncRepo(localLedger), 'my-pc', '내 PC');

    const result = await useCase.execute();

    expect(result.uploaded).toContain('students'); // 마커 키 = DEFER 예외(정화 업로드)
    expect(result.uploaded).not.toContain('todos'); // 비마커 키 = 기존 DEFER 유지
    expect(result.deferred).toContain('todos');
  });

  it('F7b 효과: 리모트가 빈 값으로 정화된 뒤 새 PC(마커 없음)는 빈 값을 받는다 — 옛 명렬 아님', async () => {
    // 전환 기기의 첫 업로드가 students=[]를 올린 상태. 새 PC: 장부·로컬 파일·마커 전부 없음.
    const remote = manifest(
      { students: { checksum: 'empty-v2', lastModified: SKEWED_FUTURE, size: 2 } },
      'transitioned-pc',
    );
    const { storage, files } = makeStorage();
    const { port } = makeDrive(remote, { students: '[]' });
    const useCase = new SyncFromCloud(
      storage,
      port,
      makeSyncRepo(null),
      'new-pc',
      '새 PC',
      'latest',
    );

    const result = await useCase.execute();

    expect(result.downloaded).toContain('students');
    expect(files['students']).toEqual([]); // 정화된 빈 값 — 옛 학년도 명렬이 아니다
  });
});
