import { forwardRef, useState, useMemo } from 'react';
import { useCalendarSyncStore } from '@adapters/stores/useCalendarSyncStore';
import { useGoogleAccountStore } from '@adapters/stores/useGoogleAccountStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useTasksSyncStore } from '@adapters/stores/useTasksSyncStore';
import { SITE_URL } from '@config/siteUrl';
import { DisconnectConfirmModal } from './DisconnectConfirmModal';

function formatRelative(isoString: string | null | undefined): string {
  if (!isoString) return '기록 없음';
  const date = new Date(isoString);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}일 전`;
  return date.toLocaleDateString('ko-KR');
}

export const AccountSection = forwardRef<HTMLDivElement>(function AccountSection(_props, ref) {
  const { isConnected, email, isLoading, startAuth, disconnect } = useGoogleAccountStore();
  const { mappings } = useCalendarSyncStore();
  const { settings } = useSettingsStore();
  const { isEnabled: tasksEnabled } = useTasksSyncStore();
  const sync = settings.sync;

  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  const hasEnabledMapping = useMemo(
    () => mappings.some((m) => m.syncEnabled),
    [mappings],
  );

  const activeServicesCount = useMemo(() => {
    return [sync?.enabled, hasEnabledMapping, tasksEnabled].filter(Boolean).length;
  }, [sync?.enabled, hasEnabledMapping, tasksEnabled]);

  const handleDisconnect = () => {
    void disconnect();
    setShowDisconnectConfirm(false);
  };

  const openPrivacy = () => {
    const api = window.electronAPI;
    const url = `${SITE_URL}/privacy`;
    if (api?.openExternal) {
      api.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div ref={ref} id="google-account-section">
      <div className="rounded-xl bg-sp-card ring-1 ring-sp-border p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
            <span className="material-symbols-outlined">account_circle</span>
          </div>
          <h3 className="text-lg font-bold text-sp-text">Google 계정</h3>
        </div>

        {isConnected ? (
          // === CONNECTED STATE ===
          <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-xl bg-sp-surface p-4">
              <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-green-400 text-2xl">check_circle</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-sp-text truncate">{email ?? '연결됨'}</p>
                <p className="text-xs text-sp-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span className="text-green-400 font-medium">✅ 연결됨</span>
                  <span>·</span>
                  <span>마지막 활동: {formatRelative(sync?.lastSyncedAt)}</span>
                  <span>·</span>
                  <span>
                    {activeServicesCount > 0
                      ? `${activeServicesCount}개 서비스 사용 중`
                      : '계정만 연결됨'}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  void disconnect().then(() => startAuth(true));
                }}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-sp-border text-sp-muted hover:text-sp-text hover:border-sp-text/20 font-medium text-sm transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-icon">swap_horiz</span>
                계정 변경
              </button>
              <button
                type="button"
                onClick={() => setShowDisconnectConfirm(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-red-400/30 text-red-400 hover:bg-red-500/10 font-medium text-sm transition-colors"
              >
                <span className="material-symbols-outlined text-icon">link_off</span>
                연결 해제
              </button>
            </div>
          </div>
        ) : (
          // === DISCONNECTED STATE ===
          <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-xl bg-amber-500/5 ring-1 ring-amber-500/20 p-4">
              <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-amber-400 text-2xl">warning</span>
              </div>
              <div className="min-w-0">
                <p className="text-base font-semibold text-sp-text">계정이 연결되지 않았습니다</p>
                <p className="text-sm text-sp-muted mt-0.5">
                  Google 계정을 연결하면 3가지 서비스를 한 번에 사용할 수 있어요.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void startAuth()}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-sp-accent hover:bg-blue-600 text-white font-medium text-sm shadow-lg shadow-sp-accent/25 transition-all disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-icon-md">progress_activity</span>
                  연결 중...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-icon-md">login</span>
                  Google 계정 연결
                </>
              )}
            </button>

            <div className="space-y-2">
              <p className="text-xs font-medium text-sp-muted uppercase tracking-wider">
                연결 시 사용 가능한 권한
              </p>
              <ul className="space-y-2 text-sm text-sp-muted">
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-icon text-cyan-400 mt-0.5">cloud_sync</span>
                  <span>
                    <span className="text-sp-text font-medium">drive.appdata</span>
                    <span className="text-xs block">쌤핀 전용 폴더 백업 (다른 Drive 파일엔 접근하지 않음)</span>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-icon text-pink-400 mt-0.5">event</span>
                  <span>
                    <span className="text-sp-text font-medium">calendar</span>
                    <span className="text-xs block">선택한 캘린더와 쌤핀 일정 양방향 동기화</span>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-icon text-green-400 mt-0.5">checklist</span>
                  <span>
                    <span className="text-sp-text font-medium">tasks</span>
                    <span className="text-xs block">Google Tasks 할 일 양방향 연동(켤 때 추가 동의)</span>
                  </span>
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={openPrivacy}
              className="text-xs text-sp-muted hover:text-sp-accent transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-icon-sm">description</span>
              개인정보처리방침
            </button>
          </div>
        )}
      </div>

      {showDisconnectConfirm && (
        <DisconnectConfirmModal
          email={email}
          onConfirm={handleDisconnect}
          onCancel={() => setShowDisconnectConfirm(false)}
        />
      )}
    </div>
  );
});
