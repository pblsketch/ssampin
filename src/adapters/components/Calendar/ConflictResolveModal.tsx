import { useCalendarSyncStore } from '@adapters/stores/useCalendarSyncStore';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import type { GoogleCalendarEvent } from '@domain/ports/IGoogleCalendarPort';

interface ConflictResolveModalProps {
  onClose: () => void;
}

export function ConflictResolveModal({ onClose }: ConflictResolveModalProps) {
  const { conflicts, resolveConflict } = useCalendarSyncStore();

  if (conflicts.length === 0) return null;

  const handleResolveAll = async (resolution: 'local' | 'remote') => {
    for (let i = conflicts.length - 1; i >= 0; i--) {
      await resolveConflict(i, resolution);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-sp-card rounded-xl border border-sp-border p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-sp-text">동기화 충돌 해결</h2>
          <span className="text-sm text-sp-muted">{conflicts.length}건</span>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => void handleResolveAll('local')}
            className="flex-1 rounded-lg border border-sp-border px-3 py-2 text-sm text-sp-text hover:bg-sp-surface transition-colors"
          >
            모두 쌤핀 우선
          </button>
          <button
            onClick={() => void handleResolveAll('remote')}
            className="flex-1 rounded-lg border border-sp-border px-3 py-2 text-sm text-sp-text hover:bg-sp-surface transition-colors"
          >
            모두 구글 우선
          </button>
        </div>

        <div className="space-y-4">
          {conflicts.map((conflict, index) => (
            <ConflictCard
              key={`${conflict.local.id}-${index}`}
              local={conflict.local}
              remote={conflict.remote}
              onResolve={(resolution) => void resolveConflict(index, resolution)}
            />
          ))}
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-lg bg-sp-surface px-4 py-2 text-sm text-sp-muted hover:text-sp-text transition-colors"
        >
          닫기
        </button>
      </div>
    </div>
  );
}

function ConflictCard({ local, remote, onResolve }: {
  local: SchoolEvent;
  remote: GoogleCalendarEvent;
  onResolve: (resolution: 'local' | 'remote') => void;
}) {
  return (
    <div className="rounded-lg border border-sp-border p-4">
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div className="rounded-lg bg-sp-surface p-3">
          <p className="text-xs font-medium text-blue-400 mb-2">쌤핀 버전</p>
          <p className="text-sm font-medium text-sp-text">{local.title}</p>
          <p className="text-xs text-sp-muted mt-1">{local.date}{local.time ? ` ${local.time}` : ''}</p>
          {local.description && <p className="text-xs text-sp-muted mt-1 line-clamp-2">{local.description}</p>}
        </div>
        <div className="rounded-lg bg-sp-surface p-3">
          <p className="text-xs font-medium text-green-400 mb-2">구글 버전</p>
          <p className="text-sm font-medium text-sp-text">{remote.summary}</p>
          <p className="text-xs text-sp-muted mt-1">
            {remote.start.date ?? remote.start.dateTime?.substring(0, 16).replace('T', ' ')}
          </p>
          {remote.description && <p className="text-xs text-sp-muted mt-1 line-clamp-2">{remote.description}</p>}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onResolve('local')}
          className="flex-1 rounded-lg bg-blue-500/10 border border-blue-500/30 px-3 py-1.5 text-xs text-blue-400 hover:bg-blue-500/20 transition-colors"
        >
          쌤핀 버전 유지
        </button>
        <button
          onClick={() => onResolve('remote')}
          className="flex-1 rounded-lg bg-green-500/10 border border-green-500/30 px-3 py-1.5 text-xs text-green-400 hover:bg-green-500/20 transition-colors"
        >
          구글 버전 사용
        </button>
      </div>
    </div>
  );
}
