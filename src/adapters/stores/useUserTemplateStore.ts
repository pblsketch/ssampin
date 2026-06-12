/**
 * useUserTemplateStore — "내 템플릿" 목록 상태 (PDCA-4 / G006)
 *
 * window.electronAPI.collabBoard.userTemplate* IPC 로 main 의
 * FileUserTemplateRepo 와 통신. 브라우저 개발 모드에서는 빈 목록 no-op.
 */
import { create } from 'zustand';

interface UserTemplateMeta {
  id: string;
  name: string;
  createdAt: number;
  versionSchema: string;
  elementCount: number;
}

interface UserTemplateStoreState {
  templates: UserTemplateMeta[];
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  /** 보드의 현재 내용을 내 템플릿으로 저장. 성공 시 저장된 메타 반환 */
  saveFromBoard: (boardId: string, name?: string) => Promise<UserTemplateMeta | null>;
  remove: (id: string) => Promise<void>;
}

function getApi(): NonNullable<Window['electronAPI']>['collabBoard'] | null {
  return window.electronAPI?.collabBoard ?? null;
}

export const useUserTemplateStore = create<UserTemplateStoreState>((set, get) => ({
  templates: [],
  loading: false,
  error: null,

  async load() {
    const api = getApi();
    if (!api) {
      set({ templates: [] });
      return;
    }
    set({ loading: true, error: null });
    try {
      const templates = await api.userTemplateList();
      set({ templates, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  async saveFromBoard(boardId, name) {
    const api = getApi();
    if (!api) return null;
    try {
      const saved = await api.userTemplateSave({ id: boardId, name });
      set({ templates: [saved, ...get().templates], error: null });
      return saved;
    } catch (err) {
      set({ error: String(err) });
      return null;
    }
  },

  async remove(id) {
    const api = getApi();
    if (!api) return;
    try {
      await api.userTemplateDelete({ id });
      set({ templates: get().templates.filter((t) => t.id !== id), error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },
}));
