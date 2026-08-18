import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { EDZIP_URL } from '@/config';

export const metadata: Metadata = {
  title: '학교 도입 안내 — 쌤핀',
  description:
    '쌤핀은 에듀집 학습지원 소프트웨어 필수기준 점검결과가 등록되어 있습니다. 학교운영위원회 심의가 필요한 경우, 에듀집에 등록된 체크리스트와 증빙자료를 내려받아 심의 서류로 제출하실 수 있습니다.',
  alternates: {
    canonical: 'https://ssampin.com/school-adoption',
  },
  openGraph: {
    title: '학교 도입 안내 — 쌤핀',
    description:
      '쌤핀은 에듀집 학습지원 소프트웨어 필수기준 점검결과가 등록되어 있습니다. 심의가 필요한 학교를 위해 체크리스트와 도입 절차를 안내합니다.',
    url: 'https://ssampin.com/school-adoption',
    siteName: '쌤핀 (SsamPin)',
    type: 'article',
    locale: 'ko_KR',
    images: [
      {
        url: '/images/og-image.png',
        width: 1200,
        height: 630,
        alt: '쌤핀 학교 도입 안내',
      },
    ],
  },
};

/* ── 아이콘 (단색 라인 아이콘 — 톤 통일) ───────────────────────────── */

type IconName = 'check' | 'file-check' | 'clipboard' | 'school' | 'external' | 'arrow';

const ICON_PATHS: Record<IconName, ReactNode> = {
  check: <path d="M20 6 9 17l-5-5" />,
  'file-check': (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="m9 15 2 2 4-4" />
    </>
  ),
  clipboard: (
    <>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="m9 14 2 2 4-4" />
    </>
  ),
  school: (
    <>
      <path d="m12 2 10 6.5-10 6.5L2 8.5 12 2Z" />
      <path d="M6 10v6.5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V10" />
      <path d="M22 8.5V16" />
    </>
  ),
  external: (
    <>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </>
  ),
  arrow: <path d="M5 12h14" />,
};

function Icon({ name, className = 'h-[18px] w-[18px]' }: { name: IconName; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

/* ── 콘텐츠 데이터 ─────────────────────────────────────────────────── */

const CHECK_ITEMS = [
  '필수기준 점검결과 등록',
  '개인정보보호 필수기준 9개 항목 충족',
  '학교운영위원회 심의 자료로 활용',
] as const;

const BENEFITS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'clipboard',
    title: '필수기준을 처음부터 해석하지 않아도 됩니다',
    body: '공급자가 개인정보보호 필수기준 9개 항목(최소처리 원칙, 안전조치 의무, 열람·정정·삭제 절차, 만 14세 미만 아동 보호, 책임자·제3자제공·위탁 안내)의 충족 여부를 점검해 두었습니다. 담당 교사가 각 기준을 처음부터 해석하고 확인표를 새로 만드는 부담을 덜 수 있습니다.',
  },
  {
    icon: 'file-check',
    title: '확인 근거를 한곳에서 찾을 수 있습니다',
    body: '에듀집은 미충족 항목이 없고 체크리스트와 증빙자료가 일치하는 것으로 확인된 서비스의 자료를 제공합니다. 심의 중 필요한 근거를 여러 경로에서 따로 수집할 필요가 줄어듭니다.',
  },
  {
    icon: 'clipboard',
    title: '간소 양식으로 안건을 정리할 수 있습니다',
    body: '교육부 안내에 따라 제품명과 기준 충족 여부를 목록으로 정리하는 간소 양식을 활용할 수 있어, 제품마다 별도의 체크리스트와 심의 의견서를 다시 작성하는 일을 줄일 수 있습니다.',
  },
  {
    icon: 'file-check',
    title: '많은 자료를 모두 출력하지 않아도 됩니다',
    body: '체크리스트와 증빙자료 전체를 반드시 인쇄해 첨부할 필요는 없습니다. 필요할 때 에듀집 링크나 QR 코드, 태블릿 등으로 열람하도록 준비할 수 있어 출력과 편철 부담도 가벼워집니다.',
  },
];

const STEPS: { n: string; icon: IconName; title: string; desc: string }[] = [
  {
    n: '1',
    icon: 'file-check',
    title: '체크리스트 내려받기',
    desc: '에듀집의 쌤핀 상세 페이지에서 등록된 체크리스트와 증빙자료를 확인하고 내려받습니다.',
  },
  {
    n: '2',
    icon: 'clipboard',
    title: '간소 양식에 반영하기',
    desc: '심의 안건에 쌤핀의 제품명과 필수기준 충족 여부를 기재하고, 학교에서 필요한 추천 의견을 정리합니다.',
  },
  {
    n: '3',
    icon: 'school',
    title: '학운위 심의 진행하기',
    desc: '학교의 절차에 따라 안건을 상정합니다. 상세 확인이 필요하면 에듀집의 체크리스트와 증빙자료를 바로 열람할 수 있습니다.',
  },
];

