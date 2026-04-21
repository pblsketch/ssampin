import type { NotePage } from '@domain/entities/NotePage';

export function sortPagesForSection(
  pages: readonly NotePage[],
  sectionId: string,
): readonly NotePage[] {
  return pages
    .filter((page) => page.sectionId === sectionId)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }

      return (
        a.order - b.order ||
        a.title.localeCompare(b.title, 'ko')
      );
    });
}
