import { useMemo, useRef } from 'react';
import { ServiceCard } from '../shared/ServiceCard';
import { useCalendarSyncStore } from '@adapters/stores/useCalendarSyncStore';
import { useGoogleAccountStore } from '@adapters/stores/useGoogleAccountStore';
import { CalendarMappingModal } from '@adapters/components/Calendar/CalendarMappingModal';

const INTERVAL_OPTIONS = [1, 5, 15, 30] as const;

export function CalendarCard() {
  const { isConnected, error } = useGoogleAccountStore();
  const {
    mappings,
    syncInterval,
    syncOnStart,
    syncOnFocus,
    autoResolveConflicts,
    showCalendarPicker,
    syncState,
    setSyncInterval,
    setSyncOnStart,
    setSyncOnFocus,
    setAutoResolveConflicts,
    setShowCalendarPicker,
    updateMappings,
    syncNow,
  } = useCalendarSyncStore();

  const enabledMappings = useMemo(
    () => mappings.filter((m) => m.syncEnabled),
    [mappings],
  );
  const hasEnabledMapping = enabledMappings.length > 0;
  const hasAnyMapping = mappings.length > 0;

  // OFF 시점에 활성화돼 있던 매핑 ID를 캐시 → ON 복귀 시 복원용
  const lastEnabledIdsRef = useRef<readonly string[]>([]);

  const enabledSummary = useMemo(() => {
    if (enabledMappings.length === 0) return '';
    const names = enabledMappings
      .slice(0, 3)
      .map((m) => m.googleCalendarName ?? m.categoryName);
    const rest = enabledMappings.length - names.length;
    return rest > 0 ? `${names.join(', ')} 외 ${rest}개` : names.join(', ');
  }, [enabledMappings]);

  const handleToggle = (v: boolean) => {
    if (v) {
      // ON: 캐시된 categoryId가 있고 해당 매핑이 아직 살아있으면 복원, 아니면 picker 오픈
      const cached = lastEnabledIdsRef.current;
      const cachedSet = new Set(cached);
      const restorable = cached.length > 0 && mappings.some((m) => cachedSet.has(m.categoryId));
      if (restorable) {
        const next = mappings.map((m) =>
          cachedSet.has(m.categoryId) ? { ...m, syncEnabled: true } : m,
        );
        void updateMappings(next);
      } else {
        setShowCalendarPicker(true);
      }
    } else {
      // OFF: 현재 활성 매핑 categoryId 캐시 후 전부 비활성화
      lastEnabledIdsRef.current = enabledMappings.map((m) => m.categoryId);
      const next = mappings.map((m) => ({ ...m, syncEnabled: false }));
      void updateMappings(next);
    }
  };

  const lastSyncedAt = syncState.lastSyncedAt ?? null;
  const isSyncing = syncState.status === 'syncing';

  return (
    <>
      <ServiceCard
        icon="event"
        iconBg="bg-pink-500/10 text-pink-400"
        title="Google 캘린더"
        description="쌤핀 일정과 Google 캘린더를 양방향으로 연결"
        enabled={hasEnabledMapping}
        onToggle={handleToggle}
        disabled={!isConnected}
        collapsedHint="💡 양방향: 쌤핀에 추가한 일정도 Google에 올라가요 · 다시 켜면 기존 설정이 복원됩니다"
      >
        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* 권한/매핑 부족 배너 */}
        {isConnected && !hasAnyMapping && (
          <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 flex items-center gap-3">
            <span className="material-symbols-outlined text-amber-400">lock</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sp-text">🔐 캘린더 권한이 필요해요</p>
              <p className="text-xs text-sp-muted mt-0.5">
                연동할 캘린더를 선택하면 즉시 양방향 동기화가 시작됩니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCalendarPicker(true)}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-sp-accent text-white text-xs font-medium hover:bg-blue-600 transition-colors"
            >
              캘린더 선택하기
            </button>
          </div>
        )}

        {/* 동기화할 캘린더 */}
        <div>
          <p className="text-sm font-medium text-sp-text mb-2">동기화할 캘린더</p>
          <div className="flex items-center gap-3 rounded-lg bg-sp-surface p-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-sp-text truncate">
                {enabledSummary || '선택된 캘린더가 없습니다'}
              </p>
              {enabledMappings.length > 0 && (
                <p className="text-xs text-sp-muted mt-0.5">
                  {enabledMappings.length}개 캘린더 동기화 중
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowCalendarPicker(true)}
              className="shrink-0 px-3 py-1.5 rounded-lg border border-sp-border text-xs font-medium text-sp-muted hover:text-sp-accent hover:border-sp-accent/50 transition-colors"
            >
              선택 변경 ▸
            </button>
          </div>
        </div>

        {/* 연동 주기 */}
        <div>
          <p className="text-sm font-medium text-sp-text mb-2">연동 주기</p>
          <div className="flex gap-2 flex-wrap">
            {INTERVAL_OPTIONS.map((min) => (
              <button
                key={min}
                type="button"
                onClick={() => setSyncInterval(min)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  syncInterval === min
                    ? 'bg-sp-accent text-white'
                    : 'bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border'
                }`}
              >
                {min}분
              </button>
            ))}
          </div>
        </div>

        {/* 트리거 */}
        <div>
          <p className="text-sm font-medium text-sp-text mb-2">트리거</p>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setSyncOnStart(!syncOnStart)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                syncOnStart
                  ? 'bg-sp-accent text-white'
                  : 'bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border'
              }`}
            >
              시작 시
            </button>
            <button
              type="button"
              onClick={() => setSyncOnFocus(!syncOnFocus)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                syncOnFocus
                  ? 'bg-sp-accent text-white'
                  : 'bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border'
              }`}
            >
              창 포커스 시
            </button>
          </div>
        </div>

        {/* 충돌 자동 해결 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-sp-text">충돌 시 자동 해결</p>
            <p className="text-xs text-sp-muted mt-0.5">
              양쪽 변경이 겹칠 때 최신 버전을 자동 선택합니다
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoResolveConflicts}
            onClick={() => setAutoResolveConflicts(!autoResolveConflicts)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              autoResolveConflicts ? 'bg-sp-accent' : 'bg-sp-surface'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white border border-gray-300 transition-transform ${
                autoResolveConflicts ? 'translate-x-[22px]' : 'translate-x-[2px]'
              }`}
            />
          </button>
        </div>

        {/* 마지막 연동 */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-sp-muted">마지막 연동</span>
          <span className="text-sp-text font-medium">
            {lastSyncedAt
              ? new Date(lastSyncedAt).toLocaleString('ko-KR')
              : '연동 기록 없음'}
          </span>
        </div>

        {/* 지금 연동 실행 */}
        <button
          type="button"
          onClick={() => void syncNow()}
          disabled={isSyncing || !hasEnabledMapping}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sp-accent hover:bg-blue-600 text-white font-medium text-sm transition-all disabled:opacity-50"
        >
          <span
            className={`material-symbols-outlined text-icon-md ${isSyncing ? 'animate-spin' : ''}`}
          >
            {isSyncing ? 'progress_activity' : 'sync'}
          </span>
          {isSyncing ? '연동 중...' : '지금 연동 실행'}
        </button>
      </ServiceCard>

      {/* 캘린더 매핑 모달 (기존 컴포넌트 재사용) */}
      <CalendarMappingModal
        isOpen={showCalendarPicker}
        onClose={() => setShowCalendarPicker(false)}
        isInitialSetup={mappings.length === 0}
      />
    </>
  );
}
