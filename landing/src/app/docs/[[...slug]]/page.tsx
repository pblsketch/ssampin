import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DocsShell } from '@/components/docs/DocsShell';
import { docsArticles, getDocArticle } from '@/content/docs';
import type { DocArticle } from '@/content/docs';
import { SITE_URL } from '@/config';
import {
  AUTHOR_ID,
  ORGANIZATION_ID,
  WEBSITE_ID,
  APP_ID,
  buildBreadcrumbJsonLd,
  jsonLdScriptProps,
} from '@/content/structuredData';

interface DocsPageProps {
  readonly params: Promise<{ readonly slug?: readonly string[] }>;
}

function slugFromParts(parts?: readonly string[]): string {
  if (!parts || parts.length === 0) return 'start';
  return parts.join('/');
}

function pathFor(slug: string, parts?: readonly string[]): string {
  return slug === 'start' && (!parts || parts.length === 0) ? '/docs' : `/docs/${slug}`;
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

  const path = pathFor(slug, parts);

  return {
    title: `${article.title} - 쌤핀 도움말`,
    description: article.description,
    alternates: {
      canonical: `${SITE_URL}${path}`,
    },
    openGraph: {
      title: `${article.title} - 쌤핀 도움말`,
      description: article.description,
      url: `${SITE_URL}${path}`,
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

/**
 * 도움말 문서 한 편의 구조화 데이터.
 *
 * `datePublished` 는 일부러 넣지 않는다. 우리가 들고 있는 날짜는 마지막 수정일뿐이라,
 * 그 값을 최초 발행일인 척 적으면 화면이 사실 아닌 것을 말하게 된다.
 * `dateModified` 는 화면에 "업데이트 2026-08-20" 으로 실제 보이는 값과 같다.
 */
function articleJsonLd(article: DocArticle, path: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    '@id': `${SITE_URL}${path}#article`,
    headline: article.title,
    description: article.description,
    inLanguage: 'ko-KR',
    dateModified: article.lastUpdated,
    author: { '@id': AUTHOR_ID },
    publisher: { '@id': ORGANIZATION_ID },
    isPartOf: { '@id': WEBSITE_ID },
    about: { '@id': APP_ID },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}${path}` },
    ...(article.image ? { image: `${SITE_URL}${article.image.src}` } : {}),
  };
}

export default async function DocsPage({ params }: DocsPageProps) {
  const { slug: parts } = await params;
  const slug = slugFromParts(parts);
  const article = getDocArticle(slug);

  if (!article) notFound();

  const path = pathFor(slug, parts);
  const breadcrumb = buildBreadcrumbJsonLd(
    path === '/docs'
      ? [
          { name: '쌤핀 홈', path: '/' },
          { name: '쌤핀 도움말', path: '/docs' },
        ]
      : [
          { name: '쌤핀 홈', path: '/' },
          { name: '쌤핀 도움말', path: '/docs' },
          { name: article.title, path },
        ],
  );

  return (
    <>
      <script {...jsonLdScriptProps(articleJsonLd(article, path))} />
      <script {...jsonLdScriptProps(breadcrumb)} />
      <DocsShell article={article} />
    </>
  );
}
