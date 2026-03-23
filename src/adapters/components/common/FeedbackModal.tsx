import { useAnalytics } from '@adapters/hooks/useAnalytics';

const FEEDBACK_FORM_URL = 'https://forms.gle/o1X4zLYocUpFKCzy7';

interface FeedbackModalProps {
  onClose: () => void;
}

export function FeedbackModal({ onClose }: FeedbackModalProps) {
  const { track } = useAnalytics();

  function handleOpenChat() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const openChat = (window as any).__ssampin_open_chat;
    if (typeof openChat === 'function') {
      openChat();
    }
    track('feedback_submit');
    onClose();
  }

  function handleOpenForm() {
    window.open(FEEDBACK_FORM_URL, '_blank');
    track('feedback_submit');
  }

  return (
    <>
      {/* 오버레이 */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* 모달 */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-sp-card rounded-2xl ring-1 ring-sp-border shadow-2xl w-full max-w-lg pointer-events-auto flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title-feedback"
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-sp-border/40">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-sp-accent/10">
                <span className="material-symbols-outlined text-sp-accent">rate_review</span>
              </div>
              <div>
                <h2 id="modal-title-feedback" className="text-lg font-bold text-sp-text">의견을 보내주세요</h2>
                <p className="text-xs text-sp-muted mt-0.5">선생님의 피드백이 쌤핀을 더 좋게 만듭니다</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="text-sp-muted hover:text-sp-text transition-colors rounded-lg p-1 hover:bg-sp-text/5"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          {/* 카드 그리드 */}
          <div className="px-6 py-5 grid grid-cols-2 gap-4">
            {/* AI 도우미 카드 */}
            <button
              type="button"
              onClick={handleOpenChat}
              className="group flex flex-col rounded-xl border border-sp-border bg-sp-surface p-4 text-left transition-all duration-200 hover:scale-[1.02] hover:border-sp-accent hover:bg-sp-surface/80"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-sp-accent text-[22px]">smart_toy</span>
                <span className="text-sm font-bold text-sp-text">AI 도우미</span>
                <span className="ml-auto flex items-center gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-caption text-emerald-400">온라인</span>
                </span>
              </div>
              <p className="text-xs text-sp-muted mb-3 leading-relaxed">
                쌤핀 AI에게 바로 물어보세요!
              </p>
              <ul className="space-y-1.5 text-xs text-sp-muted mb-4 flex-1">
                <li className="flex items-center gap-1.5">
                  <span className="text-sp-accent text-micro">●</span> 사용법 질문
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-sp-accent text-micro">●</span> 버그 신고 &amp; 기능 제안
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-sp-accent text-micro">●</span> 즉시 답변
                </li>
              </ul>
              <div className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-sp-accent text-white text-xs font-semibold transition-colors group-hover:bg-blue-500">
                <span className="material-symbols-outlined text-icon">smart_toy</span>
                AI에게 물어보기
              </div>
            </button>

            {/* 건의사항 카드 */}
            <button
              type="button"
              onClick={handleOpenForm}
              className="group flex flex-col rounded-xl border border-sp-border bg-sp-surface p-4 text-left transition-all duration-200 hover:scale-[1.02] hover:border-sp-accent hover:bg-sp-surface/80"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-sp-accent text-[22px]">assignment</span>
                <span className="text-sm font-bold text-sp-text">건의사항 보내기</span>
              </div>
              <p className="text-xs text-sp-muted mb-3 leading-relaxed">
                설문지로 의견을 보내주세요
              </p>
              <ul className="space-y-1.5 text-xs text-sp-muted mb-4 flex-1">
                <li className="flex items-center gap-1.5">
                  <span className="text-sp-accent text-micro">●</span> 기능 제안
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-sp-accent text-micro">●</span> 상세 건의사항
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-sp-accent text-micro">●</span> 개선 아이디어
                </li>
              </ul>
              <div className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg border border-sp-border text-sp-text text-xs font-semibold transition-colors group-hover:bg-sp-card">
                <span className="material-symbols-outlined text-icon">open_in_new</span>
                설문지 열기
              </div>
            </button>
          </div>

          {/* 하단 안내 */}
          <div className="px-6 pb-5">
            <p className="text-detail text-sp-muted text-center bg-sp-surface/50 rounded-lg py-2 px-3 border border-sp-border/30">
              사용법이 궁금하면 <span className="text-sp-accent font-medium">AI에게</span>, 자세한 의견은 <span className="text-sp-accent font-medium">설문지</span>로 보내주시면 큰 도움이 됩니다!
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
