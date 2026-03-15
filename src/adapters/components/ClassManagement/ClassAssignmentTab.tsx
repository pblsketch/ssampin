import { useState, useEffect, useMemo } from 'react';
import { useAssignmentStore } from '@adapters/stores/useAssignmentStore';
import { useCalendarSyncStore } from '@adapters/stores/useCalendarSyncStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useOnlineStatus } from '@adapters/hooks/useOnlineStatus';
import { useToastStore } from '@adapters/components/common/Toast';
import type { AssignmentWithStatus } from '@usecases/assignment/GetAssignments';
import { AssignmentDetail } from '@adapters/components/Tools/Assignment/AssignmentDetail';
import { AssignmentCreateModal } from '@adapters/components/Tools/Assignment/AssignmentCreateModal';
import { OfflineNotice } from '@adapters/components/Tools/Assignment/OfflineNotice';

/* ──────────────── ClassAssignmentCard ──────────────── */

interface ClassAssignmentCardProps {
  assignment: AssignmentWithStatus;
  onClick: () => void;
  onDelete: (id: string) => void;
  onCopyLink: (id: string) => void;
}

function ClassAssignmentCard({ assignment, onClick, onDelete, onCopyLink }: ClassAssignmentCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  const progress = assignment.totalCount > 0
    ? Math.round((assignment.submittedCount / assignment.totalCount) * 100)
    : 0;
  const isComplete = assignment.submittedCount === assignment.totalCount && assignment.totalCount > 0;

  const deadline = new Date(assignment.deadline);
  const month = deadline.getMonth() + 1;
  const day = deadline.getDate();
  const hours = String(deadline.getHours()).padStart(2, '0');
  const minutes = String(deadline.getMinutes()).padStart(2, '0');
  const deadlineText = `${month}/${day} ${hours}:${minutes}`;

  return (
    <button
      onClick={onClick}
      className="w-full bg-sp-card rounded-xl p-4 text-left border border-sp-border hover:border-sp-accent/50 hover:shadow-lg transition-all group"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base">{assignment.isExpired ? '✅' : '📝'}</span>
          <h4 className="text-sm font-bold text-sp-text group-hover:text-sp-accent transition-colors truncate">
            {assignment.title}
          </h4>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isComplete && (
            <span className="text-xs px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-full font-medium">
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

      <div className="flex items-center gap-2 text-xs text-sp-muted mb-2.5 flex-wrap">
        <span>마감: {deadlineText}</span>
        <span className="text-sp-border">│</span>
        <span>제출: {assignment.submittedCount}/{assignment.totalCount}명</span>
      </div>

      {!assignment.isExpired && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-sp-border/50 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                isComplete ? 'bg-emerald-500' : 'bg-sp-accent'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[10px] text-sp-muted font-medium w-9 text-right">{progress}%</span>
        </div>
      )}
    </button>
  );
}

/* ──────────────── ClassAssignmentTab ──────────────── */

interface ClassAssignmentTabProps {
  classId: string;
}

