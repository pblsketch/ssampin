import type { Metadata } from 'next';
import { Noto_Sans_KR } from 'next/font/google';
import GoogleAnalytics from '../components/GoogleAnalytics';
import { ChatWidget } from '../components/chat';
import './globals.css';

const notoSansKR = Noto_Sans_KR({
  variable: '--font-noto-sans-kr',
  subsets: ['latin'],
  weight: ['400', '500', '700', '800'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://ssampin.com'),
  title: '쌤핀 (SsamPin) — 선생님의 대시보드',
  description:
    '시간표, 학급 자리 배치, 일정, 급식, 날씨, 쌤도구까지 한 화면에서 관리하세요. 무료 Windows·macOS 앱.',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  alternates: {
    canonical: 'https://ssampin.com',
    languages: {
      'ko-KR': 'https://ssampin.com',
    },
  },
  openGraph: {
    title: '쌤핀 — 선생님의 대시보드',
    description:
      '항상 열어두는 교사용 대시보드. 시간표, 자리 배치, 일정, 급식, 날씨, 쌤도구까지 한 화면에.',
    images: [
      {
        url: '/images/og-image.png',
        width: 1200,
        height: 630,
        alt: '쌤핀 대시보드 - 교사용 올인원 교실 관리 앱',
      },
    ],
    url: 'https://ssampin.com',
    siteName: '쌤핀 (SsamPin)',
    type: 'website',
    locale: 'ko_KR',
  },
  twitter: {
    card: 'summary_large_image',
    title: '쌤핀 — 선생님의 대시보드',
    description:
      '항상 열어두는 교사용 대시보드. 시간표, 자리 배치, 일정, 급식, 날씨, 쌤도구까지 한 화면에.',
    images: [
      {
        url: '/images/og-image.png',
        alt: '쌤핀 대시보드 - 교사용 올인원 교실 관리 앱',
      },
    ],
  },
  keywords: [
    '쌤핀',
    'SsamPin',
    '교사',
    '교사용 앱',
    '선생님 앱',
    '시간표',
    '시간표 관리',
    '학급 자리 배치',
    '좌석 배치',
    '대시보드',
    '선생님',
    '급식',
    '급식 정보',
    '쌤도구',
    '교실 도구',
    '수업 도구',
    '타이머',
    '랜덤 뽑기',
    '점수판',
    '룰렛',
    '날씨',
    '미세먼지',
    'PIN잠금',
    '교사용 프로그램',
    '교사용 데스크톱 앱',
    '무료 교사 앱',
    '학급 관리',
    '담임 업무',
    '일정 관리',
  ],
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png', sizes: '256x256' },
    ],
    apple: '/apple-icon.png',
  },
  verification: {
    google: 'googlea16810e6f264caeb',
    other: {
      'naver-site-verification': ['f6f9923c2fb93efcc9807242b88b28a8b029c867'],
    },
  },
  other: {
    'content-language': 'ko-KR',
  },
};

const softwareJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: '쌤핀 (SsamPin)',
  description:
    '시간표, 학급 자리 배치, 일정, 급식, 날씨, 쌤도구까지 한 화면에서 관리하는 교사용 데스크톱 대시보드.',
  applicationCategory: 'EducationApplication',
  operatingSystem: 'Windows 10, Windows 11, macOS',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'KRW',
  },
  softwareVersion: '2.4.5',
  author: {
    '@type': 'Person',
    name: 'PBL Sketch',
    url: 'https://github.com/pblsketch',
  },
  downloadUrl: 'https://github.com/pblsketch/ssampin/releases/latest/download/ssampin-Setup.exe',
  screenshot: 'https://ssampin.com/images/dashboard.png',
  inLanguage: 'ko-KR',
  featureList: '시간표 관리, 좌석 배치, 일정 관리, 급식 정보, 날씨, 쌤도구, PIN 잠금, 위젯 모드',
  releaseNotes: 'https://github.com/pblsketch/ssampin/releases',
};

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: '무료인가요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '네, 완전 무료예요. 광고도 없어요.',
      },
    },
    {
      '@type': 'Question',
      name: '인터넷 없이도 되나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '시간표 직접 입력, 좌석배치, 메모, 할 일, 담임 기록 같은 핵심 기능은 오프라인에서 동작해요. 날씨, 급식 자동 조회, NEIS, Google 연동, 공유 링크가 필요한 기능은 인터넷이 필요합니다.',
      },
    },
    {
      '@type': 'Question',
      name: '데이터는 어디에 저장되나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '출결·관찰·상담 기록, 시간표, 자리 배치 같은 본체 자료는 선생님 컴퓨터에만 저장돼요. 다만 과제 수합·전자 서명·설문·상담 예약처럼 학생·보호자와 온라인으로 주고받는 기능을 쓰시면 그 자료가 클라우드에 저장되고, 앱 안의 AI 도우미에 질문하시면 질문 글이 답변 생성을 위해 전송돼요. 자세한 내역은 개인정보처리방침 제11조·제13조에 있습니다.',
      },
    },
    {
      '@type': 'Question',
      name: '보안 경고가 뜨는데 괜찮은가요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '쌤핀은 안전한 프로그램이에요. 개인 개발 앱이라 아직 Microsoft 인증서가 없어서 경고가 뜰 수 있어요. "추가 정보 → 실행"을 클릭하시거나, 백신의 실시간 감시를 잠시 끄고 설치해보세요. 자세한 방법은 위의 "설치 안내" 섹션을 확인해주세요.',
      },
    },
    {
      '@type': 'Question',
      name: 'Mac에서도 쓸 수 있나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '네, macOS도 지원해요! 위의 다운로드 버튼에서 macOS용을 받으세요. Apple Silicon(M1~M4)과 Intel Mac 모두 지원하며, Mac으로 접속하면 Apple Silicon용이 기본으로 제공됩니다. 처음 실행 시 "개발자를 확인할 수 없음" 경고가 뜨면, 시스템 설정 → 개인정보 보호 및 보안에서 "그래도 열기"를 클릭하세요.',
      },
    },
    {
      '@type': 'Question',
      name: '업데이트는 어떻게 하나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '앱이 자동으로 새 버전을 알려줘요. 알림이 오면 "업데이트" 버튼만 누르면 돼요.',
      },
    },
    {
      '@type': 'Question',
      name: '구글 캘린더·드라이브 동기화가 안 돼요',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '설정의 Google 연동 탭에서 연결 상태를 확인하고, 연결 해제 후 다시 연결해보세요. 학교 네트워크나 인앱 브라우저가 Google 로그인을 막는 경우도 있어 Chrome/Safari 같은 외부 브라우저에서 다시 시도하면 해결되는 경우가 많아요.',
      },
    },
    {
      '@type': 'Question',
      name: '학운위 심의를 받아야 하나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '심의 대상인지는 학교가 판단하실 사항이라 저희가 단정해 드리지 않습니다. 쌤핀은 학생 계정을 만들지 않고 학생에게서 직접 정보를 받지도 않지만, 선생님이 과제 수합·전자 서명 같은 협업 기능을 쓰시면 학생 이름이 클라우드에 저장됩니다. 쌤핀은 에듀집 학습지원 소프트웨어 필수기준 점검결과가 등록되어 있으며, 심의가 필요하다고 보시는 학교를 위해 체크리스트와 도입 절차를 학교 도입 안내 페이지(ssampin.com/school-adoption)에 준비해 두었습니다.',
      },
    },
  ],
};

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: '쌤핀 (SsamPin)',
  url: 'https://ssampin.com',
  inLanguage: 'ko-KR',
  description: '교사를 위한 올인원 교실 관리 대시보드 앱',
  publisher: {
    '@type': 'Person',
    name: 'PBL Sketch',
    url: 'https://github.com/pblsketch',
  },
};

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: '쌤핀 홈',
      item: 'https://ssampin.com',
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <GoogleAnalytics />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(softwareJsonLd),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(faqJsonLd),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(websiteJsonLd),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(breadcrumbJsonLd),
          }}
        />
      </head>
      <body className={`${notoSansKR.variable} font-sans antialiased`}>
        {children}
        <ChatWidget />
      </body>
    </html>
  );
}
