/**
 * resolveConflict — '동기화 충돌' 창의 두 단추가 실패했을 때.
 *
 * 신고(2026-10-23): "동기화 충돌 창에서 클라우드로 대체/이 기기 유지 어떤 걸 눌러도 동작이
 * 일어나지 않습니다." 원인은 세 겹이었다.
 *  ① 해결이 실패하면 store 가 error 만 적고 끝났는데, 충돌 창은 그 값을 보여 주지 않았다.
 *  ② "그 사이 자료가 바뀜"(StaleSyncConflictError)이어도 다시 비교하지 않아, 같은 옛 충돌을
 *     눌러 같은 실패를 되풀이했다(캘린더 동기화가 일정을 고쳐 쓰면 늘 이 상태다).
 *  ③ 닫기(X)는 resetStatus 를 불렀는데 그 액션은 conflicts 를 비우지 않아 창이 닫히지 않았다.
 * 휴대폰 쪽은 이미 다시 비교하도록 고쳐져 있었다 — PC 만 빠져 있었다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DriveSyncConflict } from '@domain/entities/DriveSyncState';

const execute = vi.fn();

vi.mock('@adapters/di/container', () => ({
  driveSyncRepository: {},
  getDriveSyncAdapter: () => ({}),
  authenticateGoogle: { getValidAccessToken: async () => 'token' },
  storage: {},
}));
vi.mock('../useSettingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      settings: { teacherName: '선생님', sync: { enabled: true, deviceId: 'this-pc' } },
    }),
  },
}));
vi.mock('@usecases/sync/ResolveSyncConflict', () => ({
  ResolveSyncConflict: class {
    execute = execute;
  },
}));
vi.mock('@adapters/hooks/useDriveSync', () => ({ reloadStores: vi.fn(async () => undefined) }));

import { useDriveSyncStore } from '../useDriveSyncStore';

const conflict: DriveSyncConflict = {
  filename: 'events',
  localModified: 'unknown',
  remoteModified: '2026-11-08T13:43:01.092Z',
  localDeviceName: '이 PC',
  remoteDeviceName: '이 PC',
  kind: 'json',
  baselineChecksum: null,
  localChecksum: 'local',
  remoteChecksum: 'remote',
};

function staleError(): Error {
  const err = new Error('클라우드 데이터가 다시 변경되었습니다. 최신 상태를 다시 확인합니다.');
  err.name = 'StaleSyncConflictError';
  return err;
}

describe('resolveConflict', () => {
  beforeEach(() => {
    execute.mockReset();
    useDriveSyncStore.setState({
      status: 'conflict',
      conflicts: [conflict],
      conflictError: null,
      resolvingConflict: null,
      error: null,
    });
  });

  it('성공하면 그 충돌을 목록에서 빼고, 다 풀리면 창이 닫힌다', async () => {
    execute.mockResolvedValue(undefined);

    await useDriveSyncStore.getState().resolveConflict(conflict, 'local');

    const state = useDriveSyncStore.getState();
    expect(state.conflicts).toEqual([]);
    expect(state.conflictError).toBeNull();
    expect(state.resolvingConflict).toBeNull();
  });

  // ★ 신고의 핵심 — 실패가 화면에 닿아야 한다.
  it('실패하면 충돌 창에 보여 줄 안내를 남긴다', async () => {
    execute.mockRejectedValue(new Error('클라우드 장부에 events 항목이 없습니다.'));

    await useDriveSyncStore.getState().resolveConflict(conflict, 'remote');

    const state = useDriveSyncStore.getState();
    expect(state.conflictError).toContain('처리하지 못했어요');
    expect(state.conflictError).toContain('클라우드 장부에 events 항목이 없습니다.');
    expect(state.conflicts).toEqual([conflict]); // 충돌은 그대로 — 다시 고를 수 있다
    expect(state.resolvingConflict).toBeNull();
  });

  it('고르는 사이 자료가 바뀌었으면 최신 상태로 다시 비교하고 다시 고르라고 알린다', async () => {
    execute.mockRejectedValue(staleError());
    const refreshed: DriveSyncConflict = { ...conflict, localChecksum: 'local-2' };
    const syncFromCloud = vi.fn(async () => {
      useDriveSyncStore.setState({ status: 'conflict', conflicts: [refreshed] });
      return { downloaded: [], conflicts: [refreshed] };
    });
    useDriveSyncStore.setState({ syncFromCloud });

    await useDriveSyncStore.getState().resolveConflict(conflict, 'local');

    expect(syncFromCloud).toHaveBeenCalledTimes(1);
    const state = useDriveSyncStore.getState();
    expect(state.conflicts).toEqual([refreshed]);
    expect(state.conflictError).toContain('다시 골라 주세요');
    expect(state.resolvingConflict).toBeNull();
  });

  it('다시 비교했더니 충돌이 사라졌으면 안내 없이 끝난다', async () => {
    execute.mockRejectedValue(staleError());
    useDriveSyncStore.setState({
      syncFromCloud: vi.fn(async () => {
        useDriveSyncStore.setState({ status: 'success', conflicts: [] });
        return { downloaded: [], conflicts: [] };
      }),
    });

    await useDriveSyncStore.getState().resolveConflict(conflict, 'local');

    const state = useDriveSyncStore.getState();
    expect(state.conflicts).toEqual([]);
    expect(state.conflictError).toBeNull();
  });

  it('처리 중에 한 번 더 눌러도 두 번 실행하지 않는다', async () => {
    let release: () => void = () => undefined;
    execute.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    const first = useDriveSyncStore.getState().resolveConflict(conflict, 'local');
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(useDriveSyncStore.getState().resolvingConflict).toBe('events');
    await useDriveSyncStore.getState().resolveConflict(conflict, 'remote');
    release();
    await first;

    expect(execute).toHaveBeenCalledTimes(1);
  });
});

describe('dismissConflicts', () => {
  it('닫기를 누르면 충돌 창이 실제로 닫힌다(충돌은 다음 동기화가 다시 찾는다)', () => {
    useDriveSyncStore.setState({
      status: 'conflict',
      conflicts: [conflict],
      conflictError: '안내',
    });

    useDriveSyncStore.getState().dismissConflicts();

    const state = useDriveSyncStore.getState();
    expect(state.conflicts).toEqual([]);
    expect(state.conflictError).toBeNull();
    expect(state.status).toBe('idle');
  });
});
