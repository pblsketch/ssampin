import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Todo, TodoStatus, TodoCategory } from '@domain/entities/Todo';
import { KanbanCard } from './KanbanCard';

interface KanbanColumnProps {
  columnKey: TodoStatus;
  label: string;
  colorClass: string;
  todos: readonly Todo[];
  count: number;
  categories: readonly TodoCategory[];
  onEdit?: (todo: Todo) => void;
}

export function KanbanColumn({ columnKey, label, colorClass, todos, count, categories, onEdit }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${columnKey}`,
    data: { columnKey },
  });

  return (
    <div className={`flex-1 min-w-[240px] flex flex-col bg-sp-surface rounded-xl ring-1 transition-colors ${
      isOver ? 'ring-sp-accent/50 bg-sp-accent/5' : 'ring-sp-border'
    }`}>
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-sp-border/50">
        <div className={`w-2 h-2 rounded-full ${colorClass}`} />
        <span className="text-sm font-bold text-sp-text">{label}</span>
        <span className="text-xs text-sp-muted ml-auto">{count}</span>
      </div>

      {/* 카드 목록 (스크롤) */}
      <div ref={setNodeRef} className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[100px]">
        <SortableContext items={todos.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {todos.map(todo => (
            <KanbanCard key={todo.id} todo={todo} columnKey={columnKey} categories={categories} onEdit={onEdit} />
          ))}
        </SortableContext>
        {todos.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-sp-muted text-xs
                          border-2 border-dashed border-sp-border/30 rounded-lg m-1">
            <span className="material-symbols-outlined text-2xl mb-1 opacity-30">add_circle_outline</span>
            <span>드래그하여 추가</span>
          </div>
        )}
      </div>
    </div>
  );
}
