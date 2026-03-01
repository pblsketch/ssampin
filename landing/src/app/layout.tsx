import type { Metadata } from 'next';
import { Noto_Sans_KR } from 'next/font/google';
import './globals.css';

const notoSansKR = Noto_Sans_KR({
  variable: '--font-noto-sans-kr',
  subsets: ['latin'],
  weight: ['400', '500', '700', '800'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://ssampin.vercel.app'),
  title: '쌤핀 (SsamPin) — 선생님의 대시보드',
  description:
    '시간표, 학급 자리 배치, 일정, 급식, 날씨, 쌤도구까지 한 화면에서 관리하세요. 무료 Windows 앱.',
  openGraph: {
    title: '📌 쌤핀 — 선생님의 대시보드',
    description:
      '바탕화면에 항상 띄워두는 교사용 대시보드. 시간표, 자리 배치, 일정, 급식, 날씨, 쌤도구까지 한 화면에.',
    images: ['/images/og-image.png'],
    url: 'https://ssampin.vercel.app',
    type: 'website',
    locale: 'ko_KR',
  },
  twitter: {
    card: 'summary_large_image',
    title: '📌 쌤핀 — 선생님의 대시보드',
    description:
      '바탕화면에 항상 띄워두는 교사용 대시보드. 시간표, 자리 배치, 일정, 급식, 날씨, 쌤도구까지 한 화면에.',
    images: ['/images/og-image.png'],
  },
  keywords: ['쌤핀', 'SsamPin', '교사', '시간표', '학급 자리 배치', '대시보드', '선생님', '급식', '쌤도구', '교실도구', '날씨', 'PIN잠금', '미세먼지'],
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${notoSansKR.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
