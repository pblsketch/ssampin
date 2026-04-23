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
 *
 * v1.13 Stage C: 새 진입점은 `createWallPost(…, approvalMode)`. 이 함수는
 * 호출자 점진 이전을 위한 하위호환 경로로 유지한다 (`'manual'` 모드와 동일).
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

// ============================================================
// v1.13 Stage C — 승인 정책 옵션 (manual/auto/filter)
// Design §4.2, §4.3 참조
// ============================================================

/**
 * 학생 제출을 보드 카드로 생성. 승인 정책에 따라 status와 배치 index를 결정.
 *
 * 책임:
 *   - `'manual'`: 기존 pending 동작. 교사 대기열 노출.
 *   - `'auto'`  : 즉시 approved + kanban.order/freeform.zIndex를
 *                 `approveRealtimeWallPost`와 동일 규칙으로 계산.
 *   - `'filter'`: v1.13.2 구현 예정. 현재는 pending으로 안전 폴백.
 *
 * v1.13.2에서 filter 분기 실제 구현 시 default 케이스의 exhaustive never
 * 방어가 나머지 분기 누락을 컴파일 오류로 강제한다.
 *
 * Design §4.2.
 */
export function createWallPost(
  input: RealtimeWallStudentSubmission,
  existingPosts: readonly RealtimeWallPost[],
  columns: readonly RealtimeWallColumn[],
  approvalMode: WallApprovalMode,
): RealtimeWallPost {
  const pendingPost = createPendingRealtimeWallPost(input, existingPosts, columns);

  switch (approvalMode) {
    case 'manual':
      return pendingPost;
    case 'auto': {
      // 자동 승인: approveRealtimeWallPost와 동일 규칙으로 order/zIndex 계산.
      // 이 post는 아직 existingPosts에 없으므로 직접 계산한다.
      const columnId = pendingPost.kanban.columnId;
      const nextOrder = existingPosts.filter(
        (post) => post.status === 'approved' && post.kanban.columnId === columnId,
      ).length;
      const nextZIndex =
        existingPosts.reduce((maxZ, post) => Math.max(maxZ, post.freeform.zIndex), 0) + 1;
      return {
        ...pendingPost,
        status: 'approved',
        kanban: { columnId, order: nextOrder },
        freeform: { ...pendingPost.freeform, zIndex: nextZIndex },
      };
    }
    case 'filter':
      // v1.13.2 스텁. 현재는 안전하게 pending 폴백.
      return pendingPost;
    default: {
      const _exhaustive: never = approvalMode;
      throw new Error(`Unknown approvalMode: ${String(_exhaustive)}`);
    }
  }
}

/**
 * 모든 pending 카드를 일괄 승인. manual → auto 전환 시 기존 대기열 소화용.
 *
 * 전략:
 *   - pending이 아닌 카드(approved/hidden)는 원본 순서·상태 보존
 *   - pending 카드에 순차적으로 `approveRealtimeWallPost`를 적용 (각 승인이
 *     이전 승인 결과를 반영한 order/zIndex를 계산하도록 누적)
 *
 * 반환된 배열은 입력과 동일한 카드 순서를 유지한다 (id 순서 불변).
 *
 * Design §4.3.
 */
export function bulkApproveWallPosts(
  posts: readonly RealtimeWallPost[],
  columns: readonly RealtimeWallColumn[],
): RealtimeWallPost[] {
  const pendingIds = posts.filter((p) => p.status === 'pending').map((p) => p.id);
  let current: RealtimeWallPost[] = [...posts];
  for (const id of pendingIds) {
    current = approveRealtimeWallPost(current, id, columns);
  }
  return current;
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

// ============================================================
// v1.13 Stage B — 칸반 컬럼 실행 중 편집 규칙
// Design §5.1 참조
// ============================================================

/**
 * 새 컬럼 생성용 고유 id 생성. 기존 column id와 충돌 방지.
 *
 * 기존 "column-N" 패턴의 최댓값 +1을 시도한 뒤, 만약 같은 id가 이미 있으면
 * (수동 편집 등으로 인한 엣지) 뒤에 random suffix를 붙여 재시도.
 */
function nextColumnId(existing: readonly RealtimeWallColumn[]): string {
  let maxNum = 0;
  for (const c of existing) {
    const match = /^column-(\d+)$/.exec(c.id);
    if (match && match[1]) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > maxNum) maxNum = n;
    }
  }
  const candidate = `column-${maxNum + 1}`;
  if (!existing.some((c) => c.id === candidate)) return candidate;
  // 극단 엣지: 사용자가 "column-5" 같은 id를 수동 생성해 gap이 꼬인 경우.
  return `column-${maxNum + 1}-${Date.now().toString(36)}`;
}

/**
 * 컬럼 order 필드를 0..n-1로 재계산. columns 배열 순서 기준.
 *
 * 삽입·삭제·재배치 후 항상 이 함수로 order를 일관화한다.
 */
function normalizeColumnOrder(
  columns: readonly RealtimeWallColumn[],
): RealtimeWallColumn[] {
  return columns.map((c, index) => ({ ...c, order: index }));
}

/**
 * 컬럼 추가. 상한 REALTIME_WALL_MAX_COLUMNS(=6) 초과 시 원본 반환.
 *
 * - 빈/공백 제목은 거부 → 원본 반환
 * - 새 컬럼은 배열 끝에 추가 + order 재계산
 * - id 충돌 없도록 nextColumnId로 발급
 *
 * Design §5.1.
 */
export function addWallColumn(
  columns: readonly RealtimeWallColumn[],
  title: string,
): RealtimeWallColumn[] {
  const trimmed = title.trim();
  if (trimmed.length === 0) return [...columns];
  if (columns.length >= REALTIME_WALL_MAX_COLUMNS) return [...columns];
  const id = nextColumnId(columns);
  return normalizeColumnOrder([
    ...columns,
    { id, title: trimmed, order: columns.length },
  ]);
}

