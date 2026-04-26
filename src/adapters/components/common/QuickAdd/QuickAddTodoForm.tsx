import { useEffect, useRef, useState } from 'react';
import { useTodoStore } from '@adapters/stores/useTodoStore';
import { useToastStore } from '@adapters/components/common/Toast';
import type { TodoPriority } from '@domain/entities/Todo';

interface Props {
  onClose: () => void;
}

const PRIORITY_OPTIONS: readonly { value: TodoPriority; label: string }[] = [
  { value: 'none', label: '보통' },
  { value: 'low', label: '낮음' },
  { value: 'medium', label: '중간' },
  { value: 'high', label: '높음' },
];

export function QuickAddTodoForm({ onClose }: Props): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<TodoPriority>('none');
  const [saving, setSaving] = useState(false);
  const addTodo = useTodoStore((s) => s.addTodo);
  const categories = useTodoStore((s) => s.categories);
  const [category, setCategory] = useState<string>('');
  const showToast = useToastStore((s) => s.show);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }, []);

  const handleSubmit = async (): Promise<void> => {
    const trimmed = text.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await addTodo(
        trimmed,
        dueDate || undefined,
        priority,
        category || undefined,
      );
      showToast('할 일이 추가되었습니다.', 'success');
      onClose();
    } catch {
      showToast('할 일 추가에 실패했습니다.', 'error');
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <form
      onKeyDown={handleKeyDown}
      onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }}
      className="space-y-3"
    >
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="할 일을 입력하세요…"
        className="w-full bg-sp-bg/60 border border-sp-border rounded-lg px-3 py-2.5 text-[15px] font-sp-medium text-sp-text placeholder:text-sp-muted outline-none focus:ring-1 focus:ring-sp-accent focus:border-sp-accent transition-colors"
      />

      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          aria-label="마감일"
          className="bg-sp-bg/60 border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text outline-none focus:ring-1 focus:ring-sp-accent transition-colors"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TodoPriority)}
          aria-label="우선순위"
          className="bg-sp-bg/60 border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text outline-none focus:ring-1 focus:ring-sp-accent transition-colors"
        >
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      {categories.length > 0 && (
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="카테고리"
          className="w-full bg-sp-bg/60 border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text outline-none focus:ring-1 focus:ring-sp-accent transition-colors"
        >
          <option value="">카테고리 없음</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
          ))}
        </select>
      )}

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => { onClose(); requestAnimationFrame(() => { window.dispatchEvent(new CustomEvent<string>('ssampin:navigate', { detail: 'todo' })); }); }}
          className="text-xs text-sp-muted hover:text-sp-accent transition-colors"
        >
          → 상세 편집
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-sp-muted hover:text-sp-text transition-colors"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={!text.trim() || saving}
            className="px-4 py-1.5 bg-sp-accent text-white rounded-lg text-sm font-sp-semibold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </form>
  );
}
