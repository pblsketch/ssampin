'use client';

import { useMemo, useState } from 'react';
import {
  docsArticles,
  docsNavGroups,
  getDocArticle,
  getDocPath,
  getDocsSearchText,
  getRelatedArticles,
  type DocArticle,
  type DocCallout,
  type DocImage,
  type DocSection,
} from '@/content/docs';

interface DocsShellProps {
  readonly article: DocArticle;
}

const categoryLabel: Record<DocArticle['category'], string> = {
  start: '시작하기',
  features: '주요 기능',
  sync: '백업과 연동',
  troubleshooting: '문제 해결',
  reference: '참고',
};

export function DocsShell({ article }: DocsShellProps) {
  const [query, setQuery] = useState('');

  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];

    return docsArticles
      .map((item) => {
        const text = getDocsSearchText(item).toLowerCase();
        const titleHit = item.title.toLowerCase().includes(normalized) ? 4 : 0;
        const bodyHit = text.includes(normalized) ? 1 : 0;
        return { item, score: titleHit + bodyHit };
      })
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title, 'ko'))
      .slice(0, 8);
  }, [query]);

  const related = getRelatedArticles(article);

  return (
    <div className="min-h-screen bg-sp-bg text-sp-text">
      <header className="border-b border-sp-border bg-sp-surface/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <a
              href="/"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sp-border bg-sp-card text-sm font-extrabold text-sp-accent transition-colors hover:border-sp-accent/60"
              aria-label="쌤핀 홈으로 이동"
            >
              <img
                src="/images/pin-celebrate.gif"
                alt=""
                aria-hidden="true"
                className="h-7 w-7 object-contain [image-rendering:pixelated]"
              />
            </a>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-sp-accent">쌤핀 도움말</p>
              <p className="truncate text-sm text-sp-muted">공식 사용자 가이드</p>
            </div>
          </div>

          <div className="relative w-full lg:max-w-md">
            <label htmlFor="docs-search" className="sr-only">
              문서 검색
            </label>
            <input
              id="docs-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="보안 경고, 시간표, Google Drive..."
              className="h-11 w-full rounded-lg border border-sp-border bg-sp-card px-4 text-sm text-sp-text outline-none transition-colors placeholder:text-sp-muted/70 focus:border-sp-accent"
            />
            {query.trim() && (
              <div className="absolute left-0 right-0 top-12 z-30 overflow-hidden rounded-xl border border-sp-border bg-sp-card shadow-lg">
                {searchResults.length > 0 ? (
                  <ul className="max-h-96 overflow-y-auto py-2">
                    {searchResults.map(({ item }) => (
                      <li key={item.slug}>
                        <a
                          href={getDocPath(item.slug)}
                          className="block px-4 py-3 transition-colors hover:bg-sp-surface"
                        >
                          <span className="text-xs font-semibold text-sp-accent">
                            {categoryLabel[item.category]}
                          </span>
                          <span className="mt-0.5 block text-sm font-bold text-sp-text">
                            {item.title}
                          </span>
                          <span className="mt-1 block text-xs leading-relaxed text-sp-muted">
                            {item.description}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 py-5 text-sm text-sp-muted">검색 결과가 없습니다.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)_220px] lg:px-8">
        <aside className="hidden lg:block">
          <DocsSidebar currentSlug={article.slug} />
        </aside>

        <main className="min-w-0">
          <MobileNav currentSlug={article.slug} />

          <div className="mb-8 border-b border-sp-border pb-8">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-lg border border-sp-border bg-sp-surface px-2.5 py-1 text-xs font-semibold text-sp-accent">
                {categoryLabel[article.category]}
              </span>
              <span className="text-xs text-sp-muted">업데이트 {article.lastUpdated}</span>
            </div>

            <h1 className="text-3xl font-extrabold leading-tight text-sp-text md:text-4xl">
              {article.title}
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-sp-muted">
              {article.description}
            </p>

            {article.quickLinks && article.quickLinks.length > 0 && (
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {article.quickLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="group rounded-xl border border-sp-border bg-sp-card p-4 transition-colors hover:border-sp-accent/50"
                  >
                    <span className="text-sm font-bold text-sp-text">{link.title}</span>
                    <span className="mt-2 block text-xs font-semibold text-sp-accent group-hover:underline">
                      바로 보기
                    </span>
                  </a>
                ))}
              </div>
            )}

            {article.image && <DocsImage image={article.image} className="mt-7" />}
          </div>

          <article className="space-y-10">
            {article.sections.map((section) => (
              <DocsSection key={section.id} section={section} />
            ))}
          </article>

          {related.length > 0 && (
            <section className="mt-12 border-t border-sp-border pt-8">
              <h2 className="text-lg font-bold text-sp-text">함께 보면 좋은 문서</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {related.map((item) => (
                  <a
                    key={item.slug}
                    href={getDocPath(item.slug)}
                    className="rounded-xl border border-sp-border bg-sp-card p-4 transition-colors hover:border-sp-accent/50"
                  >
                    <span className="text-sm font-bold text-sp-text">{item.title}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-sp-muted">
                      {item.description}
                    </span>
                  </a>
                ))}
              </div>
            </section>
          )}
        </main>

        <aside className="hidden lg:block">
          <div className="sticky top-6 border-l border-sp-border pl-5">
            <p className="text-xs font-bold text-sp-muted">이 문서에서</p>
            <nav aria-label="문서 목차" className="mt-3 space-y-2">
              {article.sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="block text-xs leading-relaxed text-sp-muted transition-colors hover:text-sp-text"
                >
                  {section.title}
                </a>
              ))}
            </nav>
          </div>
        </aside>
      </div>
    </div>
  );
}

function DocsSidebar({ currentSlug }: { readonly currentSlug: string }) {
  return (
    <nav className="sticky top-6 space-y-7" aria-label="문서 사이드바">
      {docsNavGroups.map((group) => (
        <div key={group.title}>
          <p className="mb-2 text-xs font-bold text-sp-muted">{group.title}</p>
          <ul className="space-y-1">
            {group.items.map((slug) => {
              const item = getDocArticle(slug);
              if (!item) return null;
              const active = item.slug === currentSlug;
              return (
                <li key={item.slug}>
                  <a
                    href={getDocPath(item.slug)}
                    className={[
                      'block rounded-lg px-3 py-2 text-sm transition-colors',
                      active
                        ? 'bg-sp-accent text-white'
                        : 'text-sp-muted hover:bg-sp-surface hover:text-sp-text',
                    ].join(' ')}
                  >
                    {item.title}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function MobileNav({ currentSlug }: { readonly currentSlug: string }) {
  return (
    <details className="mb-6 rounded-xl border border-sp-border bg-sp-card lg:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-bold text-sp-text [&::-webkit-details-marker]:hidden">
        문서 목록
        <span className="details-chevron text-sp-muted">⌄</span>
      </summary>
      <div className="border-t border-sp-border px-4 py-4">
        <DocsSidebar currentSlug={currentSlug} />
      </div>
    </details>
  );
}

function DocsSection({ section }: { readonly section: DocSection }) {
  return (
    <section
      id={section.id}
      className="scroll-mt-24 border-b border-sp-border/70 pb-10 last:border-0"
    >
      <h2 className="text-xl font-bold leading-snug text-sp-text">{section.title}</h2>

      {section.body && (
        <div className="mt-4 space-y-3">
          {section.body.map((paragraph) => (
            <p key={paragraph} className="text-[0.96rem] leading-8 text-sp-muted">
              {paragraph}
            </p>
          ))}
        </div>
      )}

      {section.steps && (
        <ol className="mt-5 space-y-3">
          {section.steps.map((step, index) => (
            <li key={step} className="flex gap-3 text-sm leading-relaxed text-sp-muted">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-sp-accent/10 text-xs font-bold text-sp-accent">
                {index + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      )}

      {section.bullets && (
        <ul className="mt-5 space-y-2">
          {section.bullets.map((bullet) => (
            <li key={bullet} className="flex gap-3 text-sm leading-relaxed text-sp-muted">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sp-accent" />
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      )}

      {section.callout && <DocsCallout callout={section.callout} />}
      {section.image && <DocsImage image={section.image} className="mt-6" />}
    </section>
  );
}

function DocsCallout({ callout }: { readonly callout: DocCallout }) {
  const toneClass =
    callout.tone === 'warning'
      ? 'border-sp-highlight bg-sp-highlight/10 text-sp-highlight'
      : callout.tone === 'success'
        ? 'border-sp-accent bg-sp-accent/10 text-sp-accent'
        : 'border-sp-border bg-sp-surface text-sp-accent';

  return (
    <div className={`mt-5 rounded-xl border p-4 ${toneClass}`}>
      <p className="text-sm font-bold">{callout.title}</p>
      <p className="mt-2 text-sm leading-relaxed text-sp-muted">{callout.body}</p>
    </div>
  );
}

function DocsImage({
  image,
  className,
}: {
  readonly image: DocImage;
  readonly className?: string;
}) {
  return (
    <figure className={className}>
      <div className="overflow-hidden rounded-xl border border-sp-border bg-sp-card">
        <img src={image.src} alt={image.alt} className="h-auto w-full" loading="lazy" />
      </div>
      <figcaption className="mt-2 text-xs text-sp-muted">{image.alt}</figcaption>
    </figure>
  );
}
