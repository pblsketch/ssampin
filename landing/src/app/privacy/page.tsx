import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '쌤핀 개인정보처리방침',
  description: '쌤핀(SsamPin) 앱의 개인정보처리방침입니다.',
  robots: {
    index: false,
    follow: false,
  },
};

const CONTACT_EMAIL = 'pblsketch@gmail.com';

const koContent = {
  lang: 'ko',
  title: '개인정보처리방침',
  subtitle: '쌤핀 (SsamPin)',
  lastUpdated: '최종 수정일: 2026년 3월 5일',
  switchLang: 'View in English',
  switchHref: '?lang=en',
  sections: [
    {
      number: '1',
      title: '수집하는 정보',
      content: (
        <>
          <p>쌤핀은 구글 캘린더 연동 기능을 사용할 경우 다음 정보를 수집합니다:</p>
          <ul>
            <li>Google 계정 이메일 주소</li>
            <li>구글 캘린더 일정 데이터 (제목, 날짜, 시간, 장소)</li>
          </ul>
          <p>구글 캘린더 연동 기능을 사용하지 않는 경우, 어떠한 개인정보도 수집하지 않습니다.</p>
        </>
      ),
    },
    {
      number: '2',
      title: '정보 사용 목적',
      content: (
        <>
          <p>수집된 정보는 다음 목적으로만 사용됩니다:</p>
          <ul>
            <li>쌤핀 앱과 구글 캘린더 간 일정 양방향 동기화</li>
          </ul>
          <p>마케팅, 광고, 제3자 분석 등 다른 어떤 목적으로도 사용하지 않습니다.</p>
        </>
      ),
    },
    {
      number: '3',
      title: '정보 저장 방식',
      content: (
        <>
          <p>쌤핀은 서버리스(Serverless) 구조로 설계되었습니다:</p>
          <ul>
            <li>
              <strong>로컬 저장:</strong> 모든 데이터는 사용자의 PC에만 저장됩니다.
            </li>
            <li>
              <strong>서버 미전송:</strong> 쌤핀 개발자 서버나 외부 서버로 데이터를 전송하지 않습니다.
            </li>
            <li>
              <strong>암호화 저장:</strong> OAuth 인증 토큰은 Windows DPAPI(safeStorage)를 통해 OS 키체인에 암호화하여 저장합니다.
            </li>
            <li>
              <strong>직접 통신:</strong> 앱은 Google Calendar API와 사용자의 PC에서 직접 통신하며, 중간 서버를 거치지 않습니다.
            </li>
          </ul>
        </>
      ),
    },
    {
      number: '4',
      title: '정보 삭제',
      content: (
        <>
          <ul>
            <li>구글 캘린더 연결을 해제하면 모든 OAuth 토큰 및 동기화 데이터가 즉시 삭제됩니다.</li>
            <li>앱을 삭제하면 로컬에 저장된 모든 데이터가 함께 삭제됩니다.</li>
            <li>
              Google 계정 설정에서{' '}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
              >
                앱 접근 권한
              </a>
              을 직접 해제할 수도 있습니다.
            </li>
          </ul>
        </>
      ),
    },
    {
      number: '5',
      title: '제3자 제공',
      content: (
        <>
          <ul>
            <li>사용자 데이터를 제3자에게 제공, 판매, 공유하지 않습니다.</li>
            <li>쌤핀은 Google Calendar API와만 직접 통신하며, 그 외 어떤 외부 서비스에도 데이터를 전달하지 않습니다.</li>
          </ul>
        </>
      ),
    },
    {
      number: '6',
      title: '사용자 권리',
      content: (
        <>
          <p>사용자는 언제든지 다음 권리를 행사할 수 있습니다:</p>
          <ul>
            <li>앱 내 설정에서 구글 캘린더 연결 해제 (데이터 즉시 삭제)</li>
            <li>Google 계정의 앱 권한 페이지에서 직접 접근 권한 철회</li>
          </ul>
        </>
      ),
    },
    {
      number: '7',
      title: '문의',
      content: (
        <>
          <p>개인정보 처리에 관한 문의는 아래로 연락해 주세요:</p>
          <ul>
            <li>
              이메일:{' '}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </li>
          </ul>
        </>
      ),
    },
  ],
};

