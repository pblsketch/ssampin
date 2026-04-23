import type {
  RealtimeWallColumn,
  RealtimeWallFreeformPosition,
  RealtimeWallLayoutMode,
  RealtimeWallLinkPreview,
  RealtimeWallPost,
  WallApprovalMode,
  WallBoard,
  WallBoardId,
  WallPreviewPost,
} from '@domain/entities/RealtimeWall';

export const DEFAULT_REALTIME_WALL_COLUMNS = [
  '생각',
  '질문',
  '정리',
] as const;

export const REALTIME_WALL_MIN_COLUMNS = 2;
export const REALTIME_WALL_MAX_COLUMNS = 6;
export const REALTIME_WALL_MAX_NICKNAME_LENGTH = 20;
export const REALTIME_WALL_MAX_TEXT_LENGTH = 280;

const FREEFORM_COLUMN_COUNT = 3;
const FREEFORM_CARD_WIDTH = 260;
const FREEFORM_CARD_HEIGHT = 180;
const FREEFORM_X_GAP = 32;
const FREEFORM_Y_GAP = 28;
const FREEFORM_START_X = 24;
const FREEFORM_START_Y = 24;

export function buildRealtimeWallColumns(
  titles: readonly string[],
): RealtimeWallColumn[] {
  const normalized = titles
    .map((title) => title.trim())
    .filter((title, index, arr) => title.length > 0 && arr.indexOf(title) === index)
    .slice(0, REALTIME_WALL_MAX_COLUMNS);

  const safeTitles = normalized.length >= REALTIME_WALL_MIN_COLUMNS
    ? normalized
    : [...DEFAULT_REALTIME_WALL_COLUMNS];

  return safeTitles.map((title, index) => ({
    id: `column-${index + 1}`,
    title,
    order: index,
  }));
}

/**
 * YouTube URL에서 videoId(11자 영숫자/_/-)를 추출.
 * 지원 패턴:
 *   - youtube.com/watch?v=XXXX
 *   - youtu.be/XXXX
 *   - youtube.com/shorts/XXXX
 *   - youtube.com/embed/XXXX
 * 외 경로는 undefined.
 */
export function extractYoutubeVideoId(rawUrl: string): string | undefined {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const validIdPattern = /^[A-Za-z0-9_-]{11}$/;

  if (host === 'youtu.be') {
    const id = url.pathname.replace(/^\//, '').split('/')[0];
    return id && validIdPattern.test(id) ? id : undefined;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const segments = url.pathname.split('/').filter(Boolean);
    if (url.pathname === '/watch') {
      const id = url.searchParams.get('v');
      return id && validIdPattern.test(id) ? id : undefined;
    }
    if (
      segments[0] === 'shorts' ||
      segments[0] === 'embed' ||
      segments[0] === 'v' ||
      segments[0] === 'live'
    ) {
      const id = segments[1];
      return id && validIdPattern.test(id) ? id : undefined;
    }
  }

  return undefined;
}

/**
 * 링크를 youtube / webpage 로 1차 분류.
 * webpage의 경우 OG 메타 필드는 인프라가 채워넣음 (도메인 함수는 빈 shell만 반환).
 */
export function classifyRealtimeWallLink(rawUrl: string): RealtimeWallLinkPreview | undefined {
  const videoId = extractYoutubeVideoId(rawUrl);
  if (videoId) {
    return { kind: 'youtube', videoId };
  }

  const normalized = normalizeRealtimeWallLink(rawUrl);
  if (!normalized) return undefined;

  return { kind: 'webpage' };
}

export function normalizeRealtimeWallLink(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

export function createDefaultFreeformPosition(index: number): RealtimeWallFreeformPosition {
  const safeIndex = Math.max(0, index);
  const column = safeIndex % FREEFORM_COLUMN_COUNT;
  const row = Math.floor(safeIndex / FREEFORM_COLUMN_COUNT);

  return {
    x: FREEFORM_START_X + column * (FREEFORM_CARD_WIDTH + FREEFORM_X_GAP),
    y: FREEFORM_START_Y + row * (FREEFORM_CARD_HEIGHT + FREEFORM_Y_GAP),
    w: FREEFORM_CARD_WIDTH,
    h: FREEFORM_CARD_HEIGHT,
    zIndex: safeIndex + 1,
  };
}

export function sortRealtimeWallPostsForBoard(
  posts: readonly RealtimeWallPost[],
): RealtimeWallPost[] {
  return [...posts].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.submittedAt - a.submittedAt;
  });
}

