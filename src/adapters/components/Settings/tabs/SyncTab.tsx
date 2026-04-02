import { useState, useEffect } from 'react';
import { SettingsSection } from '../shared/SettingsSection';
import { Toggle } from '../shared/Toggle';
import { SyncResultSummary } from '@adapters/components/common/SyncResultSummary';
import { useCalendarSyncStore } from '@adapters/stores/useCalendarSyncStore';
import { useDriveSyncStore } from '@adapters/stores/useDriveSyncStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import type { SyncSettings } from '@domain/entities/Settings';

const INTERVAL_OPTIONS = [0, 5, 10, 15, 30] as const;

export function SyncTab() {
  const { settings, update } = useSettingsStore();
  const {
    isConnected, email, startAuth, disconnect, isLoading,
    showFallbackSuggestion, fallbackSuggestionData, acceptFallback, setShowFallbackSuggestion,
    oauthError, setOAuthError, showPKCEFallback, setShowPKCEFallback,
    startPKCEFallback, completePKCEAuth, error: authError,
  } = useCalendarSyncStore();

  // OAuth 에러 이벤트 수신 (SyncTab에서도 startAuth() 호출하므로 필요)
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onOAuthError) return;
    return api.onOAuthError((err) => setOAuthError(err));
  }, [setOAuthError]);
  const { status, syncToCloud, syncFromCloud, deleteCloudData, lastSyncResult } = useDriveSyncStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const sync: SyncSettings = settings.sync ?? {
    enabled: false,
    autoSyncOnStart: true,
    autoSyncOnSave: false,
    autoSyncIntervalMin: 0,
    conflictPolicy: 'latest',
    lastSyncedAt: null,
    deviceId: '',
  };

  const updateSync = (patch: Partial<SyncSettings>) => {
    void update({ sync: { ...sync, ...patch } });
  };

  const handleDeleteCloud = async () => {
    await deleteCloudData();
    setShowDeleteConfirm(false);
  };

  return (
    <div>
      {/* 동기화 활성화 */}
      <SettingsSection
        icon="cloud_sync"
        iconColor="bg-cyan-500/10 text-cyan-400"
        title="Google Drive 동기화"
        description="데이터를 Google Drive에 백업하고 기기 간 동기화합니다"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-sp-text">동기화 사용</p>
            <p className="text-xs text-sp-muted mt-0.5">Google Drive '쌤핀 동기화' 폴더에 데이터를 저장합니다</p>
          </div>
          <Toggle checked={sync.enabled} onChange={(v) => updateSync({ enabled: v })} />
        </div>
      </SettingsSection>

      {sync.enabled && (
        <>
          {/* Google 계정 연결 */}
          <SettingsSection
            icon="account_circle"
            iconColor="bg-blue-500/10 text-blue-400"
            title="Google 계정"
          >
            {isConnected ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-sp-accent/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-sp-accent">check_circle</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-sp-text">연결됨</p>
                    <p className="text-xs text-sp-muted">{email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void disconnect().then(() => startAuth(true));
                    }}
                    disabled={isLoading}
                    className="text-xs text-sp-muted hover:text-sp-accent font-medium px-3 py-1.5 rounded-lg border border-sp-border hover:border-sp-accent/50 transition-colors disabled:opacity-50"
                  >
                    계정 변경
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Google 계정 연결을 해제하시겠습니까?\n구글에서 가져온 일정이 모두 제거됩니다.')) {
                        void disconnect();
                      }
                    }}
                    className="text-xs text-red-400 hover:text-red-300 font-medium px-3 py-1.5 rounded-lg border border-red-500/20 hover:bg-red-500/10 transition-colors"
                  >
                    연결 해제
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => void startAuth()}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-sp-accent hover:bg-blue-600 text-white font-medium text-sm transition-all disabled:opacity-50"
                >
                  {isLoading ? (
                    <span className="material-symbols-outlined animate-spin text-icon-md">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-icon-md">login</span>
                  )}
                  {isLoading ? '연결 중...' : 'Google 계정 연결'}
                </button>
              </div>
            )}
          </SettingsSection>

          {/* 자동 동기화 */}
          <SettingsSection
            icon="autorenew"
            iconColor="bg-emerald-500/10 text-emerald-400"
            title="자동 동기화"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-sp-text">앱 시작 시 자동 동기화</p>
                  <p className="text-xs text-sp-muted mt-0.5">앱을 열 때 자동으로 클라우드와 동기화합니다</p>
                </div>
                <Toggle checked={sync.autoSyncOnStart} onChange={(v) => updateSync({ autoSyncOnStart: v })} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-sp-text">저장 시 자동 업로드</p>
                  <p className="text-xs text-sp-muted mt-0.5">데이터가 변경될 때마다 자동으로 업로드합니다</p>
                </div>
                <Toggle checked={sync.autoSyncOnSave} onChange={(v) => updateSync({ autoSyncOnSave: v })} />
              </div>

              <div>
                <p className="text-sm font-medium text-sp-text mb-2">주기적 동기화 간격</p>
                <div className="flex gap-2 flex-wrap">
                  {INTERVAL_OPTIONS.map((min) => (
                    <button
                      key={min}
                      type="button"
                      onClick={() => updateSync({ autoSyncIntervalMin: min })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        sync.autoSyncIntervalMin === min
                          ? 'bg-sp-accent text-white'
                          : 'bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border'
                      }`}
                    >
                      {min === 0 ? '사용 안 함' : `${min}분`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </SettingsSection>

          {/* 충돌 정책 */}
          <SettingsSection
            icon="merge_type"
            iconColor="bg-amber-500/10 text-amber-400"
            title="충돌 해결"
            description="같은 데이터가 여러 기기에서 변경되었을 때"
          >
            <div className="space-y-2">
              {([
                { value: 'latest' as const, label: '최신 버전 자동 선택', desc: '수정 시간이 더 최근인 데이터를 자동으로 선택합니다' },
                { value: 'ask' as const, label: '매번 확인하기', desc: '충돌이 발생할 때마다 선택할 수 있는 팝업을 표시합니다' },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateSync({ conflictPolicy: opt.value })}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    sync.conflictPolicy === opt.value
                      ? 'border-sp-accent bg-sp-accent/5'
                      : 'border-sp-border hover:bg-sp-surface'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      sync.conflictPolicy === opt.value ? 'border-sp-accent' : 'border-sp-muted'
                    }`}>
                      {sync.conflictPolicy === opt.value && (
                        <div className="w-2 h-2 rounded-full bg-sp-accent" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-sp-text">{opt.label}</p>
                      <p className="text-xs text-sp-muted mt-0.5">{opt.desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </SettingsSection>

          {/* 동기화 상태 */}
          <SettingsSection
            icon="info"
            iconColor="bg-violet-500/10 text-violet-400"
            title="동기화 상태"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-sp-muted">마지막 동기화</span>
                <span className="text-sp-text font-medium">
                  {sync.lastSyncedAt
                    ? new Date(sync.lastSyncedAt).toLocaleString('ko-KR')
                    : '동기화 기록 없음'}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-sp-muted">기기 ID</span>
                <span className="text-sp-text font-mono text-xs">
                  {sync.deviceId ? `${sync.deviceId.slice(0, 8)}...` : '-'}
                </span>
              </div>

              <button
                type="button"
                onClick={async () => {
                  await syncFromCloud();
                  await syncToCloud();
                }}
                disabled={status === 'syncing' || !isConnected}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-sp-surface hover:bg-sp-text/5 text-sp-text font-medium text-sm border border-sp-border transition-all disabled:opacity-50"
              >
                <span className={`material-symbols-outlined text-icon-md ${status === 'syncing' ? 'animate-spin' : ''}`}>
                  {status === 'syncing' ? 'progress_activity' : 'sync'}
                </span>
                {status === 'syncing' ? '동기화 중...' : '지금 동기화'}
              </button>

              {lastSyncResult && <SyncResultSummary result={lastSyncResult} />}
            </div>
          </SettingsSection>

          {/* 위험 영역 */}
          <SettingsSection
            icon="warning"
            iconColor="bg-red-500/10 text-red-400"
            title="위험 영역"
          >
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="text-sm text-red-400 hover:text-red-300 font-medium px-4 py-2 rounded-lg border border-red-500/20 hover:bg-red-500/10 transition-colors"
            >
              클라우드 데이터 삭제
            </button>

            {showDeleteConfirm && (
              <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
                <div className="bg-sp-card rounded-xl ring-1 ring-sp-border p-6 max-w-sm w-full mx-4">
                  <h3 className="text-lg font-bold text-sp-text mb-2">클라우드 데이터 삭제</h3>
                  <p className="text-sm text-sp-muted mb-6">
                    Google Drive의 '쌤핀 동기화' 폴더의 모든 데이터가 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
                  </p>
                  <div className="flex gap-3 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      className="px-4 py-2 rounded-lg border border-sp-border text-sp-muted hover:text-sp-text text-sm transition-colors"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteCloud()}
                      className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 text-sm font-medium transition-colors"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            )}
          </SettingsSection>
        </>
      )}

      {/* OAuth 폴백 제안 모달 (30초 콜백 미수신 시) */}
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
                <p className="text-xs text-sp-muted">
                  Google이 표시하는 인증 코드를 직접 입력하는 방식입니다.
                  보안 프로그램의 영향을 받지 않아요.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-6">
              <button onClick={() => setShowFallbackSuggestion(false)} className="rounded-lg border border-sp-border px-4 py-2 text-sm text-sp-muted transition-colors hover:bg-sp-surface">
                좀 더 기다릴게요
              </button>
              <button onClick={() => void acceptFallback()} className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sp-accent/80">
                수동 인증으로 전환
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OAuth 에러 모달 */}
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
                <button onClick={() => { setOAuthError(null); void startPKCEFallback(); }} className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sp-accent/80">
                  수동 인증으로 시도
                </button>
              )}
              <button onClick={() => setOAuthError(null)} className="rounded-lg border border-sp-border px-4 py-2 text-sm text-sp-muted transition-colors hover:bg-sp-surface">닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* PKCE 수동 인증 코드 입력 모달 */}
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
            <PKCECodeInput isLoading={isLoading} onSubmit={(code) => void completePKCEAuth(code)} />
            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={() => setShowPKCEFallback(false)} disabled={isLoading} className="rounded-lg border border-sp-border px-4 py-2 text-sm text-sp-muted transition-colors hover:bg-sp-surface disabled:opacity-50">취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** PKCE 인증 코드 입력 필드 (SyncTab 내부 전용) */
function PKCECodeInput({ isLoading, onSubmit }: { isLoading: boolean; onSubmit: (code: string) => void }) {
  const [code, setCode] = useState('');
  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="인증 코드 입력..."
        className="flex-1 rounded-lg border border-sp-border bg-sp-surface px-4 py-3 text-sm text-sp-text placeholder:text-sp-muted/50 focus:border-sp-accent focus:outline-none"
        autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter' && code.trim()) onSubmit(code.trim()); }}
      />
      <button
        onClick={() => code.trim() && onSubmit(code.trim())}
        disabled={isLoading || !code.trim()}
        className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sp-accent/80 disabled:opacity-50"
      >
        {isLoading ? '인증 중...' : '인증'}
      </button>
    </div>
  );
}
