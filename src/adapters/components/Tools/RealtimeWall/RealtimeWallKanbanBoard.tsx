import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type {
  RealtimeWallColumn,
  RealtimeWallPost,
} from '@domain/entities/RealtimeWall';
import { isOwnCard } from '@domain/rules/realtimeWallRules';
import { useRealtimeWallBoardColorScheme } from './RealtimeWallBoardColorSchemeContext';
import { RealtimeWallCard } from './RealtimeWallCard';
import { RealtimeWallCardActions } from './RealtimeWallCardActions';
import type { RealtimeWallBoardCommonProps } from './types';

interface RealtimeWallKanbanBoardProps extends RealtimeWallBoardCommonProps {
  readonly columns: readonly RealtimeWallColumn[];
  readonly onChangePosts?: (posts: RealtimeWallPost[]) => void;
  /**
   * v1.16.x Phase 3 (Design §5.6) — 학생 카드 추가 잠금 상태.
   * 풀-와이드 "+ 카드 추가" 버튼이 disabled + lock 아이콘으로 전환된다.
   * 교사 측에서는 어차피 버튼이 미렌더(viewerRole 분기)이므로 영향 없음.
   * 미전달 시 false 취급.
   */
  readonly studentFormLocked?: boolean;
  /**
   * 2026-04-26 결함 #4 — Padlet 동일 패턴 인라인 "+ 섹션 추가" (교사 전용).
   * 컬럼 리스트 마지막 위치에 dashed ghost 컬럼 카드를 노출한다.
   * 클릭 → 인라인 input → Enter로 추가 / ESC·blur로 취소.
   * 부모(ToolRealtimeWall)가 columnInputs 배열에 push.
   * 학생 모드에서는 미전달이라 버튼 부재 (회귀 위험 #3 보존).
   * 2026-04-26 — 컬럼 상한 6 → 50(사실상 무제한)으로 확장. 도메인 addWallColumn이 상한 도달 시
   * 원본 반환으로 안전 처리하므로 UI 가드는 부모(ToolRealtimeWall)에서 제거됨.
   * 6+ 컬럼은 부모 wrapper(overflow-x-auto) + 컬럼별 min-w-[280px]로 자연 가로 스크롤.
   */
  readonly onAddColumnInline?: (title: string) => void;
}

function sortColumnPosts(posts: readonly RealtimeWallPost[], columnId: string): RealtimeWallPost[] {
  return posts
    .filter((post) => post.status === 'approved' && post.kanban.columnId === columnId)
    .sort((a, b) => a.kanban.order - b.kanban.order);
}

function moveKanbanPost(
  posts: readonly RealtimeWallPost[],
  postId: string,
  targetColumnId: string,
  targetIndex: number,
): RealtimeWallPost[] {
  const activePost = posts.find((post) => post.id === postId && post.status === 'approved');
  if (!activePost) return [...posts];

  const sourceColumnId = activePost.kanban.columnId;
  const sourceIds = sortColumnPosts(posts, sourceColumnId).map((post) => post.id);
  const targetIds = sourceColumnId === targetColumnId
    ? [...sourceIds]
    : sortColumnPosts(posts, targetColumnId).map((post) => post.id);

  const sourceIndex = sourceIds.indexOf(postId);
  if (sourceIndex === -1) return [...posts];

  if (sourceColumnId === targetColumnId) {
    const safeIndex = Math.max(0, Math.min(targetIndex, targetIds.length - 1));
    const reordered = arrayMove(sourceIds, sourceIndex, safeIndex);
    return posts.map((post) => {
      const order = reordered.indexOf(post.id);
      if (post.status !== 'approved' || post.kanban.columnId !== sourceColumnId || order === -1) {
        return post;
      }
      return {
        ...post,
        kanban: {
          ...post.kanban,
          order,
        },
      };
    });
  }

  const nextSourceIds = sourceIds.filter((id) => id !== postId);
  const safeIndex = Math.max(0, Math.min(targetIndex, targetIds.length));
  const nextTargetIds = [...targetIds];
  nextTargetIds.splice(safeIndex, 0, postId);

  return posts.map((post) => {
    if (post.status !== 'approved') return post;

    if (post.id === postId) {
      return {
        ...post,
        kanban: {
          columnId: targetColumnId,
          order: nextTargetIds.indexOf(post.id),
        },
      };
    }

    if (post.kanban.columnId === sourceColumnId) {
      const order = nextSourceIds.indexOf(post.id);
      if (order !== -1) {
        return {
          ...post,
          kanban: {
            ...post.kanban,
            order,
          },
        };
      }
    }

    if (post.kanban.columnId === targetColumnId) {
      const order = nextTargetIds.indexOf(post.id);
      if (order !== -1) {
        return {
          ...post,
          kanban: {
            ...post.kanban,
            order,
          },
        };
      }
    }

    return post;
  });
}

