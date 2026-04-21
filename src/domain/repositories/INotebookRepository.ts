import type { Notebook } from '@domain/entities/Notebook';
import type { NotePage, NotePageBody } from '@domain/entities/NotePage';
import type { NoteSection } from '@domain/entities/NoteSection';

export interface INotebookRepository {
  getAllNotebooks(): Promise<readonly Notebook[]>;
  saveNotebooks(notebooks: readonly Notebook[]): Promise<void>;

  getAllSections(): Promise<readonly NoteSection[]>;
  saveSections(sections: readonly NoteSection[]): Promise<void>;

  getAllPagesMeta(): Promise<readonly NotePage[]>;
  savePagesMeta(pagesMeta: readonly NotePage[]): Promise<void>;

  getPageBody(pageId: string): Promise<NotePageBody | null>;
  savePageBody(pageId: string, body: NotePageBody): Promise<void>;
  deletePageBody(pageId: string): Promise<void>;
}
