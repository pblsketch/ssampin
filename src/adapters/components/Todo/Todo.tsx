import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import type { Todo as TodoType } from '@domain/entities/Todo';
import {
  sortTodos,
  filterByDateRange,
  groupByDate,
  isOverdue,
} from '@domain/rules/todoRules';

type DateFilter = 'all' | 'today' | 'week';

const FILTER_LABELS: Record<DateFilter, string> = {
  all: '전체',
  today: '오늘',
  week: '이번 주',
};

const GROUP_LABELS: Record<string, string> = {
  overdue: '지난 할 일',
  today: '오늘',
  tomorrow: '내일',
  thisWeek: '이번 주',
  later: '나중에',
  noDueDate: '날짜 없음',
};

const GROUP_ORDER = ['overdue', 'today', 'tomorrow', 'thisWeek', 'later', 'noDueDate'];

export function Todo() {
  const { todos, loaded, load, addTodo, toggleTodo, deleteTodo } = useTodoStore();

  const [filter, setFilter] = useState<DateFilter>('all');
  const [newText, setNewText] = useState('');
  const [newDueDate, setNewDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    void load();
  }, [load]);

  const now = useMemo(() => new Date(), []);

  // 필터 → 정렬
  const filtered = useMemo(() => {
    const byRange = filterByDateRange(todos, filter, now);
    return sortTodos(byRange);
  }, [todos, filter, now]);

  // 그룹핑
  const groups = useMemo(() => groupByDate(filtered, now), [filtered, now]);

  // 진행률
  const completedCount = todos.filter((t) => t.completed).length;
  const totalCount = todos.length;
  const progressPercent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  const handleAdd = useCallback(() => {
    const text = newText.trim();
    if (!text) return;
    void addTodo(text, newDueDate || undefined);
    setNewText('');
  }, [newText, newDueDate, addTodo]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd],
  );

  const toggleGroup = useCallback((group: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  }, []);

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sp-muted text-lg">로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full -m-8">
      {/* 헤더 */}
      <header className="h-20 shrink-0 px-8 flex items-center justify-between border-b border-sp-border bg-sp-bg">
        <h2 className="text-sp-text text-2xl font-bold flex items-center gap-3">
          <span className="text-3xl">✅</span> 할 일
        </h2>

        {/* 진행률 바 */}
        <div className="flex items-center gap-3">
          <div className="w-40 h-2.5 bg-sp-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-sp-accent rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-sm text-sp-muted font-medium whitespace-nowrap">
            {completedCount}/{totalCount} 완료 ({progressPercent}%)
          </span>
        </div>
      </header>

      {/* 콘텐츠 */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-3xl mx-auto flex flex-col gap-6">
          {/* 필터 탭 */}
          <div className="flex gap-3">
            {(Object.keys(FILTER_LABELS) as DateFilter[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`px-5 py-2 rounded-full text-sm font-bold shadow-sm ring-1 transition-colors ${
                  filter === key
                    ? 'bg-sp-accent text-white ring-sp-accent/30'
                    : 'bg-sp-card hover:bg-sp-surface text-sp-muted ring-sp-border/50'
                }`}
              >
                {FILTER_LABELS[key]}
              </button>
            ))}
          </div>

          {/* 추가 폼 */}
          <div className="flex gap-3 items-center bg-sp-card rounded-xl p-4 ring-1 ring-sp-border">
            <input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="bg-sp-surface text-sp-text text-sm px-3 py-2 rounded-lg border border-sp-border focus:border-sp-accent focus:outline-none transition-colors"
            />
            <input
              type="text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="할 일을 입력하세요..."
              className="flex-1 bg-sp-surface text-sp-text text-sm px-4 py-2 rounded-lg border border-sp-border focus:border-sp-accent focus:outline-none transition-colors placeholder:text-sp-muted"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!newText.trim()}
              className="flex items-center gap-2 bg-sp-accent hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded-xl transition-all shadow-lg shadow-sp-accent/20 text-sm font-bold"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              추가
            </button>
          </div>

          {/* 투두 리스트 (그룹별) */}
          {totalCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-sp-muted">
              <span className="material-symbols-outlined text-5xl mb-3 opacity-40">
                checklist
              </span>
              <p className="text-lg">할 일이 없습니다</p>
              <p className="text-sm mt-1">위에서 새로운 할 일을 추가해보세요</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {GROUP_ORDER.map((groupKey) => {
                const items = groups[groupKey];
                if (!items || items.length === 0) return null;

                const isCollapsed = collapsedGroups[groupKey] ?? false;

                return (
                  <TodoGroup
                    key={groupKey}
                    label={GROUP_LABELS[groupKey] ?? groupKey}
                    count={items.length}
                    isOverdueGroup={groupKey === 'overdue'}
                    collapsed={isCollapsed}
                    onToggleCollapse={() => toggleGroup(groupKey)}
                  >
                    {!isCollapsed &&
                      sortTodos(items).map((todo) => (
                        <TodoItem
                          key={todo.id}
                          todo={todo}
                          overdue={isOverdue(todo, now)}
                          onToggle={toggleTodo}
                          onDelete={deleteTodo}
                        />
                      ))}
                  </TodoGroup>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── 서브 컴포넌트 ─── */

interface TodoGroupProps {
  label: string;
  count: number;
  isOverdueGroup: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  children: React.ReactNode;
}

function TodoGroup({
  label,
  count,
  isOverdueGroup,
  collapsed,
  onToggleCollapse,
  children,
}: TodoGroupProps) {
  return (
    <div className="bg-sp-card rounded-xl ring-1 ring-sp-border overflow-hidden">
      {/* 그룹 헤더 */}
      <button
        type="button"
        onClick={onToggleCollapse}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-sp-surface/50 transition-colors"
      >
        <span
          className={`material-symbols-outlined text-[18px] transition-transform ${
            collapsed ? '' : 'rotate-90'
          } ${isOverdueGroup ? 'text-red-400' : 'text-sp-muted'}`}
        >
          chevron_right
        </span>
        <span
          className={`text-sm font-bold ${
            isOverdueGroup ? 'text-red-400' : 'text-sp-text'
          }`}
        >
          {label}
        </span>
        <span className="text-xs text-sp-muted ml-1">({count})</span>
      </button>

      {/* 아이템 리스트 */}
      {children}
    </div>
  );
}

interface TodoItemProps {
  todo: TodoType;
  overdue: boolean;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

function TodoItem({ todo, overdue, onToggle, onDelete }: TodoItemProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <li
      className="flex items-center gap-3 px-4 py-2.5 border-t border-sp-border/50 transition-colors hover:bg-sp-surface/30 cursor-pointer"
      onClick={() => onToggle(todo.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* 체크박스 */}
      <Checkbox checked={todo.completed} />

      {/* 텍스트 */}
      <span
        className={`flex-1 text-sm leading-tight transition-all ${
          todo.completed
            ? 'text-sp-muted line-through opacity-50'
            : 'text-sp-text'
        }`}
      >
        {todo.text}
      </span>

      {/* 날짜 라벨 */}
      {todo.dueDate && (
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded ${
            overdue
              ? 'text-red-400 bg-red-400/10'
              : todo.completed
                ? 'text-sp-muted/50'
                : 'text-sp-muted'
          }`}
        >
          {formatDueDate(todo.dueDate)}
        </span>
      )}

      {/* 삭제 버튼 (호버 시) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(todo.id);
        }}
        className={`p-1 rounded-lg transition-all ${
          hovered
            ? 'opacity-100 text-red-400 hover:bg-red-400/10'
            : 'opacity-0'
        }`}
      >
        <span className="material-symbols-outlined text-[18px]">close</span>
      </button>
    </li>
  );
}

interface CheckboxProps {
  checked: boolean;
}

function Checkbox({ checked }: CheckboxProps) {
  return (
    <div
      className={`flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded transition-colors ${
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

/** "YYYY-MM-DD" → "M/D" 형식 */
function formatDueDate(dateStr: string): string {
  const parts = dateStr.split('-');
  const monthStr = parts[1];
  const dayStr = parts[2];
  if (parts.length !== 3 || !monthStr || !dayStr) return dateStr;
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  return `${month}/${day}`;
}
