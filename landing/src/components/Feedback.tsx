'use client';

import FadeIn from './FadeIn';

const FEEDBACK_FORM_URL = 'https://forms.gle/o1X4zLYocUpFKCzy7';

export default function Feedback() {
  return (
    <section className="border-t border-sp-border py-20">
      <div className="mx-auto max-w-2xl px-6">
        <FadeIn>
          <p className="mb-3 text-center text-[0.7rem] font-semibold uppercase tracking-widest text-sp-accent">
            Feedback
          </p>
          <h2 className="mb-4 text-center text-3xl font-bold text-sp-text">
            의견을 보내주세요
          </h2>
          <p className="mb-10 text-center text-sp-muted">
            불편한 점, 개선 아이디어, 버그 제보 모두 환영합니다.
          </p>
        </FadeIn>
        <FadeIn delay={0.15}>
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-sp-muted text-center leading-relaxed max-w-md">
              구글 폼을 통해 간단하게 의견을 남길 수 있습니다.
              <br />
              소요 시간은 약 2분이며, 모든 의견은 꼼꼼히 검토합니다.
            </p>
            <a
              href={FEEDBACK_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-sp-accent px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 active:bg-blue-700"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              건의사항 보내기
            </a>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
