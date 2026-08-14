import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '쌤핀 이용약관',
  description:
    '쌤핀(SsamPin) 앱과 관련 서비스의 이용약관입니다. 서비스 내용, 사용자의 책임, 개인정보·AI 활용 책임, 보증의 부인과 책임의 제한을 안내합니다.',
  robots: {
    index: false,
    follow: false,
  },
};

const CONTACT_EMAIL = 'pblsketch@gmail.com';

const koContent = {
  lang: 'ko',
  title: '이용약관',
  subtitle: '쌤핀 (SsamPin)',
  lastUpdated: '최종 수정일: 2026년 6월 24일',
  switchLang: 'View in English',
  switchHref: '?lang=en',
  intro:
    '본 약관은 쌤핀(SsamPin) 앱과 관련 서비스 이용에 적용됩니다. 쌤핀을 설치하거나 사용하면 본 약관에 동의하는 것으로 봅니다. 동의하지 않으시면 서비스를 사용하지 말아 주세요.',
  sections: [
    {
      number: '1',
      title: '목적',
      content: (
        <>
          <p>
            본 약관은 개발자(이하 &quot;개발자&quot;)가 제공하는 교사용 데스크톱 앱 쌤핀과 이에
            부수하는 웹페이지·협업 기능(이하 통칭 &quot;서비스&quot;)의 이용 조건과 개발자·사용자의
            권리·의무를 정합니다.
          </p>
        </>
      ),
    },
    {
      number: '2',
      title: '서비스 내용',
      content: (
        <>
          <ul>
            <li>
              쌤핀은 한국 중·고등학교 교사를 위한 데스크톱 대시보드 앱으로, 기본적으로{' '}
              <strong>인터넷 없이 동작하며 데이터를 사용자 PC에 로컬 저장</strong>합니다.
            </li>
            <li>
              Google 연동(캘린더·Drive 백업·Tasks), 상담 예약·과제 수합·전자 서명·설문, 앱 내 AI
              도우미와 건의사항 보내기 등 일부 기능은 사용자가 명시적으로 사용할 때만 동작하며, 그
              처리 기준은 <Link href="/privacy">개인정보처리방침</Link>에 따릅니다.
            </li>
            <li>서비스는 현재 무료로 제공되며, 제공 범위·기능은 변경될 수 있습니다.</li>
          </ul>
        </>
      ),
    },
    {
      number: '3',
      title: '이용 자격과 책임 있는 사용',
      content: (
        <>
          <ul>
            <li>서비스는 교사 등 교육 종사자가 직무 목적으로 사용하는 것을 전제로 합니다.</li>
            <li>
              사용자가 서비스에 입력·처리하는 <strong>학생 등 제3자의 개인정보</strong>에 대해서는,
              그 수집·이용·보관·파기가 개인정보 보호법 및 교육 관련 법령에 적법하게 이루어지도록 할
              책임이 <strong>사용자(및 소속 학교·기관)</strong>에게 있습니다.
            </li>
            <li>
              사용자는 자신이 처리 권한을 가진 정보만 입력해야 하며, 입력 데이터의 적법성·정확성에
              대한 책임을 집니다.
            </li>
          </ul>
        </>
      ),
    },
    {
      number: '4',
      title: '데이터와 백업',
      content: (
        <>
          <ul>
            <li>
              사용자가 쌤핀 안에서 생성·입력한 데이터의 권리는 사용자에게 있습니다. 개발자는 서비스
              제공에 필요한 범위를 넘어 이를 사용하지 않습니다.
            </li>
            <li>
              데이터는 기본적으로 사용자 PC에 로컬 저장되므로,{' '}
              <strong>백업·보관 책임은 사용자</strong>
              에게 있습니다. 기기 고장·삭제·운영체제 초기화 등으로 인한 데이터 손실에 대해 개발자는
              책임지지 않습니다.
            </li>
            <li>개인정보의 처리·저장·전송에 관한 자세한 내용은 개인정보처리방침을 따릅니다.</li>
          </ul>
        </>
      ),
    },
    {
      number: '5',
      title: 'AI 연동(브릿지)과 자동화 결과',
      content: (
        <>
          <ul>
            <li>
              쌤핀 본체는 평가·기록 문장을 <strong>스스로 생성하지 않습니다.</strong> AI 브릿지는
              사용자가 직접 연결한 외부 AI 도구로 데이터를 전달하는 통로일 뿐이며, 추론·생성은
              사용자의 외부 AI가 수행합니다.
            </li>
            <li>
              학생 평가에 AI를 활용하는 경우, 그 사실을 학생·학부모에게 고지하고 필요한 동의를 받을
              의무, 그리고 학생·학부모의 거부·설명 요구에 응할 의무는 <strong>사용자</strong>에게
              있습니다(인공지능 기본법 등 관련 법령 준수 포함).
            </li>
            <li>
              AI가 보조·생성한 결과(예: 생활기록부 초안)의 사실성·적합성과 최종 기재에 대한 책임은
              전적으로 <strong>사용자</strong>에게 있으며, 사용자는 모든 문장을 직접 검토·확인해야
              합니다. 개발자는 외부 AI가 생성한 내용에 대해 책임지지 않습니다.
            </li>
          </ul>
        </>
      ),
    },
    {
      number: '6',
      title: '제3자 서비스',
      content: (
        <>
          <p>
            서비스는 Google API, 클라우드 백엔드(Supabase), 사용자가 연결한 외부 AI 제공자
            (Anthropic·OpenAI·Google 등) 등 제3자 서비스를 이용할 수 있습니다. 각 제3자 서비스의
            이용에는 해당 제공자의 약관과 정책이 적용되며, 개발자는 제3자 서비스의 가용성·동작에
            대해 보증하지 않습니다.
          </p>
        </>
      ),
    },
    {
      number: '7',
      title: '금지 행위',
      content: (
        <>
          <p>사용자는 다음 행위를 해서는 안 됩니다:</p>
          <ul>
            <li>법령을 위반하거나 타인의 권리를 침해하는 목적으로 서비스를 사용하는 행위</li>
            <li>
              처리 권한이 없는 개인정보를 입력·수집하거나, 정당한 권한 없이 타인의 데이터에 접근하는
              행위
            </li>
            <li>
              서비스의 보안 장치를 우회하거나, 서비스 또는 연동된 제3자 시스템의 정상적인 운영을
              방해하는 행위
            </li>
          </ul>
        </>
      ),
    },
    {
      number: '8',
      title: '지식재산권',
      content: (
        <>
          <ul>
            <li>
              서비스(앱·디자인·상표·문서 등)에 관한 지식재산권은 개발자 또는 정당한 권리자에게
              귀속됩니다.
            </li>
            <li>사용자가 서비스 안에서 생성한 콘텐츠·데이터의 권리는 사용자에게 있습니다.</li>
          </ul>
        </>
      ),
    },
    {
      number: '9',
      title: '보증의 부인',
      content: (
        <>
          <p>
            서비스는 <strong>&quot;있는 그대로(AS-IS)&quot;</strong> 제공됩니다. 개발자는 관련
            법령이 허용하는 최대 범위에서, 서비스가 중단 없이 동작한다거나 오류·결함이 없다거나 특정
            목적에 적합하다는 등의 명시적·묵시적 보증을 하지 않습니다.
          </p>
        </>
      ),
    },
    {
      number: '10',
      title: '책임의 제한',
      content: (
        <>
          <p>
            관련 법령이 허용하는 범위에서, 개발자는 서비스 이용 또는 이용 불능으로 발생한 데이터
            손실, 간접·부수적·특별·결과적 손해에 대해 책임지지 않습니다. 무료로 제공되는 서비스의
            특성상, 개발자의 책임은 법령이 정한 한도로 제한됩니다. 다만 개발자의 고의 또는 중대한
            과실로 인한 손해에 대한 책임은 배제되지 않습니다.
          </p>
        </>
      ),
    },
    {
      number: '11',
      title: '서비스의 변경·중단',
      content: (
        <>
          <p>
            개발자는 서비스의 전부 또는 일부를 변경하거나 중단할 수 있습니다. 중요한 변경·중단이
            있을 경우 가능한 범위에서 앱 또는 웹페이지를 통해 안내합니다.
          </p>
        </>
      ),
    },
    {
      number: '12',
      title: '약관의 변경',
      content: (
        <>
          <p>
            본 약관은 개정될 수 있으며, 변경 시 이 페이지를 통해 고지하고 최종 수정일을 갱신합니다.
            변경 이후에도 서비스를 계속 사용하면 변경된 약관에 동의한 것으로 봅니다.
          </p>
        </>
      ),
    },
    {
      number: '13',
      title: '준거법 및 관할',
      content: (
        <>
          <p>
            본 약관은 대한민국 법령에 따라 해석·적용되며, 서비스 이용과 관련한 분쟁은 관련 법령이
            정하는 절차와 관할 법원에 따릅니다.
          </p>
        </>
      ),
    },
    {
      number: '14',
      title: '문의',
      content: (
        <>
          <p>본 약관에 관한 문의는 아래로 연락해 주세요:</p>
          <ul>
            <li>
              이메일: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </li>
          </ul>
        </>
      ),
    },
  ],
};

