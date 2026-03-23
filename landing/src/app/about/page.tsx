import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

export const metadata: Metadata = {
  title: '쌤핀 개발자 소개',
  description: '쌤핀(SsamPin)을 만든 개발자 박준일을 소개합니다.',
};

const CONTACT_EMAIL = 'pblsketch@gmail.com';

const PROJECTS = [
  { name: '쌤핀' },
  { name: 'PBL스케치' },
  { name: '나무학교 숲소리' },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#0a0e17] text-[#e2e8f0]">
      {/* Header */}
      <header className="border-b border-[#2a3548]/50 bg-[#060a12]/80 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[#94a3b8] transition-colors hover:text-[#e2e8f0]"
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
        <div className="rounded-xl border border-[#2a3548] bg-[#1a2332] p-8 text-center">
          {/* Profile image */}
          <div className="mb-6 flex justify-center">
            <Image
              src="/images/profile.jpg"
              alt="박준일 프로필 사진"
              width={112}
              height={112}
              className="rounded-full object-cover ring-2 ring-[#2a3548]"
              priority
            />
          </div>

          {/* Name */}
          <h1 className="mb-5 text-2xl font-bold text-[#e2e8f0]">박준일</h1>

          {/* Bio */}
          <p className="mb-7 text-sm leading-relaxed text-[#94a3b8]">
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
              className="text-[#3b82f6]"
            >
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
            </svg>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-sm text-[#3b82f6] transition-colors hover:text-[#60a5fa]"
            >
              {CONTACT_EMAIL}
            </a>
          </div>

          {/* Project badges */}
          <div className="border-t border-[#2a3548] pt-6">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[#94a3b8]/60">
              운영 중인 프로젝트
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {PROJECTS.map((project) => (
                <span
                  key={project.name}
                  className="rounded-lg border border-[#2a3548] bg-[#131a2b] px-3 py-1.5 text-sm text-[#94a3b8]"
                >
                  {project.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
