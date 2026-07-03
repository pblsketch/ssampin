import { useState, useCallback } from 'react';
import { generateUUID } from '@infrastructure/utils/uuid';
import { useBottomSheet } from '@mobile/hooks/useBottomSheet';
import { PRIORITY_CONFIG } from './priorityConfig';
import type { Todo, TodoPriority } from '@domain/entities/Todo';

interface AddTodoModalProps {
  onAdd: (todo: Todo) => void;
  onCancel: () => void;
}

export function AddTodoModal({ onAdd, onCancel }: AddTodoModalProps) {
  const [text, setText] = useState('');
  const [priority, setPriority] = useState<TodoPriority>('none');
  const [dueDate, setDueDate] = useState('');

  useBottomSheet();

  const handleAdd = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const newTodo: Todo = {
      id: generateUUID(),
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
