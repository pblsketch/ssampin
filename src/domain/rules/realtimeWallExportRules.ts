/**
 * realtimeWallExportRules — 실시간 담벼락 내보내기 도메인 규칙.
 *
 * 책임:
 *   - WallBoard + posts + columns 도메인 데이터를 내보내기에 적합한 평면 행 구조로 변환
 *   - 어떤 게시물을 포함할지(상태 필터) 정책
 *   - 카드/댓글/타임스탬프/작성자 포함 여부 옵션 적용
 *   - 컬럼별 정렬 (kanban: 컬럼 순서 → 카드 order, 그 외: pinned → submittedAt)
 *
 * 비책임:
 *   - 실제 파일 생성 (xlsx/pdf 바이너리는 infrastructure)
 *   - I/O (Save Dialog 등은 adapters)
 *
 * Clean Architecture:
 *   - 외부 의존 없음. 순수 함수만 export.
 *   - infrastructure exporter는 본 결과 구조(`RealtimeWallExportRows`)를 입력으로 받는다.
 */

import type {
  RealtimeWallColumn,
  RealtimeWallComment,
  RealtimeWallPost,
} from '@domain/entities/RealtimeWall';

/**
 * 내보내기 옵션 — 사용자가 Drawer에서 토글.
 *
 * 모두 기본 true. 비활성 시 해당 컬럼/필드 생략.
 */
export interface RealtimeWallExportOptions {
  /** 카드 본문 포함 — false 시 본문/링크 컬럼 빈 값 (사실상 카드를 제외하는 의미는 없음) */
  readonly includeContent: boolean;
  /** 댓글 포함 */
  readonly includeComments: boolean;
  /** 제출 시각 컬럼 포함 */
  readonly includeTimestamp: boolean;
  /** 작성자(닉네임) 컬럼 포함 */
  readonly includeAuthor: boolean;
}

export const DEFAULT_REALTIME_WALL_EXPORT_OPTIONS: RealtimeWallExportOptions = {
  includeContent: true,
  includeComments: true,
  includeTimestamp: true,
  includeAuthor: true,
};

/** 내보내기에 포함되는 카드 1장 — 평면 표 구조 */
export interface RealtimeWallExportPostRow {
  readonly index: number;
  readonly columnTitle: string;
  readonly nickname: string;
  readonly text: string;
  readonly linkUrl: string;
  readonly status: '승인' | '대기' | '숨김' | '작성자 숨김';
  readonly pinned: boolean;
  readonly submittedAt: number;
  readonly submittedAtLabel: string;
  readonly hearts: number;
  readonly commentCount: number;
  readonly comments: readonly RealtimeWallExportCommentRow[];
}

export interface RealtimeWallExportCommentRow {
  readonly nickname: string;
  readonly text: string;
  readonly submittedAt: number;
  readonly submittedAtLabel: string;
}

/**
 * 메타 정보 — exporter가 제목/페이지 헤더 등에 사용.
 */
export interface RealtimeWallExportMeta {
  readonly title: string;
  readonly layoutLabel: string;
  readonly totalCards: number;
  readonly approvedCards: number;
  readonly hiddenCards: number;
  readonly generatedAtLabel: string;
  readonly options: RealtimeWallExportOptions;
}

export interface RealtimeWallExportRows {
  readonly meta: RealtimeWallExportMeta;
  readonly rows: readonly RealtimeWallExportPostRow[];
}

const STATUS_LABEL: Record<RealtimeWallPost['status'], RealtimeWallExportPostRow['status']> = {
  approved: '승인',
  pending: '대기',
  hidden: '숨김',
  'hidden-by-author': '작성자 숨김',
};

const LAYOUT_LABEL: Record<string, string> = {
  kanban: '칸반',
  freeform: '자유 배치',
  grid: '그리드',
  stream: '스트림',
};

/**
 * 두 자리 0 패딩 — date-fns 등 외부 의존 없이 도메인에서 자체 처리.
 */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatDateTime(epochMs: number): string {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return '';
  const d = new Date(epochMs);
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const h = pad2(d.getHours());
  const min = pad2(d.getMinutes());
  return `${y}-${m}-${day} ${h}:${min}`;
}

