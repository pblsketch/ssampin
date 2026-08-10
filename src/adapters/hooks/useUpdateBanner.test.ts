// @vitest-environment jsdom
/**
 * useUpdateBanner — 위젯·아이콘 모드 업데이트 배너 상태 회귀 테스트.
 *
 * 배경(2026-08-11 진단): 새 버전 안내가 메인 창에만 있어 위젯·아이콘 모드로 상주하는
 * 사용자는 업데이트를 시작할 방법이 없었다. 이 훅이 그 진입점이므로,
 * 상태 전이(특히 "이미 내려받은 뒤 같은 버전 재통지" 회귀)를 고정한다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUpdateBanner } from './useUpdateBanner';

type AvailableCb = (info: { version: string; manualOnly?: boolean }) => void;
type ProgressCb = (p: { percent: number }) => void;
type DownloadedCb = (info: { version: string }) => void;
type ErrorCb = (message: string) => void;

interface Harness {
  emitAvailable: AvailableCb;
  emitProgress: ProgressCb;
  emitDownloaded: DownloadedCb;
  emitError: ErrorCb;
  downloadUpdate: ReturnType<typeof vi.fn>;
  installUpdate: ReturnType<typeof vi.fn>;
}

function installFakeElectronApi(): Harness {
  const cbs: {
    available?: AvailableCb;
    progress?: ProgressCb;
    downloaded?: DownloadedCb;
    error?: ErrorCb;
  } = {};
  const downloadUpdate = vi.fn(() => Promise.resolve());
  const installUpdate = vi.fn(() => Promise.resolve());

  (window as unknown as { electronAPI: unknown }).electronAPI = {
    onUpdateAvailable: (cb: AvailableCb) => {
      cbs.available = cb;
      return () => {
        delete cbs.available;
      };
    },
    onUpdateDownloadProgress: (cb: ProgressCb) => {
      cbs.progress = cb;
      return () => {
        delete cbs.progress;
      };
    },
    onUpdateDownloaded: (cb: DownloadedCb) => {
      cbs.downloaded = cb;
      return () => {
        delete cbs.downloaded;
      };
    },
    onUpdateError: (cb: ErrorCb) => {
      cbs.error = cb;
      return () => {
        delete cbs.error;
      };
    },
    downloadUpdate,
    installUpdate,
  };

  return {
    emitAvailable: (info) => cbs.available?.(info),
    emitProgress: (p) => cbs.progress?.(p),
    emitDownloaded: (info) => cbs.downloaded?.(info),
    emitError: (message) => cbs.error?.(message),
    downloadUpdate,
    installUpdate,
  };
}

describe('useUpdateBanner', () => {
  let api: Harness;

  beforeEach(() => {
    api = installFakeElectronApi();
  });

  afterEach(() => {
    delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  });

  it('새 버전 통지를 받으면 available 상태가 된다', () => {
    const { result } = renderHook(() => useUpdateBanner());
    expect(result.current.status).toBe('idle');

    act(() => api.emitAvailable({ version: '2.3.7' }));

    expect(result.current.status).toBe('available');
    expect(result.current.version).toBe('2.3.7');
  });

  it('start()가 내려받기를 시작하고 진행률을 반영한다', () => {
    const { result } = renderHook(() => useUpdateBanner());
    act(() => api.emitAvailable({ version: '2.3.7' }));

    act(() => result.current.start());
    expect(api.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('downloading');

    act(() => api.emitProgress({ percent: 42.6 }));
    expect(result.current.percent).toBe(43);
  });

  it('내려받기가 끝나면 install()로 설치를 요청한다', () => {
    const { result } = renderHook(() => useUpdateBanner());
    act(() => api.emitAvailable({ version: '2.3.7' }));
    act(() => api.emitDownloaded({ version: '2.3.7' }));

    expect(result.current.status).toBe('downloaded');
    expect(result.current.percent).toBe(100);

    act(() => result.current.install());
    expect(api.installUpdate).toHaveBeenCalledTimes(1);
  });

  it('내려받은 뒤 같은 버전이 다시 통지돼도 준비 완료 상태를 유지한다(4시간 주기 재확인)', () => {
    const { result } = renderHook(() => useUpdateBanner());
    act(() => api.emitAvailable({ version: '2.3.7' }));
    act(() => api.emitDownloaded({ version: '2.3.7' }));

    act(() => api.emitAvailable({ version: '2.3.7' }));

    expect(result.current.status).toBe('downloaded');
  });

  it('macOS(manualOnly)에서는 start()가 수동 설치 안내 상태로 간다', () => {
    const { result } = renderHook(() => useUpdateBanner());
    act(() => api.emitAvailable({ version: '2.3.7', manualOnly: true }));

    act(() => result.current.start());

    expect(api.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('manual');
  });

  it('대기 중 백그라운드 오류는 무시하고, 내려받는 중 오류만 노출한다', () => {
    const { result } = renderHook(() => useUpdateBanner());
    act(() => api.emitAvailable({ version: '2.3.7' }));

    act(() => api.emitError('net::ERR_CONNECTION_RESET'));
    expect(result.current.status).toBe('available');

    act(() => result.current.start());
    act(() => api.emitError('download failed'));
    expect(result.current.status).toBe('error');
  });
});
