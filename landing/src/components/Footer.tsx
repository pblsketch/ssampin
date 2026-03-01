import { GITHUB_URL } from '@/config';

export default function Footer() {
  return (
    <footer className="bg-[#060a12] py-8">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <p className="text-sm font-medium text-sp-muted">
          📌 쌤핀 (SsamPin) · 선생님의 대시보드
        </p>
        <div className="mt-3 flex items-center justify-center gap-4 text-sm text-sp-muted/60">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-sp-text"
          >
            GitHub
          </a>
        </div>
        <p className="mt-4 text-xs text-sp-muted/40">
          © 2026 SsamPin. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
