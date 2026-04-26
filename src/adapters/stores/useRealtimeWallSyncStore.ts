import { create } from 'zustand';
import type {
  RealtimeWallCardColor,
  RealtimeWallComment,
  RealtimeWallFreeformPosition,
  RealtimeWallKanbanPosition,
  StudentCommentInput,
} from '@domain/entities/RealtimeWall';
import type { RealtimeWallBoardSettings } from '@domain/entities/RealtimeWallBoardSettings';
import type {
  BroadcastableServerMessage,
  WallBoardSnapshotForStudent,
} from '@usecases/realtimeWall/BroadcastWallState';

/**
 * WebSocket 동기화 클라이언트 상태.
 *
 * 책임:
 * - 학생/교사 entry가 공통으로 쓰는 WebSocket lifecycle 관리
 * - exponential backoff 재연결 (1s/2s/4s/8s/16s, 최대 5회)
 * - 서버 push 메시지 → 로컬 board snapshot 갱신 (discriminated union)
 *
 * P1 범위는 `wall-state`/`post-*`/`closed`/`error` 6종 처리. P2 좋아요/댓글은
 * applyMessage switch에 case stub만 두고 무시.
 *
 * Design §6.1 useRealtimeWallSyncStore.
 */

const SESSION_TOKEN_STORAGE_KEY = 'ssampin-realtime-wall-session-token';
const PIN_HASH_STORAGE_PREFIX = 'ssampin-realtime-wall-pin-hash:'; // + boardKey

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000] as const;
const MAX_RETRIES = RETRY_DELAYS_MS.length;

export type RealtimeWallSyncStatus =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed'
  | 'error';

interface RealtimeWallSyncState {
  readonly status: RealtimeWallSyncStatus;
  readonly board: WallBoardSnapshotForStudent | null;
  readonly currentSessionToken: string;
  readonly retryCount: number;
  readonly lastError?: string;

  /**
   * v1.14 P3 — 학생 카드 추가 잠금 상태.
   *
   * 서버 broadcast `student-form-locked` 메시지로 갱신.
   * 초기값은 wall-state snapshot.studentFormLocked로 동기화.
   * true일 때 학생 FAB 비활성 + 제출 시도 거부.
   */
  readonly studentFormLocked: boolean;

  /**
   * v1.14 P3 — 학생 카드 추가 진행 중 표시.
   *
   * submitCard 호출 직후 true → `submitted` 응답 수신 시 false.
   * 모달 close + 입력값 clear 타이밍 제어용.
   */
  readonly isSubmitting: boolean;

  connect: (url: string) => void;
  disconnect: () => void;
  applyMessage: (msg: BroadcastableServerMessage) => void;

  // v1.14 P2 — 학생 액션. WebSocket으로 student-like / student-comment 메시지 송신.
  toggleLike: (postId: string) => void;
  addComment: (
    postId: string,
    input: Omit<StudentCommentInput, 'sessionToken'>,
  ) => void;

  // v1.14 P3 — 학생 카드 추가. submit 메시지 송신.
  // v2.1 (Phase B) — 시그니처 확장: images? / pdfDataUrl? / pdfFilename? / color? / pinHash?
  submitCard: (input: {
    nickname: string;
    text: string;
    linkUrl?: string;
    /** v2.1 — 카드당 최대 3장 base64 data URL */
    images?: readonly string[];
    /**
     * v2.1 — PDF base64 data URL (data:application/pdf;base64,...).
     * 서버가 magic byte 검증 + 임시 디렉토리 저장 후 file:// URL로 교체 broadcast.
     */
    pdfDataUrl?: string;
    pdfFilename?: string;
    /** v2.1 — 카드 색상 8색 */
    color?: RealtimeWallCardColor;
    /** v2.1 — PIN 설정 학생만 첨부 (Phase D 활용) */
    pinHash?: string;
    /**
     * v2.1 student-ux — Kanban 컬럼별 + 버튼 진입 시 columnId (Padlet 패턴).
     *
     * - 미지정: 교사 측 createWallPost가 첫 컬럼 default 사용
     * - 지정: 서버 'submit' 메시지에 columnId 포함 → 교사 측 onRealtimeWallStudentSubmitted
     *   처리 시 createWallPost 입력에 추가되어 해당 컬럼에 카드 배치
     */
    columnId?: string;
  }) => void;

