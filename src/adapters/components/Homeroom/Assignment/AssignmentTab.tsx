import { useState, useEffect, useMemo } from 'react';
import { useAssignmentStore } from '@adapters/stores/useAssignmentStore';
import { useCalendarSyncStore } from '@adapters/stores/useCalendarSyncStore';
import { useOnlineStatus } from '@adapters/hooks/useOnlineStatus';
import { SITE_URL } from '@config/siteUrl';
import { useToastStore } from '@adapters/components/common/Toast';
import type { AssignmentWithStatus } from '@usecases/assignment/GetAssignments';
import { AssignmentCard } from '@adapters/components/Tools/Assignment/AssignmentTool';
import { AssignmentDetail } from '@adapters/components/Tools/Assignment/AssignmentDetail';
import { AssignmentCreateModal } from '@adapters/components/Tools/Assignment/AssignmentCreateModal';
import { OfflineNotice } from '@adapters/components/Tools/Assignment/OfflineNotice';
import { useStudentLists } from '@adapters/hooks/useStudentLists';

export function AssignmentTab() {
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
  const { isOnline, checkOnline } = useOnlineStatus();
  const studentLists = useStudentLists();
  const homeroomTarget = useMemo(
    () => studentLists.find((sl) => sl.type === 'class'),
    [studentLists],
  );

  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AssignmentWithStatus | null>(null);

  // 담임반 과제만 필터 (target.type === 'class')
  const classAssignments = useMemo(
    () => assignments.filter((a) => a.target.type === 'class'),
    [assignments],
  );

  const activeAssignments = useMemo(
    () => classAssignments.filter((a) => !a.isExpired),
    [classAssignments],
  );
  const expiredAssignments = useMemo(
    () => classAssignments.filter((a) => a.isExpired),
    [classAssignments],
  );

  useEffect(() => {
    if (isOnline) {
      void loadAssignments();
    }
  }, [isOnline]);

  function handleDetail(id: string) {
    selectAssignment(id); // AssignmentDetail이 selectedAssignmentId를 읽으므로 스토어에도 반영
    setSelectedId(id);
    setView('detail');
  }

  function handleBack() {
    setView('list');
    setSelectedId(null);
  }

  async function handleGoogleConnect() {
    try {
      await startAuth();
      clearGoogleConnectState();
      await loadAssignments();
    } catch {
      // 인증 취소 또는 실패 — startAuth가 자체적으로 처리
    }
  }

  function handleCopyLink(assignmentId: string) {
    const url = `${SITE_URL}/submit/${assignmentId}`;
    void navigator.clipboard.writeText(url);
    showToast('제출 링크가 복사되었습니다', 'success');
  }

  async function handleDeleteAssignment() {
    if (!deleteTarget) return;
    await deleteAssignment(deleteTarget.id);
    setDeleteTarget(null);
  }

  // 상세 뷰
  if (view === 'detail' && selectedId) {
    return <AssignmentDetail onBack={handleBack} />;
  }

  // 오프라인
  if (!isOnline) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <OfflineNotice
          onRetry={() => {
            checkOnline();
            if (navigator.onLine) void loadAssignments();
          }}
        />
      </div>
    );
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
          {/* Google 연동 상태 */}
          {googleConnected ? (
            <span className="flex items-center gap-1 text-xs text-green-400 bg-green-500/10 px-2.5 py-1.5 rounded-lg">
              <span className="material-symbols-outlined text-icon-sm">check_circle</span>
              연결됨
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
                <span className="material-symbols-outlined text-icon-sm">add_link</span>
              )}
              {googleAuthLoading ? '연결 중...' : '구글 연동'}
            </button>
          )}
          {/* 새 과제 버튼 — Google 연결 안내 중에는 숨김 */}
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
          <h3 className="text-sm font-bold text-sp-text mb-1.5">Google 계정 연결이 필요합니다</h3>
          <p className="text-xs text-sp-muted mb-1">
            과제수합 기능은 Google 드라이브에 파일을 저장합니다.
          </p>
          <p className="text-xs text-sp-muted mb-4">
            계정을 연결하면 자동으로 드라이브 폴더가 생성됩니다.
          </p>
          <button
            onClick={() => void handleGoogleConnect()}
            className="px-4 py-2 bg-sp-accent text-white rounded-lg hover:bg-sp-accent/80 transition-colors flex items-center gap-2 mx-auto text-sm font-medium"
          >
            <span className="material-symbols-outlined text-icon">link</span>
            Google 계정 연결하기
          </button>
        </div>
      )}

      {/* 에러 (Google 에러 제외) */}
      {error && !needsGoogleConnect && (
        <div
          className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center justify-between"
          role="alert"
        >
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
              <div className="h-4 bg-sp-border/50 rounded w-1/3 mb-2.5" />
              <div className="h-3 bg-sp-border/30 rounded w-2/3 mb-2.5" />
              <div className="h-2 bg-sp-border/30 rounded w-full" />
            </div>
          ))}
        </div>
      )}

      {/* 빈 상태 */}
      {!isLoading && classAssignments.length === 0 && !needsGoogleConnect && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12 text-sp-muted">
          <span className="text-4xl">📋</span>
          <p className="text-sm font-medium">담임반 과제가 없습니다</p>
          <p className="text-xs">위의 &quot;새 과제&quot; 버튼으로 첫 과제를 만들어보세요</p>
        </div>
      )}

      {/* 과제 목록 */}
      {classAssignments.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-5">
          {/* 진행 중 */}
          {activeAssignments.length > 0 && (
            <div>
              <p className="text-xs text-sp-muted font-medium px-1 mb-2.5">
                진행 중 ({activeAssignments.length})
              </p>
              <div className="space-y-3">
                {activeAssignments.map((a) => (
                  <AssignmentCard
                    key={a.id}
                    assignment={a}
                    onClick={() => handleDetail(a.id)}
                    onDelete={(id) =>
                      setDeleteTarget(assignments.find((x) => x.id === id) ?? null)
                    }
                    onCopyLink={handleCopyLink}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 마감 완료 */}
          {expiredAssignments.length > 0 && (
            <div className="opacity-70">
              <p className="text-xs text-sp-muted font-medium px-1 mb-2.5">
                마감 완료 ({expiredAssignments.length})
              </p>
              <div className="space-y-3">
                {expiredAssignments.map((a) => (
                  <AssignmentCard
                    key={a.id}
                    assignment={a}
                    onClick={() => handleDetail(a.id)}
                    onDelete={(id) =>
                      setDeleteTarget(assignments.find((x) => x.id === id) ?? null)
                    }
                    onCopyLink={handleCopyLink}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 과제 생성 모달 */}
      {showCreateModal && (
        <AssignmentCreateModal
          defaultTarget={homeroomTarget}
          onClose={() => setShowCreateModal(false)}
          onCreated={(id) => {
            setShowCreateModal(false);
            handleDetail(id);
          }}
        />
      )}

      {/* 삭제 확인 다이얼로그 */}
      {deleteTarget && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => setDeleteTarget(null)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-sp-card rounded-2xl ring-1 ring-sp-border shadow-2xl w-full max-w-sm pointer-events-auto p-6">
              <h3 className="text-base font-bold text-sp-text mb-2">
                {`'${deleteTarget.title}' 과제를 삭제하시겠습니까?`}
              </h3>
              <p className="text-sm text-sp-muted mb-6">
                삭제된 과제는 복구할 수 없습니다. 드라이브에 저장된 파일은 유지됩니다.
              </p>
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
