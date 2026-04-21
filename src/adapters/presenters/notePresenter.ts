import type { PartialBlock } from '@blocknote/core';
import type { NotePageBody } from '@domain/entities/NotePage';

function createEmptyDocument(): PartialBlock[] {
  return [
    {
      type: 'paragraph',
      content: '',
    },
  ];
}

export function createEmptyNotePageBody(): NotePageBody {
  return {
    schemaVersion: 1,
    editorKind: 'blocknote',
    document: createEmptyDocument(),
  };
}

export function toEditorDocument(
  body: NotePageBody | null | undefined,
): PartialBlock[] {
  if (
    body?.editorKind !== 'blocknote' ||
    !Array.isArray(body.document) ||
    body.document.length === 0
  ) {
    return createEmptyDocument();
  }

  return body.document as PartialBlock[];
}

export function fromEditorDocument(document: unknown): NotePageBody {
  if (!Array.isArray(document) || document.length === 0) {
    return createEmptyNotePageBody();
  }

  return {
    schemaVersion: 1,
    editorKind: 'blocknote',
    document,
  };
}
