import type { MetadataRoute } from 'next';
import { docsArticles } from '@/content/docs';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const docsRoutes: MetadataRoute.Sitemap = [
    {
      url: 'https://ssampin.com/docs',
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    ...docsArticles.map((article) => ({
      url: `https://ssampin.com/docs/${article.slug}`,
      lastModified: new Date(article.lastUpdated),
      changeFrequency: 'monthly' as const,
      priority: article.category === 'troubleshooting' || article.category === 'start' ? 0.8 : 0.7,
    })),
  ];

  return [
    {
      url: 'https://ssampin.com',
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
      alternates: {
        languages: {
          ko: 'https://ssampin.com',
        },
      },
    },
    {
      url: 'https://ssampin.com/ai-bridge',
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://ssampin.com/school-adoption',
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://ssampin.com/credits',
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    ...docsRoutes,
  ];
}
