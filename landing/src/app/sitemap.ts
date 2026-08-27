import type { MetadataRoute } from 'next';
import { docsArticles } from '@/content/docs';
import { SITE_URL } from '@/config';

// 사이트맵에는 "색인되기를 바라는 페이지"만 넣는다.
// /privacy 와 /terms 는 의도적으로 noindex 라 여기에 넣지 않는다 —
// noindex 페이지를 사이트맵에 올리면 크롤러에게 서로 모순된 신호를 주는 셈이다.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const docsRoutes: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/docs`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    ...docsArticles.map((article) => ({
      url: `${SITE_URL}/docs/${article.slug}`,
      lastModified: new Date(article.lastUpdated),
      changeFrequency: 'monthly' as const,
      priority: article.category === 'troubleshooting' || article.category === 'start' ? 0.8 : 0.7,
    })),
  ];

  return [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
      alternates: {
        languages: {
          ko: SITE_URL,
        },
      },
    },
    {
      url: `${SITE_URL}/ai-bridge`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/school-adoption`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    // 운영 주체를 밝히는 페이지. 답변엔진이 "누가 만들었나"를 신뢰 판정에 쓰므로
    // 색인 대상이다 (예전에는 사이트맵에서 빠져 있었다).
    {
      url: `${SITE_URL}/about`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/credits`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    ...docsRoutes,
  ];
}