/**
 * 게시물을 승인 상태로 전환하면서 칸반 컬럼 위치와 자유 배치 z-index를
 * 재정렬한다. pending → approved, hidden → approved 전환 모두 동일 규칙.
 *
 * 결정 포인트:
 * - 대상 post의 기존 columnId가 유효하면 유지, 아니면 첫 컬럼으로 fallback.
 * - nextOrder는 같은 컬럼의 approved 카드 개수(자기 자신 제외)로 끝에 추가.
 * - nextZIndex는 전체 post 중 최댓값 + 1 → 최신 승인 카드가 항상 맨 위.
 */
export const REALTIME_WALL_MAX_HEARTS = 999;

/**
 * 학생 제출 raw 입력.
 * `linkUrl`은 정규화되지 않은 원본. 규칙 함수가 normalize + classify를 수행.
 */
export interface RealtimeWallStudentSubmission {
  readonly id: string;
  readonly nickname: string;
  readonly text: string;
  readonly linkUrl?: string;
  readonly submittedAt: number;
}

/**
 * 학생이 방금 제출한 raw 입력으로부터 pending 상태의 RealtimeWallPost를 생성.
 *
 * 책임:
 *   - linkUrl 정규화 + youtube/webpage 분류 (linkPreview 초기 shell)
 *   - 첫 컬럼 id로 kanban position 초기화, order는 같은 컬럼 approved 카드 수
 *   - freeform position은 existingPosts.length 인덱스 기반 3열 그리드
 *
 * 컨테이너는 이 함수 호출 후 webpage 링크에 대해서만 Main fetch를 트리거해
 * 비동기로 linkPreview를 upsert한다.
 */
export function createPendingRealtimeWallPost(
  input: RealtimeWallStudentSubmission,
  existingPosts: readonly RealtimeWallPost[],
  columns: readonly RealtimeWallColumn[],
): RealtimeWallPost {
  const normalizedLink = input.linkUrl ? normalizeRealtimeWallLink(input.linkUrl) : undefined;
  const initialPreview = normalizedLink ? classifyRealtimeWallLink(normalizedLink) : undefined;
  const initialColumnId = columns[0]?.id ?? 'column-1';
  const order = existingPosts.filter(
    (post) => post.status === 'approved' && post.kanban.columnId === initialColumnId,
  ).length;
  const freeform = createDefaultFreeformPosition(existingPosts.length);

  return {
    id: input.id,
    nickname: input.nickname,
    text: input.text,
    ...(normalizedLink ? { linkUrl: normalizedLink } : {}),
    ...(initialPreview ? { linkPreview: initialPreview } : {}),
    status: 'pending',
    pinned: false,
    submittedAt: input.submittedAt,
    kanban: { columnId: initialColumnId, order },
    freeform,
  };
}

/**
 * 특정 post의 status를 'hidden'으로 전환. 다른 필드는 보존.
 */
export function hideRealtimeWallPost(
  posts: readonly RealtimeWallPost[],
  postId: string,
): RealtimeWallPost[] {
  return posts.map((post) => (post.id === postId ? { ...post, status: 'hidden' } : post));
}

/**
 * pinned 상태 토글 + freeform zIndex를 전체 최댓값+1로 승격 (핀된 카드가
 * 앞으로 오도록).
 */
export function togglePinRealtimeWallPost(
  posts: readonly RealtimeWallPost[],
  postId: string,
): RealtimeWallPost[] {
  const nextZIndex =
    posts.reduce((maxZ, post) => Math.max(maxZ, post.freeform.zIndex), 0) + 1;
  return posts.map((post) => {
    if (post.id !== postId) return post;
    return {
      ...post,
      pinned: !post.pinned,
      freeform: {
        ...post.freeform,
        zIndex: nextZIndex,
      },
    };
  });
}

