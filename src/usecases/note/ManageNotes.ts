import type { Notebook } from '@domain/entities/Notebook';
import type { NotePage, NotePageBody } from '@domain/entities/NotePage';
import type { NoteSection } from '@domain/entities/NoteSection';
import { isDuplicateNotebookTitle } from '@domain/rules/notebookRules';
import type { INotebookRepository } from '@domain/repositories/INotebookRepository';

export interface NoteSnapshot {
  readonly notebooks: readonly Notebook[];
  readonly sections: readonly NoteSection[];
  readonly pagesMeta: readonly NotePage[];
}

interface CreateNotebookInput {
  readonly title: string;
  readonly icon?: string;
  readonly initialPageBody: NotePageBody;
}

export class ManageNotes {
  constructor(
    private readonly repository: INotebookRepository,
    private readonly createId: () => string,
  ) {}

  async getSnapshot(): Promise<NoteSnapshot> {
    const [notebooks, sections, pagesMeta] = await Promise.all([
      this.repository.getAllNotebooks(),
      this.repository.getAllSections(),
      this.repository.getAllPagesMeta(),
    ]);

    return {
      notebooks,
      sections,
      pagesMeta,
    };
  }

  async getPageBody(pageId: string): Promise<NotePageBody | null> {
    return this.repository.getPageBody(pageId);
  }

  async createNotebook(input: CreateNotebookInput): Promise<{
    notebook: Notebook;
    section: NoteSection;
    page: NotePage;
  }> {
    const snapshot = await this.getSnapshot();
    const now = new Date().toISOString();
    const title = this.createUniqueNotebookTitle(
      snapshot.notebooks,
      input.title.trim() || '새 노트북',
    );
    const notebookId = this.createId();
    const sectionId = this.createId();
    const pageId = this.createId();

    const notebook: Notebook = {
      id: notebookId,
      title,
      order: this.getNextOrder(snapshot.notebooks),
      createdAt: now,
      updatedAt: now,
      archived: false,
      ...(input.icon ? { icon: input.icon } : {}),
    };

    const section: NoteSection = {
      id: sectionId,
      notebookId,
      title: '기본 섹션',
      order: 0,
      collapsed: false,
      createdAt: now,
      updatedAt: now,
    };

    const page: NotePage = {
      id: pageId,
      sectionId,
      title: '새 페이지',
      tags: [],
      pinned: false,
      order: 0,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    };

    await Promise.all([
      this.repository.saveNotebooks([...snapshot.notebooks, notebook]),
      this.repository.saveSections([...snapshot.sections, section]),
      this.repository.savePagesMeta([...snapshot.pagesMeta, page]),
      this.repository.savePageBody(page.id, input.initialPageBody),
    ]);

    return { notebook, section, page };
  }

  async renameNotebook(id: string, title: string): Promise<Notebook> {
    const notebooks = await this.repository.getAllNotebooks();
    const notebook = this.findNotebook(notebooks, id);
    const nextTitle = title.trim();

    if (nextTitle.length === 0) {
      throw new Error('노트북 이름은 비워둘 수 없습니다.');
    }

    if (isDuplicateNotebookTitle(notebooks, nextTitle, id)) {
      throw new Error('같은 이름의 노트북이 이미 있습니다.');
    }

    const updated: Notebook = {
      ...notebook,
      title: nextTitle,
      updatedAt: new Date().toISOString(),
    };

    await this.repository.saveNotebooks(
      notebooks.map((current) => (current.id === id ? updated : current)),
    );

    return updated;
  }

  async deleteNotebook(id: string): Promise<void> {
    const snapshot = await this.getSnapshot();
    const sectionIds = snapshot.sections
      .filter((section) => section.notebookId === id)
      .map((section) => section.id);
    const pageIds = snapshot.pagesMeta
      .filter((page) => sectionIds.includes(page.sectionId))
      .map((page) => page.id);

    await Promise.all([
      this.repository.saveNotebooks(
        snapshot.notebooks.filter((notebook) => notebook.id !== id),
      ),
      this.repository.saveSections(
        snapshot.sections.filter((section) => section.notebookId !== id),
      ),
      this.repository.savePagesMeta(
        snapshot.pagesMeta.filter((page) => !pageIds.includes(page.id)),
      ),
      ...pageIds.map((pageId) => this.repository.deletePageBody(pageId)),
    ]);
  }

