import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IDriveSyncPort } from '@domain/ports/IDriveSyncPort';
import type { SyncProgress, SyncToCloudResult } from '@usecases/sync/SyncToCloud';
import { GoogleFetchTimeoutError } from '@infrastructure/google/fetchWithTimeout';
import { SYNC_STAGE_LABEL } from '../syncStage';

/**
 * "동기화 중 0%" 영구 정지 회귀 방지.
 *
 * 응답이 영영 오지 않는 동기화는 promise 가 끝나지도 실패하지도 않아 state 가 'syncing'
 * 에 갇혔고, 그 상태에서는 이후 모든 재시도가 조용히 무시돼 앱을 껐다 켜기 전까지
 * 동기화가 죽어 있었다(2026-08-28 신고).
 */
const h = vi.hoisted(() => ({
  execute: vi.fn<(onProgress?: (p: SyncProgress) => void) => Promise<SyncToCloudResult>>(),
  listSyncFiles: vi.fn<(folderId: string) => Promise<unknown[]>>(async () => []),
  capturedPort: { current: null as IDriveSyncPort | null },
}));

vi.mock('@mobile/di/container', () => ({
  getDriveSyncAdapter: () => ({
    getOrCreateSyncFolder: async () => ({ id: 'folder-1', name: '쌤핀 동기화' }),
    listSyncFiles: h.listSyncFiles,
  }),
  driveSyncRepository: {},
  storage: { read: async () => null, write: async () => undefined },
}));

vi.mock('@mobile/stores/useMobileSettingsStore', () => ({
  useMobileSettingsStore: {
    getState: () => ({
      loaded: true,
      settings: { teacherName: '테스트 선생님' },
      load: async () => undefined,
    }),
  },
}));

vi.mock('@usecases/sync/SyncToCloud', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@usecases/sync/SyncToCloud')>();
  return {
    ...actual,
    SyncToCloud: class {
      constructor(_storage: unknown, drivePort: IDriveSyncPort) {
        h.capturedPort.current = drivePort;
      }
      execute(onProgress?: (p: SyncProgress) => void): Promise<SyncToCloudResult> {
        return h.execute(onProgress);
      }
    },
  };
});

const { SYNC_WATCHDOG_MS, resetSyncWatchdogForTest, useMobileDriveSyncStore } =
  await import('../useMobileDriveSyncStore');

const okResult: SyncToCloudResult = {
  uploaded: [],
  skipped: [],
  deferred: [],
  binaryFailures: [],
};

/** 대기 중인 마이크로태스크를 흘려보낸다(가짜 타이머 환경). */
const settle = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

