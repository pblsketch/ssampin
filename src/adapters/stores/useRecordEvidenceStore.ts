import { create } from 'zustand';
import type { RecordArea } from '@domain/entities/RecordDraft';
import {
  normalizeEvidenceAreas,
  type EvidenceSourceType,
  type RecordEvidence,
} from '@domain/entities/RecordEvidence';
import { hasProhibitedTerms } from '@domain/rules/prohibitedRecordTerms';
import { recordEvidenceRepository } from '@adapters/di/container';
import { generateUUID } from '@infrastructure/utils/uuid';

/** 근거 자료 추가 입력(직접 입력 / 기존 데이터 끌어오기 공통). id·시각은 스토어가 채운다. */
export interface RecordEvidenceAddInput {
  studentRef: string;
  areas: readonly RecordArea[];
  content: string;
  date?: string;
  sourceType?: EvidenceSourceType;
  sourceId?: string;
  classId?: string;
  /** 원본 기록에서 이어받은 관찰 슬롯. 비면 필드를 만들지 않는다(부재 != 빈 배열). */
  slots?: readonly string[];
}

/** 근거 자료 부분 수정 입력. id 로 대상 지정. */
export interface RecordEvidencePatch {
  areas?: readonly RecordArea[];
  content?: string;
  date?: string;
}

interface RecordEvidenceState {
  records: readonly RecordEvidence[];
  loaded: boolean;

  load: () => Promise<void>;
  /** 근거 추가. 반환 = 생성된 근거 id. */
  add: (input: RecordEvidenceAddInput) => Promise<string>;
  /** 여러 근거를 한 번의 저장으로 일괄 추가(학급 전체 끌어오기용). 반환 = 추가된 건수. */
  addMany: (inputs: readonly RecordEvidenceAddInput[]) => Promise<number>;
  update: (id: string, patch: RecordEvidencePatch) => Promise<void>;
  /**
   * AI 전송 제외 여부를 교사가 직접 켜고 끈다(자동 판정의 오탐을 되돌리는 길).
   * 자동 표시와 달리 이쪽이 최종 판단이다.
   */
  setExcludedFromAi: (id: string, excluded: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
  exists: (id: string) => boolean;

  // 파생 조회
  getByStudentRef: (studentRef: string) => readonly RecordEvidence[];
  /** 특정 학생의 특정 영역 근거(해당 area 를 포함하는 근거). */
  getByArea: (studentRef: string, area: RecordArea) => readonly RecordEvidence[];
}

export const useRecordEvidenceStore = create<RecordEvidenceState>((set, get) => {
  /** 변경된 records 를 메모리 반영 후 파일에 통째로 저장(repo whole-file API). */
  const persist = async (next: readonly RecordEvidence[]): Promise<void> => {
    set({ records: next });
    await recordEvidenceRepository.saveRecordEvidence({ records: next });
  };

  return {
    records: [],
    loaded: false,

    load: async () => {
      if (get().loaded) return;
      try {
        const data = await recordEvidenceRepository.getRecordEvidence();
        set({ records: data?.records ?? [], loaded: true });
      } catch (err) {
        console.error('[RecordEvidenceStore] load failed:', err);
        set({ loaded: true });
      }
    },

    add: async (input) => {
      // 통째로 저장하는 구조라 메모리가 파일을 반영해야 한다(미로드 상태 저장 시 기존 근거 유실 방지).
      await get().load();
      const now = Date.now();
      const rec: RecordEvidence = {
        id: generateUUID(),
        studentRef: input.studentRef,
        areas: normalizeEvidenceAreas(input.areas),
        content: input.content,
        createdAt: now,
        updatedAt: now,
        ...(input.date !== undefined ? { date: input.date } : {}),
        ...(input.sourceType !== undefined ? { sourceType: input.sourceType } : {}),
        ...(input.sourceId !== undefined ? { sourceId: input.sourceId } : {}),
        ...(input.classId !== undefined ? { classId: input.classId } : {}),
        ...(input.slots && input.slots.length > 0 ? { slots: [...input.slots] } : {}),
        // 기재 금지 항목이 섞였으면 저장 시점에 표시한다 — 모델까지 가지 않게(ADR-072 결정 5).
        ...(hasProhibitedTerms(input.content) ? { excludedFromAi: true } : {}),
      };
      await persist([...get().records, rec]);
      return rec.id;
    },

    addMany: async (inputs) => {
      if (inputs.length === 0) return 0;
      await get().load();
      const now = Date.now();
      const recs: RecordEvidence[] = inputs.map((input) => ({
        id: generateUUID(),
        studentRef: input.studentRef,
        areas: normalizeEvidenceAreas(input.areas),
        content: input.content,
        createdAt: now,
        updatedAt: now,
        ...(input.date !== undefined ? { date: input.date } : {}),
        ...(input.sourceType !== undefined ? { sourceType: input.sourceType } : {}),
        ...(input.sourceId !== undefined ? { sourceId: input.sourceId } : {}),
        ...(input.classId !== undefined ? { classId: input.classId } : {}),
        ...(input.slots && input.slots.length > 0 ? { slots: [...input.slots] } : {}),
        ...(hasProhibitedTerms(input.content) ? { excludedFromAi: true } : {}),
      }));
      await persist([...get().records, ...recs]);
      return recs.length;
    },

    update: async (id, patch) => {
      await get().load();
      const now = Date.now();
      const next = get().records.map((r) =>
        r.id === id
          ? {
              ...r,
              ...(patch.areas !== undefined ? { areas: normalizeEvidenceAreas(patch.areas) } : {}),
              ...(patch.content !== undefined ? { content: patch.content } : {}),
              // 내용이 바뀌면 다시 본다. 단 **붙이기만** 한다 — 교사가 푼 것을 자동으로
              // 되돌리면 판단을 빼앗는 셈이고, 안전한 방향은 '더 거르는' 쪽이다.
              ...(patch.content !== undefined && hasProhibitedTerms(patch.content)
                ? { excludedFromAi: true }
                : {}),
              ...(patch.date !== undefined ? { date: patch.date } : {}),
              updatedAt: now,
            }
          : r,
      );
      await persist(next);
    },

    setExcludedFromAi: async (id, excluded) => {
      await get().load();
      const now = Date.now();
      await persist(
        get().records.map((r) =>
          r.id === id ? { ...r, excludedFromAi: excluded, updatedAt: now } : r,
        ),
      );
    },

    remove: async (id) => {
      await get().load();
      await persist(get().records.filter((r) => r.id !== id));
    },

    exists: (id) => get().records.some((r) => r.id === id),

    getByStudentRef: (studentRef) => get().records.filter((r) => r.studentRef === studentRef),

    getByArea: (studentRef, area) =>
      get().records.filter((r) => r.studentRef === studentRef && r.areas.includes(area)),
  };
});
