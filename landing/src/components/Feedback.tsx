'use client';

import { useState } from 'react';
import FadeIn from './FadeIn';

export default function Feedback() {
  const [message, setMessage] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    const subject = encodeURIComponent('[쌤핀 피드백]');
    const body = encodeURIComponent(message.trim());
    window.open(`mailto:pblsketch@gmail.com?subject=${subject}&body=${body}`);
  }

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
          <form onSubmit={handleSubmit} className="space-y-4">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="내용을 입력하세요..."
              rows={5}
              className="w-full rounded-xl border border-sp-border bg-sp-card px-4 py-3 text-sm text-sp-text placeholder:text-sp-muted/50 focus:border-sp-accent focus:outline-none transition-colors resize-none"
              required
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-sp-accent py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 active:bg-blue-700"
            >
              이메일로 보내기
            </button>
          </form>
        </FadeIn>
      </div>
    </section>
  );
}
