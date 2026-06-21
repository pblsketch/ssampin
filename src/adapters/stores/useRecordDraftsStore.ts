import { create } from 'zustand';
import {
  neisByteLength,
  type RecordArea,
  type RecordDraft,
  type RecordDraftStatus,
} from '@domain/entities/RecordDraft';
import { recordDraftsRepository } from '@adapters/di/container';
import { generateUUID } from '@infrastructure/utils/uuid';

/** (area + studentRef + subject) upsert 입력 — UI 직접 편집 / live-sync 수신 공통. */
export interface RecordDraftUpsertInput {
  area: RecordArea;
  /** 학생 신원 키(담임=Student.id / 수업반='tc:{classId}:{studentKey}'). */
  studentRef: string;
  classId?: string;
  studentKey?: string;
  studentId?: string;
  subject?: string;
  content: string;
  basisObservationIds?: readonly string[];
  groundingFlags?: readonly string[];
  status?: RecordDraftStatus;
}

interface RecordDraftsState {
  records: readonly RecordDraft[];
  loaded: boolean;

  load: () => Promise<void>;
  /** (area+studentRef+subject) 키로 upsert. 반환 = 저장된 draft id. */
  upsert: (input: RecordDraftUpsertInput) => Promise<string>;
  setStatus: (id: string, status: RecordDraftStatus) => Promise<void>;
  remove: (id: string) => Promise<void>;
  exists: (id: string) => boolean;

  // 파생 조회
  getByStudentRef: (studentRef: string) => readonly RecordDraft[];
  getDraft: (area: RecordArea, studentRef: string, subject?: string) => RecordDraft | undefined;
}

const subjectKey = (s?: string): string => s ?? '';

function matchKey(r: RecordDraft, area: RecordArea, studentRef: string, subject?: string): boolean {
  return (
    r.area === area && r.studentRef === studentRef && subjectKey(r.subject) === subjectKey(subject)
  );
}

export const useRecordDraftsStore = create<RecordDraftsState>((set, get) => {
  /** 변경된 records 를 메모리 반영 후 파일에 통째로 저장(repo whole-file API). */
  const persist = async (next: readonly RecordDraft[]): Promise<void> => {
    set({ records: next });
    await recordDraftsRepository.saveRecordDrafts({ records: next });
  };

  return {
    records: [],
    loaded: false,

    load: async () => {
      if (get().loaded) return;
      try {
        const data = await recordDraftsRepository.getRecordDrafts();
        set({ records: data?.records ?? [], loaded: true });
      } catch (err) {
        console.error('[RecordDraftsStore] load failed:', err);
        set({ loaded: true });
      }
    },

    upsert: async (input) => {
      // 통째로 저장하는 구조라 메모리가 파일을 반영해야 한다(미로드 상태에서 저장 시 기존 초안 유실 방지).
      await get().load();
      const now = Date.now();
      const byteLength = neisByteLength(input.content);
      const existing = get().records.find((r) =>
        matchKey(r, input.area, input.studentRef, input.subject),
      );
      const base: RecordDraft = {
        id: existing?.id ?? generateUUID(),
        area: input.area,
        studentRef: input.studentRef,
        content: input.content,
        byteLength,
        basisObservationIds: input.basisObservationIds ? [...input.basisObservationIds] : [],
        requiresTeacherReview: true,
        status: input.status ?? existing?.status ?? 'draft',
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        ...(input.classId !== undefined ? { classId: input.classId } : {}),
        ...(input.studentKey !== undefined ? { studentKey: input.studentKey } : {}),
        ...(input.studentId !== undefined ? { studentId: input.studentId } : {}),
        ...(input.subject !== undefined ? { subject: input.subject } : {}),
        ...(input.groundingFlags !== undefined
          ? { groundingFlags: [...input.groundingFlags] }
          : {}),
      };
      const next = existing
        ? get().records.map((r) => (r.id === existing.id ? base : r))
        : [...get().records, base];
      await persist(next);
      return base.id;
    },

    setStatus: async (id, status) => {
      await get().load();
      const next = get().records.map((r) =>
        r.id === id ? { ...r, status, updatedAt: Date.now() } : r,
      );
      await persist(next);
    },

    remove: async (id) => {
      await get().load();
      await persist(get().records.filter((r) => r.id !== id));
    },

    exists: (id) => get().records.some((r) => r.id === id),

    getByStudentRef: (studentRef) => get().records.filter((r) => r.studentRef === studentRef),

    getDraft: (area, studentRef, subject) =>
      get().records.find((r) => matchKey(r, area, studentRef, subject)),
  };
});