function SortableRealtimeWallCardItem({
  post,
  disabled = false,
  viewerRole,
  currentSessionToken,
  currentPinHash,
  onTogglePin,
  onHidePost,
  onOpenLink,
  onHeart,
  onStudentLike,
  onRemoveComment,
  renderCommentInput,
  onOwnCardEdit,
  onOwnCardDelete,
  onRestoreCard,
  onTeacherTrackAuthor,
  onTeacherUpdateNickname,
  onTeacherBulkHideStudent,
  highlighted,
  showTeacherActions = true,
  // v2.1 Phase C 버그 fix (2026-04-24) — 학생 자기 카드만 isOwnSelf=true (sky outline + studentDragHandle 슬롯).
  isOwnSelf = false,
  onCardDetail,
  // Step 2
  onTeacherLike,
  onTeacherAddComment,
}: {
  post: RealtimeWallPost;
  disabled?: boolean;
  viewerRole?: 'teacher' | 'student';
  currentSessionToken?: string;
  currentPinHash?: string;
  onTogglePin?: (postId: string) => void;
  onHidePost?: (postId: string) => void;
  onOpenLink?: (url: string) => void;
  onHeart?: (postId: string) => void;
  onStudentLike?: (postId: string) => void;
  onRemoveComment?: (postId: string, commentId: string) => void;
  renderCommentInput?: (postId: string) => React.ReactNode;
  onOwnCardEdit?: (postId: string) => void;
  onOwnCardDelete?: (postId: string) => void;
  onRestoreCard?: (postId: string) => void;
  onTeacherTrackAuthor?: (postId: string) => void;
  onTeacherUpdateNickname?: (postId: string) => void;
  onTeacherBulkHideStudent?: (postId: string) => void;
  highlighted?: boolean;
  /** 학생 모드에서는 교사 actions 칩 미렌더 (회귀 위험 #3 보존) */
  showTeacherActions?: boolean;
  /** v2.1 Phase C 버그 fix — 학생 자기 카드 여부 (sky-300 outline + studentDragHandle 슬롯 활성). */
  isOwnSelf?: boolean;
  /** 2026-04-26 결함 fix — 카드 더블클릭 → 상세 모달 콜백. */
  onCardDetail?: (postId: string) => void;
  /** Step 2 — 교사 좋아요 토글 */
  onTeacherLike?: (postId: string) => void;
  /** Step 2 — 교사 댓글 추가 */
  onTeacherAddComment?: (postId: string, input: Omit<import('@domain/entities/RealtimeWall').StudentCommentInput, 'sessionToken'>) => void;
}) {
  // v2.1 Phase C — useSortable disabled per-card 동적 결정
  // - 교사: 항상 enabled (기존 동작)
  // - 학생: 자기 카드만 enabled (다른 학생 카드 드래그 불가)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: post.id,
    data: { type: 'post', columnId: post.kanban.columnId },
    disabled,
  });

  // v2.1 Phase C 버그 fix (2026-04-24) — dragHandle 분기:
  //   - disabled === true (다른 학생 카드 또는 교사 readOnly): 드래그 핸들 부재
  //   - viewerRole='student' + isOwnSelf: studentDragHandle 슬롯으로 전달 (회귀 #3 보호)
  //   - viewerRole='teacher': dragHandle prop으로 전달 (기존 동작)
  // 디버그 로그(production 유지) — 학교 환경 진단용.
  if (typeof window !== 'undefined' && viewerRole === 'student' && isOwnSelf && !disabled) {
    // eslint-disable-next-line no-console
    console.log('[Kanban] student own card sortable enabled', {
      postId: post.id,
      columnId: post.kanban.columnId,
      hasListeners: Boolean(listeners),
    });
  }

  const dragHandleButton = disabled ? undefined : (
    <button
      type="button"
      className="rounded-md p-1 text-sp-muted/60 transition hover:bg-sp-text/5 hover:text-sp-text cursor-grab active:cursor-grabbing touch-none"
      title="드래그 이동"
      aria-label="카드 드래그 이동"
      {...attributes}
      {...listeners}
    >
      <span className="material-symbols-outlined text-base">drag_indicator</span>
    </button>
  );

  // 학생 자기 카드 sky-300 outline 힌트 — 드래그 가능 시각 단서
  const studentSelfWrapClass =
    viewerRole === 'student' && isOwnSelf
      ? 'rounded-xl ring-1 ring-sky-300/40'
      : '';

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className={studentSelfWrapClass}
    >
      <RealtimeWallCard
        post={post}
        compact
        onOpenLink={onOpenLink}
        onHeart={onHeart}
        onStudentLike={onStudentLike}
        onRemoveComment={onRemoveComment}
        viewerRole={viewerRole}
        currentSessionToken={currentSessionToken}
        currentPinHash={currentPinHash}
        commentInputSlot={renderCommentInput?.(post.id)}
        onOwnCardEdit={onOwnCardEdit}
        onOwnCardDelete={onOwnCardDelete}
        onRestoreCard={onRestoreCard}
        onTeacherTrackAuthor={onTeacherTrackAuthor}
        onTeacherUpdateNickname={onTeacherUpdateNickname}
        onTeacherBulkHideStudent={onTeacherBulkHideStudent}
        highlighted={highlighted ?? false}
        onTeacherLike={onTeacherLike}
        onTeacherAddComment={onTeacherAddComment}
        dragHandle={
          // 교사 모드 한정 dragHandle prop (회귀 위험 #3 보호 — RealtimeWallCard line 247에서 학생은 null 차단)
          viewerRole === 'teacher' ? dragHandleButton : undefined
        }
        studentDragHandle={
          // 학생 자기 카드 한정 신규 슬롯 (회귀 #3 무영향 — 별도 prop 경로)
          viewerRole === 'student' && isOwnSelf ? dragHandleButton : undefined
        }
        actions={
          showTeacherActions ? (
            <RealtimeWallCardActions
              onTogglePin={onTogglePin ? () => onTogglePin(post.id) : undefined}
              onHide={onHidePost ? () => onHidePost(post.id) : undefined}
            />
          ) : undefined
        }
        onCardDetail={onCardDetail}
      />
    </div>
  );
}

