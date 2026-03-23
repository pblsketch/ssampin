import { useState, useEffect, useCallback } from 'react';
import { useMobileTodoStore } from '@mobile/stores/useMobileTodoStore';
import type { Todo, TodoPriority } from '@domain/entities/Todo';

const PRIORITY_CONFIG: Record<TodoPriority, { label: string; emoji: string; color: string }> = {
  high: { label: '긴급', emoji: '🔴', color: 'text-red-400' },
  medium: { label: '보통', emoji: '🟡', color: 'text-yellow-400' },
  low: { label: '낮음', emoji: '🟢', color: 'text-green-400' },
  none: { label: '없음', emoji: '', color: 'text-sp-muted' },
};

function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function calcDDay(dueDate: string): { label: string; colorClass: string } {
  const today = todayString();
  const todayMs = new Date(today).getTime();
  const dueMs = new Date(dueDate).getTime();
  const diffDays = Math.round((dueMs - todayMs) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { label: `D+${Math.abs(diffDays)}`, colorClass: 'text-red-400' };
  } else if (diffDays === 0) {
    return { label: 'D-Day', colorClass: 'text-sp-accent' };
  } else {
    return { label: `D-${diffDays}`, colorClass: 'text-sp-muted' };
  }
}

interface AddTodoModalProps {
  onAdd: (todo: Todo) => void;
  onCancel: () => void;
}

function AddTodoModal({ onAdd, onCancel }: AddTodoModalProps) {
  const [text, setText] = useState('');
  const [priority, setPriority] = useState<TodoPriority>('none');
  const [dueDate, setDueDate] = useState('');

  const handleAdd = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const newTodo: Todo = {
      id: crypto.randomUUID(),
      text: trimmed,
      completed: false,
      createdAt: new Date().toISOString(),
      priority,
      ...(dueDate ? { dueDate } : {}),
    };

    onAdd(newTodo);
  }, [text, priority, dueDate, onAdd]);

  const priorityOptions: { value: TodoPriority; label: string }[] = [
    { value: 'high', label: '높음' },
    { value: 'medium', label: '보통' },
    { value: 'low', label: '낮음' },
    { value: 'none', label: '없음' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg glass-card rounded-t-2xl p-5 pb-8">
        <h3 className="text-sp-text font-bold text-lg mb-4">할 일 추가</h3>

        {/* 제목 입력 */}
        <div className="mb-4">
          <label className="block text-sp-muted text-sm mb-1.5">제목 *</label>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
            }}
            placeholder="할 일을 입력하세요"
            autoFocus
            className="w-full glass-input text-sm"
          />
        </div>

        {/* 우선순위 선택 */}
        <div className="mb-4">
          <label className="block text-sp-muted text-sm mb-1.5">우선순위</label>
          <div className="flex gap-2">
            {priorityOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPriority(opt.value)}
                className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors ${
                  priority === opt.value
                    ? 'bg-sp-accent/20 border-sp-accent text-sp-accent'
                    : 'border-sp-border text-sp-muted hover:border-sp-text/30'
                }`}
              >
                {opt.value !== 'none' && (
                  <span className="mr-1">{PRIORITY_CONFIG[opt.value].emoji}</span>
                )}
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 마감일 입력 */}
        <div className="mb-6">
          <label className="block text-sp-muted text-sm mb-1.5">마감일 (선택)</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full glass-input text-sm"
          />
        </div>

        {/* 버튼 */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-sp-border text-sp-muted text-sm font-medium"
          >
            취소
          </button>
          <button
            onClick={handleAdd}
            disabled={!text.trim()}
            className="flex-1 py-3 rounded-xl bg-sp-accent text-sp-accent-fg text-sm font-bold disabled:opacity-40"
          >
            추가
          </button>
        </div>
      </div>
    </div>
  );
}

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

function TodoItem({ todo, onToggle, onDelete }: TodoItemProps) {
  const priority = todo.priority ?? 'none';
  const priorityCfg = PRIORITY_CONFIG[priority];
  const dday = todo.dueDate ? calcDDay(todo.dueDate) : null;

  return (
    <li
      className={`flex items-center gap-3 px-4 py-3 border-b border-black/5 dark:border-white/5 transition-opacity ${
        todo.completed ? 'opacity-40' : ''
      }`}
    >
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
            <span className={`text-xs ${priorityCfg.color}`}>
              {priorityCfg.emoji} {priorityCfg.label}
            </span>
          )}
          {/* D-Day 배지 */}
          {dday && (
            <span className={`text-xs font-medium ${dday.colorClass}`}>{dday.label}</span>
          )}
        </div>
      </div>

      {/* 삭제 버튼 */}
      <button
        onClick={() => onDelete(todo.id)}
        className="shrink-0 flex items-center justify-center text-sp-muted hover:text-red-400 transition-colors"
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
    </li>
  );
}

export function TodoPage() {
  const todos = useMobileTodoStore((s) => s.todos);
  const loaded = useMobileTodoStore((s) => s.loaded);
  const load = useMobileTodoStore((s) => s.load);
  const addTodo = useMobileTodoStore((s) => s.addTodo);
  const toggleTodo = useMobileTodoStore((s) => s.toggleTodo);
  const deleteTodo = useMobileTodoStore((s) => s.deleteTodo);

  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = useCallback(
    async (todo: Todo) => {
      await addTodo(todo);
      setShowAddModal(false);
    },
    [addTodo],
  );

  const handleToggle = useCallback(
    (id: string) => {
      void toggleTodo(id);
    },
    [toggleTodo],
  );

  const handleDelete = useCallback(
    (id: string) => {
      void deleteTodo(id);
    },
    [deleteTodo],
  );

  // 미완료 먼저, 완료 뒤
  const incomplete = todos.filter((t) => !t.completed);
  const completed = todos.filter((t) => t.completed);
  const sorted = [...incomplete, ...completed];

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <header className="glass-header flex items-center justify-between px-4 py-3 shrink-0">
        <h1 className="text-sp-text font-bold text-lg">할 일</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center justify-center w-9 h-9 rounded-full bg-sp-accent text-sp-accent-fg font-bold text-xl leading-none active:scale-95 transition-transform"
          aria-label="할 일 추가"
          style={{ minWidth: 44, minHeight: 44 }}
        >
          +
        </button>
      </header>

      {/* 리스트 */}
      <div className="flex-1 overflow-y-auto">
        {!loaded ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sp-muted text-sm">불러오는 중...</p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
            <p className="text-sp-muted text-sm">할 일이 없습니다.</p>
            <p className="text-sp-muted/60 text-xs">[+] 버튼으로 추가하세요.</p>
          </div>
        ) : (
          <ul>
            {sorted.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            ))}
          </ul>
        )}
      </div>

      {/* 추가 모달 */}
      {showAddModal && (
        <AddTodoModal
          onAdd={(todo) => void handleAdd(todo)}
          onCancel={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