/**
 * 컬럼 이름 변경. 빈/공백 제목은 거부 → 원본 반환.
 * 존재하지 않는 columnId는 불변 (원본 반환).
 *
 * Design §5.1.
 */
export function renameWallColumn(
  columns: readonly RealtimeWallColumn[],
  columnId: string,
  newTitle: string,
): RealtimeWallColumn[] {
  const trimmed = newTitle.trim();
  if (trimmed.length === 0) return [...columns];
  if (!columns.some((c) => c.id === columnId)) return [...columns];
  return columns.map((c) => (c.id === columnId ? { ...c, title: trimmed } : c));
}

/**
 * 컬럼 순서 재배치. fromIndex → toIndex로 이동한 뒤 order 0..n-1 재계산.
 *
 * - 인덱스 범위 벗어나면 원본 반환
 * - fromIndex === toIndex 는 no-op (order는 이미 정상일 것이므로 그대로 반환)
 *
 * Design §5.1.
 */
export function reorderWallColumns(
  columns: readonly RealtimeWallColumn[],
  fromIndex: number,
  toIndex: number,
): RealtimeWallColumn[] {
  if (fromIndex < 0 || fromIndex >= columns.length) return [...columns];
  if (toIndex < 0 || toIndex >= columns.length) return [...columns];
  if (fromIndex === toIndex) return [...columns];
  const arr = [...columns];
  const [moved] = arr.splice(fromIndex, 1);
  if (!moved) return [...columns];
  arr.splice(toIndex, 0, moved);
  return normalizeColumnOrder(arr);
}

/**
 * removeWallColumn 삭제 전략.
 *
 * - `move-to`: 삭제 컬럼의 카드를 `targetColumnId` 뒤로 append.
 *              기존 target의 approved 카드 수를 시작 order로 +1씩 부여.
 *              targetColumnId가 삭제 대상과 같거나 존재하지 않으면
 *              첫 남은 컬럼으로 fallback.
 * - `hide`:    카드 status='hidden'으로 일괄 전환, 컬럼만 제거.
 *              hidden 카드는 컬럼 소속이 무의미하지만 columnId는 보존
 *              (복구 시 원래 columnId를 살릴 수 있도록).
 * - `delete`:  해당 컬럼 카드를 posts 배열에서 영구 제거.
 */
export type RemoveColumnStrategy =
  | { readonly kind: 'move-to'; readonly targetColumnId: string }
  | { readonly kind: 'hide' }
  | { readonly kind: 'delete' };

/**
 * 컬럼 삭제 + 안의 카드 migration.
 *
 * 제약:
 *   - 최소 REALTIME_WALL_MIN_COLUMNS(=2) 컬럼 유지. 2개 중 삭제 시도 시 원본 반환.
 *   - 존재하지 않는 columnId는 원본 반환.
 *   - move-to에서 targetColumnId가 삭제 대상 또는 없으면 첫 남은 컬럼으로 fallback.
 *
 * 모든 전략에서 columns의 order 필드는 0..n-1로 재계산된다.
 *
 * Design §5.1.
 */
export function removeWallColumn(
  columns: readonly RealtimeWallColumn[],
  posts: readonly RealtimeWallPost[],
  columnId: string,
  strategy: RemoveColumnStrategy,
): { columns: RealtimeWallColumn[]; posts: RealtimeWallPost[] } {
  // 가드: 최소 컬럼 수 유지
  if (columns.length <= REALTIME_WALL_MIN_COLUMNS) {
    return { columns: [...columns], posts: [...posts] };
  }
  // 가드: 존재하지 않는 컬럼
  if (!columns.some((c) => c.id === columnId)) {
    return { columns: [...columns], posts: [...posts] };
  }

  const remainingColumns = normalizeColumnOrder(
    columns.filter((c) => c.id !== columnId),
  );

  switch (strategy.kind) {
    case 'move-to': {
      // target 해석: 삭제 대상과 같거나 존재하지 않으면 첫 남은 컬럼 fallback.
      const explicit = strategy.targetColumnId;
      const fallback = remainingColumns[0]?.id;
      if (!fallback) {
        // 이 분기는 최소 2컬럼 가드 덕에 도달 불가지만 타입 안전 위해.
        return { columns: [...columns], posts: [...posts] };
      }
      const targetId =
        explicit !== columnId && remainingColumns.some((c) => c.id === explicit)
          ? explicit
          : fallback;

      // target 컬럼의 기존 approved 카드 수를 시작 order로 +1씩 부여.
      // approveRealtimeWallPost와 동일 규칙으로 append.
      const startOrder = posts.filter(
        (p) => p.status === 'approved' && p.kanban.columnId === targetId,
      ).length;

      let appendIndex = 0;
      const nextPosts = posts.map((p) => {
        if (p.kanban.columnId !== columnId) return p;
        const order = startOrder + appendIndex;
        appendIndex++;
        return {
          ...p,
          kanban: {
            columnId: targetId,
            order,
          },
        };
      });

      return { columns: remainingColumns, posts: nextPosts };
    }
    case 'hide': {
      const nextPosts = posts.map((p) =>
        p.kanban.columnId === columnId ? { ...p, status: 'hidden' as const } : p,
      );
      return { columns: remainingColumns, posts: nextPosts };
    }
    case 'delete': {
      const nextPosts = posts.filter((p) => p.kanban.columnId !== columnId);
      return { columns: remainingColumns, posts: nextPosts };
    }
    default: {
      const _exhaustive: never = strategy;
      throw new Error(`Unknown removeWallColumn strategy: ${String(_exhaustive)}`);
    }
  }
}