/**
 * 컬럼마다 살짝 다른 색조(hue) — Padlet 정합 헤더 강조.
 *
 * 2026-04-26 사용자 피드백 — 결함 #2 ("컬럼 헤더 옅음"):
 *   - 기존 alpha /5 → alpha /15 (3배 강화). 헤더 배경은 명확히 보이되 카드 영역과 구분 유지.
 *   - dot 색상은 alpha /70 → 풀톤 (시각 강조).
 *
 * 2026-04-26 사용자 피드백 — 결함 #2 (무제한 컬럼):
 *   - 6개 → 12개 hue cycle로 확장 (REALTIME_WALL_MAX_COLUMNS=50 대응).
 *   - 색조가 너무 빨리 반복되지 않도록 sky/lime/fuchsia/orange/teal/indigo 6개 추가.
 *   - 13번째 이상은 modulo로 다시 첫 hue부터 반복 (시각적 부담 방지).
 */
const COLUMN_TINTS = [
  'bg-sp-accent/15',
  'bg-emerald-500/15',
  'bg-violet-500/15',
  'bg-amber-400/15',
  'bg-rose-500/15',
  'bg-cyan-500/15',
  'bg-sky-500/15',
  'bg-lime-500/15',
  'bg-fuchsia-500/15',
  'bg-orange-500/15',
  'bg-teal-500/15',
  'bg-indigo-500/15',
];

const COLUMN_DOT_COLORS = [
  'bg-sp-accent',
  'bg-emerald-400',
  'bg-violet-400',
  'bg-amber-400',
  'bg-rose-400',
  'bg-cyan-400',
  'bg-sky-400',
  'bg-lime-400',
  'bg-fuchsia-400',
  'bg-orange-400',
  'bg-teal-400',
  'bg-indigo-400',
];

interface KanbanColumnViewExtraProps {
  readonly currentSessionToken?: string;
  readonly currentPinHash?: string;
  readonly onStudentLike?: (postId: string) => void;
  readonly onOwnCardEdit?: (postId: string) => void;
  readonly onOwnCardDelete?: (postId: string) => void;
  readonly onRestoreCard?: (postId: string) => void;
  readonly onTeacherTrackAuthor?: (postId: string) => void;
  readonly onTeacherUpdateNickname?: (postId: string) => void;
  readonly onTeacherBulkHideStudent?: (postId: string) => void;
  readonly highlightedPostIds?: ReadonlySet<string>;
  /** Step 2 — 교사 좋아요 토글 */
  readonly onTeacherLike?: (postId: string) => void;
  /** Step 2 — 교사 댓글 추가 */
  readonly onTeacherAddComment?: (postId: string, input: Omit<import('@domain/entities/RealtimeWall').StudentCommentInput, 'sessionToken'>) => void;
  /**
   * Step 3 — 교사 전용 컬럼 헤더 "+" 버튼 콜백.
   * viewerRole='teacher'일 때만 헤더 우측에 작은 "+" 버튼 노출.
   * 학생의 onAddCardToColumn과 완전 격리 (회귀 위험 #3 보존).
   */
  readonly onTeacherAddCardToColumn?: (columnId: string) => void;
  /**
   * v2.1 student-ux — 컬럼 헤더 "+" 버튼 클릭 콜백 (학생 모드 전용 / Padlet 패턴).
   * 부모가 colId 기억해 모달을 연다. 교사 모드(viewerRole='teacher')에서는 undefined.
   *
   * v1.16.x Phase 3 (Design §5.6) — 버튼 위치/외형 재배치:
   *   - 기존 컬럼 헤더 우측 끝 24×24 sky-300 원형 → 컬럼 헤더 직후 풀-와이드 점선 outlined 버튼.
   *   - 빈 컬럼은 더 큰 빈 상태 CTA로 노출 (h-32, "이 컬럼에 첫 카드를 추가해보세요").
   *   - 학생 모드 전용 — 회귀 위험 #3 정신 (`viewerRole === 'student' && Boolean(onAddCardToColumn)`) 보존.
   */
  readonly onAddCardToColumn?: (columnId: string) => void;
  /**
   * v2.1 student-ux — 학생 카드 추가 잠금 (FAB 회로와 동일 신호). true면 풀-와이드 버튼이 disabled.
   * 학생 SPA에서 boardSnapshot.studentFormLocked로 전달.
   * 미전달(undefined)은 false 취급 — 교사 측은 어차피 버튼 미렌더라 영향 없음.
   */
  readonly studentFormLocked?: boolean;
  /** 2026-04-26 결함 fix — 카드 더블클릭 → 상세 모달 콜백. */
  readonly onCardDetail?: (postId: string) => void;
}