  async createSection(notebookId: string, title: string): Promise<NoteSection> {
    const sections = await this.repository.getAllSections();
    const now = new Date().toISOString();

    const section: NoteSection = {
      id: this.createId(),
      notebookId,
      title: title.trim() || '새 섹션',
      order: this.getNextOrder(
        sections.filter((current) => current.notebookId === notebookId),
      ),
      collapsed: false,
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.saveSections([...sections, section]);
    return section;
  }

  async renameSection(id: string, title: string): Promise<NoteSection> {
    const sections = await this.repository.getAllSections();
    const section = this.findSection(sections, id);
    const updated: NoteSection = {
      ...section,
      title: title.trim() || section.title,
      updatedAt: new Date().toISOString(),
    };

    await this.repository.saveSections(
      sections.map((current) => (current.id === id ? updated : current)),
    );

    return updated;
  }

  async setSectionCollapsed(
    id: string,
    collapsed: boolean,
  ): Promise<NoteSection> {
    const sections = await this.repository.getAllSections();
    const section = this.findSection(sections, id);
    const updated: NoteSection = {
      ...section,
      collapsed,
      updatedAt: new Date().toISOString(),
    };

    await this.repository.saveSections(
      sections.map((current) => (current.id === id ? updated : current)),
    );

    return updated;
  }

  async deleteSection(id: string): Promise<void> {
    const [sections, pagesMeta] = await Promise.all([
      this.repository.getAllSections(),
      this.repository.getAllPagesMeta(),
    ]);
    const pageIds = pagesMeta
      .filter((page) => page.sectionId === id)
      .map((page) => page.id);

    await Promise.all([
      this.repository.saveSections(
        sections.filter((section) => section.id !== id),
      ),
      this.repository.savePagesMeta(
        pagesMeta.filter((page) => page.sectionId !== id),
      ),
      ...pageIds.map((pageId) => this.repository.deletePageBody(pageId)),
    ]);
  }

  async createPage(
    sectionId: string,
    title: string,
    body: NotePageBody,
  ): Promise<NotePage> {
    const pagesMeta = await this.repository.getAllPagesMeta();
    const now = new Date().toISOString();
    const page: NotePage = {
      id: this.createId(),
      sectionId,
      title: title.trim() || '새 페이지',
      tags: [],
      pinned: false,
      order: this.getNextOrder(
        pagesMeta.filter((current) => current.sectionId === sectionId),
      ),
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    };

    await Promise.all([
      this.repository.savePagesMeta([...pagesMeta, page]),
      this.repository.savePageBody(page.id, body),
    ]);

    return page;
  }

  async renamePage(id: string, title: string): Promise<NotePage> {
    const pagesMeta = await this.repository.getAllPagesMeta();
    const page = this.findPage(pagesMeta, id);
    const updated: NotePage = {
      ...page,
      title: title.trim() || page.title,
      updatedAt: new Date().toISOString(),
    };

    await this.repository.savePagesMeta(
      pagesMeta.map((current) => (current.id === id ? updated : current)),
    );

    return updated;
  }

  async togglePagePin(id: string): Promise<NotePage> {
    const pagesMeta = await this.repository.getAllPagesMeta();
    const page = this.findPage(pagesMeta, id);
    const updated: NotePage = {
      ...page,
      pinned: !page.pinned,
      updatedAt: new Date().toISOString(),
    };

    await this.repository.savePagesMeta(
      pagesMeta.map((current) => (current.id === id ? updated : current)),
    );

    return updated;
  }

  async touchPage(id: string): Promise<NotePage> {
    const pagesMeta = await this.repository.getAllPagesMeta();
    const page = this.findPage(pagesMeta, id);
    const updated: NotePage = {
      ...page,
      lastOpenedAt: new Date().toISOString(),
    };

    await this.repository.savePagesMeta(
      pagesMeta.map((current) => (current.id === id ? updated : current)),
    );

    return updated;
  }

  async updatePageBody(
    id: string,
    body: NotePageBody,
    updatedAt: string = new Date().toISOString(),
  ): Promise<NotePage> {
    const pagesMeta = await this.repository.getAllPagesMeta();
    const page = this.findPage(pagesMeta, id);
    const updated: NotePage = {
      ...page,
      updatedAt,
    };

    await Promise.all([
      this.repository.savePageBody(id, body),
      this.repository.savePagesMeta(
        pagesMeta.map((current) => (current.id === id ? updated : current)),
      ),
    ]);

    return updated;
  }

  async deletePage(id: string): Promise<void> {
    const pagesMeta = await this.repository.getAllPagesMeta();
    await Promise.all([
      this.repository.savePagesMeta(
        pagesMeta.filter((page) => page.id !== id),
      ),
      this.repository.deletePageBody(id),
    ]);
  }

  private createUniqueNotebookTitle(
    notebooks: readonly Notebook[],
    baseTitle: string,
  ): string {
    if (!isDuplicateNotebookTitle(notebooks, baseTitle)) {
      return baseTitle;
    }

    let sequence = 2;
    while (true) {
      const candidate = `${baseTitle} ${sequence}`;
      if (!isDuplicateNotebookTitle(notebooks, candidate)) {
        return candidate;
      }
      sequence += 1;
    }
  }

  private getNextOrder<T extends { order: number }>(items: readonly T[]): number {
    if (items.length === 0) {
      return 0;
    }

    return Math.max(...items.map((item) => item.order)) + 1;
  }

  private findNotebook(
    notebooks: readonly Notebook[],
    id: string,
  ): Notebook {
    const notebook = notebooks.find((current) => current.id === id);
    if (!notebook) {
      throw new Error('노트북을 찾을 수 없습니다.');
    }
    return notebook;
  }

  private findSection(
    sections: readonly NoteSection[],
    id: string,
  ): NoteSection {
    const section = sections.find((current) => current.id === id);
    if (!section) {
      throw new Error('섹션을 찾을 수 없습니다.');
    }
    return section;
  }

  private findPage(
    pagesMeta: readonly NotePage[],
    id: string,
  ): NotePage {
    const page = pagesMeta.find((current) => current.id === id);
    if (!page) {
      throw new Error('페이지를 찾을 수 없습니다.');
    }
    return page;
  }
}
