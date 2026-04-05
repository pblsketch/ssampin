import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Todo, TodoStatus } from '@domain/entities/Todo';
import type { TodoCategory } from '@domain/entities/Todo';
import { PRIORITY_CONFIG } from '@domain/valueObjects/TodoPriority';
import { isOverdue } from '@domain/rules/todoRules';

interface KanbanCardProps {
  todo: Todo;
  columnKey: TodoStatus;
  categories: readonly TodoCategory[];
  onEdit?: (todo: Todo) => void;
}

export const KanbanCard = React.memo(function KanbanCard({
  todo,
  columnKey,
  categories,
  onEdit,
}: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: todo.id,
    data: { columnKey },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const priorityConfig = todo.priority && todo.priority !== 'none'
    ? PRIORITY_CONFIG[todo.priority]
    : null;

  const category = categories.find(c => c.id === todo.category);
  const overdue = isOverdue(todo);

  const borderColor = columnKey === 'done' ? 'border-l-green-500'
    : columnKey === 'inProgress' ? 'border-l-yellow-500'
    : 'border-l-blue-500';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-sp-card rounded-lg p-3 ring-1 ring-sp-border/50 border-l-2 ${borderColor}
                 hover:ring-sp-accent/30 cursor-grab active:cursor-grabbing
                 transition-shadow group`}
    >
      {/* 우선순위 + 텍스트 */}
      <div className="flex items-start gap-2">
        {priorityConfig && (
          <span className="text-xs mt-0.5">{priorityConfig.icon}</span>
        )}
        <span className={`text-sm text-sp-text leading-snug flex-1 ${todo.completed ? 'line-through opacity-50' : ''}`}>
          {todo.text}
        </span>
        {onEdit && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onEdit(todo); }}
            className="text-sp-muted hover:text-sp-text opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          >
            <span className="material-symbols-outlined text-base">edit</span>
          </button>
        )}
      </div>

      {/* 메타 정보 */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {category && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sp-surface text-sp-muted">
            {category.icon} {category.name}
          </span>
        )}
        {todo.dueDate && (
          <span className={`text-xs ${overdue ? 'text-red-400' : 'text-sp-muted'}`}>
            📅 {todo.dueDate.slice(5)}
          </span>
        )}
        {todo.subTasks && todo.subTasks.length > 0 && (
          <span className="text-xs text-sp-muted">
            ✓ {todo.subTasks.filter(s => s.completed).length}/{todo.subTasks.length}
          </span>
        )}
      </div>
    </div>
  );
});
