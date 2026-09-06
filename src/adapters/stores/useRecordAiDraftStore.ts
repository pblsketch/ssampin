import { create } from 'zustand';
import {
  enforceAiDraftCap,
  sameAiDraftKey,
  type RecordAiDraft,
  type RecordAiDraftKey,
} from '@domain/entities/RecordAiDraft';
import type { NarrativeParagraph } from '@domain/rules/narrativeParagraphs';
import { recordAiDraftRepository } from '@adapters/di/container';
import { generateUUID } from '@infrastructure/utils/uuid';

/** 판 추가 입력 — id·시각은 스토어가 채운다. 문단은 이미 실명 복원·표식 분리가 끝난 것이어야 한다. */
export interface RecordAiDraftAddInput {
  draftKey: RecordAiDraftKey;
  threadId?: string;
  provider: 'claude' | 'codex';
  model?: string;
  paragraphs: readonly NarrativeParagraph[];
  excluded: string;
}

interface RecordAiDraftState {
  records: readonly RecordAiDraft[];
  loaded: boolean;

  /** force=true 는 동기화 리로드용 — loaded 를 유지한 채 데이터만 갱신. */
  load: (force?: boolean) => Promise<void>;
  /** 판 추가. 같은 칸이 상한을 넘으면 오래된 미반영 판부터 지운다. 반환 = 생성된 id. */
  add: (input: RecordAiDraftAddInput) => Promise<string>;
  /** [반영]·[뒤에 붙이기] — 반영 시각을 찍는다. */
  markApplied: (id: string) => Promise<void>;
  /** [버리기] — 삭제다. 버린 판은 남지 않는다. */
  remove: (id: string) => Promise<void>;
  /** 한 칸의 판들(오래된 순). */
  getForKey: (key: RecordAiDraftKey) => readonly RecordAiDraft[];
}

/**
 * AI 초안 판 스토어 — record-ai-drafts.json 을 통째로 읽고 쓴다(초안 스토어 미러).
 *
 * ★별칭 매핑은 여기 오지 않는다. 화면이 실명으로 되돌린 문단만 넘긴다(저장 원칙).
 */
export const useRecordAiDraftStore = create<RecordAiDraftState>((set, get) => {
  const persist = async (next: readonly RecordAiDraft[]): Promise<void> => {
    set({ records: next });
    await recordAiDraftRepository.saveRecordAiDrafts({ records: next });
  };

  return {
    records: [],
    loaded: false,

    load: async (force = false) => {
      if (get().loaded && !force) return;
      try {
        const data = await recordAiDraftRepository.getRecordAiDrafts();
        set({ records: data?.records ?? [], loaded: true });
      } catch (err) {
        console.error('[RecordAiDraftStore] load failed:', err);
        set({ loaded: true });
      }
    },

    add: async (input) => {
      // 통째로 저장하는 구조라 메모리가 파일을 반영해야 한다(미로드 상태 저장 시 기존 판 유실 방지).
      await get().load();
      const rec: RecordAiDraft = {
        id: generateUUID(),
        draftKey: {
          area: input.draftKey.area,
          studentRef: input.draftKey.studentRef,
          ...(input.draftKey.subject !== undefined ? { subject: input.draftKey.subject } : {}),
          ...(input.draftKey.classId !== undefined ? { classId: input.draftKey.classId } : {}),
        },
        provider: input.provider,
        paragraphs: input.paragraphs.map((p) => ({ role: p.role, text: p.text })),
        excluded: input.excluded,
        createdAt: Date.now(),
        ...(input.threadId !== undefined ? { threadId: input.threadId } : {}),
        ...(input.model !== undefined && input.model.length > 0 ? { model: input.model } : {}),
      };
      await persist(enforceAiDraftCap([...get().records, rec], rec.draftKey));
      return rec.id;
    },

    markApplied: async (id) => {
      await get().load();
      const now = Date.now();
      await persist(get().records.map((r) => (r.id === id ? { ...r, appliedAt: now } : r)));
    },

    remove: async (id) => {
      await get().load();
      await persist(get().records.filter((r) => r.id !== id));
    },

    getForKey: (key) =>
      get()
        .records.filter((r) => sameAiDraftKey(r.draftKey, key))
        .sort((a, b) => a.createdAt - b.createdAt),
  };
});
