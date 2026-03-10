import { useEffect, useMemo } from 'react';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import type { Todo } from '@domain/entities/Todo';
import { filterActive, sortTodos } from '@domain/rules/todoRules';
import { PRIORITY_CONFIG } from '@domain/valueObjects/TodoPriority';

const MAX_VISIBLE = 20;

export function DashboardTodo() {
  const { todos, load, toggleTodo } = useTodoStore();

  useEffect(() => {
    void load();
  }, [load]);

  // 아카이브 제외 + 정렬 (우선순위 반영)
  const sorted = useMemo<readonly Todo[]>(() => {
    const active = filterActive(todos);
    return sortTodos(active);
  }, [todos]);

  const visible = sorted.slice(0, MAX_VISIBLE);
  const activeTodos = useMemo(() => filterActive(todos), [todos]);
  const completedCount = activeTodos.filter((t) => t.completed).length;
  const totalCount = activeTodos.length;

  // 미완료/완료 분리 (구분선용)
  const incomplete = visible.filter((t) => !t.completed);
  const completed = visible.filter((t) => t.completed);

  return (
    <div className="rounded-xl bg-sp-card p-4 h-full flex flex-col">
      {/* 헤더 */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-sp-text">오늘 할 일</h3>
        {totalCount > 0 && (
          <span className="text-xs text-sp-muted">
            {completedCount}/{totalCount} 완료
          </span>
        )}
      </div>

      {/* 콘텐츠 - 스크롤 가능 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {totalCount === 0 ? (
          <div className="flex items-center justify-center py-6">
            <p className="text-sm text-sp-muted">할 일이 없습니다</p>
          </div>
        ) : (
          <>
            {/* 미완료 목록 */}
            <ul className="space-y-1">
              {incomplete.map((todo) => (
                <TodoItem
                  key={todo.id}
                  todo={todo}
                  onToggle={toggleTodo}
                />
              ))}
            </ul>

            {/* 완료 항목 구분선 */}
            {completed.length > 0 && incomplete.length > 0 && (
              <div className="my-2 border-t border-sp-border/30" />
            )}

            {/* 완료 목록 */}
            {completed.length > 0 && (
              <ul className="space-y-1">
                {completed.map((todo) => (
                  <TodoItem
                    key={todo.id}
                    todo={todo}
                    onToggle={toggleTodo}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─── 마감일 라벨 ─── */

function getDueDateLabel(dueDate?: string): { text: string; className: string } | null {
  if (!dueDate) return null;

  const today = new Date();
  const todayStr = formatLocalDate(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatLocalDate(tomorrow);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = formatLocalDate(weekEnd);

  if (dueDate < todayStr) {
    return { text: '지남', className: 'text-red-400 font-bold' };
  }
  if (dueDate === todayStr) {
    return { text: '오늘', className: 'text-red-400' };
  }
  if (dueDate === tomorrowStr) {
    return { text: '내일', className: 'text-orange-400' };
  }
  if (dueDate <= weekEndStr) {
    const day = new Date(dueDate + 'T00:00:00');
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    return { text: dayNames[day.getDay()] ?? '', className: 'text-sp-muted' };
  }

  // 그 이후: M/D
  const parts = dueDate.split('-');
  const m = parts[1] ?? '1';
  const d = parts[2] ?? '1';
  return { text: `${parseInt(m)}/${parseInt(d)}`, className: 'text-sp-muted' };
}

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/* ─── 서브 컴포넌트 ─── */

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string) => void;
}

function TodoItem({ todo, onToggle }: TodoItemProps) {
  const priorityConfig = PRIORITY_CONFIG[todo.priority ?? 'none'];
  const showPriority = todo.priority && todo.priority !== 'none';
  const dueDateLabel = getDueDateLabel(todo.dueDate);

  return (
    <li
      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-sp-surface/50"
      onClick={(e) => { e.stopPropagation(); onToggle(todo.id); }}
    >
      <Checkbox checked={todo.completed} />

      {/* 우선순위 dot */}
      {showPriority && (
        <span className={`text-[9px] ${priorityConfig.color}`}>
          {priorityConfig.icon}
        </span>
      )}

      <span
        className={`flex-1 text-sm leading-tight truncate transition-all ${
          todo.completed
            ? 'text-sp-muted line-through opacity-50'
            : 'text-sp-text'
        }`}
      >
        {todo.text}
      </span>

      {/* 마감일 라벨 */}
      {dueDateLabel && !todo.completed && (
        <span className={`text-[11px] flex-shrink-0 ${dueDateLabel.className}`}>
          {dueDateLabel.text}
        </span>
      )}
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
