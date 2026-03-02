import { useState, useEffect, useCallback } from 'react';

interface UpdateInfo {
  version: string;
  releaseNotes?: string;
}

type UpdateStatus = 'idle' | 'available' | 'downloading' | 'downloaded' | 'error';

export function UpdateNotification() {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const cleanups: (() => void)[] = [];

    cleanups.push(api.onUpdateAvailable((updateInfo) => {
      setInfo(updateInfo);
      setStatus('available');
      setDismissed(false);
    }));

    cleanups.push(api.onUpdateDownloadProgress((p) => {
      setProgress(Math.round(p.percent));
      setStatus('downloading');
    }));

    cleanups.push(api.onUpdateDownloaded(() => {
      setStatus('downloaded');
    }));

    cleanups.push(api.onUpdateError((error) => {
      setErrorMsg(error);
      setStatus('error');
      setTimeout(() => {
        setStatus('idle');
        setDismissed(false);
      }, 5000);
    }));

    return () => { cleanups.forEach(fn => fn()); };
  }, []);

  const handleDownload = useCallback(() => {
    window.electronAPI?.downloadUpdate();
    setStatus('downloading');
    setProgress(0);
  }, []);

  const handleInstall = useCallback(() => {
    window.electronAPI?.installUpdate();
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  if (dismissed || status === 'idle') return null;

  return (
    <div className="fixed top-4 right-6 z-50 animate-slide-in-right">
      <div className="bg-sp-card border border-sp-border rounded-xl px-5 py-4 shadow-2xl min-w-[340px] max-w-[420px]">
        {status === 'available' && info && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sp-accent text-xl">system_update</span>
              <span className="text-sp-text text-sm font-medium">
                새 버전 v{info.version}이 있습니다
              </span>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 text-sm text-sp-muted hover:text-sp-text transition-colors rounded-lg"
              >
                나중에
              </button>
              <button
                onClick={handleDownload}
                className="px-3 py-1.5 text-sm bg-sp-accent text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                다운로드
              </button>
            </div>
          </div>
        )}

        {status === 'downloading' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sp-accent text-xl animate-spin">progress_activity</span>
              <span className="text-sp-text text-sm">업데이트 다운로드 중... {progress}%</span>
            </div>
            <div className="w-full bg-sp-bg rounded-full h-2">
              <div
                className="bg-sp-accent h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {status === 'downloaded' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-green-500 text-xl">check_circle</span>
              <span className="text-sp-text text-sm font-medium">
                업데이트가 준비되었습니다
              </span>
            </div>
            <p className="text-sp-muted text-xs">지금 재시작하시겠습니까?</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 text-sm text-sp-muted hover:text-sp-text transition-colors rounded-lg"
              >
                나중에
              </button>
              <button
                onClick={handleInstall}
                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                지금 재시작
              </button>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-red-500 text-xl">error</span>
            <span className="text-sp-text text-sm">업데이트 오류: {errorMsg}</span>
          </div>
        )}
      </div>
    </div>
  );
}
