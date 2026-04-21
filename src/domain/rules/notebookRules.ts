import type { Notebook } from '@domain/entities/Notebook';
import type { NoteSection } from '@domain/entities/NoteSection';

export function sortNotebooksForSidebar(
  notebooks: readonly Notebook[],
): readonly Notebook[] {
  return [...notebooks]
    .filter((notebook) => !notebook.archived)
    .sort(
      (a, b) =>
        a.order - b.order ||
        a.title.localeCompare(b.title, 'ko'),
    );
}

export function isDuplicateNotebookTitle(
  notebooks: readonly Notebook[],
  title: string,
  ignoreId?: string,
): boolean {
  const normalizedTitle = title.trim().toLocaleLowerCase('ko-KR');
  return notebooks.some((notebook) => {
    if (notebook.id === ignoreId) {
      return false;
    }

    return notebook.title.trim().toLocaleLowerCase('ko-KR') === normalizedTitle;
  });
}

export function sortSectionsForNotebook(
  sections: readonly NoteSection[],
  notebookId: string,
): readonly NoteSection[] {
  return sections
    .filter((section) => section.notebookId === notebookId)
    .sort(
      (a, b) =>
        a.order - b.order ||
        a.title.localeCompare(b.title, 'ko'),
    );
}
