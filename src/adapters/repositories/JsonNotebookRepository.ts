import type { Notebook } from '@domain/entities/Notebook';
import type { NotePage, NotePageBody } from '@domain/entities/NotePage';
import type { NoteSection } from '@domain/entities/NoteSection';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { INotebookRepository } from '@domain/repositories/INotebookRepository';

const NOTEBOOKS_FILE = 'note-notebooks';
const SECTIONS_FILE = 'note-sections';
const PAGES_META_FILE = 'note-pages-meta';

function getPageBodyFileName(pageId: string): string {
  return `note-body--${pageId}`;
}

export class JsonNotebookRepository implements INotebookRepository {
  constructor(private readonly storage: IStoragePort) {}

  async getAllNotebooks(): Promise<readonly Notebook[]> {
    return (await this.storage.read<readonly Notebook[]>(NOTEBOOKS_FILE)) ?? [];
  }

  async saveNotebooks(notebooks: readonly Notebook[]): Promise<void> {
    await this.storage.write(NOTEBOOKS_FILE, notebooks);
  }

  async getAllSections(): Promise<readonly NoteSection[]> {
    return (await this.storage.read<readonly NoteSection[]>(SECTIONS_FILE)) ?? [];
  }

  async saveSections(sections: readonly NoteSection[]): Promise<void> {
    await this.storage.write(SECTIONS_FILE, sections);
  }

  async getAllPagesMeta(): Promise<readonly NotePage[]> {
    return (await this.storage.read<readonly NotePage[]>(PAGES_META_FILE)) ?? [];
  }

  async savePagesMeta(pagesMeta: readonly NotePage[]): Promise<void> {
    await this.storage.write(PAGES_META_FILE, pagesMeta);
  }

  async getPageBody(pageId: string): Promise<NotePageBody | null> {
    return this.storage.read<NotePageBody>(getPageBodyFileName(pageId));
  }

  async savePageBody(pageId: string, body: NotePageBody): Promise<void> {
    await this.storage.write(getPageBodyFileName(pageId), body);
  }

  async deletePageBody(pageId: string): Promise<void> {
    await this.storage.remove(getPageBodyFileName(pageId));
  }

  async listPageBodyKeys(): Promise<string[]> {
    const pagesMeta = await this.getAllPagesMeta();
    return pagesMeta.map((page) => getPageBodyFileName(page.id));
  }
}
