import { useState, useEffect, useCallback, useRef } from 'react';

type UpdateCheckStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

type ChangeType = 'new' | 'fix' | 'improve' | 'change';

interface UpdateInfo {
  version: string;
  releaseNotes?: string;
}

interface ChangeItem {
  type: ChangeType;
  title: string;
  description?: string;
}

interface VersionNote {
  version: string;
  date: string;
  highlights: string;
  changes: ChangeItem[];
}

interface ReleaseNotesData {
  versions: VersionNote[];
}

const CHANGE_TYPE_CONFIG: Record<ChangeType, { icon: string; label: string; badge: string }> = {
  new:     { icon: 'lightbulb',    label: '새 기능',   badge: 'bg-blue-500/20 text-blue-400' },
  fix:     { icon: 'build',        label: '버그 수정', badge: 'bg-green-500/20 text-green-400' },
  improve: { icon: 'auto_awesome', label: '개선',      badge: 'bg-purple-500/20 text-purple-400' },
  change:  { icon: 'sync',         label: '변경',      badge: 'bg-amber-500/20 text-amber-400' },
};

async function fetchReleaseNotes(version: string): Promise<VersionNote | null> {
  try {
    const res = await fetch(
      'https://raw.githubusercontent.com/pblsketch/ssampin/main/public/release-notes.json',
      { signal: AbortSignal.timeout(5000) },
    );
    if (res.ok) {
      const data: ReleaseNotesData = await res.json();
      const found = data.versions.find((v) => v.version === version);
      if (found) return found;
    }
  } catch {
    // GitHub fetch failed
  }

  try {
    const res = await fetch('/release-notes.json');
    if (res.ok) {
      const data: ReleaseNotesData = await res.json();
      return data.versions.find((v) => v.version === version) ?? null;
    }
  } catch {
    // local fallback also failed
  }

  return null;
}

export function AppInfoSection() {
  const [status, setStatus] = useState<UpdateCheckStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [releaseNote, setReleaseNote] = useState<VersionNote | null>(null);
  const [noteLoading, setNoteLoading] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      {!window.electronAPI ? (
        <p className="text-xs text-sp-muted">
          개발 모드에서는 업데이트 확인을 사용할 수 없습니다.
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="px-4 py-2 rounded-lg bg-sp-accent text-white text-sm font-medium hover:bg-sp-accent/90 transition-colors flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">download</span>
                  다운로드
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!showNotes && !releaseNote && !noteLoading) {
                      setNoteLoading(true);
                      fetchReleaseNotes(updateInfo.version).then((note) => {
                        setReleaseNote(note);
                        setNoteLoading(false);
                      });
                    }
                    setShowNotes((v) => !v);
                  }}
                  className="px-3 py-2 rounded-lg text-sp-muted text-sm hover:text-sp-text hover:bg-sp-text/5 transition-colors flex items-center gap-1"
                >
                  <span
                    className="material-symbols-outlined text-[16px] transition-transform duration-200"
                    style={{ transform: showNotes ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  >
                    expand_more
                  </span>
                  {showNotes ? '접기' : '자세히 보기'}
                </button>
              </div>
              {showNotes && (
                <div className="mt-2 bg-sp-surface rounded-lg p-3 space-y-2">
                  {noteLoading ? (
                    <div className="flex items-center gap-2 text-sp-muted text-xs">
                      <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                      변경사항 불러오는 중...
                    </div>
                  ) : releaseNote ? (
                    <>
                      {releaseNote.highlights && (
                        <p className="text-sp-text/80 text-xs leading-relaxed mb-2">{releaseNote.highlights}</p>
                      )}
                      {releaseNote.changes.map((c, i) => {
                        const cfg = CHANGE_TYPE_CONFIG[c.type];
                        return (
                          <div key={i} className="flex items-start gap-2">
                            {cfg && (
                              <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.badge} shrink-0`}>
                                <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>{cfg.icon}</span>
                                {cfg.label}
                              </span>
                            )}
                            <span className="text-sp-muted text-xs leading-relaxed">{c.title}</span>
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <p className="text-sp-muted text-xs">새로운 기능과 버그 수정이 포함되어 있습니다.</p>
                  )}
                </div>
              )}
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
