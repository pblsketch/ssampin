import { useCallback, useEffect, useState } from 'react';
import { useToastStore } from '@adapters/components/common/Toast';
import { SettingsSection } from './shared/SettingsSection';

interface DataLocation {
  readonly userDataPath: string;
  readonly dataDirPath: string;
  readonly exists: boolean;
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

  useEffect(() => {
    if (!electronApi) return;
    electronApi
      .getDataLocation()
      .then((loc) => setLocation(loc))
      .catch(() => {
        // 무시 — 패널에 위치를 표시하지 못해도 백업/복원 자체는 동작 가능
      });
  }, [electronApi]);

  const handleOpenLocation = useCallback(async () => {
    if (!electronApi) return;
    const result = await electronApi.openDataLocation();
    if (!result.ok) {
      showToast(`폴더를 열 수 없어요. (${result.reason ?? ''})`, 'error');
    }
  }, [electronApi, showToast]);

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
      if (
        typeof result.restoredCount === 'number' &&
        result.safetyBackupPath &&
        result.metadata
      ) {
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
        <p className="text-sm text-sp-muted">
          백업과 복원은 데스크톱 쌤핀에서만 지원돼요.
        </p>
      </SettingsSection>
    );
  }

  return (
    <>
      {/* ── 데이터 저장 위치 ── */}
      <SettingsSection
        icon="folder_open"
        iconColor="bg-blue-500/10 text-blue-400"
        title="내 데이터가 저장된 위치"
        description="쌤핀의 모든 데이터는 이 컴퓨터의 아래 폴더 안에서만 보관돼요."
      >
        <div className="space-y-3">
          <div className="rounded-lg bg-sp-surface px-3 py-2.5 ring-1 ring-sp-border">
            <p className="text-xs text-sp-muted mb-1">사용자 데이터 폴더</p>
            <p className="text-xs text-sp-text font-mono break-all leading-relaxed">
              {location?.userDataPath ?? '확인 중...'}
            </p>
          </div>
          <div className="rounded-lg bg-sp-surface px-3 py-2.5 ring-1 ring-sp-border">
            <p className="text-xs text-sp-muted mb-1">JSON 데이터 디렉토리</p>
            <p className="text-xs text-sp-text font-mono break-all leading-relaxed">
              {location?.dataDirPath ?? '확인 중...'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenLocation}
            disabled={!location}
            className="px-4 py-2 rounded-lg bg-sp-accent/10 text-sp-accent text-sm font-medium hover:bg-sp-accent/20 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-icon-md">folder_open</span>
            폴더 열기
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
                  백업 파일에는 학생 이름·연락처·메모·평가 기록 등 민감한 개인정보가
                  포함될 수 있어요. 안전한 곳에 보관해 주세요. 외부 서버에는 어떤
                  데이터도 전송되지 않아요.
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
                  <li>
                    뭔가 잘못되더라도 안전 백업 파일에서 다시 되돌릴 수 있어요.
                  </li>
                  <li>
                    복원 후에는 앱을 새로고침해야 변경 내용이 화면에 나타나요.
                  </li>
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
