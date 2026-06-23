import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocsShell } from '@/components/docs/DocsShell';
import { docsArticles, getDocArticle } from '@/content/docs';

interface DocsPageProps {
  readonly params: Promise<{ readonly slug?: readonly string[] }>;
}

function slugFromParts(parts?: readonly string[]): string {
  if (!parts || parts.length === 0) return 'start';
  return parts.join('/');
}

export async function generateStaticParams() {
  return [
    { slug: [] },
    ...docsArticles.map((article) => ({
      slug: article.slug.split('/'),
    })),
  ];
}

export async function generateMetadata({ params }: DocsPageProps): Promise<Metadata> {
  const { slug: parts } = await params;
  const slug = slugFromParts(parts);
  const article = getDocArticle(slug);

  if (!article) {
    return {
      title: '문서를 찾을 수 없습니다 - 쌤핀 도움말',
    };
  }

  const path = slug === 'start' && (!parts || parts.length === 0) ? '/docs' : `/docs/${slug}`;

  return {
    title: `${article.title} - 쌤핀 도움말`,
    description: article.description,
    alternates: {
      canonical: `https://ssampin.com${path}`,
    },
    openGraph: {
      title: `${article.title} - 쌤핀 도움말`,
      description: article.description,
      url: `https://ssampin.com${path}`,
      siteName: '쌤핀 도움말',
      type: 'article',
      locale: 'ko_KR',
      images: article.image
        ? [
            {
              url: article.image.src,
              alt: article.image.alt,
            },
          ]
        : undefined,
    },
  };
}

export default async function DocsPage({ params }: DocsPageProps) {
  const { slug: parts } = await params;
  const slug = slugFromParts(parts);
  const article = getDocArticle(slug);

  if (!article) notFound();

  return <DocsShell article={article} />;
}
