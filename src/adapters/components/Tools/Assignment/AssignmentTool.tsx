import { useState, useEffect } from 'react';
import { useAssignmentStore } from '@adapters/stores/useAssignmentStore';
import { useCalendarSyncStore } from '@adapters/stores/useCalendarSyncStore';
import { useOnlineStatus } from '@adapters/hooks/useOnlineStatus';
import type { AssignmentWithStatus } from '@usecases/assignment/GetAssignments';
import { AssignmentCreateModal } from './AssignmentCreateModal';
import { OfflineNotice } from './OfflineNotice';

interface AssignmentToolProps {
  onBack: () => void;
  onDetail: (assignmentId: string) => void;
}

export function AssignmentTool({ onBack, onDetail }: AssignmentToolProps) {
  const { assignments, isLoading, error, loadAssignments, needsGoogleConnect, clearGoogleConnectState } = useAssignmentStore();
  const startAuth = useCalendarSyncStore((s) => s.startAuth);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { isOnline, checkOnline } = useOnlineStatus();

  async function handleGoogleConnect() {
    try {
      await startAuth();
      // Auth succeeded, clear the connect state and reload
      clearGoogleConnectState();
      await loadAssignments();
    } catch {
      // Auth cancelled or failed - startAuth already handles its own errors
    }
  }

  useEffect(() => {
    if (isOnline) {
      loadAssignments();
    }
  }, [isOnline]);

  const activeAssignments = assignments.filter((a) => !a.isExpired);
  const expiredAssignments = assignments.filter((a) => a.isExpired);

  if (!isOnline) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={onBack} aria-label="뒤로" className="p-2 rounded-lg hover:bg-sp-card transition-colors">
              <span className="material-symbols-outlined text-sp-muted">arrow_back</span>
            </button>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <span>📋</span>
              <span>과제수합</span>
            </h1>
          </div>
        </div>
        <OfflineNotice
          onRetry={() => {
            checkOnline();
            if (navigator.onLine) loadAssignments();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={onBack} aria-label="뒤로" className="p-2 rounded-lg hover:bg-sp-card transition-colors">
            <span className="material-symbols-outlined text-sp-muted">arrow_back</span>
          </button>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <span>📋</span>
            <span>과제수합</span>
          </h1>
        </div>
        {!needsGoogleConnect && (
          <button
            onClick={() => setShowCreateModal(true)}
            aria-label="새 과제"
            className="px-4 py-2 bg-sp-accent text-white rounded-lg hover:bg-sp-accent/80 transition-colors flex items-center gap-2 text-sm font-medium"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            새 과제
          </button>
        )}
      </div>

      {/* Google 계정 연결 필요 */}
      {needsGoogleConnect && (
        <div className="mb-6 p-6 bg-sp-card rounded-xl border border-sp-border/50 text-center">
          <div className="text-4xl mb-3">🔗</div>
          <h3 className="text-base font-bold text-sp-text mb-2">Google 계정 연결이 필요합니다</h3>
          <p className="text-sm text-sp-muted mb-1">
            과제수합 기능은 Google 드라이브에 파일을 저장합니다.
          </p>
          <p className="text-sm text-sp-muted mb-5">
            계정을 연결하면 자동으로 드라이브 폴더가 생성됩니다.
          </p>
          <button
            onClick={() => void handleGoogleConnect()}
            className="px-6 py-3 bg-sp-accent text-white rounded-lg hover:bg-sp-accent/80 transition-colors flex items-center gap-2 mx-auto font-medium"
          >
            <span className="material-symbols-outlined text-[18px]">link</span>
            Google 계정 연결하기
          </button>
        </div>
      )}

      {/* Error message (non-Google errors only) */}
      {error && !needsGoogleConnect && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center justify-between" role="alert">
          <span className="text-red-400 text-sm">{error}</span>
          <button
            onClick={() => void loadAssignments()}
            className="text-red-400 hover:text-red-300 text-sm font-medium ml-3 whitespace-nowrap"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* Loading */}
      {isLoading && assignments.length === 0 && (
        <div className="flex-1 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-sp-card rounded-xl p-5 animate-pulse">
              <div className="h-5 bg-sp-border/50 rounded w-1/3 mb-3" />
              <div className="h-4 bg-sp-border/30 rounded w-2/3 mb-3" />
              <div className="h-2 bg-sp-border/30 rounded w-full" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && assignments.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-5xl mb-4">📋</div>
            <h2 className="text-lg font-bold text-sp-text mb-2">과제가 없습니다</h2>
            <p className="text-sp-muted mb-6">[+ 새 과제]를 눌러 시작하세요.</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-sp-accent text-white rounded-lg hover:bg-sp-accent/80 transition-colors flex items-center gap-2 mx-auto"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              새 과제
            </button>
          </div>
        </div>
      )}

      {/* Assignment list */}
      {assignments.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-6">
          {/* Active assignments */}
          {activeAssignments.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-sp-muted uppercase tracking-wider mb-3">진행중</h2>
              <div className="space-y-3">
                {activeAssignments.map((assignment) => (
                  <AssignmentCard
                    key={assignment.id}
                    assignment={assignment}
                    onClick={() => onDetail(assignment.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Expired assignments */}
          {expiredAssignments.length > 0 && (
            <div className="opacity-70">
              <h2 className="text-sm font-semibold text-sp-muted uppercase tracking-wider mb-3">마감완료</h2>
              <div className="space-y-3">
                {expiredAssignments.map((assignment) => (
                  <AssignmentCard
                    key={assignment.id}
                    assignment={assignment}
                    onClick={() => onDetail(assignment.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create modal */}
      {showCreateModal && (
        <AssignmentCreateModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(assignmentId) => {
            setShowCreateModal(false);
            onDetail(assignmentId);
          }}
        />
      )}
    </div>
  );
}

/** Single assignment card */
function AssignmentCard({
  assignment,
  onClick,
}: {
  assignment: AssignmentWithStatus;
  onClick: () => void;
}) {
  const progress = assignment.totalCount > 0
    ? Math.round((assignment.submittedCount / assignment.totalCount) * 100)
    : 0;
  const isComplete = assignment.submittedCount === assignment.totalCount && assignment.totalCount > 0;

  // Format deadline
  const deadline = new Date(assignment.deadline);
  const month = deadline.getMonth() + 1;
  const day = deadline.getDate();
  const hours = String(deadline.getHours()).padStart(2, '0');
  const minutes = String(deadline.getMinutes()).padStart(2, '0');
  const deadlineText = `${month}/${day} ${hours}:${minutes}`;

  return (
    <button
      onClick={onClick}
      className="w-full bg-sp-card rounded-xl p-5 text-left border border-transparent hover:border-sp-accent/30 hover:scale-[1.01] transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{assignment.isExpired ? '✅' : '📝'}</span>
          <h3 className="text-base font-bold text-sp-text group-hover:text-sp-accent transition-colors">
            {assignment.title}
          </h3>
        </div>
        {isComplete && (
          <span className="text-xs px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded-full font-medium">
            완료!
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 text-sm text-sp-muted mb-3">
        <span>{assignment.target.name}</span>
        <span className="text-sp-border">│</span>
        <span>마감: {deadlineText}</span>
        <span className="text-sp-border">│</span>
        <span>제출: {assignment.submittedCount}/{assignment.totalCount}명</span>
      </div>

      {/* Progress bar */}
      {!assignment.isExpired && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-sp-border/50 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                isComplete ? 'bg-emerald-500' : 'bg-sp-accent'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-sp-muted font-medium w-10 text-right">{progress}%</span>
        </div>
      )}
    </button>
  );
}
