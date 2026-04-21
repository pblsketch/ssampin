import { create } from 'zustand';
import type { FormTemplate, FormFormat } from '@domain/entities/FormTemplate';
import type { FormCategory } from '@domain/entities/FormCategory';
import type { FormFilterOptions, FormSort } from '@domain/rules/formTemplateRules';
import {
  formRepository,
  formThumbnailer,
  formPreviewExtractor,
  formPrinter,
} from '@adapters/di/container';
import { createForm, type CreateFormInput } from '@usecases/forms/CreateForm';
import { updateForm, type UpdateFormPatch } from '@usecases/forms/UpdateForm';
import { deleteForm } from '@usecases/forms/DeleteForm';
import { printForm } from '@usecases/forms/PrintForm';
import { generateUUID } from '@infrastructure/utils/uuid';

interface FormStoreState {
  readonly forms: readonly FormTemplate[];
  readonly categories: readonly FormCategory[];
  readonly loaded: boolean;
  readonly filter: FormFilterOptions;
  readonly sort: FormSort;
  readonly selectedId: string | null;
  readonly uploadModalOpen: boolean;

  loadAll: () => Promise<void>;
  createFormAction: (input: CreateFormInput) => Promise<void>;
  updateFormAction: (id: string, patch: UpdateFormPatch) => Promise<void>;
  removeForm: (id: string) => Promise<void>;
  toggleStar: (id: string) => Promise<void>;
  printFormAction: (id: string) => Promise<FormFormat>;
  downloadForm: (id: string) => Promise<void>;
  upsertCategory: (c: FormCategory) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;

  setFilter: (f: Partial<FormFilterOptions>) => void;
  setSort: (s: FormSort) => void;
  select: (id: string | null) => void;
  openUpload: () => void;
  closeUpload: () => void;
}

export const useFormStore = create<FormStoreState>((set, get) => ({
  forms: [],
  categories: [],
  loaded: false,
  filter: {},
  sort: 'recent',
  selectedId: null,
  uploadModalOpen: false,

  loadAll: async () => {
    const [forms, categories] = await Promise.all([
      formRepository.list(),
      formRepository.listCategories(),
    ]);
    set({ forms, categories, loaded: true });
  },

  createFormAction: async (input) => {
    const template = await createForm(input, {
      repo: formRepository,
      thumbnailer: formThumbnailer,
      previewExtractor: formPreviewExtractor,
      idGen: generateUUID,
      now: () => new Date(),
    });
    set((s) => ({ forms: [...s.forms, template] }));
  },

  updateFormAction: async (id, patch) => {
    await updateForm(id, patch, formRepository);
    set((s) => ({
      forms: s.forms.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    }));
  },

  removeForm: async (id) => {
    await deleteForm(id, formRepository);
    set((s) => ({
      forms: s.forms.filter((f) => f.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }));
  },

  toggleStar: async (id) => {
    const current = get().forms.find((f) => f.id === id);
    if (!current) return;
    await get().updateFormAction(id, { starred: !current.starred });
  },

  printFormAction: async (id) => {
    const form = get().forms.find((f) => f.id === id);
    if (!form) throw new Error('서식을 찾을 수 없습니다');
    await printForm(id, formRepository, formPrinter);
    return form.format;
  },

  downloadForm: async (id) => {
    const form = get().forms.find((f) => f.id === id);
    if (!form) throw new Error('서식을 찾을 수 없습니다');
    const bytes = await formRepository.readFile(id);
    const mime =
      form.format === 'pdf'
        ? 'application/pdf'
        : form.format === 'excel'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/octet-stream';
    const ext = form.format === 'excel' ? 'xlsx' : form.format;
    const blob = new Blob([bytes as BlobPart], { type: mime });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = `${form.name}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  },

  upsertCategory: async (c) => {
    await formRepository.upsertCategory(c);
    const categories = await formRepository.listCategories();
    set({ categories });
  },

  deleteCategory: async (id) => {
    await formRepository.deleteCategory(id);
    const categories = await formRepository.listCategories();
    set({ categories });
  },

  setFilter: (f) => set((s) => ({ filter: { ...s.filter, ...f } })),
  setSort: (sort) => set({ sort }),
  select: (selectedId) => set({ selectedId }),
  openUpload: () => set({ uploadModalOpen: true }),
  closeUpload: () => set({ uploadModalOpen: false }),
}));
