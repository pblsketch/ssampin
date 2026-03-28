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
    '시간표, 학급 자리 배치, 일정, 급식, 날씨, 쌤도구까지 한 화면에서 관리하세요. 무료 Windows 앱.',
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
    '쌤핀', 'SsamPin', '교사', '교사용 앱', '선생님 앱',
    '시간표', '시간표 관리', '학급 자리 배치', '좌석 배치',
    '대시보드', '선생님', '급식', '급식 정보',
    '쌤도구', '교실 도구', '수업 도구',
    '타이머', '랜덤 뽑기', '점수판', '룰렛',
    '날씨', '미세먼지', 'PIN잠금',
    '교사용 프로그램', '교사용 데스크톱 앱', '무료 교사 앱',
    '학급 관리', '담임 업무', '일정 관리',
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
  operatingSystem: 'Windows 10, Windows 11',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'KRW',
  },
  softwareVersion: '1.8.0',
  author: {
    '@type': 'Person',
    name: 'PBL Sketch',
    url: 'https://github.com/pblsketch',
  },
  downloadUrl:
    'https://github.com/pblsketch/ssampin/releases/latest/download/ssampin-Setup.exe',
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
        text: '날씨와 급식을 제외한 모든 기능이 오프라인에서 동작해요.',
      },
    },
    {
      '@type': 'Question',
      name: 'Mac에서도 쓸 수 있나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '현재는 Windows만 지원해요. Mac 버전은 요청이 많으면 만들어볼게요!',
      },
    },
    {
      '@type': 'Question',
      name: '데이터는 어디에 저장되나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '내 컴퓨터에만 저장돼요. 서버로 전송되지 않아요.',
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
      name: '급식 정보는 어떻게 나오나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'NEIS(나이스) 공식 API에서 자동으로 가져와요. 설정에서 학교만 검색하면 매일 급식이 표시돼요.',
      },
    },
    {
      '@type': 'Question',
      name: '쌤도구는 뭔가요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '타이머, 랜덤 뽑기, 점수판, 룰렛, 주사위, 투표, QR코드 등 수업에 바로 쓸 수 있는 15가지 교실 도구예요.',
      },
    },
    {
      '@type': 'Question',
      name: 'PIN 잠금은 왜 필요한가요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '학생이 볼 수 있는 상황에서 담임메모나 성적 같은 민감한 정보를 보호할 수 있어요. 기능별로 잠금을 설정할 수 있어요.',
      },
    },
    {
      '@type': 'Question',
      name: '과제수합은 어떻게 사용하나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '수업 관리 페이지에서 과제를 생성한 후, QR코드를 학생들에게 보여주면 스마트폰으로 바로 제출할 수 있어요. 파일과 텍스트 제출을 모두 지원해요.',
      },
    },
    {
      '@type': 'Question',
      name: '과목 색상을 바꿀 수 있나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '시간표에서 과목을 클릭하면 인라인 팔레트가 나타나요. 16가지 프리셋 색상 중 원하는 색을 선택하거나 기본값으로 되돌릴 수 있어요.',
      },
    },
    {
      '@type': 'Question',
      name: '짝꿍 배치는 어떻게 하나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '좌석배치 페이지에서 짝꿍 모드를 활성화하면 2인 1조 짝꿍 배치를 자동으로 생성할 수 있어요. 내보내기에도 반영돼요.',
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
