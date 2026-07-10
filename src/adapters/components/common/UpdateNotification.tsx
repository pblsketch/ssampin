import { useState, useEffect, useCallback } from 'react';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { Modal } from '@adapters/components/common/Modal';
import { DescriptionRenderer, InlineMarkup } from '@adapters/components/common/DescriptionRenderer';
import { LaterDropdown } from '@adapters/components/common/LaterDropdown';
import {
  useUpdatePreferencesStore,
  shouldShowUpdateModal,
} from '@adapters/stores/useUpdatePreferencesStore';
import { useRegisterModal } from '@adapters/hooks/useRegisterModal';
import { handleExternalLinkClick } from '@adapters/utils/openExternalUrl';

const GUIDE_URL = 'https://www.ssampin.com/docs';
const FEEDBACK_FORM_URL = 'https://forms.gle/o1X4zLYocUpFKCzy7';

interface UpdateInfo {
  version: string;
  releaseNotes?: string;
  /** macOS(베타 지원): 인앱 자동 설치 불가 — 브라우저 다운로드 후 수동 설치 안내로 전환 */
  manualOnly?: boolean;
}

type UpdateStatus = 'idle' | 'available' | 'downloading' | 'downloaded' | 'manual' | 'error';

type ChangeType = 'new' | 'fix' | 'improve' | 'change';

interface ChangeItem {
  type: ChangeType;
  title: string;
  description?: string;
  /** 옵션: 사용 가이드 deep link. 있을 때 [자세히 보기] 인라인 링크 노출. */
  notionUrl?: string;
}

interface VersionNote {
  version: string;
  date: string;
  highlights: string[];
  changes: ChangeItem[];
  /** 보안 업데이트 — true 시 모든 게이트 우회 + 건너뛰기 메뉴 숨김 + 🔒 헤더 변형. */
  isSecurity?: boolean;
}

interface ReleaseNotesData {
  versions: VersionNote[];
}

const CHANGE_TYPE_CONFIG: Record<ChangeType, { icon: string; label: string; badge: string }> = {
  new: { icon: 'lightbulb', label: '새 기능', badge: 'bg-sp-accent/20 text-sp-accent' },
  fix: { icon: 'build', label: '버그 수정', badge: 'bg-emerald-500/15 text-emerald-400' },
  improve: { icon: 'auto_awesome', label: '개선', badge: 'bg-purple-500/15 text-purple-400' },
  change: { icon: 'sync', label: '변경', badge: 'bg-sp-highlight/15 text-sp-highlight' },
};

