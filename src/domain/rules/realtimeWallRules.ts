import type {
  RealtimeWallCardColor,
  RealtimeWallColumn,
  RealtimeWallComment,
  RealtimeWallFreeformPosition,
  RealtimeWallLayoutMode,
  RealtimeWallLinkPreview,
  RealtimeWallPost,
  StudentCommentInput,
  WallApprovalMode,
  WallBoard,
  WallBoardId,
  WallPreviewPost,
} from '@domain/entities/RealtimeWall';
import {
  DEFAULT_REALTIME_WALL_BOARD_SETTINGS,
  REALTIME_WALL_BOARD_SETTINGS_VERSION,
  type RealtimeWallBoardSettings,
  type RealtimeWallModerationMode,
} from '@domain/entities/RealtimeWallBoardSettings';
import {
  normalizeWallBoardTheme,
  type WallBoardTheme,
} from '@domain/entities/RealtimeWallBoardTheme';

export const DEFAULT_REALTIME_WALL_COLUMNS = [
  '생각',
  '질문',
  '정리',
] as const;

export const REALTIME_WALL_MIN_COLUMNS = 2;
/**
 * 2026-04-26 사용자 피드백 (결함 #2) — 컬럼 무제한 + 가로 스크롤 정책 전환.
 *   기존: 6 (한 화면 fit). 사용자 요청 "무제한 컬럼".
 *   현재: 50 (사실상 무제한 — 한 수업 1~2시간에 50개 이상 만들 일 없음).
 *   하드 캡을 완전히 없애지 않은 이유:
 *     - 컬럼 ID(`column-N`) 발급·정렬·렌더링·파일 직렬화 안전 상한.
 *     - 우발적 무한 추가(키보드 매크로 등)로부터 시스템 보호.
 *   화면당 컬럼 5~6개만 fit되며 6개 초과는 RealtimeWallKanbanBoard 부모 wrapper의
 *   overflow-x-auto + 컬럼별 min-w-[280px]로 자연 가로 스크롤.
 */
export const REALTIME_WALL_MAX_COLUMNS = 50;
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
 *
 * v2.1 student-ux 신규:
 *   - columnId? — Kanban 컬럼별 + 버튼으로 진입 시 학생이 선택한 columnId (Padlet 패턴).
 *     미지정 시 첫 컬럼 default. 검증된 columnId여야 함 (없으면 fallback).
 *
 * v2.1 student-ux 회귀 fix (2026-04-24): images/pdfUrl/pdfFilename/color/ownerSessionToken/
 * studentPinHash 신규 — 이전에는 createWallPost가 이 필드를 통과시키지 않아 학생이 첨부한
 * 이미지/PDF/색상/소유 식별자가 모두 유실되었음 (renderer 측 onRealtimeWallStudentSubmitted
 * 핸들러가 input에서 제외). 도메인 entity는 모두 optional 필드로 이미 지원.
 */
