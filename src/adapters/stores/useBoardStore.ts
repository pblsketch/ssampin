/**
 * useBoardStore — 협업 보드 목록 상태 (Design §5.4)
 *
 * window.electronAPI.collabBoard.* IPC를 통해 Electron main의
 * FileBoardRepository와 통신. Electron이 아닌 브라우저 개발 모드에서는
 * 빈 목록 + 생성/삭제 no-op (기능 비활성).
 */
import { create } from 'zustand';

interface BoardMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  lastSessionEndedAt: number | null;
  participantHistory: string[];
  hasSnapshot: boolean;
}

interface BoardStoreState {
  boards: BoardMeta[];
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  create: (name?: string) => Promise<BoardMeta | null>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

function getApi(): NonNullable<Window['electronAPI']>['collabBoard'] | null {
  return window.electronAPI?.collabBoard ?? null;
}

export const useBoardStore = create<BoardStoreState>((set, get) => ({
  boards: [],
  loading: false,
  error: null,

  async load() {
    const api = getApi();
    if (!api) {
      set({ boards: [], error: '협업 보드는 데스크톱 앱에서만 사용할 수 있습니다.' });
      return;
    }
    set({ loading: true, error: null });
    try {
      const boards = await api.list();
      set({ boards, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  async create(name) {
    const api = getApi();
    if (!api) return null;
    try {
      const board = await api.create({ name });
      // 목록에 삽입 (최신순)
      set({ boards: [board, ...get().boards], error: null });
      return board;
    } catch (err) {
      set({ error: String(err) });
      return null;
    }
  },

  async rename(id, name) {
    const api = getApi();
    if (!api) return;
    try {
      const updated = await api.rename({ id, name });
      set({
        boards: get().boards.map((b) => (b.id === id ? updated : b)),
        error: null,
      });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  async remove(id) {
    const api = getApi();
    if (!api) return;
    try {
      await api.delete({ id });
      set({
        boards: get().boards.filter((b) => b.id !== id),
        error: null,
      });
    } catch (err) {
      set({ error: String(err) });
    }
  },
}));
