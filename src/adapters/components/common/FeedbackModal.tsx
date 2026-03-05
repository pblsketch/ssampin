const FEEDBACK_FORM_URL = 'https://forms.gle/o1X4zLYocUpFKCzy7';
const TAWK_CHAT_URL = 'https://tawk.to/chat/69a8d3ce962d031c378f34a2/1jitnmnoc';

interface FeedbackModalProps {
  onClose: () => void;
}

export function FeedbackModal({ onClose }: FeedbackModalProps) {
  function handleOpenChat() {
    window.open(TAWK_CHAT_URL, '_blank');
  }

  function handleOpenForm() {
    window.open(FEEDBACK_FORM_URL, '_blank');
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
        <div className="bg-sp-card rounded-2xl ring-1 ring-sp-border shadow-2xl w-full max-w-lg pointer-events-auto flex flex-col">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-sp-border/40">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-sp-accent/10">
                <span className="material-symbols-outlined text-sp-accent">rate_review</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-sp-text">의견을 보내주세요</h2>
                <p className="text-xs text-sp-muted mt-0.5">선생님의 피드백이 쌤핀을 더 좋게 만듭니다</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-sp-muted hover:text-sp-text transition-colors rounded-lg p-1 hover:bg-white/5"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>

          {/* 카드 그리드 */}
          <div className="px-6 py-5 grid grid-cols-2 gap-4">
            {/* 실시간 채팅 카드 */}
            <button
              type="button"
              onClick={handleOpenChat}
              className="group flex flex-col rounded-xl border border-sp-border bg-sp-surface p-4 text-left transition-all duration-200 hover:scale-[1.02] hover:border-sp-accent hover:bg-sp-surface/80"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-sp-accent text-[22px]">chat</span>
                <span className="text-sm font-bold text-sp-text">실시간 채팅</span>
                <span className="ml-auto flex items-center gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] text-emerald-400">온라인</span>
                </span>
              </div>
              <p className="text-xs text-sp-muted mb-3 leading-relaxed">
                지금 바로 대화하세요!
              </p>
              <ul className="space-y-1.5 text-xs text-sp-muted mb-4 flex-1">
                <li className="flex items-center gap-1.5">
                  <span className="text-sp-accent text-[8px]">●</span> 버그 신고
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-sp-accent text-[8px]">●</span> 빠른 질문
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-sp-accent text-[8px]">●</span> 스크린샷 첨부 가능
                </li>
              </ul>
              <div className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-sp-accent text-white text-xs font-semibold transition-colors group-hover:bg-blue-500">
                <span className="material-symbols-outlined text-[16px]">chat</span>
                채팅 시작하기
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
                  <span className="text-sp-accent text-[8px]">●</span> 기능 제안
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-sp-accent text-[8px]">●</span> 상세 건의사항
                </li>
                <li className="flex items-center gap-1.5">
                  <span className="text-sp-accent text-[8px]">●</span> 개선 아이디어
                </li>
              </ul>
              <div className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg border border-sp-border text-sp-text text-xs font-semibold transition-colors group-hover:bg-sp-card">
                <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                설문지 열기
              </div>
            </button>
          </div>

          {/* 하단 안내 */}
          <div className="px-6 pb-5">
            <p className="text-[11px] text-sp-muted text-center bg-sp-surface/50 rounded-lg py-2 px-3 border border-sp-border/30">
              급한 버그는 <span className="text-sp-accent font-medium">채팅</span>으로, 자세한 의견은 <span className="text-sp-accent font-medium">설문지</span>로 보내주시면 큰 도움이 됩니다!
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
