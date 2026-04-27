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
        className="w-full max-w-md rounded-xl bg-sp-card border border-sp-border p-6 shadow-xl max-h-[90vh] overflow-y-auto"
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

          {/* 안내: 추가 권한 */}
          <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-4">
            <p className="text-sm font-medium text-blue-400 mb-1">추가 권한이 필요합니다</p>
            <p className="text-xs text-sp-muted">
              Google 로그인 화면이 나타나면 '할일 관리' 권한을 허용해 주세요.
              기존 캘린더 · 드라이브 연동에는 영향이 없습니다.
            </p>
          </div>

          {/* ⚠️ 검증 미완료 안내 — 사용자 우회 가이드 */}
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-4">
            <div className="flex items-start gap-2 mb-2">
              <span className="material-symbols-outlined text-amber-400 text-icon-md">warning</span>
              <p className="text-sm font-medium text-amber-400">
                "이 앱은 Google에서 확인하지 않음" 경고가 표시될 수 있어요
              </p>
            </div>
            <p className="text-xs text-sp-muted leading-relaxed">
              Google Tasks 권한은 현재 <strong className="text-sp-text">구글 검증 심사 대기 중</strong>입니다.
              <br />
              (캘린더 · 드라이브는 이미 정식 인증 완료 ✓)
            </p>
            <div className="mt-3 rounded-md bg-sp-surface/60 p-3 text-xs text-sp-muted leading-relaxed">
              <p className="font-medium text-sp-text mb-1.5">📌 경고 화면이 떴다면 이렇게 해주세요</p>
              <ol className="space-y-1 list-decimal list-inside">
                <li>왼쪽 아래 <strong className="text-sp-text">"고급"</strong> 클릭</li>
                <li><strong className="text-sp-text">"ssampin(안전하지 않음)으로 이동"</strong> 클릭</li>
                <li>'할일 관리' 권한에 체크 후 <strong className="text-sp-text">계속</strong></li>
              </ol>
              <p className="mt-2 text-detail text-sp-muted/80">
                쌤핀은 오픈소스이며 코드는 GitHub에서 직접 확인할 수 있어요. 검증이 완료되면 경고 없이 바로 연동돼요.
              </p>
            </div>
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