const enContent = {
  lang: 'en',
  title: 'Privacy Policy',
  subtitle: 'SsamPin',
  lastUpdated: 'Last updated: March 5, 2026',
  switchLang: '한국어로 보기',
  switchHref: '?lang=ko',
  sections: [
    {
      number: '1',
      title: 'Information We Collect',
      content: (
        <>
          <p>SsamPin collects the following information when you use the Google Calendar integration feature:</p>
          <ul>
            <li>Google account email address</li>
            <li>Google Calendar event data (title, date, time, location)</li>
          </ul>
          <p>If you do not use the Google Calendar integration feature, no personal information is collected.</p>
        </>
      ),
    },
    {
      number: '2',
      title: 'How We Use Your Information',
      content: (
        <>
          <p>The collected information is used solely for the following purpose:</p>
          <ul>
            <li>Two-way synchronization of events between the SsamPin app and Google Calendar</li>
          </ul>
          <p>Your information is never used for marketing, advertising, or third-party analytics.</p>
        </>
      ),
    },
    {
      number: '3',
      title: 'How We Store Your Information',
      content: (
        <>
          <p>SsamPin is designed with a serverless architecture:</p>
          <ul>
            <li>
              <strong>Local storage only:</strong> All data is stored exclusively on the user&apos;s PC.
            </li>
            <li>
              <strong>No server transmission:</strong> Data is never sent to SsamPin developer servers or any external servers.
            </li>
            <li>
              <strong>Encrypted storage:</strong> OAuth tokens are encrypted and stored in the OS keychain using Windows DPAPI (Electron safeStorage).
            </li>
            <li>
              <strong>Direct communication:</strong> The app communicates directly with the Google Calendar API from the user&apos;s PC, without passing through any intermediate servers.
            </li>
          </ul>
        </>
      ),
    },
    {
      number: '4',
      title: 'Data Deletion',
      content: (
        <>
          <ul>
            <li>When you disconnect Google Calendar, all OAuth tokens and synced data are immediately deleted.</li>
            <li>When you uninstall the app, all locally stored data is deleted.</li>
            <li>
              You can also directly revoke the app&apos;s access from your{' '}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Account permissions page
              </a>
              .
            </li>
          </ul>
        </>
      ),
    },
    {
      number: '5',
      title: 'Third-Party Disclosure',
      content: (
        <>
          <ul>
            <li>We do not share, sell, or provide your data to any third parties.</li>
            <li>SsamPin only communicates directly with the Google Calendar API, and no data is sent to any other external services.</li>
          </ul>
        </>
      ),
    },
    {
      number: '6',
      title: 'Your Rights',
      content: (
        <>
          <p>You may exercise the following rights at any time:</p>
          <ul>
            <li>Disconnect Google Calendar within the app settings (data is immediately deleted)</li>
            <li>Revoke access directly from the Google Account app permissions page</li>
          </ul>
        </>
      ),
    },
    {
      number: '7',
      title: 'Contact',
      content: (
        <>
          <p>For questions about our privacy practices, please contact us:</p>
          <ul>
            <li>
              Email:{' '}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </li>
          </ul>
        </>
      ),
    },
  ],
};

interface PageProps {
  searchParams: Promise<{ lang?: string }>;
}

export default async function PrivacyPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const isEnglish = params.lang === 'en';
  const content = isEnglish ? enContent : koContent;

  return (
    <div className="min-h-screen bg-[#0a0e17] text-sp-text">
      {/* Header */}
      <header className="border-b border-sp-border/50 bg-[#060a12]/80 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sp-muted transition-colors hover:text-sp-text"
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
            <span className="text-sm">
              {isEnglish ? 'Back to Home' : '홈으로'}
            </span>
          </Link>
          <a
            href={content.switchHref}
            className="rounded-md border border-sp-border px-3 py-1.5 text-xs text-sp-muted transition-colors hover:border-sp-accent/50 hover:text-sp-text"
          >
            {content.switchLang}
          </a>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-4xl px-6 py-12">
        {/* Title section */}
        <div className="mb-10">
          <p className="mb-2 text-sm font-medium text-sp-accent">{content.subtitle}</p>
          <h1 className="mb-3 text-3xl font-bold text-sp-text md:text-4xl">
            {content.title}
          </h1>
          <p className="text-sm text-sp-muted">{content.lastUpdated}</p>
        </div>

        {/* Intro notice */}
        <div className="mb-10 rounded-xl border border-sp-accent/20 bg-sp-accent/5 p-5">
          <div className="flex items-start gap-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 shrink-0 text-sp-accent"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <p className="text-sm leading-relaxed text-sp-muted">
              {isEnglish
                ? 'SsamPin does not operate servers. All data is stored exclusively on your PC and is never transmitted externally. This privacy policy applies to the Google Calendar integration feature.'
                : '쌤핀은 서버를 운영하지 않습니다. 모든 데이터는 사용자의 PC에만 저장되며 외부로 전송되지 않습니다. 이 개인정보처리방침은 구글 캘린더 연동 기능에 적용됩니다.'}
            </p>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-8">
          {content.sections.map((section) => (
            <section key={section.number} className="rounded-xl border border-sp-border/50 bg-sp-card/50 p-6">
              <h2 className="mb-4 flex items-center gap-3 text-lg font-bold text-sp-text">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sp-accent/20 text-sm font-bold text-sp-accent">
                  {section.number}
                </span>
                {section.title}
              </h2>
              <div className="prose-privacy text-sm leading-relaxed text-sp-muted">
                {section.content}
              </div>
            </section>
          ))}
        </div>

        {/* Footer note */}
        <div className="mt-10 text-center text-xs text-sp-muted/50">
          <p>
            {isEnglish
              ? 'This privacy policy may be updated. Please check this page periodically for changes.'
              : '본 개인정보처리방침은 변경될 수 있습니다. 변경 시 이 페이지에서 확인하세요.'}
          </p>
        </div>
      </main>

      {/* Inline styles for prose-privacy */}
      <style>{`
        .prose-privacy p {
          margin-bottom: 0.75rem;
          line-height: 1.7;
        }
        .prose-privacy ul {
          margin: 0.5rem 0 0.75rem 0;
          padding-left: 1.25rem;
          list-style-type: disc;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .prose-privacy li {
          line-height: 1.6;
        }
        .prose-privacy strong {
          color: #e2e8f0;
          font-weight: 600;
        }
        .prose-privacy a {
          color: #60a5fa;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .prose-privacy a:hover {
          color: #93c5fd;
        }
        .prose-privacy p:last-child,
        .prose-privacy ul:last-child {
          margin-bottom: 0;
        }
      `}</style>
    </div>
  );
}
