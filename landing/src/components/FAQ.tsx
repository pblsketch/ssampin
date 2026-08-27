'use client';

import FadeIn from './FadeIn';
import { faqs } from '@/content/faq';

const FEEDBACK_FORM_URL = 'https://forms.gle/o1X4zLYocUpFKCzy7';

export default function FAQ() {
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
    <section className="bg-sp-surface py-20">
      <div className="mx-auto max-w-4xl px-6">
        <FadeIn>
          <h2 className="text-3xl font-bold text-sp-text md:text-4xl">자주 묻는 질문</h2>
        </FadeIn>

        <div className="mt-10">
          {faqs.map((faq, i) => (
            <FadeIn key={faq.question} delay={i * 0.06}>
              <details className="group border-b border-sp-border/60 last:border-0">
                <summary className="flex cursor-pointer items-center justify-between py-5 font-medium text-sp-text">
                  <span>{faq.question}</span>
                  <span className="ml-4 shrink-0 text-sp-muted transition-transform duration-200 group-open:rotate-45">
                    +
                  </span>
                </summary>
                <div className="pb-5 text-sm leading-relaxed text-sp-muted">
                  {faq.answerNode ?? faq.answer}
                </div>
              </details>
            </FadeIn>
          ))}
        </div>

        {/* 피드백 링크 */}
        <FadeIn delay={0.4}>
          <div className="mt-8 flex flex-col items-center gap-3 rounded-xl border border-sp-border bg-sp-card p-6 text-center shadow-sm sm:flex-row sm:justify-center sm:gap-6 sm:text-left">
            <p className="text-sm text-sp-muted">더 궁금한 것이 있으신가요?</p>
            <div className="flex gap-3">
              <button
                onClick={handleOpenChat}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sp-accent/10 px-4 py-2 text-sm font-medium text-sp-accent transition-colors hover:bg-sp-accent/15"
              >
                💬 AI에게 물어보기
              </button>
              <a
                href={FEEDBACK_FORM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-sp-border px-4 py-2 text-sm font-medium text-sp-muted transition-colors hover:text-sp-text"
              >
                📋 건의사항 보내기
              </a>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
