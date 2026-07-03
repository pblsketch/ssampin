import { useState, useEffect, useCallback } from 'react';
import { useMobileTodoStore } from '@mobile/stores/useMobileTodoStore';
import { useMobileUiTriggerStore } from '@mobile/stores/useMobileUiTriggerStore';
import { AddTodoModal } from './todo/AddTodoModal';
import { TodoItem } from './todo/TodoItem';
import type { Todo } from '@domain/entities/Todo';

export function TodoPage() {
  const todos = useMobileTodoStore((s) => s.todos);
  const loaded = useMobileTodoStore((s) => s.loaded);
  const load = useMobileTodoStore((s) => s.load);
  const addTodo = useMobileTodoStore((s) => s.addTodo);
  const toggleTodo = useMobileTodoStore((s) => s.toggleTodo);
  const deleteTodo = useMobileTodoStore((s) => s.deleteTodo);
  const toggleSubTask = useMobileTodoStore((s) => s.toggleSubTask);

  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  // 전역 FAB → "할 일 추가" 트리거 소비
  const pendingUiAction = useMobileUiTriggerStore((s) => s.pendingAction);
  const consumeUiAction = useMobileUiTriggerStore((s) => s.consumeAction);
  useEffect(() => {
    if (pendingUiAction === 'add-todo') {
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
      {/* 헤더 (추가는 우하단 전역 [+] 버튼으로) */}
      <header className="glass-header flex items-center px-4 py-3 shrink-0">
        <h1 className="text-sp-text font-bold text-lg">할 일</h1>
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
                onToggleSubTask={toggleSubTask}
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
