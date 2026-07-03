import { useState } from 'react';
import { PRIORITY_CONFIG, calcDDay } from './priorityConfig';
import type { Todo } from '@domain/entities/Todo';

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleSubTask: (todoId: string, subTaskId: string) => void;
}

export function TodoItem({ todo, onToggle, onDelete, onToggleSubTask }: TodoItemProps) {
  const [expanded, setExpanded] = useState(false);
  const priority = todo.priority ?? 'none';
  const priorityCfg = PRIORITY_CONFIG[priority];
  const dday = todo.dueDate ? calcDDay(todo.dueDate) : null;
  const subTasks = todo.subTasks ?? [];
  const hasSubTasks = subTasks.length > 0;
  const completedCount = subTasks.filter((st) => st.completed).length;

  return (
    <li
      className={`border-b border-black/5 dark:border-white/5 transition-opacity ${todo.completed ? 'opacity-40' : ''}`}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {/* 체크박스 */}
        <button
          onClick={() => onToggle(todo.id)}
          className="shrink-0 flex items-center justify-center"
          style={{ minWidth: 44, minHeight: 44 }}
          aria-label={todo.completed ? '완료 취소' : '완료'}
        >
          <div
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
              todo.completed
                ? 'bg-sp-accent border-sp-accent'
                : 'border-sp-border hover:border-sp-accent'
            }`}
          >
            {todo.completed && (
              <svg
                className="w-3.5 h-3.5 text-sp-accent-fg"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="2,6 5,9 10,3" />
              </svg>
            )}
          </div>
        </button>

        {/* 텍스트 + 배지 */}
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm leading-snug break-words ${
              todo.completed ? 'line-through text-sp-muted' : 'text-sp-text'
            }`}
          >
            {todo.text}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {/* 우선순위 배지 (none 제외) */}
            {priority !== 'none' && (
              <span className={`inline-flex items-center gap-0.5 text-xs ${priorityCfg.color}`}>
                {priorityCfg.icon && (
                  <span className="material-symbols-outlined text-icon-sm">{priorityCfg.icon}</span>
                )}
                {priorityCfg.label}
              </span>
            )}
            {/* D-Day 배지 */}
            {dday && <span className={`text-xs font-medium ${dday.colorClass}`}>{dday.label}</span>}
            {/* 하위 할일 배지 */}
            {hasSubTasks && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(!expanded);
                }}
                className="text-xs text-sp-muted hover:text-sp-accent flex items-center gap-0.5"
              >
                <svg
                  className="w-3 h-3"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <polyline points={expanded ? '3,5 6,8 9,5' : '5,3 8,6 5,9'} />
                </svg>
                {completedCount}/{subTasks.length}
              </button>
            )}
          </div>
        </div>

        {/* 삭제 버튼 */}
        <button
          onClick={() => onDelete(todo.id)}
          className="shrink-0 flex items-center justify-center text-sp-muted hover:text-sp-error transition-colors"
          style={{ minWidth: 44, minHeight: 44 }}
          aria-label="삭제"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="2,4 14,4" />
            <path d="M6,4V2h4v2" />
            <rect x="3" y="4" width="10" height="10" rx="1" />
            <line x1="6" y1="7" x2="6" y2="11" />
            <line x1="10" y1="7" x2="10" y2="11" />
          </svg>
        </button>
      </div>

      {/* 하위 할일 목록 */}
      {hasSubTasks && expanded && (
        <div className="px-4 pb-2 pl-14">
          <ul className="space-y-1">
            {subTasks.map((st) => (
              <li key={st.id} className="flex items-center gap-2">
                <button
                  onClick={() => onToggleSubTask(todo.id, st.id)}
                  className="shrink-0 flex items-center justify-center"
                  style={{ minWidth: 32, minHeight: 32 }}
                >
                  <div
                    className={`w-4 h-4 rounded border-[1.5px] flex items-center justify-center transition-colors ${st.completed ? 'bg-sp-accent/70 border-sp-accent/70' : 'border-sp-border hover:border-sp-accent'}`}
                  >
                    {st.completed && (
                      <svg
                        className="w-2.5 h-2.5 text-white"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="2,6 5,9 10,3" />
                      </svg>
                    )}
                  </div>
                </button>
                <span
                  className={`text-xs leading-snug ${st.completed ? 'line-through text-sp-muted' : 'text-sp-text/80'}`}
                >
                  {st.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