describe('동기화 워치독', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetSyncWatchdogForTest();
    h.execute.mockReset();
    h.listSyncFiles.mockReset();
    h.listSyncFiles.mockResolvedValue([]);
    useMobileDriveSyncStore.setState({
      state: 'idle',
      progress: 0,
      error: null,
      errorKind: null,
      conflict: null,
      syncStage: null,
    });
    useMobileDriveSyncStore.getState().setTokenGetter(async () => 'access-token');
  });

  afterEach(() => {
    resetSyncWatchdogForTest();
    vi.useRealTimers();
  });

  it('멈춘 동기화를 자동으로 풀고, 다음 시도는 성공한다', async () => {
    h.execute.mockImplementationOnce(() => new Promise<SyncToCloudResult>(() => undefined));

    void useMobileDriveSyncStore.getState().syncToCloud();
    await settle();
    expect(useMobileDriveSyncStore.getState().state).toBe('syncing');
    expect(useMobileDriveSyncStore.getState().progress).toBe(0);

    await vi.advanceTimersByTimeAsync(SYNC_WATCHDOG_MS);

    // 갇혀 있던 상태가 풀려 '다시 시도' 가 뜨는 오류로 바뀐다.
    expect(useMobileDriveSyncStore.getState().state).toBe('error');
    expect(useMobileDriveSyncStore.getState().errorKind).toBe('generic');

    // 그리고 실제로 다음 시도가 시작되어 끝까지 간다 — 예전에는 여기서 조용히 무시됐다.
    h.execute.mockResolvedValueOnce(okResult);
    await useMobileDriveSyncStore.getState().syncToCloud();

    expect(h.execute).toHaveBeenCalledTimes(2);
    expect(useMobileDriveSyncStore.getState().state).toBe('idle');
    expect(useMobileDriveSyncStore.getState().progress).toBe(100);
  });

  it('진행률이 오르는 동안에는 정상 동기화를 끊지 않는다', async () => {
    let report: ((p: SyncProgress) => void) | undefined;
    h.execute.mockImplementationOnce((onProgress) => {
      report = onProgress;
      return new Promise<SyncToCloudResult>(() => undefined);
    });

    void useMobileDriveSyncStore.getState().syncToCloud();
    await settle();

    // 한도 직전까지 갔다가 진행률을 보고하는 일을 세 번 반복 — 총 경과는 한도의 3배에 가깝다.
    for (let i = 1; i <= 3; i++) {
      await vi.advanceTimersByTimeAsync(SYNC_WATCHDOG_MS - 1_000);
      report?.({ current: i, total: 31, filename: 'events' });
      await settle();
    }

    expect(useMobileDriveSyncStore.getState().state).toBe('syncing');
    expect(useMobileDriveSyncStore.getState().progress).toBeGreaterThan(0);
  });

  it('뒤늦게 끝난 옛 동기화가 오류 안내를 덮어쓰지 않는다', async () => {
    let finishLate: ((result: SyncToCloudResult) => void) | undefined;
    h.execute.mockImplementationOnce(
      () =>
        new Promise<SyncToCloudResult>((resolve) => {
          finishLate = resolve;
        }),
    );

    void useMobileDriveSyncStore.getState().syncToCloud();
    await settle();
    await vi.advanceTimersByTimeAsync(SYNC_WATCHDOG_MS);

    const stalledMessage = useMobileDriveSyncStore.getState().error;
    expect(useMobileDriveSyncStore.getState().state).toBe('error');

    // 끊긴 요청은 취소가 안 된다. 몇 분 뒤 살아 돌아와도 상태를 되돌리면 안 된다.
    finishLate?.(okResult);
    await settle();

    expect(useMobileDriveSyncStore.getState().state).toBe('error');
    expect(useMobileDriveSyncStore.getState().error).toBe(stalledMessage);
    expect(useMobileDriveSyncStore.getState().progress).not.toBe(100);
  });

  it('어느 단계에서 멈췄는지 안내에 드러난다', async () => {
    h.listSyncFiles.mockImplementationOnce(() => new Promise<unknown[]>(() => undefined));
    h.execute.mockImplementationOnce(async () => {
      await h.capturedPort.current?.listSyncFiles('folder-1');
      return okResult;
    });

    void useMobileDriveSyncStore.getState().syncToCloud();
    await settle();
    expect(useMobileDriveSyncStore.getState().syncStage).toBe('list');

    await vi.advanceTimersByTimeAsync(SYNC_WATCHDOG_MS);

    expect(useMobileDriveSyncStore.getState().error).toContain(SYNC_STAGE_LABEL.list);
    expect(useMobileDriveSyncStore.getState().syncStage).toBeNull();
  });

  it('준비 구간에서 멈추면 설정 불러오기 단계로 남는다', async () => {
    // 지연 로딩(lazy import)·설정 읽기도 정지 후보다. 여기서 멈췄는데 '준비 중'으로만
    // 보이면 다음 재발 때 또 후보를 좁히지 못한다.
    h.execute.mockImplementationOnce(() => new Promise<SyncToCloudResult>(() => undefined));

    void useMobileDriveSyncStore.getState().syncToCloud();
    await settle();

    expect(useMobileDriveSyncStore.getState().syncStage).toBe('settings');

    await vi.advanceTimersByTimeAsync(SYNC_WATCHDOG_MS);
    expect(useMobileDriveSyncStore.getState().error).toContain(SYNC_STAGE_LABEL.settings);
  });

  it('버려진 옛 회차가 단계를 보고해도 현재 회차의 워치독을 연장하지 않는다', async () => {
    // dataOperationMutex 의 대기줄은 FIFO 무제한이라 워치독이 버린 회차도 줄에서 빠지지 않는다.
    // 앞이 풀리면 좀비들이 줄줄이 실행되는데, 그때 좀비의 보고가 시계를 밀어내면
    // 하필 워치독이 가장 필요한 순간에 무장 해제된다.
    h.execute.mockImplementationOnce(() => new Promise<SyncToCloudResult>(() => undefined));
    void useMobileDriveSyncStore.getState().syncToCloud();
    await settle();
    const zombiePort = h.capturedPort.current;

    await vi.advanceTimersByTimeAsync(SYNC_WATCHDOG_MS);
    expect(useMobileDriveSyncStore.getState().state).toBe('error');

    // 새 회차 B — 뮤텍스에 걸려 진전이 전혀 없는 상황.
    h.execute.mockImplementationOnce(() => new Promise<SyncToCloudResult>(() => undefined));
    void useMobileDriveSyncStore.getState().syncToCloud();
    await settle();
    expect(useMobileDriveSyncStore.getState().state).toBe('syncing');

    // 좀비가 중간에 단계를 보고한다. 시계가 밀린다면 한도가 지나도 안 끊긴다.
    await vi.advanceTimersByTimeAsync(SYNC_WATCHDOG_MS / 2);
    void zombiePort?.listSyncFiles('folder-1');
    await settle();
    expect(useMobileDriveSyncStore.getState().state).toBe('syncing');

    // 여기서 B 의 한도가 정확히 채워진다. 좀비 보고가 시계를 밀었다면 아직 'syncing' 이다.
    await vi.advanceTimersByTimeAsync(SYNC_WATCHDOG_MS / 2);

    expect(useMobileDriveSyncStore.getState().state).toBe('error');
  });

  it('좀비의 단계 보고가 현재 회차의 단계 표시를 덮어쓰지 않는다', async () => {
    h.execute.mockImplementationOnce(() => new Promise<SyncToCloudResult>(() => undefined));
    void useMobileDriveSyncStore.getState().syncToCloud();
    await settle();
    const zombiePort = h.capturedPort.current;
    await vi.advanceTimersByTimeAsync(SYNC_WATCHDOG_MS);

    h.execute.mockImplementationOnce(() => new Promise<SyncToCloudResult>(() => undefined));
    void useMobileDriveSyncStore.getState().syncToCloud();
    await settle();

    // 좀비가 뒤 단계를 찍어버리면, 이후 현재 회차가 실제로 멈춘 앞 단계가 기록되지 못한다.
    void zombiePort?.listSyncFiles('folder-1');
    await settle();

    expect(useMobileDriveSyncStore.getState().syncStage).toBe('settings');
  });

  it('제한시간 초과는 영문 주소 대신 우리말 안내로 보여준다', async () => {
    const timeoutError = new GoogleFetchTimeoutError(
      'https://www.googleapis.com/upload/drive/v3/files/1AbCdEfGhIjK',
      30_000,
    );
    h.execute.mockRejectedValueOnce(timeoutError);

    await useMobileDriveSyncStore.getState().syncToCloud();

    const shown = useMobileDriveSyncStore.getState().error ?? '';
    expect(useMobileDriveSyncStore.getState().state).toBe('error');
    expect(shown).toContain('인터넷이 느려');
    // 주소와 Drive 파일 ID 가 선생님 화면에 노출되면 안 된다.
    expect(shown).not.toContain('http');
    expect(shown).not.toContain('1AbCdEfGhIjK');
  });

  it('정상 종료 후에는 워치독 타이머가 남지 않는다', async () => {
    h.execute.mockResolvedValueOnce(okResult);

    await useMobileDriveSyncStore.getState().syncToCloud();

    expect(useMobileDriveSyncStore.getState().state).toBe('idle');
    expect(vi.getTimerCount()).toBe(0);
  });
});
