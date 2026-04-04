import { useState, useEffect } from 'react';
import { SettingsSection } from '../shared/SettingsSection';
import { useCalendarSyncStore } from '@adapters/stores/useCalendarSyncStore';
import { useDriveSyncStore } from '@adapters/stores/useDriveSyncStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';

export function AccountTab() {
  const {
    isConnected, email, isLoading, startAuth, disconnect,
    showFallbackSuggestion, fallbackSuggestionData, acceptFallback, setShowFallbackSuggestion,
    oauthError, setOAuthError, showPKCEFallback, setShowPKCEFallback,
    startPKCEFallback, completePKCEAuth, error: authError,
  } = useCalendarSyncStore();

  const { status: driveStatus, syncToCloud, syncFromCloud } = useDriveSyncStore();
  const { settings } = useSettingsStore();
  const sync = settings.sync;

  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [pkceCode, setPkceCode] = useState('');

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onOAuthError) return;
    return api.onOAuthError((err) => setOAuthError(err));
  }, [setOAuthError]);

  const handleDisconnect = () => {
    void disconnect();
    setShowDisconnectConfirm(false);
  };

  const handleConnect = async () => {
    await startAuth();
    if (sync?.enabled) {
      await syncFromCloud();
    }
  };

  return (
    <div>
      {/* Main Account Section */}
      <SettingsSection
        icon="account_circle"
        iconColor="bg-purple-500/10 text-purple-400"
        title="계정 연동"
        description="Google 계정을 연결하여 데이터 동기화 및 캘린더 연동을 사용하세요"
      >
        {isConnected ? (
          // === CONNECTED STATE ===
          <div className="space-y-4">
            {/* Account info card */}
            <div className="flex items-center gap-4 rounded-xl bg-sp-surface p-4">
              <div className="w-12 h-12 rounded-full bg-green-500/15 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-green-400 text-2xl">check_circle</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-sp-text">Google 계정 연결됨</p>
                <p className="text-sm text-sp-muted truncate">{email}</p>
              </div>
            </div>

            {/* Connected features summary */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-sp-muted uppercase tracking-wider">연결된 기능</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex items-center gap-2.5 rounded-lg border border-sp-border p-3">
                  <div className="p-1.5 rounded-md bg-cyan-500/10">
                    <span className="material-symbols-outlined text-cyan-400 text-icon-md">cloud_sync</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-sp-text">드라이브 동기화</p>
                    <p className="text-xs text-sp-muted">{sync?.enabled ? '활성' : '비활성'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-lg border border-sp-border p-3">
                  <div className="p-1.5 rounded-md bg-pink-500/10">
                    <span className="material-symbols-outlined text-pink-400 text-icon-md">event</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-sp-text">캘린더 동기화</p>
                    <p className="text-xs text-sp-muted">활성</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Last sync info */}
            {sync?.lastSyncedAt && (
              <div className="flex items-center gap-2 text-xs text-sp-muted">
                <span className="material-symbols-outlined text-icon-sm">schedule</span>
                <span>마지막 동기화: {new Date(sync.lastSyncedAt).toLocaleString('ko-KR')}</span>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                onClick={async () => {
                  await syncFromCloud();
                  await syncToCloud();
                }}
                disabled={driveStatus === 'syncing' || !sync?.enabled}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sp-accent hover:bg-blue-600 text-white font-medium text-sm transition-all disabled:opacity-50"
              >
                <span className={`material-symbols-outlined text-icon ${driveStatus === 'syncing' ? 'animate-spin' : ''}`}>
                  {driveStatus === 'syncing' ? 'progress_activity' : 'sync'}
                </span>
                {driveStatus === 'syncing' ? '동기화 중...' : '지금 동기화'}
              </button>
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
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-red-500/20 text-red-400 hover:bg-red-500/10 font-medium text-sm transition-colors"
              >
                <span className="material-symbols-outlined text-icon">link_off</span>
                연결 해제
              </button>
            </div>
          </div>
        ) : (
          // === DISCONNECTED STATE ===
          <div className="space-y-4">
            <div className="flex items-center gap-4 rounded-xl bg-amber-500/5 border border-amber-500/20 p-4">
              <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-amber-400 text-2xl">warning</span>
              </div>
              <div>
                <p className="text-base font-semibold text-sp-text">계정이 연결되지 않았습니다</p>
                <p className="text-sm text-sp-muted mt-0.5">다른 PC에서 사용하던 데이터를 불러오려면 Google 계정을 연결하세요.</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-sp-muted uppercase tracking-wider">연결하면 사용할 수 있는 기능</p>
              <ul className="space-y-2 text-sm text-sp-muted">
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-icon text-cyan-400">cloud_sync</span>
                  여러 기기 간 데이터 자동 동기화
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-icon text-pink-400">event</span>
                  Google 캘린더와 일정 연동
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-icon text-emerald-400">folder_open</span>
                  과제수합 (Google 드라이브)
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={() => void handleConnect()}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-sp-accent hover:bg-blue-600 text-white font-medium text-sm transition-all shadow-lg shadow-sp-accent/25 disabled:opacity-50"
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
          </div>
        )}
      </SettingsSection>

      {/* Disconnect Confirmation Dialog */}
      {showDisconnectConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="bg-sp-card rounded-xl ring-1 ring-sp-border p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-red-500/10">
                <span className="material-symbols-outlined text-red-400">link_off</span>
              </div>
              <h3 className="text-lg font-bold text-sp-text">계정 연결 해제</h3>
            </div>
            <p className="text-sm text-sp-muted mb-2">
              Google 계정 연결을 해제하시겠습니까?
            </p>
            <div className="rounded-lg bg-sp-surface p-3 mb-6">
              <ul className="space-y-1.5 text-xs text-sp-muted">
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-green-400 text-icon-sm">check</span>
                  로컬 데이터(시간표, 메모, 할 일 등)는 유지됩니다
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-400 text-icon-sm">warning</span>
                  Google 캘린더에서 가져온 일정은 제거됩니다
                </li>
                <li className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-400 text-icon-sm">warning</span>
                  드라이브 동기화가 중단됩니다
                </li>
              </ul>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowDisconnectConfirm(false)}
                className="px-4 py-2 rounded-lg border border-sp-border text-sp-muted hover:text-sp-text text-sm transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDisconnect}
                className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 text-sm font-medium transition-colors"
              >
                연결 해제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OAuth fallback suggestion modal (30s timeout) */}
      {showFallbackSuggestion && fallbackSuggestionData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowFallbackSuggestion(false)}>
          <div className="w-full max-w-md rounded-xl bg-sp-card border border-sp-border p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <span className="material-symbols-outlined text-amber-400">wifi_off</span>
              </div>
              <h3 className="text-lg font-bold text-sp-text">연결이 안 되시나요?</h3>
            </div>
            <div className="space-y-3">
              <p className="text-sm text-sp-muted">
                {fallbackSuggestionData.reason === 'LOCALHOST_BLOCKED'
                  ? '학교 보안 프로그램이 구글 연결을 차단하고 있어요. 아래 방법으로 연결할 수 있습니다.'
                  : `Google 로그인은 완료했지만 앱과의 연결이 ${fallbackSuggestionData.elapsedSec}초째 대기 중이에요. 보안 프로그램이 연결을 차단하고 있을 수 있습니다.`}
              </p>
              <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-4">
                <p className="text-sm font-medium text-blue-400 mb-1">수동 인증 방식으로 전환할까요?</p>
                <p className="text-xs text-sp-muted">Google이 표시하는 인증 코드를 직접 입력하는 방식입니다. 보안 프로그램의 영향을 받지 않아요.</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-6">
              <button onClick={() => setShowFallbackSuggestion(false)} className="rounded-lg border border-sp-border px-4 py-2 text-sm text-sp-muted transition-colors hover:bg-sp-surface">좀 더 기다릴게요</button>
              <button onClick={() => void acceptFallback()} className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sp-accent/80">수동 인증으로 전환</button>
            </div>
          </div>
        </div>
      )}

      {/* OAuth error modal */}
      {oauthError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setOAuthError(null)}>
          <div className="w-full max-w-md rounded-xl bg-sp-card border border-sp-border p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-red-500/10">
                <span className="material-symbols-outlined text-red-400">error</span>
              </div>
              <h3 className="text-lg font-bold text-sp-text">Google 로그인 연결 실패</h3>
            </div>
            <p className="text-sm text-sp-muted">{oauthError.message}</p>
            <div className="flex items-center justify-end gap-2 mt-6">
              {(oauthError.code === 'SERVER_START_FAILED' || oauthError.code === 'LOCALHOST_BLOCKED') && (
                <button onClick={() => { setOAuthError(null); void startPKCEFallback(); }} className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sp-accent/80">수동 인증으로 시도</button>
              )}
              <button onClick={() => setOAuthError(null)} className="rounded-lg border border-sp-border px-4 py-2 text-sm text-sp-muted transition-colors hover:bg-sp-surface">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* PKCE manual auth code input modal */}
      {showPKCEFallback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowPKCEFallback(false)}>
          <div className="w-full max-w-md rounded-xl bg-sp-card border border-sp-border p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <span className="material-symbols-outlined text-blue-400">key</span>
              </div>
              <h3 className="text-lg font-bold text-sp-text">수동 인증</h3>
            </div>
            <p className="text-sm text-sp-muted mb-4">브라우저에서 Google 로그인 후 표시된 인증 코드를 아래에 붙여넣어 주세요.</p>
            {authError && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400 mb-4">{authError}</div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={pkceCode}
                onChange={(e) => setPkceCode(e.target.value)}
                placeholder="인증 코드 입력..."
                className="flex-1 rounded-lg border border-sp-border bg-sp-surface px-4 py-3 text-sm text-sp-text placeholder:text-sp-muted/50 focus:border-sp-accent focus:outline-none"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && pkceCode.trim()) void completePKCEAuth(pkceCode.trim()); }}
              />
              <button
                onClick={() => pkceCode.trim() && void completePKCEAuth(pkceCode.trim())}
                disabled={isLoading || !pkceCode.trim()}
                className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sp-accent/80 disabled:opacity-50"
              >
                {isLoading ? '인증 중...' : '인증'}
              </button>
            </div>
            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={() => setShowPKCEFallback(false)} disabled={isLoading} className="rounded-lg border border-sp-border px-4 py-2 text-sm text-sp-muted transition-colors hover:bg-sp-surface disabled:opacity-50">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
