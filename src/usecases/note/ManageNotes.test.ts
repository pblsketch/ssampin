import { describe, expect, it, vi } from 'vitest';
import type { Notebook } from '@domain/entities/Notebook';
import type { NotePage, NotePageBody } from '@domain/entities/NotePage';
import type { NoteSection } from '@domain/entities/NoteSection';
import type { INotebookRepository } from '@domain/repositories/INotebookRepository';
import { ManageNotes } from './ManageNotes';

class InMemoryNotebookRepository implements INotebookRepository {
  notebooks: readonly Notebook[] = [];
  sections: readonly NoteSection[] = [];
  pagesMeta: readonly NotePage[] = [];
  pageBodies = new Map<string, NotePageBody>();

  async getAllNotebooks(): Promise<readonly Notebook[]> {
    return this.notebooks;
  }

  async saveNotebooks(notebooks: readonly Notebook[]): Promise<void> {
    this.notebooks = notebooks;
  }

  async getAllSections(): Promise<readonly NoteSection[]> {
    return this.sections;
  }

  async saveSections(sections: readonly NoteSection[]): Promise<void> {
    this.sections = sections;
  }

  async getAllPagesMeta(): Promise<readonly NotePage[]> {
    return this.pagesMeta;
  }

  async savePagesMeta(pagesMeta: readonly NotePage[]): Promise<void> {
    this.pagesMeta = pagesMeta;
  }

  async getPageBody(pageId: string): Promise<NotePageBody | null> {
    return this.pageBodies.get(pageId) ?? null;
  }

  async savePageBody(pageId: string, body: NotePageBody): Promise<void> {
    this.pageBodies.set(pageId, body);
  }

  async deletePageBody(pageId: string): Promise<void> {
    this.pageBodies.delete(pageId);
  }
}

const emptyBody: NotePageBody = {
  schemaVersion: 1,
  editorKind: 'blocknote',
  document: [{ type: 'paragraph', content: '' }],
};

describe('ManageNotes', () => {
  it('새 노트북을 만들면 기본 섹션과 페이지를 함께 만든다', async () => {
    const repository = new InMemoryNotebookRepository();
    const createId = vi
      .fn<() => string>()
      .mockReturnValueOnce('notebook-1')
      .mockReturnValueOnce('section-1')
      .mockReturnValueOnce('page-1');
    const usecase = new ManageNotes(repository, createId);

    const created = await usecase.createNotebook({
      title: '학급 경영',
      initialPageBody: emptyBody,
    });

    expect(created.notebook.id).toBe('notebook-1');
    expect(created.section.notebookId).toBe('notebook-1');
    expect(created.page.sectionId).toBe('section-1');
    expect(await repository.getPageBody('page-1')).toEqual(emptyBody);
  });

  it('본문 저장 시 페이지 메타의 수정일이 함께 갱신된다', async () => {
    const repository = new InMemoryNotebookRepository();
    repository.pagesMeta = [
      {
        id: 'page-1',
        sectionId: 'section-1',
        title: '기존 페이지',
        tags: [],
        pinned: false,
        order: 0,
        createdAt: '2026-04-21T00:00:00.000Z',
        updatedAt: '2026-04-21T00:00:00.000Z',
      },
    ];
    const usecase = new ManageNotes(repository, () => 'unused');
    const updatedAt = '2026-04-21T12:34:56.000Z';

    const updated = await usecase.updatePageBody('page-1', emptyBody, updatedAt);

    expect(updated.updatedAt).toBe(updatedAt);
    expect(repository.pagesMeta[0]?.updatedAt).toBe(updatedAt);
    expect(await repository.getPageBody('page-1')).toEqual(emptyBody);
  });
});
