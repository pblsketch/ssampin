import { create } from 'zustand';
import {
  normalizeThreadKeywords,
  type InquiryThread,
  type InquiryThreadStatus,
} from '@domain/entities/InquiryThread';
import { academicTermForDate } from '@domain/rules/academicCalendar';
import { inquiryThreadRepository, recordEvidenceRepository } from '@adapters/di/container';
import { generateUUID } from '@infrastructure/utils/uuid';
import { withFileLock } from '@usecases/shared/fileWriteLock';
import { SYNC_FILE_KEYS } from '@usecases/sync/syncRegistry';

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

/**
 * 보상 삭제 결과 — "지웠다"와 "안 지우는 게 맞다"와 "모르겠다"를 구별한다(계획 §5.1-7).
 * `kept` = 다른 기록이 이미 쓰고 있어 보존. `failed` = 확인·삭제가 실패해 상태 불명.
 */
export type ThreadCompensationResult = 'removed' | 'kept' | 'failed';

interface InquiryThreadState {
  records: readonly InquiryThread[];
  loaded: boolean;
  /** 마지막 읽기 실패 메시지. 화면이 "불러오지 못했습니다"를 빈 목록과 구별하는 근거. */
  loadError: string | null;

  /** force=true 는 동기화 리로드용 — loaded 를 유지한 채 데이터만 갱신. */
  load: (force?: boolean) => Promise<void>;
  /**
   * 동기화가 파일을 갈아 끼운 뒤의 재적재 전용 진입점 — **쓰기와 같은 파일 락 안에서**
   * 최신을 읽어 게시한다. 락 밖에서 읽으면 이미 낡은 스냅샷을 뒤늦게 게시할 수 있다(계획 §5.2).
   */
  forceReload: () => Promise<void>;
  /** 흐름 추가. 반환 = 생성된 id. */
  add: (input: InquiryThreadAddInput) => Promise<string>;
  update: (id: string, patch: InquiryThreadPatch) => Promise<void>;
  /** 흐름 삭제. 낱장 쪽 threadId 는 여기서 지우지 않는다 — 호출자(화면)가 근거·관찰 스토어에서 푼다. */
  remove: (id: string) => Promise<void>;
  /**
   * 주제 연결 관문 — 저장소에서 **다시 읽어** 존재·소유를 확인하고 그 흐름을 돌려준다.
   * 화면 메모리가 아니라 파일을 본다. 선택한 뒤 다른 경로에서 지워졌으면 여기서 걸린다.
   *
   * `requireOpen` 은 **입력 중 주제 연결** 전용이다(계획 §4.2 — 마친 주제는 다시 연 뒤에만 연결).
   * 보드에서 열로 끌어다 놓는 기존 경로는 마친 주제도 그대로 다룰 수 있어야 해서 기본값은 false 다.
   */
  assertLinkable: (
    threadId: string,
    studentRef: string,
    opts?: { readonly requireOpen?: boolean },
  ) => Promise<InquiryThread>;
  /**
   * 보상 삭제 — 이번 작업이 만든 주제가 **아직 아무 근거도 쓰지 않을 때만** 지운다.
   * 주제→근거 순서로 잠근다(역순 경로 없음). 다른 작업이 쓰기 시작했으면 보존한다.
   */
  removeIfUnused: (id: string) => Promise<ThreadCompensationResult>;
  exists: (id: string) => boolean;

