'use client';

import { useEffect, useState } from 'react';
import { VERSION, MOBILE_URL } from '@/config';
import FadeIn from './FadeIn';
import DownloadButton from './DownloadButton';

export default function Footer() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  return (
    <footer>
      {/* CTA 영역 */}
      <div className="border-t-2 border-sp-accent bg-sp-card py-16">
        <div className="mx-auto max-w-6xl px-6 text-center">
          <FadeIn>
            <p className="mb-3 text-[0.7rem] font-semibold uppercase tracking-widest text-sp-accent">
              무료 · Windows 10/11 · 모바일
            </p>
            <h2 className="text-3xl font-bold text-sp-text md:text-4xl">
              지금 바로 시작하세요
            </h2>
          </FadeIn>
          <FadeIn delay={0.15}>
            <div className="mt-8">
              <DownloadButton />
              {!isMobile && (
                <div className="mt-4">
                  <a
                    href={MOBILE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium text-sp-muted transition-colors hover:text-sp-text"
                  >
                    <span className="text-base">📱</span>
                    모바일 버전도 있어요
                    <span className="text-xs">→</span>
                  </a>
                </div>
              )}
            </div>
          </FadeIn>
        </div>
      </div>

      {/* Footer 링크 */}
      <div className="bg-[#060a12] py-8">
        {/* Note: #060a12 is non-standard, kept as-is */}
        <div className="mx-auto max-w-6xl px-6 text-center">
          <p className="text-sm font-medium text-sp-muted">
            쌤핀 (SsamPin) · 선생님의 대시보드
          </p>
          <nav aria-label="푸터 링크" className="mt-3 flex items-center justify-center gap-4 text-sm text-sp-muted/60">
            <a
              href="https://supsori.notion.site/SsamPin-32176e6c2ab781dc905ce780e03c5be4"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-sp-text"
            >
              사용 가이드
            </a>
            <span className="text-sp-muted/30">·</span>
            <a
              href="https://forms.gle/o1X4zLYocUpFKCzy7"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-sp-text"
            >
              문의 · 피드백
            </a>
            <span className="text-sp-muted/30">·</span>
            <a
              href="/about"
              className="transition-colors hover:text-sp-text"
            >
              개발자 소개
            </a>
            <span className="text-sp-muted/30">·</span>
            <a
              href="/privacy"
              className="transition-colors hover:text-sp-text"
            >
              개인정보처리방침
            </a>
          </nav>
          <p className="mt-4 text-xs text-sp-muted/40">
            © 2026 SsamPin v{VERSION} · 모든 데이터는 사용자 PC에만 저장됩니다.
          </p>
        </div>
      </div>
    </footer>
  );
}
