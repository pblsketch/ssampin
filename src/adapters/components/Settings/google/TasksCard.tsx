import { ServiceCard } from '../shared/ServiceCard';
import { TasksScopeRequestModal } from '../modals/TasksScopeRequestModal';
import { useGoogleAccountStore } from '@adapters/stores/useGoogleAccountStore';
import { useTasksSyncStore } from '@adapters/stores/useTasksSyncStore';
import { Modal } from '@adapters/components/common/Modal';

interface TasksCardProps {
  onJumpToBackup: () => void;
}

export function TasksCard({ onJumpToBackup }: TasksCardProps) {
  const { isConnected, startAuth } = useGoogleAccountStore();
  const {
    isEnabled: tasksEnabled,
    taskListName,
    taskLists,
    isSyncing: tasksSyncing,
    lastSyncedAt: tasksLastSyncedAt,
    error: tasksError,
    showScopeRequestModal,
    showTaskListPicker,
    enableSync,
    disableSync,
    setShowScopeRequestModal,
    setShowTaskListPicker,
    fetchTaskLists,
    selectTaskList,
    syncNow: tasksSyncNow,
  } = useTasksSyncStore();

  const handleToggle = (v: boolean) => {
    if (v) {
      void enableSync();
    } else {
      void disableSync();
    }
  };

  return (
    <>
      <ServiceCard
        icon="checklist"
        iconBg="bg-green-500/10 text-green-400"
        title="Google Tasks"
        description="쌤핀 할 일을 Google Tasks와 양방향 연동 · 스마트폰에서도 확인"
        enabled={tasksEnabled}
        onToggle={handleToggle}
        disabled={!isConnected}
        collapsedHint="💡 처음 켜면 Tasks 권한을 한 번 더 동의해야 해요"
      >
        {/* 동기화 목록 */}
        <div>
          <p className="text-sm font-medium text-sp-text mb-2">동기화 목록</p>
          <div className="flex items-center gap-3 rounded-lg bg-sp-surface p-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-sp-text truncate">
                {taskListName ?? '목록을 선택해 주세요'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void fetchTaskLists().then(() => setShowTaskListPicker(true));
              }}
              className="shrink-0 px-3 py-1.5 rounded-lg border border-sp-border text-xs font-medium text-sp-muted hover:text-sp-accent hover:border-sp-accent/50 transition-colors"
            >
              목록 변경 ▸
            </button>
          </div>
        </div>

        {/* 자동 연동 안내 */}
        <div className="rounded-lg bg-sp-surface/60 p-3 text-xs text-sp-muted flex items-start gap-2">
          <span className="material-symbols-outlined text-icon-sm mt-0.5">schedule</span>
          <div className="flex-1">
            <p>⏱ 백업 카드의 자동 실행 설정을 함께 사용합니다</p>
            <p className="text-[11px] text-sp-muted/80 mt-0.5">
              (시작 시·창 포커스·주기 동기화에 함께 동작)
            </p>
          </div>
          <button
            type="button"
            onClick={onJumpToBackup}
            className="shrink-0 text-sp-accent hover:text-blue-400 font-medium"
          >
            백업 설정 보기 ↗
          </button>
        </div>

        {/* 마지막 연동 */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-sp-muted">마지막 연동</span>
          <span className="text-sp-text font-medium">
            {tasksLastSyncedAt
              ? new Date(tasksLastSyncedAt).toLocaleString('ko-KR')
              : '연동 기록 없음'}
          </span>
        </div>

        {/* 지금 연동 실행 */}
        <button
          type="button"
          onClick={() => void tasksSyncNow()}
          disabled={tasksSyncing}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sp-accent hover:bg-blue-600 text-white font-medium text-sm transition-all disabled:opacity-50"
        >
          <span
            className={`material-symbols-outlined text-icon-md ${tasksSyncing ? 'animate-spin' : ''}`}
          >
            {tasksSyncing ? 'progress_activity' : 'sync'}
          </span>
          {tasksSyncing ? '연동 중...' : '지금 연동 실행'}
        </button>

        {/* 에러 표시 */}
        {tasksError && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">
            {tasksError}
          </div>
        )}
      </ServiceCard>

      {/* Google Tasks 스코프 요청 모달 */}
      {showScopeRequestModal && (
        <TasksScopeRequestModal
          onConfirm={async () => {
            setShowScopeRequestModal(false);
            await startAuth(true, ['https://www.googleapis.com/auth/tasks']);
            // 새 토큰 propagate 대기 후 enableSync 자동 재실행 → Task list picker 즉시 노출
            await new Promise((resolve) => setTimeout(resolve, 800));
            await enableSync();
          }}
          onCancel={() => setShowScopeRequestModal(false)}
        />
      )}

      {/* Task List 선택 모달 */}
      <Modal
        isOpen={showTaskListPicker}
        onClose={() => setShowTaskListPicker(false)}
        title="동기화할 목록 선택"
        srOnlyTitle
        size="sm"
      >
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-green-500/10">
              <span className="material-symbols-outlined text-green-400">checklist</span>
            </div>
            <h3 className="text-lg font-bold text-sp-text">동기화할 목록 선택</h3>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {taskLists.length === 0 ? (
              <p className="text-sm text-sp-muted text-center py-4">목록을 불러오는 중...</p>
            ) : (
              taskLists.map((list) => (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => void selectTaskList(list.id, list.title)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-sp-border hover:border-sp-accent/50 hover:bg-sp-accent/5 text-sm text-sp-text transition-colors"
                >
                  {list.title}
                </button>
              ))
            )}
          </div>
          <div className="flex justify-end mt-4">
            <button
              type="button"
              onClick={() => setShowTaskListPicker(false)}
              className="px-4 py-2 rounded-lg border border-sp-border text-sp-muted hover:text-sp-text text-sm transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