export interface RealtimeWallStudentSubmission {
  readonly id: string;
  readonly nickname: string;
  readonly text: string;
  readonly linkUrl?: string;
  readonly submittedAt: number;
  readonly columnId?: string;
  /** v2.1 — 카드당 최대 5장 base64 data URL */
  readonly images?: readonly string[];
  /** v2.1 — PDF (서버가 file:// URL로 변환 후 전달) */
  readonly pdfUrl?: string;
  readonly pdfFilename?: string;
  /** v2.1 — 카드 색상 8색 */
  readonly color?: RealtimeWallCardColor;
  /** v2.1 — 작성한 학생의 sessionToken (Phase D/C 활용 — 본인 카드 매칭) */
  readonly ownerSessionToken?: string;
  /** v2.1 — 학생 PIN의 SHA-256 hash (Phase D 활용) */
  readonly studentPinHash?: string;
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
  // v2.1 student-ux — Padlet 컬럼별 + 버튼: input.columnId가 columns에 존재하면 우선 사용, 아니면 첫 컬럼 fallback.
  const requestedColumnId = input.columnId;
  const requestedColumnExists = requestedColumnId
    ? columns.some((c) => c.id === requestedColumnId)
    : false;
  const initialColumnId = requestedColumnExists
    ? (requestedColumnId as string)
    : (columns[0]?.id ?? 'column-1');
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
    // v2.1 — student-ux 회귀 fix (2026-04-24): images/pdf/color/owner/pinHash 통과.
    // 이전에는 모두 누락되어 학생 첨부물이 카드 표시 단계에서 사라졌음 (Bug B 본질).
    ...(input.images && input.images.length > 0 ? { images: input.images } : {}),
    ...(input.pdfUrl ? { pdfUrl: input.pdfUrl } : {}),
    ...(input.pdfFilename ? { pdfFilename: input.pdfFilename } : {}),
    ...(input.color ? { color: input.color } : {}),
    ...(input.ownerSessionToken ? { ownerSessionToken: input.ownerSessionToken } : {}),
    ...(input.studentPinHash ? { studentPinHash: input.studentPinHash } : {}),
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
 * - `approvalMode` 기본값 'auto' (v2.1 student-ux — Padlet 기본 정합 / Plan §7.2 결정 #4
 *    "moderation OFF 프리셋 v2 포함" / DEFAULT_REALTIME_WALL_BOARD_SETTINGS.moderation='off' ↔ approvalMode='auto')
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
    approvalMode: input.approvalMode ?? 'auto',
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
 * 컬럼 추가. 상한 REALTIME_WALL_MAX_COLUMNS(=50, 사실상 무제한) 초과 시 원본 반환.
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

// ============================================================
// v1.13 Stage D — 보드 복제 규칙
// Design §6.1 참조
// ============================================================

export interface CloneWallBoardOptions {
  readonly titleSuffix?: string;
  readonly shortCode?: string;
}

/**
 * 새 WallBoard를 source 기반으로 생성.
 *
 * 복제 정책 (Design §6.1):
 *   - 제목: `{source.title} (복제)` — options.titleSuffix로 커스터마이즈 가능
 *   - id: newId (호출자가 생성)
 *   - createdAt = updatedAt = now
 *   - layoutMode / approvalMode / description: 동일 복사
 *   - columns: deep clone (원본 수정이 복제본에 영향 없음)
 *   - **posts: 빈 배열** (학생 데이터 제외 — PIPA 준수, 새 보드로 시작)
 *   - lastSessionAt: undefined (아직 세션 없음)
 *   - archived: false
 *   - shortCode: options.shortCode로 주입. 미주입 시 undefined
 *                (Repository가 충돌 검사 후 발급하는 패턴을 따라감)
 */
export function cloneWallBoard(
  source: WallBoard,
  newId: WallBoardId,
  now: number,
  options?: CloneWallBoardOptions,
): WallBoard {
  const suffix = options?.titleSuffix ?? ' (복제)';
  const nextTitle = source.title + suffix;
  const cloned: WallBoard = {
    id: newId,
    title: nextTitle,
    ...(source.description !== undefined ? { description: source.description } : {}),
    layoutMode: source.layoutMode,
    columns: source.columns.map((c) => ({ ...c })), // deep clone
    approvalMode: source.approvalMode,
    posts: [], // 빈 배열 — 학생 데이터 제외
    createdAt: now,
    updatedAt: now,
    archived: false,
    ...(options?.shortCode ? { shortCode: options.shortCode } : {}),
  };
  return cloned;
}

// ============================================================
// v1.14 Phase P2 — 패들렛 모드 (학생 좋아요·댓글)
// Design §3 도메인 규칙 5종
// ============================================================

/** 한 카드에 누적 가능한 최대 좋아요 수 (UI 표시 "+1000" 경계). */
export const REALTIME_WALL_MAX_LIKED_BY = 1000;
/** 카드당 댓글 최대 개수 (hidden 포함 배열 크기). */
export const REALTIME_WALL_MAX_COMMENTS_PER_POST = 50;
/** 댓글 본문 최대 길이. */
export const REALTIME_WALL_COMMENT_MAX_TEXT_LENGTH = 200;
/** 댓글 닉네임 최대 길이 — 카드 닉네임과 동일 정책. */
export const REALTIME_WALL_COMMENT_MAX_NICKNAME_LENGTH = 20;

/**
 * 학생 좋아요 토글 — Design §3.1.
 *
 * 동작:
 *   - `likedBy`에 sessionToken 있으면 제거 + likes -1 (unlike)
 *   - 없으면 추가 + likes +1 (like)
 *   - `likedBy` 크기가 {@link REALTIME_WALL_MAX_LIKED_BY}에 도달 시
 *     가장 오래된(배열 앞쪽) 항목을 drop한 뒤 새 토큰을 append
 *   - likes는 max(0, ...) — 음수 방지
 *
 * 순수 함수 — 입력 불변, 새 객체 반환. postId가 일치해야 호출된다
 * (caller는 단일 post를 넘긴다 — 전체 배열 순회는 caller 측에서).
 *
 * @param post 대상 카드
 * @param sessionToken 학생 브라우저 토큰
 * @returns 변경된 post (likes/likedBy 필드만 갱신). 기타 필드는 그대로.
 */
export function toggleStudentLike(
  post: RealtimeWallPost,
  sessionToken: string,
): RealtimeWallPost {
  const currentLikedBy = post.likedBy ?? [];
  const currentLikes = post.likes ?? 0;
  const alreadyLiked = currentLikedBy.includes(sessionToken);

  if (alreadyLiked) {
    // Unlike
    const nextLikedBy = currentLikedBy.filter((t) => t !== sessionToken);
    const nextLikes = Math.max(0, currentLikes - 1);
    return { ...post, likes: nextLikes, likedBy: nextLikedBy };
  }

  // Like — 1000 cap에 도달하면 가장 오래된 항목부터 drop하며 새 토큰 append
  let nextLikedBy: readonly string[];
  if (currentLikedBy.length >= REALTIME_WALL_MAX_LIKED_BY) {
    const overflow = currentLikedBy.length - REALTIME_WALL_MAX_LIKED_BY + 1;
    nextLikedBy = [...currentLikedBy.slice(overflow), sessionToken];
  } else {
    nextLikedBy = [...currentLikedBy, sessionToken];
  }
  // likes는 nextLikedBy.length로 재계산 — 일관성 유지 (drop된 만큼 감소 반영).
  const nextLikes = nextLikedBy.length;
  return { ...post, likes: nextLikes, likedBy: nextLikedBy };
}

/**
 * 학생 댓글 추가 — Design §3.2.
 *
 * 동작:
 *   - input.nickname/text는 trim + 길이 상한 truncate
 *   - comments 크기가 {@link REALTIME_WALL_MAX_COMMENTS_PER_POST}에 도달 시
 *     **추가 거부 — 원본 post 그대로 반환** (caller는 에러 처리)
 *   - trim 후 빈 문자열 input (nickname/text 중 하나라도)는 원본 반환
 *   - id/submittedAt/status는 caller가 주입한 값을 보장 (id 테스트 결정성)
 *
 * 순수 함수 — 호출자는 id(UUID)와 now(Date.now())를 외부에서 주입한다.
 *
 * @param post 대상 카드
 * @param input { nickname, text, sessionToken }
 * @param id 댓글 UUID (서버 측 generateUUID)
 * @param now Date.now() (테스트 결정성)
 * @returns 변경된 post (comments에 신규 댓글 append)
 */
export function addStudentComment(
  post: RealtimeWallPost,
  input: StudentCommentInput,
  id: string,
  now: number,
): RealtimeWallPost {
  const trimmedNickname = input.nickname
    .trim()
    .slice(0, REALTIME_WALL_COMMENT_MAX_NICKNAME_LENGTH);
  const trimmedText = input.text.trim().slice(0, REALTIME_WALL_COMMENT_MAX_TEXT_LENGTH);
  if (trimmedNickname.length === 0) return post;
  if (trimmedText.length === 0) return post;

  const currentComments = post.comments ?? [];
  if (currentComments.length >= REALTIME_WALL_MAX_COMMENTS_PER_POST) {
    return post;
  }

  const newComment: RealtimeWallComment = {
    id,
    nickname: trimmedNickname,
    text: trimmedText,
    submittedAt: now,
    sessionToken: input.sessionToken,
    status: 'approved',
  };
  return { ...post, comments: [...currentComments, newComment] };
}

/**
 * 교사의 댓글 삭제 — Design §3.3.
 *
 * 실제 배열에서 제거하지 않고 해당 댓글의 status를 'hidden'으로 전환
 * (인덱스 보존 + 복구 여지). commentId 미존재 시 원본 그대로 반환.
 * 이미 'hidden' 상태인 댓글도 idempotent (두 번 호출해도 동일).
 */
export function removeStudentComment(
  post: RealtimeWallPost,
  commentId: string,
): RealtimeWallPost {
  const currentComments = post.comments ?? [];
  const idx = currentComments.findIndex((c) => c.id === commentId);
  if (idx === -1) return post;
  const nextComments = currentComments.map((c) =>
    c.id === commentId ? { ...c, status: 'hidden' as const } : c,
  );
  return { ...post, comments: nextComments };
}

/**
 * v1.13 → v1.14 Post 마이그레이션 — Design §3.4.
 *
 * likes/likedBy/comments가 undefined면 각각 0/[]/[]을 주입해 이후 규칙 호출이
 * nullish 분기를 신경쓰지 않도록 한다. 기존 필드는 건드리지 않는다.
 *
 * v1.13 저장 파일 로드 직후 일괄 적용 — JsonWallBoardRepository.load() +
 * electron/ipc/realtimeWallBoard.ts readBoardSync().
 */
export function normalizePostForPadletMode(
  post: RealtimeWallPost,
): RealtimeWallPost {
  return {
    ...post,
    likes: post.likes ?? 0,
    likedBy: post.likedBy ?? [],
    comments: post.comments ?? [],
  };
}

/**
 * v1.13 → v1.14 Board 마이그레이션 — Design §3.4.
 *
 * board.posts 각 post에 normalizePostForPadletMode 적용.
 * WallBoard 외에도 posts 필드를 가진 어떤 객체든 동일 처리 (generic).
 */
export function normalizeBoardForPadletMode<
  T extends { readonly posts: readonly RealtimeWallPost[] },
>(board: T): T {
  return {
    ...board,
    posts: board.posts.map(normalizePostForPadletMode),
  };
}

// ============================================================
// v1.15.x Phase B — 패들렛 모드 v2.1 (학생 UX 정교화)
// Design v2.1 §2 / §3 / §3.5 / §3.6 / §3.7
// ============================================================

/**
 * v2.1 — 카드 색상 8색 union (RealtimeWallCardColor와 동일).
 * 도메인/서버 검증 시 enum 강제용.
 */
export const REALTIME_WALL_CARD_COLORS = [
  'yellow',
  'pink',
  'blue',
  'green',
  'purple',
  'orange',
  'gray',
  'white',
] as const satisfies readonly RealtimeWallCardColor[];

/**
 * v2.1 — 카드당 최대 이미지 장수 (Plan FR-B2).
 *
 * v2.1 student-ux 회귀 fix (2026-04-24): 3 → 5장. 사용자 요청 — 활동 사진 5장 모음 등
 * 학생 1인이 한 카드에 다중 이미지 첨부 케이스 증가.
 */
export const REALTIME_WALL_MAX_IMAGES_PER_POST = 5;

/**
 * v2.1 — 카드 합계 이미지 raw bytes 한도 (Plan FR-B2).
 *
 * v2.1 student-ux 회귀 fix (2026-04-24): 5MB → 15MB. 5장 × 평균 3MB 환산. base64 인코딩 후
 * ~20MB → WebSocket maxPayload 20MB로 매칭 (electron/ipc/realtimeWall.ts).
 */
export const REALTIME_WALL_MAX_IMAGES_TOTAL_BYTES = 15 * 1024 * 1024;

/**
 * v2.1 — 단일 이미지 raw bytes 한도.
 *
 * v2.1 student-ux 회귀 fix (2026-04-24): 5MB → 10MB. 사용자 요청.
 */
export const REALTIME_WALL_MAX_SINGLE_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * v2.1 — PDF 한도 (Plan FR-B4). 10MB.
 */
export const REALTIME_WALL_MAX_PDF_BYTES = 10 * 1024 * 1024;

/**
 * v2.1 — 댓글 이미지 최대 장수 (Plan FR-B12).
 */
export const REALTIME_WALL_MAX_COMMENT_IMAGES = 1;

/**
 * v2.1 — 카드 본문 최대 길이 (v1.14의 280자 → 1000자, Plan FR-B5).
 * 마크다운 raw text 기준.
 *
 * 단 기존 `REALTIME_WALL_MAX_TEXT_LENGTH=280`은 호환을 위해 유지.
 * v2.1 신규 코드는 `REALTIME_WALL_MAX_TEXT_LENGTH_V2`를 사용.
 */
export const REALTIME_WALL_MAX_TEXT_LENGTH_V2 = 1000;

/**
 * v2.1 — data URL approximate raw bytes 계산.
 * base64 길이 ≈ raw bytes * 4/3 + padding.
 * @param dataUrl `data:image/png;base64,XXXX...`
 * @returns 추정 raw bytes (정확값 아님 — 사전 차단용)
 */
function approximateRawBytesFromDataUrl(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return 0;
  const base64Len = dataUrl.length - commaIdx - 1;
  const padding =
    dataUrl.endsWith('==')
      ? 2
      : dataUrl.endsWith('=')
        ? 1
        : 0;
  return Math.floor((base64Len * 3) / 4) - padding;
}

/**
 * v2.1 — 단일 이미지 data URL 검증 결과 — Design §3.5.
 */
export type ImageValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'too-large'
        | 'invalid-format'
        | 'svg-not-allowed'
        | 'magic-byte-mismatch'
        | 'invalid-data-url';
    };