  getByStudentRef: (studentRef: string) => readonly InquiryThread[];
  getOpenByStudentRef: (studentRef: string) => readonly InquiryThread[];
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

const FILE_KEY = SYNC_FILE_KEYS.inquiryThreads;

/**
 * 저장소 최신 목록. **읽기 실패는 그대로 던진다** — 빈 목록으로 갈음하면 통째 저장 구조에서
 * 남의 주제를 전부 지운다(계획 §5.2 "읽기 실패를 빈 파일로 간주하지 않는다").
 */
async function readLatest(): Promise<readonly InquiryThread[]> {
  const data = await inquiryThreadRepository.getInquiryThreads();
  return data?.records ?? [];
}

/**
 * 탐구 흐름(InquiryThread) 스토어 — inquiry-threads.json 을 통째로 읽고 쓴다(근거 창고 스토어 미러).
 *
 * ★쓰기 규율(계획 §5.2): 공개 쓰기 진입점은 공용 파일 락을 **정확히 한 번** 잡고 그 안에서
 *   최신 읽기 → 순수 변환 → 저장 → 게시를 한다. 메모리를 먼저 바꾸지 않는다 — 저장이 실패하면
 *   화면에만 있는 유령 주제가 남고, 다음 통째 저장이 그 유령을 파일에 굳힌다.
 *
 * ★학생 전환·리셋: 이 스토어는 학생별 상태를 들고 있지 않다(전체 목록 + 조회 함수). Phase 2 에서
 *   "선택 슬롯이 다음 학생에게 옮겨 붙던" 오염은 화면 상태에서 났다 — 화면(T2)이 학생을 바꿀 때
 *   선택 흐름을 리셋하는 것은 화면의 책임이고, 여기서는 studentRef 로만 조회하게 해 섞일 길을 줄인다.
 */
export const useInquiryThreadStore = create<InquiryThreadState>((set, get) => {
  /**
   * 공개 쓰기 진입점의 공통 몸통 — 락 안에서 최신 읽기 → 변환 → 저장 → 게시.
   * ★여기서 부르는 transform 은 **락을 다시 잡지 않는** 순수 변환이어야 한다(자기 자신 대기 = 교착).
   * next 로 latest 를 그대로 돌려주면 "바뀐 것 없음"이라 저장하지 않는다.
   */
  const write = <T>(
    transform: (latest: readonly InquiryThread[]) => {
      next: readonly InquiryThread[];
      result: T;
    },
  ): Promise<T> =>
    withFileLock(FILE_KEY, async () => {
      const latest = await readLatest();
      const { next, result } = transform(latest);
      if (next !== latest) {
        await inquiryThreadRepository.saveInquiryThreads({ records: next });
      }
      set({ records: next, loaded: true, loadError: null });
      return result;
    });

  return {
    records: [],
    loaded: false,
    loadError: null,

    load: async (force = false) => {
      if (get().loaded && !force) return;
      try {
        const records = await readLatest();
        set({ records, loaded: true, loadError: null });
      } catch (err) {
        // 화면은 계속 뜨되 **빈 목록과 구별**되게 남긴다. 이 상태에서의 쓰기는 락 안에서
        // 다시 읽으므로, 읽기가 여전히 실패하면 저장까지 가지 않고 그대로 던진다.
        console.error('[InquiryThreadStore] load failed:', err);
        set({ loaded: true, loadError: err instanceof Error ? err.message : String(err) });
      }
    },

    forceReload: async () => {
      await withFileLock(FILE_KEY, async () => {
        try {
          const records = await readLatest();
          set({ records, loaded: true, loadError: null });
        } catch (err) {
          console.error('[InquiryThreadStore] forceReload failed:', err);
          set({ loadError: err instanceof Error ? err.message : String(err) });
        }
      });
    },

    add: async (input) => {
      // 락을 잡기 전에 거른다 — 거부할 입력으로 파일을 읽고 쓸 이유가 없다.
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
      return write((latest) => ({ next: [...latest, rec], result: rec.id }));
    },

    update: async (id, patch) => {
      await write((latest) => {
        if (!latest.some((r) => r.id === id)) return { next: latest, result: undefined };
        const now = Date.now();
        const next = latest.map((r) => {
          if (r.id !== id) return r;
          const title = patch.title !== undefined ? patch.title.trim() : r.title;
          return {
            ...r,
            title: title.length > 0 ? title : r.title,
            ...(patch.keywords !== undefined
              ? { keywords: normalizeThreadKeywords(patch.keywords) }
              : {}),
            ...(patch.standardCodes !== undefined
              ? { standardCodes: [...patch.standardCodes] }
              : {}),
            ...(patch.competencyKeywords !== undefined
              ? { competencyKeywords: normalizeThreadKeywords(patch.competencyKeywords) }
              : {}),
            ...(patch.nextNotes !== undefined ? { nextNotes: patch.nextNotes } : {}),
            ...(patch.status !== undefined ? { status: patch.status } : {}),
            updatedAt: now,
          };
        });
        return { next, result: undefined };
      });
    },

    remove: async (id) => {
      await write((latest) => {
        const next = latest.filter((r) => r.id !== id);
        return { next: next.length === latest.length ? latest : next, result: undefined };
      });
    },

    assertLinkable: async (threadId, studentRef, opts) => {
      const latest = await withFileLock(FILE_KEY, readLatest);
      const thread = latest.find((t) => t.id === threadId);
      if (!thread) {
        throw new Error('없는 주제입니다. 화면을 새로 고침한 뒤 다시 시도해 주세요.');
      }
      if (thread.studentRef !== studentRef) {
        throw new Error('다른 학생의 주제에는 묶을 수 없습니다.');
      }
      if (opts?.requireOpen === true && thread.status !== 'open') {
        throw new Error('마친 주제입니다. 주제를 다시 연 뒤에 연결해 주세요.');
      }
      return thread;
    },

    removeIfUnused: async (id) =>
      // 주제 락 안에서 근거를 확인한다 — 잠금 순서는 언제나 주제→근거다(역순 없음).
      withFileLock(FILE_KEY, async (): Promise<ThreadCompensationResult> => {
        let inUse: boolean;
        try {
          const evidence = await withFileLock(SYNC_FILE_KEYS.recordEvidence, async () => {
            const data = await recordEvidenceRepository.getRecordEvidence();
            return data?.records ?? [];
          });
          inUse = evidence.some((r) => r.threadId === id);
        } catch (err) {
          // 쓰고 있는지 확인하지 못했다. 지우지 않는다 — 남의 주제를 지우는 쪽이 더 큰 사고다.
          console.error('[InquiryThreadStore] removeIfUnused usage check failed:', err);
          return 'failed';
        }
        if (inUse) return 'kept';
        try {
          const latest = await readLatest();
          const next = latest.filter((r) => r.id !== id);
          if (next.length === latest.length) {
            set({ records: latest, loaded: true, loadError: null });
            return 'removed'; // 이미 없다 = 정리된 상태.
          }
          await inquiryThreadRepository.saveInquiryThreads({ records: next });
          set({ records: next, loaded: true, loadError: null });
          return 'removed';
        } catch (err) {
          console.error('[InquiryThreadStore] removeIfUnused delete failed:', err);
          return 'failed';
        }
      }),

    exists: (id) => get().records.some((r) => r.id === id),

    getByStudentRef: (studentRef) => get().records.filter((r) => r.studentRef === studentRef),

    getOpenByStudentRef: (studentRef) =>
      get().records.filter((r) => r.studentRef === studentRef && r.status === 'open'),
  };
});
