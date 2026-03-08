import { useState, useEffect, useCallback } from 'react';
import { useAnalytics } from '@adapters/hooks/useAnalytics';

interface UpdateInfo {
  version: string;
  releaseNotes?: string;
}

type UpdateStatus = 'idle' | 'available' | 'downloading' | 'downloaded' | 'error';

type ChangeType = 'new' | 'fix' | 'improve' | 'change';

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

function ChangeBadge({ type }: { type: ChangeType }) {
  const config = CHANGE_TYPE_CONFIG[type];
  if (!config) return null;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${config.badge} shrink-0`}>
      <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>{config.icon}</span>
      {config.label}
    </span>
  );
}

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
    // GitHub fetch failed — try local fallback
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

export function UpdateNotification() {
  const { track } = useAnalytics();
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [releaseNote, setReleaseNote] = useState<VersionNote | null>(null);
  const [noteLoading, setNoteLoading] = useState(false);

  // Electron update events
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

    return () => { cleanups.forEach((fn) => fn()); };
  }, []);

  // Fetch release notes when update is available
  useEffect(() => {
    if (!info?.version) return;
    let cancelled = false;
    setNoteLoading(true);

    fetchReleaseNotes(info.version).then((note) => {
      if (!cancelled) {
        setReleaseNote(note);
        setNoteLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [info?.version]);

  const handleDownload = useCallback(() => {
    window.electronAPI?.downloadUpdate();
    setStatus('downloading');
    setProgress(0);
  }, []);

  const handleInstall = useCallback(() => {
    track('update_installed', {
      from: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown',
      to: info?.version ?? 'unknown',
    });
    window.electronAPI?.installUpdate();
  }, [track, info]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      setDismissed(true);
    }
  }, []);

  if (dismissed || status === 'idle') return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div className="bg-sp-card border border-sp-border rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-scale-in">

        {/* ── 업데이트 가능 ── */}
        {status === 'available' && info && (
          <div className="flex flex-col">
            {/* Header */}
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl">🎉</span>
                  <div>
                    <h2 className="text-sp-text text-base font-bold leading-tight">
                      쌤핀 v{info.version} 업데이트
                    </h2>
                    {releaseNote?.date && (
                      <p className="text-sp-muted text-xs mt-0.5">{releaseNote.date}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleDismiss}
                  className="text-sp-muted hover:text-sp-text transition-colors p-1 rounded-lg hover:bg-sp-surface"
                  aria-label="닫기"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>

              {/* Highlights */}
              {releaseNote?.highlights && (
                <p className="text-sp-text/80 text-sm leading-relaxed">
                  {releaseNote.highlights}
                </p>
              )}
            </div>

            {/* Change list */}
            {noteLoading ? (
              <div className="px-6 pb-4">
                <div className="flex items-center gap-2 text-sp-muted text-xs">
                  <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                  변경사항 불러오는 중...
                </div>
              </div>
            ) : releaseNote && releaseNote.changes.length > 0 ? (
              <div className="px-6 pb-4">
                <p className="text-sp-muted text-xs font-medium mb-3">이런 점이 바뀌었어요!</p>
                <div className="space-y-2.5">
                  {releaseNote.changes.map((c, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <ChangeBadge type={c.type} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sp-text text-sm leading-snug">{c.title}</p>
                        {c.description && (
                          <p className="text-sp-muted text-xs leading-relaxed mt-0.5">{c.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="px-6 pb-4">
                <p className="text-sp-muted text-sm">
                  새로운 기능과 버그 수정이 포함되어 있습니다.
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-sp-border/50">
              <button
                onClick={handleDismiss}
                className="px-4 py-2 text-sm text-sp-muted hover:text-sp-text transition-colors rounded-lg hover:bg-sp-surface"
              >
                나중에
              </button>
              <button
                onClick={handleDownload}
                className="px-4 py-2 text-sm bg-sp-accent text-white rounded-lg hover:bg-blue-600 transition-colors font-medium flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base">rocket_launch</span>
                지금 업데이트
              </button>
            </div>
          </div>
        )}

        {/* ── 다운로드 중 ── */}
        {status === 'downloading' && (
          <div className="flex flex-col gap-3 px-6 py-5">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-sp-accent text-xl animate-spin">progress_activity</span>
              <span className="text-sp-text text-sm font-medium">다운로드 중... {progress}%</span>
            </div>
            <div className="w-full bg-sp-bg rounded-full h-2 overflow-hidden">
              <div
                className="bg-sp-accent h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* ── 다운로드 완료 ── */}
        {status === 'downloaded' && (
          <div className="flex flex-col gap-4 px-6 py-5">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-green-400 text-2xl">check_circle</span>
              <div>
                <p className="text-sp-text text-sm font-bold">업데이트 준비 완료!</p>
                <p className="text-sp-muted text-xs mt-0.5">재시작하면 새 버전이 적용됩니다.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2.5">
              <button
                onClick={handleDismiss}
                className="px-4 py-2 text-sm text-sp-muted hover:text-sp-text transition-colors rounded-lg hover:bg-sp-surface"
              >
                나중에
              </button>
              <button
                onClick={handleInstall}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base">restart_alt</span>
                지금 재시작
              </button>
            </div>
          </div>
        )}

        {/* ── 오류 ── */}
        {status === 'error' && (
          <div className="flex items-center gap-2.5 px-6 py-5">
            <span className="material-symbols-outlined text-red-500 text-xl">error</span>
            <span className="text-sp-text text-sm">업데이트 오류: {errorMsg}</span>
          </div>
        )}
      </div>
    </div>
  );
}
