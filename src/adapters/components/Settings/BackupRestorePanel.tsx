import { useCallback, useEffect, useState } from 'react';
import { useToastStore } from '@adapters/components/common/Toast';
import { SettingsSection } from './shared/SettingsSection';

interface DataLocation {
  readonly userDataPath: string;
  readonly dataDirPath: string;
  readonly exists: boolean;
}

interface StorageState {
  readonly contentRoot: string;
  readonly defaultRoot: string;
  readonly configuredRoot: string | null;
  readonly reason:
    | 'default'
    | 'custom'
    | 'fallback-missing'
    | 'fallback-unwritable'
    | 'fallback-invalid';
  readonly isCustom: boolean;
  readonly contentBytes: number;
  readonly cacheBytes: number;
  readonly contentDirs: readonly { readonly name: string; readonly bytes: number }[];
}

/** 바이트를 선생님이 읽기 쉬운 단위로. 0은 '없음'으로 표기해 혼동을 줄인다. */
function formatBytes(bytes: number): string {
  if (bytes <= 0) return '없음';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)}MB`;
  return `${(mb / 1024).toFixed(1)}GB`;
}

/** 지정한 폴더를 이번 실행에서 쓰지 못한 경우의 안내 문구. */
function fallbackNotice(state: StorageState): string | null {
  switch (state.reason) {
    case 'fallback-missing':
      return '지정한 폴더를 찾지 못해 이번에는 기본 위치의 자료를 쓰고 있어요. 외장·네트워크 드라이브라면 연결한 뒤 앱을 다시 켜 주세요.';
    case 'fallback-unwritable':
      return '지정한 폴더에 저장할 권한이 없어 이번에는 기본 위치를 쓰고 있어요.';
    case 'fallback-invalid':
      return '지정한 위치가 폴더가 아니어서 기본 위치를 쓰고 있어요.';
    default:
      return null;
  }
}

type Status =
  | { kind: 'idle' }
  | { kind: 'exporting' }
  | { kind: 'export-success'; filePath: string; entryCount: number }
  | { kind: 'importing' }
  | {
      kind: 'import-success';
      restoredCount: number;
      safetyBackupPath: string;
      sourceVersion: string;
      sourceDate: string;
    }
  | { kind: 'error'; message: string };

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function BackupRestorePanel() {
  const showToast = useToastStore((s) => s.show);
  const [location, setLocation] = useState<DataLocation | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [confirmRestore, setConfirmRestore] = useState(false);

  const electronApi = window.electronAPI?.backup;
  const storageApi = window.electronAPI?.storage;

  const [storage, setStorage] = useState<StorageState | null>(null);
  const [busy, setBusy] = useState<null | 'move' | 'reset' | 'clear'>(null);
  // 이사 후에는 재시작해야 모든 기능이 새 폴더를 본다(일부 모듈이 시작 시 경로를 캐시한다).
  const [needsRestart, setNeedsRestart] = useState(false);
  const [movedNote, setMovedNote] = useState<readonly string[] | null>(null);

  useEffect(() => {
    if (!electronApi) return;
    electronApi
      .getDataLocation()
      .then((loc) => setLocation(loc))
      .catch(() => {
        // 무시 — 패널에 위치를 표시하지 못해도 백업/복원 자체는 동작 가능
      });
  }, [electronApi]);

  useEffect(() => {
    if (!storageApi) return;
    storageApi
      .getState()
      .then((next) => setStorage(next))
      .catch(() => {
        // 무시 — 용량 표시는 부가 정보다
      });
  }, [storageApi]);

  const handleOpenContentFolder = useCallback(async () => {
    if (!storageApi) return;
    const result = await storageApi.openContentFolder();
    if (!result.ok) {
      showToast(`폴더를 열 수 없어요. (${result.reason ?? ''})`, 'error');
    }
  }, [storageApi, showToast]);

  const handleMove = useCallback(async () => {
    if (!storageApi) return;
    setBusy('move');
    try {
      const result = await storageApi.chooseAndMove();
      if (result.canceled) return;
      if (!result.ok) {
        showToast(result.message ?? '자료를 옮기지 못했어요.', 'error');
        return;
      }
      if (result.state) setStorage(result.state);
      setMovedNote(result.preservedOriginals ?? []);
      setNeedsRestart(true);
      showToast('자료를 새 폴더로 옮겼어요. 앱을 다시 시작해 주세요.', 'success');
    } catch {
      showToast('자료를 옮기는 중 문제가 생겼어요. 원래 위치의 자료는 그대로예요.', 'error');
    } finally {
      setBusy(null);
    }
  }, [storageApi, showToast]);

  const handleResetLocation = useCallback(async () => {
    if (!storageApi) return;
    setBusy('reset');
    try {
      const result = await storageApi.resetLocation();
      if (!result.ok) {
        showToast(result.message ?? '기본 위치로 되돌리지 못했어요.', 'error');
        return;
      }
      if (result.state) setStorage(result.state);
      if (result.needsRestart) setNeedsRestart(true);
      showToast('기본 위치로 되돌렸어요. 앱을 다시 시작해 주세요.', 'success');
    } catch {
      showToast('되돌리는 중 문제가 생겼어요.', 'error');
    } finally {
      setBusy(null);
    }
  }, [storageApi, showToast]);

  const handleClearCache = useCallback(async () => {
    if (!storageApi) return;
    setBusy('clear');
    try {
      const result = await storageApi.clearCache();
      setStorage(result.state);
      const freed = formatBytes(result.freedBytes);
      if (result.skipped.length > 0) {
        showToast(`${freed} 정리했어요. 일부는 앱이 사용 중이라 다음에 정리돼요.`, 'success');
      } else {
        showToast(`임시 파일 ${freed}를 정리했어요.`, 'success');
      }
    } catch {
      showToast('임시 파일을 정리하지 못했어요.', 'error');
    } finally {
      setBusy(null);
    }
  }, [storageApi, showToast]);

  const handleRelaunch = useCallback(() => {
    void storageApi?.relaunch();
  }, [storageApi]);

  const handleExport = useCallback(async () => {
    if (!electronApi) return;
    setStatus({ kind: 'exporting' });
    try {
      const result = await electronApi.exportBackup();
      if (result.canceled) {
        setStatus({ kind: 'idle' });
        return;
      }
      if (result.filePath && typeof result.entryCount === 'number') {
        setStatus({
          kind: 'export-success',
          filePath: result.filePath,
          entryCount: result.entryCount,
        });
        showToast('백업 파일을 저장했어요.', 'success');
      } else {
        setStatus({ kind: 'idle' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus({ kind: 'error', message: `백업 저장에 실패했어요. (${msg})` });
    }
  }, [electronApi, showToast]);

  const handleImport = useCallback(async () => {
    if (!electronApi) return;
    setConfirmRestore(false);
    setStatus({ kind: 'importing' });
    try {
      const result = await electronApi.importBackup();
      if (result.canceled) {
        setStatus({ kind: 'idle' });
        return;
      }
      if (result.error) {
        setStatus({ kind: 'error', message: result.error.message });
        return;
      }
      if (typeof result.restoredCount === 'number' && result.safetyBackupPath && result.metadata) {
        setStatus({
          kind: 'import-success',
          restoredCount: result.restoredCount,
          safetyBackupPath: result.safetyBackupPath,
          sourceVersion: result.metadata.appVersion,
          sourceDate: result.metadata.exportedAt,
        });
        showToast(
          `${result.restoredCount}개 항목을 복원했어요. 앱을 새로고침하면 변경 내용이 반영돼요.`,
          'success',
        );
      } else {
        setStatus({ kind: 'idle' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus({ kind: 'error', message: `백업 가져오기에 실패했어요. (${msg})` });
    }
  }, [electronApi, showToast]);

  const handleReload = useCallback(() => {
    window.location.reload();
  }, []);

  if (!electronApi) {
    return (
      <SettingsSection
        icon="cloud_download"
        iconColor="bg-sp-accent/10 text-sp-accent"
        title="백업 / 복원"
        description="브라우저 모드에서는 사용할 수 없어요. 데스크톱 앱에서 열어 주세요."
      >
        <p className="text-sm text-sp-muted">백업과 복원은 데스크톱 쌤핀에서만 지원돼요.</p>
      </SettingsSection>
    );
  }

  return (
    <>
      {/* ── 자료 저장 위치 ── */}
      <SettingsSection
        icon="folder_open"
        iconColor="bg-blue-500/10 text-blue-400"
        title="내 자료가 저장된 위치"
        description="쌤핀 자료는 이 컴퓨터 안에만 보관돼요. 원하면 다른 드라이브로 옮길 수 있어요."
      >
        <div className="space-y-3">
          {needsRestart && (
            <div className="rounded-lg bg-emerald-500/5 ring-1 ring-emerald-500/20 p-3">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-icon-md text-emerald-400 shrink-0 mt-0.5">
                  restart_alt
                </span>
                <div className="space-y-2 min-w-0">
                  <p className="text-sm text-sp-text font-medium">앱을 다시 시작해 주세요</p>
                  <p className="text-xs text-sp-muted leading-relaxed">
                    위치가 바뀌었어요. 모든 기능이 새 폴더를 보려면 앱을 다시 시작해야 해요.
                    {movedNote && movedNote.length > 0 && (
                      <>
                        {' '}
                        원래 자료는 지우지 않고{' '}
                        <span className="font-mono">{movedNote.join(', ')}</span> 이름으로 남겨
                        뒀어요. 새 위치가 정상인지 확인한 뒤 직접 지우시면 돼요.
                      </>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={handleRelaunch}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-colors"
                  >
                    지금 다시 시작
                  </button>
                </div>
              </div>
            </div>
          )}

          {storage && fallbackNotice(storage) && (
            <div className="rounded-lg bg-amber-500/5 ring-1 ring-amber-500/20 p-3">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-icon-md text-amber-400 shrink-0 mt-0.5">
                  warning
                </span>
                <div className="space-y-1 min-w-0">
                  <p className="text-sm text-sp-text font-medium">지정한 폴더를 쓰지 못했어요</p>
                  <p className="text-xs text-sp-muted leading-relaxed">{fallbackNotice(storage)}</p>
                  {storage.configuredRoot && (
                    <p className="text-xs text-sp-muted font-mono break-all">
                      {storage.configuredRoot}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg bg-sp-surface px-3 py-2.5 ring-1 ring-sp-border">
            <div className="flex items-center justify-between gap-2 mb-1">
              <p className="text-xs text-sp-muted">쌤핀 자료 폴더</p>
              {storage && (
                <span className="text-xs text-sp-muted shrink-0">
                  {storage.isCustom ? '직접 지정함' : '기본 위치'} ·{' '}
                  {formatBytes(storage.contentBytes)}
                </span>
              )}
            </div>
            <p className="text-xs text-sp-text font-mono break-all leading-relaxed">
              {storage?.contentRoot ?? location?.userDataPath ?? '확인 중...'}
            </p>
          </div>

          <p className="text-xs text-sp-muted leading-relaxed">
            학생·출결·기록·서식·관찰 첨부·미니앱이 함께 옮겨져요. 화면을 빨리 띄우기 위한 임시
            파일과 로그인 정보는 기본 위치에 남아서, 폴더를 옮겨도 다시 로그인할 필요는 없어요.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleOpenContentFolder}
              disabled={!storage}
              className="px-4 py-2 rounded-lg bg-sp-accent/10 text-sp-accent text-sm font-medium hover:bg-sp-accent/20 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-icon-md">folder_open</span>
              폴더 열기
            </button>
            <button
              type="button"
              onClick={handleMove}
              disabled={!storage || busy !== null}
              className="px-4 py-2 rounded-lg bg-sp-accent/10 text-sp-accent text-sm font-medium hover:bg-sp-accent/20 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-icon-md">drive_file_move</span>
              {busy === 'move' ? '옮기는 중...' : '위치 바꾸기'}
            </button>
            {storage?.isCustom && (
              <button
                type="button"
                onClick={handleResetLocation}
                disabled={busy !== null}
                className="px-4 py-2 rounded-lg bg-sp-surface text-sp-muted text-sm font-medium ring-1 ring-sp-border hover:text-sp-text transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-icon-md">
                  settings_backup_restore
                </span>
                {busy === 'reset' ? '되돌리는 중...' : '기본 위치로'}
              </button>
            )}
          </div>
        </div>
      </SettingsSection>

      {/* ── 임시 파일 정리 ── */}
      <SettingsSection
        icon="mop"
        iconColor="bg-violet-500/10 text-violet-400"
        title="임시 파일 정리"
        description="화면을 빨리 띄우려고 쌓아 둔 파일이에요. 지워도 자료와 로그인 상태는 그대로예요."
      >
        <div className="space-y-3">
          <div className="rounded-lg bg-sp-surface px-3 py-2.5 ring-1 ring-sp-border flex items-center justify-between gap-2">
            <p className="text-xs text-sp-muted">지금 정리할 수 있는 용량</p>
            <p className="text-sm text-sp-text font-medium">
              {storage ? formatBytes(storage.cacheBytes) : '확인 중...'}
            </p>
          </div>
          <p className="text-xs text-sp-muted leading-relaxed">
            지우면 앱이 필요할 때 다시 만들어요. 처음 한 번은 화면이 조금 느리게 뜰 수 있어요.
          </p>
          <button
            type="button"
            onClick={handleClearCache}
            disabled={!storage || busy !== null || storage.cacheBytes <= 0}
            className="px-4 py-2 rounded-lg bg-sp-accent/10 text-sp-accent text-sm font-medium hover:bg-sp-accent/20 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-icon-md">mop</span>
            {busy === 'clear' ? '정리하는 중...' : '임시 파일 정리하기'}
          </button>
        </div>
      </SettingsSection>

      {/* ── 백업 내보내기 ── */}
      <SettingsSection
        icon="cloud_download"
        iconColor="bg-emerald-500/10 text-emerald-400"
        title="내 데이터 백업하기"
        description="쌤핀의 모든 정보를 한 파일로 저장해 USB·이메일·다른 PC로 옮길 수 있어요."
      >
        <div className="space-y-3">
          <div className="rounded-lg bg-amber-500/5 ring-1 ring-amber-500/20 p-3">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-icon-md text-amber-400 shrink-0 mt-0.5">
                privacy_tip
              </span>
              <div className="space-y-1">
                <p className="text-sm text-sp-text font-medium">개인정보 안내</p>
                <p className="text-xs text-sp-muted leading-relaxed">
                  백업 파일에는 학생 이름·연락처·메모·평가 기록 등 민감한 개인정보가 포함될 수
                  있어요. 안전한 곳에 보관해 주세요. 외부 서버에는 어떤 데이터도 전송되지 않아요.
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={status.kind === 'exporting'}
            className="px-4 py-2.5 rounded-lg bg-sp-accent text-white text-sm font-semibold hover:brightness-110 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {status.kind === 'exporting' ? (
              <>
                <span className="material-symbols-outlined text-icon-md animate-spin">
                  progress_activity
                </span>
                저장 중...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-icon-md">save</span>
                백업 파일로 저장하기
              </>
            )}
          </button>

          {status.kind === 'export-success' && (
            <div className="rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20 p-3">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-icon-md text-emerald-400 shrink-0 mt-0.5">
                  check_circle
                </span>
                <div className="space-y-1 min-w-0">
                  <p className="text-sm text-sp-text font-medium">
                    {status.entryCount}개 항목을 백업했어요.
                  </p>
                  <p className="text-xs text-sp-muted font-mono break-all leading-relaxed">
                    {status.filePath}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </SettingsSection>

      {/* ── 백업 복원 ── */}
      <SettingsSection
        icon="restore"
        iconColor="bg-purple-500/10 text-purple-400"
        title="백업에서 복원하기"
        description="이전에 저장한 .ssampin-backup.json 파일에서 데이터를 가져와요."
      >
        <div className="space-y-3">
          <div className="rounded-lg bg-blue-500/5 ring-1 ring-blue-500/20 p-3">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-icon-md text-blue-400 shrink-0 mt-0.5">
                shield
              </span>
              <div className="space-y-1">
                <p className="text-sm text-sp-text font-medium">자동 안전장치</p>
                <ul className="text-xs text-sp-muted leading-relaxed list-disc pl-4 space-y-0.5">
                  <li>복원 직전에 현재 상태를 자동으로 한 번 더 백업해요.</li>
                  <li>뭔가 잘못되더라도 안전 백업 파일에서 다시 되돌릴 수 있어요.</li>
                  <li>복원 후에는 앱을 새로고침해야 변경 내용이 화면에 나타나요.</li>
                </ul>
              </div>
            </div>
          </div>

          {!confirmRestore ? (
            <button
              type="button"
              onClick={() => setConfirmRestore(true)}
              disabled={status.kind === 'importing'}
              className="px-4 py-2.5 rounded-lg bg-purple-500/15 text-purple-300 text-sm font-semibold hover:bg-purple-500/25 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-icon-md">restore</span>
              백업 파일 가져오기
            </button>
          ) : (
            <div className="rounded-lg bg-sp-surface ring-1 ring-sp-border p-3 space-y-3">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-icon-md text-sp-highlight shrink-0 mt-0.5">
                  warning
                </span>
                <p className="text-sm text-sp-text leading-relaxed">
                  백업 파일의 데이터로 현재 데이터를 덮어써요. 정말 진행할까요?
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleImport}
                  className="px-4 py-2 rounded-lg bg-sp-accent text-white text-sm font-semibold hover:brightness-110 transition-all"
                >
                  계속하기
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRestore(false)}
                  className="px-4 py-2 rounded-lg text-sp-muted text-sm hover:text-sp-text hover:bg-sp-text/5 transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          )}

          {status.kind === 'importing' && (
            <div className="flex items-center gap-2 text-sp-muted text-sm">
              <span className="material-symbols-outlined text-icon-md animate-spin">
                progress_activity
              </span>
              복원 중...
            </div>
          )}

          {status.kind === 'import-success' && (
            <div className="rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-icon-md text-emerald-400 shrink-0 mt-0.5">
                  check_circle
                </span>
                <div className="space-y-1 min-w-0">
                  <p className="text-sm text-sp-text font-medium">
                    {status.restoredCount}개 항목을 복원했어요.
                  </p>
                  <p className="text-xs text-sp-muted">
                    백업 출처: 쌤핀 v{status.sourceVersion} · {formatDate(status.sourceDate)}
                  </p>
                  <p className="text-xs text-sp-muted">
                    안전 백업 위치:{' '}
                    <span className="font-mono break-all">{status.safetyBackupPath}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleReload}
                className="px-4 py-2 rounded-lg bg-sp-accent text-white text-sm font-semibold hover:brightness-110 transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-icon-md">refresh</span>
                지금 새로고침
              </button>
            </div>
          )}

          {status.kind === 'error' && (
            <div className="rounded-lg bg-red-500/10 ring-1 ring-red-500/20 p-3">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-icon-md text-red-400 shrink-0 mt-0.5">
                  error
                </span>
                <p className="text-sm text-sp-text leading-relaxed">{status.message}</p>
              </div>
            </div>
          )}
        </div>
      </SettingsSection>

      {/* ── 백업에서 빠지는 항목 안내 ── */}
      <SettingsSection
        icon="info"
        iconColor="bg-sp-surface text-sp-muted"
        title="백업에 포함되지 않는 항목"
      >
        <ul className="text-xs text-sp-muted leading-relaxed list-disc pl-4 space-y-1">
          <li>이모티콘 이미지(PNG)와 서식 파일(.hwpx, .pdf 등) 같은 첨부 파일</li>
          <li>로그인 토큰·비밀번호 등 보안 저장소 정보</li>
          <li>위젯·아이콘 위치 정보 같은 환경 의존 설정</li>
        </ul>
      </SettingsSection>
    </>
  );
}
