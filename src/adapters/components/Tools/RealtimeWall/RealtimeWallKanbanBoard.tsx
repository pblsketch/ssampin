import { useMemo } from 'react';
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
import { RealtimeWallCard } from './RealtimeWallCard';
import { RealtimeWallCardActions } from './RealtimeWallCardActions';
import type { RealtimeWallBoardCommonProps } from './types';

interface RealtimeWallKanbanBoardProps extends RealtimeWallBoardCommonProps {
  readonly columns: readonly RealtimeWallColumn[];
  readonly onChangePosts?: (posts: RealtimeWallPost[]) => void;
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
      <span className="material-symbols-outlined text-[16px]">drag_indicator</span>
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
      />
    </div>
  );
}

/** 컬럼마다 살짝 다른 색조(hue)를 주어 시각적 깊이를 만든다 */
const COLUMN_TINTS = [
  'bg-sp-accent/5',
  'bg-emerald-500/5',
  'bg-violet-500/5',
  'bg-amber-400/5',
  'bg-rose-500/5',
  'bg-cyan-500/5',
];

const COLUMN_DOT_COLORS = [
  'bg-sp-accent/70',
  'bg-emerald-400/70',
  'bg-violet-400/70',
  'bg-amber-400/70',
  'bg-rose-400/70',
  'bg-cyan-400/70',
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
  /**
   * v2.1 student-ux — 컬럼 헤더 "+" 버튼 클릭 콜백 (학생 모드 전용 / Padlet 패턴).
   * 부모가 colId 기억해 모달을 연다. 교사 모드(viewerRole='teacher')에서는 undefined.
   */
  readonly onAddCardToColumn?: (columnId: string) => void;
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

  const tint = COLUMN_TINTS[columnIndex % COLUMN_TINTS.length];
  const dotColor = COLUMN_DOT_COLORS[columnIndex % COLUMN_DOT_COLORS.length];

  // v2.1 student-ux — 학생 모드에서만 컬럼 헤더 "+" 버튼 노출 (Padlet 패턴).
  // 회귀 위험 #3 보호: viewerRole='teacher'에서는 onAddCardToColumn이 undefined여서 버튼 부재.
  const showColumnAddButton = viewerRole === 'student' && Boolean(onAddCardToColumn);

  return (
    <section className={`flex min-w-[260px] flex-1 flex-col rounded-xl border border-sp-border bg-sp-surface`}>
      <header className={`flex items-center gap-2 rounded-t-xl border-b border-sp-border px-4 py-3 ${tint}`}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-sp-text">{column.title}</span>
        <span className="shrink-0 rounded-full bg-sp-card/70 px-2 py-0.5 text-xs tabular-nums text-sp-muted">
          {posts.length}
        </span>
        {showColumnAddButton && (
          <button
            type="button"
            onClick={() => onAddCardToColumn?.(column.id)}
            aria-label={`${column.title} 컬럼에 카드 추가`}
            title={`${column.title}에 카드 추가`}
            className="shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full border border-sp-border bg-sp-card text-sky-300 transition hover:border-sky-400/60 hover:bg-sp-card/80 hover:text-sky-200"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
          </button>
        )}
      </header>

      <div
        ref={setNodeRef}
        className={`min-h-[200px] flex-1 space-y-2.5 p-3 transition-colors ${
          isOver ? 'bg-sp-accent/5' : ''
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
                />
              );
            })}
          </SortableContext>
        )}

        {posts.length === 0 && (
          <div className="flex h-full min-h-[160px] items-center justify-center rounded-lg border border-dashed border-sp-border/40 px-4 text-center text-xs text-sp-muted/70">
            {readOnly ? '카드 없음' : '여기로 드래그해 정리하세요'}
          </div>
        )}
      </div>
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

  return (
    <div className="flex h-full min-h-[560px] flex-col">
      <div className="min-h-0 flex-1 overflow-auto pb-2">
        {useReadOnlyDisplay ? (
          <div className="flex gap-3">
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
              />
            ))}
          </div>
        ) : (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <div className="flex gap-3">
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
                />
              ))}
            </div>
          </DndContext>
        )}
      </div>
    </div>
  );
}