/**
 * 교사 로컬 하트 카운터를 +1 증가. 상한 999.
 * 학생 HTML에는 노출되지 않으며(단계 5 fix 정책), 결과 저장 시 포함되어
 * 복기 화면에서 읽기 전용으로 노출된다.
 */
export function heartRealtimeWallPost(
  posts: readonly RealtimeWallPost[],
  postId: string,
): RealtimeWallPost[] {
  return posts.map((post) => {
    if (post.id !== postId) return post;
    const nextCount = Math.min((post.teacherHearts ?? 0) + 1, REALTIME_WALL_MAX_HEARTS);
    return { ...post, teacherHearts: nextCount };
  });
}

export function approveRealtimeWallPost(
  posts: readonly RealtimeWallPost[],
  postId: string,
  columns: readonly RealtimeWallColumn[],
): RealtimeWallPost[] {
  const targetPost = posts.find((post) => post.id === postId);
  const fallbackColumnId = columns[0]?.id ?? 'column-1';
  const columnId =
    targetPost && columns.some((column) => column.id === targetPost.kanban.columnId)
      ? targetPost.kanban.columnId
      : fallbackColumnId;
  const nextOrder = posts.filter(
    (post) =>
      post.id !== postId &&
      post.status === 'approved' &&
      post.kanban.columnId === columnId,
  ).length;
  const nextZIndex =
    posts.reduce((maxZ, post) => Math.max(maxZ, post.freeform.zIndex), 0) + 1;

  return posts.map((post) => {
    if (post.id !== postId) return post;
    return {
      ...post,
      status: 'approved',
      kanban: {
        columnId,
        order: nextOrder,
      },
      freeform: {
        ...post.freeform,
        zIndex: nextZIndex,
      },
    };
  });
}

// ============================================================
// v1.13 — 영속 보드 (WallBoard) 규칙
// Design §1.1 / §3 / §3.5.1a
// ============================================================

/** 목록 썸네일용 max preview post 수 — Design §3.5.1a */
export const WALL_PREVIEW_POST_MAX = 6;
/** WallPreviewPost.text 최대 길이 — Design §1.1 WallPreviewPost */
export const WALL_PREVIEW_TEXT_MAX = 100;
/** shortCode 길이 (6자 영숫자 대문자) — Design §1.1 */
export const WALL_SHORT_CODE_LENGTH = 6;
/** shortCode 허용 문자 — 혼동 쉬운 0/O/1/I 제외 (교사 공지 편의) */
const WALL_SHORT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * 6자 영숫자 short-code 생성기. 충돌 검사는 호출자(Repository)가 수행.
 *
 * 정책:
 * - 사용 문자: `A-Z` + `2-9` (0/O/1/I 제외) — 학생이 숫자·영문 혼동하지 않도록
 * - 길이: WALL_SHORT_CODE_LENGTH (6자)
 * - `randomSource`: 선택적. 테스트 결정적으로 돌리고 싶을 때 주입.
 *
 * Design §1.1 shortCode 규정.
 */
export function generateWallShortCode(
  randomSource: () => number = Math.random,
): string {
  let code = '';
  for (let i = 0; i < WALL_SHORT_CODE_LENGTH; i++) {
    const idx = Math.floor(randomSource() * WALL_SHORT_CODE_ALPHABET.length);
    code += WALL_SHORT_CODE_ALPHABET[idx];
  }
  return code;
}

/**
 * 충돌 회피를 고려한 short-code 생성. `existingCodes`에 이미 있으면 재시도.
 * 최대 `maxAttempts`번까지 시도 후 실패하면 에러. 알파벳 32^6 ≈ 1e9라
 * 실제 환경에서는 거의 발생 안 함.
 */
export function generateUniqueWallShortCode(
  existingCodes: ReadonlySet<string>,
  randomSource: () => number = Math.random,
  maxAttempts: number = 100,
): string {
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateWallShortCode(randomSource);
    if (!existingCodes.has(code)) return code;
  }
  throw new Error('Failed to generate unique wall short-code');
}

