import { useCalendarSyncStore } from '@adapters/stores/useCalendarSyncStore';

const STATUS_CONFIG: Record<string, { icon: string; text: string; color: string; animate?: boolean }> = {
  idle: { icon: 'cloud_done', text: '대기', color: 'text-sp-muted' },
  syncing: { icon: 'sync', text: '동기화 중...', color: 'text-blue-400', animate: true },
  synced: { icon: 'cloud_done', text: '동기화됨', color: 'text-green-400' },
  error: { icon: 'cloud_off', text: '오류', color: 'text-red-400' },
  offline: { icon: 'cloud_off', text: '오프라인', color: 'text-yellow-400' },
};

export function SyncStatusBar() {
  const { isConnected, syncState, conflicts, syncNow } = useCalendarSyncStore();

  if (!isConnected) return null;

  const config = STATUS_CONFIG[syncState.status] ?? STATUS_CONFIG['idle']!;

  return (
    <div className="px-4 py-2">
      <button
        onClick={() => void syncNow()}
        disabled={syncState.status === 'syncing'}
        className="flex items-center gap-2 w-full rounded-lg px-3 py-1.5 text-xs hover:bg-white/5 transition-colors disabled:opacity-50"
        title="클릭하여 동기화"
      >
        <span className={`material-symbols-outlined text-[16px] ${config.color} ${config.animate ? 'animate-spin' : ''}`}>
          {config.icon}
        </span>
        <span className={`${config.color} flex-1 text-left`}>
          구글 캘린더 {config.text}
        </span>
        {conflicts.length > 0 && (
          <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white font-bold">
            {conflicts.length}
          </span>
        )}
      </button>
    </div>
  );
}