const CONTACT_EMAIL = 'pblsketch@gmail.com';

/* ── 공통 블록 ─────────────────────────────────────────────────────── */

function BackHeader() {
  return (
    <header className="border-b border-sp-border bg-sp-surface/80 backdrop-blur-sm">
      <div className="mx-auto max-w-4xl px-6 py-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sp-muted transition-colors hover:text-sp-text"
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
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span className="text-sm">홈으로</span>
        </Link>
      </div>
    </header>
  );
}

/** 섹션 머리말 — eyebrow + 제목 + 설명 묶음 */
function SectionHead({
  eyebrow,
  title,
  desc,
}: {
  eyebrow: string;
  title: string;
  desc?: ReactNode;
}) {
  return (
    <>
      <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-widest text-sp-accent">
        {eyebrow}
      </p>
      <h2 className="text-2xl font-bold text-sp-text">{title}</h2>
      {desc && <p className="mt-3 text-sm leading-relaxed text-sp-muted">{desc}</p>}
    </>
  );
}

/** 에듀집 상세 페이지로 가는 파란 버튼 */
function EdzipButton({ className = '' }: { className?: string }) {
  return (
    <a
      href={EDZIP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-2 rounded-xl bg-sp-accent px-7 py-3.5 font-bold text-white shadow-lg shadow-sp-accent/25 transition-all hover:-translate-y-0.5 hover:bg-sp-accent-hover hover:shadow-sp-accent/35 ${className}`}
    >
      <Icon name="external" className="h-4 w-4" />
      <span>에듀집에서 자료 확인하기</span>
    </a>
  );
}

export default function SchoolAdoptionPage() {
  return (
    <div className="min-h-screen bg-sp-bg text-sp-text">
      <BackHeader />

      <main className="mx-auto max-w-3xl px-6 py-14">
        {/* Hero */}
        <p className="mb-3 text-[0.7rem] font-semibold uppercase tracking-widest text-sp-accent">
          학교 도입 안내
        </p>
        <h1 className="text-3xl font-bold leading-snug text-sp-text md:text-[2.6rem]">
          쌤핀 도입,
          <br />
          <span className="text-sp-accent">심의 준비까지 간편하게</span>
        </h1>
        <p className="mt-5 text-base leading-relaxed text-sp-muted">
          쌤핀은 에듀집 학습지원 소프트웨어{' '}
          <strong className="text-sp-text">필수기준 점검결과가 등록</strong>되어 있습니다.{' '}
          학교운영위원회 심의가 필요한 경우, 에듀집에 등록된 체크리스트를 내려받아 심의 서류로
          제출하실 수 있습니다.
        </p>

        <div className="mt-9 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <EdzipButton />
          <a
            href="#benefits"
            className="inline-flex items-center gap-2 rounded-xl border border-sp-border px-7 py-3.5 font-medium text-sp-muted transition-colors hover:border-sp-accent/50 hover:text-sp-text"
          >
            수월해지는 점 보기
            <span aria-hidden="true">↓</span>
          </a>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-sp-muted/70">
          버튼을 누르면 에듀집의 쌤핀 상세 페이지가 새 창에서 열립니다.
        </p>

        {/* 필수기준 체크리스트 */}
        <section className="mt-16">
          <SectionHead eyebrow="에듀집 · 학습지원 소프트웨어" title="필수기준 체크리스트" />
          <div className="mt-6 rounded-2xl border border-sp-border bg-sp-card p-6 shadow-sm md:p-8">
            <div className="grid gap-6 sm:grid-cols-[auto_1fr] sm:gap-8">
              {/* 제품 정보 */}
              <div className="sm:border-r sm:border-sp-border sm:pr-8">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-sp-accent/30 bg-sp-accent/10 px-3 py-1 text-xs font-bold text-sp-accent">
                  <Icon name="check" className="h-3.5 w-3.5" />
                  충족
                </span>
                <p className="mt-4 text-[0.7rem] font-semibold uppercase tracking-widest text-sp-muted/60">
                  제품·서비스명
                </p>
                <p className="mt-1 text-lg font-extrabold text-sp-text">쌤핀</p>
                <p className="mt-2 text-sm leading-relaxed text-sp-muted">
                  선생님을 위한 올인원 교실 대시보드
                </p>
              </div>

              {/* 충족 항목 */}
              <ul className="flex flex-col justify-center gap-3">
                {CHECK_ITEMS.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2.5 text-sm font-medium text-sp-text"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sp-accent/15 text-sp-accent">
                      <Icon name="check" className="h-3 w-3" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-6 border-t border-sp-border pt-5 text-center text-sm text-sp-muted">
              체크리스트를 제출하여 간편하게 심의를 준비하세요
            </p>
          </div>
        </section>

        {/* 왜 수월해지나요 */}
        <section id="benefits" className="mt-16 scroll-mt-8">
          <SectionHead
            eyebrow="왜 수월해지나요"
            title="학운위 심의 준비가 왜 수월해지나요?"
            desc="필수기준 확인부터 증빙자료 준비까지, 학교 담당자가 반복해야 할 일을 줄여줍니다."
          />
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {BENEFITS.map((b) => (
              <div
                key={b.title}
                className="rounded-xl border border-sp-border bg-sp-card p-5 shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sp-accent/10 text-sp-accent">
                    <Icon name={b.icon} />
                  </span>
                  <h3 className="text-sm font-bold text-sp-text">{b.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-sp-muted">{b.body}</p>
              </div>
            ))}
          </div>

          {/* 유의사항 */}
          <div className="mt-5 rounded-xl border border-sp-border bg-sp-surface/60 px-5 py-4 text-xs leading-relaxed text-sp-muted">
            체크리스트는 심의 자체를 대신하는 서류가 아니라, 필수기준 충족 여부와 근거를 빠르게
            확인하도록 돕는 자료입니다. 선택기준 검토와 최종 선정은 학교의 절차에 따라 진행해
            주세요.{' '}
            <a
              href="https://edzip.kr/main-notice"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-sp-accent transition-colors hover:underline"
            >
              에듀집 심의 안내 보기 →
            </a>
          </div>
        </section>

        {/* 진행 순서 */}
        <section className="mt-16">
          <SectionHead
            eyebrow="진행 순서"
            title="심의 자료, 이렇게 준비하세요"
            desc="에듀집 자료를 확인하고 간소 양식에 반영한 뒤, 학교의 절차에 따라 심의를 진행하세요."
          />
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {STEPS.map((s, i) => (
              <div
                key={s.n}
                className="relative flex flex-col rounded-xl border border-sp-border bg-sp-card p-5 shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sp-accent text-xs font-bold text-white">
                    {s.n}
                  </span>
                  <span className="text-sp-accent">
                    <Icon name={s.icon} className="h-[18px] w-[18px]" />
                  </span>
                </div>
                <h3 className="mt-3 text-sm font-bold text-sp-text">{s.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-sp-muted">{s.desc}</p>
                {i < STEPS.length - 1 && (
                  <span
                    className="absolute -right-2.5 top-1/2 hidden -translate-y-1/2 text-sp-accent/50 sm:block"
                    aria-hidden="true"
                  >
                    →
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* 최종 CTA */}
        <section className="mt-16 rounded-2xl border border-sp-accent/30 bg-sp-accent/5 p-8 text-center md:p-10">
          <h2 className="text-xl font-bold text-sp-text md:text-2xl">
            쌤핀 도입을 위한 자료를
            <br className="sm:hidden" /> 바로 확인해 보세요
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-sp-muted">
            에듀집의 쌤핀 상세 페이지에서 체크리스트와 증빙자료를 확인하고 내려받으실 수 있습니다.
          </p>
          <div className="mt-6">
            <EdzipButton />
          </div>
        </section>

        {/* 문의 */}
        <section className="mt-10">
          <div className="rounded-xl border border-sp-border bg-sp-card px-6 py-6 text-center shadow-sm">
            <p className="text-sm leading-relaxed text-sp-muted">
              학교별로 필요한 심의 자료나 개인정보 관련 서식이 있다면 아래 메일로 요청해 주세요.
            </p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-sp-accent transition-colors hover:text-sp-accent-hover"
            >
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
                aria-hidden="true"
              >
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              {CONTACT_EMAIL}
            </a>
          </div>
        </section>

        {/* 하단 링크 */}
        <div className="mt-12 border-t border-sp-border pt-6 text-center text-sm text-sp-muted">
          쌤핀에 대해 더 알고 싶으신가요?{' '}
          <Link href="/" className="font-medium text-sp-accent transition-colors hover:underline">
            쌤핀 홈페이지에서 기능 살펴보기
          </Link>
        </div>
      </main>
    </div>
  );
}
