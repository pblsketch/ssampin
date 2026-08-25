import { create } from 'zustand';
import { normalizeSlots } from '@domain/rules/observationSlots';
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
  /** 데스크톱에서 추가한 관찰 슬롯. 모바일은 추가하지 않고 읽기만 한다. */
  customSlots: readonly string[];
  loaded: boolean;

  /**
   * @param force true면 이미 읽었어도 다시 읽는다. **`loaded`를 false로 되돌리지 않는다.**
   */
  load: (force?: boolean) => Promise<void>;
  /**
   * 백그라운드 동기화(앱 복귀·네트워크 복구)가 부르는 조용한 갱신.
   *
   * ⚠️ 여기서 `loaded:false`를 떨어뜨리면 안 된다 — 화면들이 `!loaded`일 때 스피너로
   * 갈아끼우므로, 동기화가 도는 순간 **열려 있던 입력창·시트가 통째로 언마운트**되고
   * 타이핑이 사라진다. 스크롤 위치와 서브탭 선택도 함께 날아간다.
   * 잠금 장치: `scripts/regression-grep-check.mjs` REGRESSION #63
   */
  reload: () => Promise<void>;
  getByStudent: (studentId: string, classId: string) => readonly ObservationRecord[];
  addRecord: (params: {
    studentId: string;
    classId: string;
    date: string;
    content: string;
    tags: string[];
    /** 관찰 슬롯. 빈 배열이면 필드를 넣지 않는다(부재 ≠ 빈 배열). */
    slots?: readonly string[];
  }) => Promise<string>;
  updateRecord: (record: ObservationRecord) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  allTags: () => readonly string[];
}

export const useMobileObservationStore = create<MobileObservationState>((set, get) => ({
  records: [],
  customTags: [],
  customSlots: [],
  loaded: false,

  load: async (force = false) => {
    if (!force && get().loaded) return;
    try {
      const data = await manageObservations.getAll();
      set({
        records: data.records,
        customTags: data.customTags ?? [],
        customSlots: data.customSlots ?? [],
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },

  reload: async () => {
    await get().load(true);
  },

  getByStudent: (studentId, classId) => {
    return get()
      .records.filter((r) => r.studentId === studentId && r.classId === classId)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date));
  },

  addRecord: async ({ studentId, classId, date, content, tags, slots }) => {
    const now = Date.now();
    // ★정규화를 먼저 한다 — 걸러진 결과가 비면 칸 자체를 만들지 않는다(데스크톱과 동일 규칙).
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
      ...(normalizedSlots.length > 0 ? { slots: normalizedSlots } : {}),
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
