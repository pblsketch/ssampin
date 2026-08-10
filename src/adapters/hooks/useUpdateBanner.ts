import { useCallback, useEffect, useState } from 'react';

/**
 * 위젯·아이콘 모드용 업데이트 배너 상태 (v2.3.7~).
 *
 * 배경: 새 버전 안내 모달(UpdateNotification)은 **메인 창에서만** 렌더된다. 그런데
 * 이 앱의 주 사용 형태는 위젯 모드이고, 메모리 절약 모드가 기본이라 위젯으로 전환하면
 * 메인 창이 아예 해제된다. 게다가 `autoUpdater.autoDownload = false`라 사용자가
 * 버튼을 눌러야만 내려받기가 시작된다. 그 결과 위젯·아이콘 모드로 상주하는 사용자는
 * 업데이트 안내를 볼 기회도, 시작할 방법도 없었다(2026-08-11 진단).
 *
 * 본 훅은 그 경로를 열어준다 — main의 update:* IPC를 그대로 구독하고,
 * 내려받기 시작/설치 트리거를 노출한다. 표시 방식(배너/팝오버 행)은 호출자가 정한다.
 *
 * macOS: main이 `manualOnly`를 함께 보낸다(Apple 서명이 없어 인앱 설치 불가).
 * 이때 `start()`는 브라우저로 칩에 맞는 DMG를 열어주는 IPC를 호출하고 'manual' 상태가 된다.
 */
export type UpdateBannerStatus =
  | 'idle'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'manual'
  | 'error';

export interface UpdateBannerState {
  readonly status: UpdateBannerStatus;
  /** 새 버전 문자열 (예: '2.3.7'). 아직 없으면 빈 문자열. */
  readonly version: string;
  /** 내려받기 진행률 0~100. */
  readonly percent: number;
  /** macOS 등 인앱 설치가 불가한 환경 여부. */
  readonly manualOnly: boolean;
  /** 내려받기 시작 (macOS면 브라우저로 DMG 열기). */
  readonly start: () => void;
  /** 내려받은 업데이트 설치 + 재시작. */
  readonly install: () => void;
}

export function useUpdateBanner(): UpdateBannerState {
  const [status, setStatus] = useState<UpdateBannerStatus>('idle');
  const [version, setVersion] = useState('');
  const [percent, setPercent] = useState(0);
  const [manualOnly, setManualOnly] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const cleanups: Array<() => void> = [];

    if (api.onUpdateAvailable) {
      cleanups.push(
        api.onUpdateAvailable((info) => {
          setVersion(info.version);
          setManualOnly(info.manualOnly === true);
          // 이미 내려받는 중/완료 상태를 같은 버전 재통지로 되돌리지 않는다.
          // (4시간 주기 재확인이 같은 버전을 다시 알려줄 수 있다.)
          setStatus((prev) => (prev === 'idle' || prev === 'error' ? 'available' : prev));
        }),
      );
    }

    if (api.onUpdateDownloadProgress) {
      cleanups.push(
        api.onUpdateDownloadProgress((progress) => {
          setPercent(Math.max(0, Math.min(100, Math.round(progress.percent))));
          setStatus((prev) => (prev === 'downloaded' ? prev : 'downloading'));
        }),
      );
    }

    if (api.onUpdateDownloaded) {
      cleanups.push(
        api.onUpdateDownloaded((info) => {
          if (info.version) setVersion(info.version);
          setPercent(100);
          setStatus('downloaded');
        }),
      );
    }

    if (api.onUpdateError) {
      cleanups.push(
        api.onUpdateError(() => {
          // 내려받는 도중 실패만 사용자에게 노출한다. 대기 상태의 백그라운드 오류는
          // 조용히 무시(네트워크 일시 장애로 배너가 깜빡이는 것을 막는다).
          setStatus((prev) => (prev === 'downloading' ? 'error' : prev));
        }),
      );
    }

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, []);

  const start = useCallback(() => {
    const api = window.electronAPI;
    if (!api?.downloadUpdate) return;
    if (manualOnly) {
      // main이 브라우저로 DMG를 열어준다 — 진행률이 오지 않으므로 안내 문구로 전환.
      setStatus('manual');
      void api.downloadUpdate();
      return;
    }
    setPercent(0);
    setStatus('downloading');
    void api.downloadUpdate();
  }, [manualOnly]);

  const install = useCallback(() => {
    void window.electronAPI?.installUpdate?.();
  }, []);

  return { status, version, percent, manualOnly, start, install };
}
