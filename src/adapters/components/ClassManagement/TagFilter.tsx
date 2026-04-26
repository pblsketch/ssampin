import { useState, useCallback } from 'react';
import { useObservationStore } from '@adapters/stores/useObservationStore';

interface TagFilterProps {
  tags: readonly string[];
  activeFilters: string[];
  onToggle: (tag: string) => void;
  onClear: () => void;
}

export function TagFilter({ tags, activeFilters, onToggle, onClear }: TagFilterProps) {
  const [showManager, setShowManager] = useState(false);
  const [newTag, setNewTag] = useState('');

  const addCustomTag = useObservationStore((s) => s.addCustomTag);
  const removeCustomTag = useObservationStore((s) => s.removeCustomTag);
  const customTags = useObservationStore((s) => s.customTags);

  const handleAddTag = useCallback(async () => {
    const trimmed = newTag.trim();
    if (!trimmed) return;
    await addCustomTag(trimmed);
    setNewTag('');
  }, [newTag, addCustomTag]);

  return (
    <div className="py-1.5">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-caption text-sp-muted font-medium">필터</span>
        {activeFilters.length > 0 && (
          <button
            onClick={onClear}
            className="text-caption text-sp-accent hover:underline"
          >
            초기화
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={() => setShowManager(!showManager)}
          className="p-0.5 text-sp-muted hover:text-sp-text transition-colors"
          title="태그 관리"
        >
          <span className="material-symbols-outlined text-sm">settings</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <button
            key={tag}
            onClick={() => onToggle(tag)}
            className={`px-2 py-0.5 rounded-full text-caption font-medium transition-colors ${
              activeFilters.includes(tag)
                ? 'bg-sp-accent text-white'
                : 'bg-sp-surface text-sp-muted hover:text-sp-text'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* 커스텀 태그 관리 */}
      {showManager && (
        <div className="mt-2 p-2 bg-sp-surface rounded-lg space-y-2">
          <div className="flex gap-1">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleAddTag();
              }}
              placeholder="새 태그 이름"
              className="flex-1 bg-sp-bg border border-sp-border rounded-lg px-2 py-1 text-caption text-sp-text placeholder:text-sp-muted focus:outline-none focus:border-sp-accent"
            />
            <button
              onClick={() => void handleAddTag()}
              disabled={!newTag.trim()}
              className="px-2 py-1 text-caption bg-sp-accent text-white rounded-lg disabled:opacity-40"
            >
              추가
            </button>
          </div>
          {customTags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {customTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption bg-sp-border text-sp-muted"
                >
                  {tag}
                  <button
                    onClick={() => void removeCustomTag(tag)}
                    className="hover:text-red-400"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
