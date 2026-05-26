import { create } from 'zustand';
import type {
  ClassroomAgreementSaveMode,
  ClassroomAgreementSavedSession,
  ClassroomAgreementSession,
} from '@domain/entities/ClassroomAgreement';
import { classroomAgreementRepository } from '@adapters/di/container';

interface ClassroomAgreementStoreState {
  readonly savedSessions: readonly ClassroomAgreementSavedSession[];
  readonly loaded: boolean;
  readonly isSaving: boolean;
  readonly load: () => Promise<void>;
  readonly saveSession: (
    session: ClassroomAgreementSession,
    saveMode?: ClassroomAgreementSaveMode,
  ) => Promise<ClassroomAgreementSavedSession>;
  readonly deleteSession: (id: string) => Promise<void>;
}

export const useClassroomAgreementStore = create<ClassroomAgreementStoreState>((set, get) => ({
  savedSessions: [],
  loaded: false,
  isSaving: false,

  load: async () => {
    if (get().loaded) return;
    const savedSessions = await classroomAgreementRepository.list();
    set({ savedSessions, loaded: true });
  },

  saveSession: async (session, saveMode) => {
    set({ isSaving: true });
    try {
      const saved = await classroomAgreementRepository.saveSession(session, { saveMode });
      set({
        savedSessions: [saved, ...get().savedSessions.filter((item) => item.id !== saved.id)],
        loaded: true,
      });
      return saved;
    } finally {
      set({ isSaving: false });
    }
  },

  deleteSession: async (id) => {
    await classroomAgreementRepository.delete(id);
    set({
      savedSessions: get().savedSessions.filter((item) => item.id !== id),
      loaded: true,
    });
  },
}));
