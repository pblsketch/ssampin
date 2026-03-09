import { useState, useEffect } from 'react';
import { useAssignmentStore } from '@adapters/stores/useAssignmentStore';
import { useCalendarSyncStore } from '@adapters/stores/useCalendarSyncStore';
import { useOnlineStatus } from '@adapters/hooks/useOnlineStatus';
import { useToastStore } from '@adapters/components/common/Toast';
import type { AssignmentWithStatus } from '@usecases/assignment/GetAssignments';
import { AssignmentCreateModal } from './AssignmentCreateModal';
import { OfflineNotice } from './OfflineNotice';

interface AssignmentToolProps {
  onBack: () => void;
  onDetail: (assignmentId: string) => void;
}

export function AssignmentTool({ onBack, onDetail }: AssignmentToolProps) {
  const { assignments, isLoading, error, loadAssignments, needsGoogleConnect, clearGoogleConnectState, deleteAssignment } = useAssignmentStore();
  const { startAuth, isConnected: googleConnected, isLoading: googleAuthLoading } = useCalendarSyncStore();
  const showToast = useToastStore((s) => s.show);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AssignmentWithStatus | null>(null);
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

  function handleCopyLink(assignmentId: string) {
    const url = `https://ssampin.vercel.app/submit/${assignmentId}`;
    navigator.clipboard.writeText(url);
    showToast('제출 링크가 복사되었습니다', 'success');
  }

  async function handleDeleteAssignment() {
    if (!deleteTarget) return;
    await deleteAssignment(deleteTarget.id);
    setDeleteTarget(null);
  }

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
        <div className="flex items-center gap-2">
          {/* 구글 연동 버튼 */}
          {googleConnected ? (
            <span className="flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 px-3 py-2 rounded-lg" title="구글 계정 연결됨">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              구글 연결됨
            </span>
          ) : (
            <button
              type="button"
              onClick={() => void handleGoogleConnect()}
              disabled={googleAuthLoading}
              className="flex items-center gap-1.5 border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
              title="구글 계정 연결"
            >
              {googleAuthLoading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-400/30 border-t-blue-400" />
              ) : (
                <span className="material-symbols-outlined text-[16px]">add_link</span>
              )}
              {googleAuthLoading ? '연결 중...' : '구글 연동'}
            </button>
          )}
          {/* 새 과제 버튼 */}
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
                    onDelete={(id) => setDeleteTarget(assignments.find((a) => a.id === id) ?? null)}
                    onCopyLink={handleCopyLink}
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
                    onDelete={(id) => setDeleteTarget(assignments.find((a) => a.id === id) ?? null)}
                    onCopyLink={handleCopyLink}
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

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <>
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-sp-card rounded-2xl ring-1 ring-sp-border shadow-2xl w-full max-w-sm pointer-events-auto p-6">
              <h3 className="text-lg font-bold text-sp-text mb-2">{`'${deleteTarget.title}' 과제를 삭제하시겠습니까?`}</h3>
              <p className="text-sm text-sp-muted mb-6">삭제된 과제는 복구할 수 없습니다. 드라이브에 저장된 파일은 유지됩니다.</p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sp-muted hover:text-sp-text rounded-lg hover:bg-sp-border/30 transition-colors text-sm">취소</button>
                <button onClick={() => void handleDeleteAssignment()} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm">삭제</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Single assignment card */
function AssignmentCard({
  assignment,
  onClick,
  onDelete,
  onCopyLink,
}: {
  assignment: AssignmentWithStatus;
  onClick: () => void;
  onDelete: (id: string) => void;
  onCopyLink: (id: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

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
        <div className="flex items-center gap-1">
          {isComplete && (
            <span className="text-xs px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded-full font-medium">
              완료!
            </span>
          )}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 rounded hover:bg-sp-border/40 transition-colors opacity-0 group-hover:opacity-100"
              aria-label="메뉴"
            >
              <span className="material-symbols-outlined text-sp-muted text-[18px]">more_vert</span>
            </button>
            {showMenu && (
              <div className="absolute right-0 top-8 bg-sp-card border border-sp-border rounded-lg shadow-xl py-1 min-w-[120px] z-10">
                <button
                  onClick={() => { setShowMenu(false); onCopyLink(assignment.id); }}
                  className="w-full px-4 py-2 text-left text-sm text-sp-text hover:bg-sp-border/30 transition-colors"
                >
                  링크 복사
                </button>
                <button
                  onClick={() => { setShowMenu(false); onDelete(assignment.id); }}
                  className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-sp-border/30 transition-colors"
                >
                  과제 삭제
                </button>
              </div>
            )}
          </div>
        </div>
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