/**
 * v2.1 — 단일 이미지 data URL 검증 (Design §3.5).
 *
 * 검증 순서:
 *   1. data URL prefix 검증 (`data:image/...;base64,`)
 *   2. SVG 명시 차단 (XSS — script 태그 가능성)
 *   3. mime type 화이트리스트: png/jpeg/gif/webp만
 *   4. base64 → bytes 변환 시 size 5MB 한도
 *   5. magic byte 검증 (PNG/JPEG/GIF/WebP 매칭)
 *
 * Node.js + 브라우저 모두 동작 (atob/Buffer 분기).
 */
export function validateImageDataUrl(dataUrl: string): ImageValidationResult {
  if (typeof dataUrl !== 'string' || dataUrl.length === 0) {
    return { ok: false, reason: 'invalid-data-url' };
  }
  // 1. prefix
  const dataUrlMatch = /^data:(image\/[a-z+\-.]+);base64,/i.exec(dataUrl);
  if (!dataUrlMatch || !dataUrlMatch[1]) {
    return { ok: false, reason: 'invalid-data-url' };
  }
  const mime = dataUrlMatch[1].toLowerCase();

  // 2. SVG 차단
  if (mime === 'image/svg+xml' || mime === 'image/svg') {
    return { ok: false, reason: 'svg-not-allowed' };
  }

  // 3. mime 화이트리스트
  const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
  if (!ALLOWED_MIMES.includes(mime)) {
    return { ok: false, reason: 'invalid-format' };
  }

  // 4. size
  const rawBytes = approximateRawBytesFromDataUrl(dataUrl);
  if (rawBytes > REALTIME_WALL_MAX_SINGLE_IMAGE_BYTES) {
    return { ok: false, reason: 'too-large' };
  }

  // 5. magic byte (앞 12바이트만 디코드)
  const headBytes = decodeBase64Head(dataUrl);
  if (headBytes === null) {
    return { ok: false, reason: 'invalid-data-url' };
  }
  if (!matchesImageMagicByte(mime, headBytes)) {
    return { ok: false, reason: 'magic-byte-mismatch' };
  }

  return { ok: true };
}

