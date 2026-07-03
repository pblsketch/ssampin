import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useMobileTodoStore } from '@mobile/stores/useMobileTodoStore';
import { useMobileUiTriggerStore } from '@mobile/stores/useMobileUiTriggerStore';
import { filterActive, filterArchived } from '@domain/rules/todoRules';
import { AddTodoModal } from './todo/AddTodoModal';
import { TodoItem } from './todo/TodoItem';
import type { Todo } from '@domain/entities/Todo';

type TodoView = 'active' | 'archive';

export function TodoPage() {
  const todos = useMobileTodoStore((s) => s.todos);
  const loaded = useMobileTodoStore((s) => s.loaded);
  const load = useMobileTodoStore((s) => s.load);
  const addTodo = useMobileTodoStore((s) => s.addTodo);
  const toggleTodo = useMobileTodoStore((s) => s.toggleTodo);
  const deleteTodo = useMobileTodoStore((s) => s.deleteTodo);
  const toggleSubTask = useMobileTodoStore((s) => s.toggleSubTask);
  const archiveCompleted = useMobileTodoStore((s) => s.archiveCompleted);
  const restoreFromArchive = useMobileTodoStore((s) => s.restoreFromArchive);

  const [showAddModal, setShowAddModal] = useState(false);
  const [view, setView] = useState<TodoView>('active');

  useEffect(() => {
    void load();
  }, [load]);

  // 전역 FAB → "할 일 추가" 트리거 소비 (추가는 항상 활성 뷰에서)
  const pendingUiAction = useMobileUiTriggerStore((s) => s.pendingAction);
  const consumeUiAction = useMobileUiTriggerStore((s) => s.consumeAction);
  useEffect(() => {
    if (pendingUiAction === 'add-todo') {
      setView('active');
      setShowAddModal(true);
      consumeUiAction('add-todo');
    }
  }, [pendingUiAction, consumeUiAction]);

  const handleAdd = useCallback(
    async (todo: Todo) => {
      await addTodo(todo);
      setShowAddModal(false);
    },
    [addTodo],
  );

  const handleToggle = useCallback((id: string) => void toggleTodo(id), [toggleTodo]);
  const handleDelete = useCallback((id: string) => void deleteTodo(id), [deleteTodo]);
  const handleRestore = useCallback(
    (id: string) => void restoreFromArchive(id),
    [restoreFromArchive],
  );

  // 활성/보관 분리 (아카이브된 항목은 활성 목록에서 제외)
  const active = filterActive(todos);
  const archived = filterArchived(todos);

  // 활성: 미완료 먼저, 완료 뒤
  const incomplete = active.filter((t) => !t.completed);
  const completed = active.filter((t) => t.completed);
  const sorted = [...incomplete, ...completed];

  // 보관: 보관 시각 최신순
  const archivedSorted = [...archived].sort((a, b) =>
    (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''),
  );

  const handleArchive = useCallback(() => {
    void archiveCompleted();
  }, [archiveCompleted]);

  const tabClass = (v: TodoView) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
      view === v ? 'bg-sp-accent text-sp-accent-fg' : 'text-sp-muted hover:text-sp-text'
    }`;

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 — 할 일 / 보관함 전환 + (활성 뷰) 완료 보관 버튼 */}
      <header className="glass-header flex items-center justify-between gap-2 px-3 py-2.5 shrink-0">
        <div className="flex items-center gap-1">
          <button onClick={() => setView('active')} className={tabClass('active')}>
            할 일
          </button>
          <button onClick={() => setView('archive')} className={tabClass('archive')}>
            보관함{archived.length > 0 ? ` ${archived.length}` : ''}
          </button>
        </div>
        {view === 'active' && completed.length > 0 && (
          <button
            onClick={handleArchive}
            className="shrink-0 flex items-center gap-1 px-3 h-9 rounded-lg bg-sp-subtle text-sp-text text-sm font-medium active:scale-[0.98] transition-transform"
          >
            <span className="material-symbols-outlined text-base">archive</span>
            완료 {completed.length}개 보관
          </button>
        )}
      </header>

      {/* 리스트 */}
      <div className="flex-1 overflow-y-auto">
        {!loaded ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sp-muted text-sm">불러오는 중...</p>
          </div>
        ) : view === 'active' ? (
          sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
              <p className="text-sp-muted text-sm">할 일이 없습니다.</p>
              <p className="text-sp-muted opacity-60 text-xs">[+] 버튼으로 추가하세요.</p>
            </div>
          ) : (
            <ul>
              {sorted.map((todo) => (
                <TodoItem
                  key={todo.id}
                  todo={todo}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onToggleSubTask={toggleSubTask}
                />
              ))}
            </ul>
          )
        ) : archivedSorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
            <span className="material-symbols-outlined text-sp-muted text-3xl">inventory_2</span>
            <p className="text-sp-muted text-sm">보관된 할 일이 없습니다.</p>
            <p className="text-sp-muted opacity-60 text-xs">
              완료한 할 일을 [완료 N개 보관]으로 정리하세요.
            </p>
          </div>
        ) : (
          <ul>
            {archivedSorted.map((todo) => (
              <li
                key={todo.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-black/5 dark:border-white/5"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug break-words line-through text-sp-muted">
                    {todo.text}
                  </p>
                  {todo.archivedAt && (
                    <p className="text-xs text-sp-muted opacity-70 mt-0.5">
                      {format(new Date(todo.archivedAt), 'M월 d일', { locale: ko })} 보관
                    </p>
                  )}
                </div>
                {/* 되돌리기 */}
                <button
                  onClick={() => handleRestore(todo.id)}
                  className="shrink-0 flex items-center justify-center text-sp-muted hover:text-sp-accent transition-colors"
                  style={{ minWidth: 44, minHeight: 44 }}
                  aria-label="할 일로 되돌리기"
                >
                  <span className="material-symbols-outlined text-xl">unarchive</span>
                </button>
                {/* 영구 삭제 */}
                <button
                  onClick={() => handleDelete(todo.id)}
                  className="shrink-0 flex items-center justify-center text-sp-muted hover:text-red-400 transition-colors"
                  style={{ minWidth: 44, minHeight: 44 }}
                  aria-label="영구 삭제"
                >
                  <span className="material-symbols-outlined text-xl">delete</span>
                </button>
              </li>
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
