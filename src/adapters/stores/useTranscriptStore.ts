import { create } from 'zustand';
import type { StudentTranscript } from '@domain/entities/ImportedTranscript';
import { manageImportedTranscript } from '@adapters/di/container';

interface TranscriptState {
  students: readonly StudentTranscript[];
  loaded: boolean;

  load: () => Promise<void>;
  /** NEIS 파일 등에서 여러 학생 일괄 반영(studentKey 병합). */
  importStudents: (students: readonly StudentTranscript[]) => Promise<void>;
  removeStudent: (studentKey: string) => Promise<void>;
  clearAll: () => Promise<void>;
}

export const useTranscriptStore = create<TranscriptState>((set, get) => ({
  students: [],
  loaded: false,

  load: async () => {
    const data = await manageImportedTranscript.load();
    set({ students: data.students, loaded: true });
  },

  importStudents: async (students) => {
    const next = await manageImportedTranscript.upsertMany({ students: get().students }, students);
    set({ students: next.students });
  },

  removeStudent: async (studentKey) => {
    const next = await manageImportedTranscript.removeStudent(
      { students: get().students },
      studentKey,
    );
    set({ students: next.students });
  },

  clearAll: async () => {
    const next = await manageImportedTranscript.clear();
    set({ students: next.students });
  },
}));
