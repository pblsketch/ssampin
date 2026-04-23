import type {
  RealtimeWallColumn,
  RealtimeWallFreeformPosition,
  RealtimeWallLinkPreview,
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
export const REALTIME_WALL_MAX_LIKES = 999;

/**
 * 교사 로컬 좋아요 카운터를 +1 증가. 상한 999.
 * 학생 HTML에는 노출되지 않으며(단계 5 fix 정책), 결과 저장 시 포함되어
 * 복기 화면에서 읽기 전용으로 노출된다.
 */
export function likeRealtimeWallPost(
  posts: readonly RealtimeWallPost[],
  postId: string,
): RealtimeWallPost[] {
  return posts.map((post) => {
    if (post.id !== postId) return post;
    const nextCount = Math.min((post.likes ?? 0) + 1, REALTIME_WALL_MAX_LIKES);
    return { ...post, likes: nextCount };
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
