import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { DEFAULT_OBSERVATION_TAGS } from '@domain/entities/Observation';

interface ObservationFormProps {
  classId: string;
  studentId: string;
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ObservationForm({ classId, studentId }: ObservationFormProps) {
  const [date, setDate] = useState(todayString);
  const [content, setContent] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const addRecord = useObservationStore((s) => s.addRecord);
  const customTags = useObservationStore((s) => s.customTags);
  const allTags = useMemo(() => [...DEFAULT_OBSERVATION_TAGS, ...customTags], [customTags]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [studentId]);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }, []);

  const handleSave = useCallback(async () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await addRecord({
        studentId,
        classId,
        date,
        content: trimmed.slice(0, 500),
        tags: selectedTags,
      });
      setContent('');
      setSelectedTags([]);
      setDate(todayString());
    } finally {
      setSaving(false);
    }
  }, [content, date, selectedTags, studentId, classId, addRecord]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void handleSave();
      }
    },
    [handleSave],
  );

  return (
    <div className="px-5 py-3 border-b border-sp-border space-y-2">
      {/* 날짜 + 태그 */}
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="bg-sp-bg border border-sp-border rounded-lg px-2 py-1 text-xs text-sp-text focus:outline-none focus:border-sp-accent"
        />
        <div className="flex-1" />
        <span className="text-[10px] text-sp-muted">
          {content.length}/500
        </span>
      </div>

      {/* 태그 선택 */}
      <div className="flex flex-wrap gap-1">
        {allTags.map((tag) => (
          <button
            key={tag}
            onClick={() => toggleTag(tag)}
            className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
              selectedTags.includes(tag)
                ? 'bg-sp-accent text-white'
                : 'bg-sp-surface text-sp-muted hover:text-sp-text'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* 내용 입력 */}
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="관찰 내용을 입력하세요..."
        maxLength={500}
        rows={3}
        className="w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted resize-none focus:outline-none focus:border-sp-accent"
      />

      {/* 저장 버튼 */}
      <button
        onClick={() => void handleSave()}
        disabled={!content.trim() || saving}
        className="w-full py-1.5 bg-sp-accent text-white text-xs font-medium rounded-lg hover:bg-sp-accent/80 transition-colors disabled:opacity-40"
      >
        {saving ? '저장 중...' : '기록 저장 (Ctrl+Enter)'}
      </button>
    </div>
  );
}
