import { describe, expect, it, vi } from 'vitest';
import type { DriveSyncConflict } from '@domain/entities/DriveSyncState';
import {
  canStartMobileConflictResolution,
  canStartMobileUpload,
  firstMobileConflict,
  useMobileDriveSyncStore,
} from '../useMobileDriveSyncStore';

const conflict: DriveSyncConflict = {
  filename: 'events',
  localModified: 'content-mismatch',
  remoteModified: '2026-07-30T03:54:24.657Z',
  localDeviceName: '현재 폰',
  remoteDeviceName: '예전 폰',
};

describe('모바일 동기화 충돌 상태', () => {
  it('다운로드 결과의 첫 충돌을 모바일 선택 UI에 전달한다', () => {
    expect(firstMobileConflict([conflict])).toEqual(conflict);
    expect(firstMobileConflict([])).toBeNull();
  });

  it('충돌 해결 중에는 반대 선택을 동시에 시작하지 않는다', () => {
    expect(canStartMobileConflictResolution('idle', conflict)).toBe(true);
    expect(canStartMobileConflictResolution('conflict', conflict)).toBe(true);
    expect(canStartMobileConflictResolution('error', conflict)).toBe(true);
    expect(canStartMobileConflictResolution('syncing', conflict)).toBe(false);
    expect(canStartMobileConflictResolution('idle', null)).toBe(false);
  });

  it('사용자가 로컬/클라우드를 선택하기 전에는 자동 업로드를 막는다', () => {
    expect(canStartMobileUpload('conflict', conflict)).toBe(false);
    expect(canStartMobileUpload('syncing', null)).toBe(false);
    expect(canStartMobileUpload('error', conflict)).toBe(false);
    expect(canStartMobileUpload('idle', conflict)).toBe(false);
    expect(canStartMobileUpload('idle', null)).toBe(true);
    expect(canStartMobileUpload('error', null)).toBe(true);
  });

  it('일괄 복구는 남은 충돌을 순서대로 처리하고 동일 파일이 재발하면 중단한다', async () => {
    const nextConflict = {
      ...conflict,
      filename: 'todos',
      remoteModified: '2026-08-08T12:00:00Z',
    };
    const resolveConflict = vi
      .fn<(choice: 'local' | 'remote') => Promise<void>>()
      .mockImplementationOnce(async () => {
        useMobileDriveSyncStore.setState({ state: 'conflict', conflict: nextConflict });
      })
      .mockImplementationOnce(async () => {
        useMobileDriveSyncStore.setState({ state: 'conflict', conflict });
      });

    useMobileDriveSyncStore.setState({
      state: 'conflict',
      conflict,
      resolveConflict,
      lastSyncResult: {
        direction: 'download',
        timestamp: '2026-08-08T11:00:00Z',
        downloaded: [],
        skipped: [],
        conflicts: ['events', 'todos'],
      },
    });

    const onProgress = vi.fn();
    await useMobileDriveSyncStore.getState().resolveAllConflictsFromCloud(onProgress);

    expect(resolveConflict).toHaveBeenCalledTimes(2);
    expect(resolveConflict).toHaveBeenNthCalledWith(1, 'remote');
    expect(resolveConflict).toHaveBeenNthCalledWith(2, 'remote');
    expect(onProgress).toHaveBeenNthCalledWith(1, 1);
    expect(onProgress).toHaveBeenNthCalledWith(2, 2);
    expect(useMobileDriveSyncStore.getState().conflict?.filename).toBe('events');
  });

  it('일괄 복구가 동시에 두 번 호출돼도 resolver는 한 번만 실행한다', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const resolveConflict = vi.fn(async () => {
      await gate;
      useMobileDriveSyncStore.setState({ state: 'idle', conflict: null });
    });
    useMobileDriveSyncStore.setState({ state: 'conflict', conflict, resolveConflict });

    const first = useMobileDriveSyncStore.getState().resolveAllConflictsFromCloud();
    const second = useMobileDriveSyncStore.getState().resolveAllConflictsFromCloud();
    expect(resolveConflict).toHaveBeenCalledTimes(1);

    release();
    await Promise.all([first, second]);
    expect(resolveConflict).toHaveBeenCalledTimes(1);
  });
});
