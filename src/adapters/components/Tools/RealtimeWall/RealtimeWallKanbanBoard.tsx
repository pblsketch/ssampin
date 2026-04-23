import { useMemo } from 'react';
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
  onTogglePin,
  onHidePost,
  onOpenLink,
  onHeart,
}: {
  post: RealtimeWallPost;
  onTogglePin?: (postId: string) => void;
  onHidePost?: (postId: string) => void;
  onOpenLink?: (url: string) => void;
  onHeart?: (postId: string) => void;
}) {
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
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <RealtimeWallCard
        post={post}
        compact
        onOpenLink={onOpenLink}
        onHeart={onHeart}
        dragHandle={(
          <button
            type="button"
            className="rounded-md p-1 text-sp-muted/60 transition hover:bg-sp-text/5 hover:text-sp-text cursor-grab active:cursor-grabbing"
            title="드래그 이동"
            {...attributes}
            {...listeners}
          >
            <span className="material-symbols-outlined text-[16px]">drag_indicator</span>
          </button>
        )}
        actions={(
          <RealtimeWallCardActions
            onTogglePin={onTogglePin ? () => onTogglePin(post.id) : undefined}
            onHide={onHidePost ? () => onHidePost(post.id) : undefined}
          />
        )}
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

function KanbanColumnView({
  column,
  columnIndex,
  posts,
  readOnly,
  onTogglePin,
  onHidePost,
  onOpenLink,
  onHeart,
}: {
  column: RealtimeWallColumn;
  columnIndex: number;
  posts: readonly RealtimeWallPost[];
  readOnly: boolean;
  onTogglePin?: (postId: string) => void;
  onHidePost?: (postId: string) => void;
  onOpenLink?: (url: string) => void;
  onHeart?: (postId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${column.id}`,
    data: { type: 'column', columnId: column.id },
    disabled: readOnly,
  });

  const tint = COLUMN_TINTS[columnIndex % COLUMN_TINTS.length];
  const dotColor = COLUMN_DOT_COLORS[columnIndex % COLUMN_DOT_COLORS.length];

  return (
    <section className={`flex min-w-[260px] flex-1 flex-col rounded-xl border border-sp-border bg-sp-surface`}>
      <header className={`flex items-center gap-2 rounded-t-xl border-b border-sp-border px-4 py-3 ${tint}`}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-sp-text">{column.title}</span>
        <span className="shrink-0 rounded-full bg-sp-card/70 px-2 py-0.5 text-xs tabular-nums text-sp-muted">
          {posts.length}
        </span>
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
            />
          ))
        ) : (
          <SortableContext items={posts.map((post) => post.id)} strategy={verticalListSortingStrategy}>
            {posts.map((post) => (
              <SortableRealtimeWallCardItem
                key={post.id}
                post={post}
                onTogglePin={onTogglePin}
                onHidePost={onHidePost}
                onOpenLink={onOpenLink}
                onHeart={onHeart}
              />
            ))}
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
}: RealtimeWallKanbanBoardProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const approvedPosts = useMemo(
    () => posts.filter((post) => post.status === 'approved'),
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
    if (readOnly || !onChangePosts) return;

    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const activePost = approvedPosts.find((post) => post.id === activeId);
    if (!activePost) return;

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

    onChangePosts(moveKanbanPost(posts, activeId, targetColumnId, targetIndex));
  };

  return (
    <div className="flex h-full min-h-[560px] flex-col">
      <div className="min-h-0 flex-1 overflow-auto pb-2">
        {readOnly ? (
          <div className="flex gap-3">
            {postsByColumn.map(({ column, posts: columnPosts }, index) => (
              <KanbanColumnView
                key={column.id}
                column={column}
                columnIndex={index}
                posts={columnPosts}
                readOnly
                onOpenLink={onOpenLink}
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
                />
              ))}
            </div>
          </DndContext>
        )}
      </div>
    </div>
  );
}
