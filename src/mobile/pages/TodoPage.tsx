import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useMobileTodoStore } from '@mobile/stores/useMobileTodoStore';
import { useMobileUiTriggerStore } from '@mobile/stores/useMobileUiTriggerStore';
import { filterActive, filterArchived, groupByDate } from '@domain/rules/todoRules';
import { AddTodoModal } from './todo/AddTodoModal';
import { TodoItem } from './todo/TodoItem';
import { EmptyState } from '@mobile/components/common/EmptyState';
import type { Todo } from '@domain/entities/Todo';

type TodoView = 'active' | 'archive';

/**
 * 마감 기준 그룹과 표시 순서 — 급한 것이 위로.
 * 키는 도메인 groupByDate 가 돌려주는 것과 같다.
 * '마감 없음'을 맨 아래에 두되 없애지는 않는다. 할 일은 마감이 없어도 되고
 * (dueDate 가 선택 항목), 그래서 이 목록을 달력에 통째로 녹일 수 없다.
 */
const DUE_GROUPS = [
  { key: 'overdue', label: '마감 지남' },
  { key: 'today', label: '오늘' },
  { key: 'tomorrow', label: '내일' },
  { key: 'thisWeek', label: '이번 주' },
  { key: 'later', label: '나중에' },
  { key: 'noDueDate', label: '마감 없음' },
] as const;

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

  // 미완료만 마감 기준으로 묶는다. 완료는 아래 별도 묶음으로 보여준다.
  const dueGroups = groupByDate(incomplete);

  // 보관: 보관 시각 최신순
  const archivedSorted = [...archived].sort((a, b) =>
    (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''),
  );

  const handleArchive = useCallback(() => {
    void archiveCompleted();
  }, [archiveCompleted]);

  return (
    <div className="flex flex-col h-full">
      {/* 보관함일 때만 헤더가 있다.
          예전에는 '할 일 / 보관함' 전환이 항상 한 줄을 차지했다. 그 위에 일정/할 일
          세그먼트가 또 있어서, 같은 모양의 전환이 두 줄 연속으로 쌓였다 — 어느 게
          무엇을 바꾸는지 헷갈린다. 보관함은 매번 오가는 곳이 아니라 가끔 들어가는
          곳이라, 목록 맨 아래 링크로 내리고 전환 줄을 없앴다.
          (보관함 기능 자체는 그대로다. 위치만 바뀌었다) */}
      {view === 'archive' && (
        <header className="glass-header flex items-center gap-2 px-3 py-2 shrink-0">
          <button
            onClick={() => setView('active')}
            aria-label="할 일 목록으로"
            className="grid place-items-center rounded-lg text-sp-text active:bg-black/5 dark:active:bg-white/10"
            style={{ minWidth: 44, minHeight: 44 }}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              arrow_back
            </span>
          </button>
          <h2 className="text-sp-text font-bold text-base">보관함</h2>
        </header>
      )}

      {/* 리스트 */}
      <div className="flex-1 overflow-y-auto">
        {!loaded ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sp-muted text-sm">불러오는 중...</p>
          </div>
        ) : view === 'active' ? (
          sorted.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <EmptyState
                mascot
                text="아직 할 일이 없어요"
                hint="오른쪽 아래 + 버튼으로 첫 할 일을 추가해 보세요."
              />
            </div>
          ) : (
            <>
              {/* 마감 기준으로 묶는다. 구간 나누기는 도메인(groupByDate)이 이미 하고
                  있어 새로 만들 것이 없다. 급한 것이 위로 온다. */}
              {DUE_GROUPS.map(({ key, label }) => {
                const items = dueGroups[key] ?? [];
                if (items.length === 0) return null;
                return (
                  <section key={key}>
                    <h3 className="px-4 pt-3 pb-1 text-xs font-semibold text-sp-muted">{label}</h3>
                    <ul>
                      {items.map((todo) => (
                        <TodoItem
                          key={todo.id}
                          todo={todo}
                          onToggle={handleToggle}
                          onDelete={handleDelete}
                          onToggleSubTask={toggleSubTask}
                        />
                      ))}
                    </ul>
                  </section>
                );
              })}

              {/* 완료 — 보관 버튼을 헤더가 아니라 이 묶음 옆에 둔다.
                  무엇을 보관하는지 바로 옆에 보이는 편이 이해하기 쉽다. */}
              {completed.length > 0 && (
                <section>
                  <div className="flex items-center justify-between px-4 pt-3 pb-1">
                    <h3 className="text-xs font-semibold text-sp-muted">완료 {completed.length}</h3>
                    <button
                      onClick={handleArchive}
                      className="grid place-items-center min-h-[44px] text-xs font-semibold text-sp-accent px-2 rounded-lg active:bg-black/5 dark:active:bg-white/10"
                    >
                      보관하기
                    </button>
                  </div>
                  <ul>
                    {completed.map((todo) => (
                      <TodoItem
                        key={todo.id}
                        todo={todo}
                        onToggle={handleToggle}
                        onDelete={handleDelete}
                        onToggleSubTask={toggleSubTask}
                      />
                    ))}
                  </ul>
                </section>
              )}

              {/* 보관함 입구 — 매번 오가는 자리가 아니라 가끔 들어가는 자리로 */}
              {archived.length > 0 && (
                <button
                  onClick={() => setView('archive')}
                  className="flex items-center gap-2 w-full mx-4 my-4 px-4 py-3 rounded-xl border border-dashed border-sp-border text-sp-muted text-sm"
                  style={{ width: 'calc(100% - 2rem)', minHeight: 48 }}
                >
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">
                    inventory_2
                  </span>
                  보관함 {archived.length}개
                  <span className="material-symbols-outlined text-lg ml-auto" aria-hidden="true">
                    chevron_right
                  </span>
                </button>
              )}
            </>
          )
        ) : archivedSorted.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon="inventory_2"
              text="보관된 할 일이 없어요"
              hint="완료한 할 일을 ‘완료 N개 보관’으로 정리하세요."
            />
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
                  <span className="material-symbols-outlined text-xl" aria-hidden="true">
                    unarchive
                  </span>
                </button>
                {/* 영구 삭제 */}
                <button
                  onClick={() => handleDelete(todo.id)}
                  className="shrink-0 flex items-center justify-center text-sp-muted hover:text-sp-error transition-colors"
                  style={{ minWidth: 44, minHeight: 44 }}
                  aria-label="영구 삭제"
                >
                  <span className="material-symbols-outlined text-xl" aria-hidden="true">
                    delete
                  </span>
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
