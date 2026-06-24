/**
 * TodoEditor — 할 일 풀 편집기 본문.
 *
 * 기존 TodoPopup의 본문(입력 + 리스트 + 인라인 편집)을 모달 wrapper 없이 추출.
 * DashboardTodo가 isCompactMode=false 모드(WidgetModal 내부)에서 직접 마운트한다.
 *
 * 외부에서 모달 컨테이너(WidgetModal)가 제공되므로 본 컴포넌트는
 *  - overlay 없음
 *  - close 버튼 없음
 *  - 헤더(✕ 포함)는 WidgetModal이 그림 — 본 컴포넌트는 입력 + 목록만 그림
 *
 * widget-expanded-editors Plan v0.1 Phase 1A.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { useToastStore } from '@adapters/components/common/Toast';
import type { Todo, TodoPriority } from '@domain/entities/Todo';
import { filterActive, sortTodos } from '@domain/rules/todoRules';
import { PRIORITY_CONFIG } from '@domain/valueObjects/TodoPriority';
import { DatePopover } from './components/DatePopover';
import { toLocalDateString } from '@shared/utils/localDate';

const MAX_VISIBLE = 50;

export function TodoEditor() {
  const { todos, addTodo, toggleTodo, deleteTodo, updateTodo } = useTodoStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputText, setInputText] = useState('');
  const [inputDueDate, setInputDueDate] = useState(() => toLocalDateString());
  const [inputStartDate, setInputStartDate] = useState<string | undefined>(undefined);
  const [inputNoDueDate, setInputNoDueDate] = useState(false);

  const sorted = useMemo<readonly Todo[]>(() => {
    const active = filterActive(todos);
    return sortTodos(active);
  }, [todos]);

  const visible = sorted.slice(0, MAX_VISIBLE);
  const incomplete = visible.filter((t) => !t.completed);
  const completed = visible.filter((t) => t.completed);

  // 마운트 시 입력칸 자동 포커스 — WidgetModal의 focus trap 첫 노드와 일치
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleAdd = async () => {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
    await addTodo(
      text,
      inputNoDueDate ? undefined : inputDueDate || undefined,
      'none',
      undefined,
      undefined,
      undefined,
      inputNoDueDate ? undefined : inputStartDate,
    );
    setInputStartDate(undefined);
    if (!inputNoDueDate) {
      setInputDueDate(toLocalDateString());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      void handleAdd();
    }
  };

  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      {/* 입력 영역 */}
      <div className="flex gap-2 shrink-0">
        <DatePopover
          date={inputDueDate}
          endDate={inputStartDate ? inputDueDate : undefined}
          noDueDate={inputNoDueDate}
          onDateChange={(date) => {
            if (inputStartDate) {
              setInputStartDate(date);
            } else {
              setInputDueDate(date);
              setInputNoDueDate(false);
            }
          }}
          onEndDateChange={(endDate) => {
            if (endDate) {
              setInputStartDate(inputDueDate);
              setInputDueDate(endDate);
            } else {
              setInputStartDate(undefined);
            }
          }}
          onNoDueDateChange={(noDueDate) => {
            setInputNoDueDate(noDueDate);
            if (noDueDate) {
              setInputDueDate('');
              setInputStartDate(undefined);
            } else {
              setInputDueDate(toLocalDateString());
            }
          }}
        >
          <div
            className={`min-h-6 flex items-center gap-1.5 shrink-0 rounded-lg border border-sp-border px-3 py-2 text-xs transition-colors hover:border-sp-accent ${
              inputNoDueDate ? 'text-sp-muted opacity-60' : 'text-sp-text'
            } bg-sp-surface`}
            title="날짜 선택"
          >
            <span className="material-symbols-outlined text-sm">calendar_today</span>
            <span className="whitespace-nowrap">
              {inputNoDueDate
                ? '기한 없음'
                : inputStartDate
                  ? `${inputStartDate} → ${inputDueDate}`
                  : inputDueDate || '날짜 선택'}
            </span>
          </div>
        </DatePopover>
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="새로운 할 일 추가... (Enter)"
          className="flex-1 min-h-6 rounded-lg bg-sp-surface border border-sp-border px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent transition-colors"
        />
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={!inputText.trim()}
          className="min-w-6 min-h-6 rounded-lg bg-sp-accent px-3 py-2 text-sm font-medium text-white hover:bg-sp-accent/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          추가
        </button>
      </div>

      {/* 할 일 목록 */}
      <div className="flex-1 min-h-0 overflow-y-auto widget-scroll -mr-2 pr-2">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <span className="text-2xl">📝</span>
            <p className="text-sm text-sp-muted">바로 추가해보세요</p>
          </div>
        ) : (
          <>
            {/* 미완료 */}
            <ul className="space-y-1">
              {incomplete.map((todo) => (
                <EditorTodoItem
                  key={todo.id}
                  todo={todo}
                  onToggle={toggleTodo}
                  onDelete={deleteTodo}
                  onUpdate={updateTodo}
                />
              ))}
            </ul>

            {/* 구분선 + 완료 */}
            {completed.length > 0 && incomplete.length > 0 && (
              <div className="my-3 flex items-center gap-2">
                <div className="flex-1 border-t border-sp-border/30" />
                <span className="text-xs text-sp-muted">완료됨</span>
                <div className="flex-1 border-t border-sp-border/30" />
              </div>
            )}
            {completed.length > 0 && incomplete.length === 0 && (
              <div className="mb-2">
                <span className="text-xs text-sp-muted">완료됨</span>
              </div>
            )}
            {completed.length > 0 && (
              <ul className="space-y-1">
                {completed.map((todo) => (
                  <EditorTodoItem
                    key={todo.id}
                    todo={todo}
                    onToggle={toggleTodo}
                    onDelete={deleteTodo}
                    onUpdate={updateTodo}
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

/* ─── 개별 할 일 아이템 (인라인 편집) ─── */

interface EditorTodoItemProps {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (
    id: string,
    changes: Partial<Pick<Todo, 'text' | 'priority' | 'dueDate' | 'time'>>,
  ) => void;
}

function EditorTodoItem({ todo, onToggle, onDelete, onUpdate }: EditorTodoItemProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(todo.text);
  const [editPriority, setEditPriority] = useState<TodoPriority>(todo.priority ?? 'none');
  const [editDueDate, setEditDueDate] = useState(todo.dueDate ?? '');
  const [editTime, setEditTime] = useState(todo.time ?? '');

  const priorityConfig = PRIORITY_CONFIG[todo.priority ?? 'none'];
  const showPriority = todo.priority && todo.priority !== 'none';

  const handleSave = () => {
    const changes: Partial<Pick<Todo, 'text' | 'priority' | 'dueDate' | 'time'>> = {
      text: editText.trim() || todo.text,
      priority: editPriority,
      dueDate: editDueDate || undefined,
      time: editTime || undefined,
    };
    onUpdate(todo.id, changes);
    setEditing(false);
  };

  const handleEditToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (editing) {
      handleSave();
    } else {
      setEditText(todo.text);
      setEditPriority(todo.priority ?? 'none');
      setEditDueDate(todo.dueDate ?? '');
      setEditTime(todo.time ?? '');
      setEditing(true);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    // 5초 Undo 토스트 (Plan §P1-5)
    onDelete(todo.id);
    useToastStore.getState().show(
      '할 일 삭제됨',
      'success',
      {
        label: '되돌리기',
        onClick: () => {
          // 삭제 직후 add 폴백 — useTodoStore의 addTodo 사용 불가(id 자동 생성).
          // 안전한 폴백: 사용자가 삭제 직후 되돌리기 누르면 사용자 텍스트만 재추가.
          // (note: 마감일/우선순위 등 메타는 사용자에게 다시 입력 안내 — Phase 1 단순화)
          void useTodoStore.getState().addTodo(todo.text, todo.dueDate, todo.priority ?? 'none');
        },
      },
      5000,
    );
  };

  return (
    <li className="rounded-lg border border-transparent hover:border-sp-border/30 hover:bg-sp-surface/30 transition-colors">
      {/* 메인 행 */}
      <div className="flex items-center gap-2 px-2 py-1.5">
        {/* 체크박스 */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(todo.id);
          }}
          className="shrink-0 min-w-6 min-h-6 flex items-center justify-center"
          aria-label={todo.completed ? '완료 취소' : '완료'}
        >
          <div
            className={`flex h-4 w-4 items-center justify-center rounded transition-colors ${
              todo.completed
                ? 'border border-sp-accent bg-sp-accent'
                : 'border border-sp-border hover:border-sp-accent'
            }`}
          >
            {todo.completed && (
              <svg viewBox="0 0 10 8" fill="none" className="h-2.5 w-2.5 text-white">
                <path
                  d="M1 4L3.5 6.5L9 1"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
        </button>

        {/* 우선순위 dot */}
        {showPriority && (
          <span className={`text-xs ${priorityConfig.color} shrink-0`} title={priorityConfig.label}>
            {priorityConfig.icon}
          </span>
        )}

        {/* 시간 */}
        {todo.time && !todo.completed && (
          <span className="text-xs text-sp-accent font-mono shrink-0">{todo.time}</span>
        )}

        {/* 텍스트 */}
        <span
          className={`flex-1 text-sm leading-tight truncate ${
            todo.completed ? 'text-sp-muted line-through opacity-50' : 'text-sp-text'
          }`}
        >
          {todo.text}
        </span>

        {/* 마감일 */}
        {todo.dueDate && !todo.completed && <DueDateBadge dueDate={todo.dueDate} />}

        {/* 편집 버튼 */}
        <button
          type="button"
          onClick={handleEditToggle}
          className={`shrink-0 min-w-6 min-h-6 rounded px-1.5 py-0.5 text-xs transition-colors ${
            editing
              ? 'bg-sp-accent text-white'
              : 'text-sp-muted hover:text-sp-text hover:bg-sp-surface'
          }`}
          aria-label={editing ? '저장' : '편집'}
        >
          {editing ? '저장' : '···'}
        </button>

        {/* 삭제 버튼 */}
        <button
          type="button"
          onClick={handleDelete}
          className="shrink-0 min-w-6 min-h-6 rounded p-1 text-sp-muted hover:text-sp-error hover:bg-sp-error/10 transition-colors"
          aria-label="삭제"
        >
          <svg viewBox="0 0 14 16" fill="none" className="h-3.5 w-3.5">
            <path
              d="M1 4h12M5 4V2h4v2M2 4l1 10h8l1-10"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* 인라인 편집 패널 */}
      {editing && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-sp-border/20">
          {/* 텍스트 */}
          <input
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setEditing(false);
            }}
            className="w-full min-h-6 rounded-lg bg-sp-bg border border-sp-border px-3 py-1.5 text-sm text-sp-text focus:outline-none focus:border-sp-accent transition-colors"
            placeholder="할 일 내용"
            autoFocus
          />

          <div className="flex gap-2 flex-wrap">
            {/* 우선순위 */}
            <select
              value={editPriority}
              onChange={(e) => setEditPriority(e.target.value as TodoPriority)}
              className="min-h-6 rounded-lg bg-sp-bg border border-sp-border px-2 py-1.5 text-xs text-sp-text focus:outline-none focus:border-sp-accent transition-colors"
            >
              <option value="none">우선순위 없음</option>
              <option value="high">🔴 높음</option>
              <option value="medium">🟡 보통</option>
              <option value="low">🔵 낮음</option>
            </select>

            {/* 마감일 */}
            <input
              type="date"
              value={editDueDate}
              onChange={(e) => setEditDueDate(e.target.value)}
              className="min-h-6 rounded-lg bg-sp-bg border border-sp-border px-2 py-1.5 text-xs text-sp-text focus:outline-none focus:border-sp-accent transition-colors [color-scheme:dark]"
              placeholder="마감일"
            />

            {/* 시간 */}
            <input
              type="time"
              value={editTime}
              onChange={(e) => setEditTime(e.target.value)}
              className="min-h-6 rounded-lg bg-sp-bg border border-sp-border px-2 py-1.5 text-xs text-sp-text focus:outline-none focus:border-sp-accent transition-colors [color-scheme:dark]"
              placeholder="시간"
            />
          </div>
        </div>
      )}
    </li>
  );
}

/* ─── 마감일 배지 ─── */

function DueDateBadge({ dueDate }: { dueDate: string }) {
  const today = new Date();
  const todayStr = formatLocalDate(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatLocalDate(tomorrow);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekEndStr = formatLocalDate(weekEnd);

  let text: string;
  let className: string;

  if (dueDate < todayStr) {
    text = '지남';
    className = 'text-sp-error font-bold';
  } else if (dueDate === todayStr) {
    text = '오늘';
    className = 'text-sp-error';
  } else if (dueDate === tomorrowStr) {
    text = '내일';
    className = 'text-orange-400';
  } else if (dueDate <= weekEndStr) {
    const day = new Date(dueDate + 'T00:00:00');
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    text = dayNames[day.getDay()] ?? '';
    className = 'text-sp-muted';
  } else {
    const parts = dueDate.split('-');
    const m = parts[1] ?? '1';
    const d = parts[2] ?? '1';
    text = `${parseInt(m)}/${parseInt(d)}`;
    className = 'text-sp-muted';
  }

  return <span className={`shrink-0 text-xs ${className}`}>{text}</span>;
}

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
