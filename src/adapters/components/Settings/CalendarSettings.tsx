import { useCalendarSyncStore } from '@adapters/stores/useCalendarSyncStore';
import { CalendarMappingModal } from '../Calendar/CalendarMappingModal';

export function CalendarSettings() {
  const {
    isConnected,
    email,
    isLoading,
    error,
    syncState,
    mappings,
    syncInterval,
    syncOnStart,
    syncOnFocus,
    autoResolveConflicts,
    showCalendarPicker,
    startAuth,
    disconnect,
    setSyncInterval,
    setSyncOnStart,
    setSyncOnFocus,
    setAutoResolveConflicts,
    setShowCalendarPicker,
    syncNow,
  } = useCalendarSyncStore();

  const handleDisconnect = () => {
    if (window.confirm('구글 계정 연결을 해제하시겠습니까?\n구글에서 가져온 일정이 모두 제거됩니다.')) {
      disconnect();
    }
  };

  const enabledCount = mappings.filter(m => m.syncEnabled).length;

  return (
    <div className="space-y-4">
      {/* 섹션 헤더: 구글 연동 */}
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
          <span className="material-symbols-outlined">account_circle</span>
        </div>
        <h3 className="text-lg font-bold text-sp-text">구글 연동</h3>
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* 계정 연결 상태 */}
      {!isConnected ? (
        <div className="space-y-3">
          <p className="text-sm text-sp-muted">
            구글 계정을 연결하면 캘린더 동기화와 과제수합(드라이브) 기능을 사용할 수 있습니다.
          </p>
          <button
            onClick={startAuth}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-lg bg-sp-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sp-accent/80 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                인증 중...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">link</span>
                구글 계정 연결하기
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 연결된 계정 정보 */}
          <div className="flex items-center gap-3 rounded-lg bg-sp-surface p-3">
            <span className="text-green-400 material-symbols-outlined">check_circle</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-sp-text">연결됨</p>
              <p className="text-xs text-sp-muted">{email}</p>
            </div>
            <button
              onClick={handleDisconnect}
              disabled={isLoading}
              className="rounded-lg border border-sp-border px-3 py-1.5 text-xs text-sp-muted transition-colors hover:border-red-500/50 hover:text-red-400 disabled:opacity-50"
            >
              연결 해제
            </button>
          </div>

          {/* 연동 기능 목록 */}
          <div className="space-y-2">
            {/* 캘린더 동기화 */}
            <div className="flex items-center gap-3 rounded-lg border border-sp-border p-3">
              <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-400">
                <span className="material-symbols-outlined text-[18px]">event</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-sp-text">캘린더 동기화</p>
                <p className="text-xs text-sp-muted">일정 자동 동기화</p>
              </div>
              <button
                onClick={() => setShowCalendarPicker(true)}
                className="rounded-lg bg-sp-accent/20 px-3 py-1.5 text-xs text-sp-accent transition-colors hover:bg-sp-accent/30"
              >
                캘린더 선택 ({enabledCount})
              </button>
            </div>

            {/* 과제수합 (드라이브) */}
            <div className="flex items-center gap-3 rounded-lg border border-sp-border p-3">
              <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-400">
                <span className="material-symbols-outlined text-[18px]">folder_open</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-sp-text">과제수합 (드라이브)</p>
                <p className="text-xs text-sp-muted">학생 제출 파일을 드라이브에 저장</p>
              </div>
              <span className="text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded">사용 가능</span>
            </div>
          </div>
        </div>
      )}

      {/* 캘린더 동기화 설정 (연결된 경우만) */}
      {isConnected && (
        <div className="space-y-3 rounded-lg border border-sp-border p-4">
          <h4 className="text-sm font-semibold text-sp-text">캘린더 동기화 설정</h4>

          {/* 동기화 주기 */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-sp-muted">동기화 주기</span>
            <select
              value={syncInterval}
              onChange={(e) => setSyncInterval(Number(e.target.value))}
              className="rounded-lg border border-sp-border bg-sp-surface px-3 py-1.5 text-sm text-sp-text"
            >
              <option value={1}>1분</option>
              <option value={5}>5분</option>
              <option value={15}>15분</option>
              <option value={30}>30분</option>
            </select>
          </div>

          {/* 앱 시작 시 동기화 */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-sp-muted">앱 시작 시 동기화</span>
            <button
              type="button"
              role="switch"
              aria-checked={syncOnStart}
              onClick={() => setSyncOnStart(!syncOnStart)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${syncOnStart ? 'bg-sp-accent' : 'bg-sp-surface'}`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-white border border-gray-300 transition-transform ${syncOnStart ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
            </button>
          </div>

          {/* 창 포커스 시 동기화 */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-sp-muted">창 포커스 시 동기화</span>
            <button
              type="button"
              role="switch"
              aria-checked={syncOnFocus}
              onClick={() => setSyncOnFocus(!syncOnFocus)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${syncOnFocus ? 'bg-sp-accent' : 'bg-sp-surface'}`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-white border border-gray-300 transition-transform ${syncOnFocus ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
            </button>
          </div>

          {/* 충돌 자동 해결 */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-sp-muted">충돌 자동 해결</span>
            <button
              type="button"
              role="switch"
              aria-checked={autoResolveConflicts}
              onClick={() => setAutoResolveConflicts(!autoResolveConflicts)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoResolveConflicts ? 'bg-sp-accent' : 'bg-sp-surface'}`}
            >
              <span className={`inline-block h-5 w-5 rounded-full bg-white border border-gray-300 transition-transform ${autoResolveConflicts ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
            </button>
          </div>

          {/* 지금 동기화 버튼 */}
          <button
            onClick={() => void syncNow()}
            disabled={syncState.status === 'syncing'}
            className="w-full rounded-lg border border-sp-border px-3 py-2 text-sm text-sp-text transition-colors hover:bg-sp-surface disabled:opacity-50"
          >
            {syncState.status === 'syncing' ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-sp-muted/30 border-t-sp-muted" />
                동기화 중...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[16px]">sync</span>
                지금 동기화
              </span>
            )}
          </button>
        </div>
      )}

      {/* 개인정보처리방침 링크 */}
      <div className="pt-2">
        <button
          onClick={() => {
            const api = window.electronAPI;
            if (api?.openExternal) {
              api.openExternal('https://ssampin.com/privacy');
            } else {
              window.open('https://ssampin.com/privacy', '_blank');
            }
          }}
          className="text-xs text-sp-muted hover:text-sp-accent transition-colors flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-[14px]">description</span>
          개인정보처리방침
        </button>
      </div>

      {/* 캘린더 선택 모달 */}
      <CalendarMappingModal
        isOpen={showCalendarPicker}
        onClose={() => setShowCalendarPicker(false)}
        isInitialSetup={mappings.length === 0}
      />
    </div>
  );
}