/**
 * posts에서 썸네일용 상위 N개 approved post를 경량 포맷으로 추출.
 *
 * 전략:
 * - approved 상태만 필터 (pending/hidden은 제외)
 * - pinned 우선, 그다음 최신순 (sortRealtimeWallPostsForBoard와 같은 기준)
 * - 상위 `max`개만 WallPreviewPost로 축소
 * - text는 100자 초과 시 말줄임 (WALL_PREVIEW_TEXT_MAX)
 * - kanban/freeform position은 그대로 보존 (썸네일 레이아웃 렌더에 필요)
 *
 * Design §3.5.1a.
 */
export function buildWallPreviewPosts(
  posts: readonly RealtimeWallPost[],
  max: number = WALL_PREVIEW_POST_MAX,
): WallPreviewPost[] {
  const approved = posts.filter((p) => p.status === 'approved');
  const sorted = sortRealtimeWallPostsForBoard(approved);
  return sorted.slice(0, max).map((p) => {
    const text = p.text.length > WALL_PREVIEW_TEXT_MAX
      ? p.text.slice(0, WALL_PREVIEW_TEXT_MAX)
      : p.text;
    const preview: WallPreviewPost = {
      id: p.id,
      nickname: p.nickname,
      text,
      kanban: p.kanban,
      freeform: p.freeform,
    };
    return preview;
  });
}

export interface CreateWallBoardInput {
  readonly id: WallBoardId;
  readonly title: string;
  readonly description?: string;
  readonly layoutMode: RealtimeWallLayoutMode;
  readonly columns: readonly RealtimeWallColumn[];
  readonly approvalMode?: WallApprovalMode;
  readonly shortCode?: string;
  readonly now?: number;
}

/**
 * 새 WallBoard 팩토리.
 *
 * - posts는 항상 빈 배열로 시작
 * - `approvalMode` 기본값 'manual' (초·중등 안전 기본, Design §4.4 기본)
 * - `createdAt === updatedAt === now` (재열기 비교용)
 * - `shortCode` 없으면 undefined 유지 (Repository가 충돌 검사 후 발급)
 *
 * Design §1.1, §6.1(cloneWallBoard는 유사 패턴이지만 별도).
 */
export function createWallBoard(input: CreateWallBoardInput): WallBoard {
  const now = input.now ?? Date.now();
  const title = input.title.trim() || '제목 없는 담벼락';
  return {
    id: input.id,
    title,
    ...(input.description !== undefined ? { description: input.description } : {}),
    layoutMode: input.layoutMode,
    columns: input.columns.map((c) => ({ ...c })), // defensive copy
    approvalMode: input.approvalMode ?? 'manual',
    posts: [],
    createdAt: now,
    updatedAt: now,
    ...(input.shortCode ? { shortCode: input.shortCode } : {}),
  };
}

/**
 * WallBoard → WallBoardMeta 경량 변환. index.json 동기화 및 목록 화면 렌더용.
 *
 * posts는 previewPosts(상위 6개) + count로 축약, 나머지 필드는 shallow copy.
 */
export function toWallBoardMeta(
  board: WallBoard,
): import('@domain/entities/RealtimeWall').WallBoardMeta {
  const approvedCount = board.posts.filter((p) => p.status === 'approved').length;
  return {
    id: board.id,
    title: board.title,
    ...(board.description !== undefined ? { description: board.description } : {}),
    layoutMode: board.layoutMode,
    approvalMode: board.approvalMode,
    postCount: board.posts.length,
    approvedCount,
    createdAt: board.createdAt,
    updatedAt: board.updatedAt,
    ...(board.lastSessionAt !== undefined ? { lastSessionAt: board.lastSessionAt } : {}),
    ...(board.archived !== undefined ? { archived: board.archived } : {}),
    ...(board.shortCode !== undefined ? { shortCode: board.shortCode } : {}),
    previewPosts: buildWallPreviewPosts(board.posts),
  };
}