const enContent = {
  lang: 'en',
  title: 'Terms of Service',
  subtitle: 'SsamPin',
  lastUpdated: 'Last updated: June 24, 2026',
  switchLang: '한국어로 보기',
  switchHref: '?lang=ko',
  intro:
    'These terms apply to your use of the SsamPin app and related services. By installing or using SsamPin, you agree to these terms. If you do not agree, please do not use the service.',
  sections: [
    {
      number: '1',
      title: 'Purpose',
      content: (
        <>
          <p>
            These terms govern the conditions of use of SsamPin, a desktop app for teachers,
            together with its accompanying web pages and collaboration features (collectively, the
            &quot;Service&quot;), and set out the rights and obligations of the developer (the
            &quot;Developer&quot;) and users.
          </p>
        </>
      ),
    },
    {
      number: '2',
      title: 'The Service',
      content: (
        <>
          <ul>
            <li>
              SsamPin is a desktop dashboard app for Korean secondary-school teachers that, by
              default, <strong>works offline and stores data locally on your PC</strong>.
            </li>
            <li>
              Some features — Google integrations (Calendar, Drive backup, Tasks), consultation
              booking, assignment collection, e-signature, surveys, the in-app AI assistant, and
              sending feedback to the developer — operate only when you explicitly use them, and are
              processed according to our <Link href="/privacy">Privacy Policy</Link>.
            </li>
            <li>
              The Service is currently provided free of charge, and its scope and features may
              change.
            </li>
          </ul>
        </>
      ),
    },
    {
      number: '3',
      title: 'Eligibility and Responsible Use',
      content: (
        <>
          <ul>
            <li>
              The Service is intended for use by teachers and other education professionals for work
              purposes.
            </li>
            <li>
              For any <strong>personal data of third parties (such as students)</strong> that you
              enter or process in the Service, you (and your school/institution) are responsible for
              ensuring its collection, use, storage, and deletion comply with the Personal
              Information Protection Act and applicable education-related laws.
            </li>
            <li>
              You must enter only information you are authorized to process, and you are responsible
              for the lawfulness and accuracy of the data you input.
            </li>
          </ul>
        </>
      ),
    },
    {
      number: '4',
      title: 'Your Data and Backups',
      content: (
        <>
          <ul>
            <li>
              You retain rights to the data you create or enter within SsamPin. The Developer does
              not use it beyond what is necessary to provide the Service.
            </li>
            <li>
              Because data is stored locally on your PC by default,{' '}
              <strong>backup and retention are your responsibility</strong>. The Developer is not
              liable for data loss caused by device failure, deletion, OS reset, and the like.
            </li>
            <li>
              Details on the processing, storage, and transmission of personal data are governed by
              the Privacy Policy.
            </li>
          </ul>
        </>
      ),
    },
    {
      number: '5',
      title: 'AI Integration (Bridge) and Automated Outputs',
      content: (
        <>
          <ul>
            <li>
              SsamPin itself does <strong>not generate</strong> evaluation or record text. The AI
              Bridge is merely a conduit that passes data to an external AI tool you connect
              yourself; inference and generation are performed by your external AI.
            </li>
            <li>
              When you use AI for student evaluation, you are responsible for notifying students and
              guardians and obtaining any required consent, and for responding to their requests to
              object or for an explanation (including compliance with the AI Framework Act and other
              applicable laws).
            </li>
            <li>
              You are solely responsible for the accuracy and appropriateness of AI-assisted or
              AI-generated outputs (e.g., draft student records) and for their final entry, and you
              must review and verify every sentence yourself. The Developer is not responsible for
              content generated by external AI.
            </li>
          </ul>
        </>
      ),
    },
    {
      number: '6',
      title: 'Third-Party Services',
      content: (
        <>
          <p>
            The Service may use third-party services such as Google APIs, a cloud backend
            (Supabase), and external AI providers you connect (Anthropic, OpenAI, Google, etc.). Use
            of each third-party service is subject to that provider&apos;s own terms and policies,
            and the Developer does not warrant the availability or operation of third-party
            services.
          </p>
        </>
      ),
    },
    {
      number: '7',
      title: 'Prohibited Conduct',
      content: (
        <>
          <p>You must not:</p>
          <ul>
            <li>Use the Service in violation of law or to infringe the rights of others.</li>
            <li>
              Enter or collect personal data you are not authorized to process, or access
              others&apos; data without proper authorization.
            </li>
            <li>
              Circumvent the Service&apos;s security measures or interfere with the normal operation
              of the Service or integrated third-party systems.
            </li>
          </ul>
        </>
      ),
    },
    {
      number: '8',
      title: 'Intellectual Property',
      content: (
        <>
          <ul>
            <li>
              Intellectual property rights in the Service (app, design, trademarks, documentation,
              etc.) belong to the Developer or the rightful owners.
            </li>
            <li>You retain rights to the content and data you create within the Service.</li>
          </ul>
        </>
      ),
    },
    {
      number: '9',
      title: 'Disclaimer of Warranties',
      content: (
        <>
          <p>
            The Service is provided <strong>&quot;AS-IS.&quot;</strong> To the maximum extent
            permitted by applicable law, the Developer makes no express or implied warranties,
            including that the Service will operate without interruption, be free of errors or
            defects, or be fit for a particular purpose.
          </p>
        </>
      ),
    },
    {
      number: '10',
      title: 'Limitation of Liability',
      content: (
        <>
          <p>
            To the extent permitted by applicable law, the Developer is not liable for data loss or
            for indirect, incidental, special, or consequential damages arising from the use or
            inability to use the Service. Given that the Service is provided free of charge, the
            Developer&apos;s liability is limited to the extent set by law. This does not exclude
            liability for damages caused by the Developer&apos;s willful misconduct or gross
            negligence.
          </p>
        </>
      ),
    },
    {
      number: '11',
      title: 'Changes and Discontinuation of the Service',
      content: (
        <>
          <p>
            The Developer may change or discontinue all or part of the Service. Where there are
            material changes or discontinuation, we will provide notice through the app or web pages
            to the extent practicable.
          </p>
        </>
      ),
    },
    {
      number: '12',
      title: 'Changes to These Terms',
      content: (
        <>
          <p>
            These terms may be revised. Changes will be posted on this page with an updated revision
            date. If you continue to use the Service after a change, you are deemed to have agreed
            to the revised terms.
          </p>
        </>
      ),
    },
    {
      number: '13',
      title: 'Governing Law and Jurisdiction',
      content: (
        <>
          <p>
            These terms are interpreted and applied under the laws of the Republic of Korea, and any
            dispute relating to use of the Service is subject to the procedures and competent courts
            provided by applicable law.
          </p>
        </>
      ),
    },
    {
      number: '14',
      title: 'Contact',
      content: (
        <>
          <p>For questions about these terms, please contact us:</p>
          <ul>
            <li>
              Email: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
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

export default async function TermsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const isEnglish = params.lang === 'en';
  const content = isEnglish ? enContent : koContent;

  return (
    <div className="min-h-screen bg-sp-bg text-sp-text">
      {/* Header */}
      <header className="border-b border-sp-border bg-sp-surface/80 backdrop-blur-sm">
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
            <span className="text-sm">{isEnglish ? 'Back to Home' : '홈으로'}</span>
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
          <h1 className="mb-3 text-3xl font-bold text-sp-text md:text-4xl">{content.title}</h1>
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
            <p className="text-sm leading-relaxed text-sp-muted">{content.intro}</p>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-8">
          {content.sections.map((section) => (
            <section
              key={section.number}
              className="rounded-xl border border-sp-border bg-sp-card p-6 shadow-sm"
            >
              <h2 className="mb-4 flex items-center gap-3 text-lg font-bold text-sp-text">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sp-accent/15 text-sm font-bold text-sp-accent">
                  {section.number}
                </span>
                {section.title}
              </h2>
              <div className="prose-terms text-sm leading-relaxed text-sp-muted">
                {section.content}
              </div>
            </section>
          ))}
        </div>

        {/* Footer note */}
        <div className="mt-10 text-center text-xs text-sp-muted/70">
          <p>
            {isEnglish
              ? 'These terms may be updated. Changes will be posted on this page with an updated revision date.'
              : '본 이용약관은 변경될 수 있습니다. 변경 시 이 페이지를 통해 고지하며, 최종 수정일이 업데이트됩니다.'}
          </p>
        </div>
      </main>

      {/* Inline styles for prose-terms */}
      <style>{`
        .prose-terms p {
          margin-bottom: 0.75rem;
          line-height: 1.7;
        }
        .prose-terms ul {
          margin: 0.5rem 0 0.75rem 0;
          padding-left: 1.25rem;
          list-style-type: disc;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .prose-terms li {
          line-height: 1.6;
        }
        .prose-terms strong {
          color: var(--color-sp-text);
          font-weight: 600;
        }
        .prose-terms a {
          color: var(--color-sp-accent);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .prose-terms a:hover {
          color: var(--color-sp-accent-hover);
        }
        .prose-terms p:last-child,
        .prose-terms ul:last-child {
          margin-bottom: 0;
        }
      `}</style>
    </div>
  );
}
