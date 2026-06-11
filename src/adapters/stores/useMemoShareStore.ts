import { create } from 'zustand';
import type { Memo } from '@domain/entities/Memo';
import type { MemoShareBoard, MemoShareBoardsData } from '@domain/entities/MemoShareBoard';
import type { MemoShareAttention, MemoShareTtsVoice } from '@domain/entities/MemoShareItem';
import { MAX_ITEMS } from '@domain/rules/memoShareRules';
import { CreateShareBoard } from '@usecases/memoShare/CreateShareBoard';
import { SyncShareBoard, type SyncShareBoardExtras } from '@usecases/memoShare/SyncShareBoard';
import { StopSharing } from '@usecases/memoShare/StopSharing';
import { useMemoStore } from './useMemoStore';

/**
 * 메모 교실 공유 스토어 (plan.md v2 B-3).
 *
 * - 로컬 메모(`useMemoStore`)가 원본 — 이 스토어는 **subscribe 관찰만** 하며
 *   `useMemoStore`를 절대 수정하지 않는다 (무수정 메타테스트로 고정).
 * - 공유 데이터(내용·이미지)는 선생님 개인 Google Drive에만 저장된다.
 *   이 경로의 외부 호출은 Drive(포트 IMemoShareClient) + 숏링크(ShortLinkClient,
 *   URL 문자열만) 뿐이다 (SC-10 메타테스트로 고정).
 * - 공유 중 메모가 수정되면 debounce 1.5s로 묶어 SyncShareBoard 실행.
 *   실패 시 백오프 재시도 3회 → 그래도 실패면 큐 보존 + `syncStatus: 'pending'`
 *   ("동기화 대기 중" 배지).
 * - 구글 미로그인 시 공유 액션 비활성 게이트 (로그인 유도는 모달 책임).
 * - 공유 중 메모 삭제는 즉시 push하지 않고 `deletedMemoNotice`로 확인 플로우를 노출한다.
 */

const STORAGE_KEY = 'memoShareBoards';
const WARNING_ACK_KEY = 'ssampin-memo-share-privacy-ack-v1';

/** 메모 변경 → 동기화 push 디바운스 (연속 타이핑을 1회로 묶음) */
export const SYNC_DEBOUNCE_MS = 1500;
/** 동기화 실패 시 백오프 재시도 간격 — 3회 후에도 실패하면 큐 보존 */
export const SYNC_RETRY_DELAYS_MS: readonly number[] = [1500, 3000, 6000];

export type MemoShareSyncStatus = 'idle' | 'syncing' | 'pending';

/** 공유 중 메모 삭제 감지 — 교실 화면 반영 전 확인 플로우용 */
export interface DeletedMemoNotice {
  readonly memoIds: readonly string[];
  readonly boardIds: readonly string[];
}

interface MemoShareState {
  boards: readonly MemoShareBoard[];
  loaded: boolean;
  /** idle=동기화 완료 / syncing=동기화 중 / pending=동기화 대기 중(실패·오프라인·미로그인) */
  syncStatus: MemoShareSyncStatus;
  /** 동기화 큐 — 변경이 쌓였지만 아직 push되지 않은 보드 id */
  pendingBoardIds: readonly string[];
  error: string | null;
  /** 최초 1회 개인정보 경고 확인 여부 (localStorage 영속) */
  warningAcknowledged: boolean;
  /** 공유 중 메모 삭제 감지 시 확인 플로우 상태 */
  deletedMemoNotice: DeletedMemoNotice | null;
  isCreating: boolean;

