import type { Metadata } from 'next';
import { Noto_Sans_KR } from 'next/font/google';
import GoogleAnalytics from '../components/GoogleAnalytics';
import { ChatWidget } from '../components/chat';
import { SITE_URL } from '@/config';
import { organizationJsonLd, websiteJsonLd, jsonLdScriptProps } from '@/content/structuredData';
import './globals.css';

const notoSansKR = Noto_Sans_KR({
  variable: '--font-noto-sans-kr',
  subsets: ['latin'],
  weight: ['400', '500', '700', '800'],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
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
  // ⚠️ 여기에 canonical 을 두지 않는다.
  // 루트 레이아웃의 canonical 은 자기 주소를 따로 지정하지 않은 모든 하위 페이지에
  // 그대로 상속된다. 예전에 이 자리에 홈 주소가 박혀 있어서 /about·/ai-bridge·/credits 가
  // 검색엔진에 "나는 홈의 중복본"이라고 신고하고 있었다 — 색인에서 빠지는 지름길이다.
  // 정본 주소는 페이지마다 각자 선언한다.
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
    url: SITE_URL,
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <GoogleAnalytics />
        {/* 사이트 전체가 공유하는 엔티티만 전역이다. 제품 정보·FAQ·이동경로는
            그 내용이 화면에 실제로 보이는 페이지에서 각자 선언한다. */}
        <script {...jsonLdScriptProps(organizationJsonLd)} />
        <script {...jsonLdScriptProps(websiteJsonLd)} />
      </head>
      <body className={`${notoSansKR.variable} font-sans antialiased`}>
        {children}
        <ChatWidget />
      </body>
    </html>
  );
}
