import { useMemo, useCallback, useState } from 'react';
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import type { Todo } from '@domain/entities/Todo';
import { filterActive, filterByCategory } from '@domain/rules/todoRules';
import {
  groupByBucket,
  changesForBucketMove,
  bucketOf,
  AUTO_BOARD_BUCKETS,
  AUTO_BOARD_BUCKET_LABELS,
  AUTO_BOARD_BUCKET_HINTS,
  type AutoBoardBucket,
} from '@domain/rules/todoAutoBoard';
import { toLocalDateString } from '@shared/utils/localDate';
import { KanbanColumn } from '../components/KanbanColumn';
import { TodoEditModal } from '../components/TodoEditModal';
import { BucketMoveConfirm } from '../components/BucketMoveConfirm';

/** 칸 머리 색. '진행 중'만 수동 칸반과 같은 노란색을 쓴다(같은 뜻이므로). */
const BUCKET_COLOR: Record<AutoBoardBucket, string> = {
  triage: 'bg-sp-muted',
  today: 'bg-sp-accent',
  inProgress: 'bg-yellow-500',
  upcoming: 'bg-blue-500',
};

interface AutoBoardViewProps {
  categoryFilter: string | null;
}

/**
 * 자동 배치 보드 — 카드를 손으로 정리하지 않아도 날짜가 자리를 정한다.
 *
 * 수동 칸반과 다른 점 두 가지.
 *  - 칸이 **날짜에서 파생**된다. 상태를 저장하지 않으므로 보기를 껐다 켜도 자리가 유지된다.
 *  - 카드를 끌면 **확인창**이 뜬다. 여기서 옮긴다는 건 날짜를 바꾼다는 뜻이라,
 *    사용자가 적어 둔 마감일이 소리 없이 바뀌면 안 되기 때문이다.
 *
 * 칸·카드는 수동 칸반 것을 그대로 재사용한다(복사하지 않는다).
 */
export function AutoBoardView({ categoryFilter }: AutoBoardViewProps) {
  const { todos, categories, updateTodo, toggleSubTask } = useTodoStore();
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [pendingMove, setPendingMove] = useState<{ todo: Todo; target: AutoBoardBucket } | null>(
    null,
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // 오늘 날짜는 여기서 한 번만 읽어 도메인 규칙에 넣어 준다(규칙은 시계를 모른다).
  const todayStr = toLocalDateString();

  const activeTodos = useMemo(() => {
    let filtered = filterActive(todos);
    if (categoryFilter) filtered = filterByCategory(filtered, categoryFilter);
    return filtered;
  }, [todos, categoryFilter]);

  const buckets = useMemo(() => groupByBucket(activeTodos, todayStr), [activeTodos, todayStr]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const todoId = active.id as string;
      const target =
        (over.data?.current?.columnKey as AutoBoardBucket | undefined) ??
        (typeof over.id === 'string' && over.id.startsWith('column-')
          ? (over.id.replace('column-', '') as AutoBoardBucket)
          : undefined);

      if (!target || !AUTO_BOARD_BUCKETS.includes(target)) return;

      const todo = activeTodos.find((t) => t.id === todoId);
      if (!todo) return;
      // 이미 그 칸에 있으면 아무 일도 하지 않는다(확인창도 띄우지 않는다).
      if (bucketOf(todo, todayStr) === target) return;

      setPendingMove({ todo, target });
    },
    [activeTodos, todayStr],
  );

  const confirmMove = useCallback(() => {
    if (!pendingMove) return;
    const changes = changesForBucketMove(pendingMove.todo, pendingMove.target, todayStr);
    void updateTodo(pendingMove.todo.id, changes);
    setPendingMove(null);
  }, [pendingMove, todayStr, updateTodo]);

  return (
    <>
      {editingTodo && (
        <TodoEditModal
          todo={editingTodo}
          categories={categories}
          onUpdate={(id, changes) => void updateTodo(id, changes)}
          onClose={() => setEditingTodo(null)}
        />
      )}

      {pendingMove && (
        <BucketMoveConfirm
          todo={pendingMove.todo}
          target={pendingMove.target}
          todayStr={todayStr}
          onConfirm={confirmMove}
          onCancel={() => setPendingMove(null)}
        />
      )}

      <p className="text-xs text-sp-muted mb-3">
        마감일과 &lsquo;다시 확인할 날&rsquo;을 보고 자동으로 자리를 정합니다. 완료한 일은 보드에
        나오지 않습니다.
      </p>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {AUTO_BOARD_BUCKETS.map((bucket) => (
            <div key={bucket}>
              <KanbanColumn
                columnKey={bucket}
                label={AUTO_BOARD_BUCKET_LABELS[bucket]}
                colorClass={BUCKET_COLOR[bucket]}
                todos={buckets[bucket]}
                count={buckets[bucket].length}
                categories={categories}
                onEdit={(t) => setEditingTodo(t)}
                onToggleSubTask={toggleSubTask}
              />
              <p className="mt-1 px-1 text-[11px] text-sp-muted">
                {AUTO_BOARD_BUCKET_HINTS[bucket]}
              </p>
            </div>
          ))}
        </div>
      </DndContext>
    </>
  );
}
