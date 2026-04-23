import type {
  RealtimeWallColumn,
  RealtimeWallFreeformPosition,
  RealtimeWallPost,
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
