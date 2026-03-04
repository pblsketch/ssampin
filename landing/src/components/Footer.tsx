import { VERSION } from '@/config';

export default function Footer() {
  return (
    <footer className="bg-[#060a12] py-8">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <p className="text-sm font-medium text-sp-muted">
          쌤핀 (SsamPin) · 선생님의 대시보드
        </p>
        <nav aria-label="푸터 링크" className="mt-3 flex items-center justify-center gap-4 text-sm text-sp-muted/60">
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
            href="/privacy"
            className="transition-colors hover:text-sp-text"
          >
            개인정보처리방침
          </a>
        </nav>
        <p className="mt-4 text-xs text-sp-muted/40">
          © 2025 SsamPin v{VERSION} · 모든 데이터는 사용자 PC에만 저장됩니다.
        </p>
      </div>
    </footer>
  );
}
