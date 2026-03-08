import { useState, useEffect, useCallback } from 'react';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { getChangelog } from './changelog';
import type { ChangelogEntry } from './changelog';

interface UpdateInfo {
  version: string;
  releaseNotes?: string;
}

type UpdateStatus = 'idle' | 'available' | 'downloading' | 'downloaded' | 'error';

type ChangeType = 'feat' | 'fix' | 'improve';

interface ChangeBadgeProps {
  type: ChangeType;
}

function ChangeBadge({ type }: ChangeBadgeProps) {
  const config: Record<ChangeType, { label: string; className: string; icon: string }> = {
    feat: {
      label: '새 기능',
      className: 'bg-sp-accent/15 text-sp-accent',
      icon: 'auto_awesome',
    },
    fix: {
      label: '수정',
      className: 'bg-emerald-500/15 text-emerald-400',
      icon: 'build',
    },
    improve: {
      label: '개선',
      className: 'bg-purple-500/15 text-purple-400',
      icon: 'trending_up',
    },
  };

  const { label, className, icon } = config[type];

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${className} shrink-0`}>
      <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>{icon}</span>
      {label}
    </span>
  );
}

export function UpdateNotification() {
  const { track } = useAnalytics();
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const cleanups: (() => void)[] = [];

    cleanups.push(api.onUpdateAvailable((updateInfo) => {
      setInfo(updateInfo);
      setStatus('available');
      setDismissed(false);
      setExpanded(false);
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
    track('update_installed', {
      from: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown',
      to: info?.version ?? 'unknown',
    });
    window.electronAPI?.installUpdate();
  }, [track, info]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  if (dismissed || status === 'idle') return null;

  const changelog: ChangelogEntry | undefined = info ? getChangelog(info.version) : undefined;

  return (
    <div className="fixed top-4 right-6 z-50 animate-slide-in-right">
      <div className="bg-sp-card border border-sp-border rounded-xl shadow-2xl min-w-[340px] max-w-[420px] overflow-hidden">

        {/* ── 업데이트 가능 ── */}
        {status === 'available' && info && (
          <div className="flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-sp-border/50">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sp-accent text-xl">system_update</span>
                <div>
                  <p className="text-sp-text text-sm font-semibold leading-tight">
                    새 버전 v{info.version} 업데이트
                  </p>
                  {changelog?.date && (
                    <p className="text-sp-muted text-[11px] leading-tight mt-0.5">{changelog.date}</p>
                  )}
                </div>
              </div>
              <button
                onClick={handleDismiss}
                className="text-sp-muted hover:text-sp-text transition-colors p-0.5 rounded"
                aria-label="닫기"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            {/* Highlights */}
            {changelog && changelog.highlights.length > 0 && (
              <div className="px-5 py-3 flex flex-col gap-1.5">
                {changelog.highlights.map((h, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-sp-highlight text-sm mt-0.5 shrink-0">
                      auto_awesome
                    </span>
                    <span className="text-sp-text text-xs leading-relaxed">{h}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Expand toggle */}
            {changelog && changelog.changes.length > 0 && (
              <div className="px-5 pb-2">
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="flex items-center gap-1 text-sp-muted hover:text-sp-text text-xs transition-colors"
                >
                  <span
                    className="material-symbols-outlined text-sm transition-transform duration-200"
                    style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  >
                    expand_more
                  </span>
                  {expanded ? '접기' : '자세히 보기'}
                </button>
              </div>
            )}

            {/* Expanded change list */}
            {expanded && changelog && (
              <div className="mx-4 mb-3 bg-sp-bg rounded-lg px-3 py-2.5 flex flex-col gap-2">
                {changelog.changes.map((c, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <ChangeBadge type={c.type} />
                    <span className="text-sp-muted text-xs leading-relaxed">{c.text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* No changelog fallback */}
            {!changelog && (
              <div className="px-5 py-3">
                <p className="text-sp-muted text-xs">새로운 버전이 준비되었습니다.</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-sp-border/50">
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 text-sm text-sp-muted hover:text-sp-text transition-colors rounded-lg"
              >
                나중에
              </button>
              <button
                onClick={handleDownload}
                className="px-3 py-1.5 text-sm bg-sp-accent text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
              >
                지금 업데이트
              </button>
            </div>
          </div>
        )}

        {/* ── 다운로드 중 ── */}
        {status === 'downloading' && (
          <div className="flex flex-col gap-3 px-5 py-4">
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

        {/* ── 다운로드 완료 ── */}
        {status === 'downloaded' && (
          <div className="flex flex-col gap-3 px-5 py-4">
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

        {/* ── 오류 ── */}
        {status === 'error' && (
          <div className="flex items-center gap-2 px-5 py-4">
            <span className="material-symbols-outlined text-red-500 text-xl">error</span>
            <span className="text-sp-text text-sm">업데이트 오류: {errorMsg}</span>
          </div>
        )}
      </div>
    </div>
  );
}
