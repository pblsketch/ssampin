import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import type { Todo as TodoType, TodoPriority } from '@domain/entities/Todo';
import {
  sortTodos,
  filterByDateRange,
  filterByCategory,
  filterActive,
  filterArchived,
  groupByDate,
  isOverdue,
} from '@domain/rules/todoRules';
import { PRIORITY_CONFIG } from '@domain/valueObjects/TodoPriority';
import { RECURRENCE_PRESETS, getRecurrenceLabel } from '@domain/valueObjects/TodoRecurrence';
import { TodoCategoryModal } from './TodoCategoryModal';

type DateFilter = 'all' | 'today' | 'week';
type ViewMode = 'active' | 'archive';

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

const PRIORITY_OPTIONS: TodoPriority[] = ['none', 'low', 'medium', 'high'];

const CATEGORY_COLORS: Record<string, string> = {
  blue: 'bg-blue-500/20 text-blue-400',
  green: 'bg-green-500/20 text-green-400',
  yellow: 'bg-yellow-500/20 text-yellow-400',
  purple: 'bg-purple-500/20 text-purple-400',
  red: 'bg-red-500/20 text-red-400',
  pink: 'bg-pink-500/20 text-pink-400',
  gray: 'bg-gray-500/20 text-gray-400',
};

export function Todo() {
  const {
    todos,
    categories,
    loaded,
    load,
    addTodo,
    toggleTodo,
    deleteTodo,
    archiveCompleted,
    restoreFromArchive,
    deleteArchived,
  } = useTodoStore();

  const [viewMode, setViewMode] = useState<ViewMode>('active');
  const [filter, setFilter] = useState<DateFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [newText, setNewText] = useState('');
  const [newDueDate, setNewDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newPriority, setNewPriority] = useState<TodoPriority>('none');
  const [newRecurrenceIdx, setNewRecurrenceIdx] = useState(0);
  const [newCategory, setNewCategory] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const now = useMemo(() => new Date(), []);

  // 활성/아카이브 분리
  const activeTodos = useMemo(() => filterActive(todos), [todos]);
  const archivedTodos = useMemo(() => filterArchived(todos), [todos]);

  // 필터 → 정렬 (활성 뷰)
  const filtered = useMemo(() => {
    let result = activeTodos;
    result = filterByDateRange(result, filter, now);
    result = filterByCategory(result, categoryFilter);
    return sortTodos(result);
  }, [activeTodos, filter, categoryFilter, now]);

  // 그룹핑
  const groups = useMemo(() => groupByDate(filtered, now), [filtered, now]);

  // 진행률 (활성 항목만)
  const completedCount = activeTodos.filter((t) => t.completed).length;
  const totalCount = activeTodos.length;
  const progressPercent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  const handleAdd = useCallback(() => {
    const text = newText.trim();
    if (!text) return;
    const recurrence = RECURRENCE_PRESETS[newRecurrenceIdx]?.value ?? undefined;
    void addTodo(
      text,
      newDueDate || undefined,
      newPriority,
      newCategory || undefined,
      recurrence ?? undefined,
    );
    setNewText('');
    setNewPriority('none');
    setNewRecurrenceIdx(0);
    setNewCategory('');
  }, [newText, newDueDate, newPriority, newRecurrenceIdx, newCategory, addTodo]);

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

  const handleArchiveCompleted = useCallback(() => {
    void archiveCompleted();
  }, [archiveCompleted]);

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

        <div className="flex items-center gap-4">
          {/* 아카이브 토글 */}
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'active' ? 'archive' : 'active')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'archive'
                ? 'bg-sp-accent text-white'
                : 'text-sp-muted hover:text-sp-text hover:bg-sp-surface'
            }`}
          >
            <span className="text-base">🗃️</span>
            아카이브
            {archivedTodos.length > 0 && (
              <span className="text-xs opacity-70">({archivedTodos.length})</span>
            )}
          </button>

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
        </div>
      </header>

      {/* 콘텐츠 */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-3xl mx-auto flex flex-col gap-6">
          {viewMode === 'active' ? (
            <>
              {/* 필터 탭 */}
              <div className="flex flex-col gap-3">
                {/* 날짜 필터 */}
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

                {/* 카테고리 필터 */}
                <div className="flex gap-2 items-center flex-wrap">
                  <button
                    type="button"
                    onClick={() => setCategoryFilter(null)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      categoryFilter === null
                        ? 'bg-sp-accent text-white'
                        : 'bg-sp-card text-sp-muted hover:text-sp-text ring-1 ring-sp-border/50'
                    }`}
                  >
                    전체
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoryFilter(cat.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        categoryFilter === cat.id
                          ? 'bg-sp-accent text-white'
                          : 'bg-sp-card text-sp-muted hover:text-sp-text ring-1 ring-sp-border/50'
                      }`}
                    >
                      {cat.icon} {cat.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowCategoryModal(true)}
                    className="p-1.5 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors"
                    title="카테고리 관리"
                  >
                    <span className="material-symbols-outlined text-[16px]">settings</span>
                  </button>
                </div>
              </div>

              {/* 추가 폼 */}
              <div className="flex flex-col gap-3 bg-sp-card rounded-xl p-4 ring-1 ring-sp-border">
                {/* 첫 번째 줄: 날짜 + 텍스트 + 추가 버튼 */}
                <div className="flex gap-3 items-center">
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

                {/* 두 번째 줄: 우선순위 + 반복 + 카테고리 */}
                <div className="flex gap-3 items-center flex-wrap">
                  {/* 우선순위 */}
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-sp-muted mr-1">우선순위</span>
                    {PRIORITY_OPTIONS.map((p) => {
                      const config = PRIORITY_CONFIG[p];
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setNewPriority(p)}
                          className={`flex flex-col items-center px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                            newPriority === p
                              ? `${config.bgColor || 'bg-sp-surface'} ${config.color} ring-1 ring-current`
                              : 'text-sp-muted hover:text-sp-text'
                          }`}
                        >
                          <span>{config.icon}</span>
                          <span className="text-[10px] leading-tight mt-0.5">{config.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <span className="text-sp-border">|</span>

                  {/* 반복 */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-sp-muted">🔄</span>
                    <select
                      value={newRecurrenceIdx}
                      onChange={(e) => setNewRecurrenceIdx(Number(e.target.value))}
                      className="bg-sp-surface text-sp-text text-xs px-2 py-1 rounded-lg border border-sp-border focus:border-sp-accent focus:outline-none transition-colors"
                    >
                      {RECURRENCE_PRESETS.map((preset, idx) => (
                        <option key={idx} value={idx}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <span className="text-sp-border">|</span>

                  {/* 카테고리 */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-sp-muted">📁</span>
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      className="bg-sp-surface text-sp-text text-xs px-2 py-1 rounded-lg border border-sp-border focus:border-sp-accent focus:outline-none transition-colors"
                    >
                      <option value="">없음</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.icon} {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
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
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-sp-muted">
                  <span className="material-symbols-outlined text-5xl mb-3 opacity-40">
                    filter_list
                  </span>
                  <p className="text-lg">필터에 해당하는 할 일이 없습니다</p>
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
                              categories={categories}
                              onToggle={toggleTodo}
                              onDelete={deleteTodo}
                            />
                          ))}
                      </TodoGroup>
                    );
                  })}
                </div>
              )}

              {/* 완료 항목 아카이브 버튼 */}
              {completedCount > 0 && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={handleArchiveCompleted}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-sp-muted hover:text-sp-text bg-sp-card hover:bg-sp-surface ring-1 ring-sp-border transition-colors"
                  >
                    <span className="text-base">📦</span>
                    완료 항목 모두 아카이브 ({completedCount}건)
                  </button>
                </div>
              )}
            </>
          ) : (
            /* 아카이브 뷰 */
            <ArchiveView
              todos={archivedTodos}
              categories={categories}
              onRestore={restoreFromArchive}
              onDelete={(id) => void deleteArchived([id])}
              onDeleteAll={() => void deleteArchived()}
              onBack={() => setViewMode('active')}
            />
          )}
        </div>
      </div>

      {/* 카테고리 관리 모달 */}
      {showCategoryModal && (
        <TodoCategoryModal onClose={() => setShowCategoryModal(false)} />
      )}
    </div>
  );
}

/* ─── 아카이브 뷰 ─── */

interface ArchiveViewProps {
  todos: readonly TodoType[];
  categories: readonly import('@domain/entities/Todo').TodoCategory[];
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onDeleteAll: () => void;
  onBack: () => void;
}

function ArchiveView({ todos, categories, onRestore, onDelete, onDeleteAll, onBack }: ArchiveViewProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="p-1.5 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-surface transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </button>
        <h3 className="text-sp-text text-lg font-bold flex items-center gap-2">
          <span>🗃️</span> 아카이브
        </h3>
        <span className="text-sm text-sp-muted">({todos.length}건)</span>
      </div>

      {todos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-sp-muted">
          <span className="material-symbols-outlined text-5xl mb-3 opacity-40">
            inventory_2
          </span>
          <p className="text-lg">아카이브가 비어있습니다</p>
        </div>
      ) : (
        <>
          <div className="bg-sp-card rounded-xl ring-1 ring-sp-border overflow-hidden">
            {todos.map((todo) => {
              const cat = categories.find((c) => c.id === todo.category);
              return (
                <div
                  key={todo.id}
                  className="flex items-center gap-3 px-4 py-2.5 border-t border-sp-border/50 first:border-t-0"
                >
                  <Checkbox checked={true} />
                  <span className="flex-1 text-sm text-sp-muted line-through opacity-50">
                    {todo.text}
                  </span>
                  {cat && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${CATEGORY_COLORS[cat.color] ?? 'bg-gray-500/20 text-gray-400'}`}>
                      {cat.icon}
                    </span>
                  )}
                  {todo.dueDate && (
                    <span className="text-xs text-sp-muted/50">{formatDueDate(todo.dueDate)}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => onRestore(todo.id)}
                    className="px-2 py-1 rounded-lg text-xs font-medium text-sp-accent hover:bg-sp-accent/10 transition-colors"
                  >
                    복원
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(todo.id)}
                    className="px-2 py-1 rounded-lg text-xs font-medium text-red-400 hover:bg-red-400/10 transition-colors"
                  >
                    삭제
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={onDeleteAll}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-red-400 hover:bg-red-400/10 ring-1 ring-red-400/30 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">delete_forever</span>
              전체 삭제
            </button>
          </div>
        </>
      )}
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
  categories: readonly import('@domain/entities/Todo').TodoCategory[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

function TodoItem({ todo, overdue, categories, onToggle, onDelete }: TodoItemProps) {
  const [hovered, setHovered] = useState(false);
  const priorityConfig = PRIORITY_CONFIG[todo.priority ?? 'none'];
  const cat = categories.find((c) => c.id === todo.category);

  return (
    <li
      className="flex items-center gap-3 px-4 py-2.5 border-t border-sp-border/50 transition-colors hover:bg-sp-surface/30 cursor-pointer"
      onClick={() => onToggle(todo.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* 체크박스 */}
      <Checkbox checked={todo.completed} />

      {/* 우선순위 dot */}
      {todo.priority && todo.priority !== 'none' && (
        <span className={`text-[10px] ${priorityConfig.color}`} title={priorityConfig.label}>
          {priorityConfig.icon}
        </span>
      )}

      {/* 반복 아이콘 */}
      {todo.recurrence && (
        <span className="text-[10px] text-sp-muted" title={getRecurrenceLabel(todo.recurrence)}>
          🔄
        </span>
      )}

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

      {/* 카테고리 태그 */}
      {cat && (
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            CATEGORY_COLORS[cat.color] ?? 'bg-gray-500/20 text-gray-400'
          }`}
        >
          {cat.icon} {cat.name}
        </span>
      )}

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
