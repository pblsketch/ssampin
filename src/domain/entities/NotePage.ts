export interface NotePage {
  readonly id: string;
  readonly sectionId: string;
  readonly title: string;
  readonly tags: readonly string[];
  readonly pinned: boolean;
  readonly icon?: string;
  readonly order: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastOpenedAt?: string;
}

export interface NotePageBody {
  readonly schemaVersion: 1;
  readonly editorKind: 'blocknote';
  readonly document: unknown;
}
