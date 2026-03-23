import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

export const metadata: Metadata = {
  title: '쌤핀 개발자 소개',
  description: '쌤핀(SsamPin)을 만든 개발자 박준일을 소개합니다.',
};

const CONTACT_EMAIL = 'pblsketch@gmail.com';

const PROJECTS = [
  { name: '쌤핀', url: 'https://ssampin.com' },
  { name: 'PBL스케치', url: 'https://pblsketch.xyz' },
  { name: '나무학교 숲소리', url: 'https://supsori.com' },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-sp-bg text-slate-200">
      {/* Header */}
      <header className="border-b border-sp-border/50 bg-[#060a12]/80 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sp-muted transition-colors hover:text-slate-200"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span className="text-sm">홈으로</span>
          </Link>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-lg px-6 py-16">
        <div className="rounded-xl border border-sp-border bg-sp-card p-8 text-center">
          {/* Profile image */}
          <div className="mb-6 flex justify-center">
            <Image
              src="/images/profile.jpg"
              alt="박준일 프로필 사진"
              width={112}
              height={112}
              className="rounded-full object-cover ring-2 ring-sp-border"
              priority
            />
          </div>

          {/* Name */}
          <h1 className="mb-5 text-2xl font-bold text-slate-200">박준일</h1>

          {/* Bio */}
          <p className="mb-7 text-sm leading-relaxed text-sp-muted">
            살아가는 힘을 기르는 교실을 만들기 위해 동료 선생님들과 함께 연대하고 싶은
            교사입니다. 선생님들이 살아가는 힘을 기르는 교실을 자유롭게 상상하는 과정을
            돕고 싶어 &lsquo;쌤핀, PBL스케치, 나무학교 숲소리&rsquo;를 운영하고 있습니다.
          </p>

          {/* Email */}
          <div className="mb-7 flex items-center justify-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-sp-accent"
            >
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-sm text-sp-accent transition-colors hover:text-blue-400"
            >
              {CONTACT_EMAIL}
            </a>
          </div>

          {/* Project badges */}
          <div className="border-t border-sp-border pt-6">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-sp-muted/60">
              운영 중인 프로젝트
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {PROJECTS.map((project) => (
                <a
                  key={project.name}
                  href={project.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-sp-border bg-sp-surface px-3 py-1.5 text-sm text-sp-muted transition-colors hover:border-sp-accent/50 hover:text-sp-accent"
                >
                  {project.name}
                </a>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
