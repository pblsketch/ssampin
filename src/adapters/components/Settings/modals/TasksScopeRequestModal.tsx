interface TasksScopeRequestModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function TasksScopeRequestModal({ onConfirm, onCancel }: TasksScopeRequestModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-xl bg-sp-card border border-sp-border p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 아이콘 + 제목 */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-green-500/10">
            <span className="material-symbols-outlined text-green-400">checklist</span>
          </div>
          <h3 className="text-lg font-bold text-sp-text">Google 할일 연동</h3>
        </div>

        {/* 설명 */}
        <div className="space-y-3">
          <p className="text-sm text-sp-muted">
            쌤핀의 할 일을 Google Tasks와 동기화할 수 있습니다.
          </p>
          <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-4">
            <p className="text-sm font-medium text-blue-400 mb-1">추가 권한이 필요합니다</p>
            <p className="text-xs text-sp-muted">
              Google 로그인 화면이 나타나면 '할일 관리' 권한을 허용해 주세요.
              기존 캘린더 연동에는 영향이 없습니다.
            </p>
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-sp-border text-sp-muted hover:text-sp-text text-sm transition-colors"
          >
            나중에
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-sp-accent text-white hover:bg-blue-600 text-sm font-medium transition-colors"
          >
            연동하기
          </button>
        </div>
      </div>
    </div>
  );
}