/**
 * data URL의 base64 데이터 앞 12바이트만 Uint8Array로 디코드.
 * Node.js + 브라우저 모두 동작.
 */
function decodeBase64Head(dataUrl: string): Uint8Array | null {
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return null;
  const head = dataUrl.slice(commaIdx + 1, commaIdx + 1 + 16); // 16 base64 chars ≈ 12 bytes
  try {
    if (typeof atob !== 'undefined') {
      const binary = atob(head);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }
    // Node fallback
    if (typeof Buffer !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return new Uint8Array(Buffer.from(head, 'base64'));
    }
  } catch {
    return null;
  }
  return null;
}

function matchesImageMagicByte(mime: string, head: Uint8Array): boolean {
  if (head.length < 4) return false;
  // PNG: 89 50 4E 47
  if (mime === 'image/png') {
    return head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  }
  // JPEG: FF D8 FF
  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  }
  // GIF: 47 49 46 38 (GIF8)
  if (mime === 'image/gif') {
    return head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x38;
  }
  // WebP: RIFF .... WEBP (52 49 46 46 ?? ?? ?? ?? 57 45 42 50)
  if (mime === 'image/webp') {
    if (head.length < 12) return false;
    const isRiff = head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46;
    const isWebp = head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50;
    return isRiff && isWebp;
  }
  return false;
}

/**
 * v2.1 — 이미지 다중 배열 검증 결과.
 */
export type ImagesArrayValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'too-many-images'
        | 'total-too-large'
        | 'too-large'
        | 'invalid-format'
        | 'svg-not-allowed'
        | 'magic-byte-mismatch'
        | 'invalid-data-url';
      index?: number;
    };

/**
 * v2.1 — 이미지 다중 배열 검증 (Design §3.5).
 *
 * - 최대 3장 (Plan FR-B2)
 * - 카드 합계 5MB
 * - 각 이미지 validateImageDataUrl 통과
 * - 빈 배열은 ok (이미지 미첨부 = 정상)
 */
export function validateImages(
  images: readonly string[],
  options: { maxImages?: number; maxTotalBytes?: number } = {},
): ImagesArrayValidationResult {
  const maxImages = options.maxImages ?? REALTIME_WALL_MAX_IMAGES_PER_POST;
  const maxTotalBytes = options.maxTotalBytes ?? REALTIME_WALL_MAX_IMAGES_TOTAL_BYTES;

  if (images.length > maxImages) {
    return { ok: false, reason: 'too-many-images' };
  }

  let totalBytes = 0;
  for (let i = 0; i < images.length; i++) {
    const dataUrl = images[i];
    if (typeof dataUrl !== 'string') {
      return { ok: false, reason: 'invalid-data-url', index: i };
    }
    const single = validateImageDataUrl(dataUrl);
    if (!single.ok) {
      return { ok: false, reason: single.reason, index: i };
    }
    totalBytes += approximateRawBytesFromDataUrl(dataUrl);
  }
  if (totalBytes > maxTotalBytes) {
    return { ok: false, reason: 'total-too-large' };
  }
  return { ok: true };
}

/**
 * v2.1 — PDF 검증 결과 (Design §3.6).
 */
export type PdfValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'too-large' | 'invalid-format' | 'magic-byte-mismatch' | 'invalid-url';
    };

/**
 * v2.1 — PDF 첨부 검증 (Design §3.6).
 *
 * - magic byte `%PDF-` (25 50 44 46 2D) 검증
 * - max 10MB (Plan FR-B4)
 * - svg/script/exe magic byte 거부
 * - file:// URL 형식 검증 (외부 URL 거부)
 *
 * @param pdfBytes 파일 raw bytes (Main 프로세스에서 검증)
 * @param pdfUrl   서버가 발급한 file:// URL (검증)
 */