  /**
   * v2.1 — 댓글 v2 (이미지 1장 첨부 가능).
   * Phase B 신규 — `submit-comment-v2` WebSocket 메시지.
   */
  submitCommentV2: (
    postId: string,
    input: Omit<StudentCommentInput, 'sessionToken'>,
  ) => void;

  /**
   * 서버가 submit에 'submitted' ack로 응답 시 호출. applyMessage가 아닌 직접
   * 수신 경로로 처리 — 'submitted' 메시지는 broadcast가 아니라 submitter 1명에게만
   * 전송되기 때문.
   */
  markSubmitted: () => void;

  // ============ v2.1 Phase D — 학생 자기 카드 수정/삭제 + PIN ============

  /**
   * v2.1 Phase D — 현재 학생 PIN hash (PIN 설정 학생만, undefined = 익명 모드).
   * boardKey 단위로 localStorage 영속.
   */
  readonly currentPinHash: string | undefined;

  /**
   * v2.1 Phase D — PIN hash 직접 적용 + localStorage 저장 (boardKey 단위).
   * useStudentPin 훅이 hashStudentPin → 결과 hash를 이 액션에 전달.
   * @param hash 64자 hex (SHA-256 결과)
   * @param boardKey 보드 식별 키 (localStorage 분리용)
   */
  setPinHash: (hash: string | undefined, boardKey: string) => void;

  /**
   * v2.1 Phase D — boardKey 기준 저장된 PIN hash 로드.
   * 존재하면 currentPinHash state에 반영.
   * @returns 로드된 hash (없으면 undefined)
   */
  loadPinHash: (boardKey: string) => string | undefined;

  /**
   * v2.1 Phase D — PIN hash 제거 (localStorage + state 둘 다).
   */
  clearPinHash: (boardKey: string) => void;

  /**
   * v2.1 Phase D — 학생 자기 카드 수정 → submit-edit WebSocket send.
   * 응답: post-updated patch broadcast (낙관적 업데이트 X — 서버 검증 필수).
   */
  submitOwnCardEdit: (
    postId: string,
    patch: {
      text?: string;
      linkUrl?: string | null;
      images?: readonly string[];
      pdfDataUrl?: string | null;
      pdfFilename?: string | null;
      color?: RealtimeWallCardColor;
    },
  ) => void;

  /**
   * v2.1 Phase D — 학생 자기 카드 삭제 → submit-delete WebSocket send.
   * 응답: post-updated patch: { status: 'hidden-by-author' } broadcast.
   * 회귀 위험 #8: 클라이언트 측에서도 절대 hard delete X (filter 패턴 사용 금지).
   */
  submitOwnCardDelete: (postId: string) => void;

  /**
   * v2.1 Phase D — PIN 등록 송신 (submit-pin-set).
   * 결과: 본인에게만 'pin-verified' ack 응답.
   */
  submitPinSet: (hash: string) => void;

  /**
   * v2.1 Phase D — PIN 검증 송신 (submit-pin-verify).
   * 결과: 본인에게만 'pin-verified' 또는 'pin-mismatch' 응답 → onPinVerifyResult 콜백 트리거.
   */
  submitPinVerify: (hash: string) => void;

  /**
   * v2.1 Phase D — 교사 닉네임 변경 (단일 또는 일괄).
   * - postId 단일 변경 / ownerSessionToken/ownerPinHash 기준 일괄 변경
   */
  submitNicknameUpdate: (args: {
    postId?: string;
    ownerSessionToken?: string;
    ownerPinHash?: string;
    newNickname: string;
  }) => void;

  /**
   * v2.1 Phase D — PIN 검증 결과 콜백 등록 (submit-pin-verify 응답 1회 수신).
   * @returns unsubscribe 함수
   */
  onPinVerifyResult: (callback: (ok: boolean) => void) => () => void;

  // ============ v2.1 Phase C — 학생 자기 카드 위치 변경 ============