function ChangeBadge({ type }: { type: ChangeType }) {
  const config = CHANGE_TYPE_CONFIG[type];
  if (!config) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-detail font-medium ${config.badge} shrink-0`}
    >
      <span className="material-symbols-outlined text-icon-sm">{config.icon}</span>
      {config.label}
    </span>
  );
}

async function fetchReleaseNotesSince(
  currentVersion: string,
  targetVersion: string,
): Promise<VersionNote[]> {
  const fetchData = async (): Promise<ReleaseNotesData | null> => {
    try {
      const res = await fetch(
        'https://raw.githubusercontent.com/pblsketch/ssampin/main/public/release-notes.json',
        { signal: AbortSignal.timeout(5000) },
      );
      if (res.ok) return await res.json();
    } catch {
      // GitHub fetch failed
    }
    try {
      const res = await fetch('/release-notes.json');
      if (res.ok) return await res.json();
    } catch {
      // local fallback also failed
    }
    return null;
  };

  const data = await fetchData();
  if (!data) return [];

  const compare = (a: string, b: string) => {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
    }
    return 0;
  };

  return data.versions
    .filter((v) => compare(v.version, currentVersion) > 0 && compare(v.version, targetVersion) <= 0)
    .sort((a, b) => compare(b.version, a.version));
}

export function UpdateNotification() {
  const { track } = useAnalytics();
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSecurity, setIsSecurity] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState<VersionNote[]>([]);
  const [noteLoading, setNoteLoading] = useState(false);
  const [, setUserInitiatedDownload] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);

  // Electron update events
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const cleanups: (() => void)[] = [];

    cleanups.push(
      api.onUpdateAvailable(async (updateInfo) => {
        setInfo(updateInfo);

        // release-notes.json 조회 — isSecurity 결정 + 게이트 판정
        const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
        const notes = await fetchReleaseNotesSince(currentVersion, updateInfo.version);
        // fetch 실패(빈 배열)는 보수적으로 보안 업데이트로 간주 (사용자 보호)
        const security = notes.length === 0 ? true : (notes[0]?.isSecurity ?? false);
        setIsSecurity(security);

        const shouldShow = shouldShowUpdateModal(
          updateInfo.version,
          security,
          useUpdatePreferencesStore.getState(),
        );

        if (shouldShow) {
          useUpdatePreferencesStore.getState().markNotified(updateInfo.version);
          setStatus('available');
        } else {
          // 모달 안 띄움 — 사이드바 배지가 폴백
          setStatus('idle');
        }
      }),
    );

    cleanups.push(
      api.onUpdateDownloadProgress((p) => {
        setProgress(Math.round(p.percent));
        // 사용자가 다운로드를 명시적으로 클릭한 경우에만 downloading 상태로 전환
        setUserInitiatedDownload((initiated) => {
          if (initiated) setStatus('downloading');
          return initiated;
        });
      }),
    );

    cleanups.push(
      api.onUpdateDownloaded(() => {
        // 사용자가 다운로드를 시작한 경우에만 downloaded 상태로 전환
        setUserInitiatedDownload((initiated) => {
          if (initiated) setStatus('downloaded');
          return initiated;
        });
      }),
    );

    cleanups.push(
      api.onUpdateError((error) => {
        setErrorMsg(error);
        setStatus('error');
        setTimeout(() => {
          setStatus('idle');
        }, 5000);
      }),
    );

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, []);

  // 사이드바 배지 클릭 → 모달 강제 재노출
  useEffect(() => {
    const handler = () => {
      if (info) {
        setStatus('available');
      }
    };
    window.addEventListener('ssampin:show-update-modal', handler);
    return () => window.removeEventListener('ssampin:show-update-modal', handler);
  }, [info]);

  // Fetch release notes when update is available
  useEffect(() => {
    if (!info?.version) return;
    let cancelled = false;
    setNoteLoading(true);

    const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
    fetchReleaseNotesSince(currentVersion, info.version).then((notes) => {
      if (!cancelled) {
        setReleaseNotes(notes);
        setNoteLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [info?.version]);

  const handleDownload = useCallback(() => {
    if (info?.manualOnly) {
      // macOS: 본체가 칩에 맞는 DMG를 브라우저로 열어준다 — 진행바 대신 수동 설치 안내
      window.electronAPI?.downloadUpdate();
      setStatus('manual');
      return;
    }
    setUserInitiatedDownload(true);
    setStatus('downloading');
    setProgress(0);
    window.electronAPI?.downloadUpdate();
  }, [info?.manualOnly]);

  const handleInstall = useCallback(() => {
    track('update_installed', {
      from: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown',
      to: info?.version ?? 'unknown',
    });
    window.electronAPI?.installUpdate();
  }, [track, info]);

  // X 버튼 / 백드롭 클릭 / ESC — 보안이면 1일, 일반이면 3일 스누즈
  const handleDismiss = useCallback(() => {
    useUpdatePreferencesStore.getState().snooze(isSecurity ? 1 : 3);
    setStatus('idle');
  }, [isSecurity]);

  const handleSnooze1d = useCallback(() => {
    useUpdatePreferencesStore.getState().snooze(1);
    setStatus('idle');
  }, []);

  const handleSnooze3d = useCallback(() => {
    useUpdatePreferencesStore.getState().snooze(3);
    setStatus('idle');
  }, []);

  const handleSkip = useCallback(() => {
    if (info?.version) {
      useUpdatePreferencesStore.getState().skip(info.version);
    }
    setStatus('idle');
  }, [info?.version]);

  // Phase 3: ModalCoordinator 큐 등록 — priority가 동적이므로 두 hook 호출 (XOR active)
  // SECURITY_UPDATE (priority 0)와 NORMAL_UPDATE (priority 4) 중 하나만 active.
  // hook 두 번 호출은 React rules of hooks 준수 (고정 순서).
  const isSecHead = useRegisterModal('SECURITY_UPDATE', isSecurity && status !== 'idle');
  const isNormalHead = useRegisterModal('NORMAL_UPDATE', !isSecurity && status !== 'idle');
  const isHead = isSecHead || isNormalHead;

  if (status === 'idle' || !isHead) return null;

  const isOpen = true; // status === 'idle' 일 때 위에서 일찍 반환됨
  const isDownloading = status === 'downloading';
  const totalChanges = releaseNotes.reduce((n, v) => n + v.changes.length, 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleDismiss}
      title={`쌤핀 v${info?.version ?? ''} 업데이트 안내`}
      srOnlyTitle
      size="sm"
      closeOnEsc={!isDownloading}
      closeOnBackdrop={!isDownloading}
      panelClassName={status === 'available' && changesOpen ? 'h-[min(86vh,760px)]' : ''}
    >
      {/* ── 업데이트 가능 ── */}
      {status === 'available' && info && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Header */}
          <div className="px-6 pt-6 pb-3 flex items-start justify-between gap-3 shrink-0">
            <div>
              {isSecurity ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-400" aria-hidden="true">
                      lock
                    </span>
                    <h3 className="text-sp-text text-base font-bold leading-tight">
                      보안 업데이트 — v{info.version}
                    </h3>
                  </div>
                  <p className="text-amber-300/80 text-xs mt-1 leading-relaxed">
                    이 업데이트는 보안 패치를 포함하고 있어 건너뛸 수 없어요. 가능한 한 빠른
                    업데이트를 권장해요.
                  </p>
                </>
              ) : (
                <h3 className="text-sp-text text-base font-bold leading-tight">
                  쌤핀이 v{info.version}로 업데이트됐어요
                </h3>
              )}
              {!isSecurity && releaseNotes[0]?.date && (
                <p className="text-sp-muted text-xs mt-0.5">{releaseNotes[0].date}</p>
              )}
            </div>
            <button
              onClick={handleDismiss}
              className="text-sp-muted hover:text-sp-text transition-colors p-1 rounded-lg hover:bg-sp-surface shrink-0 -mt-1 -mr-1"
              aria-label="닫기"
            >
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                close
              </span>
            </button>
          </div>

          {/* Highlights — 4슬롯 가이드(v2.0.4)에 맞춰 배열 풀 노출.
              변경 내역을 펼치면 요약 영역을 압축(스크롤)해 아래 패널에 높이를 양보 */}
          {releaseNotes[0]?.highlights && releaseNotes[0].highlights.length > 0 && (
            <div
              className={[
                'px-6 pb-3 shrink-0 transition-[max-height] duration-200',
                changesOpen ? 'max-h-28 overflow-y-auto' : '',
              ].join(' ')}
            >
              <ul className="list-none space-y-1.5" aria-label="주요 변경사항">
                {releaseNotes[0].highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-sp-text/85">
                    <span className="text-sp-accent mt-0.5 shrink-0" aria-hidden="true">
                      ·
                    </span>
                    <span className="leading-relaxed">
                      <InlineMarkup text={h} boldClassName="font-semibold text-sp-text" />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 변경 내역 접힘 토글 */}
          {!noteLoading && releaseNotes.length > 0 && totalChanges > 0 && (
            <div className="px-6 border-t border-sp-border/40 shrink-0">
              <button
                type="button"
                onClick={() => setChangesOpen((v) => !v)}
                aria-expanded={changesOpen}
                aria-controls="update-changes-panel"
                className="flex items-center gap-1.5 text-xs text-sp-muted hover:text-sp-text transition-colors w-full text-left py-2.5"
              >
                <span
                  className={[
                    'material-symbols-outlined text-base transition-transform duration-200',
                    changesOpen ? 'rotate-180' : 'rotate-0',
                  ].join(' ')}
                  aria-hidden="true"
                >
                  expand_more
                </span>
                {changesOpen ? '변경 내역 접기' : `${totalChanges}개 변경 내역 자세히 보기`}
              </button>
            </div>
          )}

          {/* 변경 내역 패널 (접힘 가능) — 내부 스크롤 영역 */}
          {changesOpen && !noteLoading && releaseNotes.length > 0 && (
            <div
              id="update-changes-panel"
              className="px-6 pb-3 flex-1 min-h-0 overflow-y-auto space-y-3"
            >
              {releaseNotes.map((note, vi) => (
                <div key={note.version}>
                  {releaseNotes.length > 1 && (
                    <div
                      className={`flex items-center gap-2 ${vi > 0 ? 'mt-3 pt-2.5 border-t border-sp-border/30' : ''} mb-2`}
                    >
                      <span className="text-sp-accent text-xs font-bold">v{note.version}</span>
                      <span className="text-sp-muted text-caption">{note.date}</span>
                      {vi > 0 && note.highlights?.[0] && (
                        <span className="text-sp-muted text-caption truncate flex-1">
                          — {note.highlights[0]}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="space-y-2.5">
                    {note.changes.map((c, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <ChangeBadge type={c.type} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sp-text text-sm leading-snug">{c.title}</p>
                          {c.description && <DescriptionRenderer description={c.description} />}
                          {c.notionUrl && c.notionUrl.startsWith('https://') && (
                            <a
                              href={c.notionUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => {
                                handleExternalLinkClick(e, c.notionUrl);
                                track('release_notes_notion_link_clicked', {
                                  version: note.version,
                                  title: c.title,
                                });
                              }}
                              className="inline-flex items-center gap-1 mt-1.5 text-detail text-sp-accent hover:underline"
                            >
                              자세히 보기
                              <span
                                className="material-symbols-outlined text-[11px]"
                                aria-hidden="true"
                              >
                                arrow_outward
                              </span>
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 로딩 표시 */}
          {noteLoading && (
            <div className="px-6 py-3 shrink-0">
              <div className="flex items-center gap-2 text-sp-muted text-xs">
                <span className="material-symbols-outlined text-sm animate-spin" aria-hidden="true">
                  progress_activity
                </span>
                변경사항 불러오는 중...
              </div>
            </div>
          )}

          {/* CTA 푸터: 좌측 외부 링크 2개 + 우측 닫기/업데이트 */}
          <div className="flex items-center justify-between gap-2 px-6 py-3 border-t border-sp-border/50 shrink-0">
            <div className="flex items-center gap-3">
              <a
                href={GUIDE_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => handleExternalLinkClick(e, GUIDE_URL)}
                className="flex items-center gap-1 text-xs text-sp-muted hover:text-sp-text transition-colors"
              >
                사용 가이드
                <span className="material-symbols-outlined text-[12px]" aria-hidden="true">
                  open_in_new
                </span>
              </a>
              <a
                href={FEEDBACK_FORM_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => handleExternalLinkClick(e, FEEDBACK_FORM_URL)}
                className="flex items-center gap-1 text-xs text-sp-muted hover:text-sp-text transition-colors"
              >
                피드백
                <span className="material-symbols-outlined text-[12px]" aria-hidden="true">
                  open_in_new
                </span>
              </a>
            </div>
            <div className="flex items-center gap-2">
              <LaterDropdown
                isSecurity={isSecurity}
                onSnooze1d={handleSnooze1d}
                onSnooze3d={handleSnooze3d}
                onSkip={handleSkip}
              />
              <button
                onClick={handleDownload}
                className="px-4 py-1.5 text-sm bg-sp-accent text-white rounded-lg hover:bg-blue-600 transition-colors font-medium flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  {info.manualOnly ? 'download' : 'rocket_launch'}
                </span>
                {info.manualOnly ? '새 버전 다운로드' : '지금 업데이트'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 다운로드 중 ── */}
      {status === 'downloading' && (
        <div className="flex flex-col gap-3 px-6 py-5">
          <div className="flex items-center gap-2.5">
            <span
              className="material-symbols-outlined text-sp-accent text-xl animate-spin"
              aria-hidden="true"
            >
              progress_activity
            </span>
            <span className="text-sp-text text-sm font-medium" aria-live="polite">
              다운로드 중... {progress}%
            </span>
          </div>
          <div
            className="w-full bg-sp-bg rounded-full h-2 overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label="다운로드 진행률"
          >
            <div
              className="bg-sp-accent h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sp-muted text-[10px] text-center">
            다운로드 중에는 창을 닫을 수 없어요
          </p>
        </div>
      )}

      {/* ── 다운로드 완료 ── */}
      {status === 'downloaded' && (
        <div className="flex flex-col gap-4 px-6 py-5">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-green-400 text-2xl" aria-hidden="true">
              check_circle
            </span>
            <div>
              <p className="text-sp-text text-sm font-bold">업데이트 준비 완료!</p>
              <p className="text-sp-muted text-xs mt-0.5">
                쌤핀 앱만 재시작되며, PC 재부팅이 아닙니다.
              </p>
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
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                restart_alt
              </span>
              쌤핀 재시작
            </button>
          </div>
        </div>
      )}

      {/* ── macOS 수동 설치 안내 (베타 지원) ── */}
      {status === 'manual' && (
        <div className="flex flex-col gap-4 px-6 py-5">
          <div className="flex items-start gap-2.5">
            <span className="material-symbols-outlined text-sp-accent text-2xl" aria-hidden="true">
              download
            </span>
            <div>
              <p className="text-sp-text text-sm font-bold">브라우저에서 다운로드가 시작됐어요</p>
              <p className="text-sp-muted text-xs mt-0.5 leading-relaxed">
                macOS 버전은 베타 지원이라 앱 안에서 자동 설치가 되지 않아요. 받은 파일로 직접
                설치해 주세요.
              </p>
            </div>
          </div>
          <ol className="space-y-1.5 text-sm text-sp-text/85 list-none">
            <li className="flex items-start gap-2">
              <span className="text-sp-accent shrink-0">1.</span>
              <span>다운로드한 DMG 파일을 엽니다.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-sp-accent shrink-0">2.</span>
              <span>쌤핀 아이콘을 응용 프로그램 폴더로 드래그해 덮어씁니다.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-sp-accent shrink-0">3.</span>
              <span>쌤핀을 다시 실행하면 완료 — 데이터는 그대로 유지돼요.</span>
            </li>
          </ol>
          <div className="flex justify-end">
            <button
              onClick={handleDismiss}
              className="px-4 py-2 text-sm bg-sp-accent text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* ── 오류 ── */}
      {status === 'error' && (
        <div className="flex items-center gap-2.5 px-6 py-5">
          <span className="material-symbols-outlined text-red-500 text-xl" aria-hidden="true">
            error
          </span>
          <span className="text-sp-text text-sm">업데이트 오류: {errorMsg}</span>
        </div>
      )}
    </Modal>
  );
}
