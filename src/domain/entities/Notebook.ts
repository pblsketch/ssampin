export interface NotebookContext {
  readonly teachingClassId?: string;
  readonly subject?: string;
  readonly semester?: string;
}

export type NotebookColor =
  | 'blue'
  | 'amber'
  | 'green'
  | 'purple'
  | 'orange'
  | 'red'
  | 'pink'
  | 'teal';

export interface Notebook {
  readonly id: string;
  readonly title: string;
  readonly icon?: string;
  readonly colorToken?: NotebookColor;
  readonly context?: NotebookContext;
  readonly order: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archived: boolean;
}