  /** 영속 보드 로드 + useMemoStore 관찰 시작 (멱등) */
  initialize: () => Promise<void>;
  acknowledgeWarning: () => void;
  /** 구글 미로그인 시 null 반환 + error 세팅 (게이트) */
  createBoard: (memoIds: readonly string[], title: string) => Promise<MemoShareBoard | null>;
  /** Drive 영구 삭제 + 로컬 보드 제거. 실패 시 false */
  stopSharing: (boardId: string) => Promise<boolean>;
  /** 숏링크 생성 (선택 기능 — URL 문자열만 저장). 실패는 조용히 무시 */
  createShortUrl: (boardId: string) => Promise<void>;
  /** 삭제된 메모를 교실 화면에서도 제거 (해당 보드 즉시 동기화) */
  confirmDeletedMemoSync: () => void;
  /** 확인 플로우만 닫음 — 다음 자연 동기화 때 함께 반영됨 */
  dismissDeletedMemoNotice: () => void;
  /** "동기화 대기 중" 큐 수동 재시도 */
  retrySync: () => void;
  /**
   * 공유 중 보드의 구성(포스트잇 목록)·제목 편집 — 링크(fileId/URL)는 절대 바뀌지 않는다.
   * 새 구성은 동기화 큐를 통해 직렬화되어 push된다 (추가 메모 이미지 업로드,
   * 빠진 메모 JSON 제거 + Drive 이미지 삭제는 diffForSync가 산출).
   * 0개 구성·MAX_ITEMS 초과는 거부(false + error).
   */
  updateBoardMemos: (boardId: string, memoIds: readonly string[], title?: string) => boolean;
  /** 보드 기본 TTS 음성 설정 — 보드 영속 + 동기화 큐(내용 diff 없어도 업로드 강제) */
  setBoardTtsVoice: (boardId: string, voice: MemoShareTtsVoice) => Promise<void>;
  /** 주목(알림음 1회) 신호 — 미로그인/오프라인이면 false + 한국어 안내 */
  triggerAttention: (boardId: string) => Promise<boolean>;
  /** 포스트잇 TTS 낭독 1회 신호 — 교실 화면이 해당 포스트잇 팝업 + 낭독 */
  triggerTtsRead: (boardId: string, memoId: string) => Promise<boolean>;
}

// ============================================================
// 모듈 내부 상태 (렌더와 무관한 watcher/타이머)
// ============================================================

let unsubscribeMemos: (() => void) | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let prevMemos: readonly Memo[] | null = null;
let flushing = false;

/**
 * 보드 편집(updateBoardMemos)으로 예약된 "원하는 구성/제목".
 * board.items(마지막 동기화 상태)는 sync 성공 시점에만 갱신되므로,
 * flush가 이 맵을 우선 사용해 diffForSync가 추가(업로드)·제거(이미지 삭제)를 산출하게 한다.
 * sync 성공·보드 제거 시 삭제. (동기화 큐와 동일하게 메모리 전용)
 */
const desiredCompositions = new Map<string, readonly string[]>();
const desiredTitles = new Map<string, string>();

/**
 * 주목 신호 대기열 — 보드당 1건.
 * 신호는 트리거된 그 1회 업로드에만 실리고(성공 시 맵에서 제거), 다음 일반
 * 동기화의 보드 JSON에는 포함되지 않아 자연 소멸한다.
 * **한계**: 연속 클릭 시 이전 신호가 업로드되기 전이면 마지막 신호만 살아남는다
 * (보드당 1슬롯 덮어쓰기) — 교실에서 같은 소리가 N번 겹쳐 울리는 것보다 안전한 선택.
 */
const pendingAttention = new Map<string, MemoShareAttention>();
/** ttsVoice 등 메타만 바뀐 보드 — 내용 diff가 없어도 업로드 강제 */
const forceUploadBoardIds = new Set<string>();

