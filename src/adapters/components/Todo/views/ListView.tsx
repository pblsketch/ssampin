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
  const { todos, categories, toggleTodo, toggleSubTask, updateTodo, archiveCompleted, addTodo } = useTodoStore();
  const [quickAddText, setQuickAddText] = useState('');

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
    <>
    <div className="flex items-center gap-2 mb-3">
      <input
        type="text"
        value={quickAddText}
        onChange={(e) => setQuickAddText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && quickAddText.trim()) { void addTodo(quickAddText.trim()); setQuickAddText(''); }}}
        placeholder="새 할 일 추가..."
        className="flex-1 bg-sp-surface text-sp-text text-sm px-3 py-2 rounded-lg border border-sp-border focus:border-sp-accent focus:outline-none placeholder:text-sp-muted"
      />
      <button
        type="button"
        onClick={() => { if (quickAddText.trim()) { void addTodo(quickAddText.trim()); setQuickAddText(''); }}}
        disabled={!quickAddText.trim()}
        className="flex items-center gap-1.5 bg-sp-accent hover:bg-blue-600 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
      >
        <span className="material-symbols-outlined text-icon">add</span>
        추가
      </button>
    </div>
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
                onToggleSubTask={toggleSubTask}
                onStatusChange={(id, status) => void updateTodo(id, { status })}
                onEdit={(t) => setEditingTodo(t)}
              />
            ))}
          </div>
        );
      })}

      {/* 완료 항목 아카이브 */}
      {activeTodos.filter(t => t.completed).length > 0 && (
        <div className="flex justify-center py-3 border-t border-sp-border/30">
          <button
            type="button"
            onClick={() => void archiveCompleted()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-sp-muted hover:text-sp-text bg-sp-card hover:bg-sp-surface ring-1 ring-sp-border transition-colors"
          >
            <span className="text-base">📦</span>
            완료 항목 모두 아카이브 ({activeTodos.filter(t => t.completed).length}건)
          </button>
        </div>
      )}

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
    </>
  );
}

/* ─── ListViewRow ─── */

interface ListViewRowProps {
  todo: Todo;
  categories: readonly TodoCategory[];
  onToggle: (id: string) => void;
  onToggleSubTask: (todoId: string, subTaskId: string) => Promise<void>;
  onStatusChange: (id: string, status: 'todo' | 'inProgress' | 'done') => void;
  onEdit: (todo: Todo) => void;
}

function ListViewRow({ todo, categories, onToggle, onToggleSubTask, onStatusChange, onEdit }: ListViewRowProps) {
  const category = categories.find(c => c.id === todo.category);
  const priority = todo.priority && todo.priority !== 'none' ? PRIORITY_CONFIG[todo.priority] : null;
  const status = inferStatus(todo);
  const overdue = isOverdue(todo);
  const [expanded, setExpanded] = useState(false);

  const hasSubTasks = todo.subTasks && todo.subTasks.length > 0;
  const completedCount = hasSubTasks ? todo.subTasks!.filter(s => s.completed).length : 0;
  const totalCount = hasSubTasks ? todo.subTasks!.length : 0;
  const progressRatio = totalCount > 0 ? completedCount / totalCount : 0;

  return (
    <div className="border-b border-sp-border/20">
      <div className="flex items-center px-4 py-2.5 hover:bg-sp-surface/30 transition-colors group cursor-pointer" onClick={() => onEdit(todo)}>
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
        <div className="flex-[3] min-w-0 flex items-center gap-1">
          <span className={`text-sm truncate ${todo.completed ? 'line-through text-sp-muted' : 'text-sp-text'}`}>
            {todo.text}
          </span>
          {hasSubTasks && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setExpanded(prev => !prev); }}
              className="flex items-center gap-0.5 text-xs text-sp-muted hover:text-sp-accent transition-colors shrink-0 ml-1"
            >
              <span className="material-symbols-outlined transition-transform duration-200" style={{ fontSize: '14px', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                expand_more
              </span>
              <span>✓ {completedCount}/{totalCount}</span>
            </button>
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

      {/* 서브태스크 확장 패널 */}
      {hasSubTasks && (
        <div
          className="overflow-hidden transition-all duration-200"
          style={{ maxHeight: expanded ? `${totalCount * 32 + 20}px` : '0px' }}
        >
          <div className="pl-12 pr-4 pb-2 bg-sp-surface/20 border-l-2 border-sp-accent/30">
            {/* 진행 바 */}
            <div className="h-1 rounded-full bg-sp-border mb-2 mt-1.5">
              <div
                className="h-1 rounded-full bg-sp-accent transition-all duration-300"
                style={{ width: `${progressRatio * 100}%` }}
              />
            </div>
            {/* 서브태스크 목록 */}
            {todo.subTasks!.map(st => (
              <div key={st.id} className="flex items-center gap-2 py-0.5">
                <input
                  type="checkbox"
                  checked={st.completed}
                  onChange={(e) => { e.stopPropagation(); void onToggleSubTask(todo.id, st.id); }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-3.5 h-3.5 rounded border-sp-border text-sp-accent focus:ring-sp-accent/30 bg-sp-surface cursor-pointer shrink-0"
                />
                <span className={`text-xs ${st.completed ? 'line-through text-sp-muted/50' : 'text-sp-muted'}`}>
                  {st.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