export function validatePdf(
  pdfBytes: Uint8Array,
  pdfUrl: string,
): PdfValidationResult {
  // URL 형식 (file:// 만 허용)
  if (typeof pdfUrl !== 'string' || !pdfUrl.startsWith('file://')) {
    return { ok: false, reason: 'invalid-url' };
  }
  // size
  if (pdfBytes.length > REALTIME_WALL_MAX_PDF_BYTES) {
    return { ok: false, reason: 'too-large' };
  }
  if (pdfBytes.length < 5) {
    return { ok: false, reason: 'magic-byte-mismatch' };
  }
  // magic byte: %PDF-
  if (
    pdfBytes[0] !== 0x25 ||
    pdfBytes[1] !== 0x50 ||
    pdfBytes[2] !== 0x44 ||
    pdfBytes[3] !== 0x46 ||
    pdfBytes[4] !== 0x2d
  ) {
    return { ok: false, reason: 'magic-byte-mismatch' };
  }
  return { ok: true };
}

/**
 * v2.1 — 보드 설정 검증 결과 (Design §3.7).
 */
export type BoardSettingsValidationResult =
  | { ok: true }
  | { ok: false; reason: 'invalid-moderation' | 'unknown-version' | 'invalid-shape' };

/**
 * v2.1 — 보드 설정 검증 (Design §3.7).
 *
 * - moderation: 'off' | 'manual'만 허용
 * - version: 1만 허용
 *
 * Phase B에서는 도메인 규칙 선언만. Phase A에서 IPC 핸들러 + UI 패널이 활용.
 */
export function validateBoardSettings(
  settings: unknown,
): BoardSettingsValidationResult {
  if (!settings || typeof settings !== 'object') {
    return { ok: false, reason: 'invalid-shape' };
  }
  const obj = settings as Record<string, unknown>;
  if (obj['version'] !== REALTIME_WALL_BOARD_SETTINGS_VERSION) {
    return { ok: false, reason: 'unknown-version' };
  }
  if (obj['moderation'] !== 'off' && obj['moderation'] !== 'manual') {
    return { ok: false, reason: 'invalid-moderation' };
  }
  return { ok: true };
}

/**
 * v2.1 — 카드 색상 검증 (Design §2.1 RealtimeWallCardColor union).
 */
export function isValidRealtimeWallCardColor(
  value: unknown,
): value is RealtimeWallCardColor {
  return (
    typeof value === 'string' &&
    (REALTIME_WALL_CARD_COLORS as readonly string[]).includes(value)
  );
}

/**
 * v2.1 — Phase B 마이그레이션 normalizer (Design §2.5).
 *
 * v1.14.x → v1.15.x 무손실 호환:
 * - color: 'white' default 주입
 * - images / pdfUrl / pdfFilename / ownerSessionToken / studentPinHash:
 *   undefined 유지 (default 주입 X — 학생 권한 차단/익명 모드 보장)
 * - edited: false default
 *
 * v1 normalizer (`normalizePostForPadletMode`) 호출 후 v2.1 필드 추가 — idempotent.
 */
export function normalizePostForPadletModeV2(
  post: RealtimeWallPost,
): RealtimeWallPost {
  const v1Normalized = normalizePostForPadletMode(post);
  return {
    ...v1Normalized,
    color: v1Normalized.color ?? 'white',
    edited: v1Normalized.edited ?? false,
    // images / pdfUrl / pdfFilename / ownerSessionToken / studentPinHash:
    // undefined 유지 (default 주입 X — 의도된 동작)
  };
}

/**
 * v2.1 — Phase B 보드 마이그레이션 normalizer (Design §2.5).
 *
 * - posts: normalizePostForPadletModeV2 적용
 * - settings: DEFAULT_REALTIME_WALL_BOARD_SETTINGS (`{ version: 1, moderation: 'off' }`) 주입
 *
 * v1.16.x (Phase 1, Design §3.3):
 * - settings.theme: 미존재 시 undefined 유지 (DEFAULT 주입은 BroadcastWallState/UI 시점에서 일원화).
 *   존재 시 `normalizeWallBoardTheme`로 화이트리스트 검증 통과한 값으로 sanitize.
 *   잘못된 페이로드(잘못된 presetId / accent 형식 등)는 default fallback (회귀 #10 mitigation).
 *
 * idempotent — 두 번 호출해도 동일 결과.
 */
export function normalizeBoardForPadletModeV2<
  T extends { readonly posts: readonly RealtimeWallPost[]; readonly settings?: RealtimeWallBoardSettings },
>(board: T): T {
  const baseSettings: RealtimeWallBoardSettings =
    board.settings ?? DEFAULT_REALTIME_WALL_BOARD_SETTINGS;
  const settings: RealtimeWallBoardSettings =
    baseSettings.theme === undefined
      ? baseSettings
      : { ...baseSettings, theme: normalizeWallBoardTheme(baseSettings.theme) };
  return {
    ...board,
    posts: board.posts.map(normalizePostForPadletModeV2),
    settings,
  };
}

// Re-export for downstream test convenience (avoid forcing test files to import from entities).
export type { WallBoardTheme };

/**
 * v2.1 — `WallApprovalMode` ↔ `RealtimeWallModerationMode` 통합 매핑 (Design §2.5).
 *
 * 기존 v1.14.x의 approvalMode와 v2.1 신규 boardSettings.moderation을 통합:
 * - moderation='off'    ↔ approvalMode='auto'
 * - moderation='manual' ↔ approvalMode='manual'
 *
 * Phase A에서 boardSettings 도입 시 양방향 마이그레이션 헬퍼.
 */
export function moderationModeFromApprovalMode(
  approvalMode: WallApprovalMode,
): RealtimeWallModerationMode {
  switch (approvalMode) {
    case 'auto':
      return 'off';
    case 'manual':
    case 'filter':
      return 'manual';
    default: {
      const _exhaustive: never = approvalMode;
      void _exhaustive;
      return 'manual';
    }
  }
}