function KanbanColumnView({
  column,
  columnIndex,
  posts,
  readOnly,
  onTogglePin,
  onHidePost,
  onOpenLink,
  onHeart,
  onStudentLike,
  onRemoveComment,
  renderCommentInput,
  viewerRole,
  currentSessionToken,
  currentPinHash,
  onOwnCardEdit,
  onOwnCardDelete,
  onRestoreCard,
  onTeacherTrackAuthor,
  onTeacherUpdateNickname,
  onTeacherBulkHideStudent,
  highlightedPostIds,
  onAddCardToColumn,
  studentFormLocked = false,
  onCardDetail,
  onTeacherLike,
  onTeacherAddComment,
  onTeacherAddCardToColumn,
}: {
  column: RealtimeWallColumn;
  columnIndex: number;
  posts: readonly RealtimeWallPost[];
  readOnly: boolean;
  onTogglePin?: (postId: string) => void;
  onHidePost?: (postId: string) => void;
  onOpenLink?: (url: string) => void;
  onHeart?: (postId: string) => void;
  onRemoveComment?: (postId: string, commentId: string) => void;
  renderCommentInput?: (postId: string) => React.ReactNode;
  viewerRole?: 'teacher' | 'student';
} & KanbanColumnViewExtraProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${column.id}`,
    data: { type: 'column', columnId: column.id },
    disabled: readOnly,
  });

  const colorScheme = useRealtimeWallBoardColorScheme();
  const isLight = colorScheme === 'light';

  const tint = COLUMN_TINTS[columnIndex % COLUMN_TINTS.length];
  const dotColor = COLUMN_DOT_COLORS[columnIndex % COLUMN_DOT_COLORS.length];

  // v1.16.x Phase 3 (Design §5.6) — 학생 모드에서만 컬럼 카드 추가 버튼 노출 (Padlet 패턴).
  // 회귀 위험 #3 보호: viewerRole='teacher'에서는 onAddCardToColumn이 undefined여서 버튼 부재.
  // 위치는 컬럼 헤더 직후 + 카드 리스트 위로 이동 (Trello / Linear / Padlet 정합).
  const showColumnAddButton = viewerRole === 'student' && Boolean(onAddCardToColumn);
  const isEmptyColumn = posts.length === 0;

  // 2026-04-26 결함 수정 — light/dark 보드 헤더 ring 분기.
  //   light 보드: sp-border는 다크 전용 옅은 톤이라 크림/슬레이트 배경 위에서 invisible.
  //               → slate-300/80 으로 진하게.
  //   dark 보드: 기존 sp-border/40 유지.
  const headerRingClass = isLight ? 'ring-1 ring-slate-300/80' : 'ring-1 ring-sp-border/40';

  // 2026-04-26 결함 수정 — "+ 카드 추가" 버튼 색상 분기.
  //   light 보드: 점선 테두리·텍스트 모두 slate 진한 톤 + hover sky.
  //   dark 보드: 기존 sp-border/text-sky-300 유지.
  const addButtonActiveClass = isLight
    ? 'border-slate-300 bg-slate-50/60 text-slate-600 hover:border-sky-500 hover:bg-sky-50 hover:text-sky-600'
    : 'border-sp-border/60 bg-sp-card/40 text-sky-300/80 hover:border-sky-400/60 hover:bg-sky-500/5 hover:text-sky-200';
  const addButtonLockedClass = isLight
    ? 'cursor-not-allowed border-slate-200 bg-slate-100/60 text-slate-400'
    : 'cursor-not-allowed border-sp-border/40 bg-sp-card/20 text-sp-muted';

  // 2026-04-26 사용자 피드백 #2 — 컬럼 폭 minimum 280px (회귀 위험: ActionBar -48px 후에도
  // 화면당 컬럼 4~5개 가용).
  //
  // 2026-04-26 통합 수정:
  //   - 결함 #3 (컬럼 배경 제거): wrapper의 bg-sp-surface / border / shadow-sm 모두 제거.
  //     헤더만 tint(/15) + ring 살짝 → Padlet 동일하게 카드만 부유.
  //     카드 자체의 shadow + ring(RealtimeWallCard)으로 분리감 확보 (회귀 #7 보장).
  //   - 결함 #2 (컬럼별 독립 스크롤): 카드 리스트(droppable div)에
  //     overflow-y-auto + 동적 max-h. 보드 wrapper(부모)는 가로 스크롤만.
  //     컬럼 자체는 max-h-full + min-h-0 로 flex 스크롤 컨테이너 동작.
  return (
    <section className="flex h-full min-h-0 min-w-[280px] flex-1 flex-col">
      <header className={`flex items-center gap-2 rounded-xl px-4 py-3 ${headerRingClass} ${tint}`}>
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotColor}`} />
        {/* 2026-04-26 결함 fix #1 — 컬럼 제목 가독성:
            light 보드에서 컬럼 tint(/15) 위에 text-slate-700이 묻혀 거의 안 보였음.
            text-slate-900 + font-extrabold로 대비를 확실하게 끌어올림.
            모든 6개 tint(blue/emerald/violet/amber/rose/cyan ×0.15) 위에서 WCAG AA 통과. */}
        <span className={`min-w-0 flex-1 truncate text-sm ${isLight ? 'text-slate-900 font-extrabold' : 'text-sp-text font-bold'}`}>{column.title}</span>
        <span className={[
          'shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ring-1',
          isLight
            ? 'bg-white text-slate-600 ring-slate-300/80'
            : 'bg-sp-card text-sp-text ring-sp-border',
        ].join(' ')}>
          {posts.length}
        </span>
        {/* Step 3 — 교사 컬럼 "+" 버튼 (회귀 위험 #3 격리: 학생 onAddCardToColumn과 별도 prop).
            viewerRole='teacher' + onTeacherAddCardToColumn 전달 시만 렌더. */}
        {viewerRole === 'teacher' && onTeacherAddCardToColumn && (
          <button
            type="button"
            onClick={() => onTeacherAddCardToColumn(column.id)}
            aria-label={`${column.title} 컬럼에 교사 카드 추가`}
            title={`${column.title}에 카드 추가`}
            className={[
              'shrink-0 rounded-lg p-0.5 transition',
              isLight
                ? 'text-slate-500 hover:bg-slate-200 hover:text-slate-900'
                : 'text-sp-muted hover:bg-sp-text/10 hover:text-sp-text',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent/50',
            ].join(' ')}
          >
            <span className="material-symbols-outlined text-lg leading-none">add</span>
          </button>
        )}
      </header>

      {/* v1.16.x Phase 3 — 풀-와이드 카드 추가 버튼 (학생 모드 한정).
          - 카드 1+장: min-h-[44px] 점선 outlined 버튼 (헤더 직후 + 카드 리스트 직전).
          - 빈 컬럼: 더 큰 h-32 빈 상태 CTA (가이드 문구 포함).
          - studentFormLocked: disabled + lock 아이콘.
          회귀 위험 #9 보호: 기존 헤더 24×24 버튼 마크업은 위에서 완전 제거됨. */}
      {showColumnAddButton && (
        <div className="px-1 pt-3">
          <button
            type="button"
            onClick={() => onAddCardToColumn?.(column.id)}
            disabled={studentFormLocked}
            aria-label={
              studentFormLocked
                ? `${column.title} 컬럼은 잠겨 있어요`
                : `${column.title} 컬럼에 카드 추가`
            }
            title={
              studentFormLocked
                ? '선생님이 카드 추가를 잠시 멈췄어요'
                : `${column.title}에 카드 추가`
            }
            className={[
              'flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed transition',
              isEmptyColumn ? 'h-32' : 'min-h-[44px]',
              studentFormLocked ? addButtonLockedClass : addButtonActiveClass,
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50',
            ].join(' ')}
          >
            {studentFormLocked ? (
              <>
                <span className="material-symbols-outlined text-lg">lock</span>
                <span className="text-sm">잠겨있어요</span>
              </>
            ) : isEmptyColumn ? (
              <div className="flex flex-col items-center gap-1.5">
                <span className="material-symbols-outlined text-[24px]">add</span>
                <span className="text-sm font-semibold">이 컬럼에 첫 카드를 추가해보세요</span>
              </div>
            ) : (
              <>
                <span className="material-symbols-outlined text-lg">add</span>
                <span className="text-sm">카드 추가</span>
              </>
            )}
          </button>
        </div>
      )}

      <div
        ref={setNodeRef}
        className={`min-h-0 flex-1 space-y-2.5 overflow-y-auto px-1 py-3 transition-colors ${
          isOver ? 'rounded-lg bg-sp-accent/5' : ''
        }`}
      >
        {readOnly ? (
          posts.map((post) => (
            <RealtimeWallCard
              key={post.id}
              post={post}
              compact
              onOpenLink={onOpenLink}
              onHeart={!readOnly ? onHeart : undefined}
              onStudentLike={onStudentLike}
              viewerRole={viewerRole}
              currentSessionToken={currentSessionToken}
              currentPinHash={currentPinHash}
              commentInputSlot={renderCommentInput?.(post.id)}
              onOwnCardEdit={onOwnCardEdit}
              onOwnCardDelete={onOwnCardDelete}
              onRestoreCard={onRestoreCard}
              onTeacherTrackAuthor={onTeacherTrackAuthor}
              onTeacherUpdateNickname={onTeacherUpdateNickname}
              onTeacherBulkHideStudent={onTeacherBulkHideStudent}
              highlighted={highlightedPostIds?.has(post.id) ?? false}
              onCardDetail={onCardDetail}
              onTeacherLike={onTeacherLike}
              onTeacherAddComment={onTeacherAddComment}
            />
          ))
        ) : (
          <SortableContext items={posts.map((post) => post.id)} strategy={verticalListSortingStrategy}>
            {posts.map((post) => {
              // v2.1 Phase C — 학생 모드는 자기 카드만 sortable enable
              // 회귀 위험 #3 보존 — 학생은 교사 actions/dragHandle DOM 부재 (showTeacherActions=false)
              const isStudent = viewerRole === 'student';
              const isSelf = isStudent
                ? isOwnCard(post, { currentSessionToken, currentPinHash })
                : false;
              const sortableDisabled = isStudent ? !isSelf : false;
              const showTeacherActions = !isStudent;
              return (
                <SortableRealtimeWallCardItem
                  key={post.id}
                  post={post}
                  disabled={sortableDisabled}
                  viewerRole={viewerRole}
                  currentSessionToken={currentSessionToken}
                  currentPinHash={currentPinHash}
                  onTogglePin={onTogglePin}
                  onHidePost={onHidePost}
                  onOpenLink={onOpenLink}
                  onHeart={onHeart}
                  onStudentLike={onStudentLike}
                  onRemoveComment={onRemoveComment}
                  renderCommentInput={renderCommentInput}
                  onOwnCardEdit={onOwnCardEdit}
                  onOwnCardDelete={onOwnCardDelete}
                  onRestoreCard={onRestoreCard}
                  onTeacherTrackAuthor={onTeacherTrackAuthor}
                  onTeacherUpdateNickname={onTeacherUpdateNickname}
                  onTeacherBulkHideStudent={onTeacherBulkHideStudent}
                  highlighted={highlightedPostIds?.has(post.id) ?? false}
                  showTeacherActions={showTeacherActions}
                  isOwnSelf={isSelf}
                  onCardDetail={onCardDetail}
                  onTeacherLike={onTeacherLike}
                  onTeacherAddComment={onTeacherAddComment}
                />
              );
            })}
          </SortableContext>
        )}

        {/* v1.16.x Phase 3 — 학생 모드에서는 풀-와이드 CTA가 빈 컬럼 안내를 대체하므로 중복 방지. */}
        {posts.length === 0 && !showColumnAddButton && (
          <div className={[
            'flex h-full min-h-[160px] items-center justify-center rounded-lg border border-dashed px-4 text-center text-xs',
            isLight
              ? 'border-slate-300/70 text-slate-400'
              : 'border-sp-border/40 text-sp-muted/70',
          ].join(' ')}>
            {readOnly ? '카드 없음' : '여기로 드래그해 정리하세요'}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * 2026-04-26 결함 #4 — Padlet 동일 패턴 인라인 "+ 섹션 추가" ghost 컬럼.
 *
 * UX 사양 (옵션 A 채택):
 *   - idle: 컬럼 폭 동일 dashed border ghost 카드 + 가운데 "+ 섹션 추가" 라벨
 *   - editing: 클릭 시 동일 폭 인라인 input (autoFocus, placeholder "섹션 이름")
 *     - Enter: 트림된 비어있지 않은 값이면 onAdd 호출 후 idle 복귀
 *     - ESC / blur(외부 클릭): idle 복귀 (제출 X)
 *   - 컬럼 폭(min-w-[280px])과 정렬을 KanbanColumnView와 동일하게 맞춤.
 *   - 학생 모드 미렌더 (부모에서 onAdd 미전달).
 */
function AddColumnInlineCard({ onAdd }: { onAdd: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  const reset = () => {
    setValue('');
    setEditing(false);
  };

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      reset();
      return;
    }
    onAdd(trimmed);
    reset();
  };

  if (editing) {
    return (
      <section className="flex h-full min-h-0 min-w-[280px] flex-1 flex-col">
        <div className="flex items-center gap-2 rounded-xl bg-sp-card px-3 py-2 ring-1 ring-sp-accent/50">
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              } else if (event.key === 'Escape') {
                event.preventDefault();
                reset();
              }
            }}
            onBlur={submit}
            placeholder="섹션 이름 입력 후 Enter"
            aria-label="새 섹션 이름"
            className="flex-1 bg-transparent text-sm font-bold text-sp-text placeholder:text-sp-muted/70 focus:outline-none"
          />
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={submit}
            className="rounded-lg bg-sp-accent px-2 py-1 text-xs font-semibold text-white transition hover:bg-sp-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent/60"
            aria-label="섹션 추가 확인"
          >
            추가
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 min-w-[280px] flex-1 flex-col">
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label="새 섹션 추가"
        title="새 섹션 추가"
        className="flex min-h-[52px] w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-sp-border/60 bg-sp-card/30 text-sm font-semibold text-sp-muted transition hover:border-sp-accent/60 hover:bg-sp-accent/5 hover:text-sp-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent/40"
      >
        <span className="material-symbols-outlined text-lg">add</span>
        <span>섹션 추가</span>
      </button>
    </section>
  );
}

