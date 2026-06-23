import Image from 'next/image';
import { GUIDE_URL } from '@/config';

const navItems = [
  { label: '홈', href: '/' },
  { label: '기능', href: '#features' },
  { label: '모바일', href: '#mobile' },
  { label: 'AI 연결', href: '/ai-bridge' },
  { label: '다운로드', href: '#download' },
  { label: '사용자 가이드', href: GUIDE_URL, emphasis: true },
] as const;

export default function LandingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-sp-border bg-sp-bg/95 backdrop-blur">
      <nav
        aria-label="주요 메뉴"
        className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6 md:px-10"
      >
        <a
          href="/"
          aria-label="쌤핀 홈"
          className="flex shrink-0 items-center gap-2 rounded-lg px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sp-bg"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sp-border bg-sp-card shadow-sm">
            <Image src="/icon.png" alt="" width={24} height={24} priority />
          </span>
          <span className="hidden text-sm font-bold text-sp-text sm:inline">쌤핀</span>
        </a>

        <div className="flex min-w-0 flex-1 justify-end overflow-x-auto">
          <div className="flex items-center gap-1 whitespace-nowrap">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={
                  'emphasis' in item && item.emphasis
                    ? 'rounded-lg border border-sp-accent/30 bg-sp-accent/10 px-3 py-2 text-xs font-bold text-sp-accent transition-colors hover:bg-sp-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sp-bg sm:text-sm'
                    : 'rounded-lg px-3 py-2 text-xs font-semibold text-sp-muted transition-colors hover:bg-sp-card hover:text-sp-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sp-bg sm:text-sm'
                }
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
      </nav>
    </header>
  );
}