  /**
   * v2.1 Phase C — 학생 자기 카드 위치 변경 (Design v2.1 §6.1).
   *
   * - Freeform 또는 Kanban 부분 patch 송신
   * - 낙관적 업데이트 (UI 즉시 반영) + 서버 broadcast 도착 시 reconcile (LWW)
   * - 회귀 위험 #8 보호: hard delete X — 위치만 patch
   * - 매칭 실패 시 서버는 error 송신 ("본인 카드만 옮길 수 있어요.")
   */
  submitOwnCardMove: (
    postId: string,
    position: {
      freeform?: RealtimeWallFreeformPosition;
      kanban?: RealtimeWallKanbanPosition;
    },
  ) => void;

  /**
   * v2.1 신규 (Phase B 도메인 선언, Phase A 활용) — boardSettings 갱신.
   * Phase B에서는 broadcast 수신 분기만 추가, 액션은 Phase A에서.
   */
  // updateBoardSettings — Phase A
}

/**
 * sessionStorage에 토큰을 보관해 새로고침 시에도 동일 학생을 식별.
 * 새 탭은 새 토큰 (sessionStorage 격리). PIPA 위반 X — 임의 UUID.
 */
function getOrCreateSessionToken(): string {
  if (typeof window === 'undefined') {
    return generateUuidLike();
  }
  try {
    const existing = window.sessionStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
    if (existing && existing.length > 0) return existing;
    const created = generateUuidLike();
    window.sessionStorage.setItem(SESSION_TOKEN_STORAGE_KEY, created);
    return created;
  } catch {
    // sessionStorage 사용 불가 (privacy mode 등)
    return generateUuidLike();
  }
}

