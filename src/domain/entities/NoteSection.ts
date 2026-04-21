export interface NoteSection {
  readonly id: string;
  readonly notebookId: string;
  readonly title: string;
  readonly order: number;
  readonly collapsed: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}
