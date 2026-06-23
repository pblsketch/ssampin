import { create } from 'zustand';
import type { ObservationRecord } from '@domain/entities/Observation';
import { DEFAULT_OBSERVATION_TAGS } from '@domain/entities/Observation';
import { observationRepository } from '@adapters/di/container';
import { ManageObservations } from '@usecases/classManagement/ManageObservations';
import { generateUUID } from '@infrastructure/utils/uuid';
import { useObservationAttachmentStore } from './useObservationAttachmentStore';

interface ObservationState {
  records: readonly ObservationRecord[];
  customTags: readonly string[];
  customCategories: readonly string[];
  loaded: boolean;

  load: () => Promise<void>;
  addRecord: (params: {
    studentId: string;
    classId: string;
    date: string;
    content: string;
    tags: string[];
    /** 통합 입력 분류 (S4) — ObservationRecord.category? 에 저장. tags 와 별도(P3). */
    category?: string;
  }) => Promise<string>;
  updateRecord: (record: ObservationRecord) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  deleteByClassId: (classId: string) => Promise<void>;
  addCustomTag: (tag: string) => Promise<void>;
  removeCustomTag: (tag: string) => Promise<void>;
  addCustomCategory: (category: string) => Promise<void>;

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
    customCategories: [],
    loaded: false,

    load: async () => {
      if (get().loaded) return;
      try {
        const data = await manage.getAll();
        set({
          records: data.records,
          customTags: data.customTags ?? [],
          customCategories: data.customCategories ?? [],
          loaded: true,
        });
      } catch (err) {
        console.error('[ObservationStore] load failed:', err);
        set({ loaded: true });
      }
    },

    addRecord: async ({ studentId, classId, date, content, tags, category }) => {
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
        // 분류는 tags 에 섞지 않고 별도 필드로 보존(P3). 미지정이면 생략(additive).
        ...(category ? { category } : {}),
      };
      set((s) => ({ records: [...s.records, record] }));
      await manage.add(record);
      return record.id;
    },

    updateRecord: async (record) => {
      const updated: ObservationRecord = { ...record, updatedAt: Date.now() };
      set((s) => ({ records: s.records.map((r) => (r.id === updated.id ? updated : r)) }));
      await manage.update(updated);
    },

    deleteRecord: async (id) => {
      set((s) => ({ records: s.records.filter((r) => r.id !== id) }));
      await manage.delete(id);
      // 기록에 연결된 첨부(메타+바이너리)도 함께 정리(고아 방지)
      await useObservationAttachmentStore.getState().deleteByObservationId(id);
    },

    deleteByClassId: async (classId) => {
      const removedIds = get()
        .records.filter((r) => r.classId === classId)
        .map((r) => r.id);
      set((s) => ({ records: s.records.filter((r) => r.classId !== classId) }));
      await manage.deleteByClassId(classId);
      const attStore = useObservationAttachmentStore.getState();
      for (const rid of removedIds) {
        await attStore.deleteByObservationId(rid);
      }
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

    addCustomCategory: async (category) => {
      const trimmed = category.trim();
      if (!trimmed) return;
      const current = get().customCategories;
      if (current.includes(trimmed)) return;
      const updated = [...current, trimmed];
      set({ customCategories: updated });
      await manage.saveCustomCategories(updated);
    },

    getByStudent: (studentId, classId) => {
      return get()
        .records.filter((r) => r.studentId === studentId && r.classId === classId)
        .sort((a, b) => b.date.localeCompare(a.date));
    },

    getLastRecordDate: (studentId, classId) => {
      const studentRecords = get().records.filter(
        (r) => r.studentId === studentId && r.classId === classId,
      );
      if (studentRecords.length === 0) return null;
      return studentRecords.reduce(
        (latest, r) => (r.date > latest ? r.date : latest),
        studentRecords[0]!.date,
      );
    },

    allTags: () => {
      return [...DEFAULT_OBSERVATION_TAGS, ...get().customTags];
    },
  };
});
