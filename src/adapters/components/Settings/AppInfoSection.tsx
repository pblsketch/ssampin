import { useState, useEffect, useCallback, useRef } from 'react';

type UpdateCheckStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

interface UpdateInfo {
  version: string;
  releaseNotes?: string;
}

export function AppInfoSection() {
  const [status, setStatus] = useState<UpdateCheckStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isElectron = !!window.electronAPI;

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const cleanups: (() => void)[] = [];

    cleanups.push(api.onUpdateAvailable((info) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setUpdateInfo(info);
      setStatus('available');
    }));

    cleanups.push(api.onUpdateNotAvailable(() => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setStatus('not-available');
    }));

    cleanups.push(api.onUpdateDownloadProgress((p) => {
      setProgress(Math.round(p.percent));
      setStatus('downloading');
    }));

    cleanups.push(api.onUpdateDownloaded(() => {
      setStatus('downloaded');
    }));

    cleanups.push(api.onUpdateError((error) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setErrorMsg(error);
      setStatus('error');
    }));

    return () => {
      cleanups.forEach((fn) => fn());
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Auto-reset "not-available" to idle after 3 seconds
  useEffect(() => {
    if (status === 'not-available') {
      const id = setTimeout(() => setStatus('idle'), 3000);
      return () => clearTimeout(id);
    }
  }, [status]);

  const handleCheckUpdate = useCallback(() => {
    setStatus('checking');
    setErrorMsg('');
    window.electronAPI?.checkForUpdate();

    // 15-second timeout for silent network errors
    timeoutRef.current = setTimeout(() => {
      setStatus((prev) => {
        if (prev === 'checking') return 'error';
        return prev;
      });
      setErrorMsg('서버 응답 없음. 나중에 다시 시도해 주세요.');
    }, 15000);
  }, []);

  const handleDownload = useCallback(() => {
    setStatus('downloading');
    setProgress(0);
    window.electronAPI?.downloadUpdate();
  }, []);

  const handleInstall = useCallback(() => {
    window.electronAPI?.installUpdate();
  }, []);

  return (
    <section className="bg-sp-card rounded-xl ring-1 ring-sp-border p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
          <span className="material-symbols-outlined text-[22px]">info</span>
        </div>
        <h3 className="text-base font-bold text-sp-text">앱 정보</h3>
      </div>

      {/* Version info */}
      <div className="space-y-1 mb-5">
        <p className="text-sm font-semibold text-sp-text">쌤핀 (SsamPin)</p>
        <p className="text-xs text-sp-muted">버전 v{__APP_VERSION__}</p>
      </div>

      {/* Update section */}
      {!isElectron ? (
        <p className="text-xs text-sp-muted">
          브라우저 모드에서는 업데이트 확인을 사용할 수 없습니다.
        </p>
      ) : (
        <div className="space-y-3">
          {/* idle */}
          {status === 'idle' && (
            <button
              type="button"
              onClick={handleCheckUpdate}
              className="px-4 py-2 rounded-lg bg-sp-accent/10 text-sp-accent text-sm font-medium hover:bg-sp-accent/20 transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
              업데이트 확인
            </button>
          )}

          {/* checking */}
          {status === 'checking' && (
            <div className="flex items-center gap-2 text-sp-muted text-sm">
              <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
              확인 중...
            </div>
          )}

          {/* not-available */}
          {status === 'not-available' && (
            <div className="flex items-center gap-2 text-emerald-400 text-sm">
              <span className="material-symbols-outlined text-[18px]">check_circle</span>
              최신 버전입니다
            </div>
          )}

          {/* available */}
          {status === 'available' && updateInfo && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sp-highlight text-sm">
                <span className="material-symbols-outlined text-[18px]">new_releases</span>
                새 버전 v{updateInfo.version} 사용 가능
              </div>
              <button
                type="button"
                onClick={handleDownload}
                className="px-4 py-2 rounded-lg bg-sp-accent text-white text-sm font-medium hover:bg-sp-accent/90 transition-colors flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">download</span>
                다운로드
              </button>
            </div>
          )}

          {/* downloading */}
          {status === 'downloading' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-sp-muted">
                <span>다운로드 중...</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full h-2 bg-sp-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-sp-accent rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* downloaded */}
          {status === 'downloaded' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 text-sm">
                <span className="material-symbols-outlined text-[18px]">check_circle</span>
                업데이트가 준비되었습니다
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleInstall}
                  className="px-4 py-2 rounded-lg bg-sp-accent text-white text-sm font-medium hover:bg-sp-accent/90 transition-colors flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">restart_alt</span>
                  지금 재시작
                </button>
                <button
                  type="button"
                  onClick={() => setStatus('idle')}
                  className="px-4 py-2 rounded-lg text-sp-muted text-sm hover:bg-sp-text/5 transition-colors"
                >
                  나중에
                </button>
              </div>
            </div>
          )}

          {/* error */}
          {status === 'error' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <span className="material-symbols-outlined text-[18px]">error</span>
                {errorMsg || '업데이트 확인 중 오류가 발생했습니다.'}
              </div>
              <button
                type="button"
                onClick={handleCheckUpdate}
                className="px-4 py-2 rounded-lg bg-sp-accent/10 text-sp-accent text-sm font-medium hover:bg-sp-accent/20 transition-colors flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">refresh</span>
                다시 시도
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