export function approvalModeFromModerationMode(
  moderation: RealtimeWallModerationMode,
): WallApprovalMode {
  return moderation === 'off' ? 'auto' : 'manual';
}

// ============================================================
// v1.15.x Phase D — 학생 자기 카드 수정/삭제 + 교사 모더레이션 도구
// Design v2.1 §3.1 (isOwnCard 양방향) / §3.3 / §3.4 (soft delete + applyRestore)
// ============================================================

/**
 * v2.1 Phase D — 자기 카드 식별 컨텍스트.
 * sessionToken + pinHash 양방향 OR 매칭 (Design v2.1 §0.2 원칙 v2-1).
 */
export interface OwnerMatchContext {
  readonly currentSessionToken: string | undefined;
  readonly currentPinHash: string | undefined;
}

/**
 * v2.1 Phase D — 자기 카드 식별 (Design v2.1 §3.1).
 *
 * sessionToken OR studentPinHash 양방향 OR 매칭:
 * - 둘 중 하나라도 일치하면 true (Plan 원칙 v2-1)
 * - PIN 미설정 학생 → currentPinHash undefined → sessionToken 단일 매칭 폴백
 * - PIN 설정 학생 → 같은 PC 다른 탭/세션에서도 PIN으로 식별 가능
 * - 빈 문자열은 false 처리 (false-positive 방지)
 *
 * UI/usecase 모두 이 함수만 사용 (직접 비교 금지 — 회귀 위험 #9 mitigation 강화).
 */
export function isOwnCard(
  post: Pick<RealtimeWallPost, 'ownerSessionToken' | 'studentPinHash'>,
  ctx: OwnerMatchContext,
): boolean {
  // 첫째 항: sessionToken 매칭
  if (
    ctx.currentSessionToken &&
    ctx.currentSessionToken.length > 0 &&
    post.ownerSessionToken &&
    post.ownerSessionToken.length > 0 &&
    post.ownerSessionToken === ctx.currentSessionToken
  ) {
    return true;
  }
  // 둘째 항: PIN hash 매칭
  if (
    ctx.currentPinHash &&
    ctx.currentPinHash.length > 0 &&
    post.studentPinHash &&
    post.studentPinHash.length > 0 &&
    post.studentPinHash === ctx.currentPinHash
  ) {
    return true;
  }
  return false;
}

/**
 * v2.1 Phase D/C — 학생 위치 변경 요청 (Design v2.1 §3.2).
 * Phase D에서는 선언만 — Phase C에서 활용 (위치 변경 검증).
 */
export interface MoveRequest {
  readonly postId: string;
  readonly sessionToken: string;
  readonly pinHash?: string;
  readonly freeform?: RealtimeWallFreeformPosition;
  readonly kanban?: { columnId: string; order: number };
}

export type MoveValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'not-found'
        | 'not-owner'
        | 'invalid-position'
        | 'invalid-column'
        | 'mobile-readonly';
    };

/**
 * v2.1 Phase C — 학생 위치 변경 검증 (Design v2.1 §3.2).
 *
 * - 자기 카드 검증 (isOwnCard 양방향)
 * - freeform: 0 ≤ x/y ≤ 10000, 100 ≤ w/h ≤ 2000
 * - kanban: columnId 존재 + order ≥ 0
 *
 * Phase D에서는 선언만 — 실제 호출은 Phase C에서 (submit-move 핸들러).
 */
export function validateMove(
  posts: readonly RealtimeWallPost[],
  columns: readonly RealtimeWallColumn[],
  req: MoveRequest,
): MoveValidationResult {
  const target = posts.find((p) => p.id === req.postId);
  if (!target) return { ok: false, reason: 'not-found' };
  if (
    !isOwnCard(target, {
      currentSessionToken: req.sessionToken,
      currentPinHash: req.pinHash,
    })
  ) {
    return { ok: false, reason: 'not-owner' };
  }
  if (!req.freeform && !req.kanban) {
    return { ok: false, reason: 'invalid-position' };
  }
  if (req.freeform) {
    const { x, y, w, h } = req.freeform;
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(w) ||
      !Number.isFinite(h) ||
      x < 0 ||
      x > 10000 ||
      y < 0 ||
      y > 10000 ||
      w < 100 ||
      w > 2000 ||
      h < 100 ||
      h > 2000
    ) {
      return { ok: false, reason: 'invalid-position' };
    }
  }
  if (req.kanban) {
    if (!columns.some((c) => c.id === req.kanban!.columnId)) {
      return { ok: false, reason: 'invalid-column' };
    }
    if (!Number.isInteger(req.kanban.order) || req.kanban.order < 0) {
      return { ok: false, reason: 'invalid-position' };
    }
  }
  return { ok: true };
}

/**
 * v2.1 Phase C — 학생 위치 변경 적용 (Design v2.1 §3.4).
 *
 * 호출 전 validateMove 통과 보장 (호출자 책임).
 *
 * - freeform 부분: 기존 freeform 위에 patch (zIndex 등 미지정 필드는 보존)
 * - kanban 부분: 컬럼 이동 + order 갱신
 * - 회귀 위험 #8 보호: posts.filter X — 모두 map으로 patch만
 *
 * 반환: 변경된 posts 배열 (불변).
 */
export function applyMove(
  posts: readonly RealtimeWallPost[],
  req: MoveRequest,
): RealtimeWallPost[] {
  return posts.map((p) => {
    if (p.id !== req.postId) return p;
    let next: RealtimeWallPost = p;
    if (req.freeform) {
      next = {
        ...next,
        freeform: {
          ...next.freeform,
          ...req.freeform,
        },
      };
    }
    if (req.kanban) {
      next = {
        ...next,
        kanban: {
          ...next.kanban,
          columnId: req.kanban.columnId,
          order: req.kanban.order,
        },
      };
    }
    return next;
  });
}

/**
 * v2.1 Phase D — 학생 카드 수정 요청 (Design v2.1 §3.3).
 */
