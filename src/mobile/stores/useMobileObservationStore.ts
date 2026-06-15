import { create } from 'zustand';
import { generateUUID } from '@infrastructure/utils/uuid';
import type { ObservationRecord } from '@domain/entities/Observation';
import { DEFAULT_OBSERVATION_TAGS } from '@domain/entities/Observation';
import { ManageObservations } from '@usecases/classManagement/ManageObservations';
import { observationRepository } from '@mobile/di/container';
import { useMobileDriveSyncStore } from '@mobile/stores/useMobileDriveSyncStore';

const manageObservations = new ManageObservations(observationRepository);

interface MobileObservationState {
  records: readonly ObservationRecord[];
  customTags: readonly string[];
  loaded: boolean;

  load: () => Promise<void>;
  reload: () => Promise<void>;
  getByStudent: (studentId: string, classId: string) => readonly ObservationRecord[];
  addRecord: (params: {
    studentId: string;
    classId: string;
    date: string;
    content: string;
    tags: string[];
  }) => Promise<string>;
  updateRecord: (record: ObservationRecord) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  allTags: () => readonly string[];
}

export const useMobileObservationStore = create<MobileObservationState>((set, get) => ({
  records: [],
  customTags: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    try {
      const data = await manageObservations.getAll();
      set({ records: data.records, customTags: data.customTags ?? [], loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  reload: async () => {
    set({ loaded: false });
    await get().load();
  },

  getByStudent: (studentId, classId) => {
    return get()
      .records.filter((r) => r.studentId === studentId && r.classId === classId)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));
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
    await manageObservations.add(record);
    set((s) => ({ records: [...s.records, record] }));
    useMobileDriveSyncStore.getState().triggerSaveSync();
    return record.id;
  },

  updateRecord: async (record) => {
    const updated: ObservationRecord = { ...record, updatedAt: Date.now() };
    await manageObservations.update(updated);
    set((s) => ({
      records: s.records.map((r) => (r.id === updated.id ? updated : r)),
    }));
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },

  deleteRecord: async (id) => {
    await manageObservations.delete(id);
    set((s) => ({
      records: s.records.filter((r) => r.id !== id),
    }));
    useMobileDriveSyncStore.getState().triggerSaveSync();
  },

  allTags: () => {
    return [...DEFAULT_OBSERVATION_TAGS, ...get().customTags];
  },
}));
