import { create } from 'zustand';
import type { ObservationRecord } from '@domain/entities/Observation';
import { DEFAULT_OBSERVATION_TAGS } from '@domain/entities/Observation';
import { observationRepository } from '@adapters/di/container';
import { ManageObservations } from '@usecases/classManagement/ManageObservations';
import { generateUUID } from '@infrastructure/utils/uuid';
import { normalizeSlots } from '@domain/rules/observationSlots';
import { trackEventSafely } from '@adapters/analytics/trackEventSafely';
import { useObservationAttachmentStore } from './useObservationAttachmentStore';

interface ObservationState {
  records: readonly ObservationRecord[];
  customTags: readonly string[];
  customCategories: readonly string[];
  /** 교사가 직접 추가한 관찰 슬롯(기본 6종 외). `customTags` 와 같은 방식. */
  customSlots: readonly string[];
  loaded: boolean;

  load: (force?: boolean) => Promise<void>;
  addRecord: (params: {
    studentId: string;
    classId: string;
    date: string;
    content: string;
    tags: string[];
    /** 통합 입력 분류 (S4) — ObservationRecord.category? 에 저장. tags 와 별도(P3). */
    category?: string;
    /**
     * 관찰 슬롯("어떤 장면인가"). tags·category 와 모두 직교한다.
     * 빈 배열이면 필드를 아예 넣지 않는다 — 구 데이터와 같은 모양(부재)으로 남긴다.
     */
    slots?: readonly string[];
    /** 속한 탐구 흐름(InquiryThread.id). 보조 경로(입력 시 제안)용 — 없으면 낱장 그대로. */
    threadId?: string;
  }) => Promise<string>;
  updateRecord: (record: ObservationRecord) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  deleteByClassId: (classId: string) => Promise<void>;
  addCustomTag: (tag: string) => Promise<void>;
  removeCustomTag: (tag: string) => Promise<void>;
  addCustomCategory: (category: string) => Promise<void>;
  addCustomSlot: (slot: string) => Promise<void>;

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
    customSlots: [],
    loaded: false,

    load: async (force = false) => {
      // force=true: 동기화 리로드용 — loaded를 유지한 채 데이터만 조용히 갱신
      if (get().loaded && !force) return;
      try {
        const data = await manage.getAll();
        set({
          records: data.records,
          customTags: data.customTags ?? [],
          customCategories: data.customCategories ?? [],
          customSlots: data.customSlots ?? [],
          loaded: true,
        });
      } catch (err) {
        console.error('[ObservationStore] load failed:', err);
        set({ loaded: true });
      }
    },

    addRecord: async ({ studentId, classId, date, content, tags, category, slots, threadId }) => {
      const now = Date.now();
      // ★정규화를 **먼저** 한다. 길이만 보고 넣으면 맥락에 없는 값만 들어온 경우
      //   빈 배열이 저장돼 "부재 ≠ 빈 배열" 불변식이 깨진다(병합에서 남의 슬롯을 덮는다).
      const normalizedSlots = slots ? normalizeSlots(slots, 'teaching', get().customSlots) : [];
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
        // ★빈 배열이면 넣지 않는다. 부재 ≠ 빈 배열 — 병합에서 다른 기기의 슬롯을 덮지 않게.
        ...(normalizedSlots.length > 0 ? { slots: normalizedSlots } : {}),
        ...(threadId !== undefined ? { threadId } : {}),
      };
      // ★저장이 성공한 **뒤에** 게시한다. 먼저 게시하면 저장이 실패해도 화면에는 남고,
      //   다음 통째 저장이 그 유령을 파일에 굳힌다(계획 §5.1-1).
      await manage.add(record);
      set((s) => ({ records: [...s.records, record] }));
      trackEventSafely('record_observation_save', {
        context: 'teaching',
        slotCount: normalizedSlots.length,
        hasThread: threadId !== undefined,
      });
      return record.id;
    },

    updateRecord: async (record) => {
      const updated: ObservationRecord = { ...record, updatedAt: Date.now() };
      await manage.update(updated);
      set((s) => ({ records: s.records.map((r) => (r.id === updated.id ? updated : r)) }));
    },

    deleteRecord: async (id) => {
      await manage.delete(id);
      set((s) => ({ records: s.records.filter((r) => r.id !== id) }));
      // 기록에 연결된 첨부(메타+바이너리)도 함께 정리(고아 방지)
      await useObservationAttachmentStore.getState().deleteByObservationId(id);
    },

    deleteByClassId: async (classId) => {
      const removedIds = get()
        .records.filter((r) => r.classId === classId)
        .map((r) => r.id);
      await manage.deleteByClassId(classId);
      set((s) => ({ records: s.records.filter((r) => r.classId !== classId) }));
      const attStore = useObservationAttachmentStore.getState();
      for (const rid of removedIds) {
        await attStore.deleteByObservationId(rid);
      }
    },

    // 커스텀 태그·분류는 변경 의도만 넘긴다 — 합집합/제거는 락 안 fresh 목록에서
    // 수행되고(P6), 화면 상태는 저장 결과(반환값)로 갱신한다. in-memory 목록을
    // 통째로 실어 보내면 동기화가 방금 병합한 항목을 낡은 스냅샷이 덮는다(2026-07 QA).

    addCustomTag: async (tag) => {
      const saved = await manage.addCustomTag(tag);
      set({ customTags: [...saved] });
    },

    removeCustomTag: async (tag) => {
      const saved = await manage.removeCustomTag(tag);
      set({ customTags: [...saved] });
    },

    addCustomCategory: async (category) => {
      const saved = await manage.addCustomCategory(category);
      set({ customCategories: [...saved] });
    },

    addCustomSlot: async (slot) => {
      const saved = await manage.addCustomSlot(slot);
      set({ customSlots: [...saved] });
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