function generateUuidLike(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// 모듈 스코프 mutable 상태 — Zustand store 외부에서 ref 유지.
let activeSocket: WebSocket | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let intentionallyClosed = false;
let lastConnectUrl: string | null = null;

// v2.1 Phase D — PIN 검증 결과 콜백 큐 (submit-pin-verify 응답 1회 수신)
const pinVerifyCallbacks: Set<(ok: boolean) => void> = new Set();

function clearRetryTimer(): void {
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function teardownSocket(): void {
  if (activeSocket) {
    try {
      // close 핸들러가 재연결을 트리거하지 않도록 intentionallyClosed 사전 설정.
      activeSocket.onopen = null;
      activeSocket.onmessage = null;
      activeSocket.onerror = null;
      activeSocket.onclose = null;
      if (
        activeSocket.readyState === WebSocket.OPEN ||
        activeSocket.readyState === WebSocket.CONNECTING
      ) {
        activeSocket.close();
      }
    } catch {
      // noop
    }
    activeSocket = null;
  }
}

export const useRealtimeWallSyncStore = create<RealtimeWallSyncState>((set, get) => ({
  status: 'idle',
  board: null,
  currentSessionToken: getOrCreateSessionToken(),
  retryCount: 0,
  lastError: undefined,
  studentFormLocked: false,
  isSubmitting: false,
  currentPinHash: undefined,

  connect: (url: string) => {
    intentionallyClosed = false;
    lastConnectUrl = url;
    clearRetryTimer();
    teardownSocket();

    const wsUrl = toWebSocketUrl(url);
    if (!wsUrl) {
      set({ status: 'error', lastError: 'WebSocket URL을 만들 수 없습니다' });
      return;
    }

    set((s) => ({
      status: s.retryCount > 0 ? 'reconnecting' : 'connecting',
      lastError: undefined,
    }));

    let socket: WebSocket;
    try {
      socket = new WebSocket(wsUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류';
      set({ status: 'error', lastError: message });
      scheduleRetry(get, set);
      return;
    }

    activeSocket = socket;

    socket.onopen = () => {
      set({ status: 'open', retryCount: 0, lastError: undefined });
      // join 메시지 송신. P3에서 닉네임도 함께 송신 가능.
      try {
        socket.send(
          JSON.stringify({
            type: 'join',
            sessionToken: get().currentSessionToken,
          }),
        );
      } catch {
        // noop — onerror 경로에서 재처리.
      }
    };

    socket.onmessage = (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
      } catch {
        return;
      }
      if (!parsed || typeof parsed !== 'object') return;
      const obj = parsed as Record<string, unknown>;

      // v1.14 P3 — 'submitted' 는 broadcast가 아닌 submitter 1명 응답.
      // BroadcastableServerMessage union에 없으므로 별도 경로로 처리.
      if (obj['type'] === 'submitted') {
        get().markSubmitted();
        return;
      }

      // v2.1 Phase D — PIN 검증 응답 (단일수신).
      if (obj['type'] === 'pin-verified' || obj['type'] === 'pin-mismatch') {
        const ok = obj['type'] === 'pin-verified';
        // 등록된 콜백 모두 1회 호출 + 큐 비움
        const callbacks = Array.from(pinVerifyCallbacks);
        pinVerifyCallbacks.clear();
        for (const cb of callbacks) {
          try {
            cb(ok);
          } catch {
            // noop
          }
        }
        return;
      }

      const msg = parseServerMessage(obj);
      if (msg) {
        get().applyMessage(msg);
      }
    };

    socket.onerror = () => {
      // 상세 에러는 브라우저 콘솔. 여기서는 status만 갱신.
      set((s) => ({
        status: s.status === 'open' ? 'reconnecting' : 'error',
        lastError: '연결 중 오류가 발생했습니다',
      }));
    };

    socket.onclose = () => {
      activeSocket = null;
      if (intentionallyClosed) {
        set({ status: 'idle' });
        return;
      }
      // 서버에서 closed broadcast를 먼저 받아 status가 closed로 set된 경우 유지.
      if (get().status === 'closed') return;
      scheduleRetry(get, set);
    };
  },

  disconnect: () => {
    intentionallyClosed = true;
    clearRetryTimer();
    teardownSocket();
    set({ status: 'idle', board: null, retryCount: 0, lastError: undefined });
  },

  applyMessage: (msg) => {
    switch (msg.type) {
      case 'wall-state':
        // wall-state broadcast에는 studentFormLocked 스냅샷이 포함.
        // 신규 join 학생도 즉시 올바른 FAB 상태를 받는다.
        set({ board: msg.board, studentFormLocked: msg.board.studentFormLocked });
        return;
      case 'post-added':
        set((s) =>
          s.board
            ? { board: { ...s.board, posts: [...s.board.posts, msg.post] } }
            : s,
        );
        return;
      case 'post-updated':
        // 디버그 로그(production 유지) — 학교 환경 진단용. submit-move broadcast 도착 확인.
        if (typeof window !== 'undefined') {
          // eslint-disable-next-line no-console
          console.log('[Store] applyMessage post-updated', {
            postId: msg.postId,
            patchKeys: Object.keys(msg.patch ?? {}),
            patchKanban: (msg.patch as { kanban?: unknown }).kanban,
            patchFreeform: (msg.patch as { freeform?: unknown }).freeform,
          });
        }
        set((s) =>
          s.board
            ? {
                board: {
                  ...s.board,
                  posts: s.board.posts.map((p) =>
                    p.id === msg.postId ? { ...p, ...msg.patch } : p,
                  ),
                },
              }
            : s,
        );
        return;
      case 'post-removed':
        set((s) =>
          s.board
            ? {
                board: {
                  ...s.board,
                  posts: s.board.posts.filter((p) => p.id !== msg.postId),
                },
              }
            : s,
        );
        return;
      case 'closed':
        intentionallyClosed = true;
        clearRetryTimer();
        teardownSocket();
        set({ status: 'closed' });
        return;
      case 'error':
        // submit 요청 진행 중이었다면 — 서버 거부(locked/invalid link/rate) 시
        // isSubmitting 해제해서 모달이 다시 입력 가능하게 함.
        set({ lastError: msg.message, isSubmitting: false });
        return;
      // v1.14 P2 — 패들렛 모드 학생 좋아요/댓글
      case 'like-toggled':
        set((s) =>
          s.board
            ? {
                board: {
                  ...s.board,
                  posts: s.board.posts.map((p) =>
                    p.id === msg.postId
                      ? { ...p, likes: msg.likes, likedBy: msg.likedBy }
                      : p,
                  ),
                },
              }
            : s,
        );
        return;
      case 'comment-added':
        set((s) =>
          s.board
            ? {
                board: {
                  ...s.board,
                  posts: s.board.posts.map((p) =>
                    p.id === msg.postId
                      ? { ...p, comments: [...(p.comments ?? []), msg.comment] }
                      : p,
                  ),
                },
              }
            : s,
        );
        return;
      case 'comment-removed':
        set((s) =>
          s.board
            ? {
                board: {
                  ...s.board,
                  posts: s.board.posts.map((p) => {
                    if (p.id !== msg.postId) return p;
                    const nextComments = (p.comments ?? []).map((c) =>
                      c.id === msg.commentId ? { ...c, status: 'hidden' as const } : c,
                    );
                    return { ...p, comments: nextComments };
                  }),
                },
              }
            : s,
        );
        return;
      // v1.14 P3 — 학생 카드 추가 잠금 브로드캐스트
      case 'student-form-locked':
        set((s) => ({
          studentFormLocked: msg.locked,
          board: s.board ? { ...s.board, studentFormLocked: msg.locked } : s.board,
        }));
        return;
      // v2.1 (Phase B 도메인 선언, Phase A 활용) — 보드 설정 변경
      case 'boardSettings-changed':
        set((s) => ({
          board: s.board ? { ...s.board, settings: msg.settings } : s.board,
        }));
        return;
      // v2.1 (Phase B 도메인 선언, Phase D 활용) — 닉네임 변경
      case 'nickname-changed':
        set((s) =>
          s.board
            ? {
                board: {
                  ...s.board,
                  posts: s.board.posts.map((p) =>
                    msg.postIds.includes(p.id) ? { ...p, nickname: msg.newNickname } : p,
                  ),
                },
              }
            : s,
        );
        return;
      default: {
        // exhaustive-check
        const _exhaustive: never = msg;
        void _exhaustive;
        return;
      }
    }
  },

  toggleLike: (postId: string) => {
    if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) return;
    try {
      activeSocket.send(
        JSON.stringify({
          type: 'student-like',
          sessionToken: get().currentSessionToken,
          postId,
        }),
      );
    } catch {
      // noop — 다음 상태 변화에 재시도
    }
  },

  addComment: (postId, input) => {
    if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) return;
    try {
      activeSocket.send(
        JSON.stringify({
          type: 'student-comment',
          sessionToken: get().currentSessionToken,
          postId,
          nickname: input.nickname,
          text: input.text,
        }),
      );
    } catch {
      // noop
    }
  },

  submitCard: (input) => {
    if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
      set({ lastError: '연결이 끊어졌어요. 새로고침해 주세요', isSubmitting: false });
      return;
    }
    // 잠금 상태면 UI에서 먼저 차단 — 서버도 동일한 거부 로직.
    if (get().studentFormLocked) {
      set({ lastError: '선생님이 카드 추가를 잠깐 멈췄어요.', isSubmitting: false });
      return;
    }
    set({ isSubmitting: true, lastError: undefined });
    try {
      const payload = {
        type: 'submit' as const,
        sessionToken: get().currentSessionToken,
        nickname: input.nickname,
        text: input.text,
        ...(input.linkUrl && input.linkUrl.length > 0 ? { linkUrl: input.linkUrl } : {}),
        // v2.1 (Phase B) — 신규 필드
        ...(input.images && input.images.length > 0 ? { images: input.images } : {}),
        ...(input.pdfDataUrl ? { pdfUrl: input.pdfDataUrl } : {}),
        ...(input.pdfFilename ? { pdfFilename: input.pdfFilename } : {}),
        ...(input.color ? { color: input.color } : {}),
        ...(input.pinHash ? { pinHash: input.pinHash } : {}),
        // v2.1 student-ux — Kanban 컬럼별 + 버튼 진입 시 columnId (Padlet 패턴)
        ...(input.columnId ? { columnId: input.columnId } : {}),
      };
      const json = JSON.stringify(payload);
      // v2.1 student-ux 회귀 fix (2026-04-24): 디버그 로깅 — 학교 환경 진단용.
      // base64 본문은 size만 (기밀 X). production에서도 활성.
      if (typeof console !== 'undefined') {
        console.log('[Store] submitCard ws.send', {
          textLen: input.text.length,
          imagesCount: input.images?.length ?? 0,
          hasPdf: Boolean(input.pdfDataUrl),
          payloadBytes: json.length,
        });
      }
      activeSocket.send(json);
    } catch (err) {
      if (typeof console !== 'undefined') {
        console.error('[Store] submitCard ws.send failed', err);
      }
      set({ isSubmitting: false, lastError: '카드를 보내지 못했어요. 다시 시도해 주세요.' });
    }
  },

  submitCommentV2: (postId, input) => {
    if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) return;
    try {
      activeSocket.send(
        JSON.stringify({
          type: 'submit-comment-v2',
          sessionToken: get().currentSessionToken,
          postId,
          nickname: input.nickname,
          text: input.text,
          ...(input.images && input.images.length > 0 ? { images: input.images } : {}),
        }),
      );
    } catch {
      // noop
    }
  },

  markSubmitted: () => {
    set({ isSubmitting: false, lastError: undefined });
  },

  // ============ v2.1 Phase D — 학생 자기 카드 수정/삭제 + PIN ============

  setPinHash: (hash, boardKey) => {
    if (typeof window !== 'undefined' && boardKey) {
      try {
        const key = `${PIN_HASH_STORAGE_PREFIX}${boardKey}`;
        if (hash) {
          window.localStorage.setItem(key, hash);
        } else {
          window.localStorage.removeItem(key);
        }
      } catch {
        // noop
      }
    }
    set({ currentPinHash: hash });
  },

  loadPinHash: (boardKey) => {
    if (typeof window === 'undefined' || !boardKey) return undefined;
    try {
      const raw = window.localStorage.getItem(`${PIN_HASH_STORAGE_PREFIX}${boardKey}`);
      const hash = raw && /^[0-9a-f]{64}$/.test(raw) ? raw : undefined;
      if (hash) set({ currentPinHash: hash });
      return hash;
    } catch {
      return undefined;
    }
  },

  clearPinHash: (boardKey) => {
    if (typeof window !== 'undefined' && boardKey) {
      try {
        window.localStorage.removeItem(`${PIN_HASH_STORAGE_PREFIX}${boardKey}`);
      } catch {
        // noop
      }
    }
    set({ currentPinHash: undefined });
  },

  submitOwnCardEdit: (postId, patch) => {
    if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
      set({ lastError: '연결이 끊어졌어요. 새로고침해 주세요' });
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        type: 'submit-edit',
        sessionToken: get().currentSessionToken,
        postId,
      };
      const pinHash = get().currentPinHash;
      if (pinHash) payload['pinHash'] = pinHash;
      if (patch.text !== undefined) payload['text'] = patch.text;
      if (patch.linkUrl !== undefined) payload['linkUrl'] = patch.linkUrl;
      if (patch.images !== undefined) payload['images'] = patch.images;
      if (patch.pdfDataUrl !== undefined) payload['pdfUrl'] = patch.pdfDataUrl;
      if (patch.pdfFilename !== undefined) payload['pdfFilename'] = patch.pdfFilename;
      if (patch.color !== undefined) payload['color'] = patch.color;
      activeSocket.send(JSON.stringify(payload));
    } catch {
      set({ lastError: '카드를 수정하지 못했어요. 다시 시도해 주세요.' });
    }
  },

  submitOwnCardDelete: (postId) => {
    // 회귀 위험 #8 — 클라이언트도 hard delete 패턴 사용 X (배열 삭제 절대 금지)
    // 서버 응답 = post-updated patch: { status: 'hidden-by-author' } 도착 시 자연 placeholder 분기
    if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
      set({ lastError: '연결이 끊어졌어요. 새로고침해 주세요' });
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        type: 'submit-delete',
        sessionToken: get().currentSessionToken,
        postId,
      };
      const pinHash = get().currentPinHash;
      if (pinHash) payload['pinHash'] = pinHash;
      activeSocket.send(JSON.stringify(payload));
    } catch {
      set({ lastError: '카드를 삭제하지 못했어요. 다시 시도해 주세요.' });
    }
  },

  submitPinSet: (hash) => {
    if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) return;
    try {
      activeSocket.send(
        JSON.stringify({
          type: 'submit-pin-set',
          sessionToken: get().currentSessionToken,
          pinHash: hash, // 회귀 위험 #9 — 평문 PIN X
        }),
      );
    } catch {
      // noop
    }
  },

  submitPinVerify: (hash) => {
    if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) return;
    try {
      activeSocket.send(
        JSON.stringify({
          type: 'submit-pin-verify',
          sessionToken: get().currentSessionToken,
          pinHash: hash,
        }),
      );
    } catch {
      // noop
    }
  },

  submitNicknameUpdate: (args) => {
    if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) return;
    if (!args.postId && !args.ownerSessionToken && !args.ownerPinHash) return;
    try {
      activeSocket.send(
        JSON.stringify({
          type: 'update-nickname',
          sessionToken: get().currentSessionToken,
          ...(args.postId ? { postId: args.postId } : {}),
          ...(args.ownerSessionToken ? { ownerSessionToken: args.ownerSessionToken } : {}),
          ...(args.ownerPinHash ? { ownerPinHash: args.ownerPinHash } : {}),
          newNickname: args.newNickname,
        }),
      );
    } catch {
      // noop
    }
  },

  onPinVerifyResult: (callback) => {
    pinVerifyCallbacks.add(callback);
    return () => {
      pinVerifyCallbacks.delete(callback);
    };
  },

  submitOwnCardMove: (postId, position) => {
    // 회귀 위험 #8: hard delete X — 위치 patch만.
    // 디버그 로그(production 유지) — 학교 환경 진단용.
    // eslint-disable-next-line no-console
    console.log('[Store] submitOwnCardMove called', {
      postId,
      position,
      socketReady: activeSocket?.readyState === WebSocket.OPEN,
      socketState: activeSocket?.readyState,
      sessionToken: get().currentSessionToken
        ? `${get().currentSessionToken.slice(0, 8)}...`
        : '(missing)',
      pinHash: get().currentPinHash ? '(set)' : '(none)',
    });
    if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
      // 연결 끊김 — silent (드래그 중 lastError 표시는 UX 오버헤드)
      // eslint-disable-next-line no-console
      console.warn('[Store] submitOwnCardMove aborted: socket not OPEN');
      return;
    }
    if (!position.freeform && !position.kanban) return;

    // 낙관적 업데이트 (UI 즉시 반영 — Plan FR-C7 LWW)
    set((s) => {
      if (!s.board) return s;
      const nextPosts = s.board.posts.map((p) => {
        if (p.id !== postId) return p;
        let nextPost = p;
        if (position.freeform) {
          nextPost = {
            ...nextPost,
            freeform: { ...nextPost.freeform, ...position.freeform },
          };
        }
        if (position.kanban) {
          nextPost = {
            ...nextPost,
            kanban: { ...nextPost.kanban, ...position.kanban },
          };
        }
        return nextPost;
      });
      return { board: { ...s.board, posts: nextPosts } };
    });

    // WebSocket 송신 (v2.1 — pinHash 옵션 포함)
    try {
      const payload: Record<string, unknown> = {
        type: 'submit-move',
        sessionToken: get().currentSessionToken,
        postId,
      };
      const pinHash = get().currentPinHash;
      if (pinHash) payload['pinHash'] = pinHash;
      if (position.freeform) payload['freeform'] = position.freeform;
      if (position.kanban) payload['kanban'] = position.kanban;
      // eslint-disable-next-line no-console
      console.log('[Store] submitOwnCardMove sending', {
        type: 'submit-move',
        postId,
        kanban: payload['kanban'],
        freeform: payload['freeform'],
        hasPinHash: Boolean(payload['pinHash']),
      });
      activeSocket.send(JSON.stringify(payload));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Store] submitOwnCardMove send failed', err);
      // noop — 다음 broadcast 도착 시 자연 reconcile
    }
  },
}));

