import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/config';

// AI 크롤러는 용도가 세 종류이고, 정책도 용도별로 나눠 짜야 한다.
//   학습용        — 미래 모델이 쌤핀을 알게 한다 (GPTBot, ClaudeBot, Google-Extended, CCBot, Applebot-Extended)
//   검색 색인용   — ChatGPT·Claude·Perplexity 검색이 우리를 인용한다 (OAI-SearchBot, Claude-SearchBot, PerplexityBot)
//   실시간 열람용 — 사용자가 질문한 그 순간 페이지를 연다 (ChatGPT-User, Claude-User, Perplexity-User)
//
// 2026-08-28 결정: 전부 허용한다. 랜딩은 공개 홍보물이라 학생 자료가 없고,
// 학습용을 막으면 "교사용 무료 대시보드"를 묻는 사람에게 앞으로 나올 모델이
// 쌤핀을 답하지 못한다. 그 전까지는 GPTBot·CCBot·Google-Extended 를 막고 있었다.
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
] as const;

// 색인되면 안 되는 경로. 각 페이지가 noindex 를 달고 있지만, 크롤러가 아예 오지 않는
// 편이 안전하고 색인 예산도 아낀다.
//   /admin  — 로그인 벽 뒤라 크롤링해봐야 로그인 화면만 잡힌다
//   나머지  — 학생·보호자에게 개별 발급하는 공유 링크다 (과제 제출, 서명, 설문, 상담 예약, 메모)
const PRIVATE_PATHS = [
  '/admin/',
  '/s/',
  '/check/',
  '/submit/',
  '/booking/',
  '/memo/',
  '/staffroom/join',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: PRIVATE_PATHS,
      },
      {
        // Yeti = 네이버 크롤러
        userAgent: 'Yeti',
        allow: '/',
        disallow: PRIVATE_PATHS,
      },
      ...AI_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: '/',
        disallow: PRIVATE_PATHS,
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
