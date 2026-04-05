import { useState, useMemo, useCallback } from 'react';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import type { Todo } from '@domain/entities/Todo';
import type { TodoCategory } from '@domain/entities/Todo';
import { TodoEditModal } from '../components/TodoEditModal';
import { PRIORITY_CONFIG } from '@domain/valueObjects/TodoPriority';
import {
  inferStatus,
  filterActive,
  filterByCategory,
  groupByCategory,
  groupByPriority,
  groupByStatus,
  groupByDate,
  isOverdue,
} from '@domain/rules/todoRules';

type ListGroupBy = 'category' | 'priority' | 'status' | 'dueDate';

const GROUP_OPTIONS: { key: ListGroupBy; label: string }[] = [
  { key: 'category', label: '카테고리' },
  { key: 'priority', label: '우선순위' },
  { key: 'status', label: '상태' },
  { key: 'dueDate', label: '마감일' },
];

const DATE_GROUP_LABELS: Record<string, string> = {
  overdue: '⏰ 지난 할 일',
  today: '📅 오늘',
  tomorrow: '📅 내일',
  thisWeek: '📅 이번 주',
  later: '📅 나중에',
  noDueDate: '📅 기한 없음',
};

interface ListViewProps {
  categoryFilter: string | null;
}

export function ListView({ categoryFilter }: ListViewProps) {
  const { todos, categories, toggleTodo, updateTodo } = useTodoStore();

  const activeTodos = useMemo(() => {
    let filtered = filterActive(todos);
    if (categoryFilter) {
      filtered = filterByCategory(filtered, categoryFilter);
    }
    return filtered;
  }, [todos, categoryFilter]);

  // 카테고리 필터가 적용된 상태에서 카테고리 그룹핑은 의미 없음
  const defaultGroupBy = categoryFilter ? 'status' : 'category';
  const [groupBy, setGroupBy] = useState<ListGroupBy>(defaultGroupBy);

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // 그룹핑
  const grouped = useMemo(() => {
    switch (groupBy) {
      case 'category':
        return groupByCategory(activeTodos, categories);
      case 'priority':
        return groupByPriority(activeTodos);
      case 'status':
        return groupByStatus(activeTodos);
      case 'dueDate': {
        const raw = groupByDate(activeTodos);
        // 라벨 변환
        const result: Record<string, readonly Todo[]> = {};
        for (const [key, items] of Object.entries(raw)) {
          if (items.length > 0) {
            result[DATE_GROUP_LABELS[key] ?? key] = items;
          }
        }
        return result;
      }
      default:
        return { '전체': activeTodos };
    }
  }, [activeTodos, categories, groupBy]);

  return (
    <div className="bg-sp-card rounded-xl ring-1 ring-sp-border overflow-hidden">
      {/* 그룹핑 선택 */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-sp-border/50 bg-sp-surface">
        <span className="text-xs text-sp-muted">그룹:</span>
        {GROUP_OPTIONS.map(g => (
          <button
            key={g.key}
            type="button"
            onClick={() => setGroupBy(g.key)}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              groupBy === g.key ? 'bg-sp-accent text-white' : 'text-sp-muted hover:text-sp-text'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* 테이블 헤더 */}
      <div className="flex items-center px-4 py-2 border-b border-sp-border/50 text-xs font-bold text-sp-muted">
        <div className="w-8" />
        <div className="flex-[3]">할 일</div>
        <div className="flex-1 hidden sm:block">카테고리</div>
        <div className="flex-1">마감일</div>
        <div className="flex-1 hidden sm:block">우선순위</div>
        <div className="flex-1">상태</div>
      </div>

      {/* 그룹별 행 렌더링 */}
      {Object.entries(grouped).map(([groupName, items]) => {
        if (items.length === 0) return null;
        const isCollapsed = collapsedGroups[groupName] ?? false;

        return (
          <div key={groupName}>
            <button
              type="button"
              onClick={() => toggleGroup(groupName)}
              className="w-full px-4 py-2 bg-sp-surface/50 border-b border-sp-border/30 flex items-center gap-2 hover:bg-sp-surface transition-colors text-left"
            >
              <span className="material-symbols-outlined text-icon text-sp-muted transition-transform" style={{ transform: isCollapsed ? 'rotate(-90deg)' : '' }}>
                expand_more
              </span>
              <span className="text-xs font-bold text-sp-text">
                {groupName === 'undefined' ? '📌 미분류' : groupName} ({items.length})
              </span>
            </button>
            {!isCollapsed && items.map(todo => (
              <ListViewRow
                key={todo.id}
                todo={todo}
                categories={categories}
                onToggle={toggleTodo}
                onStatusChange={(id, status) => void updateTodo(id, { status })}
                onEdit={(t) => setEditingTodo(t)}
              />
            ))}
          </div>
        );
      })}

      {/* 빈 상태 */}
      {activeTodos.length === 0 && (
        <div className="flex items-center justify-center py-16 text-sp-muted">
          <div className="text-center">
            <span className="material-symbols-outlined text-5xl mb-3 opacity-40">checklist</span>
            <p className="text-lg">할 일이 없습니다</p>
          </div>
        </div>
      )}

      {editingTodo && (
        <TodoEditModal
          todo={editingTodo}
          categories={categories}
          onUpdate={(id, changes) => void updateTodo(id, changes)}
          onClose={() => setEditingTodo(null)}
        />
      )}
    </div>
  );
}

/* ─── ListViewRow ─── */

interface ListViewRowProps {
  todo: Todo;
  categories: readonly TodoCategory[];
  onToggle: (id: string) => void;
  onStatusChange: (id: string, status: 'todo' | 'inProgress' | 'done') => void;
  onEdit: (todo: Todo) => void;
}

function ListViewRow({ todo, categories, onToggle, onStatusChange, onEdit }: ListViewRowProps) {
  const category = categories.find(c => c.id === todo.category);
  const priority = todo.priority && todo.priority !== 'none' ? PRIORITY_CONFIG[todo.priority] : null;
  const status = inferStatus(todo);
  const overdue = isOverdue(todo);

  return (
    <div className="flex items-center px-4 py-2.5 border-b border-sp-border/20 hover:bg-sp-surface/30 transition-colors group cursor-pointer" onClick={() => onEdit(todo)}>
      {/* 체크박스 */}
      <div className="w-8" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={() => onToggle(todo.id)}
          className="w-4 h-4 rounded border-sp-border text-sp-accent focus:ring-sp-accent/30 bg-sp-surface cursor-pointer"
        />
      </div>

      {/* 할 일 텍스트 */}
      <div className="flex-[3] min-w-0">
        <span className={`text-sm truncate ${todo.completed ? 'line-through text-sp-muted' : 'text-sp-text'}`}>
          {todo.text}
        </span>
        {todo.subTasks && todo.subTasks.length > 0 && (
          <span className="text-xs text-sp-muted ml-2">
            ✓ {todo.subTasks.filter(s => s.completed).length}/{todo.subTasks.length}
          </span>
        )}
      </div>

      {/* 카테고리 */}
      <div className="flex-1 hidden sm:block">
        {category && (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-sp-surface text-sp-muted">
            {category.icon} {category.name}
          </span>
        )}
      </div>

      {/* 마감일 */}
      <div className="flex-1">
        {todo.dueDate && (
          <span className={`text-xs ${overdue ? 'text-red-400 font-medium' : 'text-sp-muted'}`}>
            {todo.dueDate.slice(5)}
          </span>
        )}
      </div>

      {/* 우선순위 */}
      <div className="flex-1 hidden sm:block">
        {priority && (
          <span className="text-xs">{priority.icon} {priority.label}</span>
        )}
      </div>

      {/* 상태 */}
      <div className="flex-1" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-1">
          {([
            { key: 'todo' as const, label: '할 일' },
            { key: 'inProgress' as const, label: '진행 중' },
            { key: 'done' as const, label: '완료' },
          ]).map(s => (
            <button
              key={s.key}
              type="button"
              onClick={() => onStatusChange(todo.id, s.key)}
              className={`text-[10px] px-1.5 py-0.5 rounded-full transition-colors ${
                status === s.key
                  ? 'bg-sp-accent/20 text-sp-accent font-medium'
                  : 'text-sp-muted hover:text-sp-text hover:bg-sp-surface'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