function buildCommentRow(
  comment: RealtimeWallComment,
  options: RealtimeWallExportOptions,
): RealtimeWallExportCommentRow {
  return {
    nickname: options.includeAuthor ? comment.nickname : '',
    text: comment.text,
    submittedAt: comment.submittedAt,
    submittedAtLabel: options.includeTimestamp ? formatDateTime(comment.submittedAt) : '',
  };
}

/**
 * 표시용 정렬:
 *   1) pinned 우선
 *   2) kanban일 때만 columnId → kanban.order
 *   3) submittedAt 오름차순 (최초 작성순) — 회의록 흐름과 일치
 */
function sortPostsForExport(
  posts: readonly RealtimeWallPost[],
  layoutMode: string,
): readonly RealtimeWallPost[] {
  const arr = [...posts];
  arr.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (layoutMode === 'kanban') {
      const colCmp = a.kanban.columnId.localeCompare(b.kanban.columnId);
      if (colCmp !== 0) return colCmp;
      const orderCmp = (a.kanban.order ?? 0) - (b.kanban.order ?? 0);
      if (orderCmp !== 0) return orderCmp;
    }
    return a.submittedAt - b.submittedAt;
  });
  return arr;
}

/**
 * 도메인 → 평면 export 행 구조로 변환 (순수 함수).
 *
 * 정책:
 *   - status='hidden-by-author' 카드는 일반 통계에서 제외하지 않고 그대로 행으로 노출
 *     (수업 복기에서 누가 자기 카드를 지웠는지 확인할 수 있어야 함).
 *   - 댓글은 status='hidden'을 제외 (교사가 명시 삭제한 댓글은 노출 X).
 */
export function buildRealtimeWallExportRows(input: {
  readonly title: string;
  readonly layoutMode: string;
  readonly columns: readonly RealtimeWallColumn[];
  readonly posts: readonly RealtimeWallPost[];
  readonly options?: RealtimeWallExportOptions;
  readonly now?: number;
}): RealtimeWallExportRows {
  const options = input.options ?? DEFAULT_REALTIME_WALL_EXPORT_OPTIONS;
  const columnMap = new Map<string, string>();
  for (const col of input.columns) {
    columnMap.set(col.id, col.title);
  }

  const sortedPosts = sortPostsForExport(input.posts, input.layoutMode);

  const rows: RealtimeWallExportPostRow[] = sortedPosts.map((post, idx) => {
    const colTitle = columnMap.get(post.kanban.columnId) ?? '';
    const visibleComments = (post.comments ?? []).filter((c) => c.status !== 'hidden');
    const commentRows = options.includeComments
      ? visibleComments.map((c) => buildCommentRow(c, options))
      : [];
    return {
      index: idx + 1,
      columnTitle: input.layoutMode === 'kanban' ? colTitle : '',
      nickname: options.includeAuthor ? post.nickname : '',
      text: options.includeContent ? post.text : '',
      linkUrl: options.includeContent ? (post.linkUrl ?? '') : '',
      status: STATUS_LABEL[post.status],
      pinned: post.pinned,
      submittedAt: post.submittedAt,
      submittedAtLabel: options.includeTimestamp ? formatDateTime(post.submittedAt) : '',
      hearts: post.teacherHearts ?? 0,
      commentCount: visibleComments.length,
      comments: commentRows,
    };
  });

  const approvedCards = sortedPosts.filter((p) => p.status === 'approved').length;
  const hiddenCards = sortedPosts.filter(
    (p) => p.status === 'hidden' || p.status === 'hidden-by-author',
  ).length;

  const generatedAt = input.now ?? Date.now();
  return {
    meta: {
      title: input.title.trim() || '실시간 담벼락',
      layoutLabel: LAYOUT_LABEL[input.layoutMode] ?? input.layoutMode,
      totalCards: sortedPosts.length,
      approvedCards,
      hiddenCards,
      generatedAtLabel: formatDateTime(generatedAt),
      options,
    },
    rows,
  };
}

/**
 * 파일명 안전화 — Windows/macOS 모두 안전한 문자만 유지.
 */
export function sanitizeRealtimeWallFileBase(title: string): string {
  const cleaned = title
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 60);
  return cleaned.length > 0 ? cleaned : '실시간_담벼락';
}