function readWarningAck(): boolean {
  try {
    return window.localStorage.getItem(WARNING_ACK_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeWarningAck(): void {
  try {
    window.localStorage.setItem(WARNING_ACK_KEY, 'true');
  } catch {
    // localStorage 불가 환경 — 세션 내 상태만 유지
  }
}

async function persistBoards(boards: readonly MemoShareBoard[]): Promise<void> {
  const { storage } = await import('@adapters/di/container');
  const data: MemoShareBoardsData = { boards };
  await storage.write(STORAGE_KEY, data);
}

/** 보드의 items 순서(sortOrder)대로 현재 메모를 모은다 — 로컬에서 사라진 메모는 제외 */
function currentMemosForBoard(board: MemoShareBoard, memos: readonly Memo[]): readonly Memo[] {
  const byId = new Map(memos.map((memo) => [memo.id, memo]));
  return [...board.items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((link) => byId.get(link.memoId))
    .filter((memo): memo is Memo => memo !== undefined);
}

/** memoId 목록 순서대로 현재 메모를 모은다 (편집된 구성용) — 사라진 메모는 제외 */
function memosForIds(memoIds: readonly string[], memos: readonly Memo[]): readonly Memo[] {
  const byId = new Map(memos.map((memo) => [memo.id, memo]));
  return memoIds.map((id) => byId.get(id)).filter((memo): memo is Memo => memo !== undefined);
}

/** 백오프 재시도 — 초기 시도 + SYNC_RETRY_DELAYS_MS 횟수만큼 재시도 */
async function runWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const delay = SYNC_RETRY_DELAYS_MS[attempt];
      if (delay === undefined) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

function scheduleFlush(): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void flushSyncQueue();
  }, SYNC_DEBOUNCE_MS);
}

/** 큐에 쌓인 보드들을 SyncShareBoard로 push */
async function flushSyncQueue(): Promise<void> {
  if (flushing) return;
  const store = useMemoShareStore;
  if (store.getState().pendingBoardIds.length === 0) return;

  flushing = true;
  try {
    const { authenticateGoogle, getMemoShareClient } = await import('@adapters/di/container');

    // 구글 미로그인 게이트 — 큐 보존 + "동기화 대기 중"
    const connected = await authenticateGoogle.isConnected().catch(() => false);
    if (!connected) {
      store.setState({ syncStatus: 'pending' });
      return;
    }

    store.setState({ syncStatus: 'syncing' });
    const client = await getMemoShareClient(() => authenticateGoogle.getValidAccessToken());
    const sync = new SyncShareBoard(client);

    const ids = [...store.getState().pendingBoardIds];
    for (const boardId of ids) {
      const board = store.getState().boards.find((b) => b.id === boardId);
      if (!board) {
        store.setState((state) => ({
          pendingBoardIds: state.pendingBoardIds.filter((id) => id !== boardId),
        }));
        continue;
      }
      // 보드 편집으로 예약된 구성이 있으면 그 구성을, 없으면 기존 items 구성을 push
      const allMemos = useMemoStore.getState().memos;
      const desired = desiredCompositions.get(boardId);
      const memos =
        desired !== undefined
          ? memosForIds(desired, allMemos)
          : currentMemosForBoard(board, allMemos);
      const titleOverride = desiredTitles.get(boardId);
      // 주목 신호는 이번 업로드에만 싣고 성공 시 소모 — ttsVoice는 usecase가 보드 상태에서 항상 싣는다
      const attention = pendingAttention.get(boardId);
      const extras: SyncShareBoardExtras = {
        ...(attention !== undefined ? { attention } : {}),
        ...(forceUploadBoardIds.has(boardId) ? { forceUpload: true } : {}),
      };
      try {
        const updated = await runWithRetry(() =>
          sync.execute(board, memos, titleOverride, undefined, extras),
        );
        desiredCompositions.delete(boardId);
        desiredTitles.delete(boardId);
        pendingAttention.delete(boardId);
        forceUploadBoardIds.delete(boardId);
        const boards = store
          .getState()
          .boards.map((b) =>
            b.id === updated.id
              ? { ...updated, ...(b.shortUrl !== undefined ? { shortUrl: b.shortUrl } : {}) }
              : b,
          );
        store.setState((state) => ({
          boards,
          error: null,
          pendingBoardIds: state.pendingBoardIds.filter((id) => id !== boardId),
        }));
        await persistBoards(boards);
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        if (message.includes('404')) {
          // 사용자가 Drive에서 직접 삭제 — 공유 끊김. 크래시 금지, 재시도 무의미라 큐에서 제거
          desiredCompositions.delete(boardId);
          desiredTitles.delete(boardId);
          pendingAttention.delete(boardId);
          forceUploadBoardIds.delete(boardId);
          store.setState((state) => ({
            pendingBoardIds: state.pendingBoardIds.filter((id) => id !== boardId),
            error:
              '공유 보드를 구글 드라이브에서 찾을 수 없어요. 공유가 끊어졌을 수 있으니 공유를 중지하고 다시 만들어 주세요.',
          }));
          continue;
        }
        // 재시도 3회 후에도 실패 — 큐 보존 + 동기화 대기 중
        store.setState({
          syncStatus: 'pending',
          error: message || '동기화에 실패했어요. 인터넷 연결을 확인해 주세요.',
        });
        return;
      }
    }
    store.setState((state) => ({
      syncStatus: state.pendingBoardIds.length === 0 ? 'idle' : 'pending',
    }));
  } finally {
    flushing = false;
  }
}

/**
 * useMemoStore 변경 관찰 — 공유 중 memoId의 수정은 동기화 큐에, 삭제는 확인 플로우에.
 * (참조 비교만 사용 — 의미 없는 변경은 SyncShareBoard의 해시 비교가 자연 skip)
 */
function handleMemosChange(nextMemos: readonly Memo[], prev: readonly Memo[]): void {
  const store = useMemoShareStore;
  const { boards } = store.getState();
  if (boards.length === 0) return;

  const prevById = new Map(prev.map((memo) => [memo.id, memo]));
  const nextById = new Map(nextMemos.map((memo) => [memo.id, memo]));

  const changedBoardIds = new Set<string>();
  const deletedMemoIds = new Set<string>();
  const deletedBoardIds = new Set<string>();

  for (const board of boards) {
    for (const link of board.items) {
      const prevMemo = prevById.get(link.memoId);
      const nextMemo = nextById.get(link.memoId);
      if (prevMemo !== undefined && nextMemo === undefined) {
        // 공유 중 메모 삭제 — 즉시 push하지 않고 확인 플로우 노출
        deletedMemoIds.add(link.memoId);
        deletedBoardIds.add(board.id);
      } else if (nextMemo !== undefined && prevMemo !== undefined && prevMemo !== nextMemo) {
        changedBoardIds.add(board.id);
      }
    }
  }

  if (deletedMemoIds.size > 0) {
    store.setState((state) => {
      const existing = state.deletedMemoNotice;
      return {
        deletedMemoNotice: {
          memoIds: [...new Set([...(existing?.memoIds ?? []), ...deletedMemoIds])],
          boardIds: [...new Set([...(existing?.boardIds ?? []), ...deletedBoardIds])],
        },
      };
    });
  }

  // 삭제만 발생한 보드는 확인 전까지 큐에 넣지 않는다
  const queueIds = [...changedBoardIds].filter((id) => !deletedBoardIds.has(id));
  if (queueIds.length > 0) {
    store.setState((state) => ({
      pendingBoardIds: [...new Set([...state.pendingBoardIds, ...queueIds])],
    }));
    scheduleFlush();
  }
}

function startWatching(): void {
  if (unsubscribeMemos !== null) return;
  prevMemos = useMemoStore.getState().memos;
  unsubscribeMemos = useMemoStore.subscribe((state) => {
    const next = state.memos;
    const prev = prevMemos ?? next;
    prevMemos = next;
    if (next === prev) return;
    handleMemosChange(next, prev);
  });
}

// ============================================================
// 스토어
// ============================================================

export const useMemoShareStore = create<MemoShareState>((set, get) => ({
  boards: [],
  loaded: false,
  syncStatus: 'idle',
  pendingBoardIds: [],
  error: null,
  warningAcknowledged: false,
  deletedMemoNotice: null,
  isCreating: false,

  initialize: async () => {
    if (!get().loaded) {
      try {
        const { storage } = await import('@adapters/di/container');
        const data = await storage.read<MemoShareBoardsData>(STORAGE_KEY);
        set({
          boards: data?.boards ?? [],
          loaded: true,
          warningAcknowledged: readWarningAck(),
        });
      } catch {
        set({ loaded: true, warningAcknowledged: readWarningAck() });
      }
    }
    startWatching();
  },

  acknowledgeWarning: () => {
    writeWarningAck();
    set({ warningAcknowledged: true });
  },

  createBoard: async (memoIds, title) => {
    const { authenticateGoogle, getMemoShareClient } = await import('@adapters/di/container');

    // 구글 미로그인 게이트
    const connected = await authenticateGoogle.isConnected().catch(() => false);
    if (!connected) {
      set({ error: '구글 계정에 로그인한 뒤 공유할 수 있어요.' });
      return null;
    }

    const memosById = new Map(useMemoStore.getState().memos.map((memo) => [memo.id, memo]));
    const memos = memoIds
      .map((id) => memosById.get(id))
      .filter((memo): memo is Memo => memo !== undefined);
    if (memos.length === 0) {
      set({ error: '공유할 포스트잇을 1개 이상 선택해 주세요.' });
      return null;
    }

    set({ isCreating: true, error: null });
    try {
      const client = await getMemoShareClient(() => authenticateGoogle.getValidAccessToken());
      const board = await new CreateShareBoard(client).execute(memos, title);
      const boards = [...get().boards, board];
      set({ boards, isCreating: false });
      await persistBoards(boards);
      return board;
    } catch (err) {
      set({
        isCreating: false,
        error:
          err instanceof Error
            ? err.message
            : '공유 보드를 만들지 못했어요. 잠시 후 다시 시도해 주세요.',
      });
      return null;
    }
  },

  stopSharing: async (boardId) => {
    const board = get().boards.find((b) => b.id === boardId);
    if (!board) return false;
    try {
      const { authenticateGoogle, getMemoShareClient } = await import('@adapters/di/container');
      const client = await getMemoShareClient(() => authenticateGoogle.getValidAccessToken());
      await new StopSharing(client).execute(board);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      // 404 = 이미 Drive에서 삭제됨 — 로컬 정리는 계속 진행 (크래시 금지)
      if (!message.includes('404')) {
        set({ error: message || '공유 중지에 실패했어요. 잠시 후 다시 시도해 주세요.' });
        return false;
      }
    }
    desiredCompositions.delete(boardId);
    desiredTitles.delete(boardId);
    pendingAttention.delete(boardId);
    forceUploadBoardIds.delete(boardId);
    const boards = get().boards.filter((b) => b.id !== boardId);
    set((state) => ({
      boards,
      error: null,
      pendingBoardIds: state.pendingBoardIds.filter((id) => id !== boardId),
      deletedMemoNotice:
        state.deletedMemoNotice && state.deletedMemoNotice.boardIds.every((id) => id === boardId)
          ? null
          : state.deletedMemoNotice,
    }));
    await persistBoards(boards);
    return true;
  },

  createShortUrl: async (boardId) => {
    const board = get().boards.find((b) => b.id === boardId);
    if (!board || board.shortUrl !== undefined) return;
    try {
      // 숏링크는 URL 문자열만 저장하는 선택 기능 (공유 내용은 Drive에만 존재)
      const { shortLinkClient } = await import('@adapters/di/container');
      const result = await shortLinkClient.createShortLink(board.shareUrl);
      if (result === board.shareUrl) return;
      const boards = get().boards.map((b) => (b.id === boardId ? { ...b, shortUrl: result } : b));
      set({ boards });
      await persistBoards(boards);
    } catch {
      // 숏링크 생성 실패는 무시 — 원본 링크로 충분
    }
  },

  confirmDeletedMemoSync: () => {
    const notice = get().deletedMemoNotice;
    if (!notice) return;
    set((state) => ({
      deletedMemoNotice: null,
      pendingBoardIds: [...new Set([...state.pendingBoardIds, ...notice.boardIds])],
    }));
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    void flushSyncQueue();
  },

  dismissDeletedMemoNotice: () => {
    set({ deletedMemoNotice: null });
  },

  retrySync: () => {
    if (get().pendingBoardIds.length === 0) return;
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    void flushSyncQueue();
  },

  updateBoardMemos: (boardId, memoIds, title) => {
    const board = get().boards.find((b) => b.id === boardId);
    if (!board) {
      set({ error: '편집할 공유 보드를 찾을 수 없어요.' });
      return false;
    }

    // 현재 존재하는 메모만 인정 (보관/삭제된 메모 방어)
    const existingIds = new Set(useMemoStore.getState().memos.map((memo) => memo.id));
    const validIds = memoIds.filter((id) => existingIds.has(id));

    if (validIds.length === 0) {
      set({
        error:
          '공유 보드에는 포스트잇이 1개 이상 필요해요. 공유를 끝내려면 "공유 중지"를 눌러 주세요.',
      });
      return false;
    }
    if (validIds.length > MAX_ITEMS) {
      set({ error: `공유 가능한 포스트잇은 최대 ${MAX_ITEMS}개입니다.` });
      return false;
    }

    // 원하는 구성/제목 예약 → 동기화 큐로 직렬화 (링크 fileId/URL은 updateBoard라 불변)
    desiredCompositions.set(boardId, validIds);
    const nextTitle = title?.trim();
    if (nextTitle !== undefined && nextTitle.length > 0 && nextTitle !== board.title) {
      desiredTitles.set(boardId, nextTitle);
    } else {
      desiredTitles.delete(boardId);
    }

    set((state) => ({
      error: null,
      pendingBoardIds: [...new Set([...state.pendingBoardIds, boardId])],
    }));
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    void flushSyncQueue();
    return true;
  },

  setBoardTtsVoice: async (boardId, voice) => {
    const board = get().boards.find((b) => b.id === boardId);
    if (!board || board.ttsVoice === voice) return;

    const boards = get().boards.map((b) => (b.id === boardId ? { ...b, ttsVoice: voice } : b));
    set((state) => ({
      boards,
      // 음성 변경은 내용 diff가 없으므로 업로드 강제 플래그로 큐에 태운다
      pendingBoardIds: [...new Set([...state.pendingBoardIds, boardId])],
    }));
    forceUploadBoardIds.add(boardId);
    await persistBoards(boards);
    // 즉시성 불필요 — 일반 debounce로 묶음 (연타 시 1회 업로드)
    scheduleFlush();
  },

  triggerAttention: async (boardId) => triggerSignal(boardId, 'chime'),

  triggerTtsRead: async (boardId, memoId) => {
    // 주의: 여기서 useMemoShareStore를 직접 참조하면 자기 initializer 순환 참조로
    // const가 암시적 any가 되므로 반드시 get/set을 사용한다
    const board = get().boards.find((b) => b.id === boardId);
    if (!board) return false;
    // 보드 구성(편집 예약이 있으면 그 구성)에 포함된 메모만 낭독 가능
    const composition = desiredCompositions.get(boardId) ?? board.items.map((i) => i.memoId);
    if (!composition.includes(memoId)) {
      set({ error: '이 포스트잇은 보드에 공유되어 있지 않아요.' });
      return false;
    }
    return triggerSignal(boardId, 'tts', memoId);
  },
}));

/**
 * 주목/낭독 공통 트리거 — nonce 발급 후 debounce를 우회해 즉시 동기화한다
 * (클릭 → 교실 재생 체감 지연 최소화). 진행 중 sync와는 기존 큐로 직렬화.
 */
async function triggerSignal(
  boardId: string,
  kind: MemoShareAttention['kind'],
  itemId?: string,
): Promise<boolean> {
  const store = useMemoShareStore;
  const board = store.getState().boards.find((b) => b.id === boardId);
  if (!board) return false;

  // 오프라인 게이트 — 늦게 도착한 "주목"은 의미가 없으므로 큐에 쌓지 않고 거부
  // (navigator.onLine을 모르는 환경에서는 게이트를 건너뛰고 동기화 실패 경로에 맡긴다)
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    store.setState({
      error: '인터넷에 연결된 뒤 다시 눌러 주세요. 주목 신호는 바로 전달될 때만 의미가 있어요.',
    });
    return false;
  }

  // 구글 미로그인 게이트
  const { authenticateGoogle } = await import('@adapters/di/container');
  const connected = await authenticateGoogle.isConnected().catch(() => false);
  if (!connected) {
    store.setState({ error: '구글 계정에 로그인한 뒤 사용할 수 있어요.' });
    return false;
  }

  // 프로젝트 공통 id 생성기 재사용 — 정적 import는 adapters→infrastructure 레이어 규칙
  // 위반(no-restricted-imports)이라 container와 동일하게 호출 시점 dynamic import 사용
  const { generateUUID } = await import('@infrastructure/utils/uuid');
  pendingAttention.set(boardId, {
    kind,
    ...(itemId !== undefined ? { itemId } : {}),
    requestedAt: new Date().toISOString(),
    nonce: generateUUID(),
  });
  store.setState((state) => ({
    error: null,
    pendingBoardIds: [...new Set([...state.pendingBoardIds, boardId])],
  }));
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  void flushSyncQueue();
  return true;
}

/**
 * @internal 테스트 전용 — watcher/타이머 등 모듈 내부 상태와 스토어 상태를 초기화한다.
 * 프로덕션 코드에서 호출 금지.
 */
export function __resetMemoShareStoreForTests(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  unsubscribeMemos?.();
  unsubscribeMemos = null;
  prevMemos = null;
  flushing = false;
  desiredCompositions.clear();
  desiredTitles.clear();
  pendingAttention.clear();
  forceUploadBoardIds.clear();
  useMemoShareStore.setState({
    boards: [],
    loaded: false,
    syncStatus: 'idle',
    pendingBoardIds: [],
    error: null,
    warningAcknowledged: false,
    deletedMemoNotice: null,
    isCreating: false,
  });
}