function scheduleRetry(
  get: () => RealtimeWallSyncState,
  set: (partial: Partial<RealtimeWallSyncState>) => void,
): void {
  if (intentionallyClosed) return;
  const { retryCount } = get();
  if (retryCount >= MAX_RETRIES) {
    set({
      status: 'error',
      lastError: '연결이 끊어졌어요. 새로고침해 주세요',
    });
    return;
  }
  const delay = RETRY_DELAYS_MS[retryCount] ?? 16000;
  set({ status: 'reconnecting', retryCount: retryCount + 1 });
  clearRetryTimer();
  retryTimer = setTimeout(() => {
    if (intentionallyClosed) return;
    if (lastConnectUrl) {
      get().connect(lastConnectUrl);
    }
  }, delay);
}

/**
 * http(s)://host:port → ws(s)://host:port 변환.
 * 이미 ws/wss면 그대로 통과.
 */
function toWebSocketUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol === 'ws:' || url.protocol === 'wss:') {
      return url.toString();
    }
    if (url.protocol === 'http:') {
      url.protocol = 'ws:';
      return url.toString();
    }
    if (url.protocol === 'https:') {
      url.protocol = 'wss:';
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 외부 입력은 신뢰 불가 — 수동 type guard. (클라이언트 측 수신 전용.
 * 클라이언트→서버 송신은 Main의 Zod 스키마로 검증됨 — Design §4.1.)
 *
 * P2 메시지 3종(like-toggled / comment-added / comment-removed) 추가.
 */
function parseServerMessage(obj: Record<string, unknown>): BroadcastableServerMessage | null {
  const type = obj['type'];
  if (typeof type !== 'string') return null;

  switch (type) {
    case 'wall-state': {
      const board = obj['board'];
      if (!board || typeof board !== 'object') return null;
      // 깊은 검증은 서버 신뢰 + 학생 UI는 결국 React escape에 의존.
      return { type: 'wall-state', board: board as WallBoardSnapshotForStudent };
    }
    case 'post-added': {
      const post = obj['post'];
      if (!post || typeof post !== 'object') return null;
      return { type: 'post-added', post: post as never };
    }
    case 'post-updated': {
      const postId = obj['postId'];
      const patch = obj['patch'];
      if (typeof postId !== 'string' || !patch || typeof patch !== 'object') return null;
      return { type: 'post-updated', postId, patch: patch as never };
    }
    case 'post-removed': {
      const postId = obj['postId'];
      if (typeof postId !== 'string') return null;
      return { type: 'post-removed', postId };
    }
    case 'closed':
      return { type: 'closed' };
    case 'error': {
      const message = obj['message'];
      return { type: 'error', message: typeof message === 'string' ? message : '연결 오류' };
    }
    case 'like-toggled': {
      const postId = obj['postId'];
      const likes = obj['likes'];
      const likedBy = obj['likedBy'];
      if (typeof postId !== 'string' || typeof likes !== 'number' || !Array.isArray(likedBy)) {
        return null;
      }
      return {
        type: 'like-toggled',
        postId,
        likes,
        likedBy: likedBy.filter((t): t is string => typeof t === 'string'),
      };
    }
    case 'comment-added': {
      const postId = obj['postId'];
      const comment = obj['comment'];
      if (typeof postId !== 'string' || !comment || typeof comment !== 'object') {
        return null;
      }
      return {
        type: 'comment-added',
        postId,
        comment: comment as RealtimeWallComment,
      };
    }
    case 'comment-removed': {
      const postId = obj['postId'];
      const commentId = obj['commentId'];
      if (typeof postId !== 'string' || typeof commentId !== 'string') return null;
      return { type: 'comment-removed', postId, commentId };
    }
    case 'student-form-locked': {
      const locked = obj['locked'];
      if (typeof locked !== 'boolean') return null;
      return { type: 'student-form-locked', locked };
    }
    // v2.1 (Phase B 도메인 선언, Phase A 활용)
    case 'boardSettings-changed': {
      const settings = obj['settings'];
      if (!settings || typeof settings !== 'object') return null;
      return {
        type: 'boardSettings-changed',
        settings: settings as RealtimeWallBoardSettings,
      };
    }
    // v2.1 (Phase B 도메인 선언, Phase D 활용)
    case 'nickname-changed': {
      const postIds = obj['postIds'];
      const newNickname = obj['newNickname'];
      if (!Array.isArray(postIds) || typeof newNickname !== 'string') return null;
      return {
        type: 'nickname-changed',
        postIds: postIds.filter((id): id is string => typeof id === 'string'),
        newNickname,
      };
    }
    default:
      return null;
  }
}
