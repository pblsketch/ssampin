import { create } from 'zustand';
import {
  normalizeThreadKeywords,
  type InquiryThread,
  type InquiryThreadStatus,
} from '@domain/entities/InquiryThread';
import { academicTermForDate } from '@domain/rules/academicCalendar';
import { inquiryThreadRepository } from '@adapters/di/container';
import { generateUUID } from '@infrastructure/utils/uuid';

/** 흐름 추가 입력 — id·시각·term 은 스토어가 채운다. */
export interface InquiryThreadAddInput {
  studentRef: string;
  title: string;
  classId?: string;
  keywords?: readonly string[];
  standardCodes?: readonly string[];
}

/** 흐름 부분 수정 입력. `undefined` 는 "건드리지 않음". */
export interface InquiryThreadPatch {
  title?: string;
  keywords?: readonly string[];
  standardCodes?: readonly string[];
  competencyKeywords?: readonly string[];
  nextNotes?: string;
  status?: InquiryThreadStatus;
}

interface InquiryThreadState {
  records: readonly InquiryThread[];
  loaded: boolean;

  /** force=true 는 동기화 리로드용 — loaded 를 유지한 채 데이터만 갱신. */
  load: (force?: boolean) => Promise<void>;
  /** 흐름 추가. 반환 = 생성된 id. */
  add: (input: InquiryThreadAddInput) => Promise<string>;
  update: (id: string, patch: InquiryThreadPatch) => Promise<void>;
  /** 흐름 삭제. 낱장 쪽 `threadId` 는 여기서 지우지 않는다 — 호출자(화면)가 근거·관찰 스토어에서 푼다. */
  remove: (id: string) => Promise<void>;
  exists: (id: string) => boolean;

  getByStudentRef: (studentRef: string) => readonly InquiryThread[];
  getOpenByStudentRef: (studentRef: string) => readonly InquiryThread[];
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 탐구 흐름(InquiryThread) 스토어 — inquiry-threads.json 을 통째로 읽고 쓴다(근거 창고 스토어 미러).
 *
 * ★학생 전환·리셋: 이 스토어는 학생별 상태를 들고 있지 않다(전체 목록 + 조회 함수). Phase 2 에서
 *   "선택 슬롯이 다음 학생에게 옮겨 붙던" 오염은 화면 상태에서 났다 — 화면(T2)이 학생을 바꿀 때
 *   선택 흐름을 리셋하는 것은 화면의 책임이고, 여기서는 studentRef 로만 조회하게 해 섞일 길을 줄인다.
 */
export const useInquiryThreadStore = create<InquiryThreadState>((set, get) => {
  const persist = async (next: readonly InquiryThread[]): Promise<void> => {
    set({ records: next });
    await inquiryThreadRepository.saveInquiryThreads({ records: next });
  };

  return {
    records: [],
    loaded: false,

    load: async (force = false) => {
      if (get().loaded && !force) return;
      try {
        const data = await inquiryThreadRepository.getInquiryThreads();
        set({ records: data?.records ?? [], loaded: true });
      } catch (err) {
        console.error('[InquiryThreadStore] load failed:', err);
        set({ loaded: true });
      }
    },

    add: async (input) => {
      // 통째로 저장하는 구조라 메모리가 파일을 반영해야 한다(미로드 상태 저장 시 기존 흐름 유실 방지).
      await get().load();
      const title = input.title.trim();
      if (title.length === 0) throw new Error('주제 이름이 비어 있습니다.');
      const now = Date.now();
      const term = academicTermForDate(todayStr());
      const rec: InquiryThread = {
        id: generateUUID(),
        studentRef: input.studentRef,
        title,
        keywords: normalizeThreadKeywords(input.keywords ?? []),
        status: 'open',
        createdAt: now,
        updatedAt: now,
        ...(input.classId !== undefined ? { classId: input.classId } : {}),
        ...(input.standardCodes && input.standardCodes.length > 0
          ? { standardCodes: [...input.standardCodes] }
          : {}),
        ...(term !== null ? { term } : {}),
      };
      await persist([...get().records, rec]);
      return rec.id;
    },

    update: async (id, patch) => {
      await get().load();
      const now = Date.now();
      const next = get().records.map((r) => {
        if (r.id !== id) return r;
        const title = patch.title !== undefined ? patch.title.trim() : r.title;
        return {
          ...r,
          title: title.length > 0 ? title : r.title,
          ...(patch.keywords !== undefined
            ? { keywords: normalizeThreadKeywords(patch.keywords) }
            : {}),
          ...(patch.standardCodes !== undefined ? { standardCodes: [...patch.standardCodes] } : {}),
          ...(patch.competencyKeywords !== undefined
            ? { competencyKeywords: normalizeThreadKeywords(patch.competencyKeywords) }
            : {}),
          ...(patch.nextNotes !== undefined ? { nextNotes: patch.nextNotes } : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          updatedAt: now,
        };
      });
      await persist(next);
    },

    remove: async (id) => {
      await get().load();
      await persist(get().records.filter((r) => r.id !== id));
    },

    exists: (id) => get().records.some((r) => r.id === id),

    getByStudentRef: (studentRef) => get().records.filter((r) => r.studentRef === studentRef),

    getOpenByStudentRef: (studentRef) =>
      get().records.filter((r) => r.studentRef === studentRef && r.status === 'open'),
  };
});
