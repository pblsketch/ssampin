import { useMemo, useCallback, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import type { Todo } from '@domain/entities/Todo';
import { filterActive, filterByCategory } from '@domain/rules/todoRules';
import {
  groupByQuadrant,
  quadrantTargetChanges,
  QUADRANT_META,
  type EisenhowerQuadrant,
} from '@domain/rules/eisenhowerMatrix';
import { TodoEditModal } from '../components/TodoEditModal';

interface MatrixViewProps {
  categoryFilter: string | null;
}

const QUADRANT_ORDER: EisenhowerQuadrant[] = ['q1', 'q2', 'q3', 'q4'];

/** 분면별 강조 색(sp 토큰 기반 ring/bg) — 데이터 아님, 표시용. */
const QUADRANT_ACCENT: Record<EisenhowerQuadrant, string> = {
  q1: 'ring-red-500/40',
  q2: 'ring-sp-accent/40',
  q3: 'ring-amber-500/40',
  q4: 'ring-sp-border',
};

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-sky-500',
  none: 'bg-sp-border',
};

function MatrixCard({ todo, onEdit }: { todo: Todo; onEdit: (t: Todo) => void }): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: todo.id,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onEdit(todo)}
      className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-sp-card ring-1 ring-sp-border text-xs cursor-grab active:cursor-grabbing hover:ring-sp-accent transition-colors ${
        isDragging ? 'opacity-50' : ''
      } ${todo.completed ? 'text-sp-muted line-through' : 'text-sp-text'}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[todo.priority ?? 'none']}`}
      />
      <span className="truncate flex-1">{todo.text}</span>
      {todo.dueDate && (
        <span className="shrink-0 text-sp-muted text-caption">
          {todo.dueDate.slice(5).replace('-', '/')}
        </span>
      )}
    </div>
  );
}

function QuadrantCell({
  quadrant,
  todos,
  onEdit,
}: {
  quadrant: EisenhowerQuadrant;
  todos: readonly Todo[];
  onEdit: (t: Todo) => void;
}): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: quadrant });
  const meta = QUADRANT_META[quadrant];
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-2 p-3 rounded-xl bg-sp-surface ring-1 ${QUADRANT_ACCENT[quadrant]} ${
        isOver ? 'ring-2 ring-sp-accent bg-sp-card' : ''
      } min-h-[180px] transition-colors`}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-sp-text">{meta.title}</h3>
        <span className="text-caption text-sp-muted">{meta.subtitle}</span>
      </div>
      <div className="flex flex-col gap-1.5 overflow-y-auto">
        {todos.length === 0 ? (
          <p className="text-xs text-sp-muted/70 py-4 text-center">항목 없음</p>
        ) : (
          todos.map((todo) => <MatrixCard key={todo.id} todo={todo} onEdit={onEdit} />)
        )}
      </div>
    </div>
  );
}

export function MatrixView({ categoryFilter }: MatrixViewProps): JSX.Element {
  const { todos, categories, updateTodo } = useTodoStore();
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const activeTodos = useMemo(() => {
    let filtered = filterActive(todos);
    if (categoryFilter) filtered = filterByCategory(filtered, categoryFilter);
    return filtered;
  }, [todos, categoryFilter]);

  const quadrants = useMemo(() => groupByQuadrant(activeTodos, new Date()), [activeTodos]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;
      const target = over.id as EisenhowerQuadrant;
      if (!QUADRANT_ORDER.includes(target)) return;
      const todo = activeTodos.find((t) => t.id === active.id);
      if (!todo) return;
      const changes = quadrantTargetChanges(target, new Date());
      // 이미 의도한 우선순위·긴급도면 불필요한 저장 회피.
      if (todo.priority === changes.priority && todo.dueDate === changes.dueDate) return;
      void updateTodo(todo.id, changes);
    },
    [activeTodos, updateTodo],
  );

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
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {QUADRANT_ORDER.map((q) => (
            <QuadrantCell
              key={q}
              quadrant={q}
              todos={quadrants[q]}
              onEdit={(t) => setEditingTodo(t)}
            />
          ))}
        </div>
      </DndContext>
      <p className="mt-3 text-caption text-sp-muted text-center">
        긴급(마감 임박) × 중요(우선순위 높음) 기준 · 카드를 드래그해 분면을 옮기면 우선순위·마감이
        조정됩니다
      </p>
    </>
  );
}