export interface EditRequest {
  readonly postId: string;
  readonly sessionToken: string;
  readonly pinHash?: string;
  readonly text?: string;
  readonly linkUrl?: string | null;
  readonly images?: readonly string[];
  readonly pdfUrl?: string | null;
  readonly pdfFilename?: string | null;
  readonly color?: RealtimeWallCardColor;
}

export type EditValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'not-found'
        | 'not-owner'
        | 'invalid-text'
        | 'invalid-link'
        | 'invalid-images'
        | 'invalid-pdf'
        | 'invalid-color'
        | 'placeholder-locked';
    };

/**
 * v2.1 Phase D — 학생 카드 수정 검증 (Design v2.1 §3.3).
 *
 * - 자기 카드 검증 (isOwnCard 양방향)
 * - text 길이 제한
 * - linkUrl 형식 (null = 링크 제거)
 * - images 다중 검증
 * - pdfUrl file:// 형식
 * - color enum
 * - status='hidden-by-author'는 수정 불가 (placeholder-locked)
 */
export function validateEdit(
  posts: readonly RealtimeWallPost[],
  req: EditRequest,
  maxTextLength: number = REALTIME_WALL_MAX_TEXT_LENGTH_V2,
): EditValidationResult {
  const target = posts.find((p) => p.id === req.postId);
  if (!target) return { ok: false, reason: 'not-found' };
  if (
    !isOwnCard(target, {
      currentSessionToken: req.sessionToken,
      currentPinHash: req.pinHash,
    })
  ) {
    return { ok: false, reason: 'not-owner' };
  }
  if (target.status === 'hidden-by-author') {
    return { ok: false, reason: 'placeholder-locked' };
  }

  if (req.text !== undefined) {
    const trimmed = req.text.trim();
    if (trimmed.length === 0 || trimmed.length > maxTextLength) {
      return { ok: false, reason: 'invalid-text' };
    }
  }
  if (req.linkUrl !== undefined && req.linkUrl !== null) {
    const trimmed = req.linkUrl.trim();
    if (trimmed.length > 0) {
      const normalized = normalizeRealtimeWallLink(trimmed);
      if (!normalized) {
        return { ok: false, reason: 'invalid-link' };
      }
    }
  }
  if (req.images !== undefined && req.images.length > 0) {
    const result = validateImages(req.images);
    if (!result.ok) {
      return { ok: false, reason: 'invalid-images' };
    }
  }
  if (req.pdfUrl !== undefined && req.pdfUrl !== null) {
    const trimmed = req.pdfUrl.trim();
    if (trimmed.length > 0 && !trimmed.startsWith('file://')) {
      return { ok: false, reason: 'invalid-pdf' };
    }
  }
  if (req.color !== undefined && !isValidRealtimeWallCardColor(req.color)) {
    return { ok: false, reason: 'invalid-color' };
  }
  return { ok: true };
}

export type DeleteValidationResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'not-owner' | 'already-deleted' };

/**
 * v2.1 Phase D — 학생 카드 삭제 검증 (Design v2.1 §3.3).
 *
 * - 자기 카드 검증 (isOwnCard 양방향)
 * - status='hidden-by-author'는 이미 삭제됨 (already-deleted)
 */
export function validateDelete(
  posts: readonly RealtimeWallPost[],
  req: { postId: string; sessionToken: string; pinHash?: string },
): DeleteValidationResult {
  const target = posts.find((p) => p.id === req.postId);
  if (!target) return { ok: false, reason: 'not-found' };
  if (
    !isOwnCard(target, {
      currentSessionToken: req.sessionToken,
      currentPinHash: req.pinHash,
    })
  ) {
    return { ok: false, reason: 'not-owner' };
  }
  if (target.status === 'hidden-by-author') {
    return { ok: false, reason: 'already-deleted' };
  }
  return { ok: true };
}

/**
 * v2.1 Phase D — 학생 카드 수정 적용 (Design v2.1 §3.4).
 *
 * text/linkUrl/images/pdfUrl/color 갱신 + edited=true.
 * 호출 전 validateEdit 통과 보장 (호출자 책임).
 *
 * - linkUrl=null → 링크 제거 (delete property)
 * - pdfUrl=null  → PDF 제거 (delete property)
 * - images 빈 배열 → 첨부 제거
 */
export function applyEdit(
  posts: readonly RealtimeWallPost[],
  req: EditRequest,
): RealtimeWallPost[] {
  return posts.map((p) => {
    if (p.id !== req.postId) return p;
    const next: RealtimeWallPost = { ...p, edited: true };
    if (req.text !== undefined) {
      const trimmed = req.text.trim();
      Object.assign(next, { text: trimmed });
    }
    if (req.linkUrl !== undefined) {
      if (req.linkUrl === null || req.linkUrl.trim().length === 0) {
        // 링크 제거 — 새 객체 분해로 linkUrl/linkPreview 제거
        const { linkUrl: _l, linkPreview: _p, ...rest } = next as RealtimeWallPost & {
          linkUrl?: string;
          linkPreview?: RealtimeWallLinkPreview;
        };
        return { ...rest, edited: true } as RealtimeWallPost;
      } else {
        const normalized = normalizeRealtimeWallLink(req.linkUrl) ?? req.linkUrl.trim();
        const preview = classifyRealtimeWallLink(normalized);
        Object.assign(next, {
          linkUrl: normalized,
          ...(preview ? { linkPreview: preview } : {}),
        });
      }
    }
    if (req.images !== undefined) {
      if (req.images.length === 0) {
        const { images: _i, ...rest } = next as RealtimeWallPost & {
          images?: readonly string[];
        };
        Object.assign(next, rest);
        delete (next as { images?: readonly string[] }).images;
      } else {
        Object.assign(next, { images: req.images });
      }
    }
    if (req.pdfUrl !== undefined) {
      if (req.pdfUrl === null || req.pdfUrl.trim().length === 0) {
        delete (next as { pdfUrl?: string }).pdfUrl;
        delete (next as { pdfFilename?: string }).pdfFilename;
      } else {
        Object.assign(next, {
          pdfUrl: req.pdfUrl,
          ...(req.pdfFilename && req.pdfFilename.trim().length > 0
            ? { pdfFilename: req.pdfFilename.trim() }
            : {}),
        });
      }
    }
    if (req.color !== undefined) {
      Object.assign(next, { color: req.color });
    }
    return next;
  });
}

