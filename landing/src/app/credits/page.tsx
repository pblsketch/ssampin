import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/config';
import { buildBreadcrumbJsonLd, jsonLdScriptProps } from '@/content/structuredData';

export const metadata: Metadata = {
  title: '쌤핀 오픈소스 고지',
  description:
    '쌤핀(SsamPin)이 사용한 오픈소스와 원저작자를 밝힙니다. 다른 선생님들이 만들어 나눠 주신 코드에 감사드립니다.',
  alternates: {
    canonical: `${SITE_URL}/credits`,
  },
};

interface Credit {
  readonly name: string;
  readonly author: string;
  readonly url: string;
  readonly license: string;
  readonly copyright: string;
  readonly what: string;
  readonly files: readonly string[];
}

const CREDITS: readonly Credit[] = [
  {
    name: 'COOL-비서 (coolm-helper)',
    author: '해밀고 황대연',
    url: 'https://github.com/dacisosl/coolm-helper',
    license: 'MIT License',
    copyright: 'Copyright (c) 2026 dacisosl',
    what: '쿨메신저 쪽지에서 일정을 뽑아내는 기능. 한국어 날짜 표현을 읽는 규칙과 쪽지함에 안전하게 접근하는 방법을 배워 왔습니다.',
    files: ['한국어 날짜·시간 파서', '쪽지 개인정보 탐지 규칙', '쪽지함 읽기 전용 접근'],
  },
];

export default function CreditsPage() {
  return (
    <div className="min-h-screen bg-sp-bg text-sp-text">
      <script
        {...jsonLdScriptProps(
          buildBreadcrumbJsonLd([
            { name: '쌤핀 홈', path: '/' },
            { name: '오픈소스 고지', path: '/credits' },
          ]),
        )}
      />
      {/* Header */}
      <header className="border-b border-sp-border bg-sp-surface/80 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl px-6 py-4">
          <Link
            href="/"
            className="flex w-fit items-center gap-2 text-sp-muted transition-colors hover:text-sp-text"
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

      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-10">
          <p className="mb-2 text-sm font-medium text-sp-accent">쌤핀 (SsamPin)</p>
          <h1 className="mb-3 text-3xl font-bold text-sp-text md:text-4xl">오픈소스 고지</h1>
          <p className="text-sm leading-relaxed text-sp-muted">
            쌤핀은 다른 선생님들이 만들어 나눠 주신 코드의 도움을 받았습니다. 감사한 마음으로
            원저작자와 출처를 밝힙니다.
          </p>
        </div>

        <div className="flex flex-col gap-6">
          {CREDITS.map((c) => (
            <section
              key={c.url}
              className="rounded-xl border border-sp-border bg-sp-card p-6 md:p-8"
            >
              <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="text-xl font-bold text-sp-text">{c.name}</h2>
                <span className="rounded-md border border-sp-border px-2 py-0.5 text-xs text-sp-muted">
                  {c.license}
                </span>
              </div>

              <p className="mb-4 text-sm text-sp-text">
                만든 사람 · <strong className="font-semibold">{c.author}</strong>
              </p>

              <p className="mb-5 text-sm leading-relaxed text-sp-muted">{c.what}</p>

              <div className="mb-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-sp-muted">
                  가져온 부분
                </p>
                <ul className="flex flex-col gap-1.5">
                  {c.files.map((f) => (
                    <li key={f} className="text-sm text-sp-muted">
                      · {f}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-sp-border bg-sp-surface p-4">
                <p className="font-mono text-xs leading-relaxed text-sp-muted">
                  {c.copyright}
                  <br />
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sp-accent underline underline-offset-2"
                  >
                    {c.url}
                  </a>
                </p>
              </div>
            </section>
          ))}
        </div>

        <div className="mt-10 text-center text-xs leading-relaxed text-sp-muted/70">
          <p>
            빠진 고지가 있다면 알려주세요. 바로 반영하겠습니다.
            <br />
            쌤핀 자체는 GPL-3.0 라이선스로 배포됩니다.
          </p>
        </div>
      </main>
    </div>
  );
}
