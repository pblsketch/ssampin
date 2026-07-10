import type { NextConfig } from 'next';

const GITHUB_RELEASES_URL = 'https://github.com/pblsketch/ssampin/releases';

// 보안 응답 헤더. Google Analytics(googletagmanager.com) 외부 스크립트와
// Noto Sans KR(next/font, self 호스팅), 챗봇(Supabase fetch)이 깨지지 않도록
// script-src/connect-src를 실제 사용 출처에 맞춰 허용한다.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
  "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https:",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
];

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/docs/troubleshooting/download',
        destination: GITHUB_RELEASES_URL,
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
