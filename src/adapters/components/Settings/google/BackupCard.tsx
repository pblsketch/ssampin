import { forwardRef, useState } from 'react';
import { ServiceCard } from '../shared/ServiceCard';
import { SyncResultSummary } from '@adapters/components/common/SyncResultSummary';
import { useDriveSyncStore } from '@adapters/stores/useDriveSyncStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import type { SyncSettings } from '@domain/entities/Settings';
import { Modal } from '@adapters/components/common/Modal';

const INTERVAL_OPTIONS = [0, 5, 10, 15, 30] as const;
const DEFAULT_SYNC: SyncSettings = {
  enabled: false,
  autoSyncOnStart: true,
  autoSyncOnSave: false,
  autoSyncIntervalMin: 0,
  conflictPolicy: 'latest',
  lastSyncedAt: null,
  deviceId: '',
};

export const BackupCard = forwardRef<HTMLDivElement>(function BackupCard(_props, ref) {
  const { settings, update } = useSettingsStore();
  const {
    status,
    syncToCloud,
    syncFromCloud,
    importSettingsFromCloud,
    deleteCloudData,
    lastSyncResult,
  } = useDriveSyncStore();
  const showToast = useToastStore((s) => s.show);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isImportingSettings, setIsImportingSettings] = useState(false);

  const sync: SyncSettings = settings.sync ?? DEFAULT_SYNC;

  const updateSync = (patch: Partial<SyncSettings>) => {
    void update({ sync: { ...sync, ...patch } });
  };

  const handleBackupNow = async () => {
    await syncFromCloud();
    await syncToCloud();
  };

  const handleRestore = async () => {
    const ok = window.confirm(
      'Drive 백업에서 데이터를 덮어쓸까요? 현재 로컬 변경이 사라질 수 있어요.',
    );
    if (!ok) return;
    await syncFromCloud();
  };

  const handleImportSettings = async () => {
    const ok = window.confirm(
      '같은 Google 계정의 다른 기기 설정을 이 컴퓨터에 덮어씁니다. 현재 설정이 사라질 수 있어요. 계속할까요?',
    );
    if (!ok) return;
    setIsImportingSettings(true);
    try {
      const result = await importSettingsFromCloud();
      if (result.ok) {
        const deviceSuffix = result.remoteDeviceName ? ` (${result.remoteDeviceName})` : '';
        showToast(`다른 컴퓨터 설정을 가져왔어요${deviceSuffix}`, 'success');
        return;
      }
      switch (result.code) {
        case 'NO_BACKUP':
          showToast('클라우드에 저장된 설정 백업이 없어요.', 'info');
          break;
        case 'SCOPE_INSUFFICIENT':
          showToast('Google Drive 권한이 부족해요. Google 계정 연결을 다시 해주세요.', 'error');
          break;
        case 'PARSE_ERROR':
          showToast('설정 파일이 손상됐어요. 관리자에게 문의해주세요.', 'error');
          break;
        case 'NETWORK_ERROR':
        case 'UNKNOWN':
        default:
          showToast(result.message, 'error');
          break;
      }
    } finally {
      setIsImportingSettings(false);
    }
  };

  const handleDeleteCloud = async () => {
    await deleteCloudData();
    setShowDeleteConfirm(false);
  };

  const handleCopyDeviceId = async () => {
    if (!sync.deviceId) return;
    try {
      await navigator.clipboard.writeText(sync.deviceId);
      showToast('기기 ID를 복사했습니다', 'success');
    } catch {
      showToast('복사에 실패했습니다', 'error');
    }
  };

  const isSyncing = status === 'syncing';

  return (
    <div ref={ref}>
      <ServiceCard
        icon="cloud_sync"
        iconBg="bg-cyan-500/10 text-cyan-400"
        title="앱 데이터 백업"
        description="쌤핀 데이터를 Drive에 안전하게 보관하고 다른 PC에서 이어서 사용하세요"
        enabled={sync.enabled}
        onToggle={(v) => updateSync({ enabled: v })}
        collapsedHint="💡 다른 Google 앱에는 보이지 않는 전용 폴더"
      >
        {/* 자동 실행 */}
        <div>
          <p className="text-sm font-medium text-sp-text mb-2">자동 실행</p>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              aria-pressed={sync.autoSyncOnStart}
              onClick={() => updateSync({ autoSyncOnStart: !sync.autoSyncOnStart })}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                sync.autoSyncOnStart
                  ? 'bg-sp-accent text-white shadow-sm'
                  : 'bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border'
              }`}
            >
              <span className="material-symbols-outlined text-icon-sm">
                {sync.autoSyncOnStart ? 'check' : 'add'}
              </span>
              시작 시
            </button>
            <button
              type="button"
              aria-pressed={sync.autoSyncOnSave}
              onClick={() => updateSync({ autoSyncOnSave: !sync.autoSyncOnSave })}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                sync.autoSyncOnSave
                  ? 'bg-sp-accent text-white shadow-sm'
                  : 'bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border'
              }`}
            >
              <span className="material-symbols-outlined text-icon-sm">
                {sync.autoSyncOnSave ? 'check' : 'add'}
              </span>
              저장 시
            </button>
          </div>
        </div>

        {/* 주기 */}
        <div>
          <p className="text-sm font-medium text-sp-text mb-2">주기</p>
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

        {/* 마지막 백업 */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-sp-muted">마지막 백업</span>
          <span className="text-sp-text font-medium flex items-center gap-1">
            {sync.lastSyncedAt ? (
              <>
                <span className="material-symbols-outlined text-green-400 text-icon-sm">check</span>
                {new Date(sync.lastSyncedAt).toLocaleString('ko-KR')}
              </>
            ) : (
              '기록 없음'
            )}
          </span>
        </div>

        {/* 액션 버튼 */}
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => void handleBackupNow()}
            disabled={isSyncing}
            className="flex-1 min-w-[180px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sp-accent hover:bg-blue-600 text-white font-medium text-sm transition-all disabled:opacity-50"
          >
            <span
              className={`material-symbols-outlined text-icon-md ${isSyncing ? 'animate-spin' : ''}`}
            >
              {isSyncing ? 'progress_activity' : 'sync'}
            </span>
            {isSyncing ? '백업 중...' : '지금 백업 실행'}
          </button>
          <button
            type="button"
            onClick={() => void handleRestore()}
            disabled={isSyncing}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-sp-border text-sp-text hover:bg-sp-surface font-medium text-sm transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-icon-md">download</span>
            복원하기
          </button>
        </div>

        {/* 다른 컴퓨터 설정 가져오기 — settings만 선택적으로 덮어쓰는 보조 기능 */}
        <div className="rounded-lg bg-sp-surface/40 border border-sp-border/60 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-sp-accent text-icon-md mt-0.5">
              devices
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sp-text">다른 컴퓨터 설정 가져오기</p>
              <p className="text-xs text-sp-muted mt-0.5 leading-relaxed">
                같은 Google 계정의 Drive 백업에서 설정값만 이 기기에 적용합니다.<br />
                시간표·학생·메모 등 다른 데이터는 건드리지 않아요.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleImportSettings()}
            disabled={isSyncing || isImportingSettings}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-sp-border bg-sp-card text-sp-text hover:bg-sp-surface font-medium text-xs transition-colors disabled:opacity-50"
          >
            <span
              className={`material-symbols-outlined text-icon-sm ${isImportingSettings ? 'animate-spin' : ''}`}
            >
              {isImportingSettings ? 'progress_activity' : 'settings_backup_restore'}
            </span>
            {isImportingSettings ? '가져오는 중...' : '다른 컴퓨터 설정 가져오기'}
          </button>
        </div>

        {lastSyncResult && <SyncResultSummary result={lastSyncResult} />}

        {/* 고급 설정 */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-xs text-sp-muted hover:text-sp-text transition-colors"
          >
            <span className="material-symbols-outlined text-icon-sm">
              {showAdvanced ? 'expand_less' : 'expand_more'}
            </span>
            고급 설정
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-3 rounded-lg bg-sp-surface/50 p-3">
              {/* 충돌 정책 */}
              <div>
                <p className="text-xs font-medium text-sp-text mb-2">충돌 시 처리</p>
                <div className="space-y-1.5">
                  {(
                    [
                      { value: 'latest' as const, label: '최신 버전 자동 선택' },
                      { value: 'ask' as const, label: '매번 확인하기' },
                    ] as const
                  ).map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                        sync.conflictPolicy === opt.value
                          ? 'bg-sp-accent/10'
                          : 'hover:bg-sp-surface'
                      }`}
                    >
                      <input
                        type="radio"
                        name="conflictPolicy"
                        checked={sync.conflictPolicy === opt.value}
                        onChange={() => updateSync({ conflictPolicy: opt.value })}
                        className="accent-sp-accent"
                      />
                      <span className="text-xs text-sp-text">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 기기 ID */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-sp-muted">기기 ID</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sp-text">
                    {sync.deviceId ? `${sync.deviceId.slice(0, 8)}...` : '-'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCopyDeviceId()}
                    disabled={!sync.deviceId}
                    className="text-sp-muted hover:text-sp-accent transition-colors disabled:opacity-50"
                    aria-label="기기 ID 복사"
                  >
                    <span className="material-symbols-outlined text-icon-sm">content_copy</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 위험 영역 */}
        <div className="pt-2 border-t border-sp-border/50">
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1.5 text-xs text-red-400/80 hover:text-red-400 transition-colors"
          >
            <span className="material-symbols-outlined text-icon-sm">warning</span>
            클라우드 데이터 전체 삭제
          </button>
        </div>
      </ServiceCard>

      {/* 클라우드 삭제 확인 모달 */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="클라우드 데이터 삭제"
        srOnlyTitle
        size="sm"
        closeOnBackdrop={false}
      >
        <div className="p-6">
          <h3 className="text-lg font-bold text-sp-text mb-2">클라우드 데이터 삭제</h3>
          <p className="text-sm text-sp-muted mb-6">
            Google Drive의 '쌤핀 동기화' 폴더의 모든 데이터가 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
          </p>
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              autoFocus
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
      </Modal>
    </div>
  );
});