export function ClassAssignmentTab({ classId }: ClassAssignmentTabProps) {
  const {
    assignments,
    isLoading,
    error,
    loadAssignments,
    needsGoogleConnect,
    clearGoogleConnectState,
    deleteAssignment,
    selectAssignment,
  } = useAssignmentStore();
  const { startAuth, isConnected: googleConnected, isLoading: googleAuthLoading } = useCalendarSyncStore();
  const showToast = useToastStore((s) => s.show);
  const classes = useTeachingClassStore((s) => s.classes);
  const { isOnline, checkOnline } = useOnlineStatus();

  const [view, setView] = useState<'list' | 'detail'>('list');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AssignmentWithStatus | null>(null);

  // 수업반명 계산
  const currentClass = useMemo(
    () => classes.find((c) => c.id === classId),
    [classes, classId],
  );
  const targetName = currentClass ? `${currentClass.name} (${currentClass.subject})` : '';

  // 이 수업반의 과제만 필터
  const classAssignments = useMemo(
    () => assignments.filter(
      (a) => a.target.type === 'teaching' && a.target.name === targetName,
    ),
    [assignments, targetName],
  );
  const activeAssignments = useMemo(() => classAssignments.filter((a) => !a.isExpired), [classAssignments]);
  const expiredAssignments = useMemo(() => classAssignments.filter((a) => a.isExpired), [classAssignments]);

  useEffect(() => {
    if (isOnline) {
      void loadAssignments();
    }
  }, [isOnline, loadAssignments]);

  async function handleGoogleConnect() {
    try {
      await startAuth();
      clearGoogleConnectState();
      await loadAssignments();
    } catch {
      // Auth cancelled or failed
    }
  }

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

  function handleDetail(assignmentId: string) {
    selectAssignment(assignmentId);
    setView('detail');
  }

  function handleBack() {
    setView('list');
  }

  // 오프라인
  if (!isOnline) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-sp-text flex items-center gap-2">
            <span className="material-symbols-outlined text-base">attach_file</span>
            과제 수합
          </h3>
        </div>
        <OfflineNotice
          onRetry={() => {
            checkOnline();
            if (navigator.onLine) void loadAssignments();
          }}
        />
      </div>
    );
  }

  // 상세 화면
  if (view === 'detail') {
    return <AssignmentDetail onBack={handleBack} />;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-sp-text flex items-center gap-2">
          <span className="material-symbols-outlined text-base">attach_file</span>
          과제 수합
          {activeAssignments.length > 0 && (
            <span className="text-sp-muted font-normal">({activeAssignments.length}개)</span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          {/* Google 연동 버튼 */}
          {googleConnected ? (
            <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-2.5 py-1.5 rounded-lg">
              <span className="material-symbols-outlined text-[14px]">check_circle</span>
              구글 연결됨
            </span>
          ) : (
            <button
              type="button"
              onClick={() => void handleGoogleConnect()}
              disabled={googleAuthLoading}
              className="flex items-center gap-1 border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
            >
              {googleAuthLoading ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-400/30 border-t-blue-400" />
              ) : (
                <span className="material-symbols-outlined text-[14px]">add_link</span>
              )}
              {googleAuthLoading ? '연결 중...' : '구글 연동'}
            </button>
          )}

          {/* 새 과제 버튼 */}
          {!needsGoogleConnect && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sp-accent text-white text-xs font-medium hover:bg-sp-accent/90 transition-colors"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              새 과제
            </button>
          )}
        </div>
      </div>

      {/* Google 계정 연결 필요 */}
      {needsGoogleConnect && (
        <div className="mb-4 p-5 bg-sp-card rounded-xl border border-sp-border/50 text-center">
          <div className="text-3xl mb-2">🔗</div>
          <h3 className="text-sm font-bold text-sp-text mb-1">Google 계정 연결이 필요합니다</h3>
          <p className="text-xs text-sp-muted mb-4">
            과제수합 기능은 Google 드라이브에 파일을 저장합니다.
          </p>
          <button
            onClick={() => void handleGoogleConnect()}
            className="px-4 py-2 bg-sp-accent text-white rounded-lg hover:bg-sp-accent/80 transition-colors flex items-center gap-2 mx-auto text-sm font-medium"
          >
            <span className="material-symbols-outlined text-[16px]">link</span>
            Google 계정 연결하기
          </button>
        </div>
      )}

      {/* 에러 메시지 */}
      {error && !needsGoogleConnect && (
        <div className="mb-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center justify-between" role="alert">
          <span className="text-red-400 text-xs">{error}</span>
          <button
            onClick={() => void loadAssignments()}
            className="text-red-400 hover:text-red-300 text-xs font-medium ml-3 whitespace-nowrap"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* 로딩 스켈레톤 */}
      {isLoading && classAssignments.length === 0 && (
        <div className="flex-1 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-sp-card rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-sp-border/50 rounded w-1/3 mb-2" />
              <div className="h-3 bg-sp-border/30 rounded w-2/3 mb-2.5" />
              <div className="h-1.5 bg-sp-border/30 rounded w-full" />
            </div>
          ))}
        </div>
      )}

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto">
        {!isLoading && classAssignments.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-sp-muted">
            <span className="text-4xl">📋</span>
            <p className="text-sm font-medium">아직 과제가 없습니다</p>
            <p className="text-xs">&quot;새 과제&quot; 버튼으로 과제를 만들어보세요</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* 진행 중 */}
            {activeAssignments.length > 0 && (
              <>
                <p className="text-xs text-sp-muted font-medium px-1">진행 중 ({activeAssignments.length})</p>
                {activeAssignments.map((assignment) => (
                  <ClassAssignmentCard
                    key={assignment.id}
                    assignment={assignment}
                    onClick={() => handleDetail(assignment.id)}
                    onDelete={(id) => setDeleteTarget(classAssignments.find((a) => a.id === id) ?? null)}
                    onCopyLink={handleCopyLink}
                  />
                ))}
              </>
            )}

            {/* 마감완료 */}
            {expiredAssignments.length > 0 && (
              <div className="opacity-70">
                <p className="text-xs text-sp-muted font-medium px-1 mt-2 mb-2">마감완료 ({expiredAssignments.length})</p>
                {expiredAssignments.map((assignment) => (
                  <ClassAssignmentCard
                    key={assignment.id}
                    assignment={assignment}
                    onClick={() => handleDetail(assignment.id)}
                    onDelete={(id) => setDeleteTarget(classAssignments.find((a) => a.id === id) ?? null)}
                    onCopyLink={handleCopyLink}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 과제 생성 모달 */}
      {showCreateModal && (
        <AssignmentCreateModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(assignmentId) => {
            setShowCreateModal(false);
            handleDetail(assignmentId);
          }}
        />
      )}

      {/* 삭제 확인 다이얼로그 */}
      {deleteTarget && (
        <>
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-sp-card rounded-2xl ring-1 ring-sp-border shadow-2xl w-full max-w-sm pointer-events-auto p-6">
              <h3 className="text-base font-bold text-sp-text mb-2">{`'${deleteTarget.title}' 과제를 삭제하시겠습니까?`}</h3>
              <p className="text-sm text-sp-muted mb-5">삭제된 과제는 복구할 수 없습니다. 드라이브에 저장된 파일은 유지됩니다.</p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 text-sp-muted hover:text-sp-text rounded-lg hover:bg-sp-border/30 transition-colors text-sm"
                >
                  취소
                </button>
                <button
                  onClick={() => void handleDeleteAssignment()}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