export function RealtimeWallKanbanBoard({
  columns,
  posts,
  readOnly = false,
  onChangePosts,
  onTogglePin,
  onHidePost,
  onOpenLink,
  onHeart,
  viewerRole = 'teacher',
  currentSessionToken,
  currentPinHash,
  onStudentLike,
  onRemoveComment,
  renderCommentInput,
  onOwnCardEdit,
  onOwnCardDelete,
  onRestoreCard,
  onTeacherTrackAuthor,
  onTeacherUpdateNickname,
  onTeacherBulkHideStudent,
  highlightedPostIds,
  // v2.1 Phase C
  onOwnCardMove,
  isMobile = false,
  // v2.1 student-ux — Padlet 컬럼별 + 버튼
  onAddCardToColumn,
  // v1.16.x Phase 3 — 학생 카드 추가 잠금 상태 (풀-와이드 버튼 disabled 표시)
  studentFormLocked = false,
  // 2026-04-26 결함 #4 — 교사 측 인라인 "+ 섹션 추가"
  onAddColumnInline,
  // 2026-04-26 결함 fix — 카드 더블클릭 → 상세 모달
  onCardDetail,
  // Step 2 — 교사 좋아요/댓글
  onTeacherLike,
  onTeacherAddComment,
  // Step 3 — 교사 컬럼별 "+" 카드 추가
  onTeacherAddCardToColumn,
}: RealtimeWallKanbanBoardProps) {
  const isStudent = viewerRole === 'student';

  /**
   * v2.1 Phase C — Kanban 학생 모드 처리 (Design v2.1 §5.3 / Plan FR-C2):
   * - 학생도 DndContext 마운트 (자기 카드 드래그 가능 위해)
   * - per-card useSortable disabled (자기 카드만 활성)
   * - 교사: 기존 동작 100% 보존 (회귀 0)
   *
   * v2.1 Phase C 버그 fix (2026-04-24) — Kanban 모바일 차단 제거.
   *   Plan §FR-C2는 Kanban 모바일 차단을 요구하지 않음 (Freeform §FR-C1만 모바일 readOnly).
   *   이전 코드(`isStudent && isMobile` 차단)는 Plan과 어긋나 학생 휴대폰에서 컬럼 이동이
   *   완전 차단되었음 — 사용자 보고 "학생이 자기 카드 컬럼 이동 안 됨" 1차 원인.
   *   Kanban은 dnd-kit PointerSensor (touch event 호환) + 6px activation constraint로
   *   모바일에서도 충분한 정밀도 확보. Padlet도 모바일 Kanban 드래그 허용.
   */
  const boardReadOnly = readOnly;
  const studentDndDisabled = isStudent && !onOwnCardMove;
  const useReadOnlyDisplay = boardReadOnly || studentDndDisabled;

  // 디버그 로그(production 유지) — 학교 환경 진단용. 학생 모드 진입 시.
  if (typeof window !== 'undefined' && isStudent) {
    // eslint-disable-next-line no-console
    console.log('[Kanban] student mode mount', {
      readOnly: boardReadOnly,
      useReadOnlyDisplay,
      studentDndDisabled,
      isMobile,
      hasOwnCardMove: Boolean(onOwnCardMove),
      currentSessionToken: currentSessionToken
        ? `${currentSessionToken.slice(0, 8)}...`
        : '(missing)',
      currentPinHash: currentPinHash ? '(set)' : '(none)',
      postsCount: posts.length,
    });
  }

  // isMobile prop은 인터페이스 호환성 유지 위해 받지만 Kanban은 사용 안 함 (Freeform 한정).
  void isMobile;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // v2.1 Phase D: hidden-by-author 카드도 placeholder로 포함.
  const approvedPosts = useMemo(
    () => posts.filter((post) => post.status === 'approved' || post.status === 'hidden-by-author'),
    [posts],
  );

  const postsByColumn = useMemo(
    () =>
      columns.map((column) => ({
        column,
        posts: sortColumnPosts(approvedPosts, column.id),
      })),
    [approvedPosts, columns],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    if (useReadOnlyDisplay) return;

    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const activePost = approvedPosts.find((post) => post.id === activeId);
    if (!activePost) return;

    // v2.1 Phase C — 학생 모드는 자기 카드만 처리 (다른 학생 카드는 sortable disabled여서 도달 불가하지만 방어)
    if (isStudent) {
      if (!isOwnCard(activePost, { currentSessionToken, currentPinHash })) return;
      if (activePost.status === 'hidden-by-author') return;
    }

    let targetColumnId = activePost.kanban.columnId;
    let targetIndex = sortColumnPosts(posts, targetColumnId).length;

    const overType = over.data.current?.type;

    if (overType === 'post') {
      const overId = String(over.id);
      const overPost = approvedPosts.find((post) => post.id === overId);
      if (!overPost) return;
      targetColumnId = overPost.kanban.columnId;
      targetIndex = sortColumnPosts(posts, targetColumnId).findIndex((post) => post.id === overId);
    } else if (overType === 'column') {
      const maybeColumnId = over.data.current?.columnId;
      if (typeof maybeColumnId === 'string') {
        targetColumnId = maybeColumnId;
        targetIndex = sortColumnPosts(posts, targetColumnId).length;
      }
    } else if (typeof over.id === 'string' && over.id.startsWith('column-')) {
      targetColumnId = over.id.replace('column-', '');
      targetIndex = sortColumnPosts(posts, targetColumnId).length;
    }

    if (isStudent) {
      // v2.1 Phase C — 학생 자기 카드 onOwnCardMove 콜백 (Plan FR-C2)
      // submit-move WebSocket 송신 → 서버가 broadcast post-updated patch로 reconcile
      // 디버그 로그(production 유지) — 학교 환경 진단용.
      // eslint-disable-next-line no-console
      console.log('[Kanban] student dragEnd → onOwnCardMove', {
        activeId,
        targetColumnId,
        targetIndex,
        sourceColumnId: activePost.kanban.columnId,
        sourceOrder: activePost.kanban.order,
        hasOnOwnCardMove: Boolean(onOwnCardMove),
      });
      onOwnCardMove?.(activeId, {
        kanban: { columnId: targetColumnId, order: Math.max(0, targetIndex) },
      });
      return;
    }

    if (!onChangePosts) return;
    onChangePosts(moveKanbanPost(posts, activeId, targetColumnId, targetIndex));
  };

  // 2026-04-26 결함 #4 — 교사 모드 + onAddColumnInline 전달 시에만 ghost 컬럼 노출.
  // 학생 모드/콜백 미전달 시 미렌더. 컬럼 무제한 정책 전환(2026-04-26)으로 6개 도달 가드는
  // 도메인(addWallColumn)에서 안전 처리하므로 부모는 더 이상 6 도달 시 콜백을 끊지 않음.
  const showAddColumn = viewerRole === 'teacher' && Boolean(onAddColumnInline);

  // 2026-04-26 결함 #2 — 보드 wrapper 스크롤 정책 전환:
  //   - 기존: overflow-auto (가로+세로 동시 → 컬럼들이 함께 세로 스크롤)
  //   - 변경: overflow-x-auto + overflow-y-hidden (가로만)
  //     세로 스크롤은 각 컬럼 내부 droppable div(overflow-y-auto)가 담당.
  //   - 컬럼 자체는 h-full + min-h-0 로 부모 높이를 100% 채우고 flex 컨테이너 동작.
  // height chain (위→아래):
  // 1. 부모(RealtimeWallBoardThemeWrapper): h-full min-h-0
  // 2. 보드 wrapper: h-full overflow-x-auto overflow-y-hidden  ← 가로만 스크롤, 세로 고정
  // 3. 컬럼 컨테이너: flex h-full min-h-0 items-stretch gap-3  ← 부모 pixel height 채움
  // 4. 컬럼 section: flex h-full min-h-0 min-w-[280px] flex-1 flex-col  (KanbanColumnView)
  // 5. 컬럼 헤더 header: flex-shrink-0
  // 6. "+ 카드 추가" 버튼 div: flex-shrink-0
  // 7. 카드 리스트 droppable div: flex-1 min-h-0 overflow-y-auto  ← 여기서만 세로 스크롤
  //
  // 핵심: overflow-x-auto wrapper를 중간 flex-col div 없이 직접 h-full로 설정 →
  // 내부 컬럼들이 h-full로 부모의 정확한 pixel height를 채우고,
  // 카드가 많은 컬럼만 droppable 내부에서 독립 세로 스크롤.
  return (
    <div className="h-full overflow-x-auto overflow-y-hidden pb-2">
      {useReadOnlyDisplay ? (
        <div className="flex h-full min-h-0 items-stretch gap-3">
          {postsByColumn.map(({ column, posts: columnPosts }, index) => (
            <KanbanColumnView
              key={column.id}
              column={column}
              columnIndex={index}
              posts={columnPosts}
              readOnly
              onOpenLink={onOpenLink}
              onStudentLike={onStudentLike}
              viewerRole={viewerRole}
              currentSessionToken={currentSessionToken}
              currentPinHash={currentPinHash}
              renderCommentInput={renderCommentInput}
              onOwnCardEdit={onOwnCardEdit}
              onOwnCardDelete={onOwnCardDelete}
              onRestoreCard={onRestoreCard}
              onTeacherTrackAuthor={onTeacherTrackAuthor}
              onTeacherUpdateNickname={onTeacherUpdateNickname}
              onTeacherBulkHideStudent={onTeacherBulkHideStudent}
              highlightedPostIds={highlightedPostIds}
              onAddCardToColumn={onAddCardToColumn}
              studentFormLocked={studentFormLocked}
              onCardDetail={onCardDetail}
              onTeacherLike={onTeacherLike}
              onTeacherAddComment={onTeacherAddComment}
              onTeacherAddCardToColumn={onTeacherAddCardToColumn}
            />
          ))}
          {showAddColumn && onAddColumnInline && (
            <AddColumnInlineCard onAdd={onAddColumnInline} />
          )}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex h-full min-h-0 items-stretch gap-3">
            {postsByColumn.map(({ column, posts: columnPosts }, index) => (
              <KanbanColumnView
                key={column.id}
                column={column}
                columnIndex={index}
                posts={columnPosts}
                readOnly={false}
                onTogglePin={onTogglePin}
                onHidePost={onHidePost}
                onOpenLink={onOpenLink}
                onHeart={onHeart}
                onStudentLike={onStudentLike}
                onRemoveComment={onRemoveComment}
                viewerRole={viewerRole}
                currentSessionToken={currentSessionToken}
                currentPinHash={currentPinHash}
                renderCommentInput={renderCommentInput}
                onOwnCardEdit={onOwnCardEdit}
                onOwnCardDelete={onOwnCardDelete}
                onRestoreCard={onRestoreCard}
                onTeacherTrackAuthor={onTeacherTrackAuthor}
                onTeacherUpdateNickname={onTeacherUpdateNickname}
                onTeacherBulkHideStudent={onTeacherBulkHideStudent}
                highlightedPostIds={highlightedPostIds}
                onAddCardToColumn={onAddCardToColumn}
                onCardDetail={onCardDetail}
                onTeacherLike={onTeacherLike}
                onTeacherAddComment={onTeacherAddComment}
                onTeacherAddCardToColumn={onTeacherAddCardToColumn}
              />
            ))}
            {showAddColumn && onAddColumnInline && (
              <AddColumnInlineCard onAdd={onAddColumnInline} />
            )}
          </div>
        </DndContext>
      )}
    </div>
  );
}
