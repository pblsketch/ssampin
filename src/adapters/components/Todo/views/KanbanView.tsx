import { useMemo, useCallback, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import type { Todo, TodoStatus } from '@domain/entities/Todo';
import {
  inferStatus,
  applyStatusChange,
  filterActive,
  filterByCategory,
} from '@domain/rules/todoRules';
import { KanbanColumn } from '../components/KanbanColumn';
import { TodoEditModal } from '../components/TodoEditModal';

const KANBAN_COLUMNS: { key: TodoStatus; label: string; colorClass: string }[] = [
  { key: 'todo', label: '할 일', colorClass: 'bg-blue-500' },
  { key: 'inProgress', label: '진행 중', colorClass: 'bg-yellow-500' },
  { key: 'done', label: '완료', colorClass: 'bg-green-500' },
];

interface KanbanViewProps {
  categoryFilter: string | null;
}

export function KanbanView({ categoryFilter }: KanbanViewProps) {
  const { todos, categories, updateTodo, archiveCompleted } = useTodoStore();
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // 활성 할 일 필터링 + 카테고리 필터 적용
  const activeTodos = useMemo(() => {
    let filtered = filterActive(todos);
    if (categoryFilter) {
      filtered = filterByCategory(filtered, categoryFilter);
    }
    return filtered;
  }, [todos, categoryFilter]);

  // 상태별 그룹핑
  const columns = useMemo(() => ({
    todo: activeTodos.filter(t => inferStatus(t) === 'todo'),
    inProgress: activeTodos.filter(t => inferStatus(t) === 'inProgress'),
    done: activeTodos.filter(t => inferStatus(t) === 'done'),
  }), [activeTodos]);

  // 드래그앤드롭: 컬럼 간 이동 시 status 변경
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const todoId = active.id as string;

    // 드롭 대상에서 컬럼 키 추출 (카드 위에 드롭 또는 컬럼 빈 영역에 드롭)
    const targetColumn = (over.data?.current?.columnKey as TodoStatus | undefined)
      ?? (typeof over.id === 'string' && over.id.startsWith('column-')
        ? over.id.replace('column-', '') as TodoStatus
        : undefined);

    if (!targetColumn) return;

    const todo = activeTodos.find(t => t.id === todoId);
    if (!todo || inferStatus(todo) === targetColumn) return;

    // status + completed 동기화 업데이트
    const changes = applyStatusChange(todo, targetColumn);
    void updateTodo(todoId, changes);
  }, [activeTodos, updateTodo]);

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
      <div className="flex gap-4 h-[calc(100vh-320px)] min-h-[400px]">
        {KANBAN_COLUMNS.map(col => (
          <KanbanColumn
            key={col.key}
            columnKey={col.key}
            label={col.label}
            colorClass={col.colorClass}
            todos={columns[col.key]}
            count={columns[col.key].length}
            categories={categories}
            onEdit={(t) => setEditingTodo(t)}
          />
        ))}
      </div>
    </DndContext>

    {/* 완료 항목 아카이브 */}
    {columns.done.length > 0 && (
      <div className="flex justify-center mt-4">
        <button
          type="button"
          onClick={() => void archiveCompleted()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-sp-muted hover:text-sp-text bg-sp-card hover:bg-sp-surface ring-1 ring-sp-border transition-colors"
        >
          <span className="text-base">📦</span>
          완료 항목 모두 아카이브 ({columns.done.length}건)
        </button>
      </div>
    )}
    </>
  );
}
