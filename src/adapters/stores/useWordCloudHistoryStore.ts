import { create } from 'zustand';
import type { WordCloudSession, WordCloudHistoryData } from '@domain/entities/WordCloudSession';
import { wordCloudRepository } from '@adapters/di/container';

const MAX_SESSIONS = 50;

interface WordCloudHistoryState {
  sessions: readonly WordCloudSession[];
  loaded: boolean;
  load: () => Promise<void>;
  addSession: (session: WordCloudSession) => Promise<void>;
  updateSession: (session: WordCloudSession) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
}

export const useWordCloudHistoryStore = create<WordCloudHistoryState>((set, get) => {
  const persist = async (sessions: readonly WordCloudSession[]) => {
    const data: WordCloudHistoryData = { sessions };
    await wordCloudRepository.save(data);
  };

  return {
    sessions: [],
    loaded: false,

    load: async () => {
      if (get().loaded) return;
      const data = await wordCloudRepository.load();
      set({ sessions: data?.sessions ?? [], loaded: true });
    },

    addSession: async (session) => {
      const sessions = [session, ...get().sessions].slice(0, MAX_SESSIONS);
      set({ sessions });
      await persist(sessions);
    },

    updateSession: async (session) => {
      const sessions = get().sessions.map((s) =>
        s.id === session.id ? session : s,
      );
      set({ sessions });
      await persist(sessions);
    },

    deleteSession: async (id) => {
      const sessions = get().sessions.filter((s) => s.id !== id);
      set({ sessions });
      await persist(sessions);
    },
  };
});
