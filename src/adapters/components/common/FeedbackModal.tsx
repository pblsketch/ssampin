const FEEDBACK_FORM_URL = 'https://forms.gle/o1X4zLYocUpFKCzy7';

interface FeedbackModalProps {
  onClose: () => void;
}

export function FeedbackModal({ onClose }: FeedbackModalProps) {
  function handleOpen() {
    window.open(FEEDBACK_FORM_URL, '_blank');
    onClose();
  }

  return (
    <>
      {/* 오버레이 */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 모달 */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-sp-card rounded-2xl ring-1 ring-sp-border shadow-2xl w-full max-w-sm pointer-events-auto flex flex-col">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-sp-border/40">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-sp-accent/10">
                <span className="material-symbols-outlined text-sp-accent">rate_review</span>
              </div>
              <h2 className="text-lg font-bold text-sp-text">건의사항 보내기</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-sp-muted hover:text-sp-text transition-colors rounded-lg p-1 hover:bg-white/5"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          <div className="px-6 py-5 flex flex-col gap-5">
            {/* 안내 */}
            <div className="flex flex-col gap-3">
              <p className="text-sm text-sp-text leading-relaxed">
                버그 신고, 기능 개선 아이디어, 불편한 점 등 무엇이든 자유롭게 알려주세요.
              </p>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-sp-surface border border-sp-border">
                <span className="material-symbols-outlined text-sp-accent text-[18px]">timer</span>
                <span className="text-xs text-sp-muted">소요 시간 약 2분 · 구글 폼이 브라우저에서 열립니다</span>
              </div>
            </div>

            {/* 버튼 */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-xl border border-sp-border text-sp-muted hover:text-sp-text hover:bg-white/5 text-sm font-medium transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleOpen}
                className="flex-1 px-4 py-2.5 rounded-xl bg-sp-accent hover:bg-blue-600 text-white text-sm font-semibold transition-colors shadow-lg shadow-sp-accent/20 flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                폼 열기
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
