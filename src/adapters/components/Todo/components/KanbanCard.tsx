import React, { useState, useEffect, useRef } from 'react';
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
  onToggleSubTask?: (todoId: string, subTaskId: string) => Promise<void>;
}

export const KanbanCard = React.memo(function KanbanCard({
  todo,
  columnKey,
  categories,
  onEdit,
  onToggleSubTask,
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

  const progressFillColor = columnKey === 'done' ? 'bg-green-500'
    : columnKey === 'inProgress' ? 'bg-yellow-500'
    : 'bg-blue-500';

  const handleClick = () => {
    if (!isDragging && onEdit) onEdit(todo);
  };

  const subTasks = todo.subTasks ?? [];
  const completedCount = subTasks.filter(s => s.completed).length;
  const totalCount = subTasks.length;
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPopoverOpen) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isPopoverOpen]);

  const handleProgressClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isDragging) setIsPopoverOpen(prev => !prev);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className={`bg-sp-card rounded-lg p-3 ring-1 ring-sp-border/50 border-l-2 ${borderColor}
                 hover:ring-sp-accent/30 cursor-grab active:cursor-grabbing
                 transition-shadow group relative`}
    >
      {/* 우선순위 + 텍스트 */}
      <div className="flex items-start gap-2">
        {priorityConfig && (
          <span className="text-xs mt-0.5">{priorityConfig.icon}</span>
        )}
        <span className={`text-sm text-sp-text leading-snug flex-1 ${todo.completed ? 'line-through opacity-50' : ''}`}>
          {todo.text}
        </span>
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
      </div>

      {/* 서브태스크 진행 바 */}
      {totalCount > 0 && (
        <div
          ref={popoverRef}
          className="mt-2 cursor-pointer select-none"
          onClick={handleProgressClick}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="h-2 rounded-full bg-sp-border overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${progressFillColor}`}
              style={{ width: `${Math.max(progressPct, 4)}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-sp-muted">
              <span className="material-symbols-outlined text-[10px] align-middle mr-0.5">checklist</span>
              하위 할 일
            </span>
            <span className="text-[10px] text-sp-muted">{completedCount} / {totalCount} 완료</span>
          </div>

          {/* 팝오버 */}
          {isPopoverOpen && (
            <div
              className="absolute z-50 left-0 right-0 top-full mt-1 bg-sp-surface ring-1 ring-sp-border rounded-xl p-3 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-xs font-medium text-sp-text mb-2 truncate">{todo.text}</p>
              <div className="border-t border-sp-border/50 mb-2" />
              <ul className="space-y-1.5">
                {subTasks.map(st => (
                  <li key={st.id} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={st.completed}
                      onChange={(e) => {
                        e.stopPropagation();
                        void onToggleSubTask?.(todo.id, st.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5 accent-sp-accent cursor-pointer flex-shrink-0"
                    />
                    <span className={`text-xs ${st.completed ? 'line-through opacity-50 text-sp-muted' : 'text-sp-text'}`}>
                      {st.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
