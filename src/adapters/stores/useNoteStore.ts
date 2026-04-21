import { create } from 'zustand';
import type { Notebook } from '@domain/entities/Notebook';
import type { NotePage, NotePageBody } from '@domain/entities/NotePage';
import type { NoteSection } from '@domain/entities/NoteSection';
import { noteRepository } from '@adapters/di/container';
import {
  createEmptyNotePageBody,
} from '@adapters/presenters/notePresenter';
import { sortNotebooksForSidebar, sortSectionsForNotebook } from '@domain/rules/notebookRules';
import { sortPagesForSection } from '@domain/rules/notePageRules';
import { ManageNotes } from '@usecases/note/ManageNotes';
import { generateUUID } from '@infrastructure/utils/uuid';

type SavingState = 'idle' | 'saving' | 'saved' | 'error';

interface NoteState {
  notebooks: readonly Notebook[];
  sections: readonly NoteSection[];
  pagesMeta: readonly NotePage[];
  loaded: boolean;
  activeNotebookId: string | null;
  activeSectionId: string | null;
  activePageId: string | null;
  activePageBody: NotePageBody | null;
  savingState: SavingState;
  load: (force?: boolean) => Promise<void>;
  createNotebook: () => Promise<void>;
  renameNotebook: (id: string, title: string) => Promise<void>;
  deleteNotebook: (id: string) => Promise<void>;
  selectNotebook: (id: string) => Promise<void>;
  createSection: (notebookId: string) => Promise<void>;
  renameSection: (id: string, title: string) => Promise<void>;
  toggleSectionCollapsed: (id: string) => Promise<void>;
  deleteSection: (id: string) => Promise<void>;
  selectSection: (id: string) => Promise<void>;
  createPage: (sectionId: string) => Promise<void>;
  renamePage: (id: string, title: string) => Promise<void>;
  selectPage: (id: string) => Promise<void>;
  togglePagePin: (id: string) => Promise<void>;
  deletePage: (id: string) => Promise<void>;
  queueBodySave: (pageId: string, body: NotePageBody) => void;
  flushPendingSave: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let badgeTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave:
  | { pageId: string; body: NotePageBody; updatedAt: string }
  | null = null;

function clearTimers(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (badgeTimer !== null) {
    clearTimeout(badgeTimer);
    badgeTimer = null;
  }
}

function resolveSelection(input: {
  notebooks: readonly Notebook[];
  sections: readonly NoteSection[];
  pagesMeta: readonly NotePage[];
  activeNotebookId: string | null;
  activeSectionId: string | null;
  activePageId: string | null;
}): {
  activeNotebookId: string | null;
  activeSectionId: string | null;
  activePageId: string | null;
} {
  const notebooks = sortNotebooksForSidebar(input.notebooks);
  const activeNotebookId = notebooks.find(
    (notebook) => notebook.id === input.activeNotebookId,
  )?.id ?? notebooks[0]?.id ?? null;

  const sections = activeNotebookId
    ? sortSectionsForNotebook(input.sections, activeNotebookId)
    : [];
  const activeSectionId = sections.find(
    (section) => section.id === input.activeSectionId,
  )?.id ?? sections[0]?.id ?? null;

  const pages = activeSectionId
    ? sortPagesForSection(input.pagesMeta, activeSectionId)
    : [];
  const activePageId = pages.find(
    (page) => page.id === input.activePageId,
  )?.id ?? pages[0]?.id ?? null;

  return {
    activeNotebookId,
    activeSectionId,
    activePageId,
  };
}

export const useNoteStore = create<NoteState>((set, get) => {
  const manageNotes = new ManageNotes(noteRepository, generateUUID);

  const setSavedBadge = () => {
    set({ savingState: 'saved' });
    badgeTimer = setTimeout(() => {
      set({ savingState: 'idle' });
      badgeTimer = null;
    }, 1600);
  };

  const flushPendingSave = async (): Promise<void> => {
    const saveTarget = pendingSave;
    if (!saveTarget) {
      return;
    }

    pendingSave = null;
    clearTimers();
    set({ savingState: 'saving' });

    try {
      const updatedPage = await manageNotes.updatePageBody(
        saveTarget.pageId,
        saveTarget.body,
        saveTarget.updatedAt,
      );

      set((state) => ({
        pagesMeta: state.pagesMeta.map((page) =>
          page.id === updatedPage.id ? updatedPage : page,
        ),
        activePageBody:
          state.activePageId === saveTarget.pageId
            ? saveTarget.body
            : state.activePageBody,
      }));
      setSavedBadge();
    } catch (error) {
      console.error('[Note] 본문 저장 실패', error);
      set({ savingState: 'error' });
    }
  };

  const loadCurrentPageBody = async (pageId: string | null) => {
    if (!pageId) {
      set({ activePageBody: null });
      return;
    }

    const body = await manageNotes.getPageBody(pageId);
    set({
      activePageBody: body ?? createEmptyNotePageBody(),
    });
  };

  return {
    notebooks: [],
    sections: [],
    pagesMeta: [],
    loaded: false,
    activeNotebookId: null,
    activeSectionId: null,
    activePageId: null,
    activePageBody: null,
    savingState: 'idle',

    load: async (force = false) => {
      if (get().loaded && !force) {
        return;
      }

      await flushPendingSave();
      let snapshot = await manageNotes.getSnapshot();

      if (snapshot.notebooks.length === 0) {
        await manageNotes.createNotebook({
          title: '수업 노트',
          initialPageBody: createEmptyNotePageBody(),
        });
        snapshot = await manageNotes.getSnapshot();
      }

      const selection = resolveSelection({
        notebooks: snapshot.notebooks,
        sections: snapshot.sections,
        pagesMeta: snapshot.pagesMeta,
        activeNotebookId: get().activeNotebookId,
        activeSectionId: get().activeSectionId,
        activePageId: get().activePageId,
      });

      set({
        notebooks: snapshot.notebooks,
        sections: snapshot.sections,
        pagesMeta: snapshot.pagesMeta,
        loaded: true,
        activeNotebookId: selection.activeNotebookId,
        activeSectionId: selection.activeSectionId,
        activePageId: selection.activePageId,
        savingState: 'idle',
      });

      await loadCurrentPageBody(selection.activePageId);
    },

    createNotebook: async () => {
      await flushPendingSave();
      const created = await manageNotes.createNotebook({
        title: '새 노트북',
        initialPageBody: createEmptyNotePageBody(),
      });
      const snapshot = await manageNotes.getSnapshot();

      set({
        notebooks: snapshot.notebooks,
        sections: snapshot.sections,
        pagesMeta: snapshot.pagesMeta,
        activeNotebookId: created.notebook.id,
        activeSectionId: created.section.id,
        activePageId: created.page.id,
        activePageBody: createEmptyNotePageBody(),
        savingState: 'idle',
      });
    },

    renameNotebook: async (id, title) => {
      await manageNotes.renameNotebook(id, title);
      const notebooks = await noteRepository.getAllNotebooks();
      set({ notebooks });
    },

    deleteNotebook: async (id) => {
      await flushPendingSave();
      await manageNotes.deleteNotebook(id);
      const snapshot = await manageNotes.getSnapshot();
      const selection = resolveSelection({
        notebooks: snapshot.notebooks,
        sections: snapshot.sections,
        pagesMeta: snapshot.pagesMeta,
        activeNotebookId:
          get().activeNotebookId === id ? null : get().activeNotebookId,
        activeSectionId: get().activeSectionId,
        activePageId: get().activePageId,
      });

      set({
        notebooks: snapshot.notebooks,
        sections: snapshot.sections,
        pagesMeta: snapshot.pagesMeta,
        activeNotebookId: selection.activeNotebookId,
        activeSectionId: selection.activeSectionId,
        activePageId: selection.activePageId,
      });

      await loadCurrentPageBody(selection.activePageId);
    },

    selectNotebook: async (id) => {
      await flushPendingSave();
      const selection = resolveSelection({
        notebooks: get().notebooks,
        sections: get().sections,
        pagesMeta: get().pagesMeta,
        activeNotebookId: id,
        activeSectionId: null,
        activePageId: null,
      });

      set(selection);
      await loadCurrentPageBody(selection.activePageId);
    },

    createSection: async (notebookId) => {
      const created = await manageNotes.createSection(notebookId, '새 섹션');
      const snapshot = await manageNotes.getSnapshot();
      const selection = resolveSelection({
        notebooks: snapshot.notebooks,
        sections: snapshot.sections,
        pagesMeta: snapshot.pagesMeta,
        activeNotebookId: notebookId,
        activeSectionId: created.id,
        activePageId: null,
      });

      set({
        notebooks: snapshot.notebooks,
        sections: snapshot.sections,
        pagesMeta: snapshot.pagesMeta,
        activeNotebookId: selection.activeNotebookId,
        activeSectionId: selection.activeSectionId,
        activePageId: selection.activePageId,
      });
    },

    renameSection: async (id, title) => {
      const updated = await manageNotes.renameSection(id, title);
      set((state) => ({
        sections: state.sections.map((section) =>
          section.id === updated.id ? updated : section,
        ),
      }));
    },

    toggleSectionCollapsed: async (id) => {
      const target = get().sections.find((section) => section.id === id);
      if (!target) {
        return;
      }
      const updated = await manageNotes.setSectionCollapsed(id, !target.collapsed);
      set((state) => ({
        sections: state.sections.map((section) =>
          section.id === updated.id ? updated : section,
        ),
      }));
    },

    deleteSection: async (id) => {
      await flushPendingSave();
      await manageNotes.deleteSection(id);
      const snapshot = await manageNotes.getSnapshot();
      const selection = resolveSelection({
        notebooks: snapshot.notebooks,
        sections: snapshot.sections,
        pagesMeta: snapshot.pagesMeta,
        activeNotebookId: get().activeNotebookId,
        activeSectionId:
          get().activeSectionId === id ? null : get().activeSectionId,
        activePageId: get().activePageId,
      });

      set({
        notebooks: snapshot.notebooks,
        sections: snapshot.sections,
        pagesMeta: snapshot.pagesMeta,
        activeNotebookId: selection.activeNotebookId,
        activeSectionId: selection.activeSectionId,
        activePageId: selection.activePageId,
      });

      await loadCurrentPageBody(selection.activePageId);
    },

    selectSection: async (id) => {
      await flushPendingSave();
      const selection = resolveSelection({
        notebooks: get().notebooks,
        sections: get().sections,
        pagesMeta: get().pagesMeta,
        activeNotebookId: get().activeNotebookId,
        activeSectionId: id,
        activePageId: null,
      });

      set(selection);
      await loadCurrentPageBody(selection.activePageId);
    },

    createPage: async (sectionId) => {
      await flushPendingSave();
      const page = await manageNotes.createPage(
        sectionId,
        '새 페이지',
        createEmptyNotePageBody(),
      );
      const snapshot = await manageNotes.getSnapshot();
      set({
        notebooks: snapshot.notebooks,
        sections: snapshot.sections,
        pagesMeta: snapshot.pagesMeta,
        activeNotebookId: get().activeNotebookId,
        activeSectionId: sectionId,
        activePageId: page.id,
        activePageBody: createEmptyNotePageBody(),
        savingState: 'idle',
      });
    },

    renamePage: async (id, title) => {
      const updated = await manageNotes.renamePage(id, title);
      set((state) => ({
        pagesMeta: state.pagesMeta.map((page) =>
          page.id === updated.id ? updated : page,
        ),
      }));
    },

    selectPage: async (id) => {
      await flushPendingSave();
      const page = get().pagesMeta.find((currentPage) => currentPage.id === id);
      const section = get().sections.find(
        (currentSection) => currentSection.id === page?.sectionId,
      );
      const notebookId = section?.notebookId ?? get().activeNotebookId;
      const touched = await manageNotes.touchPage(id);

      set((state) => ({
        activeNotebookId: notebookId,
        activeSectionId: touched.sectionId,
        activePageId: id,
        pagesMeta: state.pagesMeta.map((page) =>
          page.id === touched.id ? touched : page,
        ),
      }));

      await loadCurrentPageBody(id);
    },

    togglePagePin: async (id) => {
      const updated = await manageNotes.togglePagePin(id);
      set((state) => ({
        pagesMeta: state.pagesMeta.map((page) =>
          page.id === updated.id ? updated : page,
        ),
      }));
    },

    deletePage: async (id) => {
      await flushPendingSave();
      await manageNotes.deletePage(id);
      const snapshot = await manageNotes.getSnapshot();
      const selection = resolveSelection({
        notebooks: snapshot.notebooks,
        sections: snapshot.sections,
        pagesMeta: snapshot.pagesMeta,
        activeNotebookId: get().activeNotebookId,
        activeSectionId: get().activeSectionId,
        activePageId: get().activePageId === id ? null : get().activePageId,
      });

      set({
        notebooks: snapshot.notebooks,
        sections: snapshot.sections,
        pagesMeta: snapshot.pagesMeta,
        activeNotebookId: selection.activeNotebookId,
        activeSectionId: selection.activeSectionId,
        activePageId: selection.activePageId,
      });

      await loadCurrentPageBody(selection.activePageId);
    },

    queueBodySave: (pageId, body) => {
      const updatedAt = new Date().toISOString();
      pendingSave = { pageId, body, updatedAt };
      if (saveTimer !== null) {
        clearTimeout(saveTimer);
      }
      if (badgeTimer !== null) {
        clearTimeout(badgeTimer);
        badgeTimer = null;
      }

      set((state) => ({
        activePageBody:
          state.activePageId === pageId ? body : state.activePageBody,
        pagesMeta: state.pagesMeta.map((page) =>
          page.id === pageId ? { ...page, updatedAt } : page,
        ),
        savingState: 'saving',
      }));

      saveTimer = setTimeout(() => {
        void flushPendingSave();
      }, 1000);
    },

    flushPendingSave,
  };
});