/**
 * v2.1 Phase D — 학생 카드 삭제 적용 (Design v2.1 §3.4 — soft delete).
 *
 * 회귀 위험 #8 — hard delete 패턴 사용 절대 금지:
 *   - 배열 필터로 제거하는 패턴 사용 금지
 *   - posts 배열에서 절대 제거 X
 *   - status='hidden-by-author'로 갱신만
 *   - 좋아요/댓글/text/images/pdfUrl/linkUrl/color 모두 보존 (교사 복원 가능)
 *
 * 표시 로직:
 *   - 학생/교사 모두 RealtimeWallCardPlaceholder로 분기
 *   - 교사만 "복원" 메뉴 활성 (applyRestore 호출)
 */
export function applyDelete(
  posts: readonly RealtimeWallPost[],
  postId: string,
): RealtimeWallPost[] {
  return posts.map((p) =>
    p.id === postId ? { ...p, status: 'hidden-by-author' as const } : p,
  );
}

/**
 * v2.1 Phase D — 교사 복원 (Design v2.1 §3.4).
 *
 * status='hidden-by-author' → 'approved' 복귀.
 * 다른 status는 변경 없음 (idempotent).
 */
export function applyRestore(
  posts: readonly RealtimeWallPost[],
  postId: string,
): RealtimeWallPost[] {
  return posts.map((p) =>
    p.id === postId && p.status === 'hidden-by-author'
      ? { ...p, status: 'approved' as const }
      : p,
  );
}

/**
 * v2.1 Phase D — 작성자 일치 카드 ID 일괄 수집 (Design v2.1 §5.13 / §11.1).
 *
 * 같은 sessionToken 또는 같은 PIN hash 카드 모두 매칭 (양방향 OR).
 * 교사 작성자 추적 (D6) + 일괄 숨김/닉네임 변경 (D7) 공통 헬퍼.
 */
export function findPostIdsByOwner(
  posts: readonly RealtimeWallPost[],
  criteria: { sessionToken?: string; pinHash?: string },
): string[] {
  const out: string[] = [];
  for (const p of posts) {
    if (
      criteria.sessionToken &&
      p.ownerSessionToken &&
      p.ownerSessionToken === criteria.sessionToken
    ) {
      out.push(p.id);
      continue;
    }
    if (
      criteria.pinHash &&
      p.studentPinHash &&
      p.studentPinHash === criteria.pinHash
    ) {
      out.push(p.id);
    }
  }
  return out;
}

/**
 * v2.1 Phase D — 같은 작성자 카드 일괄 status='hidden' 전환 (Design v2.1 §6.1 D7).
 *
 * 교사 닉네임 차단/일괄 숨김 권한 (D7) 적용 헬퍼.
 * 회귀 위험 #8 보호: posts.filter X — 모두 status 갱신만.
 */
export function applyBulkHideByOwner(
  posts: readonly RealtimeWallPost[],
  criteria: { sessionToken?: string; pinHash?: string },
): RealtimeWallPost[] {
  const targetIds = new Set(findPostIdsByOwner(posts, criteria));
  if (targetIds.size === 0) return [...posts];
  return posts.map((p) =>
    targetIds.has(p.id) ? { ...p, status: 'hidden' as const } : p,
  );
}

/**
 * v2.1 Phase D — 같은 작성자 카드 일괄 닉네임 변경 (Design v2.1 §6.1 D7).
 *
 * 변경된 postId 목록과 next posts 배열을 함께 반환 (broadcast 시 postIds 활용).
 */
export function applyNicknameUpdate(
  posts: readonly RealtimeWallPost[],
  criteria: { postId?: string; sessionToken?: string; pinHash?: string },
  newNickname: string,
): { posts: RealtimeWallPost[]; postIds: string[] } {
  const targetIds = new Set<string>();
  if (criteria.postId) targetIds.add(criteria.postId);
  if (criteria.sessionToken || criteria.pinHash) {
    for (const id of findPostIdsByOwner(posts, criteria)) {
      targetIds.add(id);
    }
  }
  if (targetIds.size === 0) return { posts: [...posts], postIds: [] };
  const trimmed = newNickname.trim().slice(0, REALTIME_WALL_MAX_NICKNAME_LENGTH);
  if (trimmed.length === 0) return { posts: [...posts], postIds: [] };
  const nextPosts = posts.map((p) =>
    targetIds.has(p.id) ? { ...p, nickname: trimmed } : p,
  );
  return { posts: nextPosts, postIds: Array.from(targetIds) };
}

/**
 * v2.1 Phase D — 서버 측 보조 도우미 (Design v2.1 §3.8).
 *
 * 학생 카드 생성 시 서버가 ws 세션의 sessionToken과 (선택)pinHash를 강제 주입.
 * 학생이 직접 보낸 ownerSessionToken / studentPinHash는 무시 (위조 방지).
 *
 * - PIN hash도 메시지에 포함되어 있으면 함께 주입 (학생 자율 결정 — PIN 미설정 시 undefined)
 * - 클라이언트는 절대 직접 ownerSessionToken/studentPinHash를 도메인 객체에 부여하지 않음
 */
export function ensureOwnerCredentials(
  post: Omit<RealtimeWallPost, 'ownerSessionToken' | 'studentPinHash'>,
  serverContext: {
    serverSessionToken: string;
    pinHashFromMessage?: string;
  },
): RealtimeWallPost {
  return {
    ...post,
    ownerSessionToken: serverContext.serverSessionToken,
    ...(serverContext.pinHashFromMessage
      ? { studentPinHash: serverContext.pinHashFromMessage }
      : {}),
  };
}
