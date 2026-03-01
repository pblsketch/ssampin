import { useEffect, useMemo } from 'react';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import type { Todo } from '@domain/entities/Todo';

const MAX_VISIBLE = 5;

export function DashboardTodo() {
  const { todos, load, toggleTodo } = useTodoStore();

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo<readonly Todo[]>(() => {
    const incomplete = todos.filter((t) => !t.completed);
    const complete = todos.filter((t) => t.completed);
    return [...incomplete, ...complete];
  }, [todos]);

  const visible = sorted.slice(0, MAX_VISIBLE);
  const completedCount = todos.filter((t) => t.completed).length;
  const totalCount = todos.length;

  return (
    <div className="rounded-xl bg-sp-card p-4">
      {/* 헤더 */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-sp-text">오늘 할 일</h3>
      </div>

      {/* 콘텐츠 */}
      {totalCount === 0 ? (
        <div className="flex items-center justify-center py-6">
          <p className="text-sm text-sp-muted">할 일이 없습니다</p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {visible.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={toggleTodo}
              />
            ))}
          </ul>

          {/* 진행 현황 */}
          <p className="mt-3 text-right text-xs text-sp-muted">
            {completedCount}/{totalCount} 완료
          </p>
        </>
      )}
    </div>
  );
}

/* ─── 서브 컴포넌트 ─── */

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string) => void;
}

function TodoItem({ todo, onToggle }: TodoItemProps) {
  return (
    <li
      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-sp-surface/50"
      onClick={() => onToggle(todo.id)}
    >
      <Checkbox checked={todo.completed} />
      <span
        className={`flex-1 text-sm leading-tight transition-all ${
          todo.completed
            ? 'text-sp-muted line-through opacity-50'
            : 'text-sp-text'
        }`}
      >
        {todo.text}
      </span>
    </li>
  );
}

interface CheckboxProps {
  checked: boolean;
}

function Checkbox({ checked }: CheckboxProps) {
  return (
    <div
      className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded transition-colors ${
        checked
          ? 'border border-sp-accent bg-sp-accent'
          : 'border border-sp-border hover:border-sp-accent'
      }`}
    >
      {checked && (
        <svg
          viewBox="0 0 10 8"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-2.5 w-2.5"
        >
          <path
            d="M1 4L3.5 6.5L9 1"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}
