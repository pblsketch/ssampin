'use client';

import FadeIn from './FadeIn';

const FEEDBACK_FORM_URL = 'https://forms.gle/o1X4zLYocUpFKCzy7';

export default function Feedback() {
  const handleOpenChat = () => {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const openChat = (window as any).__ssampin_open_chat;
      if (typeof openChat === 'function') {
        openChat();
      }
    }
  };

  return (
    <section className="border-t border-sp-border py-20">
      <div className="mx-auto max-w-4xl px-6">
        <FadeIn>
          <p className="mb-3 text-center text-[0.7rem] font-semibold uppercase tracking-widest text-sp-accent">
            Feedback
          </p>
          <h2 className="mb-4 text-center text-3xl font-bold text-sp-text">
            의견을 보내주세요
          </h2>
          <p className="mb-10 text-center text-sp-muted">
            선생님들의 소중한 피드백이 쌤핀을 더 좋게 만듭니다
          </p>
        </FadeIn>

        <FadeIn delay={0.15}>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* 실시간 채팅 카드 */}
            <div className="flex flex-col rounded-xl border border-sp-border bg-sp-card p-6 transition-all duration-200 hover:scale-[1.02] hover:border-sp-accent">
              <div className="mb-4 flex items-center gap-2">
                <span className="text-2xl">💬</span>
                <h3 className="text-lg font-bold text-sp-text">AI 도우미</h3>
                <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-400">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  온라인
                </span>
              </div>
              <p className="mb-4 text-sm text-sp-muted">
                쌤핀 AI에게 바로 물어보세요!
              </p>
              <ul className="mb-6 flex-1 space-y-2 text-sm text-sp-muted">
                <li className="flex items-center gap-2">
                  <span className="text-sp-accent">•</span> 사용법 질문
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-sp-accent">•</span> 버그 신고 &amp; 기능 제안
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-sp-accent">•</span> 즉시 답변 🤖
                </li>
              </ul>
              <button
                onClick={handleOpenChat}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sp-accent px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 active:bg-blue-700"
              >
                🤖 AI에게 물어보기
              </button>
            </div>

            {/* 건의사항 카드 */}
            <div className="flex flex-col rounded-xl border border-sp-border bg-sp-card p-6 transition-all duration-200 hover:scale-[1.02] hover:border-sp-accent">
              <div className="mb-4 flex items-center gap-2">
                <span className="text-2xl">📋</span>
                <h3 className="text-lg font-bold text-sp-text">건의사항 보내기</h3>
              </div>
              <p className="mb-4 text-sm text-sp-muted">
                설문지로 의견을 보내주세요
              </p>
              <ul className="mb-6 flex-1 space-y-2 text-sm text-sp-muted">
                <li className="flex items-center gap-2">
                  <span className="text-sp-accent">•</span> 기능 제안
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-sp-accent">•</span> 상세 건의사항
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-sp-accent">•</span> 개선 아이디어
                </li>
              </ul>
              <a
                href={FEEDBACK_FORM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-sp-border bg-sp-surface px-6 py-3 text-sm font-semibold text-sp-text transition-colors hover:bg-sp-card active:bg-sp-border"
              >
                📋 설문지 열기
              </a>
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.3}>
          <p className="mt-8 text-center text-sm text-sp-muted">
            💡 사용법이 궁금하면 AI에게, 자세한 의견은 설문지로 보내주시면 큰 도움이 됩니다!
          </p>
        </FadeIn>
      </div>
    </section>
  );
}
