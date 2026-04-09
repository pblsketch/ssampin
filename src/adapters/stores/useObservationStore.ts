import { create } from 'zustand';
import type { ObservationRecord } from '@domain/entities/Observation';
import { DEFAULT_OBSERVATION_TAGS } from '@domain/entities/Observation';
import { observationRepository } from '@adapters/di/container';
import { ManageObservations } from '@usecases/classManagement/ManageObservations';
import { generateUUID } from '@infrastructure/utils/uuid';

interface ObservationState {
  records: readonly ObservationRecord[];
  customTags: readonly string[];
  loaded: boolean;

  load: () => Promise<void>;
  addRecord: (params: {
    studentId: string;
    classId: string;
    date: string;
    content: string;
    tags: string[];
  }) => Promise<void>;
  updateRecord: (record: ObservationRecord) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  deleteByClassId: (classId: string) => Promise<void>;
  addCustomTag: (tag: string) => Promise<void>;
  removeCustomTag: (tag: string) => Promise<void>;

  // 파생 조회
  getByStudent: (studentId: string, classId: string) => readonly ObservationRecord[];
  getLastRecordDate: (studentId: string, classId: string) => string | null;
  allTags: () => readonly string[];
}

export const useObservationStore = create<ObservationState>((set, get) => {
  const manage = new ManageObservations(observationRepository);

  return {
    records: [],
    customTags: [],
    loaded: false,

    load: async () => {
      if (get().loaded) return;
      try {
        const data = await manage.getAll();
        set({ records: data.records, customTags: data.customTags ?? [], loaded: true });
      } catch (err) {
        console.error('[ObservationStore] load failed:', err);
        set({ loaded: true });
      }
    },

    addRecord: async ({ studentId, classId, date, content, tags }) => {
      const now = Date.now();
      const record: ObservationRecord = {
        id: generateUUID(),
        studentId,
        classId,
        authorId: 'default',
        date,
        content,
        tags,
        visibility: 'private',
        createdAt: now,
        updatedAt: now,
      };
      set((s) => ({ records: [...s.records, record] }));
      await manage.add(record);
    },

    updateRecord: async (record) => {
      const updated: ObservationRecord = { ...record, updatedAt: Date.now() };
      set((s) => ({ records: s.records.map((r) => (r.id === updated.id ? updated : r)) }));
      await manage.update(updated);
    },

    deleteRecord: async (id) => {
      set((s) => ({ records: s.records.filter((r) => r.id !== id) }));
      await manage.delete(id);
    },

    deleteByClassId: async (classId) => {
      set((s) => ({ records: s.records.filter((r) => r.classId !== classId) }));
      await manage.deleteByClassId(classId);
    },

    addCustomTag: async (tag) => {
      const trimmed = tag.trim();
      if (!trimmed) return;
      const current = get().customTags;
      if (current.includes(trimmed)) return;
      const updated = [...current, trimmed];
      set({ customTags: updated });
      await manage.saveCustomTags(updated);
    },

    removeCustomTag: async (tag) => {
      const updated = get().customTags.filter((t) => t !== tag);
      set({ customTags: updated });
      await manage.saveCustomTags(updated);
    },

    getByStudent: (studentId, classId) => {
      return get().records
        .filter((r) => r.studentId === studentId && r.classId === classId)
        .sort((a, b) => b.date.localeCompare(a.date));
    },

    getLastRecordDate: (studentId, classId) => {
      const studentRecords = get().records.filter(
        (r) => r.studentId === studentId && r.classId === classId,
      );
      if (studentRecords.length === 0) return null;
      return studentRecords.reduce((latest, r) =>
        r.date > latest ? r.date : latest, studentRecords[0]!.date,
      );
    },

    allTags: () => {
      return [...DEFAULT_OBSERVATION_TAGS, ...get().customTags];
    },
  };
});
