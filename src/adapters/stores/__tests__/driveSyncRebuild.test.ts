/**
 * rebuildCloudData — "클라우드 백업 다시 만들기" 오케스트레이션 계약.
 *
 * 장부(manifest)와 실제 Drive 파일이 어긋나면 SyncToCloud 가 일부러 멈춘다.
 * 그 상태는 재시도로 안 풀리고 클라우드를 다시 만들어야만 풀린다 —
 * 지우고(delete) 다시 올리기(upload) 두 단계다.
 *
 * 잠그는 결함:
 *  - 삭제가 실패했는데도 업로드를 계속해 어긋난 장부 위에 덧씌우는 것
 *    (사용자 눈에는 "복구했다"고 보이지만 다음 동기화에서 같은 오류가 되돌아온다)
 *  - 동기화가 도는 중에 겹쳐 실행되는 것
 *  - 복구에 성공했는데 오류 줄이 그대로 남는 것
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useDriveSyncStore } from '../useDriveSyncStore';

/** 실제 네트워크 액션을 스텁으로 갈아끼우고 호출 순서를 기록한다. */
function stubActions(options: { onDelete?: () => void; onSync?: () => void }): { calls: string[] } {
  const calls: string[] = [];
  useDriveSyncStore.setState({
    deleteCloudData: async () => {
      calls.push('delete');
      options.onDelete?.();
    },
    syncToCloud: async () => {
      calls.push('sync');
      options.onSync?.();
    },
  });
  return { calls };
}

describe('rebuildCloudData', () => {
  beforeEach(() => {
    useDriveSyncStore.setState({
      status: 'idle',
      error: null,
      progress: null,
      firstSyncRequired: false,
    });
  });

  it('지우기가 끝난 다음에 올린다 (순서 고정)', async () => {
    const { calls } = stubActions({
      onDelete: () => useDriveSyncStore.setState({ status: 'idle', error: null }),
      onSync: () => useDriveSyncStore.setState({ status: 'success' }),
    });

    await useDriveSyncStore.getState().rebuildCloudData();

    expect(calls).toEqual(['delete', 'sync']);
  });

  // ★ 이 파일에서 가장 중요한 단언.
  it('지우기가 실패하면 올리지 않고 멈춘다', async () => {
    const { calls } = stubActions({
      onDelete: () =>
        useDriveSyncStore.setState({
          status: 'error',
          error: '클라우드 데이터 삭제 중 오류가 발생했습니다.',
        }),
    });

    await useDriveSyncStore.getState().rebuildCloudData();

    expect(calls).toEqual(['delete']);
    expect(calls).not.toContain('sync');
  });

  it('지우기 실패 오류를 지우지 않고 그대로 남긴다', async () => {
    stubActions({
      onDelete: () => useDriveSyncStore.setState({ status: 'error', error: '삭제 실패' }),
    });

    await useDriveSyncStore.getState().rebuildCloudData();

    expect(useDriveSyncStore.getState().error).toBe('삭제 실패');
  });

  it('이미 동기화 중이면 아무것도 하지 않는다', async () => {
    useDriveSyncStore.setState({ status: 'syncing' });
    const { calls } = stubActions({});

    await useDriveSyncStore.getState().rebuildCloudData();

    expect(calls).toEqual([]);
  });

  // ★ 빈 클라우드로 끝나는 유일한 경로를 막는다.
  //   지우기는 성공하는데 뒤이은 업로드가 firstSyncRequired 가드에 조용히 막힌다.
  it('첫 동기화 방향을 정하기 전에는 아무것도 하지 않는다', async () => {
    useDriveSyncStore.setState({ firstSyncRequired: true });
    const { calls } = stubActions({});

    await useDriveSyncStore.getState().rebuildCloudData();

    expect(calls).toEqual([]);
  });

  it('복구에 성공하면 오류 상태로 남지 않는다', async () => {
    useDriveSyncStore.setState({
      status: 'error',
      error:
        '클라우드 events 파일과 동기화 장부가 일치하지 않습니다. 클라우드 데이터를 다시 구성해 주세요.',
    });
    stubActions({
      onDelete: () => useDriveSyncStore.setState({ status: 'idle', error: null }),
      onSync: () => useDriveSyncStore.setState({ status: 'success', error: null }),
    });

    await useDriveSyncStore.getState().rebuildCloudData();

    expect(useDriveSyncStore.getState().status).not.toBe('error');
    expect(useDriveSyncStore.getState().error).toBeNull();
  });
});
