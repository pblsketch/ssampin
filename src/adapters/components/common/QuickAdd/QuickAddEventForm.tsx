import { useEffect, useRef, useState } from 'react';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { toLocalDateString } from '@shared/utils/localDate';

interface Props {
  onClose: () => void;
}

export function QuickAddEventForm({ onClose }: Props): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(toLocalDateString());
  const [category, setCategory] = useState<string>('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const addEvent = useEventsStore((s) => s.addEvent);
  const categories = useEventsStore((s) => s.categories);
  const showToast = useToastStore((s) => s.show);

  useEffect(() => {
    if (categories.length > 0 && !category) {
      setCategory(categories[0]?.id ?? '');
    }
  }, [categories, category]);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }, []);

  const categoryError = touched && !category;

  const handleSubmit = async (): Promise<void> => {
    setTouched(true);
    const trimmed = title.trim();
    if (!trimmed || !date || !category || saving) return;
    setSaving(true);
    try {
      await addEvent({ title: trimmed, date, category });
      showToast('일정이 추가되었습니다.', 'success');
      onClose();
    } catch {
      showToast('일정 추가에 실패했습니다.', 'error');
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
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="일정 제목"
        className="w-full bg-sp-bg/60 border border-sp-border rounded-lg px-3 py-2.5 text-[15px] font-sp-medium text-sp-text placeholder:text-sp-muted outline-none focus:ring-1 focus:ring-sp-accent focus:border-sp-accent transition-colors"
      />

      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="날짜"
          className="bg-sp-bg/60 border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text outline-none focus:ring-1 focus:ring-sp-accent transition-colors"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="카테고리"
          className={`bg-sp-bg/60 border rounded-lg px-3 py-2 text-sm text-sp-text outline-none transition-colors ${
            categoryError ? 'border-red-400/60 ring-1 ring-red-400/60' : 'border-sp-border focus:ring-1 focus:ring-sp-accent'
          }`}
        >
          <option value="">카테고리 선택</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>
      {categoryError && (
        <p className="text-detail text-red-400 -mt-1">카테고리를 골라주세요.</p>
      )}

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={() => { onClose(); requestAnimationFrame(() => { window.dispatchEvent(new CustomEvent<string>('ssampin:navigate', { detail: 'schedule' })); }); }}
          className="text-[12px] text-sp-muted hover:text-sp-accent transition-colors"
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
            disabled={!title.trim() || saving}
            className="px-4 py-1.5 bg-sp-accent text-white rounded-lg text-sm font-sp-semibold hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </form>
  );
}
